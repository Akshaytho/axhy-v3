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
