import { describe, it, expect } from 'vitest';

import { canTransition, dayMaskFromDate, expandOneOffToRecurring } from './assignment.js';

describe('canTransition', () => {
  it('DRAFT → ACTIVE allowed', () => {
    expect(canTransition('DRAFT', 'ACTIVE')).toBe(true);
  });
  it('DRAFT → TERMINATED allowed', () => {
    expect(canTransition('DRAFT', 'TERMINATED')).toBe(true);
  });
  it('ACTIVE → TERMINATED allowed', () => {
    expect(canTransition('ACTIVE', 'TERMINATED')).toBe(true);
  });
  it('TERMINATED → ACTIVE blocked (terminal state)', () => {
    expect(canTransition('TERMINATED', 'ACTIVE')).toBe(false);
  });
  it('TERMINATED → DRAFT blocked (terminal state)', () => {
    expect(canTransition('TERMINATED', 'DRAFT')).toBe(false);
  });
  it('ACTIVE → DRAFT blocked (no going back)', () => {
    expect(canTransition('ACTIVE', 'DRAFT')).toBe(false);
  });
});

describe('dayMaskFromDate', () => {
  it('Tuesday 2026-05-12 → "_T_____"', () => {
    const result = dayMaskFromDate(new Date('2026-05-12T00:00:00Z'));
    expect(result).toBe('_T_____');
  });
  it('Sunday 2026-05-17 → "______S"', () => {
    const result = dayMaskFromDate(new Date('2026-05-17T00:00:00Z'));
    expect(result).toBe('______S');
  });
});

describe('expandOneOffToRecurring', () => {
  it('expands oneOffDate to validFrom=validUntil + day-of-week dayMask', () => {
    const result = expandOneOffToRecurring({
      workerId: 'w1',
      siteId: 's1',
      oneOffDate: '2026-05-12',
      shiftStart: '09:00',
      shiftEnd: '17:00',
    });
    expect(result.validFrom).toBe('2026-05-12');
    expect(result.validUntil).toBe('2026-05-12');
    expect(result.dayMask).toBe('_T_____');
  });
});
