/**
 * @axhy/ai-tools
 *
 * Wrappers around Anthropic, OpenAI, and Sarvam. Enforces rate limits,
 * cost tracking, and untrusted-content tagging at the boundary.
 *
 * @derives(ADR-0010)
 * @derives(ADR-0023)
 */

export const PACKAGE_NAME = '@axhy/ai-tools' as const;

export { modelFor, assertWithinBudget, tokenCostInrFor, ALL_SURFACES } from './model-policy.js';
export type { AISurface, AIVendor, ModelChoice, TenantBudgetCtx } from './model-policy.js';

export { AICostBudgetError } from './errors.js';

export {
  incrementSpend,
  dispatchBudgetAlert,
  OUTBOX_TOPIC_BUDGET_WARN,
  OUTBOX_TOPIC_BUDGET_CAPPED,
} from './cost-tracking.js';
export type { BudgetAlertKind, DbClient } from './cost-tracking.js';

export * from './tools/assignment.js';
export * from './tools/calendar.js';
export * from './tools/leave.js';
export * from './tools/living-doc.js';
export * from './tools/mark-absent.js';
export * from './tools/read.js';
export * from './tools/swap.js';
export * from './tools/termination.js';
export * from './sonnet-tool-loop.js';
export * from './openai-tool-loop.js';
