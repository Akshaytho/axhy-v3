/**
 * useReverseActivity / useSoftFlagActivity — Wave 4 Activity mutations.
 *
 * Wires the Activity tab's Reverse and soft-flag actions to the backend
 * `POST /activity/:id/reverse` (in-window) and `POST /activity/:id/soft-flag`
 * (beyond-window → HR review) routes. On success both mutations invalidate
 * the activity feed query so the row + any new compensating rows surface.
 *
 * Idempotency-Key header is generated fresh per mutation call.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 * @derives(2026-05-18-supervisor-30-day-real-life-simulation-v2.md §3 Wave 4)
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReverseActivityInputT, SoftFlagActivityInputT } from '@axhy/shared-schema';

import { apiFetch } from '../api';
import { generateIdempotencyKey } from '../idempotency-key';

import { ACTIVITY_QUERY_KEY_BASE } from './use-activity';

/**
 * Wire shape returned by `POST /activity/:id/reverse`.
 *
 * @derives(2026-05-18-supervisor-30-day-real-life-simulation-v2.md §3 Wave 4)
 */
export type ReverseActivityResponse = {
  ok: true;
  sourceAuditEventId: string;
  sourceKind: string;
  reverseAuditEventId: string;
  compensatingAuditEventId: string;
};

/**
 * Wire shape returned by `POST /activity/:id/soft-flag`.
 *
 * @derives(2026-05-18-supervisor-30-day-real-life-simulation-v2.md §3 Wave 4)
 */
export type SoftFlagActivityResponse = {
  ok: true;
  decisionId: string;
  sourceAuditEventId: string;
  sourceKind: string;
};

/** Args accepted by `useReverseActivity().mutate(...)`. */
export type ReverseActivityArgs = { auditEventId: string };

/** Args accepted by `useSoftFlagActivity().mutate(...)`. */
export type SoftFlagActivityArgs = {
  auditEventId: string;
  note: string | null;
};

/** Invalidate the entire activity feed cache (all filter combinations). */
function useInvalidateActivity() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [ACTIVITY_QUERY_KEY_BASE] });
}

/**
 * Reverse an in-window activity event. The route returns 422
 * KIND_NOT_REVERSIBLE for kinds outside the reversible set, and 422
 * WINDOW_CLOSED if the 30-min reversal window has lapsed — the caller
 * should map both to a soft-flag prompt.
 *
 * @derives(2026-05-18-supervisor-30-day-real-life-simulation-v2.md §3 Wave 4)
 */
export function useReverseActivity() {
  const invalidate = useInvalidateActivity();
  return useMutation<ReverseActivityResponse, Error, ReverseActivityArgs>({
    mutationFn: async ({ auditEventId }) => {
      const body: ReverseActivityInputT = {};
      return apiFetch<ReverseActivityResponse>(`/activity/${auditEventId}/reverse`, {
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': generateIdempotencyKey() },
      });
    },
    onSuccess: () => void invalidate(),
  });
}

/**
 * Soft-flag a beyond-window activity event for HR review. Creates a
 * LATE_REVERSAL_REQUEST SupervisorDecision row on the backend.
 *
 * @derives(2026-05-18-supervisor-30-day-real-life-simulation-v2.md §3 Wave 4)
 */
export function useSoftFlagActivity() {
  const invalidate = useInvalidateActivity();
  return useMutation<SoftFlagActivityResponse, Error, SoftFlagActivityArgs>({
    mutationFn: async ({ auditEventId, note }) => {
      const body: SoftFlagActivityInputT = { note };
      return apiFetch<SoftFlagActivityResponse>(`/activity/${auditEventId}/soft-flag`, {
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': generateIdempotencyKey() },
      });
    },
    onSuccess: () => void invalidate(),
  });
}
