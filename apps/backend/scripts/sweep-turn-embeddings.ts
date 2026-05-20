/**
 * CRON CONFIG
 * ──────────────────────────────────────────────────────────────────────────────
 * Nightly sweep: re-embeds ChatMessage pairs missing a turn_embeddings row.
 * Handles embedding API failures from the real-time path (Phase 1 fire-and-forget).
 *
 * Suggested Railway cron (Railway dashboard → Cron):
 *   Schedule: 0 2 * * *   (2 AM IST daily)
 *   Command:  pnpm --filter @axhy/backend tsx scripts/sweep-turn-embeddings.ts
 *
 * Optional prune (e.g., once a month — storage hygiene per spec §6 Phase 6):
 *   Schedule: 0 3 1 * *   (3 AM IST 1st of month)
 *   Command:  pnpm --filter @axhy/backend tsx scripts/sweep-turn-embeddings.ts --prune-older-than-days 365
 *
 * Flags:
 *   --dry-run                  Print candidate count + cost; no OpenAI calls, no DB writes.
 *   --prune-older-than-days N  Delete turn_embeddings rows older than N days (default: OFF).
 *
 * Exit codes:
 *   0 — success (even if 0 candidates — nothing to sweep is fine).
 *   1 — failure (embedding error rate >10%, prune failed, or unhandled error).
 *
 * @derives(docs/locked/vector-rag-context-assembly.md §4.5)
 * @derives(docs/plans/2026-05-20-vector-rag-wave-a3-phase-2-thru-6.md §13)
 */

import pino from 'pino';

import { prisma } from '../src/lib/prisma.js';
import {
  runMissingSweep,
  estimateCost,
  fetchMissingCandidates,
} from '../src/lib/turn-embedding-sweep.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Hard timeout: cron job must not run longer than 30 minutes. */
const MAX_RUN_MS = 1_800_000;

// ─── CLI argument parsing ─────────────────────────────────────────────────────

function parseArgs(): { dryRun: boolean; pruneOlderThanDays: number | null } {
  const dryRun = process.argv.includes('--dry-run');

  const pruneIdx = process.argv.indexOf('--prune-older-than-days');
  let pruneOlderThanDays: number | null = null;
  if (pruneIdx !== -1) {
    const rawDays = process.argv[pruneIdx + 1];
    if (rawDays === undefined || rawDays.startsWith('--')) {
      process.stderr.write(
        '[Sweep] ERROR: --prune-older-than-days requires a numeric argument (e.g., 365)\n',
      );
      process.exit(1);
    }
    const parsed = Number(rawDays);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      process.stderr.write(
        `[Sweep] ERROR: --prune-older-than-days value must be a positive integer; got "${rawDays}"\n`,
      );
      process.exit(1);
    }
    pruneOlderThanDays = Math.floor(parsed);
  }

  return { dryRun, pruneOlderThanDays };
}

// ─── Prune step ───────────────────────────────────────────────────────────────

/**
 * Deletes turn_embeddings rows older than `daysOld` days across all tenants.
 *
 * Permanent DELETE (not soft-delete). Safe to run repeatedly; rows that
 * don't exist are simply not matched. Logs affected tenant count before
 * deleting so the operator can see what was touched.
 */
async function pruneOldEmbeddings(daysOld: number, log: pino.Logger): Promise<number> {
  // Count affected tenants before pruning for the audit log.
  const affectedTenantsResult = await prisma.$queryRawUnsafe<Array<{ company_id: string }>>(
    `SELECT DISTINCT company_id::text
       FROM "axhy_chat"."turn_embeddings"
      WHERE created_at < (now() - $1::interval)`,
    `${daysOld} days`,
  );
  const affectedTenants = affectedTenantsResult.map((r) => r.company_id);

  log.info(
    { daysOld, affectedTenantCount: affectedTenants.length, affectedTenants },
    '[Sweep] prune: tenants with rows older than threshold',
  );

  const deleted = await prisma.$executeRawUnsafe(
    `DELETE FROM "axhy_chat"."turn_embeddings" WHERE created_at < (now() - $1::interval)`,
    `${daysOld} days`,
  );
  return Number(deleted);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const log = pino({ name: 'sweep-turn-embeddings' });

  const { dryRun, pruneOlderThanDays } = parseArgs();

  log.info({ dryRun, pruneOlderThanDays, maxRunMs: MAX_RUN_MS }, '[Sweep] starting nightly sweep');

  // Hard timeout guard: exit(1) if the script exceeds MAX_RUN_MS.
  const timeoutHandle = setTimeout(() => {
    log.fatal({ maxRunMs: MAX_RUN_MS }, '[Sweep] exceeded max run time — aborting');
    void prisma.$disconnect().finally(() => process.exit(1));
  }, MAX_RUN_MS);
  // Prevent the timer from keeping the process alive after normal exit.
  timeoutHandle.unref();

  // ── Step 1: Sweep missing embeddings ──────────────────────────────────────

  let sweepEmbedded = 0;
  let sweepFailed = 0;
  let sweepTotal = 0;
  let sweepCostInr = 0;

  if (dryRun) {
    const candidates = await fetchMissingCandidates();
    const { tokens, costInr } = estimateCost(candidates);
    sweepTotal = candidates.length;
    sweepCostInr = costInr;
    log.info(
      { total: sweepTotal, estimatedTokens: tokens, estimatedCostInr: costInr.toFixed(4) },
      '[Sweep] DRY RUN — candidate turns identified',
    );
    process.stdout.write(
      `[Sweep] DRY RUN — ${sweepTotal} candidate turns; ~${tokens.toLocaleString()} tokens → ₹${costInr.toFixed(4)} INR.\n`,
    );
    process.stdout.write('[Sweep] No OpenAI calls made. No rows inserted.\n');
  } else {
    const result = await runMissingSweep({
      log,
      onBatchProgress: (processed, total, embedded, failed) => {
        const pct = total > 0 ? Math.round((processed / total) * 100) : 100;
        log.info({ processed, total, pct, embedded, failed }, '[Sweep] batch progress');
      },
    });
    sweepTotal = result.total;
    sweepEmbedded = result.embedded;
    sweepFailed = result.failed;
    sweepCostInr = result.estimatedCostInr;
  }

  // ── Step 2: Prune (opt-in) ────────────────────────────────────────────────

  let pruned = 0;

  if (pruneOlderThanDays !== null) {
    if (dryRun) {
      // In dry-run mode, count prune candidates without deleting.
      const pruneCount = await prisma.$queryRawUnsafe<Array<{ count: string }>>(
        `SELECT COUNT(*)::text AS count
           FROM "axhy_chat"."turn_embeddings"
          WHERE created_at < (now() - $1::interval)`,
        `${pruneOlderThanDays} days`,
      );
      const dryPruneCount = Number(pruneCount[0]?.count ?? '0');
      log.info(
        { dryRun: true, pruneOlderThanDays, wouldPrune: dryPruneCount },
        '[Sweep] DRY RUN — prune candidates counted (no delete)',
      );
      process.stdout.write(
        `[Sweep] DRY RUN — prune would delete ${dryPruneCount} rows older than ${pruneOlderThanDays} days.\n`,
      );
    } else {
      log.info({ pruneOlderThanDays }, '[Sweep] starting prune step');
      pruned = await pruneOldEmbeddings(pruneOlderThanDays, log);
      log.info({ pruned, pruneOlderThanDays }, '[Sweep] prune step complete');
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  const summary = dryRun
    ? `[Sweep] DRY RUN SUMMARY — ${sweepTotal} candidates identified; 0 embedded; 0 pruned. Estimated cost: ₹${sweepCostInr.toFixed(4)}.`
    : `[Sweep] SUMMARY — Swept ${sweepEmbedded}/${sweepTotal} turns; failed ${sweepFailed}; pruned ${pruned}. Estimated cost: ₹${sweepCostInr.toFixed(4)}.`;

  process.stdout.write(`${summary}\n`);

  log.info(
    {
      dryRun,
      sweepTotal,
      sweepEmbedded,
      sweepFailed,
      pruned,
      estimatedCostInr: sweepCostInr.toFixed(4),
    },
    '[Sweep] complete',
  );

  await prisma.$disconnect();

  // Exit 1 if error rate exceeds 10% (non-dry-run only).
  if (!dryRun && sweepTotal > 0 && sweepFailed / sweepTotal > 0.1) {
    log.error(
      { failureRate: (sweepFailed / sweepTotal).toFixed(2) },
      '[Sweep] embedding failure rate >10% — exit 1',
    );
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  const log = pino({ name: 'sweep-turn-embeddings' });
  log.fatal({ err }, '[Sweep] unhandled error');
  process.exit(1);
});
