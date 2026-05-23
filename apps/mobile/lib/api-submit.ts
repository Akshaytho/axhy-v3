/**
 * Mobile API client for the worker submit + verify-status flow.
 *
 * `submitVisit(visitId, photos)` — POST /worker/visits/:visitId/submit
 *   Called once after all photos are confirmed in the review grid.
 *   Backend reconstructs r2Keys server-side; mobile only sends (phase, index,
 *   contentType) tuples.
 *
 * `fetchVerifyStatus(visitId)` — GET /worker/visits/:visitId/verify-status
 *   Called on a poll loop by the submit screen until visitState leaves
 *   AWAITING_VERIFICATION (or an error terminal state is reached).
 *
 * @derives(master-plan §G)
 * @derives(WORKER_MVP_SLICE_2B_3_PLAN.md §T6)
 */

import {
  WorkerSubmitResponseSchema,
  VerifyStatusResponseSchema,
  type WorkerSubmitPhoto,
  type WorkerSubmitResponse,
  type VerifyStatusResponse,
} from '@axhy/shared-schema';

import { apiFetch } from './api';
import { API_ROUTES } from './api-routes';

/** POST /worker/visits/:visitId/submit — write photo metadata + transition visit.
 *  @derives(master-plan §G) */
export async function submitVisit(
  visitId: string,
  photos: ReadonlyArray<WorkerSubmitPhoto>,
): Promise<WorkerSubmitResponse> {
  const raw = await apiFetch<unknown>(API_ROUTES.workerSubmit(visitId), {
    method: 'POST',
    body: { photos },
  });
  return WorkerSubmitResponseSchema.parse(raw);
}

/** GET /worker/visits/:visitId/verify-status — poll for AI verification result.
 *  @derives(master-plan §G) */
export async function fetchVerifyStatus(visitId: string): Promise<VerifyStatusResponse> {
  const raw = await apiFetch<unknown>(API_ROUTES.workerVerifyStatus(visitId), {
    method: 'GET',
  });
  return VerifyStatusResponseSchema.parse(raw);
}
