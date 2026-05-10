import { describe, it, expect } from 'vitest';

import { humanizeDayMask } from './format';

describe('humanizeDayMask', () => {
  it('"MTWTFS_" → "Mon-Sat"', () => {
    expect(humanizeDayMask('MTWTFS_')).toBe('Mon-Sat');
  });
  it('"MTWTFSS" → "Every day"', () => {
    expect(humanizeDayMask('MTWTFSS')).toBe('Every day');
  });
  it('"MTWTF__" → "Weekdays"', () => {
    expect(humanizeDayMask('MTWTF__')).toBe('Weekdays');
  });
  it('"_T_____" → "Tue"', () => {
    expect(humanizeDayMask('_T_____')).toBe('Tue');
  });
  it('"M_W_F__" → "Mon, Wed, Fri"', () => {
    expect(humanizeDayMask('M_W_F__')).toBe('Mon, Wed, Fri');
  });
  it('"_______" → "(none)"', () => {
    expect(humanizeDayMask('_______')).toBe('(none)');
  });
});
