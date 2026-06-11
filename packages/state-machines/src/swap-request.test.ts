import { describe, it, expect } from 'vitest';

import {
  canTransition,
  assertTransition,
  isTerminal,
  type SwapRequestState,
} from './swap-request.js';

describe('swapRequest canTransition', () => {
  it('SENT → ACCEPTED allowed', () => {
    expect(canTransition('SENT', 'ACCEPTED')).toBe(true);
  });
  it('SENT → DECLINED allowed', () => {
    expect(canTransition('SENT', 'DECLINED')).toBe(true);
  });
  it('ACCEPTED → DECLINED blocked (terminal)', () => {
    expect(canTransition('ACCEPTED', 'DECLINED')).toBe(false);
  });
  it('DECLINED → ACCEPTED blocked (terminal)', () => {
    expect(canTransition('DECLINED', 'ACCEPTED')).toBe(false);
  });
  it('ACCEPTED → SENT blocked (no re-open)', () => {
    expect(canTransition('ACCEPTED', 'SENT')).toBe(false);
  });
});

describe('swapRequest assertTransition', () => {
  it('no-op on legal', () => {
    expect(() => assertTransition('SENT', 'ACCEPTED')).not.toThrow();
  });
  it('throws on illegal with named states', () => {
    expect(() => assertTransition('DECLINED', 'ACCEPTED')).toThrow(/DECLINED→ACCEPTED/);
  });
});

describe('swapRequest isTerminal', () => {
  it('ACCEPTED + DECLINED terminal, SENT not', () => {
    expect(isTerminal('ACCEPTED')).toBe(true);
    expect(isTerminal('DECLINED')).toBe(true);
    expect(isTerminal('SENT')).toBe(false);
  });
});

describe('swapRequest exhaustive matrix', () => {
  const states: SwapRequestState[] = ['SENT', 'ACCEPTED', 'DECLINED'];
  const legal = new Set(['SENT→ACCEPTED', 'SENT→DECLINED']);
  it('only the two decide-transitions are legal', () => {
    for (const from of states) {
      for (const to of states) {
        expect(canTransition(from, to)).toBe(legal.has(`${from}→${to}`));
      }
    }
  });
});
