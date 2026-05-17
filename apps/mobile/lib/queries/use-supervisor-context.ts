/**
 * useSupervisorContextQuery — Chat tab GreetingCard data hook.
 *
 * Fetches `GET /supervisor/context` → `{ sitesActive, workersActive }` and
 * provides the counts to the Chat tab GreetingCard so it renders real data
 * instead of hardcoded zeros.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */

import { useQuery } from '@tanstack/react-query';
import type { SupervisorContextT } from '@axhy/shared-schema';

import { apiFetch } from '../api';

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export const SUPERVISOR_CONTEXT_QUERY_KEY = ['supervisor-context'] as const;

/**
 * Fetch the supervisor's portfolio counts (sites + active workers).
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */
export function useSupervisorContextQuery() {
  return useQuery<SupervisorContextT>({
    queryKey: SUPERVISOR_CONTEXT_QUERY_KEY,
    queryFn: () => apiFetch<SupervisorContextT>('/supervisor/context'),
  });
}
