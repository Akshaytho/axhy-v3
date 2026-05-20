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
import pino from 'pino';
import { LivingDocRule, type LivingDocRule as Rule } from '@axhy/shared-schema';
import { safeParseOrLog, type SafeParseLogger } from '@axhy/errors';

const log = pino({ name: 'living-doc' });

export type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Console-backed default logger. Pino-shaped surface; consumers that
 * have a real Fastify log can pass it explicitly to getLivingDoc.
 */
const defaultLog: SafeParseLogger = {
  warn(obj, msg) {
    log.warn(obj, msg ?? 'living-doc warn');
  },
};

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
 * LivingDocRule[]. Rules that fail zod parse are dropped with a structured
 * `safe_parse.failure` warn log (per Wave 4b Phase 2.5 silent-drop fix).
 * Filter to ACTIVE state.
 */
function coerceSection(
  raw: unknown,
  ctx: { companyId: string; supervisorId: string; sectionName: string },
  log: SafeParseLogger,
): Rule[] {
  if (!Array.isArray(raw)) return [];
  const out: Rule[] = [];
  for (const item of raw) {
    const parsed = safeParseOrLog(
      LivingDocRule,
      item,
      {
        schemaName: 'LivingDocRule',
        callSite: `living-doc.coerceSection.${ctx.sectionName}`,
        companyId: ctx.companyId,
        supervisorId: ctx.supervisorId,
      },
      log,
    );
    if (parsed && parsed.state === 'ACTIVE') {
      out.push(parsed);
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
 *
 * @param log Optional structured logger; falls back to console.warn shim
 *            when omitted. Pass req.log from a Fastify request to thread
 *            tenant-correlated logs into the per-request log line.
 */
export async function getLivingDoc(
  client: DbClient,
  companyId: string,
  supervisorId: string,
  log: SafeParseLogger = defaultLog,
): Promise<LivingDocActive> {
  const row = await client.livingDoc.upsert({
    where: { companyId_supervisorId: { companyId, supervisorId } },
    create: { companyId, supervisorId },
    update: {},
  });
  const ctx = { companyId, supervisorId };
  return {
    id: row.id,
    companyId: row.companyId,
    supervisorId: row.supervisorId,
    version: row.version,
    siteRules: coerceSection(row.siteRules, { ...ctx, sectionName: 'siteRules' }, log),
    workerNotes: coerceSection(row.workerNotes, { ...ctx, sectionName: 'workerNotes' }, log),
    clientPreferences: coerceSection(
      row.clientPreferences,
      { ...ctx, sectionName: 'clientPreferences' },
      log,
    ),
    recurringTasks: coerceSection(
      row.recurringTasks,
      { ...ctx, sectionName: 'recurringTasks' },
      log,
    ),
    freeNotes: coerceSection(row.freeNotes, { ...ctx, sectionName: 'freeNotes' }, log),
  };
}
