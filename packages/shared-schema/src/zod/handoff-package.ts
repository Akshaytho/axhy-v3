/**
 * @axhy/shared-schema/zod/handoff-package — HandoffPackage payload shape.
 *
 * Frozen-on-write JSON snapshot stored on `SiteSupervisorBinding.handoffPackage`.
 * Composed synchronously at binding-create time (F-004 composer) and read-only
 * thereafter (closure spec §3.7 invariant).
 *
 * Field count: 9 (post-amendment 2026-05-16 — `schemaVersion` added per
 * F-004 round-4 v3 panel finding: Maya Krishnan + Eric Chen flagged that an
 * immutable, frozen-on-write package with no version tag would force every
 * future consumer to field-sniff. Owner picked option γ: amend spec first,
 * then add field). `schemaVersion` is placed FIRST in the JSON; consumers
 * MUST inspect it before parsing other fields and fail closed on unknown
 * versions per closure spec §3.7 Invariants.
 *
 * Q2 = (b) locked 2026-05-16: on first-ever binding (no outgoing supervisor),
 * `outgoingSupervisorId: null`, `siteRules: []`. Other arrays may still be
 * non-empty depending on pre-binding site history. No handover-summary entry
 * is written; chronology is preserved by `generatedAt` + `outgoingSupervisorId`.
 *
 * Q5 — `kind` field in ComplaintSummary uses interim default `"site_complaint"`
 * until a dedicated `Complaint.kind` schema column lands (genuine schema gap;
 * Complaint model has no `kind` column today).
 *
 * Material #2 = β locked 2026-05-16: `LivingDoc.clientPreferences` is NOT
 * transferred in F-004; queued as F-010 handoff v2. See closure spec §3.7
 * Invariants for the interim "record as site rules" guidance.
 *
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §3.7 — amended 2026-05-16 for schemaVersion)
 * @derives(F-004 scope round-4 v4)
 */

import { z } from 'zod';

/**
 * Current payload schema version. Locked at 1 for F-004. Incremented on any
 * future shape change. Consumers MUST inspect this field first and either:
 *   - fail closed on any value they don't recognise, OR
 *   - downgrade-parse if they explicitly support the older shape.
 *
 * @derives(workflow-design-closure §3.7 Invariants — schemaVersion contract)
 */
export const HANDOFF_PACKAGE_SCHEMA_VERSION = 1 as const;

/**
 * Per-complaint summary inside `recentComplaints`. Spec §3.7 line 307 lists:
 * `{ id, kind, state, loggedAt, body }`.
 *
 * Mapping from `Complaint` rows (schema.prisma:598-623):
 *   - `id`        ← Complaint.id (direct)
 *   - `kind`      ← interim default `"site_complaint"` per Open Q5
 *   - `state`     ← derived: `resolvedAt === null ? 'open' : 'resolved'`
 *   - `loggedAt`  ← Complaint.createdAt (ISO datetime string)
 *   - `body`      ← Complaint.text (verbatim)
 *
 * `severity` is NOT included (not in spec's listed shape).
 *
 * @derives(workflow-design-closure §3.7 line 307)
 */
export const ComplaintSummarySchema = z.object({
  id: z.string().uuid(),
  kind: z.string().min(1),
  state: z.enum(['open', 'resolved']),
  loggedAt: z.string().datetime(),
  body: z.string(),
});
/** @derives(workflow-design-closure §3.7 line 307) */
export type ComplaintSummary = z.infer<typeof ComplaintSummarySchema>;

/**
 * Shift reference inside `WorkerSummary.primaryShifts`. Plain projection over
 * Assignment (state='ACTIVE') for the worker on this site.
 *
 * @derives(workflow-design-closure §3.7 line 308)
 */
export const ShiftRefSchema = z.object({
  assignmentId: z.string().uuid(),
  shiftStart: z.string(),
  shiftEnd: z.string(),
  dayMask: z.string(),
  validFrom: z.string(),
  validUntil: z.string().nullable(),
});
/** @derives(workflow-design-closure §3.7 line 308) */
export type ShiftRef = z.infer<typeof ShiftRefSchema>;

/**
 * Flag summary inside `WorkerSummary.recentFlags`. Last 30 days of
 * `Visit.state === 'FLAGGED'` for the worker on this site.
 *
 * @derives(workflow-design-closure §3.7 line 308)
 */
export const FlagSummarySchema = z.object({
  visitId: z.string().uuid(),
  scheduledFor: z.string().datetime(),
  flaggedAt: z.string().datetime().nullable(),
});
/** @derives(workflow-design-closure §3.7 line 308) */
export type FlagSummary = z.infer<typeof FlagSummarySchema>;

/**
 * Decision reference inside `WorkerSummary.recentDecisions`. Last 30 days of
 * `SupervisorDecision` targeting this workerId.
 *
 * @derives(workflow-design-closure §3.7 line 308)
 */
export const DecisionRefSchema = z.object({
  decisionId: z.string().uuid(),
  kind: z.string().min(1),
  tier: z.string().min(1),
  appliedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
/** @derives(workflow-design-closure §3.7 line 308) */
export type DecisionRef = z.infer<typeof DecisionRefSchema>;

/**
 * Per-worker summary inside `activeWorkers`. Spec §3.7 line 308 lists:
 * `{ workerId, name, primaryShifts, recentFlags, recentDecisions }`.
 *
 * @derives(workflow-design-closure §3.7 line 308)
 */
export const WorkerSummarySchema = z.object({
  workerId: z.string().uuid(),
  name: z.string(),
  primaryShifts: z.array(ShiftRefSchema),
  recentFlags: z.array(FlagSummarySchema),
  recentDecisions: z.array(DecisionRefSchema),
});
/** @derives(workflow-design-closure §3.7 line 308) */
export type WorkerSummary = z.infer<typeof WorkerSummarySchema>;

/**
 * `openItems` DECISION variant — SupervisorDecision rows still PROPOSED.
 *
 * @derives(workflow-design-closure §3.7 line 309)
 * @derives(F-004 scope pick 5)
 */
export const OpenItemDecisionSchema = z.object({
  kind: z.literal('DECISION'),
  decisionId: z.string().uuid(),
  kindLabel: z.string().min(1),
  tier: z.string().min(1),
  targetId: z.string().nullable(),
  proposedAt: z.string().datetime(),
  proposedBy: z.string().uuid(),
});
/** @derives(workflow-design-closure §3.7 line 309) */
export type OpenItemDecision = z.infer<typeof OpenItemDecisionSchema>;

/**
 * `openItems` CALENDAR_ENTRY variant — CalendarEntry rows passing the STRICT
 * filter (pick 6: `payload.siteId === thisSiteId` AND `supervisorId ===
 * outgoingSupervisorId`).
 *
 * @derives(workflow-design-closure §3.7 line 309)
 * @derives(F-004 scope pick 5 + pick 6)
 */
export const OpenItemCalendarEntrySchema = z.object({
  kind: z.literal('CALENDAR_ENTRY'),
  entryId: z.string().uuid(),
  entryKind: z.string().min(1),
  date: z.string(),
  payload: z.record(z.unknown()),
  notes: z.string().nullable(),
});
/** @derives(workflow-design-closure §3.7 line 309) */
export type OpenItemCalendarEntry = z.infer<typeof OpenItemCalendarEntrySchema>;

/**
 * `openItems` discriminated union — pick 5 of F-004 scope. One typed list,
 * 14-day forward window from `generatedAt`.
 *
 * @derives(workflow-design-closure §3.7 line 309)
 * @derives(F-004 scope pick 5)
 */
export const OpenItemSchema = z.discriminatedUnion('kind', [
  OpenItemDecisionSchema,
  OpenItemCalendarEntrySchema,
]);
/** @derives(workflow-design-closure §3.7 line 309) */
export type OpenItem = z.infer<typeof OpenItemSchema>;

/**
 * The canonical HandoffPackage payload — 9 fields per closure spec §3.7
 * post-amendment 2026-05-16. `schemaVersion` is FIRST in the JSON.
 *
 * Rejects payloads with schemaVersion !== 1, missing schemaVersion. NO
 * `siteId` on the top-level — the binding row carries siteId.
 *
 * @derives(workflow-design-closure §3.7 — amended 2026-05-16 for schemaVersion)
 * @derives(F-004 scope round-4 v4)
 */
export const HandoffPackagePayloadSchema = z.object({
  schemaVersion: z.literal(HANDOFF_PACKAGE_SCHEMA_VERSION),
  generatedAt: z.string().datetime(),
  outgoingSupervisorId: z.string().uuid().nullable(),
  incomingSupervisorId: z.string().uuid(),
  siteRules: z.array(z.string()),
  recentComplaints: z.array(ComplaintSummarySchema),
  activeWorkers: z.array(WorkerSummarySchema),
  openItems: z.array(OpenItemSchema),
  packageSizeBytes: z.number().int().nonnegative(),
});
/** @derives(workflow-design-closure §3.7 — amended 2026-05-16 for schemaVersion) */
export type HandoffPackagePayload = z.infer<typeof HandoffPackagePayloadSchema>;
