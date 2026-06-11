/**
 * Outbox dispatcher worker.
 *
 * Long-running Node process that drains the `axhy.Outbox` table:
 *   1. Poll every POLL_INTERVAL_MS (default 2000)
 *   2. Pull rows where processedAt IS NULL AND nextRetryAt <= now() AND failCount < MAX_FAIL
 *   3. For each row, dispatch by topic to a registered handler
 *   4. On success: set processedAt = now()
 *   5. On failure: increment failCount, set nextRetryAt with exponential backoff,
 *      capture lastError. After MAX_FAIL the row is quarantined (just stops being polled;
 *      ops triages from logs / dashboard later).
 *
 * Run via:  pnpm --filter @axhy/backend dispatcher
 * Or in code:  startDispatcher()  (returns a stop() function)
 *
 * Tests use `processOnce()` to drive a single batch deterministically.
 *
 * @derives(ADR-0009) — outbox over Redis until measured pain
 * @derives(master-plan §L) — cascade depth. NOTE (#35): the "depth ≤ 3
 *   enforced" claim is ASPIRATIONAL, not implemented — there is no depth
 *   column and no increment/check anywhere in this loop. It is safe today only
 *   because NO registered handler emits a downstream Outbox row (observed depth
 *   is always 1). Before any handler is allowed to re-enqueue, add real depth
 *   tracking (a depth column + increment-and-check on enqueue-from-handler) or a
 *   cascade can run unbounded. (The older "all handlers are stubs" note is also
 *   stale — notifications.ts + owner-budget.ts do real work, but still don't
 *   re-enqueue.)
 * @derives(panel-2026-05-08) — phase B.6
 */

import type { Outbox, PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import pino from 'pino';

import { maybeResetAiSpend } from '../jobs/reset-ai-spend.js';
import { maybeRunBindingExpireSweep } from '../jobs/binding-expire-sweep.js';
import { maybeRunReplacementInviteExpirySweep } from '../jobs/replacement-invite-expiry-sweep.js';

import { dispatcherPrisma } from './db.js';
import { HANDLERS, REGISTERED_TOPICS } from './handlers/registry.js';

/** Maximum failCount before a row is quarantined (no further attempts). */
export const MAX_FAIL = 5;

/** Per-batch row cap so one slow tenant can't starve others. */
export const BATCH_SIZE = 50;

/**
 * Multi-replica claim lease (ADR-0009). When a dispatcher picks up an Outbox row
 * it pushes nextRetryAt this far forward so a second replica skips it; if the
 * handler crashes mid-flight the lease expires and the row is re-claimable. Must
 * exceed the slowest handler (AI verify ~ seconds); 5 min matches the retry cap.
 */
export const CLAIM_LEASE_MS = 5 * 60 * 1000;

/** Default poll interval. Override via OUTBOX_POLL_INTERVAL_MS. */
export const DEFAULT_POLL_INTERVAL_MS = 2000;

/**
 * Compute next retry time using exponential backoff:
 *   1st fail   → +5s
 *   2nd fail   → +10s
 *   3rd fail   → +20s
 *   4th fail   → +40s
 *   5th fail   → +80s (then quarantined)
 *
 * Cap at 5 minutes so a transient outage doesn't push retries hours out.
 */
export function computeNextRetryAt(failCount: number, now: Date = new Date()): Date {
  const seconds = Math.min(5 * 2 ** Math.max(0, failCount - 1), 300);
  return new Date(now.getTime() + seconds * 1000);
}

/**
 * Run one drain pass: claim a batch, dispatch each row, write the result.
 * Returns a summary so callers (tests + ops dashboards) can assert/observe.
 *
 * `opts.companyId` scopes the drain to a single tenant — used by tests so
 * parallel test files don't race each other's Outbox rows. Production
 * dispatcher calls this with no opts → drains globally.
 *
 * @derives(ADR-0009)
 */
export async function processOnce(
  client: PrismaClient,
  log: FastifyBaseLogger,
  opts: { companyId?: string } = {},
): Promise<{ processed: number; failed: number; quarantined: number; skipped: number }> {
  const now = new Date();
  const candidates = await client.outbox.findMany({
    where: {
      ...(opts.companyId ? { companyId: opts.companyId } : {}),
      processedAt: null,
      failCount: { lt: MAX_FAIL },
      nextRetryAt: { lte: now },
    },
    orderBy: { nextRetryAt: 'asc' },
    take: BATCH_SIZE,
  });

  let processed = 0;
  let failed = 0;
  let quarantined = 0;
  let skipped = 0;

  for (const row of candidates) {
    // Multi-replica atomic claim (ADR-0009): conditionally push nextRetryAt
    // forward as a lease. Whichever dispatcher's UPDATE matches count=1 owns the
    // row; a concurrent replica matches 0 rows and skips it — no double dispatch.
    // A crash mid-handler leaves the lease, which expires after CLAIM_LEASE_MS so
    // the row becomes re-claimable.
    const claim = await client.outbox.updateMany({
      where: { id: row.id, processedAt: null, nextRetryAt: { lte: now } },
      data: { nextRetryAt: new Date(now.getTime() + CLAIM_LEASE_MS) },
    });
    if (claim.count === 0) {
      // Another replica claimed it (or it was processed between findMany and now).
      skipped += 1;
      continue;
    }

    const handler = HANDLERS[row.topic];
    if (!handler) {
      // Unknown topic — count as failure so it eventually quarantines and
      // surfaces in ops triage rather than silently piling up.
      await markFailed(client, row, `UNKNOWN_TOPIC: ${row.topic}`, log);
      const nextFail = row.failCount + 1;
      if (nextFail >= MAX_FAIL) quarantined += 1;
      else failed += 1;
      continue;
    }

    try {
      await handler(row.payload, log);
      await client.outbox.update({
        where: { id: row.id },
        data: { processedAt: new Date(), lastError: null },
      });
      processed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await markFailed(client, row, message, log);
      const nextFail = row.failCount + 1;
      if (nextFail >= MAX_FAIL) quarantined += 1;
      else failed += 1;
    }
  }

  if (candidates.length === 0) skipped = 1; // for visibility on idle ticks
  return { processed, failed, quarantined, skipped };
}

async function markFailed(
  client: PrismaClient,
  row: Outbox,
  errorMessage: string,
  log: FastifyBaseLogger,
): Promise<void> {
  const nextFail = row.failCount + 1;
  const quarantined = nextFail >= MAX_FAIL;
  await client.outbox.update({
    where: { id: row.id },
    data: {
      failCount: nextFail,
      lastError: errorMessage,
      nextRetryAt: computeNextRetryAt(nextFail),
    },
  });
  if (quarantined) {
    log.error(
      { outboxId: row.id, topic: row.topic, failCount: nextFail, lastError: errorMessage },
      'outbox row QUARANTINED — needs ops triage',
    );
  } else {
    log.warn(
      { outboxId: row.id, topic: row.topic, failCount: nextFail, lastError: errorMessage },
      'outbox handler failed — will retry',
    );
  }
}

/**
 * One-time probe: the dispatcher's role MUST be able to bypass RLS
 * (postgres superuser or a BYPASSRLS role). Under `axhy_app` every handler
 * and sweep would SILENTLY no-op — visits stuck AWAITING_VERIFICATION, AI
 * spend uncharged, notifications dropped (2026-06-11 RLS audit, worst
 * finding). Definitive "role cannot bypass" → loud crash naming the fix;
 * transient query errors → retry on the next tick, never exit.
 */
let rlsBypassVerified = false;
async function ensureDispatcherRlsBypass(
  client: PrismaClient,
  log: FastifyBaseLogger,
): Promise<void> {
  if (rlsBypassVerified) return;
  let role = 'unknown';
  let ok: boolean;
  try {
    const rows = await client.$queryRawUnsafe<Array<{ rolname: string; ok: boolean }>>(
      `SELECT rolname, (rolsuper OR rolbypassrls) AS ok FROM pg_roles WHERE rolname = current_user`,
    );
    if (rows.length === 0 || rows[0] === undefined) return; // catalog oddity — retry next tick
    role = rows[0].rolname;
    ok = rows[0].ok;
  } catch (err) {
    log.error({ err }, 'dispatcher RLS-bypass probe failed — retrying next tick');
    return;
  }
  if (!ok) {
    log.fatal(
      { role },
      `dispatcher connected as role "${role}" which CANNOT bypass RLS — handlers and sweeps ` +
        `would silently no-op (visits stuck, spend uncharged). Set DISPATCHER_DATABASE_URL to ` +
        `an RLS-bypassing connection (the postgres URL) before flipping DATABASE_URL to axhy_app.`,
    );
    process.exit(1);
  }
  rlsBypassVerified = true;
  log.info({ role }, 'dispatcher RLS-bypass probe OK');
}

/**
 * Start the long-running dispatcher loop. Returns a `stop()` function that
 * waits for the in-flight batch to complete and then stops polling.
 *
 * @derives(ADR-0009)
 */
export function startDispatcher(opts?: {
  pollIntervalMs?: number;
  client?: PrismaClient;
  log?: FastifyBaseLogger;
}): { stop: () => Promise<void> } {
  const intervalMs =
    opts?.pollIntervalMs ?? Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? DEFAULT_POLL_INTERVAL_MS);
  const client = opts?.client ?? dispatcherPrisma;
  const log =
    opts?.log ??
    (pino({
      level: process.env.LOG_LEVEL ?? 'info',
      transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
    }) as unknown as FastifyBaseLogger);

  let stopped = false;
  let inFlight: Promise<unknown> | null = null;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    // RLS Option-A guard: definitive non-bypass role → loud crash; transient
    // probe errors retry here next tick without blocking the batch below.
    await ensureDispatcherRlsBypass(client, log);
    // Spec 2 §9.3 — daily AI spend reset, piggybacked on dispatcher tick.
    // No new cron lib; reuses long-running process. Idempotent + failure-
    // tolerant inside maybeResetAiSpend so a reset failure never breaks
    // the outbox-poll loop.
    await maybeResetAiSpend(client, log).catch((err: unknown) => {
      log.error({ err }, 'reset-ai-spend dispatch wrapper crashed');
    });
    // F-003 — binding-expire-sweep, piggybacked on the same dispatcher tick.
    // Same pattern as reset-ai-spend: in-memory cadence marker so the actual
    // sweep work fires every 5 minutes even though tick runs every ~2s.
    // Failure-tolerant inside maybeRunBindingExpireSweep so a sweep failure
    // never breaks the outbox-poll loop.
    await maybeRunBindingExpireSweep(client, log).catch((err: unknown) => {
      log.error({ err }, 'binding-expire-sweep dispatch wrapper crashed');
    });
    // F28 — replacement-invite-expiry-sweep, piggybacked on the same
    // dispatcher tick. Same pattern as binding-expire-sweep: in-memory
    // cadence marker gates the actual sweep work to every 30s. Failure-
    // tolerant inside maybeRunReplacementInviteExpirySweep so a sweep
    // failure never breaks the outbox-poll loop.
    await maybeRunReplacementInviteExpirySweep(client, log).catch((err: unknown) => {
      log.error({ err }, 'replacement-invite-expiry-sweep dispatch wrapper crashed');
    });
    inFlight = processOnce(client, log).catch((err: unknown) => {
      log.error({ err }, 'dispatcher batch crashed');
    });
    await inFlight;
    inFlight = null;
    if (!stopped) setTimeout(tick, intervalMs);
  };

  log.info({ intervalMs, registeredTopics: REGISTERED_TOPICS }, 'outbox dispatcher started');
  setTimeout(tick, intervalMs);

  return {
    stop: async () => {
      stopped = true;
      if (inFlight) await inFlight;
      log.info('outbox dispatcher stopped');
    },
  };
}

/** Direct CLI entrypoint for `pnpm --filter @axhy/backend dispatcher`. */
async function main(): Promise<void> {
  const handle = startDispatcher();
  const shutdown = async (signal: string) => {
    console.log(`[dispatcher] received ${signal}, draining…`);
    await handle.stop();
    await dispatcherPrisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

// CLI entry — only run when invoked directly (not when imported by tests).
const invokedDirectly =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1] !== undefined &&
  process.argv[1].includes('dispatcher/index');
if (invokedDirectly) {
  void main();
}
