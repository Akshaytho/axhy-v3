/**
 * Integration tests for GET /admin/memberships (HR-A1 Task 3).
 * [ORCHESTRATOR_EXCEPTION] single-task continuation
 *
 * @derives(docs/plans/2026-05-29-hr-a1-implementation.md Task 3)
 * @derives(ADR-0026)
 */

// Resolve DB URL to public proxy when running under `railway run --service Postgres`
// (which only injects internal DNS). Mirrors pattern in auth-refresh-rotation-grace.test.ts.
process.env.DATABASE_URL =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp, mintToken, seedTenantWithTwoPods, type TestCtx } from './helpers.js';

let ctx: TestCtx;

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
});

describe('GET /admin/memberships', () => {
  it('returns 401 without auth', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/admin/memberships' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 for WORKER role', async () => {
    const token = await mintToken(ctx, {
      role: 'WORKER',
      userId: ctx.fixtures.workerA1.userId,
      companyId: ctx.fixtures.tenant1,
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/admin/memberships',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('HR-A sees only Pod A memberships', async () => {
    const token = await mintToken(ctx, {
      role: 'HR',
      userId: ctx.fixtures.hrA.userId,
      companyId: ctx.fixtures.tenant1,
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/admin/memberships',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const ids = body.items.map((m: { id: string }) => m.id);
    expect(ids).toContain(ctx.fixtures.workerA1.membershipId);
    expect(ids).not.toContain(ctx.fixtures.workerB1.membershipId);
  });

  it('OWNER sees all memberships in tenant', async () => {
    const token = await mintToken(ctx, {
      role: 'OWNER',
      userId: ctx.fixtures.owner.userId,
      companyId: ctx.fixtures.tenant1,
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/admin/memberships',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const ids = res.json().items.map((m: { id: string }) => m.id);
    expect(ids).toContain(ctx.fixtures.workerA1.membershipId);
    expect(ids).toContain(ctx.fixtures.workerB1.membershipId);
  });

  it('does not leak across tenants', async () => {
    const token = await mintToken(ctx, {
      role: 'OWNER',
      userId: ctx.fixtures.owner.userId,
      companyId: ctx.fixtures.tenant1,
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/admin/memberships',
      headers: { authorization: `Bearer ${token}` },
    });
    const ids = res.json().items.map((m: { id: string }) => m.id);
    expect(ids).not.toContain(ctx.fixtures.tenant2WorkerMembershipId);
  });

  it('respects limit and returns nextCursor', async () => {
    const token = await mintToken(ctx, {
      role: 'OWNER',
      userId: ctx.fixtures.owner.userId,
      companyId: ctx.fixtures.tenant1,
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/admin/memberships?limit=2',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.length).toBe(2);
    expect(body.nextCursor).toBeTruthy();
  });

  it('rejects malformed cursor with 400 CURSOR_INVALID', async () => {
    const token = await mintToken(ctx, {
      role: 'OWNER',
      userId: ctx.fixtures.owner.userId,
      companyId: ctx.fixtures.tenant1,
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/admin/memberships?cursor=not-a-cursor',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('CURSOR_INVALID');
  });
});
