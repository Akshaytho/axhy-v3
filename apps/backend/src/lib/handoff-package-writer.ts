/**
 * F-004 — HandoffPackage writer.
 *
 * `writeHandoffPackage(tx, args)` handles the side effects of a binding-create:
 *
 *   - Always: emit exactly one `HANDOFF_PACKAGE_GENERATED` audit event for
 *     this binding (typed payload via `recordHandoffPackageGenerated`).
 *
 *   - Permanent rebind WITH an outgoing supervisor (mechanism Z, pick 8):
 *       - Copy outgoing's site-scoped L3 siteRules into incoming's
 *         `LivingDoc.siteRules` (preserving `scope.siteId`,
 *         `source.pattern = "handover_from_<outgoingId>"`).
 *       - Append ONE handover-summary entry to incoming's `LivingDoc.freeNotes`
 *         per closure spec §3.7 "Surfaced to": "Permanent rebind: prepended to
 *         incoming supervisor's LivingDoc as a 'handover from [outgoing] on
 *         [date]' entry." Source.pattern = "handover_summary_<outgoingId>".
 *         Idempotent ID via deriveSummaryEntryId(bindingId) so replay is no-op.
 *       - Emit N× `LIVING_DOC_RULE_ADDED` audits — N = number of copied
 *         siteRules + 1 (the summary entry).
 *
 *   - Acting cover:
 *       - NO LivingDoc writes (cover is temporary; merging muddles the
 *         acting cover's personal context). 1× HANDOFF_PACKAGE_GENERATED only.
 *
 *   - First-ever permanent binding (outgoingSupervisorId is null):
 *       - **Owner Q2 = (b) locked 2026-05-16:** NO LivingDoc writes at all
 *         (no outgoing rules to copy; no "handover from [outgoing]" because
 *         there is no outgoing — Q2=(b) explicitly drops the summary entry
 *         for the no-outgoing case). 1× HANDOFF_PACKAGE_GENERATED only.
 *
 * Friend's F-004 round-2 review (2026-05-16) caught that round-1 dropped the
 * summary entry on ALL permanent-rebind paths, not just first-ever. Q2=(b)
 * only governs the no-outgoing case. With an outgoing supervisor, the closure
 * spec §3.7 "Surfaced to" language explicitly requires the summary entry.
 *
 * Idempotency (Open Q4): copied rule IDs (siteRule copies) are deterministic
 * via deriveCopiedRuleId(bindingId, originalRuleId); the summary entry ID is
 * deterministic via deriveSummaryEntryId(bindingId). Replay of
 * `reassignPermanentBinding` produces the same IDs and the existing-ids guard
 * makes the write a no-op.
 *
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §3.7 + §9)
 * @derives(F-004 scope round-4 v4)
 * @derives(F-004 round-2 review 2026-05-16 — restore summary entry)
 */

import { randomUUID } from 'node:crypto';

import type { Prisma } from '@prisma/client';
import {
  LIVING_DOC_SECTION_TO_COLUMN,
  type HandoffPackagePayload,
  type LivingDocRule,
} from '@axhy/shared-schema';

import { recordAuditEvent } from './audit-event.js';
import { recordHandoffPackageGenerated } from './site-supervisor-binding.js';

/**
 * Writer input — binding row context + the composed payload + the binding
 * kind (PERMANENT triggers mechanism Z; ACTING does not).
 *
 * @derives(F-004 scope round-4 v4 §5 pick 8)
 */
export type WriteHandoffPackageInput = {
  bindingId: string;
  companyId: string;
  siteId: string;
  /** NULL on first-ever binding (Q2 = (b) locked: no LivingDoc writes). */
  outgoingSupervisorId: string | null;
  incomingSupervisorId: string;
  payload: HandoffPackagePayload;
  /** PERMANENT triggers mechanism Z; ACTING does NOT. */
  kind: 'PERMANENT' | 'ACTING';
  /** HR user (or SYSTEM constant) that triggered the binding create. */
  actorId: string;
};

/**
 * Hand-rolled deterministic ID derivation for copied LivingDocRule entries.
 *
 * Why not import `uuid` v5: the package isn't a current dependency, and
 * adding it for this single use is heavier than necessary. We derive a
 * stable UUID-v5-shaped string from a SHA-256 of `(bindingId, originalRuleId)`
 * with the same RFC-4122 v5 mask bits (version=5, variant=10). Result is
 * deterministic, collision-resistant for this scope, and parseable as a
 * regular UUID anywhere it's read.
 *
 * If a future slice introduces `uuid` v5 properly, swap this for it.
 */
function deriveCopiedRuleId(bindingId: string, originalRuleId: string): string {
  return uuidV5FromBytes(`${bindingId}:${originalRuleId}`);
}

/**
 * Deterministic UUID for the freeNotes summary entry on permanent rebind.
 * Keyed off the binding id alone (one summary per binding-create event).
 *
 * Why a separate function: the summary entry isn't a copy of any outgoing
 * rule — it's a synthesised entry. We use a different sentinel suffix so
 * the summary id can never collide with a copied-rule id derived from the
 * same binding id.
 */
function deriveSummaryEntryId(bindingId: string): string {
  return uuidV5FromBytes(`${bindingId}:summary`);
}

function uuidV5FromBytes(seed: string): string {
  const { createHash } = require('node:crypto') as typeof import('node:crypto');
  const hex = createHash('sha256').update(seed).digest('hex');
  // Take first 16 bytes (32 hex chars); apply RFC-4122 v5 bits.
  const bytes = Buffer.from(hex.slice(0, 32), 'hex');
  // version = 5: high nibble of byte 6
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  // variant = 10 (RFC 4122): high two bits of byte 8
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const h = bytes.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/**
 * Apply F-004 side effects:
 *
 *   - Permanent rebind WITH outgoing supervisor: N site-rule copies into
 *     incoming's `LivingDoc.siteRules` + 1 handover-summary entry into
 *     incoming's `LivingDoc.freeNotes` + (N+1)× `LIVING_DOC_RULE_ADDED`
 *     audits + 1× `HANDOFF_PACKAGE_GENERATED` audit.
 *   - First-ever permanent binding (no outgoing — Q2 = (b) locked):
 *     zero LivingDoc writes; 1× `HANDOFF_PACKAGE_GENERATED` audit only.
 *   - Acting cover: zero LivingDoc writes;
 *     1× `HANDOFF_PACKAGE_GENERATED` audit only.
 *
 * Caller is responsible for opening the tx.
 *
 * @derives(workflow-design-closure §3.7 Surfaced-to + §9)
 * @derives(F-004 scope round-4 v4 §5 pick 8)
 * @derives(F-004 round-2 review 2026-05-16 — summary entry restored on permanent rebind with outgoing)
 */
export async function writeHandoffPackage(
  tx: Prisma.TransactionClient,
  input: WriteHandoffPackageInput,
): Promise<void> {
  let livingDocRulesCopied = 0;
  let livingDocCopyApplied = false;

  // Mechanism Z permanent path WITH outgoing supervisor:
  //   - copy outgoing's site-scoped L3 siteRules into incoming's LivingDoc
  //   - append ONE handover-summary entry to incoming's LivingDoc.freeNotes
  //     per closure spec §3.7 "Surfaced to"
  //   - emit N× LIVING_DOC_RULE_ADDED audits (N = copied siteRules + 1 summary)
  //
  // First-ever permanent binding (outgoingSupervisorId === null) — Q2 = (b):
  //   - zero LivingDoc writes (no rules to copy AND no outgoing to name in
  //     a summary entry)
  //
  // Acting cover: zero LivingDoc writes either way (cover is temporary).
  if (input.kind === 'PERMANENT' && input.outgoingSupervisorId !== null) {
    const [siteScopedOutgoingRules, outgoingUser, site] = await Promise.all([
      readOutgoingSiteScopedRules(tx, input.companyId, input.outgoingSupervisorId, input.siteId),
      tx.user.findUnique({
        where: { id: input.outgoingSupervisorId },
        select: { name: true },
      }),
      tx.site.findUnique({
        where: { id: input.siteId },
        select: { name: true },
      }),
    ]);

    const incomingDoc = await tx.livingDoc.upsert({
      where: {
        companyId_supervisorId: {
          companyId: input.companyId,
          supervisorId: input.incomingSupervisorId,
        },
      },
      create: {
        companyId: input.companyId,
        supervisorId: input.incomingSupervisorId,
      },
      update: {},
    });

    const existingSiteRules = Array.isArray(incomingDoc.siteRules)
      ? (incomingDoc.siteRules as unknown as Array<Record<string, unknown>>)
      : [];
    const existingSiteRuleIds = new Set<string>(
      existingSiteRules
        .map((r) => (typeof r === 'object' && r !== null ? (r.id as unknown) : null))
        .filter((id): id is string => typeof id === 'string'),
    );

    const newRules: LivingDocRule[] = [];
    const sourcePattern = `handover_from_${input.outgoingSupervisorId}`;
    const summarySourcePattern = `handover_summary_${input.outgoingSupervisorId}`;
    const generatedAt = input.payload.generatedAt;

    for (const outRule of siteScopedOutgoingRules) {
      const copiedId = deriveCopiedRuleId(input.bindingId, outRule.id);
      if (existingSiteRuleIds.has(copiedId)) continue; // idempotent replay no-op
      const copy: LivingDocRule = {
        id: copiedId,
        ruleText: outRule.ruleText,
        description: outRule.description,
        visibility: outRule.visibility,
        scope: { siteId: input.siteId },
        createdAt: generatedAt,
        createdBy: 'supervisor', // Open Q1 default; provenance in source.pattern
        state: 'ACTIVE',
        source: { pattern: sourcePattern },
      };
      newRules.push(copy);
    }

    if (newRules.length > 0) {
      const column = LIVING_DOC_SECTION_TO_COLUMN['site_rules'];
      const updated = await tx.livingDoc.update({
        where: { id: incomingDoc.id },
        data: {
          [column]: [...existingSiteRules, ...newRules] as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
        select: { version: true },
      });

      for (const r of newRules) {
        await recordAuditEvent(tx, {
          companyId: input.companyId,
          kind: 'LIVING_DOC_RULE_ADDED',
          actorId: input.actorId,
          targetId: r.id,
          payload: {
            section: 'site_rules',
            visibility: r.visibility,
            ruleText: r.ruleText,
            version: updated.version,
            bindingId: input.bindingId,
            sourcePattern,
          },
        });
      }
      livingDocRulesCopied = newRules.length;
      livingDocCopyApplied = true;
    }

    // Always-on summary entry for permanent rebind WITH outgoing supervisor
    // (per closure spec §3.7 "Surfaced to" + F-004 scope pick 8 +
    // F-004 round-2 review 2026-05-16 fix to round-1's over-application of
    // Q2=(b)). Idempotent ID derived from bindingId; replay is no-op via
    // existing-ids guard.
    //
    // Refetch the doc here because the `incomingDoc` reference from the
    // upsert above is stale after the siteRules update (Prisma's upsert
    // with `update: {}` returns the pre-modification snapshot — the row
    // we just updated above is in fresh state only via re-read). This
    // matters for the idempotency check: replay must see the previously
    // written summary entry in `freeNotes`.
    const refreshed = await tx.livingDoc.findUniqueOrThrow({
      where: { id: incomingDoc.id },
      select: { freeNotes: true },
    });
    const existingFreeNotes = Array.isArray(refreshed.freeNotes)
      ? (refreshed.freeNotes as unknown as Array<Record<string, unknown>>)
      : [];
    const existingFreeNotesIds = new Set<string>(
      existingFreeNotes
        .map((r) => (typeof r === 'object' && r !== null ? (r.id as unknown) : null))
        .filter((id): id is string => typeof id === 'string'),
    );
    const summaryId = deriveSummaryEntryId(input.bindingId);
    if (!existingFreeNotesIds.has(summaryId)) {
      const outgoingName = outgoingUser?.name ?? 'previous supervisor';
      const siteName = site?.name ?? 'this site';
      const dateStr = generatedAt.slice(0, 10); // "YYYY-MM-DD"
      const summary: LivingDocRule = {
        id: summaryId,
        ruleText: `Handover from ${outgoingName} on ${dateStr} for ${siteName}`,
        description: `Permanent rebind: portfolio handoff from ${outgoingName} (${input.outgoingSupervisorId}) on ${dateStr} for site ${siteName} (${input.siteId}). See binding.handoffPackage and the copied site rules for context.`,
        visibility: 'SUPERVISOR_OWN',
        scope: { siteId: input.siteId },
        createdAt: generatedAt,
        createdBy: 'supervisor',
        state: 'ACTIVE',
        source: { pattern: summarySourcePattern },
      };

      const freeNotesColumn = LIVING_DOC_SECTION_TO_COLUMN['free_notes'];
      const updated = await tx.livingDoc.update({
        where: { id: incomingDoc.id },
        data: {
          [freeNotesColumn]: [...existingFreeNotes, summary] as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
        select: { version: true },
      });

      await recordAuditEvent(tx, {
        companyId: input.companyId,
        kind: 'LIVING_DOC_RULE_ADDED',
        actorId: input.actorId,
        targetId: summary.id,
        payload: {
          section: 'free_notes',
          visibility: summary.visibility,
          ruleText: summary.ruleText,
          version: updated.version,
          bindingId: input.bindingId,
          sourcePattern: summarySourcePattern,
        },
      });
      livingDocRulesCopied += 1;
      livingDocCopyApplied = true;
    }
  }

  // Always emit 1× HANDOFF_PACKAGE_GENERATED audit.
  await recordHandoffPackageGenerated(tx, {
    companyId: input.companyId,
    actorId: input.actorId,
    payload: {
      bindingId: input.bindingId,
      siteId: input.siteId,
      outgoingSupervisorId: input.outgoingSupervisorId,
      incomingSupervisorId: input.incomingSupervisorId,
      schemaVersion: input.payload.schemaVersion,
      generatedAt: input.payload.generatedAt,
      packageSizeBytes: input.payload.packageSizeBytes,
      livingDocCopyApplied,
      livingDocRulesCopied,
    },
  });
}

/**
 * Read outgoing supervisor's site-scoped, ACTIVE, COMPANY/SUPERVISOR_OWN
 * siteRule entries. Returns the full `LivingDocRule` shape so the writer can
 * copy `description`, `visibility`, and create a new ID per rule. Distinct
 * from the composer's projection-to-`ruleText`-only read because the writer
 * needs more fields.
 */
async function readOutgoingSiteScopedRules(
  tx: Prisma.TransactionClient,
  companyId: string,
  outgoingSupervisorId: string,
  siteId: string,
): Promise<LivingDocRule[]> {
  const doc = await tx.livingDoc.findUnique({
    where: {
      companyId_supervisorId: { companyId, supervisorId: outgoingSupervisorId },
    },
    select: { siteRules: true },
  });
  if (!doc) return [];
  const raw = Array.isArray(doc.siteRules)
    ? (doc.siteRules as unknown as Array<Record<string, unknown>>)
    : [];
  const out: LivingDocRule[] = [];
  for (const r of raw) {
    if (typeof r !== 'object' || r === null) continue;
    if (r.state !== 'ACTIVE') continue;
    const visibility = r.visibility;
    if (visibility !== 'COMPANY' && visibility !== 'SUPERVISOR_OWN') continue;
    const scope = (r.scope ?? {}) as Record<string, unknown>;
    if (scope.siteId !== siteId) continue;
    const ruleText = r.ruleText;
    if (typeof ruleText !== 'string' || ruleText.length === 0) continue;
    const description = r.description;
    if (typeof description !== 'string' || description.length === 0) continue;
    const id = r.id;
    if (typeof id !== 'string') continue;
    out.push({
      id,
      ruleText,
      description,
      visibility,
      scope: { siteId },
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString(),
      createdBy:
        r.createdBy === 'ai_inferred' || r.createdBy === 'supervisor' ? r.createdBy : 'supervisor',
      state: 'ACTIVE',
      source:
        typeof r.source === 'object' && r.source !== null
          ? (r.source as LivingDocRule['source'])
          : {},
    });
  }
  return out;
}

/**
 * Exposed for testing the deterministic rule-id derivation.
 *
 * @derives(F-004 scope round-4 v4 Open Q4)
 */
export const __test__ = { deriveCopiedRuleId };
// Silence unused import warning for `randomUUID` — kept for future use if we
// switch to non-deterministic copies on certain edge cases.
void randomUUID;
