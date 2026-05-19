/**
 * LivingDoc 100-active-rule cap with auto-EXPIRE.
 *
 * Per docs/locked/livingdoc-extraction-rules.md "Limits":
 *   - MAX 100 ACTIVE rules per LivingDoc.
 *   - When limit reached, oldest ACTIVE rules auto-EXPIRE.
 *   - Supervisor can manually EXPIRE rules they no longer need.
 *
 * "ACTIVE" is counted across ALL 5 sections (siteRules, workerNotes,
 * clientPreferences, recurringTasks, freeNotes). "Oldest" is by
 * `createdAt` field on the rule object (rules are JSON-shaped objects
 * inside the column arrays, not Prisma rows).
 *
 * This module is called BEFORE the new-rule append in chat.ts so the
 * cap is enforced atomically with the append (one tx).
 *
 * @derives(master-plan §G)
 * @derives(docs/locked/livingdoc-extraction-rules.md — Limits)
 * @derives(docs/locked/security-gaps-to-fix.md GAP 5)
 * @derives(plans/abstract-wandering-kazoo.md follow-on)
 */

import type { Prisma } from '@prisma/client';
import { LIVING_DOC_SECTION_TO_COLUMN } from '@axhy/shared-schema';

import { recordAuditEvent } from './audit-event.js';

/** Locked-spec cap. Not Policy-configurable — the locked doc treats this
 *  as a hard prompt-budget constraint. */
export const MAX_ACTIVE_RULES_PER_LIVING_DOC = 100;

/**
 * The 5 LivingDoc section column names — used to enumerate all rule
 * arrays when counting or expiring.
 */
const SECTION_COLUMNS = Object.values(LIVING_DOC_SECTION_TO_COLUMN) as ReadonlyArray<
  'siteRules' | 'workerNotes' | 'clientPreferences' | 'recurringTasks' | 'freeNotes'
>;

/** A single rule as stored in the LivingDoc JSON column. Shape mirrors
 *  the `LivingDocRule` zod schema in shared-schema. */
type LivingDocRuleShape = {
  id: string;
  ruleText: string;
  description: string;
  visibility: string;
  scope?: unknown;
  createdAt: string;
  createdBy: 'supervisor' | 'ai_inferred';
  state: 'PENDING' | 'ACTIVE' | 'REJECTED' | 'EXPIRED';
  source?: unknown;
  decidedAt?: string;
  confidence?: number;
};

export type LivingDocSectionsArrays = {
  siteRules: LivingDocRuleShape[];
  workerNotes: LivingDocRuleShape[];
  clientPreferences: LivingDocRuleShape[];
  recurringTasks: LivingDocRuleShape[];
  freeNotes: LivingDocRuleShape[];
};

/** Read all 5 section arrays from the LivingDoc row (already parsed by
 *  Prisma client). Defensively defaults to [] for any missing column. */
export function readSections(doc: {
  siteRules: unknown;
  workerNotes: unknown;
  clientPreferences: unknown;
  recurringTasks: unknown;
  freeNotes: unknown;
}): LivingDocSectionsArrays {
  return {
    siteRules: coerceArray(doc.siteRules),
    workerNotes: coerceArray(doc.workerNotes),
    clientPreferences: coerceArray(doc.clientPreferences),
    recurringTasks: coerceArray(doc.recurringTasks),
    freeNotes: coerceArray(doc.freeNotes),
  };
}

function coerceArray(raw: unknown): LivingDocRuleShape[] {
  return Array.isArray(raw) ? (raw as LivingDocRuleShape[]) : [];
}

export type EnforcedExpiry = {
  /** Rule that was auto-EXPIRED to make room. */
  ruleId: string;
  /** Section column it lives in. */
  section: keyof LivingDocSectionsArrays;
  /** ISO timestamp the expired rule was created. */
  ruleCreatedAt: string;
};

/**
 * Given current section arrays, EXPIRE the oldest ACTIVE rules until the
 * remaining ACTIVE count is < MAX. Returns the mutated section arrays
 * (NEW arrays — no in-place mutation) and the list of expiries that
 * happened so the caller can audit them.
 *
 * The "oldest" rule is the one with the earliest `createdAt` ISO string
 * across all 5 sections. Ties broken by id (stable sort).
 *
 * If the caller is about to add 1 new rule, pass `expectedAddCount: 1`
 * so the cap leaves room for the new arrival without re-running.
 */
export function enforceLivingDocCap(
  sections: LivingDocSectionsArrays,
  options: { expectedAddCount?: number; now?: Date } = {},
): {
  sections: LivingDocSectionsArrays;
  expiries: EnforcedExpiry[];
} {
  const expectedAddCount = options.expectedAddCount ?? 0;
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();

  const next: LivingDocSectionsArrays = {
    siteRules: [...sections.siteRules],
    workerNotes: [...sections.workerNotes],
    clientPreferences: [...sections.clientPreferences],
    recurringTasks: [...sections.recurringTasks],
    freeNotes: [...sections.freeNotes],
  };

  const expiries: EnforcedExpiry[] = [];

  const activeCount = () => {
    let n = 0;
    for (const col of SECTION_COLUMNS) {
      for (const r of next[col]) if (r.state === 'ACTIVE') n++;
    }
    return n;
  };

  // Each iteration EXPIREs the single oldest ACTIVE rule. Loop until
  // there's room for the planned add. expectedAddCount accounts for
  // rules the caller is about to insert.
  while (activeCount() + expectedAddCount > MAX_ACTIVE_RULES_PER_LIVING_DOC) {
    const oldest = findOldestActive(next);
    if (!oldest) break; // shouldn't happen but safe-guard
    const arr = next[oldest.section];
    const idx = arr.findIndex((r) => r.id === oldest.rule.id);
    if (idx === -1) break;
    arr[idx] = { ...arr[idx]!, state: 'EXPIRED', decidedAt: nowIso };
    expiries.push({
      ruleId: oldest.rule.id,
      section: oldest.section,
      ruleCreatedAt: oldest.rule.createdAt,
    });
  }

  return { sections: next, expiries };
}

function findOldestActive(
  sections: LivingDocSectionsArrays,
): { section: keyof LivingDocSectionsArrays; rule: LivingDocRuleShape } | null {
  let best: { section: keyof LivingDocSectionsArrays; rule: LivingDocRuleShape } | null = null;
  for (const col of SECTION_COLUMNS) {
    for (const r of sections[col]) {
      if (r.state !== 'ACTIVE') continue;
      if (
        !best ||
        r.createdAt < best.rule.createdAt ||
        (r.createdAt === best.rule.createdAt && r.id < best.rule.id)
      ) {
        best = { section: col, rule: r };
      }
    }
  }
  return best;
}

/**
 * Write the auto-EXPIRE audit events. One AuditEvent per expired rule so
 * the trail is granular. Caller passes the tx so all writes share the
 * same atomic boundary as the LivingDoc update + new-rule append.
 */
export async function emitAutoExpireAudits(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    actorUserId: string;
    livingDocVersionBeforeBump: number;
    expiries: ReadonlyArray<EnforcedExpiry>;
    triggeredBy: 'cap_overflow';
  },
): Promise<void> {
  for (const exp of input.expiries) {
    await recordAuditEvent(tx, {
      companyId: input.companyId,
      kind: 'LIVING_DOC_RULE_AUTO_EXPIRED',
      actorId: input.actorUserId,
      targetId: exp.ruleId,
      payload: {
        section: exp.section,
        ruleCreatedAt: exp.ruleCreatedAt,
        versionBeforeBump: input.livingDocVersionBeforeBump,
        triggeredBy: input.triggeredBy,
      },
    });
  }
}
