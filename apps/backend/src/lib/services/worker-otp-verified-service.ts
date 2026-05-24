/**
 * Worker-OTP-verified service — tx-callable domain function that advances
 * a Worker from `PENDING_ACTIVATION` to `DOC_PENDING` via the OTP_VERIFIED
 * event on the `workerMachine` (XState v5).
 *
 * This is the FIRST production wiring of `workerMachine` from a backend
 * route per master-plan §G + F-006b 2026-05-21. Before this slice, the
 * auth route skipped the machine transition entirely (inherited gap).
 *
 * Discipline (from `.claude/rules/state-machines.md`):
 *   - Read worker state via tx.
 *   - Pass current state + event to `workerMachine.transition` to compute
 *     the legal next state. Never hardcode the next value.
 *   - Persist the machine-returned next state.
 *   - Write AuditEvent + Outbox row inside the same tx.
 *
 * @derives(master-plan §G)
 * @derives(F-006b 2026-05-21 worker-shell relaxation — backend half)
 */

import type { Prisma } from '@prisma/client';
import { createActor, workerMachine } from '@axhy/state-machines';

import { recordAuditEvent } from '../audit-event.js';
import { enqueueOutbox } from '../outbox.js';

export type WorkerOtpVerifiedInput = {
  workerId: string;
  companyId: string;
  /** The User.id that just verified OTP (audit actorId). */
  userId: string;
};

export type WorkerOtpVerifiedResult =
  | {
      kind: 'TRANSITIONED';
      previousState: 'PENDING_ACTIVATION';
      nextState: 'DOC_PENDING';
    }
  | {
      kind: 'NO_TRANSITION';
      reason: 'NOT_PENDING_ACTIVATION';
      currentState: string;
    }
  | { kind: 'WORKER_NOT_FOUND' };

/**
 * Advance Worker via OTP_VERIFIED if (and only if) Worker is currently in
 * PENDING_ACTIVATION. Idempotent: re-calling for a worker in any other
 * state returns NO_TRANSITION without side effects.
 *
 * @derives(F-006b 2026-05-21 — first machine-driven worker transition)
 */
export async function workerOtpVerifiedService(
  tx: Prisma.TransactionClient,
  input: WorkerOtpVerifiedInput,
): Promise<WorkerOtpVerifiedResult> {
  return workerOtpVerifiedServiceImpl(tx, input);
}

async function workerOtpVerifiedServiceImpl(
  tx: Prisma.TransactionClient,
  input: WorkerOtpVerifiedInput,
): Promise<WorkerOtpVerifiedResult> {
  const worker = await tx.worker.findFirst({
    where: { id: input.workerId, companyId: input.companyId },
  });
  if (!worker) return { kind: 'WORKER_NOT_FOUND' };

  if (worker.state !== 'PENDING_ACTIVATION') {
    return {
      kind: 'NO_TRANSITION',
      reason: 'NOT_PENDING_ACTIVATION',
      currentState: worker.state,
    };
  }

  // Restore the actor at the current persisted state and replay OTP_VERIFIED.
  // This is the public xstate v5 surface for stateless transitions: actor.send
  // computes the next snapshot using the machine's guards. We never hardcode
  // the next state; the machine returns it.
  const actor = createActor(workerMachine, {
    input: { workerId: worker.id, companyId: worker.companyId },
    snapshot: workerMachine.resolveState({
      value: 'PENDING_ACTIVATION',
      context: {
        workerId: worker.id,
        companyId: worker.companyId,
        daysIdle: 0,
        flags: [],
      },
    }),
  });
  actor.start();
  actor.send({ type: 'OTP_VERIFIED' });
  const nextValue = actor.getSnapshot().value;
  actor.stop();

  // Defensive: if the machine rejected the transition (no change), don't write.
  if (nextValue === 'PENDING_ACTIVATION' || typeof nextValue !== 'string') {
    return {
      kind: 'NO_TRANSITION',
      reason: 'NOT_PENDING_ACTIVATION',
      currentState: worker.state,
    };
  }

  await tx.worker.update({
    where: { id: worker.id },
    data: { state: nextValue },
  });

  await recordAuditEvent(tx, {
    companyId: input.companyId,
    kind: 'WORKER_OTP_VERIFIED',
    actorId: input.userId,
    targetId: worker.id,
    payload: { previousState: 'PENDING_ACTIVATION', nextState: nextValue },
  });

  await enqueueOutbox(tx, {
    companyId: input.companyId,
    topic: 'worker.activated',
    payload: { workerId: worker.id, userId: input.userId },
  });

  return {
    kind: 'TRANSITIONED',
    previousState: 'PENDING_ACTIVATION',
    nextState: 'DOC_PENDING',
  };
}
