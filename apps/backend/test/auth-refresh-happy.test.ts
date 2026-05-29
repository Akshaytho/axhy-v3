/**
 * F1-b Task 5 Step 1 — POST /auth/refresh happy path.
 *
 * Mint a refresh token via refreshTokenStore.create() (since /auth/otp/verify
 * still issues legacy JWT refresh tokens until Task 7), POST it to
 * /auth/refresh, assert 200 + fresh axrt_ token + decodable access JWT
 * carrying current Membership claims. Then refresh again and assert all
 * three tokens distinct.
 *
 * @derives(ADR-0007)
 * @derives(F1-b plan 2026-05-28 Task 5)
 */

import crypto from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { decodeJwt } from 'jose';
import { PrismaClient } from '@prisma/client';

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const FOUNDER_USER = '17285e17-9434-4522-9ac1-1cec1cbea31f';
const QA_COMPANY = '2d2f1ccb-7bf8-4890-ae59-c5cb14b00289';

// Per-file unique IP so the route's rate-limit bucket (rl:authrefresh:<ip>)
// is not polluted by other test files running in parallel.
const TEST_IP = '10.99.0.2';

let app: FastifyInstance;
let store: import('../src/lib/services/refresh-token-store.js').RefreshTokenStore;
let membershipId: string;
const familiesToCleanup: string[] = [];

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  app = await buildServer();
  await app.ready();

  const { createRefreshTokenStore } = await import('../src/lib/services/refresh-token-store.js');
  store = createRefreshTokenStore(prismaRaw);

  const m = await prismaRaw.membership.create({
    data: {
      companyId: QA_COMPANY,
      userId: FOUNDER_USER,
      role: `EPH_HAP_${crypto.randomBytes(4).toString('hex')}`,
      status: 'ACTIVE',
    },
  });
  membershipId = m.id;
}, 30_000);

afterAll(async () => {
  if (familiesToCleanup.length) {
    await prismaRaw.refreshToken
      .deleteMany({ where: { id: { in: familiesToCleanup } } })
      .catch(() => undefined);
  }
  if (membershipId) {
    await prismaRaw.membership.deleteMany({ where: { id: membershipId } }).catch(() => undefined);
  }
  await app.close();
  await prismaRaw.$disconnect();
});

describe('POST /auth/refresh — happy path', () => {
  it('mint → refresh → refresh: rotates tokens, returns new axrt_ + decodable access JWT', async () => {
    // Step 1: mint refresh1 directly via store (skips OTP because Task 7 swap not done yet)
    const created = await store.create({ userId: FOUNDER_USER, membershipId });
    familiesToCleanup.push(created.familyId);
    const refresh1 = created.plainToken;
    expect(refresh1).toMatch(/^axrt_/);

    // Step 2: POST /auth/refresh with refresh1 → 200
    const res1 = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: refresh1 },
      remoteAddress: TEST_IP,
    });
    expect(res1.statusCode).toBe(200);
    const body1 = res1.json() as {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    };
    expect(body1.accessToken).toBeTruthy();
    expect(body1.refreshToken).toMatch(/^axrt_/);
    expect(body1.refreshToken).not.toBe(refresh1);
    expect(body1.expiresIn).toBe(900);

    // Step 3: decode access JWT — must carry membershipId + epoch + isPlatformAdmin
    const claims1 = decodeJwt(body1.accessToken) as {
      sub: string;
      companyId: string;
      membershipId?: string;
      epoch?: number;
      isPlatformAdmin?: boolean;
      role: string;
    };
    expect(claims1.sub).toBe(FOUNDER_USER);
    expect(claims1.companyId).toBe(QA_COMPANY);
    expect(claims1.membershipId).toBe(membershipId);
    expect(claims1.epoch).toBe(0);
    expect(claims1.isPlatformAdmin).toBe(true); // founder is platform admin
    expect(claims1.role).toMatch(/^EPH_HAP_/);

    const refresh2 = body1.refreshToken;

    // Step 4: refresh again with refresh2 → 200 with refresh3
    const res2 = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: refresh2 },
      remoteAddress: TEST_IP,
    });
    expect(res2.statusCode).toBe(200);
    const body2 = res2.json() as { accessToken: string; refreshToken: string; expiresIn: number };
    const refresh3 = body2.refreshToken;
    expect(refresh3).toMatch(/^axrt_/);

    // Step 5: assert all three tokens distinct
    expect(new Set([refresh1, refresh2, refresh3]).size).toBe(3);

    // Step 6: verify family row reflects refresh3 as current, refresh2 as previous
    const family = await prismaRaw.refreshToken.findUnique({ where: { id: created.familyId } });
    expect(family).not.toBeNull();
    expect(family!.revokedAt).toBeNull();
    const { sha256hex } = await import('../src/lib/services/refresh-token-store.js');
    expect(family!.currentTokenHash).toBe(sha256hex(refresh3));
    expect(family!.previousTokenHash).toBe(sha256hex(refresh2));
  }, 30_000);
});
