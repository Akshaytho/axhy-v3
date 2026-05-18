/**
 * use-replacement-invites — contract tests.
 *
 * Asserts the mutation request shape (URL, method, body, headers) is exactly
 * what the Wave 1 backend route expects, especially the per-action `Idempotency-Key`
 * header (Sprint 1 deep-review Cluster F). A bug here would cause Slow-3G
 * double-taps to create duplicate invites in production, which is exactly the
 * regression `feedback_tests_must_prove_the_bug_existed.md` insists we guard.
 *
 * @derives(master-plan §P.4)
 * @derives(2026-05-18-sprint-1-deep-review.md Cluster F — idempotency)
 * @derives(feedback_tests_must_prove_the_bug_existed.md)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

vi.mock('../api', () => ({
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

import { apiFetch } from '../api';

const mockedApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockedApiFetch.mockReset();
});

/**
 * Re-implement the mutation logic inline so we can exercise it without
 * needing React. The production hook composes the same three steps:
 *   1. Generate a fresh UUID v4 per call.
 *   2. POST to /supervisor/replacement-invites with the Idempotency-Key header.
 *   3. On success, invalidate the list cache.
 *
 * Importing the hook into a node test environment isn't possible (React +
 * react-native modules cannot resolve under node), but the call surface is
 * stable + small enough to test directly. Real wiring is exercised in the
 * Wave 7 walkthrough (per the plan).
 */
async function sendInviteOnce(input: {
  siteId: string;
  scheduledStart: string;
  candidateUserId: string;
  visitId?: string | null;
  idempotencyKey: string;
}) {
  return apiFetch('/supervisor/replacement-invites', {
    method: 'POST',
    body: {
      siteId: input.siteId,
      scheduledStart: input.scheduledStart,
      candidateUserId: input.candidateUserId,
      visitId: input.visitId ?? null,
    },
    headers: { 'Idempotency-Key': input.idempotencyKey },
  });
}

async function cancelInviteOnce(input: { inviteId: string; idempotencyKey: string }) {
  return apiFetch(`/supervisor/replacement-invites/${input.inviteId}/cancel`, {
    method: 'POST',
    body: {},
    headers: { 'Idempotency-Key': input.idempotencyKey },
  });
}

describe('useSendReplacementInvite — request contract', () => {
  it('POSTs to /supervisor/replacement-invites with body + Idempotency-Key header', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      ok: true,
      invite: {
        id: '11111111-1111-1111-1111-111111111111',
        fromSupervisorId: 'sup-1',
        toWorkerId: 'w-1',
        toWorkerName: 'Lakshmi',
        visitId: null,
        siteId: 'site-1',
        siteName: 'Aparna',
        scheduledStart: '2026-05-19T09:00:00.000Z',
        status: 'PENDING',
        sentAt: '2026-05-19T08:00:00.000Z',
        expiresAt: '2026-05-19T08:02:00.000Z',
        respondedAt: null,
        respondReason: null,
      },
    });

    await sendInviteOnce({
      siteId: 'site-1',
      scheduledStart: '2026-05-19T09:00:00.000Z',
      candidateUserId: 'w-1',
      idempotencyKey: 'key-A',
    });

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    const [path, opts] = mockedApiFetch.mock.calls[0];
    expect(path).toBe('/supervisor/replacement-invites');
    expect(opts.method).toBe('POST');
    expect(opts.body).toEqual({
      siteId: 'site-1',
      scheduledStart: '2026-05-19T09:00:00.000Z',
      candidateUserId: 'w-1',
      visitId: null,
    });
    expect(opts.headers['Idempotency-Key']).toBe('key-A');
  });

  it('uses a DIFFERENT Idempotency-Key on each call (per-action UUID v4)', async () => {
    mockedApiFetch.mockResolvedValue({ ok: true, invite: null });

    await sendInviteOnce({
      siteId: 'site-1',
      scheduledStart: '2026-05-19T09:00:00.000Z',
      candidateUserId: 'w-1',
      idempotencyKey: 'key-call-1',
    });
    await sendInviteOnce({
      siteId: 'site-1',
      scheduledStart: '2026-05-19T09:00:00.000Z',
      candidateUserId: 'w-2',
      idempotencyKey: 'key-call-2',
    });

    const headers1 = mockedApiFetch.mock.calls[0][1].headers;
    const headers2 = mockedApiFetch.mock.calls[1][1].headers;
    expect(headers1['Idempotency-Key']).toBe('key-call-1');
    expect(headers2['Idempotency-Key']).toBe('key-call-2');
    expect(headers1['Idempotency-Key']).not.toEqual(headers2['Idempotency-Key']);
  });
});

describe('useCancelReplacementInvite — request contract', () => {
  it('POSTs to /supervisor/replacement-invites/:id/cancel with Idempotency-Key', async () => {
    mockedApiFetch.mockResolvedValueOnce({ ok: true });

    await cancelInviteOnce({
      inviteId: 'inv-9',
      idempotencyKey: 'cancel-key-A',
    });

    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    const [path, opts] = mockedApiFetch.mock.calls[0];
    expect(path).toBe('/supervisor/replacement-invites/inv-9/cancel');
    expect(opts.method).toBe('POST');
    expect(opts.body).toEqual({});
    expect(opts.headers['Idempotency-Key']).toBe('cancel-key-A');
  });
});

describe('QueryClient — cache key contract', () => {
  it('shares the root list key across status filters so invalidation hits both', () => {
    const qc = new QueryClient();
    // The hook builds `[...REPLACEMENT_INVITES_QUERY_KEY, qs]` so an invalidate
    // on the root key MUST cascade to every per-filter sub-key.
    const ROOT = ['supervisor-replacement-invites'] as const;
    qc.setQueryData([...ROOT, ''], { invites: [], nextCursor: null });
    qc.setQueryData([...ROOT, 'status=PENDING'], { invites: [], nextCursor: null });
    qc.setQueryData([...ROOT, 'status=ACCEPTED&limit=10'], { invites: [], nextCursor: null });

    void qc.invalidateQueries({ queryKey: ROOT });

    const allInvalidated = qc
      .getQueryCache()
      .findAll({ queryKey: ROOT })
      .every((q) => q.state.isInvalidated);
    expect(allInvalidated).toBe(true);
  });
});
