/**
 * Wave-3 hardening — Gap 2: duplicate-request idempotency for HR write
 * endpoints. Confirms the second identical write returns the documented
 * 409 (or terminal state) instead of silently creating duplicates or
 * partially mutating shared rows.
 *
 * Coverage:
 *  - POST /admin/memberships same {phone, role} twice → 200, 409
 *  - POST /admin/workers same phone twice → 200, 409
 *  - POST /admin/workers/:id/anonymize twice → 200, 409 WORKER_ALREADY_TERMINATED
 *  - POST /leave-requests/:id/approve then /reject → 409 ALREADY_DECIDED
 *  - POST /leave-requests/:id/reject then /approve → 409 ALREADY_DECIDED
 *
 * @derives(Wave-3 hardening matrix Gap 2)
 */

// [ORCHESTRATOR_EXCEPTION] Wave-3 hardening — test-file scaffolding per parent brief
import { randomUUID } from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { buildTestApp, mintToken, seedTenantWithTwoPods, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let ownerToken: string;
let hrAToken: string;

function freshPhone(salt = 0): string {
  // Crypto-quality phone uniqueness across parallel test files.
  const eight = randomUUID().replace(/-/g, '').slice(0, 8);
  const num = parseInt(eight, 16).toString().padStart(8, '0').slice(0, 8);
  return `+9199${num}${salt ? salt : ''}`.slice(0, 15);
}

beforeAll(async () => {
  ctx = await buildTestApp();
  await seedTenantWithTwoPods(ctx);
  ownerToken = await mintToken(ctx, {
    userId: ctx.fixtures.owner.userId,
    companyId: ctx.fixtures.tenant1,
    role: 'OWNER',
  });
  hrAToken = await mintToken(ctx, {
    userId: ctx.fixtures.hrA.userId,
    companyId: ctx.fixtures.tenant1,
    role: 'HR',
  });
});

afterAll(async () => {
  await ctx.reset();
  await ctx.app.close();
  await ctx.prisma.$disconnect();
});

describe('Wave-3 Gap 2: duplicate-request idempotency', () => {
  it('POST /admin/memberships same {phone, role} twice → 200, 409', async () => {
    const phone = freshPhone();
    const body = {
      phone,
      name: 'Dup HR',
      role: 'HR' as const,
      baseSalaryPaise: 5_000_000,
    };
    const first = await ctx.app.inject({
      method: 'POST',
      url: '/admin/memberships',
      headers: { authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json' },
      payload: body,
    });
    expect(first.statusCode).toBe(200);

    const second = await ctx.app.inject({
      method: 'POST',
      url: '/admin/memberships',
      headers: { authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json' },
      payload: body,
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toBe('MEMBERSHIP_ALREADY_EXISTS');
  });

  it('POST /admin/workers same phone twice → 200, 409', async () => {
    const phone = freshPhone(1);
    const body = {
      phone,
      name: 'Dup Worker',
      baseSalaryPaise: 2_000_000,
    };
    const first = await ctx.app.inject({
      method: 'POST',
      url: '/admin/workers',
      headers: { authorization: `Bearer ${hrAToken}`, 'content-type': 'application/json' },
      payload: body,
    });
    expect(first.statusCode).toBe(200);

    const second = await ctx.app.inject({
      method: 'POST',
      url: '/admin/workers',
      headers: { authorization: `Bearer ${hrAToken}`, 'content-type': 'application/json' },
      payload: body,
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toBe('WORKER_ALREADY_EXISTS');
  });

  it('POST /admin/workers/:id/anonymize twice → 200, 409 WORKER_ALREADY_TERMINATED', async () => {
    // workerB1 is in pod B (hrB scope). Use a token for hrB so we have
    // pod scope; if it fails for scope reasons, the test should surface
    // it. Use hrAToken against workerA1 instead — same pod (Pod A).
    const workerId = ctx.fixtures.workerA1.workerId;

    const first = await ctx.app.inject({
      method: 'POST',
      url: `/admin/workers/${workerId}/anonymize`,
      headers: { authorization: `Bearer ${hrAToken}`, 'content-type': 'application/json' },
      payload: { reason: 'idempotency first call' },
    });
    expect(first.statusCode).toBe(200);

    const second = await ctx.app.inject({
      method: 'POST',
      url: `/admin/workers/${workerId}/anonymize`,
      headers: { authorization: `Bearer ${hrAToken}`, 'content-type': 'application/json' },
      payload: { reason: 'idempotency second call' },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toBe('WORKER_ALREADY_TERMINATED');
  });

  // [ORCHESTRATOR_EXCEPTION] Wave-3 idempotency fix — direct seed pattern, no production code change
  it('POST /leave-requests/:id/approve then /reject → 409 ALREADY_DECIDED', async () => {
    // workerB1 lives in pod B, but workerA1 was just anonymized above.
    // Create a fresh worker in pod A so the HR token can decide its
    // leave without running into TERMINATED-state side effects.
    //
    // NOTE: We seed Worker + Membership directly (not via POST /admin/workers)
    // because adminCreateWorkerService does NOT assign Membership.podId, which
    // would break HR pod-scope on the subsequent decide call. Architectural
    // question surfaced in handoff/NEXT_SESSION.md.
    const phone = freshPhone(2);
    const workerUserId = randomUUID();
    const workerId = randomUUID();
    await ctx.prisma.user.create({
      data: { id: workerUserId, phone, name: 'Idem Worker A', locale: 'en' },
    });
    ctx.ownedUserIds.add(workerUserId);
    await ctx.prisma.membership.create({
      data: {
        id: randomUUID(),
        companyId: ctx.fixtures.tenant1,
        userId: workerUserId,
        role: 'WORKER',
        status: 'ACTIVE',
        baseSalaryPaise: 2_000_000,
        podId: ctx.fixtures.hrA.podId,
      },
    });
    await ctx.prisma.worker.create({
      data: {
        id: workerId,
        companyId: ctx.fixtures.tenant1,
        userId: workerUserId,
        name: 'Idem Worker A',
        phone,
        state: 'ACTIVE',
      },
    });

    const tomorrow = new Date();
    tomorrow.setUTCHours(0, 0, 0, 0);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const leave = await ctx.prisma.leaveRequest.create({
      data: {
        id: randomUUID(),
        companyId: ctx.fixtures.tenant1,
        workerId,
        fromDate: tomorrow,
        toDate: tomorrow,
        reason: 'idempotency approve→reject',
        state: 'REQUESTED',
      },
    });

    const approve = await ctx.app.inject({
      method: 'POST',
      url: `/leave-requests/${leave.id}/approve`,
      headers: { authorization: `Bearer ${hrAToken}`, 'content-type': 'application/json' },
      payload: { reason: 'first decision' },
    });
    expect(approve.statusCode).toBe(200);

    const reject = await ctx.app.inject({
      method: 'POST',
      url: `/leave-requests/${leave.id}/reject`,
      headers: { authorization: `Bearer ${hrAToken}`, 'content-type': 'application/json' },
      payload: { reason: 'second decision attempt' },
    });
    expect(reject.statusCode).toBe(409);
    expect(reject.json().error).toBe('ALREADY_DECIDED');
    expect(reject.json().state).toBe('APPROVED');
  });

  // [ORCHESTRATOR_EXCEPTION] Wave-3 idempotency fix — direct seed pattern, no production code change
  it('POST /leave-requests/:id/reject then /approve → 409 ALREADY_DECIDED', async () => {
    // Same direct-seed pattern as previous test — bypasses the
    // adminCreateWorkerService podId gap (see handoff/NEXT_SESSION.md).
    const phone = freshPhone(3);
    const workerUserId = randomUUID();
    const workerId = randomUUID();
    await ctx.prisma.user.create({
      data: { id: workerUserId, phone, name: 'Idem Worker B', locale: 'en' },
    });
    ctx.ownedUserIds.add(workerUserId);
    await ctx.prisma.membership.create({
      data: {
        id: randomUUID(),
        companyId: ctx.fixtures.tenant1,
        userId: workerUserId,
        role: 'WORKER',
        status: 'ACTIVE',
        baseSalaryPaise: 2_000_000,
        podId: ctx.fixtures.hrA.podId,
      },
    });
    await ctx.prisma.worker.create({
      data: {
        id: workerId,
        companyId: ctx.fixtures.tenant1,
        userId: workerUserId,
        name: 'Idem Worker B',
        phone,
        state: 'ACTIVE',
      },
    });

    const tomorrow = new Date();
    tomorrow.setUTCHours(0, 0, 0, 0);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const leave = await ctx.prisma.leaveRequest.create({
      data: {
        id: randomUUID(),
        companyId: ctx.fixtures.tenant1,
        workerId,
        fromDate: tomorrow,
        toDate: tomorrow,
        reason: 'idempotency reject→approve',
        state: 'REQUESTED',
      },
    });

    const reject = await ctx.app.inject({
      method: 'POST',
      url: `/leave-requests/${leave.id}/reject`,
      headers: { authorization: `Bearer ${hrAToken}`, 'content-type': 'application/json' },
      payload: { reason: 'first decision' },
    });
    expect(reject.statusCode).toBe(200);

    const approve = await ctx.app.inject({
      method: 'POST',
      url: `/leave-requests/${leave.id}/approve`,
      headers: { authorization: `Bearer ${hrAToken}`, 'content-type': 'application/json' },
      payload: { reason: 'second decision attempt' },
    });
    expect(approve.statusCode).toBe(409);
    expect(approve.json().error).toBe('ALREADY_DECIDED');
    expect(approve.json().state).toBe('REJECTED');
  });
});
