/**
 * Outbox enqueue helper. Side-effects (Gupshup SMS, payroll recompute,
 * AI verification, etc.) are queued to `axhy.Outbox` from INSIDE the
 * same Prisma transaction as the domain write. A separate dispatcher
 * process (Phase B.6) drains the queue with retry + exponential backoff.
 *
 * The outbox pattern means: either the domain row + the side-effect
 * intent BOTH commit, or NEITHER does. No ghost rows, no fire-and-forget.
 *
 * Usage:
 *   await withTenantContext(prisma, companyId, async (tx) => {
 *     await tx.attendance.create({ data: { ... } });
 *     await recordAuditEvent(tx, { ... });
 *     await enqueueOutbox(tx, {
 *       companyId,
 *       topic: 'hr.worker_absent',
 *       payload: { workerId, supervisorId, date, payDeductPaise },
 *     });
 *   });
 *
 * Topic naming: `<consumer>.<action>` (lowercase, dotted). Examples:
 *   - hr.worker_absent          → notify HR via Gupshup
 *   - payroll.recompute         → adjust monthly tally
 *   - ai.verify                 → queue visit for AI photo verification
 *   - gupshup.send              → generic Gupshup outbound
 *
 * @derives(ADR-0009) — outbox over Redis until measured pain
 * @derives(master-plan §L) — cascade depth: NOT enforced (#35). No depth
 *   tracking exists; safe today only because no handler re-enqueues. See the
 *   note in dispatcher/index.ts before adding a re-enqueuing handler.
 * @derives(panel-2026-05-08) — phase B.1 foundation
 */

import type { Prisma } from '@prisma/client';

export type OutboxInput = {
  companyId: string;
  topic: string;
  payload?: Prisma.InputJsonValue;
};

export async function enqueueOutbox(
  tx: Prisma.TransactionClient,
  input: OutboxInput,
): Promise<void> {
  await tx.outbox.create({
    data: {
      companyId: input.companyId,
      topic: input.topic,
      payload: input.payload ?? {},
    },
  });
}
