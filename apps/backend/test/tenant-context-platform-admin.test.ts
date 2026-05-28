import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

import { issueAccessToken } from '../src/lib/jwt.js';
import { requireAuth } from '../src/middleware/tenant-context.js';
import { prisma } from '../src/lib/prisma.js';

const FOUNDER_USER = '17285e17-9434-4522-9ac1-1cec1cbea31f';
const QA_COMPANY = '2d2f1ccb-7bf8-4890-ae59-c5cb14b00289';

describe('requireAuth — SUPER_ADMIN via is_platform_admin', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'test-secret-bytes-32-bytes-min-length-ok';
    app = Fastify();
    app.addHook('preHandler', requireAuth);
    app.get('/echo', async (req) => ({
      role: req.auth?.role,
      isPlatformAdmin: req.auth?.isPlatformAdmin,
    }));
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('accepts SUPER_ADMIN token when User.is_platform_admin = true', async () => {
    const row = await prisma.user.findUnique({ where: { id: FOUNDER_USER } });
    expect(row?.is_platform_admin).toBe(true);
    const token = await issueAccessToken({
      userId: FOUNDER_USER,
      companyId: QA_COMPANY,
      role: 'SUPER_ADMIN',
      availableRoles: ['OWNER'],
      locale: 'en',
      epoch: 0,
      isPlatformAdmin: true,
    });
    const res = await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().role).toBe('SUPER_ADMIN');
    expect(res.json().isPlatformAdmin).toBe(true);
  });

  it('401s a SUPER_ADMIN token forged for a non-platform-admin user', async () => {
    const victim = await prisma.user.findFirst({
      where: { is_platform_admin: false, NOT: { id: FOUNDER_USER } },
    });
    if (!victim) throw new Error('seed: needs >=1 non-admin user (DB has 10+ at writing)');
    const token = await issueAccessToken({
      userId: victim.id,
      companyId: QA_COMPANY,
      role: 'SUPER_ADMIN',
      availableRoles: ['WORKER'],
      locale: 'en',
      epoch: 0,
      isPlatformAdmin: true,
    });
    const res = await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });
});
