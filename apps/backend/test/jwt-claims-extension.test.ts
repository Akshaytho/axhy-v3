import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { JWTClaims } from '@axhy/shared-schema';

import { issueAccessToken, verifyAccessToken } from '../src/lib/jwt.js';

const baseClaims = {
  sub: '11111111-1111-1111-1111-111111111111',
  companyId: '22222222-2222-2222-2222-222222222222',
  role: 'WORKER',
  availableRoles: ['WORKER'],
  locale: 'en',
  iat: 1_700_000_000,
  exp: 1_700_000_900,
  kind: 'access',
};

describe('JWTClaims F1 extension', () => {
  it('accepts a legacy token without epoch / membershipId / isPlatformAdmin', () => {
    const parsed = JWTClaims.safeParse(baseClaims);
    expect(parsed.success).toBe(true);
  });

  it('accepts a new-format token with all 3 F1 fields', () => {
    const parsed = JWTClaims.safeParse({
      ...baseClaims,
      membershipId: '33333333-3333-3333-3333-333333333333',
      epoch: 0,
      isPlatformAdmin: false,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.membershipId).toBe('33333333-3333-3333-3333-333333333333');
      expect(parsed.data.epoch).toBe(0);
      expect(parsed.data.isPlatformAdmin).toBe(false);
    }
  });

  it('rejects malformed membershipId', () => {
    const parsed = JWTClaims.safeParse({ ...baseClaims, membershipId: 'not-a-uuid', epoch: 0 });
    expect(parsed.success).toBe(false);
  });

  it('rejects negative epoch', () => {
    const parsed = JWTClaims.safeParse({ ...baseClaims, epoch: -1 });
    expect(parsed.success).toBe(false);
  });
});

describe('issueAccessToken F1 emit', () => {
  const ORIGINAL_SECRET = process.env.JWT_SECRET;
  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret-bytes-32-bytes-min-length-ok';
  });
  afterAll(() => {
    process.env.JWT_SECRET = ORIGINAL_SECRET;
  });

  it('emits epoch + membershipId + isPlatformAdmin when supplied', async () => {
    const token = await issueAccessToken({
      userId: '11111111-1111-1111-1111-111111111111',
      companyId: '22222222-2222-2222-2222-222222222222',
      role: 'WORKER',
      availableRoles: ['WORKER'],
      locale: 'en',
      membershipId: '33333333-3333-3333-3333-333333333333',
      epoch: 7,
      isPlatformAdmin: false,
    });
    const parsed = await verifyAccessToken(token);
    expect(parsed.membershipId).toBe('33333333-3333-3333-3333-333333333333');
    expect(parsed.epoch).toBe(7);
    expect(parsed.isPlatformAdmin).toBe(false);
  });

  it('omits F1 fields when not supplied (legacy emit)', async () => {
    const token = await issueAccessToken({
      userId: '11111111-1111-1111-1111-111111111111',
      companyId: '22222222-2222-2222-2222-222222222222',
      role: 'WORKER',
      availableRoles: ['WORKER'],
      locale: 'en',
    });
    const parsed = await verifyAccessToken(token);
    expect(parsed.membershipId).toBeUndefined();
    expect(parsed.epoch).toBeUndefined();
    expect(parsed.isPlatformAdmin).toBeUndefined();
  });
});
