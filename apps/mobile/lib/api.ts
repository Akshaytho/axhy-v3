/**
 * Authenticated fetch wrapper for the Axhy backend.
 *
 * Reads access token from secure-store, injects Bearer header.
 * On 401 from non-/auth/* paths: tries POST /auth/refresh once, on success
 * persists rotated tokens via replaceTokens and retries the original request
 * once. On refresh failure or AUTH_LEGACY_REFRESH: clears tokens and
 * redirects to phone screen.
 *
 * Concurrent 401s share a single in-flight refresh via an in-memory mutex
 * promise so 50 parallel app calls don't fire 50 refresh attempts.
 *
 * @derives(ADR-0007)
 * @derives(ADR-0011)
 * @derives(F1-b trust model 2026-05-28)
 */

import { router } from 'expo-router';

import { clearTokens, getTokens, replaceTokens } from './auth-store';

const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:4000').replace(
  /\/$/,
  '',
);

/** @derives(ADR-0007) */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Per-tenant daily AI usage cap reached. Backend returns HTTP 429 with
 * body `{ error: 'AI_BUDGET_EXCEEDED' }`. Distinct from 503 retry — the
 * cap clears at next UTC midnight, NOT after a brief retry window.
 *
 * @derives(spec-2 §9.4)
 */
export class AIBudgetExceededError extends ApiError {
  constructor(message: string) {
    super(429, 'AI_BUDGET_EXCEEDED', message);
    this.name = 'AIBudgetExceededError';
  }
}

/** @derives(spec-2 §9.4) */
export function isAIBudgetExceededError(err: unknown): err is AIBudgetExceededError {
  return err instanceof ApiError && err.code === 'AI_BUDGET_EXCEEDED';
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  /** Extra headers to merge with defaults (Authorization + Content-Type). */
  headers?: Record<string, string>;
};

// Module-level mutex so 50 concurrent 401s share ONE in-flight refresh.
// Mirrors the 10s rotation grace window on the backend
// (apps/backend/src/lib/services/refresh-token-store.ts ROTATION_GRACE_MS)
// — the client-side mutex is the first line of defence; the grace window
// catches the residual race that survives module-level dedup.
let inFlightRefresh: Promise<{ accessToken: string; refreshToken: string } | null> | null = null;

async function attemptRefresh(): Promise<{ accessToken: string; refreshToken: string } | null> {
  const tokens = await getTokens();
  if (!tokens) return null;

  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: tokens.refreshToken }),
  });

  if (!res.ok) {
    // Parse error code so the caller can distinguish AUTH_LEGACY_REFRESH
    // (force-logout per founder decision 2026-05-28) from network/server
    // failures (don't wipe; caller decides).
    let code = 'INVALID_REFRESH';
    try {
      const errBody = (await res.json()) as { error?: string };
      if (errBody.error) code = errBody.error;
    } catch {
      // body not JSON — keep default
    }
    throw new ApiError(res.status, code, 'Refresh failed');
  }

  const data = (await res.json()) as { accessToken: string; refreshToken: string };
  await replaceTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
  return { accessToken: data.accessToken, refreshToken: data.refreshToken };
}

async function refreshOnce(): Promise<{ accessToken: string; refreshToken: string } | null> {
  if (inFlightRefresh) return inFlightRefresh;
  inFlightRefresh = (async () => {
    try {
      return await attemptRefresh();
    } finally {
      // Always clear so subsequent 401s start a fresh attempt rather than
      // hanging on a settled promise.
      inFlightRefresh = null;
    }
  })();
  return inFlightRefresh;
}

async function handleUnauthorized(): Promise<never> {
  await clearTokens();
  router.replace('/(auth)/phone');
  throw new ApiError(401, 'UNAUTHORIZED', 'Session expired. Please sign in again.');
}

/** @derives(ADR-0007) @derives(ADR-0011) */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options;

  // Set Content-Type only when there's an actual body. Fastify rejects
  // POSTs with Content-Type: application/json but no body
  // ("Body cannot be empty when content-type is set to 'application/json'"),
  // which broke the Wave A POST /chat/reload-context that intentionally has
  // no payload.
  const buildHeaders = async (): Promise<Record<string, string>> => {
    const h: Record<string, string> = {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    };
    if (auth) {
      const tokens = await getTokens();
      if (tokens) h['Authorization'] = `Bearer ${tokens.accessToken}`;
    }
    return h;
  };

  const doFetch = async (): Promise<Response> =>
    fetch(`${API_BASE}${path}`, {
      method,
      headers: await buildHeaders(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let res = await doFetch();

  // Refresh-on-401 only for authenticated, non-/auth/* paths. /auth/* paths
  // (login, refresh itself) MUST NOT recurse into the interceptor.
  if (res.status === 401 && auth && !path.startsWith('/auth/')) {
    try {
      const rotated = await refreshOnce();
      if (rotated) {
        res = await doFetch();
      } else {
        await handleUnauthorized();
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'AUTH_LEGACY_REFRESH') {
        await handleUnauthorized();
      }
      if (err instanceof ApiError && err.status === 401) {
        await handleUnauthorized();
      }
      // Network / server error on refresh — surface the original 401 to the
      // caller without wiping. Next attempt will try refresh again.
      await handleUnauthorized();
    }
  }

  if (res.status === 401) {
    await handleUnauthorized();
  }

  if (!res.ok) {
    let code = 'API_ERROR';
    let message = `Request failed with status ${res.status}`;
    try {
      const errBody = (await res.json()) as { error?: string; message?: string };
      if (errBody.error) code = errBody.error;
      if (errBody.message) message = errBody.message;
    } catch {
      // response body wasn't JSON — keep defaults
    }
    // Spec 2 §9.4 — daily AI budget exceeded gets a typed error so the
    // chat screen can render the goldenrod "try tomorrow" banner without
    // string-matching the message field.
    if (res.status === 429 && code === 'AI_BUDGET_EXCEEDED') {
      throw new AIBudgetExceededError(message);
    }
    throw new ApiError(res.status, code, message);
  }

  return res.json() as Promise<T>;
}

/** @internal — test-only: reset the in-flight refresh mutex between cases. */
export function _resetRefreshMutexForTests(): void {
  inFlightRefresh = null;
}
