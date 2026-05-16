/**
 * @derives(master-plan §G)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

import { apiFetch, ApiError } from './api';
import { sendChatMessage } from './chat-api';

const mockedApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockedApiFetch.mockReset();
});

describe('sendChatMessage', () => {
  it('returns the response on first try (no retry)', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      chatMessageId: 'msg-1',
      assistantText: 'hello',
      decisionCard: null,
    });
    const r = await sendChatMessage({ text: 'hi', idempotencyKey: 'idem-1' });
    expect(r.chatMessageId).toBe('msg-1');
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
  });

  it('retries with same Idempotency-Key on network failure', async () => {
    const networkErr = new Error('Network request failed');
    mockedApiFetch
      .mockRejectedValueOnce(networkErr)
      .mockRejectedValueOnce(networkErr)
      .mockResolvedValueOnce({ chatMessageId: 'msg-2', assistantText: 'ok', decisionCard: null });

    const r = await sendChatMessage({ text: 'hi', idempotencyKey: 'idem-2', retryDelayMs: 1 });
    expect(r.chatMessageId).toBe('msg-2');
    expect(mockedApiFetch).toHaveBeenCalledTimes(3);

    for (let i = 0; i < 3; i++) {
      const call = mockedApiFetch.mock.calls[i];
      expect(call[1].headers['Idempotency-Key']).toBe('idem-2');
    }
  });

  it('throws after 3 retries on persistent network failure', async () => {
    const networkErr = new Error('Network request failed');
    mockedApiFetch.mockRejectedValue(networkErr);

    await expect(
      sendChatMessage({ text: 'hi', idempotencyKey: 'idem-3', retryDelayMs: 1 }),
    ).rejects.toThrow('Network request failed');

    expect(mockedApiFetch).toHaveBeenCalledTimes(4);
  });

  it('does NOT retry on 4xx errors', async () => {
    mockedApiFetch.mockRejectedValueOnce(new ApiError(400, 'BAD_INPUT', 'bad'));
    await expect(
      sendChatMessage({ text: 'hi', idempotencyKey: 'idem-4', retryDelayMs: 1 }),
    ).rejects.toThrow('bad');
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
  });
});
