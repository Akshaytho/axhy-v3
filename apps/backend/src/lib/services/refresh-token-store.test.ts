/**
 * F1-b refresh-token-store unit tests (TDD red).
 *
 * Hits Railway Postgres (real DB; no mocks per project rule) and Redis (if
 * REDIS_URL is set — tests gated on it where Redis behavior is asserted).
 *
 * Each test uses an ephemeral Membership cloned from the QA founder fixture
 * so we never poison the live founder row's tokenEpoch counter.
 */
import crypto from 'node:crypto';

import { describe, it, expect, beforeAll, afterEach } from 'vitest';

import { prisma } from '../prisma.js';
import { getRedis } from '../redis.js';
import { RedisKeys } from '../redis-keys.js';

import {
  createRefreshTokenStore,
  sha256hex,
  isLegacyToken,
  type RefreshTokenStore,
} from './refresh-token-store.js';

const FOUNDER_USER = '17285e17-9434-4522-9ac1-1cec1cbea31f';
const QA_COMPANY = '2d2f1ccb-7bf8-4890-ae59-c5cb14b00289';

// Per-test ephemeral membership so tokenEpoch bumps don't poison shared state.
async function makeEphemeralMembership(): Promise<{ membershipId: string; userId: string }> {
  const m = await prisma.membership.create({
    data: {
      companyId: QA_COMPANY,
      userId: FOUNDER_USER,
      role: `EPH_${crypto.randomBytes(4).toString('hex')}`,
      status: 'ACTIVE',
    },
  });
  return { membershipId: m.id, userId: FOUNDER_USER };
}

describe('refresh-token-store', () => {
  let store: RefreshTokenStore;
  const createdMemberships: string[] = [];
  const createdFamilies: string[] = [];

  beforeAll(() => {
    store = createRefreshTokenStore(prisma);
  });

  afterEach(async () => {
    if (createdFamilies.length) {
      await prisma.refreshToken.deleteMany({ where: { id: { in: createdFamilies } } });
      createdFamilies.length = 0;
    }
    if (createdMemberships.length) {
      await prisma.membership.deleteMany({ where: { id: { in: createdMemberships } } });
      createdMemberships.length = 0;
    }
  });

  it('isLegacyToken: rejects JWT-shaped, accepts axrt_ prefix', () => {
    expect(isLegacyToken('eyJhbGciOi.payload.sig')).toBe(true);
    expect(isLegacyToken('axrt_abc123')).toBe(false);
  });

  it('create() returns axrt_ token (43 base64url chars after prefix) and persists hashed row', async () => {
    const { membershipId, userId } = await makeEphemeralMembership();
    createdMemberships.push(membershipId);

    const { familyId, plainToken, expiresAt } = await store.create({ userId, membershipId });
    createdFamilies.push(familyId);

    expect(plainToken).toMatch(/^axrt_[A-Za-z0-9_-]{43}$/);
    const row = await prisma.refreshToken.findUnique({ where: { id: familyId } });
    expect(row).not.toBeNull();
    expect(row!.currentTokenHash).toBe(sha256hex(plainToken));
    expect(row!.previousTokenHash).toBeNull();
    expect(row!.userId).toBe(userId);
    expect(row!.membershipId).toBe(membershipId);

    // ~30 day expiry, +/- 60s tolerance.
    const expectedExpiry = Date.now() + 30 * 24 * 3600 * 1000;
    expect(Math.abs(expiresAt.getTime() - expectedExpiry)).toBeLessThan(60_000);
  });

  it('create() for SUPER_ADMIN: membershipId is null in the row', async () => {
    const { plainToken, familyId } = await store.create({
      userId: FOUNDER_USER,
      membershipId: null,
    });
    createdFamilies.push(familyId);
    expect(plainToken).toMatch(/^axrt_/);
    const row = await prisma.refreshToken.findUnique({ where: { id: familyId } });
    expect(row!.membershipId).toBeNull();
  });

  it('rotate(): returns a new token, moves old hash to previousTokenHash, slides expiresAt', async () => {
    const { membershipId, userId } = await makeEphemeralMembership();
    createdMemberships.push(membershipId);
    const created = await store.create({ userId, membershipId });
    createdFamilies.push(created.familyId);
    const oldHash = sha256hex(created.plainToken);

    // Wait 1s so lastUsedAt / expiresAt deltas are visible.
    await new Promise((r) => setTimeout(r, 1100));

    const rotated = await store.rotate({ familyId: created.familyId });
    expect(rotated.plainToken).not.toBe(created.plainToken);
    expect(rotated.plainToken).toMatch(/^axrt_/);

    const row = await prisma.refreshToken.findUnique({ where: { id: created.familyId } });
    expect(row!.currentTokenHash).toBe(sha256hex(rotated.plainToken));
    expect(row!.previousTokenHash).toBe(oldHash);
    expect(row!.previousRotatedAt).not.toBeNull();
    expect(row!.expiresAt.getTime()).toBeGreaterThan(created.expiresAt.getTime());
  });

  it.runIf(!!process.env.REDIS_URL)(
    'rotate(): updates Redis refreshCurrentHash to new hash',
    async () => {
      const { membershipId, userId } = await makeEphemeralMembership();
      createdMemberships.push(membershipId);
      const created = await store.create({ userId, membershipId });
      createdFamilies.push(created.familyId);

      const rotated = await store.rotate({ familyId: created.familyId });
      const redisVal = await getRedis().get(RedisKeys.refreshCurrentHash(created.familyId));
      expect(redisVal).toBe(sha256hex(rotated.plainToken));

      await getRedis().del(RedisKeys.refreshCurrentHash(created.familyId));
    },
  );

  it('validate(): happy path — current hash match returns found family', async () => {
    const { membershipId, userId } = await makeEphemeralMembership();
    createdMemberships.push(membershipId);
    const created = await store.create({ userId, membershipId });
    createdFamilies.push(created.familyId);

    const result = await store.validate(created.plainToken);
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.family.id).toBe(created.familyId);
      expect(result.withinGrace).toBeFalsy();
      expect(result.compromise).toBeFalsy();
      expect(result.revoked).toBeFalsy();
    }
  });

  it('validate(): previous hash within 10s grace returns withinGrace=true', async () => {
    const { membershipId, userId } = await makeEphemeralMembership();
    createdMemberships.push(membershipId);
    const created = await store.create({ userId, membershipId });
    createdFamilies.push(created.familyId);
    await store.rotate({ familyId: created.familyId });

    // The original token is now in previousTokenHash. Immediately re-presenting
    // it (well inside the 10s grace) must return withinGrace.
    const result = await store.validate(created.plainToken);
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.withinGrace).toBe(true);
      expect(result.compromise).toBeFalsy();
    }
  });

  it('validate(): previous hash beyond grace window returns compromise=true', async () => {
    const { membershipId, userId } = await makeEphemeralMembership();
    createdMemberships.push(membershipId);
    const created = await store.create({ userId, membershipId });
    createdFamilies.push(created.familyId);
    await store.rotate({ familyId: created.familyId });

    // Backdate previousRotatedAt to 11 seconds ago to simulate post-grace reuse.
    await prisma.refreshToken.update({
      where: { id: created.familyId },
      data: { previousRotatedAt: new Date(Date.now() - 11_000) },
    });

    const result = await store.validate(created.plainToken);
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.compromise).toBe(true);
      expect(result.withinGrace).toBeFalsy();
    }
  });

  it('revokeForCompromise(): revokes family + bumps Membership.tokenEpoch + clears Redis', async () => {
    const { membershipId, userId } = await makeEphemeralMembership();
    createdMemberships.push(membershipId);
    const created = await store.create({ userId, membershipId });
    createdFamilies.push(created.familyId);
    const epochBefore = (await prisma.membership.findUnique({ where: { id: membershipId } }))!
      .tokenEpoch;

    await store.revokeForCompromise(created.familyId);

    const row = await prisma.refreshToken.findUnique({ where: { id: created.familyId } });
    expect(row!.revokedAt).not.toBeNull();
    expect(row!.revokedReason).toBe('COMPROMISE');

    const epochAfter = (await prisma.membership.findUnique({ where: { id: membershipId } }))!
      .tokenEpoch;
    expect(epochAfter).toBe(epochBefore + 1);

    if (process.env.REDIS_URL) {
      const redisVal = await getRedis().get(RedisKeys.refreshCurrentHash(created.familyId));
      expect(redisVal).toBeNull();
    }
  });

  it('revokeForCompromise(): SUPER_ADMIN family (no membershipId) — only revokes, no epoch bump', async () => {
    const { plainToken, familyId } = await store.create({
      userId: FOUNDER_USER,
      membershipId: null,
    });
    createdFamilies.push(familyId);
    expect(plainToken).toMatch(/^axrt_/);
    await store.revokeForCompromise(familyId);
    const row = await prisma.refreshToken.findUnique({ where: { id: familyId } });
    expect(row!.revokedAt).not.toBeNull();
    expect(row!.revokedReason).toBe('COMPROMISE');
  });

  it('validate(): revoked family returns revoked=true', async () => {
    const { membershipId, userId } = await makeEphemeralMembership();
    createdMemberships.push(membershipId);
    const created = await store.create({ userId, membershipId });
    createdFamilies.push(created.familyId);

    await store.revokeForLogout(created.familyId);

    const result = await store.validate(created.plainToken);
    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.revoked).toBe(true);
    }
  });

  it('validate(): unknown token returns found=false', async () => {
    const fake = 'axrt_' + crypto.randomBytes(32).toString('base64url');
    const result = await store.validate(fake);
    expect(result.found).toBe(false);
  });
});
