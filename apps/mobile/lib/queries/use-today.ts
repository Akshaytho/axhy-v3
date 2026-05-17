/**
 * useTodayQuery — Today tab data hook.
 *
 * Centralises the queryKey so mutation invalidations (mark-absent etc.)
 * don't repeat string literals. Calls `apiFetch<TodayResponseT>('/supervisor/today')`
 * — no Zod re-parse on the client; backend already validates response shape.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { TodayResponseT } from '@axhy/shared-schema';

import { apiFetch } from '../api';

export const TODAY_QUERY_KEY = ['supervisor-today'] as const;

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export function useTodayQuery() {
  return useQuery<TodayResponseT>({
    queryKey: TODAY_QUERY_KEY,
    queryFn: () => apiFetch<TodayResponseT>('/supervisor/today'),
    staleTime: 30_000,
  });
}

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export function useInvalidateToday() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: TODAY_QUERY_KEY });
}
