/**
 * SiteSupervisorBinding service layer.
 *
 * P1.5 narrow scope: only the helpers + service operations actually exercised
 * by this slice's tests. Routing/query rewires, HR portal UI, bootstrap-seed,
 * cron sweep, and HandoffPackage composer are NOT here — they land in later
 * slices.
 *
 * @derives(supervisor-responsibility-model §7 + §5.8)
 * @derives(workflow-design-closure §4 + §3.1 + §3.7)
 * @derives(panel-2026-05-15) — Layer 1 P1.5 helpers
 */

import type { Prisma } from '@prisma/client';
import {
  BindingCreatedPayloadSchema,
  BindingEndedManualPayloadSchema,
  BindingEndedSupersededByPermanentPayloadSchema,
  BindingEndedAutoPayloadSchema,
  type BindingCreatedPayload,
  type BindingEndedManualPayload,
  type BindingEndedSupersededByPermanentPayload,
  type BindingEndedAutoPayload,
} from '@axhy/shared-schema';

import { recordAuditEvent } from './audit-event.js';
import { assertNotChangingTodaysResponsibility } from './same-day-freeze.js';

// ---------------------------------------------------------------------------
// Typed audit-emit helpers — BINDING_* kinds
// ---------------------------------------------------------------------------

/** @derives(ADR-0003) — schema-derived; @derives(master-plan §L) — bug-prevention discipline */
export type RecordBindingCreatedInput = {
  companyId: string;
  actorId: string;
  payload: BindingCreatedPayload;
};

/** @derives(ADR-0003) — schema-derived; @derives(master-plan §L) — bug-prevention discipline */
export async function recordBindingCreated(
  tx: Prisma.TransactionClient,
  input: RecordBindingCreatedInput,
): Promise<void> {
  const payload = BindingCreatedPayloadSchema.parse(input.payload);
  await recordAuditEvent(tx, {
    companyId: input.companyId,
    kind: 'BINDING_CREATED',
    actorId: input.actorId,
    targetId: payload.bindingId,
    payload: payload as Prisma.InputJsonValue,
  });
}

/** @derives(ADR-0003) — schema-derived; @derives(master-plan §L) — bug-prevention discipline */
export type RecordBindingEndedManualInput = {
  companyId: string;
  actorId: string;
  payload: BindingEndedManualPayload;
};

/** @derives(ADR-0003) — schema-derived; @derives(master-plan §L) — bug-prevention discipline */
export async function recordBindingEndedManual(
  tx: Prisma.TransactionClient,
  input: RecordBindingEndedManualInput,
): Promise<void> {
  const payload = BindingEndedManualPayloadSchema.parse(input.payload);
  await recordAuditEvent(tx, {
    companyId: input.companyId,
    kind: 'BINDING_ENDED_MANUAL',
    actorId: input.actorId,
    targetId: payload.bindingId,
    payload: payload as Prisma.InputJsonValue,
  });
}

/**
 * Typed audit-emit helper for BINDING_ENDED_AUTO. Used by the F-003
 * `binding-expire-sweep` cron job. Validates payload via Zod before insert.
 *
 * @derives(ADR-0003) — schema-derived; @derives(master-plan §L) — bug-prevention discipline
 */
export type RecordBindingEndedAutoInput = {
  companyId: string;
  actorId: string;
  payload: BindingEndedAutoPayload;
};

/** @derives(ADR-0003) — schema-derived; @derives(master-plan §L) — bug-prevention discipline */
export async function recordBindingEndedAuto(
  tx: Prisma.TransactionClient,
  input: RecordBindingEndedAutoInput,
): Promise<void> {
  const payload = BindingEndedAutoPayloadSchema.parse(input.payload);
  await recordAuditEvent(tx, {
    companyId: input.companyId,
    kind: 'BINDING_ENDED_AUTO',
    actorId: input.actorId,
    targetId: payload.bindingId,
    payload: payload as Prisma.InputJsonValue,
  });
}

/** @derives(ADR-0003) — schema-derived; @derives(master-plan §L) — bug-prevention discipline */
export type RecordBindingEndedSupersededByPermanentInput = {
  companyId: string;
  actorId: string;
  payload: BindingEndedSupersededByPermanentPayload;
};

/** @derives(ADR-0003) — schema-derived; @derives(master-plan §L) — bug-prevention discipline */
export async function recordBindingEndedSupersededByPermanent(
  tx: Prisma.TransactionClient,
  input: RecordBindingEndedSupersededByPermanentInput,
): Promise<void> {
  const payload = BindingEndedSupersededByPermanentPayloadSchema.parse(input.payload);
  await recordAuditEvent(tx, {
    companyId: input.companyId,
    kind: 'BINDING_ENDED_SUPERSEDED_BY_PERMANENT',
    actorId: input.actorId,
    targetId: payload.bindingId,
    payload: payload as Prisma.InputJsonValue,
  });
}

// ---------------------------------------------------------------------------
// Service helper: reassignPermanentBinding
//
// Atomic three-step operation:
//   (1) find the permanent binding effective at the requested cutover instant
//       (effectiveFrom <= cutover < COALESCE(effectiveUntil, +infinity),
//        endedAt IS NULL, actingForUserId IS NULL);
//   (2) bound its planned end by setting effectiveUntil = cutover instant
//       (NOT endedAt — endedAt is reserved for manual early termination /
//       correction / actual after-the-fact ending; supersession via permanent
//       reassignment uses effectiveUntil so the old row stays "active" until
//       the cutover moment, supporting future-dated handoffs);
//   (3) insert the new permanent binding with effectiveFrom = cutover instant.
// Emits BINDING_ENDED_SUPERSEDED_BY_PERMANENT on the old row +
// BINDING_CREATED on the new row, both inside the same transaction.
//
// The old + new rows are temporally adjacent but disjoint thanks to the
// EXCLUDE constraint's half-open tstzrange ([effectiveFrom, effectiveUntil)
// with the new row's [cutover, ...) starting exactly where the old row ends).
//
// Caller is responsible for opening the transaction (typically via
// withTenantContext). Throws if no permanent binding is effective at the
// requested cutover instant for the site — use the raw create path for the
// first-ever binding or for a future binding before any predecessor exists.
// ---------------------------------------------------------------------------

/** @derives(ADR-0003) — schema-derived; @derives(master-plan §G) — HR control plane */
export type ReassignPermanentBindingInput = {
  companyId: string;
  siteId: string;
  newUserId: string;
  effectiveFrom: Date;
  effectiveUntil?: Date | null;
  reason: string;
  reassignedBy: string;
  /**
   * IANA timezone for the tenant. Defaults to {@link DEFAULT_TENANT_TIME_ZONE}
   * (Asia/Kolkata) inside {@link assertNotChangingTodaysResponsibility} until
   * Company.timeZone lands in the schema. Pass `null` ONLY in seed/migration
   * paths that bypass the S-001 freeze deliberately; HTTP routes must never
   * pass `null`.
   */
  tenantTimeZone?: string;
};

/** @derives(ADR-0003) — schema-derived; @derives(master-plan §G) — HR control plane */
export type ReassignPermanentBindingResult = {
  endedBindingId: string;
  newBindingId: string;
};

/** @derives(ADR-0003) — schema-derived; @derives(master-plan §G) — HR control plane */
export async function reassignPermanentBinding(
  tx: Prisma.TransactionClient,
  input: ReassignPermanentBindingInput,
): Promise<ReassignPermanentBindingResult> {
  const cutover = input.effectiveFrom;

  // S-001 same-day supervisor-freeze: the cutover instant is BOTH the new
  // binding's effectiveFrom AND the old binding's effectiveUntil. A single
  // check on `effectiveFrom` covers both sides because they are the same
  // moment. effectiveUntil on the new row (optional planned end) is naturally
  // >= effectiveFrom and therefore also after tomorrow-midnight, so does not
  // need a separate check here.
  assertNotChangingTodaysResponsibility({
    effectiveFrom: cutover,
    effectiveUntil: input.effectiveUntil ?? null,
    tenantTimeZone: input.tenantTimeZone,
  });

  const prior = await tx.siteSupervisorBinding.findFirst({
    where: {
      companyId: input.companyId,
      siteId: input.siteId,
      actingForUserId: null,
      endedAt: null,
      effectiveFrom: { lte: cutover },
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: cutover } }],
    },
    orderBy: { effectiveFrom: 'desc' },
  });

  if (!prior) {
    throw new Error(
      `reassignPermanentBinding: no permanent binding is effective at ${cutover.toISOString()} for site ${input.siteId}`,
    );
  }

  // Bound the old row's planned end at the cutover instant.
  // We do NOT touch endedAt — that field is reserved for manual early
  // termination / correction. The old row stays "active" (endedAt IS NULL)
  // until the cutover instant, when its effectiveUntil takes over.
  await tx.siteSupervisorBinding.update({
    where: { id: prior.id },
    data: { effectiveUntil: cutover },
  });

  const newRow = await tx.siteSupervisorBinding.create({
    data: {
      companyId: input.companyId,
      siteId: input.siteId,
      userId: input.newUserId,
      actingForUserId: null,
      effectiveFrom: cutover,
      effectiveUntil: input.effectiveUntil ?? null,
      reason: input.reason,
      createdBy: input.reassignedBy,
    },
  });

  await recordBindingEndedSupersededByPermanent(tx, {
    companyId: input.companyId,
    actorId: input.reassignedBy,
    payload: {
      bindingId: prior.id,
      siteId: input.siteId,
      previousUserId: prior.userId,
      newBindingId: newRow.id,
      newUserId: input.newUserId,
      supersededAt: cutover.toISOString(),
      reassignedBy: input.reassignedBy,
      reason: input.reason,
    },
  });

  await recordBindingCreated(tx, {
    companyId: input.companyId,
    actorId: input.reassignedBy,
    payload: {
      bindingId: newRow.id,
      siteId: input.siteId,
      userId: input.newUserId,
      actingForUserId: null,
      kind: 'PERMANENT',
      effectiveFrom: cutover.toISOString(),
      effectiveUntil: input.effectiveUntil?.toISOString() ?? null,
      reason: input.reason,
      createdBy: input.reassignedBy,
    },
  });

  return { endedBindingId: prior.id, newBindingId: newRow.id };
}
