/**
 * F1-b refresh interceptor — unit tests.
 *
 * Covers the five scenarios from plan Task 8 Step 3:
 *   1. 401 + valid refresh → /auth/refresh called → original retried → 200
 *   2. 401 + AUTH_LEGACY_REFRESH → wipe + redirect + 401 surfaced
 *   3. 401 + INVALID_REFRESH → wipe + redirect
 *   4. Two parallel 401s → only ONE /auth/refresh call (mutex)
 *   5. /auth/refresh itself returning 401 does NOT recurse
 *
 * @derives(F1-b trust model 2026-05-28)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('expo-router', () => ({
  router: {
    replace: vi.fn(),
  },
}));

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
  deleteItemAsync: vi.fn(),
}));

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

vi.mock('./auth-store', () => ({
  getTokens: vi.fn(),
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
  replaceTokens: vi.fn(),
}));

import { router } from 'expo-router';

import { apiFetch, ApiError, _resetRefreshMutexForTests } from './api';
import { getTokens, clearTokens, replaceTokens } from './auth-store';

const mockedFetch = vi.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).fetch = mockedFetch;

const mockedGetTokens = getTokens as unknown as ReturnType<typeof vi.fn>;
const mockedClearTokens = clearTokens as unknown as ReturnType<typeof vi.fn>;
const mockedReplaceTokens = replaceTokens as unknown as ReturnType<typeof vi.fn>;
const mockedRouterReplace = router.replace as unknown as ReturnType<typeof vi.fn>;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  mockedFetch.mockReset();
  mockedGetTokens.mockReset();
  mockedClearTokens.mockReset();
  mockedReplaceTokens.mockReset();
  mockedRouterReplace.mockReset();
  _resetRefreshMutexForTests();
});

describe('apiFetch refresh interceptor', () => {
  it('401 + successful refresh → original request retried → 200 returned', async () => {
    mockedGetTokens
      .mockResolvedValueOnce({
        accessToken: 'old-access',
        refreshToken: 'axrt_old',
        activeRole: 'WORKER',
      })
      .mockResolvedValueOnce({
        accessToken: 'old-access',
        refreshToken: 'axrt_old',
        activeRole: 'WORKER',
      })
      .mockResolvedValueOnce({
        accessToken: 'new-access',
        refreshToken: 'axrt_new',
        activeRole: 'WORKER',
      });

    mockedFetch
      .mockResolvedValueOnce(jsonResponse(401, { error: 'TOKEN_EXPIRED' }))
      .mockResolvedValueOnce(
        jsonResponse(200, { accessToken: 'new-access', refreshToken: 'axrt_new' }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { visits: [] }));

    const result = await apiFetch<{ visits: unknown[] }>('/worker/today');

    expect(result).toEqual({ visits: [] });
    expect(mockedReplaceTokens).toHaveBeenCalledWith({
      accessToken: 'new-access',
      refreshToken: 'axrt_new',
    });
    expect(mockedFetch).toHaveBeenCalledTimes(3);
    expect(mockedClearTokens).not.toHaveBeenCalled();
    expect(mockedRouterReplace).not.toHaveBeenCalled();

    const retryHeaders = (mockedFetch.mock.calls[2]?.[1] as RequestInit | undefined)?.headers as
      | Record<string, string>
      | undefined;
    expect(retryHeaders?.Authorization).toBe('Bearer new-access');
  });

  it('401 + AUTH_LEGACY_REFRESH → wipe + redirect + 401 thrown', async () => {
    mockedGetTokens.mockResolvedValue({
      accessToken: 'old-access',
      refreshToken: 'eyJlegacy',
      activeRole: 'WORKER',
    });

    mockedFetch
      .mockResolvedValueOnce(jsonResponse(401, { error: 'TOKEN_EXPIRED' }))
      .mockResolvedValueOnce(jsonResponse(401, { error: 'AUTH_LEGACY_REFRESH' }));

    await expect(apiFetch('/worker/today')).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    });

    expect(mockedClearTokens).toHaveBeenCalledTimes(1);
    expect(mockedRouterReplace).toHaveBeenCalledWith('/(auth)/phone');
    expect(mockedReplaceTokens).not.toHaveBeenCalled();
  });

  it('401 + INVALID_REFRESH → wipe + redirect', async () => {
    mockedGetTokens.mockResolvedValue({
      accessToken: 'old-access',
      refreshToken: 'axrt_old',
      activeRole: 'WORKER',
    });

    mockedFetch
      .mockResolvedValueOnce(jsonResponse(401, { error: 'TOKEN_EXPIRED' }))
      .mockResolvedValueOnce(jsonResponse(401, { error: 'INVALID_REFRESH' }));

    await expect(apiFetch('/worker/today')).rejects.toBeInstanceOf(ApiError);

    expect(mockedClearTokens).toHaveBeenCalledTimes(1);
    expect(mockedRouterReplace).toHaveBeenCalledWith('/(auth)/phone');
  });

  it('two parallel 401s share ONE in-flight refresh (mutex)', async () => {
    mockedGetTokens.mockResolvedValue({
      accessToken: 'old-access',
      refreshToken: 'axrt_old',
      activeRole: 'WORKER',
    });

    // First call per URL returns 401; subsequent calls return 200. Refresh
    // fires once and returns new tokens.
    let refreshCalls = 0;
    const urlHits = new Map<string, number>();
    mockedFetch.mockImplementation((url: string) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCalls += 1;
        return Promise.resolve(
          jsonResponse(200, { accessToken: 'new-access', refreshToken: 'axrt_new' }),
        );
      }
      const hits = (urlHits.get(url) ?? 0) + 1;
      urlHits.set(url, hits);
      if (hits === 1) {
        return Promise.resolve(jsonResponse(401, { error: 'TOKEN_EXPIRED' }));
      }
      if (url.includes('/worker/today')) {
        return Promise.resolve(jsonResponse(200, { visits: [] }));
      }
      if (url.includes('/worker/visits/123')) {
        return Promise.resolve(jsonResponse(200, { visit: { id: '123' } }));
      }
      return Promise.resolve(jsonResponse(500, { error: 'UNEXPECTED' }));
    });

    const [a, b] = await Promise.all([
      apiFetch<{ visits: unknown[] }>('/worker/today'),
      apiFetch<{ visit: { id: string } }>('/worker/visits/123'),
    ]);

    expect(a).toEqual({ visits: [] });
    expect(b).toEqual({ visit: { id: '123' } });
    expect(refreshCalls).toBe(1);
    expect(mockedReplaceTokens).toHaveBeenCalledTimes(1);
  });

  it('/auth/refresh self-401 does NOT recurse into the interceptor', async () => {
    mockedGetTokens.mockResolvedValue({
      accessToken: 'old-access',
      refreshToken: 'axrt_old',
      activeRole: 'WORKER',
    });

    // Direct apiFetch to /auth/refresh returning 401 must throw 401 without
    // calling itself again or calling refresh (which would loop).
    mockedFetch.mockResolvedValueOnce(jsonResponse(401, { error: 'INVALID_REFRESH' }));

    await expect(apiFetch('/auth/refresh', { method: 'POST', auth: false })).rejects.toMatchObject({
      status: 401,
    });

    // Only the original /auth/refresh call — no internal refresh attempt.
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(mockedReplaceTokens).not.toHaveBeenCalled();
    // clearTokens IS called by handleUnauthorized on the 401 itself — but no
    // recursive refresh attempt was made (the key invariant). Allow either
    // behavior; assert only no-loop.
  });

  // RCA-G (2026-06-04): bounded refresh resilience — transient blips are
  // retried, never log the worker out; definitive 401s are NOT retried.
  it('transient refresh failure is retried, then succeeds, without logging out', async () => {
    mockedGetTokens.mockResolvedValue({
      accessToken: 'old-access',
      refreshToken: 'axrt_old',
      activeRole: 'WORKER',
    });

    let refreshAttempts = 0;
    const hits = new Map<string, number>();
    mockedFetch.mockImplementation((url: string) => {
      if (url.endsWith('/auth/refresh')) {
        refreshAttempts += 1;
        // First attempt: transient network reject. Second: success.
        if (refreshAttempts === 1) return Promise.reject(new TypeError('Network request failed'));
        return Promise.resolve(
          jsonResponse(200, { accessToken: 'new-access', refreshToken: 'axrt_new' }),
        );
      }
      const n = (hits.get(url) ?? 0) + 1;
      hits.set(url, n);
      // Original request: 401 first, 200 after refresh recovers.
      if (n === 1) return Promise.resolve(jsonResponse(401, { error: 'TOKEN_EXPIRED' }));
      return Promise.resolve(jsonResponse(200, { visits: [] }));
    });

    const result = await apiFetch<{ visits: unknown[] }>('/worker/today');

    expect(result).toEqual({ visits: [] });
    expect(refreshAttempts).toBe(2); // rejected once, retried, then succeeded
    expect(mockedReplaceTokens).toHaveBeenCalledTimes(1);
    expect(mockedClearTokens).not.toHaveBeenCalled();
    expect(mockedRouterReplace).not.toHaveBeenCalled();
  });

  it('refresh failing on every attempt surfaces the error WITHOUT logging out', async () => {
    mockedGetTokens.mockResolvedValue({
      accessToken: 'old-access',
      refreshToken: 'axrt_old',
      activeRole: 'WORKER',
    });

    let refreshAttempts = 0;
    mockedFetch.mockImplementation((url: string) => {
      if (url.endsWith('/auth/refresh')) {
        refreshAttempts += 1;
        return Promise.reject(new TypeError('Network request failed')); // persistent blip
      }
      return Promise.resolve(jsonResponse(401, { error: 'TOKEN_EXPIRED' })); // original always 401
    });

    await expect(apiFetch('/worker/today')).rejects.toThrow();

    // 1 initial + 2 bounded retries, then give up — but NEVER wipe the session
    // (a momentary outage must not log a worker out mid-shift).
    expect(refreshAttempts).toBe(3);
    expect(mockedClearTokens).not.toHaveBeenCalled();
    expect(mockedRouterReplace).not.toHaveBeenCalled();
    expect(mockedReplaceTokens).not.toHaveBeenCalled();
  });
});
