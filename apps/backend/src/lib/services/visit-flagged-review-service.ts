/**
 * visit-flagged-review-service — supervisor Resolve / Reject of an AI-flagged Visit.
 *
 * Wave 4 compliance flow (2026-05-18). Both writes are tx-callable so the
 * route handler can wrap them in `withTenantContext` + `withIdempotency` to
 * inherit the platform's standard guarantees:
 *   - cross-tenant isolation (RLS via tenant context)
 *   - retry-safe via Idempotency-Key header (handled at the route layer)
 *   - audit emitted INSIDE the same tx as the domain write (per data-flow §4)
 *
 * Resolve path (POST /visits/:id/resolve):
 *   Race-safe conditional UPDATE on flagged=true. Supervisor confirms the
 *   AI-flagged work is fine → Visit.state FLAGGED → VERIFIED + flagged=false
 *   (machine: FLAGGED → VERIFIED on SUPERVISOR_RESOLVED OK). VERIFIED is a
 *   billable terminal state. Emits VISIT_RESOLVED with the previousState
 *   snapshot for the audit chain.
 *
 * Reject path (POST /visits/:id/reject):
 *   Race-safe conditional UPDATE on flagged=true AND state='FLAGGED'.
 *   Supervisor rejects the work → Visit.state FLAGGED → REJECTED + flagged=false
 *   (REJECTED is a distinct, billable terminal state in the visit machine;
 *   worker pay deduction is a SEPARATE per-company payroll policy, never
 *   automatic — RCA-B 2026-06-04). Emits VISIT_REJECTED with previousState.
 *   Reason REQUIRED (RejectFlaggedVisitInput.supervisorReason min 1).
 *
 * Failure kinds the route maps:
 *   VISIT_NOT_FOUND      → 404 (also covers cross-tenant attempts; never reveals existence)
 *   VISIT_NOT_FLAGGED    → 409 (already resolved / rejected by another tap or never flagged)
 *   VISIT_STATE_INVALID  → 409 on reject only — visit not in a rejectable state
 *
 * @derives(2026-05-18-supervisor-30-day-real-life-simulation-v2.md §3 Wave 4)
 * @derives(feedback_production_grade_workflow_rules.md P3 + P8)
 * @derives(feedback_tests_must_prove_the_bug_existed.md)
 * @derives(master-plan §G) — supervisor surface
 */

import type { Prisma, Visit } from '@prisma/client';

import { recordAuditEvent } from '../audit-event.js';

/**
 * A flagged visit is ALWAYS in state 'FLAGGED' (set by the AI verify handler,
 * dispatcher/handlers/ai.ts, alongside flagged=true). Per the visit machine,
 * FLAGGED → VERIFIED (resolve/OK) or → REJECTED (reject) via SUPERVISOR_RESOLVED.
 * The old list ['IN_PROGRESS','COMPLETED','NEEDS_REVIEW'] was wrong — COMPLETED
 * and NEEDS_REVIEW are not machine states and never co-occur with a real flag,
 * so reject would 409 in production. RCA-B 2026-06-04.
 */
const REJECTABLE_VISIT_STATES = ['FLAGGED'] as const;

/** Result discriminator for the Resolve path. */
export type ResolveFlaggedVisitResult =
  | { kind: 'OK'; visit: Visit; previousState: string }
  | { kind: 'VISIT_NOT_FOUND' }
  | { kind: 'VISIT_NOT_FLAGGED' };

/** Result discriminator for the Reject path. */
export type RejectFlaggedVisitResult =
  | { kind: 'OK'; visit: Visit; previousState: string }
  | { kind: 'VISIT_NOT_FOUND' }
  | { kind: 'VISIT_NOT_FLAGGED' }
  | { kind: 'VISIT_STATE_INVALID'; currentState: string };

/** Input args common to both paths. */
export type FlaggedReviewAuth = {
  companyId: string;
  /** User.id of the supervisor making the call (composite-keyed with companyId). */
  supervisorUserId: string;
};

export type ResolveFlaggedVisitInput = FlaggedReviewAuth & {
  visitId: string;
  /**
   * Optional free-form reason. Already trimmed + length-validated by
   * `ResolveFlaggedVisitInput` Zod schema in @axhy/shared-schema; the service
   * stores `null` when absent so audit JSON is clean.
   */
  supervisorReason: string | null;
};

export type RejectFlaggedVisitInput = FlaggedReviewAuth & {
  visitId: string;
  /** Required free-form reason — enforced by RejectFlaggedVisitInput Zod schema (min 1). */
  supervisorReason: string;
};

/**
 * Resolve a flagged visit.
 *
 * Race-safe: relies on a conditional `updateMany` with `flagged: true` in
 * the where clause. If another tab / retry already flipped the flag, the
 * update affects 0 rows and we return VISIT_NOT_FLAGGED — the route maps
 * that to 409 ALREADY_DECIDED, the standard "another caller beat you to
 * it" envelope used across the codebase.
 *
 * @derives(production-grade-rulebook P3 — atomic transition, conditional UPDATE)
 */
export async function resolveFlaggedVisit(
  tx: Prisma.TransactionClient,
  input: ResolveFlaggedVisitInput,
): Promise<ResolveFlaggedVisitResult> {
  // Read first — we need the previousState snapshot for the audit payload
  // AND we need to distinguish "not found" from "not flagged" so the route
  // can return the right status (404 vs 409, not info-leaking).
  const existing = await tx.visit.findFirst({
    where: { id: input.visitId, companyId: input.companyId },
    select: { id: true, state: true, flagged: true, workerId: true, siteId: true },
  });
  if (!existing) return { kind: 'VISIT_NOT_FOUND' };
  if (!existing.flagged) return { kind: 'VISIT_NOT_FLAGGED' };

  const previousState = existing.state;

  // Supervisor confirms the AI-flagged work is fine → VERIFIED (machine:
  // FLAGGED → VERIFIED on SUPERVISOR_RESOLVED OK). VERIFIED is billable.
  const update = await tx.visit.updateMany({
    where: { id: input.visitId, companyId: input.companyId, flagged: true },
    data: { flagged: false, state: 'VERIFIED' },
  });
  if (update.count === 0) {
    // Lost a race to a concurrent caller — treat as ALREADY_DECIDED.
    return { kind: 'VISIT_NOT_FLAGGED' };
  }

  const updated = await tx.visit.findFirstOrThrow({
    where: { id: input.visitId, companyId: input.companyId },
  });

  const resolvedAt = new Date();
  await recordAuditEvent(tx, {
    companyId: input.companyId,
    kind: 'VISIT_RESOLVED',
    actorId: input.supervisorUserId,
    targetId: input.visitId,
    payload: {
      visitId: input.visitId,
      workerId: existing.workerId,
      siteId: existing.siteId,
      previousState,
      supervisorReason: input.supervisorReason,
      resolvedAt: resolvedAt.toISOString(),
      resolvedBy: input.supervisorUserId,
    },
  });

  return { kind: 'OK', visit: updated, previousState };
}

/**
 * Reject a flagged visit. State transitions to 'REJECTED'.
 *
 * Race-safe via conditional `updateMany` on `(flagged=true, state IN
 * REJECTABLE_VISIT_STATES)`. Distinct failure kinds returned so the route
 * can respond with precise error envelopes.
 *
 * @derives(production-grade-rulebook P3 + P5 — atomic transition + state guard)
 */
export async function rejectFlaggedVisit(
  tx: Prisma.TransactionClient,
  input: RejectFlaggedVisitInput,
): Promise<RejectFlaggedVisitResult> {
  const existing = await tx.visit.findFirst({
    where: { id: input.visitId, companyId: input.companyId },
    select: { id: true, state: true, flagged: true, workerId: true, siteId: true },
  });
  if (!existing) return { kind: 'VISIT_NOT_FOUND' };
  if (!existing.flagged) return { kind: 'VISIT_NOT_FLAGGED' };
  if (!(REJECTABLE_VISIT_STATES as readonly string[]).includes(existing.state)) {
    return { kind: 'VISIT_STATE_INVALID', currentState: existing.state };
  }

  const previousState = existing.state;

  const update = await tx.visit.updateMany({
    where: {
      id: input.visitId,
      companyId: input.companyId,
      flagged: true,
      state: { in: REJECTABLE_VISIT_STATES as unknown as string[] },
    },
    data: { flagged: false, state: 'REJECTED' },
  });
  if (update.count === 0) {
    // Race: someone else moved the row out of (flagged, REJECTABLE_STATES).
    // Re-read to give the route a precise error envelope.
    const fresh = await tx.visit.findFirstOrThrow({
      where: { id: input.visitId, companyId: input.companyId },
      select: { state: true, flagged: true },
    });
    if (!fresh.flagged) return { kind: 'VISIT_NOT_FLAGGED' };
    return { kind: 'VISIT_STATE_INVALID', currentState: fresh.state };
  }

  const updated = await tx.visit.findFirstOrThrow({
    where: { id: input.visitId, companyId: input.companyId },
  });

  const rejectedAt = new Date();
  await recordAuditEvent(tx, {
    companyId: input.companyId,
    kind: 'VISIT_REJECTED',
    actorId: input.supervisorUserId,
    targetId: input.visitId,
    payload: {
      visitId: input.visitId,
      workerId: existing.workerId,
      siteId: existing.siteId,
      previousState,
      supervisorReason: input.supervisorReason,
      rejectedAt: rejectedAt.toISOString(),
      rejectedBy: input.supervisorUserId,
    },
  });

  return { kind: 'OK', visit: updated, previousState };
}
