/**
 * useResolveFlaggedVisit / useRejectFlaggedVisit — Wave 4 compliance mutations.
 *
 * Wires the FlaggedReviewSheet's Resolve/Reject buttons to the backend
 * `POST /visits/:id/resolve` and `POST /visits/:id/reject` routes. On
 * success both mutations invalidate `TODAY_QUERY_KEY` so the flagged-visits
 * section on Today re-renders without the row.
 *
 * Idempotency-Key header is generated fresh per mutation call so a Slow-3G
 * retry can hit the cached response and avoid double-firing the underlying
 * state change (per Cluster F pattern, generic `withIdempotency` middleware
 * on the backend).
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 * @derives(2026-05-18-supervisor-30-day-real-life-simulation-v2.md §3 Wave 4)
 */

import { useMutation } from '@tanstack/react-query';
import type { ResolveFlaggedVisitInputT, RejectFlaggedVisitInputT } from '@axhy/shared-schema';

import { apiFetch } from '../api';
import { generateIdempotencyKey } from '../idempotency-key';

import { useInvalidateToday } from './use-today';

/**
 * Wire-shape returned by both `POST /visits/:id/resolve` and `POST /visits/:id/reject`.
 *
 * `previousState` is the Visit.state column value at the moment of the
 * mutation — the route reads it inside the same tx that flips the row, so
 * it's a stable point-in-time snapshot (NOT a stale read).
 *
 * @derives(2026-05-18-supervisor-30-day-real-life-simulation-v2.md §3 Wave 4)
 */
export type FlaggedVisitMutationResponse = {
  ok: true;
  visitId: string;
  previousState: string;
  flagged: boolean;
  state: string;
};

/** Args accepted by `useResolveFlaggedVisit().mutate(...)`. */
export type ResolveFlaggedVisitArgs = {
  visitId: string;
  supervisorReason: string | null;
};

/** Args accepted by `useRejectFlaggedVisit().mutate(...)`. */
export type RejectFlaggedVisitArgs = {
  visitId: string;
  supervisorReason: string;
};

/**
 * Resolve a flagged visit. Reason is optional; pass `null` when the
 * supervisor left the textarea empty. On success, Today is invalidated.
 *
 * @derives(2026-05-18-supervisor-30-day-real-life-simulation-v2.md §3 Wave 4)
 */
export function useResolveFlaggedVisit() {
  const invalidate = useInvalidateToday();
  return useMutation<FlaggedVisitMutationResponse, Error, ResolveFlaggedVisitArgs>({
    mutationFn: async ({ visitId, supervisorReason }) => {
      const body: ResolveFlaggedVisitInputT = { supervisorReason };
      return apiFetch<FlaggedVisitMutationResponse>(`/visits/${visitId}/resolve`, {
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': generateIdempotencyKey() },
      });
    },
    onSuccess: () => void invalidate(),
  });
}

/**
 * Reject a flagged visit. Reason is REQUIRED — the FlaggedReviewSheet's
 * confirm screen enforces a non-empty trimmed string on the client; the
 * backend enforces the same via `RejectFlaggedVisitInput` Zod schema.
 *
 * @derives(2026-05-18-supervisor-30-day-real-life-simulation-v2.md §3 Wave 4)
 */
export function useRejectFlaggedVisit() {
  const invalidate = useInvalidateToday();
  return useMutation<FlaggedVisitMutationResponse, Error, RejectFlaggedVisitArgs>({
    mutationFn: async ({ visitId, supervisorReason }) => {
      const body: RejectFlaggedVisitInputT = { supervisorReason };
      return apiFetch<FlaggedVisitMutationResponse>(`/visits/${visitId}/reject`, {
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': generateIdempotencyKey() },
      });
    },
    onSuccess: () => void invalidate(),
  });
}
