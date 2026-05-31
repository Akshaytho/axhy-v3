/**
 * Wave-3 hardening — Gap 1: expired-token coverage for HR write endpoints.
 *
 * For each HR write endpoint, mint a JWT with exp in the past, hit the
 * route, expect 401. Proves the JWT verifier honours `exp` on every HR
 * write surface, not just access-token issuance.
 *
 * Note on /auth/refresh: refresh tokens are opaque (axrt_<base64url>),
 * not JWTs. The current refresh-token-store.validate() path
 * (apps/backend/src/lib/services/refresh-token-store.ts lines 154-183)
 * does NOT check `expiresAt`, so there is no expired-refresh rejection
 * path to assert here. A separate test that proves the gap would surface
 * a real route bug — documented in EVID-HR-WAVE-3-BUGS.md if needed;
 * out of scope for this Wave-3 PR (tests-only, no route changes).
 *
 * @derives(Wave-3 hardening matrix Gap 1)
 */

// [ORCHESTRATOR_EXCEPTION] Wave-3 hardening — test-file scaffolding per parent brief
import { randomUUID } from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SignJWT } from 'jose';

import { buildTestApp, seedTenantWithTwoPods, type TestCtx } from './helpers.js';

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);
const secretKey = new TextEncoder().encode(process.env.JWT_SECRET);

/**
 * Mint a JWT shaped like issueAccessToken output but with exp in the
 * past. mintToken() in helpers.ts hard-codes exp = now + 900 with no
 * TTL knob, so we sign raw here to forge a stale token.
 */
async function mintExpiredToken(payload: {
  userId: string;
  companyId: string;
  role: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    sub: payload.userId,
    companyId: payload.companyId,
    role: payload.role,
    availableRoles: [payload.role],
    locale: 'en',
    iat: now - 3600,
    exp: now - 60,
    kind: 'access',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .sign(secretKey);
}

let ctx: TestCtx;
let expiredHrToken: string;
let expiredOwnerToken: string;

beforeAll(async () => {
  ctx = await buildTestApp();
  await seedTenantWithTwoPods(ctx);
  expiredHrToken = await mintExpiredToken({
    userId: ctx.fixtures.hrA.userId,
    companyId: ctx.fixtures.tenant1,
    role: 'HR',
  });
  expiredOwnerToken = await mintExpiredToken({
    userId: ctx.fixtures.owner.userId,
    companyId: ctx.fixtures.tenant1,
    role: 'OWNER',
  });
});

afterAll(async () => {
  await ctx.reset();
  await ctx.app.close();
  await ctx.prisma.$disconnect();
});

describe('Wave-3 Gap 1: expired-token negative tests on HR write endpoints', () => {
  it('POST /admin/memberships with expired OWNER token → 401', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/admin/memberships',
      headers: { authorization: `Bearer ${expiredOwnerToken}`, 'content-type': 'application/json' },
      payload: {
        phone: `+9199${String(Date.now()).slice(-8)}`,
        name: 'Should Reject',
        role: 'HR',
        baseSalaryPaise: 5_000_000,
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /admin/workers with expired HR token → 401', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/admin/workers',
      headers: { authorization: `Bearer ${expiredHrToken}`, 'content-type': 'application/json' },
      payload: {
        phone: `+9199${String(Date.now() + 1).slice(-8)}`,
        name: 'Should Reject',
        baseSalaryPaise: 2_000_000,
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /admin/workers/:id/anonymize with expired HR token → 401', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/admin/workers/${ctx.fixtures.workerA1.workerId}/anonymize`,
      headers: { authorization: `Bearer ${expiredHrToken}`, 'content-type': 'application/json' },
      payload: { reason: 'expired-token test' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /admin/sites with expired HR token → 401', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/admin/sites',
      headers: { authorization: `Bearer ${expiredHrToken}`, 'content-type': 'application/json' },
      payload: { name: 'Should Reject Site' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /admin/sites/:id/bindings with expired HR token → 401', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/admin/sites/${ctx.fixtures.siteA.id}/bindings`,
      headers: { authorization: `Bearer ${expiredHrToken}`, 'content-type': 'application/json' },
      payload: {
        supervisorUserId: ctx.fixtures.supervisorA.userId,
        effectiveFrom: new Date().toISOString(),
        reason: 'expired-token test',
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /leave-requests/:id/approve with expired HR token → 401', async () => {
    const tomorrow = new Date();
    tomorrow.setUTCHours(0, 0, 0, 0);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const leave = await ctx.prisma.leaveRequest.create({
      data: {
        id: randomUUID(),
        companyId: ctx.fixtures.tenant1,
        workerId: ctx.fixtures.workerA1.workerId,
        fromDate: tomorrow,
        toDate: tomorrow,
        reason: 'expired-token approve test',
        state: 'REQUESTED',
      },
    });

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/leave-requests/${leave.id}/approve`,
      headers: { authorization: `Bearer ${expiredHrToken}`, 'content-type': 'application/json' },
      payload: { reason: 'should be rejected before reaching service' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('POST /leave-requests/:id/reject with expired HR token → 401', async () => {
    const tomorrow = new Date();
    tomorrow.setUTCHours(0, 0, 0, 0);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const leave = await ctx.prisma.leaveRequest.create({
      data: {
        id: randomUUID(),
        companyId: ctx.fixtures.tenant1,
        workerId: ctx.fixtures.workerA1.workerId,
        fromDate: tomorrow,
        toDate: tomorrow,
        reason: 'expired-token reject test',
        state: 'REQUESTED',
      },
    });

    const res = await ctx.app.inject({
      method: 'POST',
      url: `/leave-requests/${leave.id}/reject`,
      headers: { authorization: `Bearer ${expiredHrToken}`, 'content-type': 'application/json' },
      payload: { reason: 'should be rejected before reaching service' },
    });
    expect(res.statusCode).toBe(401);
  });
});
