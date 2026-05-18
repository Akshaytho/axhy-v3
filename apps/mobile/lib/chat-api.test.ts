/**
 * @derives(master-plan §G)
 * @derives(supervisor-drawer-and-decisions-redesign.md §C, §D.3)
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

  // ─── Sprint 2 (Wave 3) additions ──────────────────────────────────────────

  it('sends only `text` when no attachments / amend / voiceConfidence are set', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      chatMessageId: 'msg-5',
      assistantText: 'ok',
      decisionCard: null,
    });
    await sendChatMessage({ text: 'plain', idempotencyKey: 'idem-5' });
    const call = mockedApiFetch.mock.calls[0];
    expect(call[1].body).toEqual({ text: 'plain' });
  });

  it('includes attachments in the body when present', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      chatMessageId: 'msg-6',
      assistantText: 'ok',
      decisionCard: null,
    });
    await sendChatMessage({
      text: 'lobby was missed',
      idempotencyKey: 'idem-6',
      attachments: [
        { type: 'image', url: 'https://s3.example.com/photo-A.jpg' },
        { type: 'image', url: 'https://s3.example.com/photo-B.jpg' },
      ],
    });
    const call = mockedApiFetch.mock.calls[0];
    expect(call[1].body).toEqual({
      text: 'lobby was missed',
      attachments: [
        { type: 'image', url: 'https://s3.example.com/photo-A.jpg' },
        { type: 'image', url: 'https://s3.example.com/photo-B.jpg' },
      ],
    });
  });

  it('omits attachments from the body when the array is empty', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      chatMessageId: 'msg-7',
      assistantText: 'ok',
      decisionCard: null,
    });
    await sendChatMessage({ text: 'hi', idempotencyKey: 'idem-7', attachments: [] });
    const call = mockedApiFetch.mock.calls[0];
    expect(call[1].body).toEqual({ text: 'hi' });
    expect(call[1].body.attachments).toBeUndefined();
  });

  it('includes amend.targetDecisionId in the body when in amend mode', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      chatMessageId: 'msg-8',
      assistantText: 'ok',
      decisionCard: null,
    });
    await sendChatMessage({
      text: 'make it leave-with-pay instead',
      idempotencyKey: 'idem-8',
      amend: { targetDecisionId: '550e8400-e29b-41d4-a716-446655440000' },
    });
    const call = mockedApiFetch.mock.calls[0];
    expect(call[1].body).toEqual({
      text: 'make it leave-with-pay instead',
      amend: { targetDecisionId: '550e8400-e29b-41d4-a716-446655440000' },
    });
  });

  it('threads voiceConfidence onto the body when set', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      chatMessageId: 'msg-9',
      assistantText: 'ok',
      decisionCard: null,
    });
    await sendChatMessage({
      text: 'mark Suresh absent',
      idempotencyKey: 'idem-9',
      voiceConfidence: 'HIGH',
    });
    const call = mockedApiFetch.mock.calls[0];
    expect(call[1].body).toEqual({ text: 'mark Suresh absent', voiceConfidence: 'HIGH' });
  });

  it('uses the same body shape (incl. attachments + amend) across retries', async () => {
    const networkErr = new Error('Network request failed');
    mockedApiFetch.mockRejectedValueOnce(networkErr).mockResolvedValueOnce({
      chatMessageId: 'msg-10',
      assistantText: 'ok',
      decisionCard: null,
    });
    const attachments = [{ type: 'image' as const, url: 'https://s3.example.com/photo.jpg' }];
    const amend = { targetDecisionId: '550e8400-e29b-41d4-a716-446655440099' };
    await sendChatMessage({
      text: 'one',
      idempotencyKey: 'idem-10',
      attachments,
      amend,
      retryDelayMs: 1,
    });
    expect(mockedApiFetch).toHaveBeenCalledTimes(2);
    // Both calls byte-identical body shape — proves idempotency-on-retry.
    const a = mockedApiFetch.mock.calls[0][1].body;
    const b = mockedApiFetch.mock.calls[1][1].body;
    expect(a).toEqual(b);
    expect(a).toEqual({
      text: 'one',
      attachments: [{ type: 'image', url: 'https://s3.example.com/photo.jpg' }],
      amend: { targetDecisionId: '550e8400-e29b-41d4-a716-446655440099' },
    });
  });
});
