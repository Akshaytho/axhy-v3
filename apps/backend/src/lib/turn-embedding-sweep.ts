/**
 * Shared sweep logic for backfill and nightly sweep scripts.
 *
 * Finds (user, assistant) ChatMessage pairs that are missing a matching
 * `axhy_chat.turn_embeddings` row and re-embeds them. Extracted from the
 * one-time backfill script so both scripts share a single implementation.
 *
 * @derives(docs/locked/vector-rag-context-assembly.md §4.5)
 * @derives(ADR-0023) — model-policy / embed_general surface
 * @derives(docs/plans/2026-05-20-vector-rag-wave-a3-phase-1.md §2.5)
 */

import type { Logger } from 'pino';

import { prisma } from './prisma.js';
import { embedTurnAsync, type EmbedTurnInput } from './turn-embedder.js';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Cost constant: text-embedding-3-small at $0.02/1M tokens × 84 INR/USD.
 * @derives(docs/locked/vector-rag-context-assembly.md §8.4)
 * @derives(ADR-0023) — model-policy / embed_general surface
 */
export const INR_PER_1K_INPUT_TOKENS = 0.00168;

/**
 * Rough chars-per-token (mirrors CHARS_PER_TOKEN in turn-embedder.ts).
 * @derives(docs/locked/vector-rag-context-assembly.md §4.4)
 * @derives(ADR-0023) — model-policy / embed_general surface
 */
export const CHARS_PER_TOKEN = 4;

/**
 * Default batch size for sweep — 50 turns per batch matches the OpenAI
 * Tier 3 RPM budget headroom.
 * @derives(docs/locked/vector-rag-context-assembly.md §4.5)
 * @derives(ADR-0023) — model-policy / embed_general surface
 */
export const DEFAULT_BATCH_SIZE = 50;

/**
 * Default inter-batch gap (1s) → max 3000 turns/minute, well under Tier 3.
 * @derives(docs/locked/vector-rag-context-assembly.md §4.5)
 * @derives(ADR-0023) — model-policy / embed_general surface
 */
export const DEFAULT_BATCH_GAP_MS = 1_000;

// ─── Row types ────────────────────────────────────────────────────────────────

/**
 * Shape of a missing-embedding candidate row from `fetchMissingCandidates`.
 * Column names are snake_case because they come from raw SQL.
 * @derives(docs/locked/vector-rag-context-assembly.md §4.5)
 * @derives(ADR-0023) — model-policy / embed_general surface
 */
export interface CandidateRow {
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

// ─── Sweep result ─────────────────────────────────────────────────────────────

/**
 * Summary returned by `runMissingSweep` for the calling script's exit code
 * and cost-reporting logic.
 * @derives(docs/locked/vector-rag-context-assembly.md §13 Phase 6)
 * @derives(ADR-0023) — model-policy / embed_general surface
 */
export interface SweepResult {
  total: number;
  embedded: number;
  failed: number;
  estimatedCostInr: number;
}

// ─── Options ──────────────────────────────────────────────────────────────────

/**
 * Configuration knobs for the sweep runner. Sensible defaults exposed via
 * `DEFAULT_BATCH_*` constants above.
 * @derives(docs/locked/vector-rag-context-assembly.md §13 Phase 6)
 * @derives(ADR-0023) — model-policy / embed_general surface
 */
export interface RunSweepOptions {
  batchSize?: number;
  batchGapMs?: number;
  dryRun?: boolean;
  log: Logger;
  /** Called after each batch to report progress. Receives processed/total counts. */
  onBatchProgress?: (processed: number, total: number, embedded: number, failed: number) => void;
}

// ─── Helper: safe tool-call extraction ───────────────────────────────────────

/**
 * Safely extracts `{ name, input }` pairs from the assistant's `toolCalls`
 * JSON column. The column may be null, a single object, or an array; we
 * guard every step so a malformed row never crashes the sweep.
 * @derives(docs/locked/vector-rag-context-assembly.md §4.4)
 * @derives(ADR-0023) — model-policy / embed_general surface
 */
export function extractToolCalls(
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
 * @derives(docs/locked/vector-rag-context-assembly.md §4.4)
 * @derives(ADR-0023) — model-policy / embed_general surface
 */
export function extractDecisionCards(
  raw: unknown,
): ReadonlyArray<{ kind?: string; summary?: string }> {
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

// ─── Candidate query ──────────────────────────────────────────────────────────

/**
 * Fetch all (user, assistant) pairs not yet in turn_embeddings.
 *
 * JOIN strategy:
 *   - Self-join ChatMessage um (role='user') with am (role='assistant') in same
 *     thread where am.createdAt = MIN assistant createdAt after um.createdAt.
 *   - LEFT JOIN axhy_chat.turn_embeddings to pre-filter already-embedded turns
 *     (saves API calls; ON CONFLICT handles any race).
 *   - Ordered by (companyId, threadId, um.createdAt) for deterministic batching.
 *
 * @derives(docs/locked/vector-rag-context-assembly.md §4.5)
 * @derives(ADR-0023) — model-policy / embed_general surface
 * @derives(docs/locked/vector-rag-context-assembly.md §13 Phase 6)
 * @derives(ADR-0023) — model-policy / embed_general surface
 */
export async function fetchMissingCandidates(): Promise<CandidateRow[]> {
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

// ─── Cost estimate ────────────────────────────────────────────────────────────

/**
 * Rough cost-estimate for a candidate-row set. Uses the per-turn 8000-char
 * ceiling from `prepareTurnText` as the upper bound; actual run cost is
 * typically much lower since most turns are short.
 * @derives(docs/locked/vector-rag-context-assembly.md §8.4)
 * @derives(ADR-0023) — model-policy / embed_general surface
 */
export function estimateCost(rows: CandidateRow[]): { tokens: number; costInr: number } {
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

// ─── Core sweep runner ────────────────────────────────────────────────────────

/**
 * Finds missing turn_embeddings rows and re-embeds them in batches.
 *
 * Idempotent — relies on ON CONFLICT (user_message_id) DO NOTHING in
 * embedTurnAsync. Safe to re-run any number of times.
 *
 * Returns a SweepResult summary; does NOT call prisma.$disconnect() —
 * callers own the connection lifecycle.
 *
 * @derives(docs/locked/vector-rag-context-assembly.md §4.5)
 * @derives(ADR-0023) — model-policy / embed_general surface
 * @derives(docs/locked/vector-rag-context-assembly.md §13 Phase 6)
 * @derives(ADR-0023) — model-policy / embed_general surface
 */
export async function runMissingSweep(opts: RunSweepOptions): Promise<SweepResult> {
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;
  const batchGapMs = opts.batchGapMs ?? DEFAULT_BATCH_GAP_MS;
  const { dryRun = false, log } = opts;

  const candidates = await fetchMissingCandidates();
  const total = candidates.length;
  const { tokens, costInr } = estimateCost(candidates);

  log.info(
    { total, estimatedTokens: tokens, estimatedCostInr: costInr.toFixed(4), dryRun },
    '[Sweep] found candidate turns to embed',
  );

  if (dryRun) {
    return { total, embedded: 0, failed: 0, estimatedCostInr: costInr };
  }

  let embedded = 0;
  let failed = 0;

  for (let batchStart = 0; batchStart < total; batchStart += batchSize) {
    const batch = candidates.slice(batchStart, batchStart + batchSize);

    for (const row of batch) {
      // Skip turns with no assistant text (failed AI calls, etc.).
      if (!row.assistant_text) {
        log.warn(
          { userMessageId: row.user_message_id, threadId: row.thread_id },
          '[Sweep] skipping turn — no assistant_text',
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
          '[Sweep] failed to embed turn — continuing',
        );
      }
    }

    const processed = Math.min(batchStart + batchSize, total);
    opts.onBatchProgress?.(processed, total, embedded, failed);

    // Rate-limit gap between batches (not after the last batch).
    if (batchStart + batchSize < total) {
      await new Promise<void>((resolve) => setTimeout(resolve, batchGapMs));
    }
  }

  // Actual cost uses average token estimate per embedded turn.
  const actualCostInr =
    embedded > 0 ? ((embedded * (8_000 / CHARS_PER_TOKEN)) / 1_000) * INR_PER_1K_INPUT_TOKENS : 0;

  return { total, embedded, failed, estimatedCostInr: actualCostInr };
}
