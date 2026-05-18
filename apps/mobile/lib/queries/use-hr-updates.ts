/**
 * useHRUpdatesQuery / useAckHRUpdate — HR Updates tab data hooks.
 *
 * Centralises the query key so mutation invalidations never repeat string
 * literals. `useHRUpdatesQuery` fetches the full updates feed from
 * `GET /supervisor/updates`. `useAckHRUpdate` POSTs the 5-word own-voice
 * acknowledgement and invalidates the feed cache on success.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { HRUpdatesResponseT, HRAckResponseT } from '@axhy/shared-schema';

import { apiFetch } from '../api';

/** Stable query key — import anywhere you need to invalidate the updates feed. */
export const HR_UPDATES_QUERY_KEY = ['supervisor-hr-updates'] as const;

/**
 * Fetches the supervisor's HR updates feed from `GET /supervisor/updates`.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 */
export function useHRUpdatesQuery() {
  return useQuery<HRUpdatesResponseT>({
    queryKey: HR_UPDATES_QUERY_KEY,
    queryFn: () => apiFetch<HRUpdatesResponseT>('/supervisor/updates'),
    staleTime: 60_000,
  });
}

/**
 * Invalidates the HR updates feed. Import when a sibling action needs
 * to bust the cache without triggering the full mutation.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 */
export function useInvalidateHRUpdates() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: HR_UPDATES_QUERY_KEY });
}

/**
 * Posts the supervisor's 5-word own-voice acknowledgement for an HRUpdate.
 * Invalidates the HR updates query on success so the card moves to recentAcked.
 *
 * Returns `{ ok: true, acknowledged: true }` on success. On failure, throws
 * an `ApiError` — callers must surface this to the user (never fake success).
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 */
export function useAckHRUpdate() {
  const invalidate = useInvalidateHRUpdates();
  return useMutation<HRAckResponseT, Error, { id: string; text: string }>({
    mutationFn: ({ id, text }) =>
      apiFetch<HRAckResponseT>(`/supervisor/updates/${id}/acknowledge`, {
        method: 'POST',
        body: { text },
      }),
    onSuccess: () => void invalidate(),
  });
}
