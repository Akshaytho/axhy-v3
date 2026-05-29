/**
 * HR-portal test helpers (Task 4 of docs/plans/2026-05-29-hr-a1-implementation.md).
 * [ORCHESTRATOR_EXCEPTION] focused single-task continuation — Task 4 helper file write
 *
 * Provides:
 *  - `buildTestApp()` — starts the real Fastify server via `buildServer()`
 *    (same plugins + middleware as production), opens a Prisma client, and
 *    returns a reset() that wipes the HR-portal tables in FK-safe order.
 *  - `seedTenantWithTwoPods(ctx)` — seeds 2 tenants with OWNER + 2 HR pods
 *    (each owned by its HR), a SUPERVISOR in pod A, workers in both pods,
 *    a cross-tenant worker, and a Site for site tests.
 *  - `mintToken(ctx, payload)` — issues an access token shaped like
 *    `issueAccessToken` output so claims line up with `requireAuth`.
 *
 * Notes on adaptation from the plan:
 *  - Plan's route-register signatures included a `prisma` arg; actual
 *    `register*Routes(app)` take only the FastifyInstance. We sidestep
 *    that by using `buildServer()` directly — it wires every route,
 *    plugin, and middleware the routes need (tenant-context, auth, etc.).
 *  - Plan imported `requireAuthPlugin` from a non-existent path. Real
 *    auth is the `requireAuth` preHandler in `middleware/tenant-context.ts`,
 *    already attached per-route by `buildServer()`. Nothing to import here.
 *  - User uses `phone` (not `phoneE164`); Company requires `slug`,
 *    `ownerPhone`, `ownerName`; Site only needs name+companyId
 *    (state defaults to 'DRAFT').
 *
 * @derives(ADR-0026)
 */

import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { SignJWT } from 'jose';

// Ensure JWT_SECRET is set before any module that reads it at import time.
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);
process.env.AXHY_OTP_BYPASS = process.env.AXHY_OTP_BYPASS ?? '1';

const SECRET = process.env.JWT_SECRET;
const secretKey = new TextEncoder().encode(SECRET);

/**
 * Seeded fixtures returned by seedTenantWithTwoPods. Shape mirrors the
 * plan's Task 4 type so upcoming HR portal tests can rely on it.
 *
 * @derives(ADR-0026)
 */
export type Fixtures = {
  tenant1: string;
  tenant2: string;
  owner: { userId: string; membershipId: string };
  hrA: { userId: string; membershipId: string; podId: string };
  hrB: { userId: string; membershipId: string; podId: string };
  supervisorA: { userId: string; membershipId: string };
  workerA1: { userId: string; membershipId: string };
  workerB1: { userId: string; membershipId: string };
  tenant2WorkerMembershipId: string;
  siteA: { id: string };
};

/**
 * Test-side handle: Fastify app, Prisma client, reset routine, and the
 * seeded fixtures. Returned by buildTestApp.
 *
 * @derives(ADR-0026)
 */
export type TestCtx = {
  app: FastifyInstance;
  prisma: PrismaClient;
  reset: () => Promise<void>;
  fixtures: Fixtures;
};

/**
 * Boot the real Fastify server (with all routes + middleware) and a
 * fresh Prisma client. Caller is responsible for calling `app.close()`
 * and `prisma.$disconnect()` in afterAll.
 */
/**
 * Boot the real Fastify server (with all routes + middleware) and a
 * fresh Prisma client. Caller is responsible for calling app.close()
 * and prisma.$disconnect() in afterAll.
 *
 * @derives(ADR-0026)
 */
export async function buildTestApp(): Promise<TestCtx> {
  const prisma = new PrismaClient();
  const { buildServer } = await import('../src/server.js');
  const app = await buildServer();
  await app.ready();

  // Empty fixtures shell; populated by seedTenantWithTwoPods.
  const fixtures = {} as Fixtures;

  return {
    app,
    prisma,
    fixtures,
    reset: async () => {
      // FK-safe order: leaves first, then bindings, sites, memberships,
      // pods, users, companies.
      await prisma.leaveRequest.deleteMany({});
      await prisma.siteSupervisorBinding.deleteMany({});
      await prisma.site.deleteMany({});
      await prisma.membership.deleteMany({});
      await prisma.hRPod.deleteMany({});
      await prisma.user.deleteMany({});
      await prisma.company.deleteMany({});
    },
  };
}

/**
 * Seed 2 tenants. Tenant 1 has OWNER + 2 HR pods (each with its own HR
 * primary owner), a SUPERVISOR in pod A, a WORKER in each pod, plus a
 * Site. Tenant 2 has a WORKER used for isolation checks.
 *
 * Populates `ctx.fixtures` in place.
 */
/**
 * Seed 2 tenants. Tenant 1 has OWNER + 2 HR pods, SUPERVISOR in pod A,
 * a WORKER in each pod, plus a Site. Tenant 2 has a WORKER used for
 * cross-tenant isolation checks.
 *
 * @derives(ADR-0026)
 */
export async function seedTenantWithTwoPods(ctx: TestCtx): Promise<void> {
  const { prisma, fixtures } = ctx;

  // Unique-per-run phones / slugs so concurrent test runs don't collide.
  const stamp = Date.now();
  let phoneCounter = 0;
  const uniquePhone = (): string => {
    phoneCounter += 1;
    // E.164 +9199 + 8 digits derived from stamp + counter.
    const digits = String(stamp * 100 + phoneCounter)
      .slice(-8)
      .padStart(8, '0');
    return `+9199${digits}`;
  };

  const tenant1 = randomUUID();
  const tenant2 = randomUUID();
  fixtures.tenant1 = tenant1;
  fixtures.tenant2 = tenant2;

  await prisma.company.createMany({
    data: [
      {
        id: tenant1,
        name: `Tenant 1 ${stamp}`,
        slug: `tenant-1-${stamp}-${randomUUID().slice(0, 8)}`,
        ownerPhone: uniquePhone(),
        ownerName: 'Owner T1',
      },
      {
        id: tenant2,
        name: `Tenant 2 ${stamp}`,
        slug: `tenant-2-${stamp}-${randomUUID().slice(0, 8)}`,
        ownerPhone: uniquePhone(),
        ownerName: 'Owner T2',
      },
    ],
  });

  async function mkUser(
    role: string,
    tenant: string,
    podId?: string,
  ): Promise<{ userId: string; membershipId: string }> {
    const userId = randomUUID();
    const membershipId = randomUUID();
    await prisma.user.create({
      data: {
        id: userId,
        phone: uniquePhone(),
        name: `${role}-${userId.slice(0, 8)}`,
        locale: 'en',
      },
    });
    await prisma.membership.create({
      data: {
        id: membershipId,
        companyId: tenant,
        userId,
        role,
        status: 'ACTIVE',
        podId: podId ?? null,
      },
    });
    return { userId, membershipId };
  }

  // OWNER on tenant 1.
  fixtures.owner = await mkUser('OWNER', tenant1);

  // Two HRs on tenant 1 — create memberships first so pods can reference
  // a real user.id as primaryOwnerUserId. Then attach podId via update.
  const podA = randomUUID();
  const podB = randomUUID();
  const hrA = await mkUser('HR', tenant1);
  const hrB = await mkUser('HR', tenant1);
  await prisma.hRPod.create({
    data: { id: podA, companyId: tenant1, name: 'Pod A', primaryOwnerUserId: hrA.userId },
  });
  await prisma.hRPod.create({
    data: { id: podB, companyId: tenant1, name: 'Pod B', primaryOwnerUserId: hrB.userId },
  });
  await prisma.membership.update({ where: { id: hrA.membershipId }, data: { podId: podA } });
  await prisma.membership.update({ where: { id: hrB.membershipId }, data: { podId: podB } });
  fixtures.hrA = { ...hrA, podId: podA };
  fixtures.hrB = { ...hrB, podId: podB };

  // SUPERVISOR in pod A.
  fixtures.supervisorA = await mkUser('SUPERVISOR', tenant1, podA);

  // WORKERs — one per pod.
  fixtures.workerA1 = await mkUser('WORKER', tenant1, podA);
  fixtures.workerB1 = await mkUser('WORKER', tenant1, podB);

  // Tenant 2 worker for isolation checks.
  const tenant2Worker = await mkUser('WORKER', tenant2);
  fixtures.tenant2WorkerMembershipId = tenant2Worker.membershipId;

  // Site on tenant 1.
  const siteId = randomUUID();
  await prisma.site.create({
    data: { id: siteId, companyId: tenant1, name: 'Site A' },
  });
  fixtures.siteA = { id: siteId };
}

/**
 * Mint a JWT shaped like `issueAccessToken` output. Kept as a raw
 * SignJWT call (rather than importing issueAccessToken) so tests can
 * craft tokens with arbitrary roles / claims, including invalid ones.
 *
 * For tests that need the canonical claim shape, prefer importing
 * `issueAccessToken` from `../src/lib/jwt.js` directly.
 */
/**
 * Mint a JWT shaped like issueAccessToken output so claims match the
 * shape requireAuth expects. Raw SignJWT call so tests can craft
 * arbitrary (including invalid) role / claim combinations.
 *
 * @derives(ADR-0026)
 */
// [ORCHESTRATOR_EXCEPTION] HR-A1 Task 3 mintToken bug fix - test-only helper, focused single-file edit, all auth tests block on this.
export async function mintToken(
  _ctx: TestCtx,
  payload: { userId: string; companyId: string; role: string },
): Promise<string> {
  // Shape MUST match JWTClaims schema enforced by verifyAccessToken:
  // sub (not userId), kind: 'access', iat, exp. Stays in legacy mode (no
  // epoch claim) so the DB-trust path in tenant-context is skipped.
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    sub: payload.userId,
    companyId: payload.companyId,
    role: payload.role,
    availableRoles: [payload.role],
    locale: 'en',
    iat: now,
    exp: now + 900,
    kind: 'access',
  })
    .setProtectedHeader({ alg: 'HS256' })
    .sign(secretKey);
}
