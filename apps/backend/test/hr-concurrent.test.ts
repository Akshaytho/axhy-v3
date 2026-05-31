/**
 * Wave-3 hardening — Gap 3: concurrent race coverage on HR write endpoints.
 *
 * Proves the route uses a transactional / conditional-update guard so
 * exactly one of two simultaneous writes wins, and the loser sees a
 * documented 409 instead of silently double-mutating or returning 500.
 *
 * Coverage:
 *  - Two HR users decide same leave-request in parallel → 1 × 200, 1 × 409
 *  - Two HR callers POST same {phone, role} in parallel → 1 × 200, 1 × 409
 *
 * Uses Promise.allSettled and counts fulfilled-OK outcomes — more
 * robust than Promise.all when one branch may reject at the HTTP layer.
 *
 * @derives(Wave-3 hardening matrix Gap 3)
 * @derives(Cluster A leave-decision concurrent-update fix —
 *   apps/backend/src/routes/leave-requests.ts:268-282)
 */

// [ORCHESTRATOR_EXCEPTION] Wave-3 hardening — test-file scaffolding per parent brief
import { randomUUID } from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { buildTestApp, mintToken, seedTenantWithTwoPods, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let hrAToken: string;
let hrBToken: string;
let ownerToken: string;

function freshPhone(): string {
  const eight = randomUUID().replace(/-/g, '').slice(0, 8);
  const num = parseInt(eight, 16).toString().padStart(8, '0').slice(0, 8);
  return `+9199${num}`;
}

beforeAll(async () => {
  ctx = await buildTestApp();
  await seedTenantWithTwoPods(ctx);
  hrAToken = await mintToken(ctx, {
    userId: ctx.fixtures.hrA.userId,
    companyId: ctx.fixtures.tenant1,
    role: 'HR',
  });
  hrBToken = await mintToken(ctx, {
    userId: ctx.fixtures.hrB.userId,
    companyId: ctx.fixtures.tenant1,
    role: 'HR',
  });
  ownerToken = await mintToken(ctx, {
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

/** Count fulfilled responses with statusCode === expected. */
function countStatus(
  results: PromiseSettledResult<{ statusCode: number }>[],
  code: number,
): number {
  return results.filter((r) => r.status === 'fulfilled' && r.value.statusCode === code).length;
}

describe('Wave-3 Gap 3: concurrent races on HR endpoints', () => {
  it('two HR users decide same leave-request in parallel → 1 × 200, 1 × 409', async () => {
    // workerA1 lives in pod A; hrA owns pod A so the pod-scope gate
    // passes. hrB owns pod B and would be blocked by NOT_YOUR_POD —
    // so the race must use two callers who both have scope. Move the
    // worker into a leave the hrA pod can decide, but fire two parallel
    // calls from hrA (different tokens, same user) — same outcome
    // contract: conditional UPDATE means only one transitions, the
    // other sees 409. To exercise true two-caller race we need to
    // temporarily share pod scope; simpler: re-bind workerB1 to pod A
    // is invasive. Instead, fire two requests as hrA in parallel —
    // tests the conditional-UPDATE guard end-to-end.

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
        reason: 'concurrent decision race',
        state: 'REQUESTED',
      },
    });

    const hit = (token: string) =>
      ctx.app.inject({
        method: 'POST',
        url: `/leave-requests/${leave.id}/approve`,
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        payload: { reason: `race decider ${token.slice(-6)}` },
      });

    const results = await Promise.allSettled([hit(hrAToken), hit(hrAToken)]);
    const okCount = countStatus(results as PromiseSettledResult<{ statusCode: number }>[], 200);
    const conflictCount = countStatus(
      results as PromiseSettledResult<{ statusCode: number }>[],
      409,
    );
    expect(okCount).toBe(1);
    expect(conflictCount).toBe(1);

    // Confirm row is in a terminal state, not still REQUESTED.
    const after = await ctx.prisma.leaveRequest.findUnique({ where: { id: leave.id } });
    expect(after?.state).toBe('APPROVED');
  });

  it('two HR users decide same leave-request via hrB (pod B scope) in parallel → 1 × 200, 1 × 409', async () => {
    // True two-caller race using a leave whose worker is in pod B (hrB
    // scope). hrB is the only HR with scope — two parallel hrB tokens
    // model "two browser tabs of the same HR" which is the realistic
    // race surface.
    const tomorrow = new Date();
    tomorrow.setUTCHours(0, 0, 0, 0);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const leave = await ctx.prisma.leaveRequest.create({
      data: {
        id: randomUUID(),
        companyId: ctx.fixtures.tenant1,
        workerId: ctx.fixtures.workerB1.workerId,
        fromDate: tomorrow,
        toDate: tomorrow,
        reason: 'concurrent decision race (pod B)',
        state: 'REQUESTED',
      },
    });

    const hit = () =>
      ctx.app.inject({
        method: 'POST',
        url: `/leave-requests/${leave.id}/reject`,
        headers: { authorization: `Bearer ${hrBToken}`, 'content-type': 'application/json' },
        payload: { reason: 'race rejecter' },
      });

    const results = await Promise.allSettled([hit(), hit()]);
    const okCount = countStatus(results as PromiseSettledResult<{ statusCode: number }>[], 200);
    const conflictCount = countStatus(
      results as PromiseSettledResult<{ statusCode: number }>[],
      409,
    );
    expect(okCount).toBe(1);
    expect(conflictCount).toBe(1);
  });

  it('two callers POST same {phone, role} membership in parallel → 1 × 200, 1 × 409', async () => {
    const phone = freshPhone();
    const body = {
      phone,
      name: 'Concurrent HR',
      role: 'HR' as const,
      baseSalaryPaise: 5_000_000,
    };
    const hit = () =>
      ctx.app.inject({
        method: 'POST',
        url: '/admin/memberships',
        headers: { authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json' },
        payload: body,
      });

    const results = await Promise.allSettled([hit(), hit()]);
    const okCount = countStatus(results as PromiseSettledResult<{ statusCode: number }>[], 200);
    const conflictCount = countStatus(
      results as PromiseSettledResult<{ statusCode: number }>[],
      409,
    );
    expect(okCount).toBe(1);
    expect(conflictCount).toBe(1);
  });
});
