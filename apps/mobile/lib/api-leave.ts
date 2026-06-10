/**
 * Worker leave-request API.
 *
 * Thin wrapper over `apiFetch` for the worker self-service time-off flow.
 * The worker POSTs their OWN Worker.id (sourced from GET /worker/today's
 * `workerId`); the backend binds the caller to self and 403s a mismatch
 * (FORBIDDEN_NOT_SELF). The request lands in REQUESTED state; HR / the
 * worker's supervisor approve or reject it. The worker never self-grants
 * leave — Worker.state only flips to ON_LEAVE on approval.
 *
 * @derives(master-plan §G) — worker surface
 * @derives(ADR-0007)
 */

import { apiFetch } from './api';
import { API_ROUTES } from './api-routes';

/** Input for `submitLeaveRequest`. Dates are calendar-day 'YYYY-MM-DD'. */
export interface SubmitLeaveRequestInput {
  /** The worker's OWN Worker.id (from useWorkerTodayQuery().data.workerId). */
  workerId: string;
  /** First day of leave, inclusive. 'YYYY-MM-DD'. */
  fromDate: string;
  /** Last day of leave, inclusive. 'YYYY-MM-DD'. */
  toDate: string;
  /** Why the worker needs time off. 1–500 chars (backend-validated). */
  reason: string;
}

/** Server response on a successful create (HTTP 201). */
export interface SubmitLeaveRequestResult {
  ok: boolean;
  leaveRequestId: string;
  workerId: string;
  fromDate: string;
  toDate: string;
  /** Always 'REQUESTED' on create. */
  state: string;
}

/**
 * Create a leave request for the signed-in worker.
 *
 * Throws `ApiError` on non-2xx (e.g. 403 FORBIDDEN_NOT_SELF, 400 BAD_RANGE,
 * 401 on expired session) so the calling screen can branch on `err.message`.
 *
 * @derives(master-plan §G)
 */
export function submitLeaveRequest(
  input: SubmitLeaveRequestInput,
): Promise<SubmitLeaveRequestResult> {
  return apiFetch<SubmitLeaveRequestResult>(API_ROUTES.leaveRequests, {
    method: 'POST',
    body: input,
  });
}

/**
 * One row of the worker's OWN leave history (GET /worker/leave-requests).
 * @derives(walk worker-screens 2026-06-10-2345 bug #2)
 */
export interface MyLeaveRow {
  id: string;
  /** 'YYYY-MM-DD' inclusive. */
  fromDate: string;
  /** 'YYYY-MM-DD' inclusive. */
  toDate: string;
  reason: string;
  /** REQUESTED | APPROVED | REJECTED | CANCELLED. */
  state: string;
  /** Supervisor/HR note on decision, if any. */
  decisionNote: string | null;
  decidedAt: string | null;
  createdAt: string;
}

/**
 * Fetch the signed-in worker's own leave requests (newest first, max 10).
 * Self-scoped server-side — no ids travel from the client.
 *
 * @derives(walk worker-screens 2026-06-10-2345 bug #2)
 */
export function listMyLeaveRequests(): Promise<{ items: MyLeaveRow[] }> {
  return apiFetch<{ items: MyLeaveRow[] }>(API_ROUTES.workerLeaveList);
}
