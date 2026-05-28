/**
 * F1-b Task 5 Step 2 — POST /auth/refresh rotation grace window.
 *
 * Simulates mobile network retry race: client refreshes, network burps, the
 * 200 response is lost, client retries with the OLD refresh token. Within
 * the 10 s grace window the route must succeed (not flag compromise). The
 * second call returns a FRESH token (T3, distinct from T2) because the
 * store retains only hashes — see Task 4 amendment.
 *
 * Skips the past-grace assertion (that lives in compromise-detect.test.ts).
 *
 * @derives(ADR-0007)
 * @derives(F1-b plan 2026-05-28 Task 5 Step 2)
 */

import crypto from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const FOUNDER_USER = '17285e17-9434-4522-9ac1-1cec1cbea31f';
const QA_COMPANY = '2d2f1ccb-7bf8-4890-ae59-c5cb14b00289';

const TEST_IP = '10.99.0.3';

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
      role: `EPH_GRC_${crypto.randomBytes(4).toString('hex')}`,
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

describe('POST /auth/refresh — rotation grace window', () => {
  it('reusing the old token within 10s grace → both succeed, T3 distinct from T2', async () => {
    const { plainToken: refresh1, familyId } = await store.create({
      userId: FOUNDER_USER,
      membershipId,
    });
    familiesToCleanup.push(familyId);

    // First refresh — rotates T1 → T2
    const res1 = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: refresh1 },
      remoteAddress: TEST_IP,
    });
    expect(res1.statusCode).toBe(200);
    const refresh2 = (res1.json() as { refreshToken: string }).refreshToken;

    // IMMEDIATE retry with the OLD token (refresh1) — within grace window
    const res2 = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: refresh1 },
      remoteAddress: TEST_IP,
    });
    expect(res2.statusCode).toBe(200);
    const refresh3 = (res2.json() as { refreshToken: string }).refreshToken;

    // All three distinct (T3 is fresh, not T2 echoed)
    expect(new Set([refresh1, refresh2, refresh3]).size).toBe(3);
    expect(refresh3).toMatch(/^axrt_/);

    // Family row: current=hash(refresh3), previous=hash(refresh2), NOT revoked
    const { sha256hex } = await import('../src/lib/services/refresh-token-store.js');
    const family = await prismaRaw.refreshToken.findUnique({ where: { id: familyId } });
    expect(family!.revokedAt).toBeNull();
    expect(family!.currentTokenHash).toBe(sha256hex(refresh3));
    expect(family!.previousTokenHash).toBe(sha256hex(refresh2));

    // Membership tokenEpoch must NOT have bumped — this was grace, not compromise
    const m = await prismaRaw.membership.findUnique({ where: { id: membershipId } });
    expect(m!.tokenEpoch).toBe(0);
  }, 30_000);
});
