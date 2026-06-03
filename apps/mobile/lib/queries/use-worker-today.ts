/**
 * Worker Home data hook.
 *
 * Wraps `GET /worker/today` with React Query. Cache key `worker-today`
 * gives every consumer in the (worker) tree the same in-flight response.
 *
 * @derives(WORKER_MVP_SLICE_2A_PLAN.md §1)
 * @derives(master-plan §G)
 */

import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import type { WorkerTodayOutput } from '@axhy/shared-schema';

import { apiFetch } from '../api';
import { API_ROUTES } from '../api-routes';

const QUERY_KEY = ['worker-today'] as const;

/** @derives(master-plan §G) */
export function useWorkerTodayQuery() {
  const query = useQuery<WorkerTodayOutput, Error>({
    queryKey: QUERY_KEY,
    queryFn: () => apiFetch<WorkerTodayOutput>(API_ROUTES.workerToday),
    // Worker home reflects rapidly-changing visit state; treat cached data as
    // stale on every mount/focus so tab switches and app-foreground show truth.
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  // Refire on screen focus (covers tab switches in the worker shell where the
  // screen stays mounted but blurs/focuses without unmounting).
  useFocusEffect(
    useCallback(() => {
      void query.refetch();
    }, [query.refetch]),
  );

  return query;
}
