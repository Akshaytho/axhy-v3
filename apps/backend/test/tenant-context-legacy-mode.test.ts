import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

import { issueAccessToken } from '../src/lib/jwt.js';
import { requireAuth } from '../src/middleware/tenant-context.js';

const FOUNDER_USER = '17285e17-9434-4522-9ac1-1cec1cbea31f';
const QA_COMPANY = '2d2f1ccb-7bf8-4890-ae59-c5cb14b00289';

describe('requireAuth — no-epoch tokens require an ACTIVE membership (#33, DB-verified)', () => {
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

  it('REJECTS a no-epoch token with NO backing membership — #33 (closes the no-DB-verification bypass)', async () => {
    // A no-epoch token used to be trusted outright with ZERO DB verification,
    // letting a forged/stolen pre-cutover token skip all checks. It now must pass
    // DB verification — an ACTIVE Membership matching (companyId, userId, role) must
    // exist. FOUNDER_USER here has none, so it 401s. (The accept path — no-epoch +
    // ACTIVE membership — is exercised by the ~49 integration tests that seed
    // memberships; full strict-only reject is the planned f1-d end state.)
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
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe('AUTH_INVALID');
    // No identity attached for a rejected token.
    expect(res.json().userId).toBeUndefined();
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
