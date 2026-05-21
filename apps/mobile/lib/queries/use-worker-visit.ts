/**
 * Assignment Detail data hook.
 *
 * Wraps `GET /worker/visits/:id` with React Query. Cache key includes
 * the visitId so navigating between two visits doesn't reuse stale data.
 *
 * @derives(WORKER_MVP_SLICE_2A_PLAN.md §1)
 * @derives(master-plan §G)
 */

import { useQuery } from '@tanstack/react-query';
import type { WorkerVisitDetailOutput } from '@axhy/shared-schema';

import { apiFetch } from '../api';
import { API_ROUTES } from '../api-routes';

const workerVisitQueryKey = (visitId: string) => ['worker-visit', visitId] as const;

/** @derives(master-plan §G) */
export function useWorkerVisitQuery(visitId: string) {
  return useQuery<WorkerVisitDetailOutput, Error>({
    queryKey: workerVisitQueryKey(visitId),
    queryFn: () => apiFetch<WorkerVisitDetailOutput>(API_ROUTES.workerVisit(visitId)),
    enabled: visitId.length > 0,
  });
}
