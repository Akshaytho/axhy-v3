/**
 * LeaveRequest state-machine helpers.
 *
 * States (verified against apps/backend/src/routes/leave-requests.ts and
 * leave-request-service.ts): a worker (or supervisor/HR on their behalf)
 * files a request in REQUESTED; the responsible supervisor or HR decides it
 * to APPROVED or REJECTED, both terminal. Re-deciding a decided request is
 * illegal (the route returns 409 ALREADY_DECIDED).
 *
 * Ledger #20: this is the single source of truth for legal LeaveRequest
 * transitions, superseding the schema's "12-state placeholder" comment and
 * the inline `state === 'REQUESTED'` string guards. All functions pure — no
 * DB, no side effects (state-machines.md).
 *
 * @derives(master-plan §G)
 * @derives(.claude/rules/state-machines.md)
 * @derives(apps/backend/src/routes/leave-requests.ts — REQUESTED→APPROVED|REJECTED)
 */

export type LeaveRequestState = 'REQUESTED' | 'APPROVED' | 'REJECTED';

/** The two terminal states — no transition out. */
export const LEAVE_REQUEST_TERMINAL_STATES: ReadonlyArray<LeaveRequestState> = [
  'APPROVED',
  'REJECTED',
];

/**
 * Legal transitions:
 *   REQUESTED → APPROVED  (decide: approve)
 *   REQUESTED → REJECTED  (decide: reject)
 * APPROVED and REJECTED are terminal.
 */
export function canTransition(from: LeaveRequestState, to: LeaveRequestState): boolean {
  if (from === 'REQUESTED' && to === 'APPROVED') return true;
  if (from === 'REQUESTED' && to === 'REJECTED') return true;
  return false;
}

/**
 * Throw if the transition is illegal; no-op if legal. Callers map the throw
 * to their existing 409 ALREADY_DECIDED response.
 */
export function assertTransition(from: LeaveRequestState, to: LeaveRequestState): void {
  if (!canTransition(from, to)) {
    throw new Error(`LeaveRequest: illegal transition ${from}→${to}`);
  }
}

/** True if `state` is terminal (already decided). */
export function isTerminal(state: LeaveRequestState): boolean {
  return LEAVE_REQUEST_TERMINAL_STATES.includes(state);
}
