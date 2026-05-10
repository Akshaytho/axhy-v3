/**
 * @axhy/state-machines
 *
 * All XState v5 machines for Axhy domain entities. Six locked machines:
 * Visit, Worker, Site, LeaveRequest, Device, AssignmentConfig.
 *
 * @derives(ADR-0006)
 */

export const PACKAGE_NAME = '@axhy/state-machines' as const;

export { workerMachine } from './worker.js';
export type { WorkerStateValue, WorkerEvent, WorkerContext, WorkerMachine } from './worker.js';

export { visitMachine, BILLABLE_VISIT_STATES } from './visit.js';
export type { VisitStateValue, VisitEvent, VisitContext, VisitMachine } from './visit.js';

export * from './calendar.js';
export * from './assignment.js';
export * from './conflicts.js';
