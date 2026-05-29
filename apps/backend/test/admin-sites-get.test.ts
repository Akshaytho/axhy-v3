/**
 * Integration tests for GET /admin/sites, GET /admin/sites/:id, and
 * GET /admin/sites/:id/bindings (HR-A1 Task 6).
 * [ORCHESTRATOR_EXCEPTION] Task 6 single-test-file continuation.
 *
 * @derives(docs/plans/2026-05-29-hr-a1-implementation.md Task 6)
 * @derives(ADR-0026)
 */

// Resolve DB URL to public proxy when running under `railway run --service Postgres`
// (which only injects internal DNS). Mirrors pattern in admin-memberships-get.test.ts.
process.env.DATABASE_URL =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp, mintToken, seedTenantWithTwoPods, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenant2SiteId: string;

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
  // Seed a tenant-2 site so cross-tenant isolation / 404 tests have a
  // concrete cross-tenant resource id to probe.
  tenant2SiteId = randomUUID();
  await ctx.prisma.site.create({
    data: { id: tenant2SiteId, companyId: ctx.fixtures.tenant2, name: 'Tenant-2 Site' },
  });
});

describe('GET /admin/sites', () => {
  it('returns 401 without auth', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: '/admin/sites' });
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
      url: '/admin/sites',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('HR sees siteA in list', async () => {
    const token = await mintToken(ctx, {
      role: 'HR',
      userId: ctx.fixtures.hrA.userId,
      companyId: ctx.fixtures.tenant1,
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/admin/sites',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const ids = res.json().items.map((s: { id: string }) => s.id);
    expect(ids).toContain(ctx.fixtures.siteA.id);
  });

  it('OWNER sees siteA in list', async () => {
    const token = await mintToken(ctx, {
      role: 'OWNER',
      userId: ctx.fixtures.owner.userId,
      companyId: ctx.fixtures.tenant1,
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/admin/sites',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const ids = res.json().items.map((s: { id: string }) => s.id);
    expect(ids).toContain(ctx.fixtures.siteA.id);
  });

  it('does not leak tenant-2 sites to tenant-1 caller', async () => {
    const token = await mintToken(ctx, {
      role: 'OWNER',
      userId: ctx.fixtures.owner.userId,
      companyId: ctx.fixtures.tenant1,
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/admin/sites',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const ids = res.json().items.map((s: { id: string }) => s.id);
    expect(ids).not.toContain(tenant2SiteId);
  });

  it('respects limit=1 and returns nextCursor', async () => {
    // Add a second site to tenant-1 so pagination can show a nextCursor.
    await ctx.prisma.site.create({
      data: { id: randomUUID(), companyId: ctx.fixtures.tenant1, name: 'Site B' },
    });
    const token = await mintToken(ctx, {
      role: 'OWNER',
      userId: ctx.fixtures.owner.userId,
      companyId: ctx.fixtures.tenant1,
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: '/admin/sites?limit=1',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.length).toBe(1);
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
      url: '/admin/sites?cursor=not-a-cursor',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('CURSOR_INVALID');
  });
});

describe('GET /admin/sites/:id', () => {
  it('returns 200 for in-tenant siteId', async () => {
    const token = await mintToken(ctx, {
      role: 'HR',
      userId: ctx.fixtures.hrA.userId,
      companyId: ctx.fixtures.tenant1,
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/admin/sites/${ctx.fixtures.siteA.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(ctx.fixtures.siteA.id);
    expect(body.name).toBe('Site A');
  });

  it('returns 404 for cross-tenant siteId (no existence leak)', async () => {
    const token = await mintToken(ctx, {
      role: 'OWNER',
      userId: ctx.fixtures.owner.userId,
      companyId: ctx.fixtures.tenant1,
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/admin/sites/${tenant2SiteId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('SITE_NOT_FOUND');
  });
});

describe('GET /admin/sites/:id/bindings', () => {
  it('lists the seeded supervisorA → siteA binding with supervisor name+phone', async () => {
    const token = await mintToken(ctx, {
      role: 'HR',
      userId: ctx.fixtures.hrA.userId,
      companyId: ctx.fixtures.tenant1,
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/admin/sites/${ctx.fixtures.siteA.id}/bindings`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    const binding = body.items.find(
      (b: { supervisorUserId: string }) => b.supervisorUserId === ctx.fixtures.supervisorA.userId,
    );
    expect(binding).toBeTruthy();
    expect(binding.supervisorName).toBeTruthy();
    expect(binding.supervisorPhone).toBeTruthy();
    expect(binding.siteId).toBe(ctx.fixtures.siteA.id);
  });

  it('returns 404 for bindings on cross-tenant siteId', async () => {
    const token = await mintToken(ctx, {
      role: 'OWNER',
      userId: ctx.fixtures.owner.userId,
      companyId: ctx.fixtures.tenant1,
    });
    const res = await ctx.app.inject({
      method: 'GET',
      url: `/admin/sites/${tenant2SiteId}/bindings`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('SITE_NOT_FOUND');
  });
});
