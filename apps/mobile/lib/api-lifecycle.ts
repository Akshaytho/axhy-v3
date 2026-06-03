/**
 * Mobile API client for worker-driven visit lifecycle transitions.
 *
 * `postWorkerClockIn(visitId)` — POST /worker/visits/:visitId/clock-in.
 * `postWorkerClockOut(visitId)` — POST /worker/visits/:visitId/clock-out.
 *
 * Both endpoints are idempotent server-side (already-in-target-state returns
 * 200 with alreadyInProgress / alreadyPending = true), so the capture flow can
 * safely retry around navigation edges without duplicating lifecycle writes.
 *
 * @derives(master-plan §G)
 */

import { apiFetch } from './api';
import { API_ROUTES } from './api-routes';

export type ClockInResponse = {
  visitId: string;
  visitState: 'IN_PROGRESS';
  alreadyInProgress: boolean;
};

export type ClockOutResponse = {
  visitId: string;
  visitState: 'PHOTOS_PENDING';
  alreadyPending: boolean;
};

/** @derives(master-plan §G) */
export async function postWorkerClockIn(visitId: string): Promise<ClockInResponse> {
  return apiFetch<ClockInResponse>(API_ROUTES.workerClockIn(visitId), { method: 'POST' });
}

/** @derives(master-plan §G) */
export async function postWorkerClockOut(visitId: string): Promise<ClockOutResponse> {
  return apiFetch<ClockOutResponse>(API_ROUTES.workerClockOut(visitId), { method: 'POST' });
}
