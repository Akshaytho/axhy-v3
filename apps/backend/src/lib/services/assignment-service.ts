/**
 * Assignment service — tx-callable domain function for creating Assignment rows.
 *
 * Extracted from `apps/backend/src/routes/assignments.ts` for F-002.b (round-2
 * R2b-iii). Pre-F-002.b, /chat/apply called the route via `app.inject` and
 * could not share a Prisma transaction with the outer caller. After this
 * extraction, /chat/apply calls `createAssignmentService` INSIDE its own
 * `withTenantContext`, so the lifecycle commit + domain write are atomic.
 *
 * The original POST /assignments route stays — it's now a thin wrapper that
 * calls this service inside `withTenantContext`. Public behaviour unchanged.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / responsibility model
 * Linked specs (not parsed by ESLint require-derives rule):
 *   - F-002.b — round-2 R2b-iii service extraction
 *   - production-grade-rulebook P3 + P8 — atomic workflow
 *   - Prisma docs: https://www.prisma.io/docs/orm/prisma-client/queries/transactions
 *     (interactive tx + tx-shareable functions; inject() cannot share a tx)
 */

import type { Assignment, Prisma } from '@prisma/client';

import { recordAuditEvent } from '../audit-event.js';

/** @derives(F-002.b — assignment service input) */
export type CreateAssignmentServiceInput = {
  workerId: string;
  siteId: string;
  dayMask: string;
  shiftStart: string;
  shiftEnd: string;
  /** ISO date string (YYYY-MM-DD). */
  validFrom: string;
  /** ISO date string or null for open-ended. */
  validUntil: string | null;
};

/** @derives(F-002.b) */
export type CreateAssignmentServiceAuth = {
  companyId: string;
  userId: string;
};

/** @derives(F-002.b) — discriminated-union result */
export type CreateAssignmentServiceResult =
  | { kind: 'OK'; assignment: Assignment }
  | { kind: 'WORKER_NOT_FOUND' }
  | { kind: 'SITE_NOT_FOUND' };

/**
 * Creates an Assignment row inside the caller's transaction. Verifies the
 * worker + site exist in the caller's tenant before writing. Emits
 * ASSIGNMENT_CREATED audit event in the same tx.
 *
 * Result shape: discriminated union via `kind`. Callers (route handler OR
 * /chat/apply) map the discriminant to HTTP / lifecycle outcomes — the
 * service does NOT throw on validation failures (those are domain-expected
 * outcomes, not errors).
 *
 * The original POST /assignments route normalises oneOffDate → recurring
 * BEFORE calling this service; the service takes the already-normalised
 * shape. This keeps the input-parsing concern in the route layer where it
 * naturally lives.
 *
 * @derives(F-002.b — service extraction)
 * @derives(production-grade-rulebook P3 — atomic workflow)
 */
export async function createAssignmentService(
  tx: Prisma.TransactionClient,
  input: CreateAssignmentServiceInput,
  auth: CreateAssignmentServiceAuth,
): Promise<CreateAssignmentServiceResult> {
  const worker = await tx.worker.findFirst({
    where: { id: input.workerId, companyId: auth.companyId },
  });
  if (!worker) return { kind: 'WORKER_NOT_FOUND' };

  const site = await tx.site.findFirst({
    where: { id: input.siteId, companyId: auth.companyId },
  });
  if (!site) return { kind: 'SITE_NOT_FOUND' };

  const assignment = await tx.assignment.create({
    data: {
      companyId: auth.companyId,
      workerId: input.workerId,
      siteId: input.siteId,
      shiftStart: input.shiftStart,
      shiftEnd: input.shiftEnd,
      dayMask: input.dayMask,
      validFrom: new Date(input.validFrom),
      validUntil: input.validUntil ? new Date(input.validUntil) : null,
      state: 'DRAFT',
    },
  });

  await recordAuditEvent(tx, {
    companyId: auth.companyId,
    kind: 'ASSIGNMENT_CREATED',
    actorId: auth.userId,
    targetId: assignment.id,
    payload: {
      workerId: input.workerId,
      workerName: worker.name,
      siteId: input.siteId,
      siteName: site.name,
      dayMask: input.dayMask,
    },
  });

  return { kind: 'OK', assignment };
}
