/**
 * F-004 — HandoffPackage writer.
 *
 * `writeHandoffPackage(tx, args)` handles the side effects of a binding-create:
 *
 *   - Always: emit exactly one `HANDOFF_PACKAGE_GENERATED` audit event for
 *     this binding (typed payload via `recordHandoffPackageGenerated`).
 *
 *   - Permanent rebind with outgoing supervisor (mechanism Z, pick 8):
 *       - Copy outgoing's site-scoped L3 siteRules into incoming's
 *         `LivingDoc.siteRules` (preserving `scope.siteId`,
 *         `source.pattern = "handover_from_<outgoingId>"`).
 *       - Emit N× `LIVING_DOC_RULE_ADDED` audits (one per copied rule).
 *       - **Owner Q2 = (b) locked 2026-05-16:** NO `freeNotes` summary
 *         entry on any path. Chronology is preserved by `generatedAt` +
 *         `outgoingSupervisorId` on the package itself.
 *
 *   - Acting cover:
 *       - NO LivingDoc writes (cover is temporary; merging muddles the
 *         acting cover's personal context).
 *
 *   - First-ever permanent binding (outgoingSupervisorId is null):
 *       - NO LivingDoc writes (no outgoing rules to copy; Q2 = (b)
 *         drops the summary entry).
 *
 * Idempotency (Open Q4): copied rule IDs are deterministic via uuid-v5
 * from `(bindingId, originalRuleId)` so a replay of `reassignPermanentBinding`
 * produces the same rule IDs and the existence check in the upsert path
 * skips duplicates.
 *
 * @derives(ADR-0003)
 * @derives(workflow-design-closure §3.7 + §9)
 * @derives(F-004 scope round-4 v4)
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
  const { createHash } = require('node:crypto') as typeof import('node:crypto');
  const hex = createHash('sha256').update(`${bindingId}:${originalRuleId}`).digest('hex');
  // Take first 16 bytes (32 hex chars); apply v5 bits.
  const bytes = Buffer.from(hex.slice(0, 32), 'hex');
  // version = 5: high nibble of byte 6
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  // variant = 10 (RFC 4122): high two bits of byte 8
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const h = bytes.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/**
 * Apply F-004 side effects: mechanism Z permanent-rebind LivingDoc copy
 * (N rules + N audits) + 1× HANDOFF_PACKAGE_GENERATED audit. Q2 = (b) locked:
 * no `freeNotes` summary entry. Caller is responsible for opening the tx.
 *
 * @derives(workflow-design-closure §3.7 Surfaced-to + §9)
 * @derives(F-004 scope round-4 v4 §5 pick 8)
 */
export async function writeHandoffPackage(
  tx: Prisma.TransactionClient,
  input: WriteHandoffPackageInput,
): Promise<void> {
  let livingDocRulesCopied = 0;
  let livingDocCopyApplied = false;

  // Mechanism Z permanent path: only when kind=PERMANENT AND outgoing exists.
  // Q2 = (b) ensures no freeNotes summary entry is written; only siteRule
  // copies. On first-ever permanent binding (outgoingSupervisorId === null),
  // skip entirely.
  if (input.kind === 'PERMANENT' && input.outgoingSupervisorId !== null) {
    const siteScopedOutgoingRules = await readOutgoingSiteScopedRules(
      tx,
      input.companyId,
      input.outgoingSupervisorId,
      input.siteId,
    );

    if (siteScopedOutgoingRules.length > 0) {
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

      const existing = Array.isArray(incomingDoc.siteRules)
        ? (incomingDoc.siteRules as unknown as Array<Record<string, unknown>>)
        : [];
      const existingIds = new Set<string>(
        existing
          .map((r) => (typeof r === 'object' && r !== null ? (r.id as unknown) : null))
          .filter((id): id is string => typeof id === 'string'),
      );

      const newRules: LivingDocRule[] = [];
      const sourcePattern = `handover_from_${input.outgoingSupervisorId}`;
      const generatedAt = input.payload.generatedAt;

      for (const outRule of siteScopedOutgoingRules) {
        const copiedId = deriveCopiedRuleId(input.bindingId, outRule.id);
        if (existingIds.has(copiedId)) continue; // idempotent replay no-op
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
            [column]: [...existing, ...newRules] as Prisma.InputJsonValue,
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
