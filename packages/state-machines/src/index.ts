/**
 * @axhy/state-machines
 *
 * All XState v5 machines for Axhy domain entities. Six locked machines:
 * Visit, Worker, Site, LeaveRequest, Device, AssignmentConfig.
 *
 * @derives(ADR-0006)
 */

export const PACKAGE_NAME = '@axhy/state-machines' as const;

// Re-export the public xstate v5 surface consumers need to drive transitions
// without declaring xstate as a direct dep. Services pass the machine through
// createActor + send to compute next snapshots; never reach for xstate directly.
export { createActor } from 'xstate';

export { workerMachine } from './worker.js';
export type { WorkerStateValue, WorkerEvent, WorkerContext, WorkerMachine } from './worker.js';

export { visitMachine, BILLABLE_VISIT_STATES } from './visit.js';
export type { VisitStateValue, VisitEvent, VisitContext, VisitMachine } from './visit.js';

export { captureMachine, CAPTURE_STEP_ORDER } from './capture.js';
export type {
  CaptureStep,
  CaptureStateValue,
  CaptureEvent,
  CaptureContext,
  CaptureMachine,
} from './capture.js';

export * from './calendar.js';
export * from './assignment.js';
export * from './conflicts.js';

// Ledger #20 — LeaveRequest / SwapRequest / Complaint machines. Namespaced
// because each exposes canTransition/assertTransition/isTerminal (same names
// as assignment.ts). Consumers call e.g. `leaveRequest.assertTransition(...)`.
// Types are re-exported directly (names are unique, no collision).
export * as leaveRequest from './leave-request.js';
export * as swapRequest from './swap-request.js';
export * as complaint from './complaint.js';
export type { LeaveRequestState } from './leave-request.js';
export type { SwapRequestState } from './swap-request.js';
export type { ComplaintState } from './complaint.js';
