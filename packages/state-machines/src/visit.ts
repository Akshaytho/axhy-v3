/**
 * @axhy/state-machines — VisitState v1.1
 *
 * 12-state machine carried unchanged from Path A. Models a visit's lifecycle
 * from scheduled through verified-and-paid (or flagged for review).
 *
 * Every transition writes an audit event via the outbox (handled by the backend,
 * not the machine itself). The machine is the single source of truth for "what
 * transitions are legal."
 *
 * @derives(ADR-0006) — XState v5
 * @derives(master-plan §G) — locked state machines
 */

import { setup } from 'xstate';

export type VisitStateValue =
  | 'SCHEDULED'
  | 'NOTIFIED'
  | 'EN_ROUTE'
  | 'ON_SITE'
  | 'IN_PROGRESS'
  | 'PHOTOS_PENDING'
  | 'AWAITING_VERIFICATION'
  | 'VERIFIED'
  | 'FLAGGED'
  | 'CANCELLED'
  | 'NO_SHOW'
  | 'ARCHIVED';

export type VisitEvent =
  | { type: 'NOTIFY' }
  | { type: 'WORKER_DEPART' }
  | { type: 'WORKER_ARRIVE' }
  | { type: 'CLOCK_IN' }
  | { type: 'CLOCK_OUT' }
  | { type: 'PHOTOS_UPLOADED' }
  | { type: 'AI_VERIFIED'; flagged: false }
  | { type: 'AI_FLAGGED'; reason: string }
  | { type: 'SUPERVISOR_RESOLVED'; outcome: 'OK' | 'REJECT' }
  | { type: 'CANCEL'; by: 'supervisor' | 'worker' | 'system'; reason: string }
  | { type: 'MARK_NO_SHOW' }
  | { type: 'ARCHIVE_THRESHOLD_REACHED' };

export type VisitContext = {
  visitId: string;
  companyId: string;
  workerId: string;
  siteId: string;
  scheduledFor: Date;
  flaggedReasons: ReadonlyArray<string>;
};

/**
 * The Visit state machine. Used by:
 * - apps/backend (canonical transitions)
 * - apps/mobile (offline state-aware UI)
 * - @axhy/business-rules (state-aware billing rules)
 *
 * @derives(ADR-0006)
 */
export const visitMachine = setup({
  types: {
    context: {} as VisitContext,
    events: {} as VisitEvent,
  },
}).createMachine({
  id: 'visit',
  initial: 'SCHEDULED',
  context: ({ input }) => {
    const i = input as Partial<VisitContext>;
    return {
      visitId: i.visitId ?? '',
      companyId: i.companyId ?? '',
      workerId: i.workerId ?? '',
      siteId: i.siteId ?? '',
      scheduledFor: i.scheduledFor ?? new Date(),
      flaggedReasons: [],
    };
  },
  states: {
    SCHEDULED: {
      on: {
        NOTIFY: 'NOTIFIED',
        CANCEL: 'CANCELLED',
      },
    },
    NOTIFIED: {
      on: {
        WORKER_DEPART: 'EN_ROUTE',
        CANCEL: 'CANCELLED',
        MARK_NO_SHOW: 'NO_SHOW',
      },
    },
    EN_ROUTE: {
      on: {
        WORKER_ARRIVE: 'ON_SITE',
        CANCEL: 'CANCELLED',
        MARK_NO_SHOW: 'NO_SHOW',
      },
    },
    ON_SITE: {
      on: {
        CLOCK_IN: 'IN_PROGRESS',
        CANCEL: 'CANCELLED',
      },
    },
    IN_PROGRESS: {
      on: {
        CLOCK_OUT: 'PHOTOS_PENDING',
        CANCEL: 'CANCELLED',
      },
    },
    PHOTOS_PENDING: {
      on: {
        PHOTOS_UPLOADED: 'AWAITING_VERIFICATION',
      },
    },
    AWAITING_VERIFICATION: {
      on: {
        AI_VERIFIED: 'VERIFIED',
        AI_FLAGGED: 'FLAGGED',
      },
    },
    VERIFIED: {
      on: {
        ARCHIVE_THRESHOLD_REACHED: 'ARCHIVED',
      },
    },
    FLAGGED: {
      on: {
        SUPERVISOR_RESOLVED: [
          { target: 'VERIFIED', guard: ({ event }) => event.outcome === 'OK' },
          { target: 'CANCELLED', guard: ({ event }) => event.outcome === 'REJECT' },
        ],
      },
    },
    CANCELLED: {
      on: {
        ARCHIVE_THRESHOLD_REACHED: 'ARCHIVED',
      },
    },
    NO_SHOW: {
      on: {
        ARCHIVE_THRESHOLD_REACHED: 'ARCHIVED',
      },
    },
    ARCHIVED: {
      type: 'final',
    },
  },
});

export type VisitMachine = typeof visitMachine;

/** States that count as "billable" per master plan §B (all visits billable). */
export const BILLABLE_VISIT_STATES: ReadonlyArray<VisitStateValue> = [
  'VERIFIED',
  'FLAGGED',
  'CANCELLED',
  'NO_SHOW',
];
