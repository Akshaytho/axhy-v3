/**
 * useSupervisorLivingDocQuery — Memory & rules screen data hook.
 *
 * Fetches `GET /supervisor/living-doc` → the supervisor's own LivingDoc
 * (5 sections of ACTIVE rules) so the Memory screen renders real rules
 * instead of a permanent empty state.
 *
 * @derives(docs/locked/livingdoc-extraction-rules.md)
 * @derives(master-plan §G) — supervisor surface
 */

import { useQuery } from '@tanstack/react-query';
import type { LivingDocResponseT } from '@axhy/shared-schema';

import { apiFetch } from '../api';

/** @derives(master-plan §G) — supervisor surface */
export const SUPERVISOR_LIVING_DOC_QUERY_KEY = ['supervisor-living-doc'] as const;

/**
 * Fetch the supervisor's LivingDoc (their personal rules knowledge base).
 *
 * @derives(master-plan §G) — supervisor surface
 */
export function useSupervisorLivingDocQuery() {
  return useQuery<LivingDocResponseT>({
    queryKey: SUPERVISOR_LIVING_DOC_QUERY_KEY,
    queryFn: () => apiFetch<LivingDocResponseT>('/supervisor/living-doc'),
    staleTime: 5 * 60_000,
  });
}
