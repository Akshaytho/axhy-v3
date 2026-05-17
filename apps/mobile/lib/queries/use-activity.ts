/**
 * useActivityQuery — Activity tab data hook.
 *
 * Wraps `apiFetch<ActivityResponseT>('/supervisor/activity')` with
 * @tanstack/react-query. Centralizes the queryKey so mutation
 * invalidations don't repeat string literals.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */

import { useQuery } from '@tanstack/react-query';
import type { ActivityResponseT } from '@axhy/shared-schema';

import { apiFetch } from '../api';

export const ACTIVITY_QUERY_KEY = ['supervisor-activity'] as const;

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export function useActivityQuery() {
  return useQuery<ActivityResponseT>({
    queryKey: ACTIVITY_QUERY_KEY,
    queryFn: () => apiFetch<ActivityResponseT>('/supervisor/activity'),
  });
}
