/**
 * @axhy/ai-tools — typed errors thrown by the gateway.
 *
 * Routes catch these and map to HTTP status codes.
 *
 * @derives(spec-2 §9.2, §9.4)
 * @derives(ADR-0018) — extends @axhy/errors AxhyError convention
 * @derives(ADR-0023)
 */

import { AxhyError } from '@axhy/errors';

/**
 * Thrown when a tenant's projected daily AI spend (current + estimated) would
 * exceed the hard cap (`PRICING.aiBudgetDailyCapPaise`). The chat route
 * catches this and returns HTTP 429 with body `{ error: 'AI_BUDGET_EXCEEDED' }`.
 *
 * Mobile UI distinguishes this from network/503-retry via the typed
 * `AIBudgetExceededError` class on the client side and renders an amber
 * "try tomorrow" banner with the input disabled and no retry button.
 */
export class AICostBudgetError extends AxhyError {
  readonly companyId: string;
  readonly currentSpendInr: number;
  readonly capInr: number;
  readonly attemptedCostInr: number;

  constructor(args: {
    companyId: string;
    currentSpendInr: number;
    capInr: number;
    attemptedCostInr: number;
  }) {
    super(
      'AI_BUDGET_EXCEEDED',
      `Tenant ${args.companyId} reached daily AI budget: ` +
        `current ₹${args.currentSpendInr.toFixed(2)} + ` +
        `attempted ₹${args.attemptedCostInr.toFixed(4)} ≥ ` +
        `cap ₹${args.capInr.toFixed(2)}.`,
    );
    this.name = 'AICostBudgetError';
    this.companyId = args.companyId;
    this.currentSpendInr = args.currentSpendInr;
    this.capInr = args.capInr;
    this.attemptedCostInr = args.attemptedCostInr;
  }
}
