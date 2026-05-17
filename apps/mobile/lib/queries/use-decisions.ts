/**
 * useDecisionsQuery / useDismissDecision — Decisions tab data hooks.
 *
 * Centralises the query key so mutation invalidations never repeat string
 * literals. `useDecisionsQuery` fetches the full pending-decision queue.
 * `useDismissDecision` calls the dismiss endpoint and invalidates the cache.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DecisionsResponseT } from '@axhy/shared-schema';

import { apiFetch } from '../api';

/** Stable query key — import this anywhere you need to invalidate. */
export const DECISIONS_QUERY_KEY = ['supervisor-decisions'] as const;

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export function useDecisionsQuery() {
  return useQuery<DecisionsResponseT>({
    queryKey: DECISIONS_QUERY_KEY,
    queryFn: () => apiFetch<DecisionsResponseT>('/supervisor/decisions'),
  });
}

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export function useInvalidateDecisions() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: DECISIONS_QUERY_KEY });
}

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export function useDismissDecision() {
  const invalidate = useInvalidateDecisions();
  return useMutation({
    mutationFn: async (id: string) =>
      apiFetch(`/supervisor/decisions/${id}/dismiss`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onSuccess: () => void invalidate(),
  });
}
