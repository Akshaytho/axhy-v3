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

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
};

/** @derives(ADR-0007) @derives(ADR-0011) */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
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
    throw new ApiError(res.status, code, message);
  }

  return res.json() as Promise<T>;
}
