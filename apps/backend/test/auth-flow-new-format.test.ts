/**
 * F1-a: /auth/otp/verify must emit JWT carrying epoch + membershipId
 *  + isPlatformAdmin. @derives(F1 trust model 2026-05-27)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { decodeJwt } from 'jose';

import { deleteCompanyDeep } from './_helpers/delete-company-deep.js';

process.env.AXHY_OTP_BYPASS = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `f1emit-${Date.now()}-`;
const TEST_PHONE = `+9198${String(Date.now()).slice(-8)}`;

let app: FastifyInstance;
let companyId: string;
let userId: string | null = null;
let membershipId: string | null = null;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  app = await buildServer();
  await app.ready();
  const c = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919900000099',
      ownerName: 'F1 Test',
    },
  });
  companyId = c.id;
});

afterAll(async () => {
  await app.close();
  await prismaRaw.$executeRawUnsafe(`DELETE FROM axhy.otp_attempts WHERE phone = $1`, TEST_PHONE);
  if (membershipId)
    await prismaRaw.membership.deleteMany({ where: { id: membershipId } }).catch(() => {});
  if (userId) await prismaRaw.user.deleteMany({ where: { id: userId } }).catch(() => {});
  await deleteCompanyDeep(prismaRaw, { slugPrefix: TEST_PREFIX });
  await prismaRaw.$disconnect();
});

describe('/auth/otp/verify — F1 new-format emit', () => {
  it('returned access token carries membershipId + epoch + isPlatformAdmin', async () => {
    // 1. seed user + membership so /verify yields a token (else 403)
    const u = await prismaRaw.user.create({ data: { phone: TEST_PHONE, locale: 'en' } });
    userId = u.id;
    const m = await prismaRaw.membership.create({
      data: { companyId, userId: u.id, role: 'WORKER', status: 'ACTIVE' },
    });
    membershipId = m.id;

    // 2. issue OTP (bypass mode — magic code is '123456' when AXHY_OTP_BYPASS=1)
    const req = await app.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: { phone: TEST_PHONE },
    });
    expect(req.statusCode).toBe(200);

    // 3. verify with bypass magic code and decode the returned token
    const res = await app.inject({
      method: 'POST',
      url: '/auth/otp/verify',
      payload: { phone: TEST_PHONE, code: '123456' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { accessToken: string };
    const claims = decodeJwt(body.accessToken);

    expect(typeof claims.membershipId).toBe('string');
    expect(claims.membershipId).toBe(m.id);
    expect(claims.epoch).toBe(0); // freshly seeded membership has token_epoch=0
    // This synthetic user is NOT the founder, so is_platform_admin defaults to false
    expect(claims.isPlatformAdmin).toBe(false);
  });
});
