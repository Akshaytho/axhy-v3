/**
 * @axhy/state-machines — WorkerState
 *
 * 15-state machine carried unchanged from Path A. Models a worker's lifecycle
 * from invitation through termination + archival.
 *
 * Every transition writes an audit event via the outbox (handled by the backend,
 * not the machine itself — machines are pure). The machine is the single source
 * of truth for "what transitions are legal."
 *
 * @derives(ADR-0006) — XState v5 chosen
 * @derives(master-plan §G) — locked state machines from Path A
 */

import { setup } from 'xstate';

export type WorkerStateValue =
  | 'INVITED'
  | 'PENDING_ACTIVATION'
  | 'ACTIVE'
  | 'ON_LEAVE'
  | 'ON_SUSPENSION'
  | 'ABSENT'
  | 'AT_RISK'
  | 'BLOCKED'
  | 'DOC_PENDING'
  | 'TRANSFER_PENDING'
  | 'INACTIVE'
  | 'TERMINATION_PENDING'
  | 'TERMINATED'
  | 'ARCHIVED'
  | 'ANONYMIZED';

export type WorkerEvent =
  | { type: 'INVITE_ACCEPTED' }
  | { type: 'OTP_VERIFIED' }
  | { type: 'PROFILE_COMPLETED' }
  | { type: 'LEAVE_APPROVED'; days: number }
  | { type: 'LEAVE_RETURNED' }
  | { type: 'SUSPEND'; reason: string; until?: Date }
  | { type: 'SUSPENSION_LIFTED' }
  | { type: 'NO_SHOW' }
  | { type: 'CHECK_IN' }
  | { type: 'FLAG_AT_RISK'; reason: string }
  | { type: 'CLEAR_AT_RISK' }
  | { type: 'BLOCK'; reason: string }
  | { type: 'UNBLOCK' }
  | { type: 'DOCS_MISSING'; missing: string[] }
  | { type: 'DOCS_PROVIDED' }
  | { type: 'TRANSFER_INITIATED'; targetCompanyId: string }
  | { type: 'TRANSFER_COMPLETED' }
  | { type: 'TRANSFER_CANCELLED' }
  | { type: 'DEACTIVATE'; reason: string }
  | { type: 'REACTIVATE' }
  | { type: 'TERMINATE'; reason: string; lastDay: Date }
  | { type: 'TERMINATION_FINALIZED' }
  | { type: 'ARCHIVE_THRESHOLD_REACHED' }
  | { type: 'ANONYMIZATION_REQUESTED' };

export type WorkerContext = {
  workerId: string;
  companyId: string;
  /// Days since last meaningful state transition (used for archival)
  daysIdle: number;
  flags: ReadonlyArray<string>;
};

/**
 * The Worker state machine. Used by:
 * - apps/backend (canonical transitions)
 * - apps/mobile (offline state-aware UI)
 * - @axhy/business-rules (state-aware rule evaluation)
 *
 * @derives(ADR-0006)
 */
export const workerMachine = setup({
  types: {
    context: {} as WorkerContext,
    events: {} as WorkerEvent,
  },
}).createMachine({
  id: 'worker',
  initial: 'INVITED',
  context: ({ input }) => ({
    workerId: (input as { workerId: string }).workerId,
    companyId: (input as { companyId: string }).companyId,
    daysIdle: 0,
    flags: [],
  }),
  states: {
    INVITED: {
      on: {
        INVITE_ACCEPTED: 'PENDING_ACTIVATION',
        DEACTIVATE: 'INACTIVE',
      },
    },
    PENDING_ACTIVATION: {
      on: {
        OTP_VERIFIED: 'DOC_PENDING',
        DEACTIVATE: 'INACTIVE',
      },
    },
    DOC_PENDING: {
      on: {
        DOCS_PROVIDED: 'ACTIVE',
        DEACTIVATE: 'INACTIVE',
      },
    },
    ACTIVE: {
      on: {
        LEAVE_APPROVED: 'ON_LEAVE',
        SUSPEND: 'ON_SUSPENSION',
        NO_SHOW: 'ABSENT',
        FLAG_AT_RISK: 'AT_RISK',
        BLOCK: 'BLOCKED',
        DOCS_MISSING: 'DOC_PENDING',
        TRANSFER_INITIATED: 'TRANSFER_PENDING',
        DEACTIVATE: 'INACTIVE',
        TERMINATE: 'TERMINATION_PENDING',
      },
    },
    ON_LEAVE: {
      on: {
        LEAVE_RETURNED: 'ACTIVE',
        SUSPEND: 'ON_SUSPENSION',
        TERMINATE: 'TERMINATION_PENDING',
      },
    },
    ON_SUSPENSION: {
      on: {
        SUSPENSION_LIFTED: 'ACTIVE',
        TERMINATE: 'TERMINATION_PENDING',
      },
    },
    ABSENT: {
      on: {
        CHECK_IN: 'ACTIVE',
        TERMINATE: 'TERMINATION_PENDING',
        FLAG_AT_RISK: 'AT_RISK',
      },
    },
    AT_RISK: {
      on: {
        CLEAR_AT_RISK: 'ACTIVE',
        SUSPEND: 'ON_SUSPENSION',
        TERMINATE: 'TERMINATION_PENDING',
      },
    },
    BLOCKED: {
      on: {
        UNBLOCK: 'ACTIVE',
        TERMINATE: 'TERMINATION_PENDING',
      },
    },
    TRANSFER_PENDING: {
      on: {
        TRANSFER_COMPLETED: 'ACTIVE',
        TRANSFER_CANCELLED: 'ACTIVE',
      },
    },
    INACTIVE: {
      on: {
        REACTIVATE: 'ACTIVE',
        TERMINATE: 'TERMINATION_PENDING',
        ARCHIVE_THRESHOLD_REACHED: 'ARCHIVED',
      },
    },
    TERMINATION_PENDING: {
      on: {
        TERMINATION_FINALIZED: 'TERMINATED',
      },
    },
    TERMINATED: {
      on: {
        ARCHIVE_THRESHOLD_REACHED: 'ARCHIVED',
      },
    },
    ARCHIVED: {
      on: {
        ANONYMIZATION_REQUESTED: 'ANONYMIZED',
      },
    },
    ANONYMIZED: {
      type: 'final',
    },
  },
});

export type WorkerMachine = typeof workerMachine;
