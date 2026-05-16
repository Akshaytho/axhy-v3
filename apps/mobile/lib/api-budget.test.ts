/**
 * Unit test for apiFetch's 429 → AIBudgetExceededError mapping.
 *
 * Spec 2 §9.4. Mobile chat screen relies on a typed error class so it
 * can branch the UX without string-matching the message field. This
 * test mocks `global.fetch` (not the `./api` module) so the real
 * apiFetch implementation is exercised end-to-end on the response
 * → error path.
 *
 * @derives(spec-2 §9.4)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// expo-router navigation is fired on 401 — stub it so tests don't try
// to mount Expo's navigator.
vi.mock('expo-router', () => ({ router: { replace: vi.fn() } }));

// auth-store reads from a SecureStore-backed JSON; stub it.
vi.mock('./auth-store', () => ({
  getTokens: async () => ({ accessToken: 'fake-token', refreshToken: 'fake' }),
  clearTokens: async () => {},
}));

import { apiFetch, ApiError, AIBudgetExceededError, isAIBudgetExceededError } from './api';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('apiFetch — AI_BUDGET_EXCEEDED mapping', () => {
  it('throws AIBudgetExceededError on 429 + AI_BUDGET_EXCEEDED body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: 'AI_BUDGET_EXCEEDED', message: 'Daily limit reached.' }),
      }),
    );
    await expect(
      apiFetch('/chat/messages', { method: 'POST', body: { text: 'hi' } }),
    ).rejects.toBeInstanceOf(AIBudgetExceededError);
  });

  it('isAIBudgetExceededError type guard fires on the typed instance', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: 'AI_BUDGET_EXCEEDED', message: 'Daily limit reached.' }),
      }),
    );
    try {
      await apiFetch('/chat/messages', { method: 'POST' });
      expect.fail('expected throw');
    } catch (err) {
      expect(isAIBudgetExceededError(err)).toBe(true);
    }
  });

  it('429 with a different error code throws plain ApiError (not AIBudgetExceededError)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: 'RATE_LIMITED', message: 'too many requests' }),
      }),
    );
    try {
      await apiFetch('/chat/messages', { method: 'POST' });
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err).not.toBeInstanceOf(AIBudgetExceededError);
      expect(isAIBudgetExceededError(err)).toBe(false);
    }
  });

  it('non-429 errors do not trigger AIBudgetExceededError even when body has AI_BUDGET_EXCEEDED', async () => {
    // Defensive: server should never send AI_BUDGET_EXCEEDED with non-429,
    // but we only map when BOTH match.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'AI_BUDGET_EXCEEDED', message: 'wrong status' }),
      }),
    );
    try {
      await apiFetch('/chat/messages', { method: 'POST' });
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect(err).not.toBeInstanceOf(AIBudgetExceededError);
    }
  });
});
