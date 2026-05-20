/**
 * @axhy/business-rules — AI budget + chat surface constants
 *
 * Centralized constants that govern chat surface behavior. Moved here
 * from per-file literals during Wave 4b Phase 2.5 cleanup so a single
 * edit changes the policy across backend + ai-tools.
 *
 * NOT for tenant-overridable values (those live on Company columns
 * eventually). These are CROSS-tenant defaults.
 *
 * @derives(master-plan §B) — AI cost / pricing target
 * @derives(ADR-0023)
 * @derives(spec-2 §8)
 */

/**
 * Number of days back to load CalendarEntry rows for Tier 3 chat
 * prompt context. 30 days = a typical supervisor's planning horizon
 * (per Spec 2 §8.1).
 *
 * @derives(spec-2 §8.1)
 */
export const CALENDAR_LOOKBACK_DAYS = 30;

/**
 * Cap on the number of CalendarEntry rows injected into the Tier 3
 * prompt block. Protects against pathological tenants creating dozens
 * of entries per day (would otherwise bloat the system prompt and
 * burn tokens).
 *
 * @derives(spec-2 §8.1)
 */
export const CALENDAR_MAX_ENTRIES = 50;

/**
 * `max_completion_tokens` parameter passed to OpenAI chat completions.
 * 1500 tokens is enough for a multi-paragraph response with several
 * tool calls. Increase only after measuring real-tenant data; per-call
 * cost scales linearly with this number.
 *
 * @derives(spec-2 §8.1)
 * @derives(master-plan §B) — AI cost cap discipline
 */
export const CHAT_MAX_COMPLETION_TOKENS = 1500;

/**
 * Number of prior chat turns loaded for the model's `priorMessages`
 * (Tier 3b context). Larger window = better continuity, but more
 * tokens per call. 10 turns balances day-365 magic ("the AI knows what
 * I said yesterday") against cost discipline.
 *
 * Wave A.3 Phase 2 — when `SEMANTIC_CONTEXT_ENABLED='true'`, this
 * blind-window value applies only on the fallback path. The semantic
 * retrieval path uses `SEMANTIC_CONTEXT_TOP_K + 1 continuity` instead.
 *
 * @derives(spec-2 §8.1)
 * @derives(docs/locked/vector-rag-context-assembly.md §5.2)
 */
export const CHAT_HISTORY_TURN_WINDOW = 10;

/**
 * Wave A.3 Phase 2 — top-K result count from the semantic-retrieval
 * pgvector search over `axhy_chat.turn_embeddings`. 5 semantic turns +
 * 1 continuity turn = 6 priorMessages total, ~750 tokens vs 1500 for the
 * blind 10-turn window. Saves ~500 tokens per call.
 *
 * Tunable in Phase 3 measurement window.
 *
 * @derives(docs/locked/vector-rag-context-assembly.md §5.2 + §9.4)
 */
export const SEMANTIC_CONTEXT_TOP_K = 5;

/**
 * Wave A.3 Phase 2 — minimum cosine similarity (1 - distance) for a
 * past turn to qualify for retrieval. 0.35 is the spec default; raise
 * for stricter retrieval, lower for broader recall. Tunable in Phase 3.
 *
 * The continuity turn (last 1 turn in current thread) is loaded
 * regardless of similarity — this threshold only gates the semantic pool.
 *
 * @derives(docs/locked/vector-rag-context-assembly.md §5.2 + §5.3 + §9.4)
 */
export const SEMANTIC_SIMILARITY_THRESHOLD = 0.35;

/**
 * Wave A.3 Phase 2 — recency bonus weight applied to semantic-similarity
 * score. Today's turn gets +0.1, yesterday's +0.05, week-old +0.0125.
 * Gentle preference for recent turns when semantic scores are close.
 *
 * @derives(docs/locked/vector-rag-context-assembly.md §5.2)
 */
export const SEMANTIC_RECENCY_BONUS = 0.1;

/**
 * Wave A.3 Phase 2 — decision-bearing turns get a 1.15x multiplier on
 * their similarity score. Past actions are more valuable context than
 * informational chit-chat.
 *
 * @derives(docs/locked/vector-rag-context-assembly.md §5.2)
 */
export const SEMANTIC_DECISION_BOOST = 1.15;
