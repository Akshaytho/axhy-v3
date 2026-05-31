/**
 * Integration tests for GET /admin/workers + GET /admin/workers/:id.
 * [ORCHESTRATOR_EXCEPTION] Task 5 of docs/plans/2026-05-29-hr-a1-implementation.md.
 *
 * @derives(ADR-0026)
 */

// [ORCHESTRATOR_EXCEPTION] single-line DB env override for new test file; in-context op required
// Resolve DB URL to public proxy when running under `railway run --service Postgres`
// (which only injects internal DNS). Mirrors pattern in auth-refresh-rotation-grace.test.ts.
process.env.DATABASE_URL =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildTestApp, mintToken, seedTenantWithTwoPods, type TestCtx } from './helpers.js';

let ctx: TestCtx;

beforeAll(async () => {
  ctx = await buildTestApp();
});

afterEach(async () => {
  await ctx.reset();
});

afterAll(async () => {
  await ctx.app.close();
  await ctx.prisma.$disconnect();
});

async function authHeader(role: string, userId: string, companyId: string): Promise<string> {
  const token = await mintToken(ctx, { userId, companyId, role });
  return `Bearer ${token}`;
}

describe('GET /admin/workers (list)', () => {
  it('401 without Authorization header', async () => {
    await seedTenantWithTwoPods(ctx);
    const res = await ctx.app.inject({ method: 'GET', url: '/admin/workers' });
    expect(res.statusCode).toBe(401);
  });

  it('403 when caller is WORKER', async () => {
    await seedTenantWithTwoPods(ctx);
    const { workerA1 } = ctx.fixtures;
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/admin/workers',
      headers: { authorization: await authHeader('WORKER', workerA1.userId, ctx.fixtures.tenant1) },
    });
    expect(res.statusCode).toBe(403);
  });

  it('403 when caller is SUPERVISOR', async () => {
    await seedTenantWithTwoPods(ctx);
    const { supervisorA } = ctx.fixtures;
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/admin/workers',
      headers: {
        authorization: await authHeader('SUPERVISOR', supervisorA.userId, ctx.fixtures.tenant1),
      },
    });
    expect(res.statusCode).toBe(403);
  });

  // [ORCHESTRATOR_EXCEPTION] worker-identity contract — assert workerId === Worker.id (not User.id)
  it('HR-A sees only Pod A workers (not Pod B, not Tenant 2); workerId is Worker.id', async () => {
    await seedTenantWithTwoPods(ctx);
    const { hrA, workerA1, workerB1, tenant1 } = ctx.fixtures;
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/admin/workers',
      headers: { authorization: await authHeader('HR', hrA.userId, tenant1) },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      items: Array<{ workerId: string; userId: string; podId: string | null }>;
    };
    const workerIds = body.items.map((i) => i.workerId);
    expect(workerIds).toContain(workerA1.workerId);
    expect(workerIds).not.toContain(workerB1.workerId);
    // Worker.id must NOT equal User.id (the prior bug exposed User.id).
    for (const item of body.items) {
      expect(item.workerId).not.toBe(item.userId);
      expect(item.podId).toBe(hrA.podId);
    }
  });

  it('OWNER sees all workers in tenant; cross-tenant invisible; workerId is Worker.id', async () => {
    await seedTenantWithTwoPods(ctx);
    const { owner, workerA1, workerB1, tenant1, tenant2WorkerId } = ctx.fixtures;
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/admin/workers',
      headers: { authorization: await authHeader('OWNER', owner.userId, tenant1) },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      items: Array<{ workerId: string; userId: string; membershipId: string }>;
    };
    const workerIds = body.items.map((i) => i.workerId);
    expect(workerIds).toContain(workerA1.workerId);
    expect(workerIds).toContain(workerB1.workerId);
    expect(workerIds).not.toContain(tenant2WorkerId);
  });

  it('pagination with ?limit=1 returns a single item and a nextCursor', async () => {
    await seedTenantWithTwoPods(ctx);
    const { owner, tenant1 } = ctx.fixtures;
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/admin/workers?limit=1',
      headers: { authorization: await authHeader('OWNER', owner.userId, tenant1) },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: unknown[]; nextCursor: string | null };
    expect(body.items.length).toBe(1);
    expect(typeof body.nextCursor).toBe('string');
    const page2 = await ctx.app.inject({
      method: 'GET',
      url: `/admin/workers?limit=1&cursor=${encodeURIComponent(body.nextCursor!)}`,
      headers: { authorization: await authHeader('OWNER', owner.userId, tenant1) },
    });
    expect(page2.statusCode).toBe(200);
    const page2Body = page2.json() as { items: unknown[]; nextCursor: string | null };
    expect(page2Body.items.length).toBe(1);
    expect(page2Body.nextCursor).toBeNull();
  });

  it('malformed cursor returns 400 CURSOR_INVALID', async () => {
    await seedTenantWithTwoPods(ctx);
    const { owner, tenant1 } = ctx.fixtures;
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/admin/workers?cursor=not-base64-and-no-colon',
      headers: { authorization: await authHeader('OWNER', owner.userId, tenant1) },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe('CURSOR_INVALID');
  });
});

describe('GET /admin/workers/:id (detail) — :id is Worker.id', () => {
  // [ORCHESTRATOR_EXCEPTION] detail :id semantics changed to Worker.id per parent brief
  it('200 in-scope worker for HR-A (by Worker.id)', async () => {
    await seedTenantWithTwoPods(ctx);
    const { hrA, workerA1, tenant1 } = ctx.fixtures;
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/admin/workers/${workerA1.workerId}`,
      headers: { authorization: await authHeader('HR', hrA.userId, tenant1) },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { workerId: string; userId: string; podId: string | null };
    expect(body.workerId).toBe(workerA1.workerId);
    expect(body.userId).toBe(workerA1.userId);
    expect(body.podId).toBe(hrA.podId);
  });

  it('404 out-of-scope worker for HR (does not leak existence)', async () => {
    await seedTenantWithTwoPods(ctx);
    const { hrA, workerB1, tenant1 } = ctx.fixtures;
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/admin/workers/${workerB1.workerId}`,
      headers: { authorization: await authHeader('HR', hrA.userId, tenant1) },
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: string }).error).toBe('WORKER_NOT_FOUND');
  });

  it('200 same-tenant out-of-scope worker for OWNER (OWNER is tenant-wide)', async () => {
    await seedTenantWithTwoPods(ctx);
    const { owner, workerB1, tenant1 } = ctx.fixtures;
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/admin/workers/${workerB1.workerId}`,
      headers: { authorization: await authHeader('OWNER', owner.userId, tenant1) },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { workerId: string }).workerId).toBe(workerB1.workerId);
  });

  it('404 cross-tenant worker even for OWNER (tenant isolation)', async () => {
    await seedTenantWithTwoPods(ctx);
    const { owner, tenant1, tenant2WorkerId } = ctx.fixtures;
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/admin/workers/${tenant2WorkerId}`,
      headers: { authorization: await authHeader('OWNER', owner.userId, tenant1) },
    });
    expect(res.statusCode).toBe(404);
  });

  it('404 when :id is a User.id (regression — must NOT accept User.id)', async () => {
    await seedTenantWithTwoPods(ctx);
    const { owner, workerA1, tenant1 } = ctx.fixtures;
    const res = await ctx.app.inject({
      method: 'GET',
      // workerA1.userId is User.id (NOT Worker.id) — must 404.
      url: `/admin/workers/${workerA1.userId}`,
      headers: { authorization: await authHeader('OWNER', owner.userId, tenant1) },
    });
    expect(res.statusCode).toBe(404);
  });
});
