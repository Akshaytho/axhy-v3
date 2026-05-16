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
 * @derives(spec-2 §8.1)
 */
export const CHAT_HISTORY_TURN_WINDOW = 10;
