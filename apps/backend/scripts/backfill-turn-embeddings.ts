/**
 * One-time backfill: embeds all existing (user, assistant) ChatMessage pairs
 * into `axhy_chat.turn_embeddings` so Phase 2 retrieval has a historical corpus.
 *
 * Idempotent  — ON CONFLICT (user_message_id) DO NOTHING inside embedTurnAsync;
 *               script also pre-filters via LEFT JOIN to avoid burning embed API
 *               calls on already-embedded turns.
 * Resumable   — re-running picks up where a crashed run left off.
 * Rate-limited — 50 turns/batch, 1-second gap between batches (well under
 *                OpenAI Tier 3's 3,000 RPM limit).
 * Tenant-aware — iterates by (companyId, threadId); every INSERT carries companyId.
 *
 * Core sweep logic lives in src/lib/turn-embedding-sweep.ts (shared with
 * scripts/sweep-turn-embeddings.ts).
 *
 * Run:
 *   source ~/.nvm/nvm.sh && nvm use 20.20.1
 *   set -a && source apps/backend/.env.local && set +a
 *   pnpm --filter @axhy/backend tsx scripts/backfill-turn-embeddings.ts --dry-run
 *   pnpm --filter @axhy/backend tsx scripts/backfill-turn-embeddings.ts
 *
 * @derives(docs/locked/vector-rag-context-assembly.md §4.5)
 * @derives(docs/plans/2026-05-20-vector-rag-wave-a3-phase-1.md §2.5)
 */

import pino from 'pino';

import { prisma } from '../src/lib/prisma.js';
import {
  runMissingSweep,
  estimateCost,
  fetchMissingCandidates,
} from '../src/lib/turn-embedding-sweep.js';

const log = pino({ name: 'backfill-turn-embeddings' });

const DRY_RUN = process.argv.includes('--dry-run');

async function main(): Promise<void> {
  log.info({ dryRun: DRY_RUN }, '[Backfill] starting turn-embeddings backfill');

  if (DRY_RUN) {
    const candidates = await fetchMissingCandidates();
    const { tokens, costInr } = estimateCost(candidates);
    log.info(
      { total: candidates.length, estimatedTokens: tokens, estimatedCostInr: costInr.toFixed(4) },
      `[Backfill] found ${candidates.length} candidate turns to embed`,
    );
    process.stdout.write(`[Backfill] DRY RUN — ${candidates.length} candidate turns identified.\n`);
    process.stdout.write(
      `[Backfill] Estimated cost: ~${tokens.toLocaleString()} tokens → ₹${costInr.toFixed(4)} INR.\n`,
    );
    process.stdout.write('[Backfill] No OpenAI calls made. No rows inserted.\n');
    await prisma.$disconnect();
    return;
  }

  const result = await runMissingSweep({
    log,
    onBatchProgress: (processed, total, embedded, failed) => {
      const pct = Math.round((processed / total) * 100);
      process.stdout.write(
        `[Backfill] Processed ${processed}/${total} (${pct}%) — ${embedded} embedded, ${failed} failed\n`,
      );
    },
  });

  process.stdout.write(
    `[Backfill] Done. Backfilled ${result.embedded} turns; failed ${result.failed}. Estimated cost: ₹${result.estimatedCostInr.toFixed(4)}.\n`,
  );

  log.info(
    {
      embedded: result.embedded,
      failed: result.failed,
      estimatedCostInr: result.estimatedCostInr.toFixed(4),
    },
    '[Backfill] backfill complete',
  );

  if (result.total > 0 && result.failed / result.total > 0.1) {
    log.error(
      { failureRate: (result.failed / result.total).toFixed(2) },
      '[Backfill] failure rate >10% — investigate before re-running',
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  await prisma.$disconnect();
}

main().catch((err: unknown) => {
  log.fatal({ err }, '[Backfill] unhandled error');
  process.exit(1);
});
