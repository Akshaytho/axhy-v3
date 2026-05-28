import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

import { issueAccessToken } from '../src/lib/jwt.js';
import { requireAuth } from '../src/middleware/tenant-context.js';

const FOUNDER_USER = '17285e17-9434-4522-9ac1-1cec1cbea31f';
const QA_COMPANY = '2d2f1ccb-7bf8-4890-ae59-c5cb14b00289';

describe('requireAuth — legacy-mode (no epoch claim)', () => {
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

  it('accepts a token with NO epoch claim (legacy emit)', async () => {
    const token = await issueAccessToken({
      userId: FOUNDER_USER,
      companyId: QA_COMPANY,
      role: 'OWNER',
      availableRoles: ['OWNER'],
      locale: 'en',
    });
    const res = await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().userId).toBe(FOUNDER_USER);
    expect(res.json().role).toBe('OWNER');
  });

  it('returns 401 AUTH_REQUIRED when Authorization header missing', async () => {
    const res = await app.inject({ method: 'GET', url: '/echo' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('AUTH_REQUIRED');
  });

  it('returns 401 AUTH_INVALID on malformed JWT', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/echo',
      headers: { authorization: 'Bearer not-a-real-jwt' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('AUTH_INVALID');
  });
});
