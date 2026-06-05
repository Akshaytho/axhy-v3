/**
 * Service for POST /admin/workers/:id/anonymize (R3).
 *
 * Anonymizes a worker on resignation. Spec said R3 "wraps existing
 * identity-lifecycle service"; verification during the wave-2-prep slice
 * (2026-05-25) showed no such service existed. This module IS the canonical
 * anonymize implementation.
 *
 * Effects (all in one transaction):
 *   1. User.phone replaced with `anon:<sha256 hex prefix>` (one-way)
 *   2. Membership(role=WORKER) status set to INACTIVE
 *   3. Worker.state set to TERMINATED, Worker.userId set to null
 *   4. AuditEvent kind=WORKER_ANONYMIZED with reason + actor + previousUserId
 *
 * @derives(ADR-0026)
 * @derives(docs/locked/hiring-hierarchy.md)
 */

import { createHash } from 'node:crypto';

import type { Prisma } from '@prisma/client';

import { recordAuditEvent } from '../audit-event.js';

/** @derives(ADR-0026) */
export type AnonymizeWorkerServiceInput = {
  workerId: string;
  callerCompanyId: string;
  callerUserId: string;
  reason: string;
  effectiveAt?: Date;
};

/** @derives(ADR-0026) */
export type AnonymizeWorkerServiceOutput =
  | { kind: 'OK'; workerId: string; anonymizedAt: Date }
  | { kind: 'WORKER_NOT_FOUND' }
  | { kind: 'WORKER_ALREADY_TERMINATED' }
  | { kind: 'WORKER_NOT_PENDING_TERMINATION' };

/**
 * Hash a phone to fit User.phone VarChar(16).
 *   "anon:" prefix (5) + 11 hex chars = 16 total.
 *   11 hex = 44 bits ≈ 17 trillion combinations — collision-safe for any
 *   real-world worker volume.
 */
function hashPhone(phone: string): string {
  const digest = createHash('sha256').update(phone).digest('hex');
  return `anon:${digest.slice(0, 11)}`;
}

/** @derives(ADR-0026) */
export async function anonymizeWorkerService(
  tx: Prisma.TransactionClient,
  input: AnonymizeWorkerServiceInput,
): Promise<AnonymizeWorkerServiceOutput> {
  const worker = await tx.worker.findFirst({
    where: { id: input.workerId, companyId: input.callerCompanyId },
  });
  if (!worker) return { kind: 'WORKER_NOT_FOUND' };
  if (worker.state === 'TERMINATED' || worker.state === 'ARCHIVED') {
    return { kind: 'WORKER_ALREADY_TERMINATED' };
  }
  // Two-step termination (founder 2026-06-05): HR FINALIZES a termination that
  // was already proposed (→ TERMINATION_PENDING), never terminates directly.
  // workerMachine reaches TERMINATED only via TERMINATION_PENDING (worker.ts).
  // Guard is before any mutation below, so a rejected call scrubs nothing.
  if (worker.state !== 'TERMINATION_PENDING') {
    return { kind: 'WORKER_NOT_PENDING_TERMINATION' };
  }

  const effectiveAt = input.effectiveAt ?? new Date();

  if (worker.userId) {
    const user = await tx.user.findUnique({ where: { id: worker.userId } });
    if (user && !user.phone.startsWith('anon:')) {
      await tx.user.update({
        where: { id: worker.userId },
        data: { phone: hashPhone(user.phone) },
      });
    }
    await tx.membership.updateMany({
      where: { userId: worker.userId, companyId: input.callerCompanyId, role: 'WORKER' },
      data: { status: 'INACTIVE' },
    });
  }

  await tx.worker.update({
    where: { id: worker.id },
    data: {
      state: 'TERMINATED',
      userId: null,
    },
  });

  await recordAuditEvent(tx, {
    companyId: input.callerCompanyId,
    kind: 'WORKER_ANONYMIZED',
    actorId: input.callerUserId,
    targetId: worker.id,
    payload: {
      workerId: worker.id,
      previousUserId: worker.userId,
      reason: input.reason,
      effectiveAt: effectiveAt.toISOString(),
    },
  });

  return { kind: 'OK', workerId: worker.id, anonymizedAt: effectiveAt };
}
