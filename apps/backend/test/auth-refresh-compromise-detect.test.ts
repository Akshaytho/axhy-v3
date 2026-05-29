/**
 * F1-b Task 5 Step 3 — POST /auth/refresh compromise detection.
 *
 * Mint refresh1, refresh (rotates → refresh2), wait past the 10 s grace
 * window, then attacker presents the rotated-out refresh1. Route must:
 *   - return 401 INVALID_REFRESH (silent; do NOT leak detection signal)
 *   - revoke the family (revokedAt set, revokedReason='COMPROMISE')
 *   - bump Membership.tokenEpoch by 1 — outstanding access tokens die
 *
 * @derives(ADR-0007)
 * @derives(F1-b plan 2026-05-28 Task 5 Step 3)
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

const TEST_IP = '10.99.0.4';

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
      role: `EPH_CMP_${crypto.randomBytes(4).toString('hex')}`,
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

describe('POST /auth/refresh — compromise detection', () => {
  it('reusing the rotated-out token AFTER 10s grace → 401 + family revoked + tokenEpoch++', async () => {
    const { plainToken: refresh1, familyId } = await store.create({
      userId: FOUNDER_USER,
      membershipId,
    });
    familiesToCleanup.push(familyId);

    // Rotate once: refresh1 → refresh2
    const rot = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: refresh1 },
      remoteAddress: TEST_IP,
    });
    expect(rot.statusCode).toBe(200);

    // Wait past 10 s grace window (route uses ROTATION_GRACE_MS = 10_000).
    await new Promise((r) => setTimeout(r, 11_000));

    // Attacker presents the rotated-out token.
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: refresh1 },
      remoteAddress: TEST_IP,
    });
    expect(res.statusCode).toBe(401);
    const body = res.json() as { error: string };
    expect(body.error).toBe('INVALID_REFRESH'); // silent — not COMPROMISE_DETECTED

    // Family revoked with reason='COMPROMISE'
    const family = await prismaRaw.refreshToken.findUnique({ where: { id: familyId } });
    expect(family!.revokedAt).not.toBeNull();
    expect(family!.revokedReason).toBe('COMPROMISE');

    // Membership.tokenEpoch bumped from 0 → 1
    const m = await prismaRaw.membership.findUnique({ where: { id: membershipId } });
    expect(m!.tokenEpoch).toBe(1);
  }, 30_000);
});
