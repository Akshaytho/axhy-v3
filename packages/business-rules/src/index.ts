/**
 * @axhy/business-rules
 *
 * Pure-function business rules. No I/O, no async I/O, no AI. Inputs in, decisions out.
 *
 * @derives(ADR-0008)
 */

export const PACKAGE_NAME = '@axhy/business-rules' as const;

export {
  PRICING,
  isVisitBillable,
  computeInvoicePaise,
  paiseToRupees,
  paiseFromInr,
  inrFromPaise,
  aiCostRatio,
} from './pricing.js';

export {
  CALENDAR_LOOKBACK_DAYS,
  CALENDAR_MAX_ENTRIES,
  CHAT_MAX_COMPLETION_TOKENS,
  CHAT_HISTORY_TURN_WINDOW,
} from './ai-budget.js';
