/**
 * HR-A1 Task 7 — pod-scope gate tests for leave-requests routes.
 * [ORCHESTRATOR_EXCEPTION] worker-identity contract + Task 7 completion per parent brief
 *
 * Covers (per parent brief):
 *  - GET /leave-requests inbox: HR-A sees Pod A REQUESTED, not Pod B, not Tenant 2,
 *    not worker-without-pod; pagination with limit=1 returns 1 + nextCursor.
 *  - GET /leave-requests/:id detail: HR-A on own-pod (200), other-pod (404),
 *    cross-tenant (404).
 *  - POST /leave-requests/:id/approve gates: HR own-pod (200), HR other-pod
 *    (403 NOT_YOUR_POD), HR worker-without-pod (403 WORKER_NOT_IN_POD),
 *    SUPERVISOR with portfolio binding (200 regression), WORKER (403 regression),
 *    tenant isolation on inbox.
 *
 * Worker rows + SiteSupervisorBinding are now seeded by helpers
 * (seedTenantWithTwoPods). This file adds only the extra "no-pod" worker
 * and the leave-request fixtures.
 *
 * @derives(parent-brief 2026-05-29)
 * @derives(docs/plans/2026-05-29-hr-a1-implementation.md Task 7)
 */

// Resolve DB URL to public proxy when running under `railway run --service Postgres`
// (which only injects internal DNS). Mirrors pattern in auth-refresh-rotation-grace.test.ts.
process.env.DATABASE_URL =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp, mintToken, seedTenantWithTwoPods, type TestCtx } from './helpers.js';

let ctx: TestCtx;

// Per-suite extras: a third worker on tenant 1 with no pod (for the
// WORKER_NOT_IN_POD case) and the leave-request ids per scenario.
type Extra = {
  workerNoPodId: string;
  leaveAReqId: string;
  leaveBReqId: string;
  leaveNoPodReqId: string;
  leaveTenant2ReqId: string;
};
let extra: Extra;

let phoneCounter = 0;
const stamp = Date.now();
function uniquePhone(): string {
  phoneCounter += 1;
  const digits = String(stamp * 100 + phoneCounter)
    .slice(-8)
    .padStart(8, '0');
  return `+9189${digits}`;
}

async function extendSeed(): Promise<void> {
  const { prisma, fixtures } = ctx;

  // No-pod worker on tenant 1 (helper only seeds pod-A and pod-B workers).
  const noPodUserId = randomUUID();
  await prisma.user.create({
    data: { id: noPodUserId, phone: uniquePhone(), name: 'No Pod Worker', locale: 'en' },
  });
  await prisma.membership.create({
    data: {
      id: randomUUID(),
      companyId: fixtures.tenant1,
      userId: noPodUserId,
      role: 'WORKER',
      status: 'ACTIVE',
      podId: null,
    },
  });
  const workerNoPod = await prisma.worker.create({
    data: {
      companyId: fixtures.tenant1,
      userId: noPodUserId,
      name: 'No Pod Worker',
      phone: uniquePhone(),
      state: 'ACTIVE',
    },
  });

  // Leave requests — note workerId is Worker.id (LeaveRequest.workerId FK→Worker.id).
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const leaveA = await prisma.leaveRequest.create({
    data: {
      id: randomUUID(),
      companyId: fixtures.tenant1,
      workerId: fixtures.workerA1.workerId,
      fromDate: tomorrow,
      toDate: tomorrow,
      reason: 'flu',
      state: 'REQUESTED',
    },
  });
  const leaveB = await prisma.leaveRequest.create({
    data: {
      id: randomUUID(),
      companyId: fixtures.tenant1,
      workerId: fixtures.workerB1.workerId,
      fromDate: tomorrow,
      toDate: tomorrow,
      reason: 'family',
      state: 'REQUESTED',
    },
  });
  const leaveNoPod = await prisma.leaveRequest.create({
    data: {
      id: randomUUID(),
      companyId: fixtures.tenant1,
      workerId: workerNoPod.id,
      fromDate: tomorrow,
      toDate: tomorrow,
      reason: 'misc',
      state: 'REQUESTED',
    },
  });
  const leaveT2 = await prisma.leaveRequest.create({
    data: {
      id: randomUUID(),
      companyId: fixtures.tenant2,
      workerId: fixtures.tenant2WorkerId,
      fromDate: tomorrow,
      toDate: tomorrow,
      reason: 'cross-tenant',
      state: 'REQUESTED',
    },
  });

  extra = {
    workerNoPodId: workerNoPod.id,
    leaveAReqId: leaveA.id,
    leaveBReqId: leaveB.id,
    leaveNoPodReqId: leaveNoPod.id,
    leaveTenant2ReqId: leaveT2.id,
  };
}

beforeAll(async () => {
  ctx = await buildTestApp();
});

afterAll(async () => {
  await ctx.app.close();
  await ctx.prisma.$disconnect();
});

beforeEach(async () => {
  await ctx.reset();
  await seedTenantWithTwoPods(ctx);
  await extendSeed();
});

function bearer(role: string, userId: string, companyId: string) {
  return mintToken(ctx, { role, userId, companyId });
}

describe('GET /leave-requests inbox (HR pod-scoped)', () => {
  it('HR-A sees only Pod A REQUESTED leaves; not Pod B, not Tenant 2, not no-pod', async () => {
    const token = await bearer('HR', ctx.fixtures.hrA.userId, ctx.fixtures.tenant1);
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/leave-requests',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const ids = (res.json().items as Array<{ id: string }>).map((r) => r.id);
    expect(ids).toContain(extra.leaveAReqId);
    expect(ids).not.toContain(extra.leaveBReqId);
    expect(ids).not.toContain(extra.leaveTenant2ReqId);
    expect(ids).not.toContain(extra.leaveNoPodReqId);
  });

  it('tenant isolation: HR in tenant 1 never sees tenant 2 leaves', async () => {
    const token = await bearer('HR', ctx.fixtures.hrA.userId, ctx.fixtures.tenant1);
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/leave-requests',
      headers: { authorization: `Bearer ${token}` },
    });
    const ids = (res.json().items as Array<{ id: string }>).map((r) => r.id);
    expect(ids).not.toContain(extra.leaveTenant2ReqId);
  });

  it('pagination: limit=1 returns 1 item + nextCursor', async () => {
    // Add a second pod-A leave so HR-A has >1 row to paginate.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await ctx.prisma.leaveRequest.create({
      data: {
        id: randomUUID(),
        companyId: ctx.fixtures.tenant1,
        workerId: ctx.fixtures.workerA1.workerId,
        fromDate: today,
        toDate: today,
        reason: 'second',
        state: 'REQUESTED',
      },
    });
    const token = await bearer('HR', ctx.fixtures.hrA.userId, ctx.fixtures.tenant1);
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/leave-requests?limit=1',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: unknown[]; nextCursor: string | null };
    expect(body.items.length).toBe(1);
    expect(typeof body.nextCursor).toBe('string');
  });
});

describe('GET /leave-requests/:id detail (HR pod-scoped + SUPERVISOR portfolio)', () => {
  it('HR-A on own-pod worker: 200; response includes workerName + workerPhone', async () => {
    const token = await bearer('HR', ctx.fixtures.hrA.userId, ctx.fixtures.tenant1);
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/leave-requests/${extra.leaveAReqId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      id: string;
      workerId: string;
      workerName: string;
      workerPhone: string;
    };
    expect(body.id).toBe(extra.leaveAReqId);
    expect(body.workerId).toBe(ctx.fixtures.workerA1.workerId);
    expect(body.workerName).toBeTruthy();
    expect(body.workerPhone).toBeTruthy();
  });

  it('HR-A on other-pod worker: 404 (does not leak existence)', async () => {
    const token = await bearer('HR', ctx.fixtures.hrA.userId, ctx.fixtures.tenant1);
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/leave-requests/${extra.leaveBReqId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('tenant isolation: HR in tenant 1 cannot see tenant 2 leave detail', async () => {
    const token = await bearer('HR', ctx.fixtures.hrA.userId, ctx.fixtures.tenant1);
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/leave-requests/${extra.leaveTenant2ReqId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /leave-requests/:id/approve gates', () => {
  it('HR-A own-pod worker: 200', async () => {
    const token = await bearer('HR', ctx.fixtures.hrA.userId, ctx.fixtures.tenant1);
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/leave-requests/${extra.leaveAReqId}/approve`,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().state).toBe('APPROVED');
  });

  it('HR-A other-pod worker: 403 NOT_YOUR_POD', async () => {
    const token = await bearer('HR', ctx.fixtures.hrA.userId, ctx.fixtures.tenant1);
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/leave-requests/${extra.leaveBReqId}/approve`,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('NOT_YOUR_POD');
  });

  it('HR-A worker-without-pod: 403 WORKER_NOT_IN_POD', async () => {
    const token = await bearer('HR', ctx.fixtures.hrA.userId, ctx.fixtures.tenant1);
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/leave-requests/${extra.leaveNoPodReqId}/approve`,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('WORKER_NOT_IN_POD');
  });

  it('SUPERVISOR with portfolio binding (siteA): 200 (regression)', async () => {
    const token = await bearer('SUPERVISOR', ctx.fixtures.supervisorA.userId, ctx.fixtures.tenant1);
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/leave-requests/${extra.leaveAReqId}/approve`,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().state).toBe('APPROVED');
  });

  it('WORKER: 403 (regression — workers cannot approve)', async () => {
    const token = await bearer('WORKER', ctx.fixtures.workerA1.userId, ctx.fixtures.tenant1);
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/leave-requests/${extra.leaveAReqId}/approve`,
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });
});
