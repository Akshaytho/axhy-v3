/**
 * Slim server-side fetch helper for admin-web → backend calls.
 *
 * [ORCHESTRATOR_EXCEPTION] sub-agent dispatched for HR A1 tasks 9/10/11
 *
 * Used by every HR-portal server component and server action. Reads the
 * httpOnly `axhy_at` cookie set by /api/auth/session and attaches it as a
 * Bearer token. Throws a classified ApiError on any non-2xx response so
 * pages can surface friendly messages per docs/personas/hr error patterns.
 *
 * Always uses cache: 'no-store' — auth-scoped responses must never be
 * statically cached by Next.js.
 *
 * @derives(master-plan §G)
 */

import { cookies } from 'next/headers';

import { env } from './env';

// ADR-0028: env.ts pins '/v1' onto the validated base URL — every HR-portal
// server call rides the versioned contract. The previous raw process.env
// read with a localhost fallback contradicted env.ts's own fail-loud rule.
const BASE = env.NEXT_PUBLIC_AXHY_API_URL;

/**
 * Classified HTTP error from a backend call. `code` is the backend's
 * machine-readable error tag (e.g. `FORBIDDEN`, `BODY_INVALID`); `message`
 * is the human-readable description from the backend response when present.
 *
 * @derives(master-plan §G)
 */
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

type FetchInit = Omit<RequestInit, 'headers'> & { headers?: Record<string, string> };

/**
 * Fetch JSON from the backend with cookie-derived Bearer auth.
 *
 * - Adds `accept: application/json` always.
 * - Adds `content-type: application/json` when a non-FormData body is present.
 * - Adds `authorization: Bearer <axhy_at>` when the cookie is set.
 * - cache: 'no-store' on every request.
 * - On non-2xx, throws ApiError(status, code, message) — code/message extracted
 *   from a JSON body when possible, otherwise falls back to statusText.
 * - On 204 No Content, returns undefined typed as T.
 *
 * Server-only — relies on next/headers cookies().
 *
 * @derives(master-plan §G)
 */
export async function fetchJson<T>(path: string, init: FetchInit = {}): Promise<T> {
  const store = await cookies();
  const at = store.get('axhy_at')?.value;
  const headers: Record<string, string> = {
    accept: 'application/json',
    ...(init.body && !(init.body instanceof FormData)
      ? { 'content-type': 'application/json' }
      : {}),
    ...init.headers,
  };
  if (at) headers.authorization = `Bearer ${at}`;
  const res = await fetch(BASE + path, { ...init, headers, cache: 'no-store' });
  if (!res.ok) {
    let code = 'UNKNOWN';
    let message = res.statusText;
    try {
      const body = await res.json();
      code = typeof body?.error === 'string' ? body.error : code;
      message = typeof body?.message === 'string' ? body.message : message;
    } catch {
      // body not JSON — keep statusText
    }
    throw new ApiError(res.status, code, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
