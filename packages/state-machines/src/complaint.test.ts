import { describe, it, expect } from 'vitest';

import { canTransition, assertTransition, isTerminal, type ComplaintState } from './complaint.js';

describe('complaint canTransition', () => {
  it('OPEN → IN_HR allowed', () => {
    expect(canTransition('OPEN', 'IN_HR')).toBe(true);
  });
  it('OPEN → RESOLVED allowed', () => {
    expect(canTransition('OPEN', 'RESOLVED')).toBe(true);
  });
  it('OPEN → DISMISSED allowed', () => {
    expect(canTransition('OPEN', 'DISMISSED')).toBe(true);
  });
  it('IN_HR → RESOLVED allowed', () => {
    expect(canTransition('IN_HR', 'RESOLVED')).toBe(true);
  });
  it('IN_HR → DISMISSED allowed', () => {
    expect(canTransition('IN_HR', 'DISMISSED')).toBe(true);
  });
  it('IN_HR → OPEN blocked (no de-escalation)', () => {
    expect(canTransition('IN_HR', 'OPEN')).toBe(false);
  });
  it('RESOLVED → OPEN blocked (terminal)', () => {
    expect(canTransition('RESOLVED', 'OPEN')).toBe(false);
  });
  it('DISMISSED → IN_HR blocked (terminal)', () => {
    expect(canTransition('DISMISSED', 'IN_HR')).toBe(false);
  });
});

describe('complaint assertTransition', () => {
  it('no-op on legal', () => {
    expect(() => assertTransition('OPEN', 'RESOLVED')).not.toThrow();
  });
  it('throws on illegal with named states', () => {
    expect(() => assertTransition('RESOLVED', 'OPEN')).toThrow(/RESOLVED→OPEN/);
  });
});

describe('complaint isTerminal', () => {
  it('RESOLVED + DISMISSED terminal, OPEN + IN_HR not', () => {
    expect(isTerminal('RESOLVED')).toBe(true);
    expect(isTerminal('DISMISSED')).toBe(true);
    expect(isTerminal('OPEN')).toBe(false);
    expect(isTerminal('IN_HR')).toBe(false);
  });
});

describe('complaint exhaustive matrix', () => {
  const states: ComplaintState[] = ['OPEN', 'IN_HR', 'RESOLVED', 'DISMISSED'];
  const legal = new Set([
    'OPEN→IN_HR',
    'OPEN→RESOLVED',
    'OPEN→DISMISSED',
    'IN_HR→RESOLVED',
    'IN_HR→DISMISSED',
  ]);
  it('only the five forward transitions are legal', () => {
    for (const from of states) {
      for (const to of states) {
        expect(canTransition(from, to)).toBe(legal.has(`${from}→${to}`));
      }
    }
  });
});
