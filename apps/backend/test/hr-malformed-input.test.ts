/**
 * Wave-3 hardening — Gap 4: Zod boundary fuzzing for HR write endpoints.
 *
 * Confirms every HR POST surface rejects with 400 BAD_INPUT (not 500,
 * not silent partial-mutation) on:
 *  - missing required field
 *  - wrong type (string for number)
 *  - out-of-range value
 *  - empty body
 *  - extra unexpected field (Zod default: strip, expect 200 not 400)
 *
 * Covers: /admin/memberships, /admin/workers, /admin/sites, /admin/sites/:id/bindings.
 *
 * @derives(Wave-3 hardening matrix Gap 4)
 */

// [ORCHESTRATOR_EXCEPTION] Wave-3 hardening — test-file scaffolding per parent brief
import { randomUUID } from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { buildTestApp, mintToken, seedTenantWithTwoPods, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let hrAToken: string;
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

describe('Wave-3 Gap 4: malformed input / Zod boundary on HR write endpoints', () => {
  // ── /admin/memberships ────────────────────────────────────────────────
  it('POST /admin/memberships missing required `role` → 400 BAD_INPUT', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/admin/memberships',
      headers: { authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json' },
      payload: { phone: freshPhone(), name: 'No Role', baseSalaryPaise: 5_000_000 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('BAD_INPUT');
  });

  it('POST /admin/memberships wrong type (baseSalaryPaise as string) → 400 BAD_INPUT', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/admin/memberships',
      headers: { authorization: `Bearer ${ownerToken}`, 'content-type': 'application/json' },
      payload: {
        phone: freshPhone(),
        name: 'String Salary',
        role: 'HR',
        baseSalaryPaise: '5000000',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('BAD_INPUT');
  });

  // ── /admin/workers ────────────────────────────────────────────────────
  it('POST /admin/workers missing required `name` → 400 BAD_INPUT', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/admin/workers',
      headers: { authorization: `Bearer ${hrAToken}`, 'content-type': 'application/json' },
      payload: { phone: freshPhone(), baseSalaryPaise: 2_000_000 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('BAD_INPUT');
  });

  it('POST /admin/workers out-of-range (negative baseSalaryPaise) → 400 BAD_INPUT', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/admin/workers',
      headers: { authorization: `Bearer ${hrAToken}`, 'content-type': 'application/json' },
      payload: { phone: freshPhone(), name: 'Negative', baseSalaryPaise: -1 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('BAD_INPUT');
  });

  it('POST /admin/workers empty body → 400 BAD_INPUT', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/admin/workers',
      headers: { authorization: `Bearer ${hrAToken}`, 'content-type': 'application/json' },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('BAD_INPUT');
  });

  // ── /admin/sites ──────────────────────────────────────────────────────
  it('POST /admin/sites missing required `name` → 400 BAD_INPUT', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/admin/sites',
      headers: { authorization: `Bearer ${hrAToken}`, 'content-type': 'application/json' },
      payload: { address: 'No name here' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('BAD_INPUT');
  });

  it('POST /admin/sites out-of-range (latitude > 90) → 400 BAD_INPUT', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/admin/sites',
      headers: { authorization: `Bearer ${hrAToken}`, 'content-type': 'application/json' },
      payload: { name: 'Out of bounds', latitude: 91, longitude: 50 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('BAD_INPUT');
  });

  it('POST /admin/sites with extra unexpected field → 200 (Zod strips by default)', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: '/admin/sites',
      headers: { authorization: `Bearer ${hrAToken}`, 'content-type': 'application/json' },
      payload: {
        name: `Extra Field Site ${randomUUID().slice(0, 6)}`,
        unexpectedField: 'should-be-stripped',
        anotherJunk: 42,
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().siteId).toBeTruthy();
  });

  // ── /admin/sites/:id/bindings ────────────────────────────────────────
  it('POST /admin/sites/:id/bindings missing required `effectiveFrom` → 400 BAD_INPUT', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/admin/sites/${ctx.fixtures.siteA.id}/bindings`,
      headers: { authorization: `Bearer ${hrAToken}`, 'content-type': 'application/json' },
      payload: { supervisorUserId: ctx.fixtures.supervisorA.userId, reason: 'no effectiveFrom' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('BAD_INPUT');
  });

  it('POST /admin/sites/:id/bindings wrong type (effectiveFrom not ISO) → 400 BAD_INPUT', async () => {
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/admin/sites/${ctx.fixtures.siteA.id}/bindings`,
      headers: { authorization: `Bearer ${hrAToken}`, 'content-type': 'application/json' },
      payload: {
        supervisorUserId: ctx.fixtures.supervisorA.userId,
        effectiveFrom: 'not-an-iso-string',
        reason: 'bad date type',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('BAD_INPUT');
  });
});
