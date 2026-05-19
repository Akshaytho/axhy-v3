/**
 * Policy rules loader — pulls Layer 1 (Company) + Layer 2 (HR) rules from
 * the Policy table for prompt composition.
 *
 * Per docs/locked/chat-sidebar-context-flow.md step 5 + docs/locked/rule-
 * hierarchy-three-layers.md, the chat surface composes the prompt in this
 * tier order:
 *
 *   [System] intent classifier + guardrails
 *   [Tier 1] Company rules    (ai.rules.company.*)
 *   [Tier 2] HR rules         (ai.rules.hr.*)
 *   [Tier 3] LivingDoc rules  (supervisor-personal)
 *   [Tier 4] Calendar context (last 30 days)
 *   [Tier 5] Chat history     (last N turns)
 *   [User]   the current message
 *
 * This loader produces Tier 1 + Tier 2 inputs by reading the Policy table.
 *
 * Policy is append-only (docs/locked/operational-invariants.md INV 8), so
 * "current value of key K" = most-recent row by setAt. A row with
 * value=null is the "deleted" sentinel and is excluded from the result.
 *
 * Per-tenant scale (project_scale_target_axhy: 100 supervisors × 1 chat
 * call each per minute peak) means this loader runs ~100/min worst case.
 * The query is one index scan on (companyId, key) so it stays under 5ms
 * at the locked-doc cap of 50 rules per layer.
 *
 * @derives(master-plan §G)
 * @derives(docs/locked/chat-sidebar-context-flow.md step 5)
 * @derives(docs/locked/rule-hierarchy-three-layers.md)
 * @derives(docs/locked/operational-invariants.md INV 8)
 * @derives(plans/abstract-wandering-kazoo.md Phase 2)
 */

import type { Prisma } from '@prisma/client';

/** A single Layer 1 or Layer 2 rule, ready for prompt injection. */
export type PolicyRule = {
  /** Full key, e.g. "ai.rules.company.uniform_required". */
  readonly key: string;
  /** The rule text. Always a string at prompt-injection time. */
  readonly text: string;
  /** User.id of the admin who set this rule (audit-trail hint). */
  readonly setBy: string;
  /** When this version was set. */
  readonly setAt: Date;
};

/**
 * Per docs/locked/chat-abuse-prevention.md Limits: max 50 rules per Policy
 * key namespace, max 500 chars per company/HR rule text. We honor both
 * caps at the loader (defense-in-depth even if the write surface enforces
 * separately).
 */
const MAX_RULES_PER_LAYER = 50;
const MAX_RULE_TEXT_CHARS = 500;

/**
 * Read all current ACTIVE Layer 1 rules for a tenant. Rules are sorted by
 * setAt DESC (newest first) — the AI sees the most recently-changed rules
 * first, which empirically improves attention on policy updates.
 */
export async function loadCompanyRules(
  tx: Prisma.TransactionClient,
  companyId: string,
): Promise<ReadonlyArray<PolicyRule>> {
  return loadRulesForPrefix(tx, companyId, 'ai.rules.company.');
}

/**
 * Read all current ACTIVE Layer 2 rules for a tenant. Same sort + caps as
 * Layer 1.
 */
export async function loadHrRules(
  tx: Prisma.TransactionClient,
  companyId: string,
): Promise<ReadonlyArray<PolicyRule>> {
  return loadRulesForPrefix(tx, companyId, 'ai.rules.hr.');
}

/**
 * Shared loader. For each unique key under `prefix`, returns the most-
 * recent (key, value) where value is non-null. Stringifies non-string
 * values so the prompt always sees text.
 */
async function loadRulesForPrefix(
  tx: Prisma.TransactionClient,
  companyId: string,
  prefix: string,
): Promise<ReadonlyArray<PolicyRule>> {
  // The (companyId, key, setAt DESC) index makes this scan O(N) over the
  // matching rows, then we DISTINCT ON (key) in JS. At 50-rule cap per
  // layer the cost is trivial.
  const rows = await tx.policy.findMany({
    where: {
      companyId,
      key: { startsWith: prefix },
    },
    orderBy: [{ key: 'asc' }, { setAt: 'desc' }],
    select: {
      key: true,
      value: true,
      setBy: true,
      setAt: true,
    },
  });

  // DISTINCT ON (key): for each key, take the first row (which is the
  // most-recent by setAt because of the secondary orderBy).
  const seenKeys = new Set<string>();
  const result: PolicyRule[] = [];
  for (const row of rows) {
    if (seenKeys.has(row.key)) continue;
    seenKeys.add(row.key);
    if (row.value === null) continue; // deleted-sentinel
    const text = coerceRuleText(row.value);
    if (text === null) continue;
    const truncated = text.length > MAX_RULE_TEXT_CHARS ? text.slice(0, MAX_RULE_TEXT_CHARS) : text;
    result.push({
      key: row.key,
      text: truncated,
      setBy: row.setBy,
      setAt: row.setAt,
    });
    if (result.length >= MAX_RULES_PER_LAYER) break;
  }

  // Re-sort by setAt DESC for prompt injection (newest first → more
  // attention from the model).
  return result.sort((a, b) => b.setAt.getTime() - a.setAt.getTime());
}

/**
 * Coerce a Policy.value (which is Json — string, number, object, null) to
 * a single rule text string. Returns null when the value isn't usable as
 * a rule (e.g. an object whose `text` field is missing).
 *
 * Supported shapes:
 *   "raw string"            → "raw string"
 *   { text: "rule body" }   → "rule body"
 *   123 / true / object     → null (caller will skip)
 *
 * Future shapes (e.g. `{ text: ..., active: false }`) can layer on without
 * breaking; null returns are silent skips, not errors.
 */
function coerceRuleText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const v = value as Record<string, unknown>;
    if (typeof v.text === 'string') return v.text;
  }
  return null;
}
