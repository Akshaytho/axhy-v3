/**
 * AuditEvent payload Zod schemas for Layer 1-consumable kinds.
 *
 * One Zod schema per AuditEvent kind that has a real Layer 1 schema substrate
 * today (Policy table, Membership.podId column, HRPod table). Other §9 kinds
 * (HR_QUEUE_LOCK_*, HR_FALLBACK_INVOKED, HANDOFF_PACKAGE_GENERATED,
 * WORKER_SUPERVISOR_CHANGE_NOTIFIED, TERMINATION_NOTIFIED_TO_SUBJECT,
 * BOOTSTRAP_SEED_*, EMERGENCY_OVERRIDE_ACTIVATED, AI_BACKLOG_ESCALATED, all
 * BINDING_*) intentionally have no payload schema here; their schemas land
 * alongside the consumer code that emits them.
 *
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §9 — new AuditEvent kinds)
 */

import { z } from 'zod';

import { PolicyCategorySchema } from './policy.js';

/**
 * Payload for POLICY_CHANGED: captures the key/value/category being written +
 * a snapshot of the previous value (for audit-chain reconstruction).
 *
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §3.6 + §9)
 */
export const PolicyChangedPayloadSchema = z.object({
  key: z.string().min(1).max(200),
  category: PolicyCategorySchema,
  value: z.unknown(),
  previousValueSnapshot: z.unknown().nullable(),
});

/**
 * Inferred PolicyChangedPayload type.
 * @derives(ADR-0003)
 */
export type PolicyChangedPayload = z.infer<typeof PolicyChangedPayloadSchema>;

/**
 * Payload for MEMBERSHIP_POD_ASSIGNED: first-time pod assignment on a
 * Membership row that previously had podId = null.
 *
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §4 + Decision 1)
 */
export const MembershipPodAssignedPayloadSchema = z.object({
  membershipId: z.string().uuid(),
  userId: z.string().uuid(),
  podId: z.string().uuid(),
  assignedBy: z.string().uuid(),
});

/**
 * Inferred MembershipPodAssignedPayload type.
 * @derives(ADR-0003)
 */
export type MembershipPodAssignedPayload = z.infer<typeof MembershipPodAssignedPayloadSchema>;

/**
 * Payload for MEMBERSHIP_POD_REASSIGNED: pod change on a Membership row that
 * already had a podId. Both fromPodId and toPodId are recorded; toPodId is
 * always set (a reassign cannot null out the pod — for unassign emit a
 * different kind once one exists).
 *
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §4 + Decision 1)
 */
export const MembershipPodReassignedPayloadSchema = z.object({
  membershipId: z.string().uuid(),
  userId: z.string().uuid(),
  fromPodId: z.string().uuid(),
  toPodId: z.string().uuid(),
  reassignedBy: z.string().uuid(),
  reason: z.string().min(1).max(500).nullable(),
});

/**
 * Inferred MembershipPodReassignedPayload type.
 * @derives(ADR-0003)
 */
export type MembershipPodReassignedPayload = z.infer<typeof MembershipPodReassignedPayloadSchema>;
