/**
 * Authenticated fetch wrapper for the Axhy backend.
 *
 * Reads access token from secure-store, injects Bearer header.
 * On 401: clears tokens and redirects to phone screen.
 *
 * @derives(ADR-0007)
 * @derives(ADR-0011)
 */

import { router } from 'expo-router';

import { clearTokens, getTokens } from './auth-store';

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

/** @derives(ADR-0007) @derives(ADR-0011) */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options;

  // Set Content-Type only when there's an actual body. Fastify rejects
  // POSTs with Content-Type: application/json but no body
  // ("Body cannot be empty when content-type is set to 'application/json'"),
  // which broke the Wave A POST /chat/reload-context that intentionally has
  // no payload.
  const headers: Record<string, string> = {
    ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers ?? {}),
  };

  if (auth) {
    const tokens = await getTokens();
    if (tokens) {
      headers['Authorization'] = `Bearer ${tokens.accessToken}`;
    }
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    await clearTokens();
    router.replace('/(auth)/phone');
    throw new ApiError(401, 'UNAUTHORIZED', 'Session expired. Please sign in again.');
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
