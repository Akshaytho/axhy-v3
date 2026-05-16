/**
 * @axhy/business-rules — Pricing
 *
 * Pure functions for computing tenant invoices and worker payroll.
 * No I/O. Inputs in, decisions out.
 *
 * @derives(ADR-0008) — Pure-function business rules
 * @derives(master-plan §B) — Pricing locked
 *
 * Pricing locks (master plan §B):
 *   - ₹8/visit completed (all visits billable: verified, flagged, cancelled, no-show)
 *   - ₹10/visit for long-duration tasks (deferred until "long-duration" defined)
 *   - ₹2,000/month tenant floor
 *   - First 30 days: founder-led pilot, no auto-billing
 *   - 30-day NET payment after pilot
 *   - AI cost capped at ₹5,000/month per customer (target, embedded in pricing)
 */

import type { VisitStateValue } from '@axhy/state-machines';

// Defined locally (not imported from @axhy/state-machines) so this rule pack
// stays self-contained in tests without cross-package transform setup.
// Must stay in sync with @axhy/state-machines BILLABLE_VISIT_STATES.
//
// @derives(master-plan §B)
const BILLABLE_VISIT_STATES: ReadonlyArray<VisitStateValue> = [
  'VERIFIED',
  'FLAGGED',
  'CANCELLED',
  'NO_SHOW',
];

export const PRICING = {
  perVisitPaise: 800, // ₹8.00 = 800 paise
  perLongVisitPaise: 1000, // ₹10.00 = 1000 paise (deferred)
  monthlyFloorPaise: 200_000, // ₹2,000.00 = 200,000 paise
  pilotDays: 30,
  netDays: 30,
  aiCostCapPaisePerMonth: 500_000, // ₹5,000.00 = 500,000 paise
  // Daily anomaly stop — Spec 2 §9 (founder-locked 2026-05-10).
  // Distinct from aiCostCapPaisePerMonth (pricing target, untouched in Wave 4b).
  // Daily caps catch a single runaway day; monthly cap is the pricing-anchor.
  // @derives(spec-2 §9.5)
  aiBudgetDailyWarnPaise: 300_000, // ₹3,000.00 — soft warn → owner outbox
  aiBudgetDailyCapPaise: 500_000, // ₹5,000.00 — hard cap → AICostBudgetError → 429
} as const;

/**
 * Is this visit billable, given its terminal state?
 * Per master plan §B: ALL terminal visit states are billable.
 *
 * @derives(master-plan §B)
 */
export function isVisitBillable(state: VisitStateValue): boolean {
  return BILLABLE_VISIT_STATES.includes(state);
}

/**
 * Compute the per-period invoice for a tenant.
 *
 * Returns total in paise, and a breakdown the admin UI can display.
 * Apply the monthly floor only when raw subtotal is below it.
 *
 * Pilot tenants: returns 0 with `pilot: true` flag.
 *
 * @derives(master-plan §B)
 */
export function computeInvoicePaise(input: {
  /** number of visits in billable terminal states */
  billableVisits: number;
  /** is the tenant currently inside their 30-day pilot window? */
  isPilot: boolean;
  /** override per-visit price (e.g. enterprise discount); defaults to PRICING.perVisitPaise */
  perVisitPaiseOverride?: number;
}): {
  subtotalPaise: number;
  flooredAt: 'subtotal' | 'monthly_floor';
  totalPaise: number;
  pilot: boolean;
} {
  if (input.isPilot) {
    return { subtotalPaise: 0, flooredAt: 'subtotal', totalPaise: 0, pilot: true };
  }
  const perVisit = input.perVisitPaiseOverride ?? PRICING.perVisitPaise;
  const subtotal = Math.max(0, input.billableVisits) * perVisit;
  if (subtotal < PRICING.monthlyFloorPaise) {
    return {
      subtotalPaise: subtotal,
      flooredAt: 'monthly_floor',
      totalPaise: PRICING.monthlyFloorPaise,
      pilot: false,
    };
  }
  return { subtotalPaise: subtotal, flooredAt: 'subtotal', totalPaise: subtotal, pilot: false };
}

/**
 * Convert paise → rupees for display. NEVER use for math; lossy at edges.
 *
 * @derives(master-plan §B)
 */
export function paiseToRupees(paise: number): number {
  return paise / 100;
}

/**
 * Convert INR rupees → paise (rounded to nearest paise). Use when serializing
 * a rupee-denominated number into the paise-int convention used by PRICING
 * constants and downstream cost-tracking math.
 *
 * @derives(master-plan §B)
 */
export function paiseFromInr(inr: number): number {
  return Math.round(inr * 100);
}

/**
 * Convert paise → INR rupees. Lossless when input is an exact paise integer;
 * preferred over `paiseToRupees` for numeric ratio comparisons against INR-
 * denominated thresholds (e.g. comparing tenant aiSpendDailyInr against the
 * paise-encoded daily cap).
 *
 * @derives(master-plan §B)
 */
export function inrFromPaise(paise: number): number {
  return paise / 100;
}

/**
 * Estimate AI cost share of a tenant's monthly revenue. Used by the AI cost
 * dashboard alarm (per master plan §E: alert if AI > 30% of revenue).
 *
 * Returns the ratio AI/revenue (0.30 = 30%).
 *
 * @derives(master-plan §E)
 */
export function aiCostRatio(input: { aiCostPaiseMtd: number; revenuePaiseMtd: number }): number {
  if (input.revenuePaiseMtd <= 0) return Infinity;
  return input.aiCostPaiseMtd / input.revenuePaiseMtd;
}
