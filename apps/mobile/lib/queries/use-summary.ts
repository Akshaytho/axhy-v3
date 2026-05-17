/**
 * useSummaryQuery — Summary (end-of-day digest) tab data hook.
 *
 * Centralises the queryKey so invalidations don't repeat string literals.
 * Calls `apiFetch<SummaryResponseT>('/supervisor/summary')` — no Zod
 * re-parse on the client; the backend already validates response shape.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */

import { useQuery } from '@tanstack/react-query';
import type { SummaryResponseT } from '@axhy/shared-schema';

import { apiFetch } from '../api';

export const SUMMARY_QUERY_KEY = ['supervisor-summary'] as const;

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export function useSummaryQuery() {
  return useQuery<SummaryResponseT>({
    queryKey: SUMMARY_QUERY_KEY,
    queryFn: () => apiFetch<SummaryResponseT>('/supervisor/summary'),
  });
}
