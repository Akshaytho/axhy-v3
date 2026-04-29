/**
 * Unit tests for pricing rules.
 * Pure functions → pure tests; no DB, no network.
 */

import { describe, it, expect } from 'vitest';

import {
  PRICING,
  isVisitBillable,
  computeInvoicePaise,
  paiseToRupees,
  aiCostRatio,
} from './pricing.js';

describe('isVisitBillable', () => {
  it.each([
    ['VERIFIED', true],
    ['FLAGGED', true],
    ['CANCELLED', true],
    ['NO_SHOW', true],
    ['SCHEDULED', false],
    ['IN_PROGRESS', false],
    ['ARCHIVED', false],
  ] as const)('%s -> %s', (state, expected) => {
    expect(isVisitBillable(state)).toBe(expected);
  });
});

describe('computeInvoicePaise', () => {
  it('pilot tenant pays 0', () => {
    const r = computeInvoicePaise({ billableVisits: 1000, isPilot: true });
    expect(r.totalPaise).toBe(0);
    expect(r.pilot).toBe(true);
  });

  it('floor applies when subtotal below ₹2k', () => {
    const r = computeInvoicePaise({ billableVisits: 100, isPilot: false });
    // 100 visits × ₹8 = ₹800 < ₹2000 floor → floor applies
    expect(r.flooredAt).toBe('monthly_floor');
    expect(r.totalPaise).toBe(PRICING.monthlyFloorPaise);
  });

  it('subtotal applies when above floor', () => {
    const r = computeInvoicePaise({ billableVisits: 1000, isPilot: false });
    // 1000 × ₹8 = ₹8000
    expect(r.flooredAt).toBe('subtotal');
    expect(r.totalPaise).toBe(800_000);
  });

  it('per-visit override (enterprise discount)', () => {
    const r = computeInvoicePaise({
      billableVisits: 1000,
      isPilot: false,
      perVisitPaiseOverride: 600,
    });
    expect(r.totalPaise).toBe(600_000); // ₹6 × 1000 = ₹6000
  });

  it('zero visits + non-pilot → floor still applies', () => {
    const r = computeInvoicePaise({ billableVisits: 0, isPilot: false });
    expect(r.totalPaise).toBe(PRICING.monthlyFloorPaise);
  });
});

describe('paiseToRupees', () => {
  it('800 paise = 8 rupees', () => {
    expect(paiseToRupees(800)).toBe(8);
  });
});

describe('aiCostRatio', () => {
  it('30% ratio', () => {
    const r = aiCostRatio({ aiCostPaiseMtd: 30_000, revenuePaiseMtd: 100_000 });
    expect(r).toBe(0.3);
  });

  it('zero revenue → infinity', () => {
    expect(aiCostRatio({ aiCostPaiseMtd: 100, revenuePaiseMtd: 0 })).toBe(Infinity);
  });
});
