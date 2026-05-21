/**
 * Worker Home data hook.
 *
 * Wraps `GET /worker/today` with React Query. Cache key `worker-today`
 * gives every consumer in the (worker) tree the same in-flight response.
 *
 * @derives(WORKER_MVP_SLICE_2A_PLAN.md §1)
 * @derives(master-plan §G)
 */

import { useQuery } from '@tanstack/react-query';
import type { WorkerTodayOutput } from '@axhy/shared-schema';

import { apiFetch } from '../api';
import { API_ROUTES } from '../api-routes';

const QUERY_KEY = ['worker-today'] as const;

/** @derives(master-plan §G) */
export function useWorkerTodayQuery() {
  return useQuery<WorkerTodayOutput, Error>({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<WorkerTodayOutput>(API_ROUTES.workerToday),
  });
}
