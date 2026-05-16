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
import { BindingKindSchema } from './site-supervisor-binding.js';

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

// ============================================================================
// P1.5 SiteSupervisorBinding kinds — supervisor responsibility model §5.8 + §7
// ============================================================================

/**
 * Payload for BINDING_CREATED: emitted on every new binding (acting or
 * permanent). The `kind` field is the derived discriminator (mirrors the
 * DB-side CASE), kept on the audit row so historical inspection doesn't
 * need to JOIN against the binding row (which may have been cascade-deleted).
 *
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §9)
 * @derives(supervisor-responsibility-model §7 + §5.8)
 */
export const BindingCreatedPayloadSchema = z.object({
  bindingId: z.string().uuid(),
  siteId: z.string().uuid(),
  userId: z.string().uuid(),
  actingForUserId: z.string().uuid().nullable(),
  kind: BindingKindSchema,
  effectiveFrom: z.string().datetime(),
  effectiveUntil: z.string().datetime().nullable(),
  reason: z.string().min(1).max(1000),
  createdBy: z.string().uuid(),
});

/**
 * Inferred BindingCreatedPayload type.
 * @derives(ADR-0003)
 */
export type BindingCreatedPayload = z.infer<typeof BindingCreatedPayloadSchema>;

/**
 * Payload for BINDING_ENDED_MANUAL: HR manually ends a binding early via
 * setting `endedAt`. Distinct from a planned end via `effectiveUntil`.
 *
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §9)
 */
export const BindingEndedManualPayloadSchema = z.object({
  bindingId: z.string().uuid(),
  siteId: z.string().uuid(),
  userId: z.string().uuid(),
  endedAt: z.string().datetime(),
  endedReason: z.string().min(1).max(1000),
  endedBy: z.string().uuid(),
});

/**
 * Inferred BindingEndedManualPayload type.
 * @derives(ADR-0003)
 */
export type BindingEndedManualPayload = z.infer<typeof BindingEndedManualPayloadSchema>;

/**
 * Payload for BINDING_ENDED_AUTO: emitted by the `binding-expire-sweep`
 * cron when a binding's `effectiveUntil` has passed and the row has not
 * yet been audit-emitted. SIDE EFFECT ONLY — responsibility switching
 * already happened at read-time via getEffectiveBinding's predicate
 * (`effectiveUntil > at`). The sweep does NOT mutate the binding row;
 * `endedAt` stays NULL so historical point-in-time queries continue to
 * return this binding as effective at instants `at < effectiveUntil`.
 *
 * `sweptAt` is when the sweep observed the expiry. `effectiveUntil` is
 * the binding's planned end (the moment responsibility actually switched
 * by read-time logic). These two instants differ by up to one sweep
 * interval (5 minutes per closure spec §10 line 560).
 *
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §9 + §10 2026-05-16 update)
 * @derives(F-003 scope artifact 2026-05-16)
 */
export const BindingEndedAutoPayloadSchema = z.object({
  bindingId: z.string().uuid(),
  siteId: z.string().uuid(),
  userId: z.string().uuid(),
  actingForUserId: z.string().uuid().nullable(),
  effectiveFrom: z.string().datetime(),
  effectiveUntil: z.string().datetime(),
  sweptAt: z.string().datetime(),
});

/**
 * Inferred BindingEndedAutoPayload type.
 * @derives(ADR-0003)
 */
export type BindingEndedAutoPayload = z.infer<typeof BindingEndedAutoPayloadSchema>;

/**
 * Payload for BINDING_ENDED_SUPERSEDED_BY_PERMANENT: emitted on the OLD
 * permanent binding row when a new permanent binding for the same site
 * replaces it (e.g., HR reassigns the portfolio). Carries the new binding's
 * id so the audit chain can be reconstructed in either direction.
 *
 * `supersededAt` is the cutover instant — the moment the new binding becomes
 * effective and the old binding stops being effective. Mechanically this
 * equals the old row's new `effectiveUntil` AND the new row's
 * `effectiveFrom`. It is NOT the old row's `endedAt` — supersession via
 * permanent reassignment uses `effectiveUntil` to bound the planned end;
 * `endedAt` is reserved for manual early termination / correction.
 *
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §9)
 * @derives(supervisor-responsibility-model §5.8 precedence)
 */
export const BindingEndedSupersededByPermanentPayloadSchema = z.object({
  bindingId: z.string().uuid(),
  siteId: z.string().uuid(),
  previousUserId: z.string().uuid(),
  newBindingId: z.string().uuid(),
  newUserId: z.string().uuid(),
  supersededAt: z.string().datetime(),
  reassignedBy: z.string().uuid(),
  reason: z.string().min(1).max(1000),
});

/**
 * Inferred BindingEndedSupersededByPermanentPayload type.
 * @derives(ADR-0003)
 */
export type BindingEndedSupersededByPermanentPayload = z.infer<
  typeof BindingEndedSupersededByPermanentPayloadSchema
>;

// ============================================================================
// F-004 HANDOFF_PACKAGE_GENERATED + LIVING_DOC_RULE_ADDED (handover-copy variant)
// @derives(F-004 scope round-4 v4)
// @derives(workflow-design-closure §3.7 — amended 2026-05-16 for schemaVersion)
// ============================================================================

/**
 * Payload for HANDOFF_PACKAGE_GENERATED: emitted exactly once per binding-create
 * (acting OR permanent OR reassignment-supersession). Carries the binding id +
 * compose-time metadata so historical inspection doesn't need to JOIN against
 * the binding row (which may have been cascade-deleted) or parse the JSON blob.
 *
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §9 + §3.7)
 * @derives(F-004 scope round-4 v4)
 */
export const HandoffPackageGeneratedPayloadSchema = z.object({
  bindingId: z.string().uuid(),
  siteId: z.string().uuid(),
  outgoingSupervisorId: z.string().uuid().nullable(),
  incomingSupervisorId: z.string().uuid(),
  schemaVersion: z.literal(1),
  generatedAt: z.string().datetime(),
  packageSizeBytes: z.number().int().nonnegative(),
  /** True iff this binding's permanent-rebind path also wrote N LIVING_DOC_RULE_ADDED. */
  livingDocCopyApplied: z.boolean(),
  /**
   * Total number of LivingDoc entries written by the handover side effects on
   * THIS binding's writer call:
   *   - On permanent rebind WITH outgoing supervisor: N copied site-scoped
   *     `siteRules` entries + 1 `freeNotes` summary entry. So the typical
   *     value here is `N + 1`, where N is the count of outgoing's matching
   *     site rules.
   *   - On first-ever binding (no outgoing supervisor, Q2 = (b) locked): 0.
   *   - On acting cover: 0.
   *
   * Was "number of L3 siteRule entries copied" in F-004 round 1; widened in
   * round 2 when the summary entry was restored per spec §3.7 "Surfaced to".
   */
  livingDocRulesCopied: z.number().int().nonnegative(),
});

/**
 * Inferred HandoffPackageGeneratedPayload type.
 * @derives(ADR-0003)
 */
export type HandoffPackageGeneratedPayload = z.infer<typeof HandoffPackageGeneratedPayloadSchema>;

/**
 * Payload for LIVING_DOC_RULE_ADDED emitted by F-004's mechanism-Z permanent-
 * rebind copy path. Same field set the existing chat.ts emit uses (per the
 * forward-compat untyped path at chat.ts:1273-1284), but typed here so the
 * F-004 writer can call a `recordLivingDocRuleAddedByHandover` helper for
 * compile-time payload safety.
 *
 * Two `section` variants are emitted by F-004's writer:
 *   - `site_rules`: emitted for each outgoing site-scoped siteRule copied
 *     into incoming's LivingDoc. `sourcePattern = "handover_from_<outgoingId>"`.
 *   - `free_notes`: emitted once for the handover-summary entry per binding.
 *     `sourcePattern = "handover_summary_<outgoingId>"`.
 *
 * Consumers can discriminate by `section` or by `sourcePattern` prefix
 * (`handover_from_*` vs `handover_summary_*`). Distinct from the chat-path
 * emit by the presence of `bindingId` + `sourcePattern`.
 *
 * @derives(ADR-0003)
 * @derives(F-004 scope round-4 v4 pick 8 mechanism Z)
 * @derives(F-004 round-2 review 2026-05-16 — free_notes section added)
 */
export const LivingDocRuleAddedByHandoverPayloadSchema = z.object({
  section: z.enum(['site_rules', 'free_notes']),
  visibility: z.enum(['COMPANY', 'SUPERVISOR_OWN']),
  ruleText: z.string().min(1),
  version: z.number().int().nonnegative(),
  bindingId: z.string().uuid(),
  /** "handover_from_<outgoingId>" for siteRules copies; "handover_summary_<outgoingId>" for the summary entry. */
  sourcePattern: z.string().min(1),
});

/**
 * Inferred LivingDocRuleAddedByHandoverPayload type.
 * @derives(ADR-0003)
 */
export type LivingDocRuleAddedByHandoverPayload = z.infer<
  typeof LivingDocRuleAddedByHandoverPayloadSchema
>;

// ============================================================================
// F-002 SupervisorDecision lifecycle kinds (DWI_PROPOSED / APPLIED / DISMISSED)
// AuditEvent.kind values are already catalogued in audit-event.ts.
// @derives(F-002 scope §3d)
// @derives(workflow-design-closure §3.2 — SupervisorDecision lifecycle)
// ============================================================================

/**
 * The kinds the chat extractor + apply path + dismiss endpoint produce on a
 * SupervisorDecision row. Mirrors the field on SupervisorDecision.kind itself.
 * Kept as a string here (not z.enum) to match the open taxonomy approach
 * already used elsewhere — the live AI extractor invents new kind values per
 * tool, and locking the enum here would block evolution.
 *
 * @derives(F-002 scope §3a)
 */
export const SupervisorDecisionKindSchema = z.string().min(1).max(64);

/**
 * Payload for DWI_PROPOSED: emitted at row creation by the chat extractor.
 * Carries enough context that the audit row is reconstructable without
 * JOIN-ing the SupervisorDecision row (the row itself can be edited via
 * apply / dismiss, but the audit event is immutable).
 *
 * @derives(ADR-0003)
 * @derives(F-002 scope §3a + §3d)
 */
export const DwiProposedPayloadSchema = z.object({
  decisionId: z.string().uuid(),
  kind: SupervisorDecisionKindSchema,
  tier: z.enum(['NOTE', 'OPERATIONAL', 'PERSONNEL', 'EMPLOYMENT']),
  targetId: z.string().nullable(),
  proposedDuringAbsence: z.boolean(),
  ackRequired: z.boolean(),
  /**
   * The chat thread / message that produced this proposal. Lets the audit
   * trail point back at the conversation context even if the SupervisorDecision
   * row is later dismissed + the originContext drops some fields.
   */
  sourceChatThreadId: z.string().uuid().nullable(),
  sourceChatMessageId: z.string().uuid().nullable(),
});

/**
 * @derives(ADR-0003)
 */
export type DwiProposedPayload = z.infer<typeof DwiProposedPayloadSchema>;

/**
 * Payload for DWI_APPLIED: emitted at the apply transition.
 * `appliedBy` is the currently-responsible supervisor user-id (per F-001 binding
 * routing) — may differ from the original `supervisorId` on the DWI row when
 * a binding switch has happened between propose-time and apply-time.
 *
 * @derives(ADR-0003)
 * @derives(F-002 scope §3b)
 */
export const DwiAppliedPayloadSchema = z.object({
  decisionId: z.string().uuid(),
  kind: SupervisorDecisionKindSchema,
  tier: z.enum(['NOTE', 'OPERATIONAL', 'PERSONNEL', 'EMPLOYMENT']),
  appliedAt: z.string().datetime(),
  appliedBy: z.string().uuid(),
  /**
   * The original supervisorId from the DWI row at propose-time. Kept so the
   * audit row records both ends of any binding-handoff that happened mid-flight.
   */
  originalSupervisorId: z.string().uuid(),
});

/**
 * @derives(ADR-0003)
 */
export type DwiAppliedPayload = z.infer<typeof DwiAppliedPayloadSchema>;

/**
 * Payload for DWI_DISMISSED: emitted when the responsible supervisor explicitly
 * rejects a PROPOSED decision via POST /decisions/:id/dismiss.
 *
 * @derives(ADR-0003)
 * @derives(F-002 scope §3c)
 */
export const DwiDismissedPayloadSchema = z.object({
  decisionId: z.string().uuid(),
  kind: SupervisorDecisionKindSchema,
  tier: z.enum(['NOTE', 'OPERATIONAL', 'PERSONNEL', 'EMPLOYMENT']),
  dismissedAt: z.string().datetime(),
  dismissedBy: z.string().uuid(),
  dismissedReason: z.string().min(1).max(2000),
  /**
   * The original supervisorId from the DWI row at propose-time. Same rationale
   * as DwiAppliedPayload.originalSupervisorId.
   */
  originalSupervisorId: z.string().uuid(),
});

/**
 * @derives(ADR-0003)
 */
export type DwiDismissedPayload = z.infer<typeof DwiDismissedPayloadSchema>;
