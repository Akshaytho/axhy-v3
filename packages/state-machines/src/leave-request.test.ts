import { describe, it, expect } from 'vitest';

import {
  canTransition,
  assertTransition,
  isTerminal,
  type LeaveRequestState,
} from './leave-request.js';

describe('leaveRequest canTransition', () => {
  it('REQUESTED → APPROVED allowed', () => {
    expect(canTransition('REQUESTED', 'APPROVED')).toBe(true);
  });
  it('REQUESTED → REJECTED allowed', () => {
    expect(canTransition('REQUESTED', 'REJECTED')).toBe(true);
  });
  it('APPROVED → REJECTED blocked (terminal)', () => {
    expect(canTransition('APPROVED', 'REJECTED')).toBe(false);
  });
  it('REJECTED → APPROVED blocked (terminal)', () => {
    expect(canTransition('REJECTED', 'APPROVED')).toBe(false);
  });
  it('APPROVED → REQUESTED blocked (no re-open)', () => {
    expect(canTransition('APPROVED', 'REQUESTED')).toBe(false);
  });
  it('REQUESTED → REQUESTED blocked (no self-loop)', () => {
    expect(canTransition('REQUESTED', 'REQUESTED')).toBe(false);
  });
});

describe('leaveRequest assertTransition', () => {
  it('no-op on legal', () => {
    expect(() => assertTransition('REQUESTED', 'APPROVED')).not.toThrow();
  });
  it('throws on illegal with named states', () => {
    expect(() => assertTransition('APPROVED', 'REJECTED')).toThrow(/APPROVED→REJECTED/);
  });
});

describe('leaveRequest isTerminal', () => {
  it('APPROVED + REJECTED terminal, REQUESTED not', () => {
    expect(isTerminal('APPROVED')).toBe(true);
    expect(isTerminal('REJECTED')).toBe(true);
    expect(isTerminal('REQUESTED')).toBe(false);
  });
});

describe('leaveRequest exhaustive matrix', () => {
  const states: LeaveRequestState[] = ['REQUESTED', 'APPROVED', 'REJECTED'];
  const legal = new Set(['REQUESTED→APPROVED', 'REQUESTED→REJECTED']);
  it('only the two decide-transitions are legal', () => {
    for (const from of states) {
      for (const to of states) {
        expect(canTransition(from, to)).toBe(legal.has(`${from}→${to}`));
      }
    }
  });
});
