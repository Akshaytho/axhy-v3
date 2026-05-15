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
  type BindingCreatedPayload,
  type BindingEndedManualPayload,
  type BindingEndedSupersededByPermanentPayload,
} from '@axhy/shared-schema';

import { recordAuditEvent } from './audit-event.js';

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
// Atomic three-step operation: (1) find the prior active permanent binding for
// the site, (2) set its endedAt + endedReason, (3) insert the new permanent
// binding. Emits BINDING_ENDED_SUPERSEDED_BY_PERMANENT on the old row +
// BINDING_CREATED on the new row, both inside the same transaction.
//
// Caller is responsible for opening the transaction (typically via
// withTenantContext). Throws if no prior active permanent binding exists for
// the site — use the raw create path for the first-ever binding.
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
  const prior = await tx.siteSupervisorBinding.findFirst({
    where: {
      companyId: input.companyId,
      siteId: input.siteId,
      actingForUserId: null,
      endedAt: null,
    },
    orderBy: { effectiveFrom: 'desc' },
  });

  if (!prior) {
    throw new Error(
      `reassignPermanentBinding: no active permanent binding found for site ${input.siteId}`,
    );
  }

  const endedAt = input.effectiveFrom;

  await tx.siteSupervisorBinding.update({
    where: { id: prior.id },
    data: {
      endedAt,
      endedReason: 'Superseded by permanent reassignment',
    },
  });

  const newRow = await tx.siteSupervisorBinding.create({
    data: {
      companyId: input.companyId,
      siteId: input.siteId,
      userId: input.newUserId,
      actingForUserId: null,
      effectiveFrom: input.effectiveFrom,
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
      endedAt: endedAt.toISOString(),
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
      effectiveFrom: input.effectiveFrom.toISOString(),
      effectiveUntil: input.effectiveUntil?.toISOString() ?? null,
      reason: input.reason,
      createdBy: input.reassignedBy,
    },
  });

  return { endedBindingId: prior.id, newBindingId: newRow.id };
}
