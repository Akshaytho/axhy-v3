/**
 * useActivityQuery — Activity tab data hook.
 *
 * Wraps `apiFetch<ActivityResponseT>('/supervisor/activity')` with
 * @tanstack/react-query. Centralizes the queryKey so mutation
 * invalidations don't repeat string literals.
 *
 * Filter args are threaded into both the query key (so TanStack Query
 * refetches automatically on chip change) and the URL as query params.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */

import { useQuery } from '@tanstack/react-query';
import type { ActivityResponseT } from '@axhy/shared-schema';

import { apiFetch } from '../api';

/** Base key segment — also used for broad cache invalidations. */
export const ACTIVITY_QUERY_KEY_BASE = 'supervisor-activity' as const;

/**
 * Filter params accepted by `GET /supervisor/activity`.
 *
 * All values are optional; omitting a filter lets the backend apply its
 * default (`today` / `all` / `all`).
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */
export type ActivityFilters = {
  /** `today` | `yesterday` | `this-week` | `all` */
  date?: string;
  /** Site UUID or `'all'`. */
  siteId?: string;
  /** `all` | `absences` | `lates` | `leaves` */
  kind?: string;
};

/**
 * Build a stable, cache-keyed URL for the activity feed from the given filters.
 * Only includes params that differ from the backend defaults.
 *
 * @derives(ADR-0003)
 */
function buildActivityUrl(filters: ActivityFilters): string {
  const params = new URLSearchParams();
  if (filters.date && filters.date !== 'today') params.set('date', filters.date);
  if (filters.siteId && filters.siteId !== 'all') params.set('siteId', filters.siteId);
  if (filters.kind && filters.kind !== 'all') params.set('kind', filters.kind);
  const qs = params.toString();
  return qs ? `/supervisor/activity?${qs}` : '/supervisor/activity';
}

/**
 * Fetch and cache the supervisor's activity feed, filtered by the given params.
 *
 * TanStack Query refetches automatically whenever `filters` changes because
 * the full filter object is embedded in the query key.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */
export function useActivityQuery(filters: ActivityFilters = {}) {
  return useQuery<ActivityResponseT>({
    queryKey: [
      ACTIVITY_QUERY_KEY_BASE,
      filters.date ?? 'today',
      filters.siteId ?? 'all',
      filters.kind ?? 'all',
    ],
    queryFn: () => apiFetch<ActivityResponseT>(buildActivityUrl(filters)),
    staleTime: 30_000,
  });
}
