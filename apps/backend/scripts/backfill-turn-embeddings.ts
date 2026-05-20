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
import { embedTurnAsync, type EmbedTurnInput } from '../src/lib/turn-embedder.js';

const log = pino({ name: 'backfill-turn-embeddings' });

const DRY_RUN = process.argv.includes('--dry-run');

// Cost constant: text-embedding-3-small at $0.02/1M input tokens × 84 INR/USD
// = $0.02 / 1_000_000 × 84 = 0.00168 INR / 1K tokens.
// Source: https://openai.com/pricing (verified 2026-05-20), ₹84/USD spot rate.
const INR_PER_1K_INPUT_TOKENS = 0.00168;

// Rough chars-per-token (mirrors turn-embedder.ts CHARS_PER_TOKEN constant).
const CHARS_PER_TOKEN = 4;

const BATCH_SIZE = 50;
const BATCH_GAP_MS = 1_000;

// ─── Row types for raw SQL results ───────────────────────────────────────────

interface CandidateRow {
  user_message_id: string;
  assistant_message_id: string;
  company_id: string;
  thread_id: string;
  supervisor_id: string;
  user_text: string | null;
  assistant_text: string | null;
  tool_calls: unknown;
  decision_card: unknown;
}

// ─── Helper: safe tool-call extraction ───────────────────────────────────────

/**
 * Safely extracts `{ name, input }` pairs from the assistant's `toolCalls`
 * JSON column. The column may be null, a single object, or an array; we
 * guard every step so a malformed row never crashes the backfill.
 */
function extractToolCalls(
  raw: unknown,
): ReadonlyArray<{ name: string; input: Record<string, unknown> }> {
  if (raw === null || raw === undefined) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  const result: Array<{ name: string; input: Record<string, unknown> }> = [];
  for (const item of arr) {
    if (typeof item !== 'object' || item === null) continue;
    const obj = item as Record<string, unknown>;
    const name =
      typeof obj['name'] === 'string'
        ? obj['name']
        : typeof obj['toolName'] === 'string'
          ? obj['toolName']
          : null;
    if (name === null) continue;
    const inputField =
      typeof obj['input'] === 'object' && obj['input'] !== null
        ? (obj['input'] as Record<string, unknown>)
        : {};
    result.push({ name, input: inputField });
  }
  return result;
}

/**
 * Safely extracts `{ kind, summary }` pairs from the assistant's `decisionCard`
 * JSON column. The column may be null, a single card object, or an array of cards.
 */
function extractDecisionCards(raw: unknown): ReadonlyArray<{ kind?: string; summary?: string }> {
  if (raw === null || raw === undefined) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  const result: Array<{ kind?: string; summary?: string }> = [];
  for (const item of arr) {
    if (typeof item !== 'object' || item === null) continue;
    const obj = item as Record<string, unknown>;
    const kind = typeof obj['kind'] === 'string' ? obj['kind'] : undefined;
    const summary = typeof obj['summary'] === 'string' ? obj['summary'] : undefined;
    result.push({ kind, summary });
  }
  return result;
}

// ─── Candidate query ─────────────────────────────────────────────────────────

/**
 * Fetch all (user, assistant) pairs not yet in turn_embeddings.
 *
 * JOIN strategy:
 *   - Self-join ChatMessage um (role='user') with am (role='assistant') in same
 *     thread where am.createdAt = MIN assistant createdAt after um.createdAt.
 *   - LEFT JOIN axhy_chat.turn_embeddings to pre-filter already-embedded turns
 *     (saves API calls; ON CONFLICT handles any race).
 *   - Ordered by (companyId, threadId, um.createdAt) for deterministic batching.
 */
async function fetchCandidates(): Promise<CandidateRow[]> {
  return prisma.$queryRawUnsafe<CandidateRow[]>(`
    SELECT
      um.id                 AS user_message_id,
      am.id                 AS assistant_message_id,
      um."companyId"        AS company_id,
      um."threadId"         AS thread_id,
      ct."supervisorId"     AS supervisor_id,
      um.transcript         AS user_text,
      am."aiResponseText"   AS assistant_text,
      am."toolCalls"        AS tool_calls,
      am."decisionCard"     AS decision_card
    FROM   "axhy"."ChatMessage"  um
    JOIN   "axhy"."ChatThread"   ct ON ct.id = um."threadId"
    JOIN   "axhy"."ChatMessage"  am
           ON  am."threadId"  = um."threadId"
           AND am."createdAt" = (
                 SELECT MIN(inner_am."createdAt")
                 FROM   "axhy"."ChatMessage" inner_am
                 WHERE  inner_am."threadId"  = um."threadId"
                   AND  inner_am.role        = 'assistant'
                   AND  inner_am."createdAt" > um."createdAt"
               )
           AND am.role = 'assistant'
    LEFT JOIN "axhy_chat"."turn_embeddings" te
           ON te.user_message_id = um.id::uuid
    WHERE  um.role   = 'user'
      AND  te.id     IS NULL
    ORDER  BY um."companyId", um."threadId", um."createdAt" ASC
  `);
}

// ─── Dry-run cost estimate ────────────────────────────────────────────────────

function estimateCost(rows: CandidateRow[]): { tokens: number; costInr: number } {
  let totalChars = 0;
  for (const row of rows) {
    const userLen = (row.user_text ?? '').length;
    const assistantLen = (row.assistant_text ?? '').length;
    // Mirror prepareTurnText's cap at 8,000 chars.
    totalChars += Math.min(userLen + assistantLen + 20, 8_000);
  }
  const tokens = Math.ceil(totalChars / CHARS_PER_TOKEN);
  const costInr = (tokens / 1_000) * INR_PER_1K_INPUT_TOKENS;
  return { tokens, costInr };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log.info({ dryRun: DRY_RUN }, '[Backfill] starting turn-embeddings backfill');

  const candidates = await fetchCandidates();
  const total = candidates.length;
  const { tokens, costInr } = estimateCost(candidates);

  log.info(
    { total, estimatedTokens: tokens, estimatedCostInr: costInr.toFixed(4) },
    `[Backfill] found ${total} candidate turns to embed`,
  );

  if (DRY_RUN) {
    console.log(`[Backfill] DRY RUN — ${total} candidate turns identified.`);
    console.log(
      `[Backfill] Estimated cost: ~${tokens.toLocaleString()} tokens → ₹${costInr.toFixed(4)} INR.`,
    );
    console.log('[Backfill] No OpenAI calls made. No rows inserted.');
    await prisma.$disconnect();
    return;
  }

  let embedded = 0;
  let failed = 0;

  for (let batchStart = 0; batchStart < total; batchStart += BATCH_SIZE) {
    const batch = candidates.slice(batchStart, batchStart + BATCH_SIZE);

    for (const row of batch) {
      // Skip turns with no assistant text (failed AI calls, etc.).
      if (!row.assistant_text) {
        log.warn(
          { userMessageId: row.user_message_id, threadId: row.thread_id },
          '[Backfill] skipping turn — no assistant_text',
        );
        continue;
      }

      const input: EmbedTurnInput = {
        companyId: row.company_id,
        supervisorId: row.supervisor_id,
        threadId: row.thread_id,
        userMessageId: row.user_message_id,
        assistantMessageId: row.assistant_message_id,
        userText: row.user_text ?? '',
        assistantText: row.assistant_text,
        toolCalls: extractToolCalls(row.tool_calls),
        decisionCards: extractDecisionCards(row.decision_card),
      };

      try {
        await embedTurnAsync(input);
        embedded++;
      } catch (err) {
        failed++;
        log.error(
          {
            err,
            userMessageId: row.user_message_id,
            threadId: row.thread_id,
            companyId: row.company_id,
          },
          '[Backfill] failed to embed turn — continuing',
        );
      }
    }

    const processed = Math.min(batchStart + BATCH_SIZE, total);
    const pct = Math.round((processed / total) * 100);
    console.log(
      `[Backfill] Processed ${processed}/${total} (${pct}%) — ${embedded} embedded, ${failed} failed`,
    );

    // Rate-limit gap between batches (not after the last batch).
    if (batchStart + BATCH_SIZE < total) {
      await new Promise<void>((resolve) => setTimeout(resolve, BATCH_GAP_MS));
    }
  }

  const actualCostInr = ((embedded * (8_000 / CHARS_PER_TOKEN)) / 1_000) * INR_PER_1K_INPUT_TOKENS;

  console.log(
    `[Backfill] Done. Backfilled ${embedded} turns; failed ${failed}. Estimated cost: ₹${actualCostInr.toFixed(4)}.`,
  );

  log.info(
    { embedded, failed, estimatedCostInr: actualCostInr.toFixed(4) },
    '[Backfill] backfill complete',
  );

  if (total > 0 && failed / total > 0.1) {
    log.error(
      { failureRate: (failed / total).toFixed(2) },
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
