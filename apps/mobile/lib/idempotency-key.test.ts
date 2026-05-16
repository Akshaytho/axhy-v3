/**
 * @derives(master-plan §G)
 */

import { describe, it, expect } from 'vitest';

import { generateIdempotencyKey } from './idempotency-key';

describe('generateIdempotencyKey', () => {
  it('returns a UUID v4 format string (8-4-4-4-12 hex with version 4)', () => {
    const key = generateIdempotencyKey();
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('returns distinct values across calls', () => {
    const keys = new Set<string>();
    for (let i = 0; i < 100; i++) keys.add(generateIdempotencyKey());
    expect(keys.size).toBe(100);
  });
});
