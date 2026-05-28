import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

import { issueAccessToken } from '../src/lib/jwt.js';
import { requireAuth } from '../src/middleware/tenant-context.js';
import { prisma } from '../src/lib/prisma.js';

const FOUNDER_USER = '17285e17-9434-4522-9ac1-1cec1cbea31f';
const QA_COMPANY = '2d2f1ccb-7bf8-4890-ae59-c5cb14b00289';
const QA_MEMBERSHIP = 'fbb2da2f-0080-40eb-9113-fa6820caad57';

describe('requireAuth — strict-mode (epoch claim present)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'test-secret-bytes-32-bytes-min-length-ok';
    app = Fastify();
    app.addHook('preHandler', requireAuth);
    app.get('/echo', async (req) => ({ userId: req.auth?.userId, role: req.auth?.role }));
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('accepts a new-format token whose claims match Membership row', async () => {
    const row = await prisma.membership.findUnique({ where: { id: QA_MEMBERSHIP } });
    if (!row) throw new Error('seed: founder membership missing');
    const token = await issueAccessToken({
      userId: FOUNDER_USER,
      companyId: QA_COMPANY,
      role: row.role as 'OWNER',
      availableRoles: [row.role as 'OWNER'],
      locale: 'en',
      membershipId: QA_MEMBERSHIP,
      epoch: row.tokenEpoch,
      isPlatformAdmin: false,
    });
    const res = await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().role).toBe('OWNER');
  });

  it('401s when membershipId in token points at a row that does not exist', async () => {
    const token = await issueAccessToken({
      userId: FOUNDER_USER,
      companyId: QA_COMPANY,
      role: 'OWNER',
      availableRoles: ['OWNER'],
      locale: 'en',
      membershipId: '00000000-0000-0000-0000-000000000000',
      epoch: 0,
    });
    const res = await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('AUTH_INVALID');
  });

  it('401s when token role differs from Membership row role (revoked promotion)', async () => {
    const token = await issueAccessToken({
      userId: FOUNDER_USER,
      companyId: QA_COMPANY,
      role: 'HR',
      availableRoles: ['OWNER'],
      locale: 'en',
      membershipId: QA_MEMBERSHIP,
      epoch: 0,
    });
    const res = await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('401s when claims.companyId differs from Membership.companyId (cross-tenant forgery)', async () => {
    const token = await issueAccessToken({
      userId: FOUNDER_USER,
      companyId: '00000000-0000-0000-0000-000000000000',
      role: 'OWNER',
      availableRoles: ['OWNER'],
      locale: 'en',
      membershipId: QA_MEMBERSHIP,
      epoch: 0,
    });
    const res = await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('401s when epoch claim missing but role != SUPER_ADMIN (incomplete F1 claim)', async () => {
    // Forge: someone strips membershipId but keeps epoch undefined → falls into legacy mode.
    // Forge: someone strips membershipId but keeps epoch defined → strict mode demands membershipId.
    const token = await issueAccessToken({
      userId: FOUNDER_USER,
      companyId: QA_COMPANY,
      role: 'OWNER',
      availableRoles: ['OWNER'],
      locale: 'en',
      epoch: 0,
      // no membershipId
    });
    const res = await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });
});
