import { describe, it, expect } from 'vitest';

import { detectConflicts, type ActiveAssignmentRow } from './conflicts.js';

const baseRow: ActiveAssignmentRow = {
  id: 'a1',
  workerId: 'w1',
  siteId: 's1',
  shiftStart: '09:00',
  shiftEnd: '17:00',
  dayMask: 'MTWTFS_',
  validFrom: new Date('2026-05-01'),
  validUntil: null,
  state: 'ACTIVE',
};

describe('detectConflicts', () => {
  it('returns no conflicts when worker has no active assignments', () => {
    const conflicts = detectConflicts(
      {
        workerId: 'w1',
        dateRange: { from: new Date('2026-05-12'), to: null },
        newShift: { shiftStart: '12:00', shiftEnd: '16:00', dayMask: 'MTWTFS_' },
      },
      { activeAssignments: [], visits: [], calendarEntries: [], changeRequests: [] },
    );
    expect(conflicts).toEqual([]);
  });

  it('flags SOFT conflict when shift overlaps on shared days at different site', () => {
    const conflicts = detectConflicts(
      {
        workerId: 'w1',
        dateRange: { from: new Date('2026-05-12'), to: null },
        newShift: { shiftStart: '12:00', shiftEnd: '16:00', dayMask: 'MTWTFS_' },
      },
      { activeAssignments: [baseRow], visits: [], calendarEntries: [], changeRequests: [] },
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.severity).toBe('SOFT');
    expect(conflicts[0]?.kind).toBe('WORKER_DOUBLE_BOOK');
  });

  it('flags HARD conflict when assignment is exact duplicate', () => {
    const conflicts = detectConflicts(
      {
        workerId: 'w1',
        dateRange: { from: new Date('2026-05-12'), to: null },
        newShift: { shiftStart: '09:00', shiftEnd: '17:00', dayMask: 'MTWTFS_' },
      },
      { activeAssignments: [baseRow], visits: [], calendarEntries: [], changeRequests: [] },
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.severity).toBe('HARD');
    expect(conflicts[0]?.kind).toBe('EXACT_DUPLICATE');
  });

  it('returns no conflicts when day-of-week masks do not intersect', () => {
    const conflicts = detectConflicts(
      {
        workerId: 'w1',
        dateRange: { from: new Date('2026-05-12'), to: null },
        newShift: { shiftStart: '09:00', shiftEnd: '17:00', dayMask: '______S' },
      },
      { activeAssignments: [baseRow], visits: [], calendarEntries: [], changeRequests: [] },
    );
    expect(conflicts).toEqual([]);
  });

  it('returns no conflicts when date ranges do not overlap', () => {
    const conflicts = detectConflicts(
      {
        workerId: 'w1',
        dateRange: { from: new Date('2027-01-01'), to: null },
        newShift: { shiftStart: '09:00', shiftEnd: '17:00', dayMask: 'MTWTFS_' },
      },
      {
        activeAssignments: [{ ...baseRow, validUntil: new Date('2026-12-31') }],
        visits: [],
        calendarEntries: [],
        changeRequests: [],
      },
    );
    expect(conflicts).toEqual([]);
  });

  it('ignores assignments not in ACTIVE state', () => {
    const conflicts = detectConflicts(
      {
        workerId: 'w1',
        dateRange: { from: new Date('2026-05-12'), to: null },
        newShift: { shiftStart: '12:00', shiftEnd: '16:00', dayMask: 'MTWTFS_' },
      },
      {
        activeAssignments: [{ ...baseRow, state: 'TERMINATED' }],
        visits: [],
        calendarEntries: [],
        changeRequests: [],
      },
    );
    expect(conflicts).toEqual([]);
  });

  it('ignores other workers', () => {
    const conflicts = detectConflicts(
      {
        workerId: 'w2',
        dateRange: { from: new Date('2026-05-12'), to: null },
        newShift: { shiftStart: '12:00', shiftEnd: '16:00', dayMask: 'MTWTFS_' },
      },
      { activeAssignments: [baseRow], visits: [], calendarEntries: [], changeRequests: [] },
    );
    expect(conflicts).toEqual([]);
  });
});
