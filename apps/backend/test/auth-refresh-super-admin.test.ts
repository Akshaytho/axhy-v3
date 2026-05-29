/**
 * F1-b Task 6 — POST /auth/refresh for the SUPER_ADMIN (membershipId=null) path.
 *
 * SUPER_ADMIN families have a NULL membershipId and rely on
 * User.is_platform_admin = true. The route re-checks this on every refresh
 * so revoking platform-admin privilege also kills outstanding sessions on
 * the very next rotate.
 *
 * Uses an EPHEMERAL platform-admin user (not the founder) so toggling
 * is_platform_admin in this test does not race with the happy-path test
 * which asserts founder.is_platform_admin=true.
 *
 * @derives(ADR-0007)
 * @derives(F1-b plan 2026-05-28 Task 6)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { decodeJwt } from 'jose';
import { PrismaClient } from '@prisma/client';

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_IP = '10.99.0.7';

let app: FastifyInstance;
let store: import('../src/lib/services/refresh-token-store.js').RefreshTokenStore;
let ephemeralUserId: string;
const familiesToCleanup: string[] = [];

const EPHEMERAL_PHONE = `+9197${String(Date.now()).slice(-8)}`;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  app = await buildServer();
  await app.ready();

  const { createRefreshTokenStore } = await import('../src/lib/services/refresh-token-store.js');
  store = createRefreshTokenStore(prismaRaw);

  // Dedicated platform-admin user — isolated from founder row so toggles
  // below don't race with concurrent tests.
  const u = await prismaRaw.user.create({
    data: {
      phone: EPHEMERAL_PHONE,
      locale: 'en',
      is_platform_admin: true,
    },
  });
  ephemeralUserId = u.id;
}, 30_000);

afterAll(async () => {
  if (familiesToCleanup.length) {
    await prismaRaw.refreshToken
      .deleteMany({ where: { id: { in: familiesToCleanup } } })
      .catch(() => undefined);
  }
  if (ephemeralUserId) {
    await prismaRaw.user.deleteMany({ where: { id: ephemeralUserId } }).catch(() => undefined);
  }
  await app.close();
  await prismaRaw.$disconnect();
});

describe('POST /auth/refresh — SUPER_ADMIN path (membershipId=null)', () => {
  it('refresh on a NULL-membership family → access token with isPlatformAdmin=true + role=SUPER_ADMIN', async () => {
    await prismaRaw.user.update({
      where: { id: ephemeralUserId },
      data: { is_platform_admin: true },
    });

    const { plainToken, familyId } = await store.create({
      userId: ephemeralUserId,
      membershipId: null,
    });
    familiesToCleanup.push(familyId);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: plainToken },
      remoteAddress: TEST_IP,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { accessToken: string; refreshToken: string };

    const claims = decodeJwt(body.accessToken) as {
      sub: string;
      companyId: string;
      role: string;
      isPlatformAdmin?: boolean;
      membershipId?: string;
      epoch?: number;
    };
    expect(claims.sub).toBe(ephemeralUserId);
    expect(claims.role).toBe('SUPER_ADMIN');
    expect(claims.isPlatformAdmin).toBe(true);
    expect(claims.companyId).toBe(ephemeralUserId);
    expect(claims.membershipId).toBeUndefined();

    const family = await prismaRaw.refreshToken.findUnique({ where: { id: familyId } });
    expect(family!.membershipId).toBeNull();
  });

  it('platform-admin revoked between login and refresh → 401 INVALID_REFRESH', async () => {
    await prismaRaw.user.update({
      where: { id: ephemeralUserId },
      data: { is_platform_admin: true },
    });

    const { plainToken, familyId } = await store.create({
      userId: ephemeralUserId,
      membershipId: null,
    });
    familiesToCleanup.push(familyId);

    await prismaRaw.user.update({
      where: { id: ephemeralUserId },
      data: { is_platform_admin: false },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: plainToken },
      remoteAddress: TEST_IP,
    });
    expect(res.statusCode).toBe(401);
    expect((res.json() as { error: string }).error).toBe('INVALID_REFRESH');
  });
});
