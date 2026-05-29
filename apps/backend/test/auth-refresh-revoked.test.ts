/**
 * F1-b Task 6 — POST /auth/refresh against an already-revoked family.
 *
 * Simulates the operator-driven revoke path: a family row gets revokedAt
 * set (e.g., via admin endpoint or logout-everywhere worker, not this
 * route). Subsequent refresh attempts must return 401 REFRESH_REVOKED —
 * distinct from INVALID_REFRESH so logs can distinguish "operator killed
 * the session" from "unknown token / probable attack."
 *
 * @derives(ADR-0007)
 * @derives(F1-b plan 2026-05-28 Task 6)
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

const TEST_IP = '10.99.0.6';

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
      role: `EPH_REV_${crypto.randomBytes(4).toString('hex')}`,
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

describe('POST /auth/refresh — already-revoked family', () => {
  it('admin-revoked family → 401 REFRESH_REVOKED', async () => {
    const { plainToken, familyId } = await store.create({
      userId: FOUNDER_USER,
      membershipId,
    });
    familiesToCleanup.push(familyId);

    // Operator/admin revokes the family directly (bypasses the route).
    await prismaRaw.refreshToken.update({
      where: { id: familyId },
      data: { revokedAt: new Date(), revokedReason: 'ADMIN_REVOKE' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: plainToken },
      remoteAddress: TEST_IP,
    });
    expect(res.statusCode).toBe(401);
    const body = res.json() as { error: string };
    expect(body.error).toBe('REFRESH_REVOKED');

    // Family stays revoked — no second-chance rotation.
    const family = await prismaRaw.refreshToken.findUnique({ where: { id: familyId } });
    expect(family!.revokedAt).not.toBeNull();
    expect(family!.revokedReason).toBe('ADMIN_REVOKE');
  });

  it('logout-revoked family → 401 REFRESH_REVOKED', async () => {
    const { plainToken, familyId } = await store.create({
      userId: FOUNDER_USER,
      membershipId,
    });
    familiesToCleanup.push(familyId);

    // User logout path — store's API
    await store.revokeForLogout(familyId);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: plainToken },
      remoteAddress: TEST_IP,
    });
    expect(res.statusCode).toBe(401);
    expect((res.json() as { error: string }).error).toBe('REFRESH_REVOKED');

    const family = await prismaRaw.refreshToken.findUnique({ where: { id: familyId } });
    expect(family!.revokedReason).toBe('LOGOUT');
  });
});
