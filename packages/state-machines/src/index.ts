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

export * from './calendar.js';
export * from './assignment.js';
export * from './conflicts.js';
