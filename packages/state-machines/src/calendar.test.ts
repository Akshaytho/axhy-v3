import { describe, it, expect } from 'vitest';

import {
  computeEditableUntil,
  canEdit,
  canPromote,
  mapCalendarPayloadToAssignment,
} from './calendar.js';

describe('computeEditableUntil', () => {
  it('returns createdAt + 30 days when not promoted', () => {
    const created = new Date('2026-05-09T00:00:00Z');
    const result = computeEditableUntil(created, null);
    expect(result.toISOString()).toBe('2026-06-08T00:00:00.000Z');
  });

  it('returns promotedAt when promoted before 30 days', () => {
    const created = new Date('2026-05-09T00:00:00Z');
    const promoted = new Date('2026-05-12T10:30:00Z');
    const result = computeEditableUntil(created, promoted);
    expect(result.toISOString()).toBe('2026-05-12T10:30:00.000Z');
  });
});

describe('canEdit', () => {
  it('blocks if past editableUntil', () => {
    const now = new Date('2026-06-09T00:00:00Z');
    const editableUntil = new Date('2026-06-08T00:00:00Z');
    expect(canEdit(editableUntil, null, now)).toBe(false);
  });
  it('blocks if already promoted', () => {
    const now = new Date('2026-05-15T00:00:00Z');
    const editableUntil = new Date('2026-06-08T00:00:00Z');
    expect(canEdit(editableUntil, new Date('2026-05-14T00:00:00Z'), now)).toBe(false);
  });
  it('allows otherwise', () => {
    const now = new Date('2026-05-15T00:00:00Z');
    expect(canEdit(new Date('2026-06-08T00:00:00Z'), null, now)).toBe(true);
  });
});

describe('canPromote', () => {
  it('NOTE cannot promote', () => {
    expect(canPromote('NOTE', 'assignment')).toBe(false);
  });
  it('TENTATIVE_ASSIGNMENT to assignment ok', () => {
    expect(canPromote('TENTATIVE_ASSIGNMENT', 'assignment')).toBe(true);
  });
  it('DEMAND to requirement ok', () => {
    expect(canPromote('DEMAND', 'requirement')).toBe(true);
  });
  it('EVENT to change_request blocked', () => {
    expect(canPromote('EVENT', 'change_request')).toBe(false);
  });
});

describe('mapCalendarPayloadToAssignment', () => {
  it('maps TENTATIVE_ASSIGNMENT payload to Assignment fields with single-day shorthand', () => {
    const result = mapCalendarPayloadToAssignment(
      { workerId: 'w1', siteId: 's1', shiftStart: '09:00', shiftEnd: '17:00' },
      new Date('2026-05-12T00:00:00Z'),
      { extraFields: { validUntil: null } },
    );
    expect(result).toEqual({
      workerId: 'w1',
      siteId: 's1',
      shiftStart: '09:00',
      shiftEnd: '17:00',
      // 2026-05-12 is a Tuesday; dayMask "_T_____" places T at position 1 (Mon=0)
      dayMask: '_T_____',
      validFrom: new Date('2026-05-12T00:00:00Z'),
      validUntil: null,
    });
  });
});
