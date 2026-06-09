/**
 * Daily UTC-midnight reset of `Company.aiSpendDailyInr`.
 *
 * Piggyback on the long-running outbox dispatcher tick (no new cron lib).
 * Idempotent: zero+zero=zero, safe to fire multiple times the same day —
 * the in-memory `lastResetUtcDate` marker prevents redundant DB churn.
 *
 * Failure-tolerant: catches errors, logs at error level, returns without
 * throwing so the dispatcher's outbox-poll loop continues regardless.
 * Next tick re-tries (the marker isn't bumped on failure).
 *
 * UTC vs IST: midnight UTC = 5:30am IST. Suresh persona starting his
 * shift sees a fresh budget at 5:30am IST. Per-tenant local-time reset
 * (multi-region) is deferred to Phase D — not a real scenario yet.
 *
 * @derives(spec-2 §9.3)
 * @derives(ADR-0023)
 */

import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';

/**
 * Synthetic actor UUID for system-driven audit events. Phase 1 keeps it
 * inline; Phase D may move to a dedicated `system_actor_id` env.
 */
const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

/**
 * In-memory marker — last UTC date this dispatcher process ran the
 * reset. Persists for the lifetime of the dispatcher process; on
 * restart it's reset to null and the first tick re-records today as
 * "already done" (see firstBoot path below) so a server restart at
 * 11:59 UTC + 12:00 UTC doesn't double-reset.
 */
let lastResetUtcDate: string | null = null;

/** YYYY-MM-DD in UTC. */
function utcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Test helper — forces re-run on next call. Not exported via index. */
export function _resetMarkerForTesting(): void {
  lastResetUtcDate = null;
}

/**
 * Run the daily reset if (and only if) we have crossed a UTC midnight
 * since the last successful run. First boot of the dispatcher records
 * today as already-done so a midday restart doesn't trigger a reset.
 *
 * @returns `{ ran, tenantsReset }` so callers (tests, dashboards) can
 *          observe outcomes; never throws.
 */
export async function maybeResetAiSpend(
  client: PrismaClient,
  log: FastifyBaseLogger,
  now: Date = new Date(),
): Promise<{ ran: boolean; tenantsReset: number }> {
  const today = utcDateKey(now);

  // First boot — record today as "already done" so a midday restart
  // doesn't reset. Real reset fires at the FIRST tick after the next
  // UTC midnight.
  if (lastResetUtcDate === null) {
    lastResetUtcDate = today;
    return { ran: false, tenantsReset: 0 };
  }

  // Already ran today — no-op.
  if (lastResetUtcDate === today) {
    return { ran: false, tenantsReset: 0 };
  }

  try {
    const tenantsReset = await client.$transaction(
      async (tx) => {
        const tenants = await tx.company.findMany({ select: { id: true } });
        await tx.$executeRaw`UPDATE "axhy"."Company" SET "aiSpendDailyInr" = 0`;
        // One batched insert instead of a per-tenant loop. The loop did N
        // sequential audit inserts which, under prod latency, blew past the
        // default 5s tx timeout (~9.5s for 6 tenants) so the reset never
        // committed and every tenant's budget stayed capped forever. One
        // AI_SPEND_DAILY_RESET audit per tenant is still written — in 1 stmt.
        if (tenants.length > 0) {
          await tx.auditEvent.createMany({
            // #26: idempotent — a re-run / multi-replica reset for the same day must
            // not write duplicate AI_SPEND_DAILY_RESET rows. dedupKey is unique per
            // (company, day); skipDuplicates makes the re-run a no-op.
            data: tenants.map((t) => ({
              companyId: t.id,
              kind: 'AI_SPEND_DAILY_RESET',
              actorId: SYSTEM_ACTOR_ID,
              targetId: null,
              payload: { dateUtc: today },
              dedupKey: `ai_spend_reset:${today}`,
            })),
            skipDuplicates: true,
          });
        }
        return tenants.length;
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
    lastResetUtcDate = today;
    log.info(
      { event: 'reset_ai_spend.success', tenantsReset, dateUtc: today },
      'Daily AI spend reset complete',
    );
    return { ran: true, tenantsReset };
  } catch (err) {
    log.error(
      { event: 'reset_ai_spend.failure', err: (err as Error).message, dateUtc: today },
      'Daily AI spend reset FAILED — will retry next tick',
    );
    // Do NOT advance the marker on failure. Do NOT throw — dispatcher
    // must keep polling outbox.
    return { ran: false, tenantsReset: 0 };
  }
}
