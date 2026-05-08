/**
 * Audit-event write helper. Every supervisor / HR / owner action that
 * mutates state writes one immutable row to `axhy.AuditEvent` from
 * INSIDE the same Prisma transaction as the domain write. This is the
 * system-of-record per data-flow §4.
 *
 * Usage:
 *   await withTenantContext(prisma, companyId, async (tx) => {
 *     await tx.attendance.create({ data: { ... } });
 *     await recordAuditEvent(tx, {
 *       companyId,
 *       kind: 'WORKER_MARKED_ABSENT',
 *       actorId: req.auth.userId,
 *       targetId: workerId,
 *       payload: { date, reason, payDeductPaise },
 *     });
 *     // ...also enqueueOutbox(tx, { ... }) for side effects
 *   });
 *
 * @derives(master-plan §L) — bug-prevention discipline (every transition auditable)
 * @derives(panel-2026-05-08) — phase B.1 foundation
 */

import type { Prisma } from '@prisma/client';

export type AuditEventInput = {
  companyId: string;
  kind: string;
  actorId: string;
  targetId?: string | null;
  payload?: Prisma.InputJsonValue;
};

export async function recordAuditEvent(
  tx: Prisma.TransactionClient,
  input: AuditEventInput,
): Promise<void> {
  await tx.auditEvent.create({
    data: {
      companyId: input.companyId,
      kind: input.kind,
      actorId: input.actorId,
      targetId: input.targetId ?? null,
      payload: input.payload ?? {},
    },
  });
}
