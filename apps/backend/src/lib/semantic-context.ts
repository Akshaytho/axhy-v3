/**
 * Semantic context assembly — Phase 2 of vector RAG for chat.
 *
 * Replaces the blind-window `loadPriorMessages` call with a pgvector
 * cosine-similarity search that retrieves the most relevant past turns
 * from `axhy_chat.turn_embeddings`.  Always falls back to `loadPriorMessages`
 * on any error so the chat route is never blocked by embedding issues.
 *
 * Controlled by the `SEMANTIC_CONTEXT_KILL_SWITCH` environment variable
 * (Martin Fowler's "permanent kill switch" pattern — keep the flag
 * forever as an ops control; do NOT delete after measurement passes).
 * Set to `'true'` to ENGAGE the kill switch (fallback to blind window);
 * unset or `'false'` runs semantic retrieval (the post-Phase-5 default).
 *
 * @derives(docs/locked/vector-rag-context-assembly.md §5)
 * @derives(docs/locked/vector-rag-context-assembly.md §6)
 * @derives(docs/locked/vector-rag-context-assembly.md §10)
 * @derives(ADR-0004) — prisma singleton
 * @derives(ADR-0023) — modelFor / embed_general surface via embedText()
 */

import { performance } from 'node:perf_hooks';

import type { Prisma } from '@prisma/client';
import pino from 'pino';

import { embedText } from './openai-embeddings.js';
import { loadPriorMessages } from './prior-messages.js';

const log = pino({ name: 'semantic-context' });

/** Similarity threshold below which turns are not considered relevant. */
const SIMILARITY_THRESHOLD = 0.35;

/** Decision-bearing turns receive this multiplier on their similarity score. */
const DECISION_BOOST = 1.15;

/** Default number of semantic turns to retrieve. */
const DEFAULT_TOP_K = 5;

/** Default recency bonus factor. */
const DEFAULT_RECENCY_BONUS = 0.1;

/** Rough characters-per-token estimate for budget estimation. */
const CHARS_PER_TOKEN = 4;

/** Maximum combined turns returned (semantic + continuity). */
const MAX_TOTAL_TURNS = 6;

/** pgvector query timeout in milliseconds (production default). */
const PGVECTOR_TIMEOUT_MS = 300;

/**
 * Raw cosine-similarity threshold below which a retrieval is flagged as a
 * semantic miss.  Derived from RAG measurement research (getmaxim.ai /
 * futureagi.com / dextralabs): < 0.65 indicates the retrieved context is
 * unlikely to be meaningfully related to the query.
 *
 * @derives(docs/locked/vector-rag-context-assembly.md §13)
 */
const SEMANTIC_MISS_THRESHOLD = 0.65;

// ─── Types ───────────────────────────────────────────────────────────────────

/** Options accepted by assembleSemanticContext(). */
export interface SemanticContextOpts {
  tx: Prisma.TransactionClient;
  companyId: string;
  supervisorId: string;
  /**
   * The current active thread ID. Pass null to let the function discover
   * the most-recent active thread for this (companyId, supervisorId).
   */
  threadId: string | null;
  /** The supervisor's current message text. Used to embed the query. */
  userMessage: string;
  /** Number of semantic turns to retrieve. Default 5. */
  topK?: number;
  /** Recency bonus factor. Default 0.1. */
  recencyBonus?: number;
  /**
   * pgvector query timeout in milliseconds. Default 300ms.
   * Override in integration tests to accommodate remote-DB latency.
   */
  queryTimeoutMs?: number;
}

/**
 * Result returned by assembleSemanticContext().
 *
 * @derives(docs/locked/vector-rag-context-assembly.md §13)
 */
export interface SemanticContextResult {
  priorMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
  entityHints: string | null;
  retrievalMeta: {
    // ── Core ──────────────────────────────────────────────────────────────────
    /** How this result was assembled: semantic search, graceful-degradation fallback, or kill switch engaged. */
    source: 'semantic' | 'fallback' | 'kill_switch';
    /** Number of turns returned directly by the pgvector similarity query. */
    semanticTurnsRetrieved: number;
    /** 1 when the last-turn continuity guarantee was added; 0 otherwise. */
    continuityTurnsAdded: number;
    /** Rough token estimate for the assembled priorMessages (chars / 4). */
    totalTokensEstimate: number;

    // ── Retrieval performance ─────────────────────────────────────────────────
    /** Wall-clock time for the pgvector SQL query in milliseconds. */
    retrievalLatencyMs: number;
    /** Wall-clock time to embed the user query in milliseconds. */
    queryEmbeddingLatencyMs: number;
    /** Candidate turns fetched from the index (the LIMIT passed to pgvector). */
    retrievalTopK: number;
    /** Candidates that made it into context after dedup and threshold filtering. */
    retrievalUsedK: number;

    // ── Quality signals (null when source !== 'semantic') ────────────────────
    /** Highest raw cosine-similarity score across retrieved candidates; null when no candidates returned. */
    maxSimilarityScore: number | null;
    /** Lowest raw cosine-similarity score across retrieved candidates; null when no candidates returned. */
    minSimilarityScore: number | null;
    /** true when maxSimilarityScore < SEMANTIC_MISS_THRESHOLD (0.65), indicating weak retrieval. */
    semanticMiss: boolean;

    // ── Shadow-mode cost comparison ───────────────────────────────────────────
    /**
     * Token estimate for what loadPriorMessages (blind window) would have used.
     * Always computed — even when semantic path runs — so we can measure cost savings.
     * Note: adds ~50–100 ms per request (one extra DB query) during the measurement window.
     */
    baselineWindowTokens: number;
    /** totalTokensEstimate - baselineWindowTokens.  Negative = semantic is cheaper. */
    costDeltaVsBaseline: number;
  };
}

/**
 * A row returned by the semantic search SQL query.
 * Column names match the snake_case DB column names from $queryRawUnsafe.
 */
export interface SemanticTurn {
  user_message_id: string;
  assistant_message_id: string;
  combined_text: string;
  has_decision: boolean;
  tool_names: string[];
  token_count: number;
  created_at: Date;
  score: number;
  /** Raw cosine similarity (1 - distance) before decision-boost or recency-bonus. */
  raw_similarity: number;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Estimate token count for a priorMessages array.
 * Uses CHARS_PER_TOKEN as a rough proxy — actual counting is Phase 3+.
 */
function estimateTokens(messages: Array<{ content: string }>): number {
  const totalChars = messages.reduce((acc, m) => acc + m.content.length, 0);
  return Math.ceil(totalChars / CHARS_PER_TOKEN);
}

/**
 * Resolve the active threadId from the DB when the caller does not supply one.
 * Returns null if no active thread exists for the supervisor.
 */
async function resolveActiveThreadId(
  tx: Prisma.TransactionClient,
  companyId: string,
  supervisorId: string,
): Promise<string | null> {
  const thread = await tx.chatThread.findFirst({
    where: { companyId, supervisorId, archivedAt: null },
    orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
    select: { id: true },
  });
  return thread?.id ?? null;
}

/**
 * Return the IDs of the last (up to) 2 messages in the given thread.
 * Used to exclude those from the semantic search (they are loaded via the
 * continuity turn instead).
 */
async function getLastTwoMessageIds(
  tx: Prisma.TransactionClient,
  companyId: string,
  threadId: string,
): Promise<string[]> {
  const rows = await tx.chatMessage.findMany({
    where: { companyId, threadId },
    orderBy: { createdAt: 'desc' },
    take: 2,
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * Run the pgvector cosine-similarity query against axhy_chat.turn_embeddings.
 *
 * The query is wrapped in Promise.race with a 300 ms timeout so a slow
 * index scan never blocks the chat response.
 *
 * @derives(docs/locked/vector-rag-context-assembly.md §5.3)
 */
async function searchSemanticTurns(
  tx: Prisma.TransactionClient,
  opts: {
    embedding: number[];
    companyId: string;
    supervisorId: string;
    excludeIds: string[];
    topK: number;
    recencyBonus: number;
    timeoutMs: number;
  },
): Promise<SemanticTurn[]> {
  const { embedding, companyId, supervisorId, excludeIds, topK, recencyBonus, timeoutMs } = opts;
  const embeddingLiteral = `[${embedding.join(',')}]`;

  // Build the query dynamically based on how many IDs to exclude.
  // When excludeIds is empty we omit the NOT IN clause entirely so the
  // query planner doesn't need to evaluate an empty IN list.
  let sql: string;
  let params: unknown[];

  if (excludeIds.length === 0) {
    sql = `
      SELECT
        te.user_message_id::text,
        te.assistant_message_id::text,
        te.combined_text,
        te.has_decision,
        te.tool_names,
        te.token_count,
        te.created_at,
        (1 - (te.embedding <=> $1::vector))
          * CASE WHEN te.has_decision THEN ${DECISION_BOOST} ELSE 1.0 END
          + ($4::float * (1.0 / (1.0 + EXTRACT(EPOCH FROM (now() - te.created_at)) / 86400.0)))
          AS score,
        (1 - (te.embedding <=> $1::vector)) AS raw_similarity
      FROM "axhy_chat"."turn_embeddings" te
      WHERE te.company_id = $2::uuid
        AND te.supervisor_id = $3::uuid
        AND (1 - (te.embedding <=> $1::vector)) >= ${SIMILARITY_THRESHOLD}
      ORDER BY score DESC
      LIMIT $5
    `;
    params = [embeddingLiteral, companyId, supervisorId, recencyBonus, topK];
  } else if (excludeIds.length === 1) {
    sql = `
      SELECT
        te.user_message_id::text,
        te.assistant_message_id::text,
        te.combined_text,
        te.has_decision,
        te.tool_names,
        te.token_count,
        te.created_at,
        (1 - (te.embedding <=> $1::vector))
          * CASE WHEN te.has_decision THEN ${DECISION_BOOST} ELSE 1.0 END
          + ($4::float * (1.0 / (1.0 + EXTRACT(EPOCH FROM (now() - te.created_at)) / 86400.0)))
          AS score,
        (1 - (te.embedding <=> $1::vector)) AS raw_similarity
      FROM "axhy_chat"."turn_embeddings" te
      WHERE te.company_id = $2::uuid
        AND te.supervisor_id = $3::uuid
        AND (1 - (te.embedding <=> $1::vector)) >= ${SIMILARITY_THRESHOLD}
        AND te.user_message_id <> $6::uuid
      ORDER BY score DESC
      LIMIT $5
    `;
    params = [embeddingLiteral, companyId, supervisorId, recencyBonus, topK, excludeIds[0]];
  } else {
    // excludeIds.length === 2
    sql = `
      SELECT
        te.user_message_id::text,
        te.assistant_message_id::text,
        te.combined_text,
        te.has_decision,
        te.tool_names,
        te.token_count,
        te.created_at,
        (1 - (te.embedding <=> $1::vector))
          * CASE WHEN te.has_decision THEN ${DECISION_BOOST} ELSE 1.0 END
          + ($4::float * (1.0 / (1.0 + EXTRACT(EPOCH FROM (now() - te.created_at)) / 86400.0)))
          AS score,
        (1 - (te.embedding <=> $1::vector)) AS raw_similarity
      FROM "axhy_chat"."turn_embeddings" te
      WHERE te.company_id = $2::uuid
        AND te.supervisor_id = $3::uuid
        AND (1 - (te.embedding <=> $1::vector)) >= ${SIMILARITY_THRESHOLD}
        AND te.user_message_id NOT IN ($6::uuid, $7::uuid)
      ORDER BY score DESC
      LIMIT $5
    `;
    params = [
      embeddingLiteral,
      companyId,
      supervisorId,
      recencyBonus,
      topK,
      excludeIds[0],
      excludeIds[1],
    ];
  }

  const queryPromise = tx.$queryRawUnsafe<SemanticTurn[]>(sql, ...params);

  const timeoutPromise = new Promise<never>((_, reject) => {
    const t = setTimeout(() => {
      reject(new Error(`pgvector query exceeded ${timeoutMs}ms timeout`));
    }, timeoutMs);
    // Allow Node.js to exit even if the timeout hasn't fired.
    if (typeof (t as unknown as { unref?: () => void }).unref === 'function') {
      (t as unknown as { unref: () => void }).unref();
    }
  });

  return Promise.race([queryPromise, timeoutPromise]);
}

/**
 * Load the last (user, assistant) turn pair from the current thread as the
 * continuity guarantee — the AI never forgets what was said one message ago.
 *
 * Returns null if the thread has no turns yet.
 *
 * @derives(docs/locked/vector-rag-context-assembly.md §5.2 Step 3)
 */
async function loadContinuityTurn(
  tx: Prisma.TransactionClient,
  companyId: string,
  threadId: string,
): Promise<{ userMessageId: string; assistantMessageId: string | null } | null> {
  // Fetch the last 2 messages (user + assistant) from the thread.
  const rows = await tx.chatMessage.findMany({
    where: { companyId, threadId },
    orderBy: { createdAt: 'desc' },
    take: 2,
    select: { id: true, role: true },
  });
  if (rows.length === 0) return null;

  // We expect the most-recent pair to be assistant then user (reversed), or
  // just one message if the thread has only one turn so far.
  const assistantRow = rows.find((r) => r.role === 'assistant');
  const userRow = rows.find((r) => r.role === 'user');
  if (!userRow) return null;

  return {
    userMessageId: userRow.id,
    assistantMessageId: assistantRow?.id ?? null,
  };
}

/**
 * Hydrate a list of (userMessageId, assistantMessageId?) pairs into the
 * priorMessages array format expected by openaiToolLoop.
 *
 * Returns turns in chronological order (oldest → newest).
 */
async function hydrateTurns(
  tx: Prisma.TransactionClient,
  companyId: string,
  turns: ReadonlyArray<{ userMessageId: string; assistantMessageId: string | null }>,
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  if (turns.length === 0) return [];

  const allIds = turns.flatMap((t) =>
    t.assistantMessageId ? [t.userMessageId, t.assistantMessageId] : [t.userMessageId],
  );

  const rows = await tx.chatMessage.findMany({
    where: { id: { in: allIds }, companyId },
    select: { id: true, role: true, transcript: true, aiResponseText: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const byId = new Map(rows.map((r) => [r.id, r]));
  const result: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (const turn of turns) {
    const userMsg = byId.get(turn.userMessageId);
    if (userMsg) {
      const content = userMsg.transcript ?? '';
      if (content.length > 0) {
        result.push({ role: 'user', content });
      }
    }
    if (turn.assistantMessageId) {
      const assistantMsg = byId.get(turn.assistantMessageId);
      if (assistantMsg) {
        const content = assistantMsg.aiResponseText ?? '';
        if (content.length > 0) {
          result.push({ role: 'assistant', content });
        }
      }
    }
  }

  return result;
}

// ─── Exported helpers ────────────────────────────────────────────────────────

/**
 * Extract a brief entity hint block from semantic turns.
 *
 * Phase 2 minimal implementation: scans `tool_names` arrays for
 * 'find_workers' or 'find_sites' tool calls to infer what entities were
 * recently discussed.  Full ID resolution (with worker name + site name
 * from DB) is deferred to Phase 4.
 *
 * Returns null when no relevant tool calls are found.
 *
 * @derives(docs/locked/vector-rag-context-assembly.md §6)
 */
export function extractEntityHints(turns: SemanticTurn[]): string | null {
  let hasWorkerTool = false;
  let hasSiteTool = false;

  for (const turn of turns) {
    for (const toolName of turn.tool_names) {
      if (toolName === 'find_workers') hasWorkerTool = true;
      if (toolName === 'find_sites') hasSiteTool = true;
    }
  }

  if (!hasWorkerTool && !hasSiteTool) return null;

  const parts: string[] = [];
  if (hasWorkerTool) parts.push('Workers recently discussed (see prior messages)');
  if (hasSiteTool) parts.push('Sites recently discussed (see prior messages)');

  return parts.join('. ');
}

// ─── Main entry ──────────────────────────────────────────────────────────────

/**
 * Assemble the semantic context (Tier 5) for a chat message.
 *
 * When `SEMANTIC_CONTEXT_KILL_SWITCH === 'true'` (kill switch engaged),
 * falls back immediately to `loadPriorMessages`. Default (unset or 'false')
 * runs semantic retrieval — the post-Phase-5 default.
 *
 * When the kill switch is disengaged, embeds the user's message, runs the pgvector similarity
 * search, loads the continuity turn, deduplicates, and returns a
 * priorMessages array sorted chronologically.
 *
 * NEVER throws — any error in the semantic path falls back to the blind
 * window so the chat route always works.
 *
 * @derives(docs/locked/vector-rag-context-assembly.md §5)
 * @derives(docs/locked/vector-rag-context-assembly.md §10.2)
 * @derives(docs/locked/vector-rag-context-assembly.md §10.3)
 */
export async function assembleSemanticContext(
  opts: SemanticContextOpts,
): Promise<SemanticContextResult> {
  const {
    tx,
    companyId,
    supervisorId,
    userMessage,
    topK = DEFAULT_TOP_K,
    recencyBonus = DEFAULT_RECENCY_BONUS,
    queryTimeoutMs = PGVECTOR_TIMEOUT_MS,
  } = opts;

  // ── Step 1: Kill switch check ─────────────────────────────────────────────
  // Phase 5 — kill switch (permanent ops control). Engaged when set to 'true'.
  // Default (unset or 'false') runs semantic retrieval.
  // @derives(docs/locked/vector-rag-context-assembly.md §13 Phase 5)
  // @derives Martin Fowler permanent kill switch pattern
  if (process.env.SEMANTIC_CONTEXT_KILL_SWITCH === 'true') {
    // kill switch engaged — fallback to blind window
    const priorMessages = await loadPriorMessages(tx, companyId, supervisorId);
    const totalTokensEstimate = estimateTokens(priorMessages);
    const retrievalMeta = {
      source: 'kill_switch' as const,
      semanticTurnsRetrieved: 0,
      continuityTurnsAdded: 0,
      totalTokensEstimate,
      retrievalLatencyMs: 0,
      queryEmbeddingLatencyMs: 0,
      retrievalTopK: topK,
      retrievalUsedK: 0,
      maxSimilarityScore: null,
      minSimilarityScore: null,
      semanticMiss: false,
      baselineWindowTokens: totalTokensEstimate,
      costDeltaVsBaseline: 0,
    };
    log.info(
      { event: 'retrieval_meta', companyId, supervisorId, ...retrievalMeta },
      'semantic-context: retrieval complete',
    );
    return { priorMessages, entityHints: null, retrievalMeta };
  }

  // ── Steps 2–9: Semantic path (wrapped in try/catch for graceful degradation) ──
  try {
    // Step 2: Embed user message
    const tEmbedStart = performance.now();
    const embedding = await embedText(userMessage);
    const queryEmbeddingLatencyMs = performance.now() - tEmbedStart;

    // Step 3: Resolve active threadId
    const resolvedThreadId =
      opts.threadId !== null
        ? opts.threadId
        : await resolveActiveThreadId(tx, companyId, supervisorId);

    // Step 4: Get last 2 message IDs in current thread (for exclusion)
    const excludeIds =
      resolvedThreadId !== null ? await getLastTwoMessageIds(tx, companyId, resolvedThreadId) : [];

    // Step 5: Run semantic search SQL
    const tQueryStart = performance.now();
    const semanticTurns = await searchSemanticTurns(tx, {
      embedding,
      companyId,
      supervisorId,
      excludeIds,
      topK,
      recencyBonus,
      timeoutMs: queryTimeoutMs,
    });
    const retrievalLatencyMs = performance.now() - tQueryStart;

    // Step 6: Load continuity turn (last turn in current thread)
    const continuityPair =
      resolvedThreadId !== null ? await loadContinuityTurn(tx, companyId, resolvedThreadId) : null;

    // Step 7: Deduplicate + order
    // Build a set of user_message_ids already covered by semantic results.
    const semanticUserIds = new Set(semanticTurns.map((t) => t.user_message_id));

    // Semantic turns ordered by score DESC (already from SQL), then append continuity last.
    const dedupedTurns: Array<{ userMessageId: string; assistantMessageId: string | null }> = [];

    for (const turn of semanticTurns) {
      if (dedupedTurns.length >= MAX_TOTAL_TURNS - 1) break; // leave slot for continuity
      dedupedTurns.push({
        userMessageId: turn.user_message_id,
        assistantMessageId: turn.assistant_message_id,
      });
    }

    let continuityTurnsAdded = 0;
    if (continuityPair !== null && !semanticUserIds.has(continuityPair.userMessageId)) {
      dedupedTurns.push({
        userMessageId: continuityPair.userMessageId,
        assistantMessageId: continuityPair.assistantMessageId,
      });
      continuityTurnsAdded = 1;
    } else if (continuityPair !== null) {
      // It was already in semantic results; count it but don't double-add.
      continuityTurnsAdded = 1;
    }

    // Step 8: Hydrate to priorMessages (chronological order)
    // Sort by created_at so oldest turn comes first.
    const semanticTurnMap = new Map(semanticTurns.map((t) => [t.user_message_id, t.created_at]));

    // For hydration we want chronological order; sort the dedupedTurns by
    // the created_at we know from semanticTurns (continuity turn goes last).
    const hydrateOrder = [...dedupedTurns].sort((a, b) => {
      const aDate = semanticTurnMap.get(a.userMessageId);
      const bDate = semanticTurnMap.get(b.userMessageId);
      if (!aDate && !bDate) return 0;
      if (!aDate) return 1; // continuity turn (no score date) → end
      if (!bDate) return -1;
      return aDate.getTime() - bDate.getTime();
    });

    const priorMessages = await hydrateTurns(tx, companyId, hydrateOrder);

    // Step 9: Extract entity hints
    const entityHints = extractEntityHints(semanticTurns);

    // ── Quality signals ────────────────────────────────────────────────────────
    const rawScores = semanticTurns.map((t) => Number(t.raw_similarity));
    const maxSimilarityScore = rawScores.length > 0 ? Math.max(...rawScores) : null;
    const minSimilarityScore = rawScores.length > 0 ? Math.min(...rawScores) : null;
    const semanticMiss =
      maxSimilarityScore !== null && maxSimilarityScore < SEMANTIC_MISS_THRESHOLD;

    const totalTokensEstimate = estimateTokens(priorMessages);
    const retrievalTopK = topK;
    // Each turn in priorMessages represents one (user, assistant) pair; divide by 2 for turn count.
    const retrievalUsedK = Math.ceil(priorMessages.length / 2);

    // ── Shadow-mode baseline (cost comparison) ─────────────────────────────────
    // Compute what the blind-window path would have used, even though we ran the
    // semantic path. This enables 24h rolling cost-delta alerting from logs alone.
    // Adds ~50–100 ms per request (one extra DB query) during the measurement window.
    let baselineWindowTokens = 0;
    try {
      const baselineMessages = await loadPriorMessages(tx, companyId, supervisorId);
      baselineWindowTokens = estimateTokens(baselineMessages);
    } catch (baselineErr) {
      log.warn(
        { err: baselineErr, companyId, supervisorId, event: 'shadow_baseline_failed' },
        'semantic-context: shadow baseline query failed, cost delta will be 0',
      );
    }

    const costDeltaVsBaseline = totalTokensEstimate - baselineWindowTokens;

    log.info(
      {
        event: 'semantic_context_assembled',
        companyId,
        supervisorId,
        semanticTurnsRetrieved: semanticTurns.length,
        continuityTurnsAdded,
        retrievalLatencyMs,
        queryEmbeddingLatencyMs,
        entityHints: entityHints !== null,
      },
      'semantic-context: assembled successfully',
    );

    const retrievalMeta = {
      source: 'semantic' as const,
      semanticTurnsRetrieved: semanticTurns.length,
      continuityTurnsAdded,
      totalTokensEstimate,
      retrievalLatencyMs,
      queryEmbeddingLatencyMs,
      retrievalTopK,
      retrievalUsedK,
      maxSimilarityScore,
      minSimilarityScore,
      semanticMiss,
      baselineWindowTokens,
      costDeltaVsBaseline,
    };

    log.info(
      { event: 'retrieval_meta', companyId, supervisorId, ...retrievalMeta },
      'semantic-context: retrieval complete',
    );

    return { priorMessages, entityHints, retrievalMeta };
  } catch (err) {
    log.warn(
      { err, companyId, supervisorId, event: 'semantic_context_fallback' },
      'semantic-context: error in semantic path, falling back to blind window',
    );

    const priorMessages = await loadPriorMessages(tx, companyId, supervisorId);
    const totalTokensEstimate = estimateTokens(priorMessages);
    // When falling back, baseline === semantic path result; cost delta is 0.
    const retrievalMeta = {
      source: 'fallback' as const,
      semanticTurnsRetrieved: 0,
      continuityTurnsAdded: 0,
      totalTokensEstimate,
      retrievalLatencyMs: 0,
      queryEmbeddingLatencyMs: 0,
      retrievalTopK: topK,
      retrievalUsedK: 0,
      maxSimilarityScore: null,
      minSimilarityScore: null,
      semanticMiss: false,
      baselineWindowTokens: totalTokensEstimate,
      costDeltaVsBaseline: 0,
    };
    log.info(
      { event: 'retrieval_meta', companyId, supervisorId, ...retrievalMeta },
      'semantic-context: retrieval complete',
    );
    return { priorMessages, entityHints: null, retrievalMeta };
  }
}
