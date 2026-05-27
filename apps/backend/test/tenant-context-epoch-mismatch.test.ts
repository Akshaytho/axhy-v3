import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

import { issueAccessToken } from '../src/lib/jwt.js';
import { requireAuth } from '../src/middleware/tenant-context.js';
import { prisma } from '../src/lib/prisma.js';

const FOUNDER_USER = '17285e17-9434-4522-9ac1-1cec1cbea31f';
const QA_COMPANY = '2d2f1ccb-7bf8-4890-ae59-c5cb14b00289';
const QA_MEMBERSHIP = 'fbb2da2f-0080-40eb-9113-fa6820caad57';

describe('requireAuth — epoch mismatch (revoke flow)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    process.env.JWT_SECRET ??= 'test-secret-bytes-32-bytes-min-length-ok';
    app = Fastify();
    app.addHook('preHandler', requireAuth);
    app.get('/echo', async () => ({ ok: true }));
    await app.ready();
  });
  afterAll(async () => {
    // Restore the founder membership's epoch — every other test depends on tokenEpoch=0
    await prisma.membership.update({ where: { id: QA_MEMBERSHIP }, data: { tokenEpoch: 0 } });
    await app.close();
  });

  it('401s when token epoch < DB epoch (simulating revoke)', async () => {
    // Reset to 0 first to be safe
    await prisma.membership.update({ where: { id: QA_MEMBERSHIP }, data: { tokenEpoch: 0 } });
    // Mint token at epoch 0
    const token = await issueAccessToken({
      userId: FOUNDER_USER,
      companyId: QA_COMPANY,
      role: 'OWNER',
      availableRoles: ['OWNER'],
      locale: 'en',
      membershipId: QA_MEMBERSHIP,
      epoch: 0,
    });
    // Bump DB to epoch 1 (revoke)
    await prisma.membership.update({ where: { id: QA_MEMBERSHIP }, data: { tokenEpoch: 1 } });
    const res = await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('401s when token epoch > DB epoch (forged future epoch)', async () => {
    await prisma.membership.update({ where: { id: QA_MEMBERSHIP }, data: { tokenEpoch: 0 } });
    const token = await issueAccessToken({
      userId: FOUNDER_USER,
      companyId: QA_COMPANY,
      role: 'OWNER',
      availableRoles: ['OWNER'],
      locale: 'en',
      membershipId: QA_MEMBERSHIP,
      epoch: 999,
    });
    const res = await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(401);
  });
});
