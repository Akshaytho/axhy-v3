/**
 * Worker visit lifecycle service — worker-owned IN_PROGRESS / PHOTOS_PENDING.
 *
 * The 12-state VisitState machine (packages/state-machines/src/visit.ts) models
 * CLOCK_IN: ON_SITE → IN_PROGRESS and CLOCK_OUT: IN_PROGRESS → PHOTOS_PENDING
 * as worker-driven events. Pre-arrival transitions (NOTIFY / WORKER_DEPART /
 * WORKER_ARRIVE) are system/supervisor events that may not have fired by the
 * time the worker actually begins the capture flow on the mobile client; the
 * canonical worker capture flow (qr-scan → before-photos → timer → after-photos
 * → review → submit) is the single ground truth that the worker is on-site and
 * working.
 *
 * Therefore `clockInVisit` accepts any pre-IN_PROGRESS active state
 * (SCHEDULED / NOTIFIED / EN_ROUTE / ON_SITE) and atomically advances to
 * IN_PROGRESS. Already-IN_PROGRESS is treated as idempotent (NOOP).
 *
 * `clockOutVisit` guards IN_PROGRESS → PHOTOS_PENDING; already-PHOTOS_PENDING
 * is idempotent so the mobile client can safely retry on transient failures.
 *
 * Timing fields are persisted on first state-changing call only.
 * `startedAt` is set on the first IN_PROGRESS transition and preserved on
 * retry (so the original work-start instant remains the source of truth);
 * `completedAt` is set on the first PHOTOS_PENDING transition with the same
 * preserve-on-retry semantics. If a state row arrives already in the target
 * state with a null timestamp (legacy backfill / supervisor side-channel
 * transition), the timestamp is filled in on the next idempotent call so
 * downstream queries that read these columns always see truth.
 *
 * Both writes are tenant-scoped (the caller resolves Worker.id from the JWT
 * userId + companyId) and refuse cross-worker writes.
 *
 * @derives(master-plan §G) — locked state machines
 * @derives(packages/state-machines/src/visit.ts)
 */

import type { Prisma } from '@prisma/client';

import { recordAuditEvent } from '../audit-event.js';

type ClockArgs = {
  workerId: string;
  visitId: string;
  companyId: string;
  /** JWT user id of the worker performing the transition (AuditEvent actor). */
  actorUserId: string;
};

const CLOCK_IN_LEGAL_FROM: ReadonlyArray<string> = ['SCHEDULED', 'NOTIFIED', 'EN_ROUTE', 'ON_SITE'];

/** @derives(master-plan §G) — clock-in result types */
export type ClockInResult =
  | { kind: 'OK'; visitId: string; visitState: 'IN_PROGRESS'; alreadyInProgress: boolean }
  | { kind: 'NOT_FOUND' }
  | { kind: 'WRONG_WORKER' }
  | { kind: 'WRONG_STATE'; currentState: string }
  /** Rule A — one active timer per worker. Another visit owned by this worker
   *  is already IN_PROGRESS, so we refuse to open a second timer. */
  | { kind: 'ACTIVE_TIMER_EXISTS'; activeVisitId: string };

/** @derives(master-plan §G) — clock-out result types */
export type ClockOutResult =
  | { kind: 'OK'; visitId: string; visitState: 'PHOTOS_PENDING'; alreadyPending: boolean }
  | { kind: 'NOT_FOUND' }
  | { kind: 'WRONG_WORKER' }
  | { kind: 'WRONG_STATE'; currentState: string };

/** @derives(master-plan §G) */
export async function clockInVisit(
  tx: Prisma.TransactionClient,
  args: ClockArgs,
): Promise<ClockInResult> {
  const { workerId, visitId, companyId, actorUserId } = args;
  const now = new Date();

  const visit = await tx.visit.findUnique({
    where: { id: visitId },
    select: { id: true, workerId: true, state: true, companyId: true, startedAt: true },
  });

  if (!visit || visit.companyId !== companyId) return { kind: 'NOT_FOUND' };
  if (visit.workerId !== workerId) return { kind: 'WRONG_WORKER' };

  if (visit.state === 'IN_PROGRESS') {
    if (!visit.startedAt) {
      await tx.visit.update({
        where: { id: visitId },
        data: { startedAt: now },
      });
    }
    return { kind: 'OK', visitId, visitState: 'IN_PROGRESS', alreadyInProgress: true };
  }
  if (!CLOCK_IN_LEGAL_FROM.includes(visit.state)) {
    return { kind: 'WRONG_STATE', currentState: visit.state };
  }

  // Rule A — one active timer per worker. Refuse to open a second IN_PROGRESS
  // visit while another is already running. The mobile client uses the
  // activeVisitId to route the worker back to the live timer.
  const activeOther = await tx.visit.findFirst({
    where: {
      workerId,
      companyId,
      state: 'IN_PROGRESS',
      NOT: { id: visitId },
    },
    select: { id: true },
  });
  if (activeOther) {
    return { kind: 'ACTIVE_TIMER_EXISTS', activeVisitId: activeOther.id };
  }

  await tx.visit.update({
    where: { id: visitId },
    data: {
      state: 'IN_PROGRESS',
      startedAt: visit.startedAt ?? now,
    },
  });

  // BUG-13 / D9: append-only audit on the real transition only (idempotent
  // already-IN_PROGRESS retries above do not reach here, so no duplicate rows).
  await recordAuditEvent(tx, {
    companyId,
    kind: 'VISIT_CLOCKED_IN',
    actorId: actorUserId,
    targetId: visitId,
    payload: { startedAt: (visit.startedAt ?? now).toISOString() },
  });

  return { kind: 'OK', visitId, visitState: 'IN_PROGRESS', alreadyInProgress: false };
}

/** @derives(master-plan §G) */
export async function clockOutVisit(
  tx: Prisma.TransactionClient,
  args: ClockArgs,
): Promise<ClockOutResult> {
  const { workerId, visitId, companyId, actorUserId } = args;
  const now = new Date();

  const visit = await tx.visit.findUnique({
    where: { id: visitId },
    select: { id: true, workerId: true, state: true, companyId: true, completedAt: true },
  });

  if (!visit || visit.companyId !== companyId) return { kind: 'NOT_FOUND' };
  if (visit.workerId !== workerId) return { kind: 'WRONG_WORKER' };

  if (visit.state === 'PHOTOS_PENDING') {
    if (!visit.completedAt) {
      await tx.visit.update({
        where: { id: visitId },
        data: { completedAt: now },
      });
    }
    return { kind: 'OK', visitId, visitState: 'PHOTOS_PENDING', alreadyPending: true };
  }
  if (visit.state !== 'IN_PROGRESS') {
    return { kind: 'WRONG_STATE', currentState: visit.state };
  }

  await tx.visit.update({
    where: { id: visitId },
    data: {
      state: 'PHOTOS_PENDING',
      completedAt: visit.completedAt ?? now,
    },
  });

  // BUG-13 / D9: append-only audit on the real transition only.
  await recordAuditEvent(tx, {
    companyId,
    kind: 'VISIT_CLOCKED_OUT',
    actorId: actorUserId,
    targetId: visitId,
    payload: { completedAt: (visit.completedAt ?? now).toISOString() },
  });

  return { kind: 'OK', visitId, visitState: 'PHOTOS_PENDING', alreadyPending: false };
}
