/**
 * @axhy/ai-tools — atomic per-tenant daily AI spend bookkeeping.
 *
 * `incrementSpend` updates `Company.aiSpendDailyInr` via raw SQL so
 * `UPDATE … SET col = col + x` is a single statement (no read-modify-write
 * race even at the 50-concurrent chat semaphore).
 *
 * `dispatchBudgetAlert` enqueues an Outbox row with a daily idempotency key
 * so the same tenant cannot fire the same alert kind twice in a UTC day.
 * Idempotency is enforced at the DB layer via `UNIQUE(companyId, idempotencyKey)`
 * (see migration `20260510_wave_4b_ai_spend_protection`); P2002 violations
 * on this exact constraint are swallowed (already-alerted-today is the
 * desired no-op), other P2002s rethrow.
 *
 * @derives(spec-2 §9.2, §9.3, §9.4)
 * @derives(ADR-0009) — outbox over Redis until measured pain
 * @derives(ADR-0023)
 */

import type { Prisma, PrismaClient } from '@prisma/client';

export type BudgetAlertKind = 'WARN' | 'CAP';

/** Outbox topic strings — registered in apps/backend/src/dispatcher/handlers/registry.ts. */
export const OUTBOX_TOPIC_BUDGET_WARN = 'owner.ai_budget_warning' as const;
export const OUTBOX_TOPIC_BUDGET_CAPPED = 'owner.ai_budget_capped' as const;

export type DbClient = PrismaClient | Prisma.TransactionClient;

/**
 * Atomically increment `Company.aiSpendDailyInr` by `costInr`.
 * Race-free at the database layer — no app-level read-modify-write.
 *
 * Throws if `costInr` is NaN/negative (defensive — never trust upstream
 * usage shape) or if the company row doesn't exist (caller passed a stale
 * tenant id).
 *
 * @param companyId    UUID of the tenant
 * @param costInr      INR amount to add (must be >= 0)
 * @param client       PrismaClient or transaction client (caller controls scope)
 */
export async function incrementSpend(
  companyId: string,
  costInr: number,
  client: DbClient,
): Promise<void> {
  if (typeof costInr !== 'number' || Number.isNaN(costInr) || costInr < 0) {
    throw new Error(`incrementSpend: invalid costInr=${costInr} for tenant=${companyId}`);
  }
  if (costInr === 0) return; // no-op
  const rows = await client.$executeRaw`
    UPDATE "axhy"."Company"
    SET "aiSpendDailyInr" = "aiSpendDailyInr" + ${costInr}::numeric
    WHERE "id" = ${companyId}::uuid
  `;
  if (rows === 0) {
    throw new Error(`incrementSpend: no Company row matched id=${companyId}`);
  }
}

/**
 * Idempotently enqueue an owner budget alert into Outbox.
 * Daily key shape: `${companyId}:budget_${kind}:YYYYMMDD` (UTC date).
 *
 * Behavior:
 * - First call this UTC day → row inserted, dispatcher will pick it up.
 * - Subsequent same-day calls → unique-constraint violation (P2002) is
 *   swallowed; the function returns successfully (already alerted).
 * - Different alert kinds (WARN vs CAP) get distinct keys → both fire same day.
 *
 * @param companyId  UUID of the tenant
 * @param kind       'WARN' | 'CAP'
 * @param client     PrismaClient or transaction client
 */
export async function dispatchBudgetAlert(
  companyId: string,
  kind: BudgetAlertKind,
  client: DbClient,
): Promise<void> {
  const dateUtc = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const idempotencyKey = `${companyId}:budget_${kind}:${dateUtc}`;
  const topic = kind === 'WARN' ? OUTBOX_TOPIC_BUDGET_WARN : OUTBOX_TOPIC_BUDGET_CAPPED;
  try {
    await client.outbox.create({
      data: {
        companyId,
        topic,
        // companyId in payload too so the handler doesn't need a signature
        // change to read it (existing 7 handlers take only (payload, log)).
        payload: { kind, dateUtc, companyId, topic },
        idempotencyKey,
      },
    });
  } catch (err) {
    // Narrow P2002 catch — only swallow when the violation is on the
    // exact (companyId, idempotencyKey) unique constraint we own. Any other
    // unique-constraint violation surfaces normally so real bugs aren't hidden.
    if (isOurIdempotencyConflict(err)) return;
    throw err;
  }
}

function isOurIdempotencyConflict(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { code?: string; meta?: { target?: unknown } };
  if (e.code !== 'P2002') return false;
  const target = e.meta?.target;
  if (Array.isArray(target)) {
    return target.includes('companyId') && target.includes('idempotencyKey');
  }
  if (typeof target === 'string') {
    return target.includes('idempotencyKey');
  }
  return false;
}
