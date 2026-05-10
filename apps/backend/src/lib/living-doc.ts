/**
 * LivingDoc read helper — Spec 2 §6.1 Path A (immediate via tool call).
 *
 * `getLivingDoc(prisma, companyId, supervisorId)` returns the supervisor's
 * row, upserting an empty doc on first read so the chat path always has a
 * doc to read. Filters each section to `state==='ACTIVE'` rules — Phase 2
 * wave only injects ACTIVE rules into prompt context.
 *
 * Returned shape mirrors the Prisma model but with the 5 JSON sections
 * already coerced to `LivingDocRule[]` (typed) and ACTIVE-filtered.
 *
 * @derives(master-plan §G)
 * @derives(ADR-0023)
 * @derives(spec-2 §3.5, §6.1)
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import { LivingDocRule, type LivingDocRule as Rule } from '@axhy/shared-schema';

export type DbClient = PrismaClient | Prisma.TransactionClient;

export type LivingDocActive = {
  id: string;
  companyId: string;
  supervisorId: string;
  version: number;
  siteRules: Rule[];
  workerNotes: Rule[];
  clientPreferences: Rule[];
  recurringTasks: Rule[];
  freeNotes: Rule[];
};

/**
 * Coerce the Prisma `Json` value at a section column into a typed
 * LivingDocRule[]. Rules that fail zod parse are dropped with a warning
 * (defensive — should never happen if writes go through propose_living_doc_update,
 * but raw SQL drift is possible). Filter to ACTIVE state.
 */
function coerceSection(raw: unknown): Rule[] {
  if (!Array.isArray(raw)) return [];
  const out: Rule[] = [];
  for (const item of raw) {
    const parsed = LivingDocRule.safeParse(item);
    if (parsed.success && parsed.data.state === 'ACTIVE') {
      out.push(parsed.data);
    }
  }
  return out;
}

/**
 * Read the LivingDoc for (companyId, supervisorId), upserting an empty
 * doc on first read. Returns sections filtered to ACTIVE rules only.
 *
 * Upsert prevents the chat path from racing on first-time supervisors:
 * always returns a non-null doc.
 */
export async function getLivingDoc(
  client: DbClient,
  companyId: string,
  supervisorId: string,
): Promise<LivingDocActive> {
  const row = await client.livingDoc.upsert({
    where: { companyId_supervisorId: { companyId, supervisorId } },
    create: { companyId, supervisorId },
    update: {},
  });
  return {
    id: row.id,
    companyId: row.companyId,
    supervisorId: row.supervisorId,
    version: row.version,
    siteRules: coerceSection(row.siteRules),
    workerNotes: coerceSection(row.workerNotes),
    clientPreferences: coerceSection(row.clientPreferences),
    recurringTasks: coerceSection(row.recurringTasks),
    freeNotes: coerceSection(row.freeNotes),
  };
}
