/**
 * Worker History data hook.
 *
 * Wraps `GET /worker/history` with React Query. Default window is 30 days.
 *
 * @derives(master-plan §G)
 */

import { useQuery } from '@tanstack/react-query';
import type { WorkerHistoryOutput } from '@axhy/shared-schema';

import { apiFetch } from '../api';
import { API_ROUTES } from '../api-routes';

const workerHistoryQueryKey = (windowDays: number) => ['worker-history', windowDays] as const;

/** @derives(master-plan §G) */
export function useWorkerHistoryQuery(windowDays = 30) {
  return useQuery<WorkerHistoryOutput, Error>({
    queryKey: workerHistoryQueryKey(windowDays),
    queryFn: () =>
      apiFetch<WorkerHistoryOutput>(`${API_ROUTES.workerHistory}?windowDays=${windowDays}`),
    staleTime: 30_000,
  });
}
