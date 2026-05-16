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
import {
  PolicyChangedPayloadSchema,
  MembershipPodAssignedPayloadSchema,
  MembershipPodReassignedPayloadSchema,
  DwiProposedPayloadSchema,
  DwiAppliedPayloadSchema,
  DwiDismissedPayloadSchema,
  type PolicyChangedPayload,
  type MembershipPodAssignedPayload,
  type MembershipPodReassignedPayload,
  type DwiProposedPayload,
  type DwiAppliedPayload,
  type DwiDismissedPayload,
} from '@axhy/shared-schema';

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
): Promise<{ id: string }> {
  const row = await tx.auditEvent.create({
    data: {
      companyId: input.companyId,
      kind: input.kind,
      actorId: input.actorId,
      targetId: input.targetId ?? null,
      payload: input.payload ?? {},
    },
    select: { id: true },
  });
  return { id: row.id };
}

/**
 * Typed audit-emit helpers for Layer 1-consumable AuditEvent kinds.
 *
 * Each helper validates its payload via Zod before insert (fails closed on
 * malformed input) and hardcodes the `kind` string so callers can't fat-finger
 * it. The catalogue of accepted kinds is defined by AuditEventKindSchema in
 * @axhy/shared-schema. Payload schemas live alongside it in audit-payloads.ts.
 *
 * Only 3 kinds have helpers here today because only those 3 have a real Layer
 * 1 schema substrate (Policy table, Membership.podId column + HRPod table).
 * Other §9 kinds get their helpers when their consumer code lands.
 *
 * @derives(workflow-design-closure §9 — new AuditEvent kinds)
 * @derives(panel-2026-05-15) — Layer 1 PR 2 audit-emit helpers
 */

export type RecordPolicyChangedInput = {
  companyId: string;
  actorId: string;
  policyId: string;
  payload: PolicyChangedPayload;
};

export async function recordPolicyChanged(
  tx: Prisma.TransactionClient,
  input: RecordPolicyChangedInput,
): Promise<void> {
  const payload = PolicyChangedPayloadSchema.parse(input.payload);
  await recordAuditEvent(tx, {
    companyId: input.companyId,
    kind: 'POLICY_CHANGED',
    actorId: input.actorId,
    targetId: input.policyId,
    payload: payload as Prisma.InputJsonValue,
  });
}

export type RecordMembershipPodAssignedInput = {
  companyId: string;
  actorId: string;
  payload: MembershipPodAssignedPayload;
};

export async function recordMembershipPodAssigned(
  tx: Prisma.TransactionClient,
  input: RecordMembershipPodAssignedInput,
): Promise<void> {
  const payload = MembershipPodAssignedPayloadSchema.parse(input.payload);
  await recordAuditEvent(tx, {
    companyId: input.companyId,
    kind: 'MEMBERSHIP_POD_ASSIGNED',
    actorId: input.actorId,
    targetId: payload.membershipId,
    payload: payload as Prisma.InputJsonValue,
  });
}

export type RecordMembershipPodReassignedInput = {
  companyId: string;
  actorId: string;
  payload: MembershipPodReassignedPayload;
};

export async function recordMembershipPodReassigned(
  tx: Prisma.TransactionClient,
  input: RecordMembershipPodReassignedInput,
): Promise<void> {
  const payload = MembershipPodReassignedPayloadSchema.parse(input.payload);
  await recordAuditEvent(tx, {
    companyId: input.companyId,
    kind: 'MEMBERSHIP_POD_REASSIGNED',
    actorId: input.actorId,
    targetId: payload.membershipId,
    payload: payload as Prisma.InputJsonValue,
  });
}

/**
 * F-002 SupervisorDecision lifecycle helpers — emit immutable audit rows on
 * every state transition (PROPOSED → APPLIED / DISMISSED). Kind catalogue is
 * already defined in audit-event.ts; payload schemas are in audit-payloads.ts.
 *
 * @derives(F-002 scope §3d)
 * @derives(workflow-design-closure §3.2 — SupervisorDecision lifecycle)
 */

export type RecordDwiProposedInput = {
  companyId: string;
  actorId: string;
  payload: DwiProposedPayload;
};

export async function recordDwiProposed(
  tx: Prisma.TransactionClient,
  input: RecordDwiProposedInput,
): Promise<void> {
  const payload = DwiProposedPayloadSchema.parse(input.payload);
  await recordAuditEvent(tx, {
    companyId: input.companyId,
    kind: 'DWI_PROPOSED',
    actorId: input.actorId,
    targetId: payload.decisionId,
    payload: payload as Prisma.InputJsonValue,
  });
}

export type RecordDwiAppliedInput = {
  companyId: string;
  actorId: string;
  payload: DwiAppliedPayload;
};

export async function recordDwiApplied(
  tx: Prisma.TransactionClient,
  input: RecordDwiAppliedInput,
): Promise<void> {
  const payload = DwiAppliedPayloadSchema.parse(input.payload);
  await recordAuditEvent(tx, {
    companyId: input.companyId,
    kind: 'DWI_APPLIED',
    actorId: input.actorId,
    targetId: payload.decisionId,
    payload: payload as Prisma.InputJsonValue,
  });
}

export type RecordDwiDismissedInput = {
  companyId: string;
  actorId: string;
  payload: DwiDismissedPayload;
};

export async function recordDwiDismissed(
  tx: Prisma.TransactionClient,
  input: RecordDwiDismissedInput,
): Promise<void> {
  const payload = DwiDismissedPayloadSchema.parse(input.payload);
  await recordAuditEvent(tx, {
    companyId: input.companyId,
    kind: 'DWI_DISMISSED',
    actorId: input.actorId,
    targetId: payload.decisionId,
    payload: payload as Prisma.InputJsonValue,
  });
}
