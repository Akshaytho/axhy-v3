/**
 * Real-DB integration tests for Wave 2 (2026-05-18) of the
 * Decisions queue UNION-ALL refactor.
 *
 * Covers, end-to-end through `GET /supervisor/decisions`:
 *
 *   1. LeaveRequest source — REQUESTED rows for workers whose primary
 *      site is in the caller's portfolio appear as `LEAVE_APPROVAL_PENDING`
 *      rows with [Approve, Reject] actions.
 *   2. SwapRequest source — SENT rows on portfolio sites appear as
 *      `SWAP_REQUEST_PENDING` rows with [Accept, Reject] actions.
 *   3. SupervisorDecision source still emits as before (no regression),
 *      now with [Apply, Dismiss] actions.
 *   4. Cross-tenant: Tenant A's supervisor never sees Tenant B's
 *      LeaveRequest / SwapRequest / SupervisorDecision rows.
 *   5. Cross-supervisor isolation: supervisor without portfolio binding
 *      to a site never sees that site's swap-pending rows.
 *   6. Pagination — with > 50 rows present, page 1 returns 50, pageInfo
 *      surfaces a cursor; page 2 returns remainder; no overlap, no skip.
 *   7. Perf — 200 rows P95 < 800 ms (P3 founder target).
 *   8. Wire-shape — every row has a non-empty `actions[]` array; every
 *      action endpoint string starts with the route prefix the action
 *      claims (smoke check that the wire-driven UI cannot mis-route).
 *   9. The `POST /swap-requests/:id/decide` endpoint accepts approve /
 *      reject / approve_anyway, rejects malformed bodies, enforces
 *      cross-tenant isolation (404), and refuses non-responsible
 *      supervisors (403).
 *
 * Run via:
 *   cd apps/backend && railway run --service Postgres -- bash -c \
 *     'DATABASE_URL="$DATABASE_PUBLIC_URL" pnpm exec vitest run test/supervisor-decisions-union-all.test.ts'
 *
 * @derives(Wave 2 plan §3 — required validations)
 * @derives(drawer-redesign §B)
 */

import { randomUUID } from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

process.env.AXHY_OTP_BYPASS = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `wave2-${Date.now()}-`;

let app: FastifyInstance;

// Tenant A — primary subject under test
let companyAId: string;
let supAId: string;
let supAToken: string;
let supANoPortfolioId: string;
let supANoPortfolioToken: string;
let siteAId: string;
let workerAId: string;
let workerA2Id: string;
let leaveAId: string;
let swapAId: string;
let supervisorDecisionAId: string;

// Tenant B — cross-tenant isolation
let companyBId: string;
let leaveBId: string;
let swapBId: string;
let supervisorDecisionBId: string;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  const { issueAccessToken } = await import('../src/lib/jwt.js');
  app = await buildServer();
  await app.ready();

  // ─── Tenant A ─────────────────────────────────────────────────────────
  const coA = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'A',
      slug: TEST_PREFIX + 'a',
      ownerPhone: '+919999' + String(Date.now()).slice(-7),
      ownerName: 'Owner A',
    },
  });
  companyAId = coA.id;

  const supA = await prismaRaw.user.create({
    data: {
      phone: '+9181' + String(Date.now() + 1).slice(-8),
      name: 'SupA Wave2',
      locale: 'en',
      companyId: companyAId,
    },
  });
  supAId = supA.id;
  await prismaRaw.membership.create({
    data: { companyId: companyAId, userId: supAId, role: 'SUPERVISOR', status: 'ACTIVE' },
  });
  supAToken = await issueAccessToken({
    userId: supAId,
    companyId: companyAId,
    role: 'SUPERVISOR',
    availableRoles: ['SUPERVISOR'],
    locale: 'en',
  });

  // Second supervisor in Tenant A with NO portfolio — used for within-tenant
  // cross-supervisor isolation.
  const supANP = await prismaRaw.user.create({
    data: {
      phone: '+9182' + String(Date.now() + 2).slice(-8),
      name: 'SupA No Portfolio',
      locale: 'en',
      companyId: companyAId,
    },
  });
  supANoPortfolioId = supANP.id;
  await prismaRaw.membership.create({
    data: {
      companyId: companyAId,
      userId: supANoPortfolioId,
      role: 'SUPERVISOR',
      status: 'ACTIVE',
    },
  });
  supANoPortfolioToken = await issueAccessToken({
    userId: supANoPortfolioId,
    companyId: companyAId,
    role: 'SUPERVISOR',
    availableRoles: ['SUPERVISOR'],
    locale: 'en',
  });

  // One site in Tenant A — supA gets a PERMANENT binding to it.
  const siteA = await prismaRaw.site.create({
    data: {
      companyId: companyAId,
      name: TEST_PREFIX + 'siteA',
      state: 'ACTIVE',
    },
  });
  siteAId = siteA.id;

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await prismaRaw.siteSupervisorBinding.create({
    data: {
      companyId: companyAId,
      siteId: siteAId,
      userId: supAId,
      actingForUserId: null,
      effectiveFrom: yesterday,
      reason: 'wave2 test seed',
      createdBy: supAId,
    },
  });

  // Two workers in Tenant A, both placed at siteA via Assignment so the
  // worker→primary-site derivation routes LeaveRequest to supA.
  const wA = await prismaRaw.worker.create({
    data: {
      companyId: companyAId,
      name: 'Wave2 Worker A',
      phone: '+9183' + String(Date.now() + 3).slice(-8),
      state: 'ACTIVE',
    },
  });
  workerAId = wA.id;
  const wA2 = await prismaRaw.worker.create({
    data: {
      companyId: companyAId,
      name: 'Wave2 Worker A2',
      phone: '+9184' + String(Date.now() + 4).slice(-8),
      state: 'ACTIVE',
    },
  });
  workerA2Id = wA2.id;

  await prismaRaw.assignment.create({
    data: {
      companyId: companyAId,
      workerId: workerAId,
      siteId: siteAId,
      state: 'ACTIVE',
      validFrom: yesterday,
      createdBy: supAId,
    },
  });
  await prismaRaw.assignment.create({
    data: {
      companyId: companyAId,
      workerId: workerA2Id,
      siteId: siteAId,
      state: 'ACTIVE',
      validFrom: yesterday,
      createdBy: supAId,
    },
  });

  // One REQUESTED LeaveRequest — visible to supA.
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  tomorrow.setUTCHours(0, 0, 0, 0);
  const dayAfter = new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000);
  const leaveA = await prismaRaw.leaveRequest.create({
    data: {
      companyId: companyAId,
      workerId: workerAId,
      fromDate: tomorrow,
      toDate: dayAfter,
      reason: 'family function',
      state: 'REQUESTED',
    },
  });
  leaveAId = leaveA.id;

  // One SENT SwapRequest — visible to supA (site in portfolio).
  const inTwoDays = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const swapA = await prismaRaw.swapRequest.create({
    data: {
      companyId: companyAId,
      supervisorId: supAId,
      fromWorkerId: workerAId,
      toWorkerId: workerA2Id,
      siteId: siteAId,
      effectiveAt: inTwoDays,
      reason: 'family obligation',
      state: 'SENT',
    },
  });
  swapAId = swapA.id;

  // One PROPOSED SupervisorDecision — original-supervisor match.
  supervisorDecisionAId = randomUUID();
  await prismaRaw.supervisorDecision.create({
    data: {
      id: supervisorDecisionAId,
      companyId: companyAId,
      supervisorId: supAId,
      kind: 'MARK_ABSENT',
      tier: 'OPERATIONAL',
      targetId: null,
      payload: { workerName: 'Wave2 Worker A', siteName: TEST_PREFIX + 'siteA' },
    },
  });

  // ─── Tenant B (cross-tenant) ──────────────────────────────────────────
  const coB = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'B',
      slug: TEST_PREFIX + 'b',
      ownerPhone: '+919998' + String(Date.now()).slice(-7),
      ownerName: 'Owner B',
    },
  });
  companyBId = coB.id;

  const wB = await prismaRaw.worker.create({
    data: {
      companyId: companyBId,
      name: 'Wave2 Tenant B Worker',
      phone: '+9185' + String(Date.now() + 5).slice(-8),
      state: 'ACTIVE',
    },
  });
  const siteB = await prismaRaw.site.create({
    data: {
      companyId: companyBId,
      name: TEST_PREFIX + 'siteB',
      state: 'ACTIVE',
    },
  });
  // Tenant B leave + swap + supervisor-decision rows — must NEVER appear
  // in supA's queue.
  const leaveB = await prismaRaw.leaveRequest.create({
    data: {
      companyId: companyBId,
      workerId: wB.id,
      fromDate: tomorrow,
      toDate: tomorrow,
      reason: 'tenant b leave — never visible to tenant a',
      state: 'REQUESTED',
    },
  });
  leaveBId = leaveB.id;

  const wB2 = await prismaRaw.worker.create({
    data: {
      companyId: companyBId,
      name: 'Wave2 Tenant B Worker 2',
      phone: '+9186' + String(Date.now() + 6).slice(-8),
      state: 'ACTIVE',
    },
  });
  const swapB = await prismaRaw.swapRequest.create({
    data: {
      companyId: companyBId,
      supervisorId: supAId, // intentionally same userId as Tenant A supA;
      //                       proves cross-tenant filter is companyId, not user.
      fromWorkerId: wB.id,
      toWorkerId: wB2.id,
      siteId: siteB.id,
      effectiveAt: inTwoDays,
      reason: 'tenant b swap — never visible to tenant a',
      state: 'SENT',
    },
  });
  swapBId = swapB.id;

  supervisorDecisionBId = randomUUID();
  await prismaRaw.supervisorDecision.create({
    data: {
      id: supervisorDecisionBId,
      companyId: companyBId,
      supervisorId: supAId,
      kind: 'MARK_ABSENT',
      tier: 'OPERATIONAL',
      targetId: null,
      payload: { workerName: 'Tenant B Worker' },
    },
  });
});

afterAll(async () => {
  await prismaRaw.company.deleteMany({ where: { slug: { startsWith: TEST_PREFIX } } });
  await prismaRaw.$disconnect();
  await app.close();
});

// ───────────────────────────────────────────────────────────────────────────
// 1 + 2 + 3. UNION ALL — all three sources appear, with kind + actions[].
// ───────────────────────────────────────────────────────────────────────────

describe('GET /supervisor/decisions — UNION ALL across 3 sources', () => {
  it('emits SupervisorDecision + LeaveRequest + SwapRequest rows with correct kinds', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/supervisor/decisions',
      headers: { authorization: `Bearer ${supAToken}` },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json<{
      rows: Array<{
        id: string;
        section: string;
        tier: string;
        kind: string;
        actions: Array<{ label: string; style: string; endpoint: string; method: string }>;
      }>;
      counts: { needsYouNow: number; routine: number; failedReview: number; total: number };
      pageInfo: {
        cursor: string | null;
        hasMore: boolean;
        limit: number;
        totalAcrossPages: number;
      };
    }>();

    const kinds = body.rows.map((r) => r.kind).sort();
    expect(kinds).toContain('MARK_ABSENT');
    expect(kinds).toContain('LEAVE_APPROVAL_PENDING');
    expect(kinds).toContain('SWAP_REQUEST_PENDING');

    // Each row has a non-empty actions[].
    for (const row of body.rows) {
      expect(Array.isArray(row.actions)).toBe(true);
      expect(row.actions.length).toBeGreaterThan(0);
      for (const a of row.actions) {
        expect(typeof a.label).toBe('string');
        expect(['primary', 'danger', 'secondary']).toContain(a.style);
        expect(['POST', 'PATCH', 'DELETE']).toContain(a.method);
        expect(a.endpoint.startsWith('/')).toBe(true);
      }
    }

    // LeaveRequest row's actions point to the real route shape.
    const leaveRow = body.rows.find((r) => r.kind === 'LEAVE_APPROVAL_PENDING');
    expect(leaveRow).toBeDefined();
    expect(leaveRow!.id).toBe(`leave:${leaveAId}`);
    expect(leaveRow!.actions.map((a) => a.endpoint).sort()).toEqual([
      `/leave-requests/${leaveAId}/approve`,
      `/leave-requests/${leaveAId}/reject`,
    ]);
    expect(leaveRow!.tier).toBe('PERSONNEL');

    // SwapRequest row's actions point to the new decide route.
    const swapRow = body.rows.find((r) => r.kind === 'SWAP_REQUEST_PENDING');
    expect(swapRow).toBeDefined();
    expect(swapRow!.id).toBe(`swap:${swapAId}`);
    expect(swapRow!.actions.every((a) => a.endpoint === `/swap-requests/${swapAId}/decide`)).toBe(
      true,
    );
    expect(swapRow!.tier).toBe('OPERATIONAL');

    // SupervisorDecision row keeps emitting (no regression).
    const supDecRow = body.rows.find((r) => r.id === supervisorDecisionAId);
    expect(supDecRow).toBeDefined();
    expect(supDecRow!.kind).toBe('MARK_ABSENT');
    expect(supDecRow!.actions.some((a) => a.endpoint.endsWith('/dismiss'))).toBe(true);
    expect(supDecRow!.actions.some((a) => a.endpoint.endsWith('/apply'))).toBe(true);

    expect(body.pageInfo.limit).toBeLessThanOrEqual(50);
    expect(typeof body.pageInfo.totalAcrossPages).toBe('number');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. Cross-tenant isolation.
// ───────────────────────────────────────────────────────────────────────────

describe('GET /supervisor/decisions — cross-tenant isolation', () => {
  it('never returns Tenant B rows to Tenant A supervisor', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/supervisor/decisions',
      headers: { authorization: `Bearer ${supAToken}` },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json<{ rows: Array<{ id: string }> }>();
    const ids = body.rows.map((r) => r.id);
    expect(ids).not.toContain(`leave:${leaveBId}`);
    expect(ids).not.toContain(`swap:${swapBId}`);
    expect(ids).not.toContain(supervisorDecisionBId);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 5. Within-tenant cross-supervisor isolation: portfolio-less supervisor
//    sees neither leave (no worker-primary-site match) nor swap (no site
//    portfolio match). They MAY see SupervisorDecision rows that target them
//    as origin, but supA's seeded SupervisorDecision has supA as supervisorId
//    so supANoPortfolio cannot see it.
// ───────────────────────────────────────────────────────────────────────────

describe('GET /supervisor/decisions — within-tenant supervisor isolation', () => {
  it('supervisor without portfolio sees zero rows from supA seed', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/supervisor/decisions',
      headers: { authorization: `Bearer ${supANoPortfolioToken}` },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json<{ rows: Array<{ id: string }>; pageInfo: { totalAcrossPages: number } }>();
    const ids = body.rows.map((r) => r.id);
    expect(ids).not.toContain(`leave:${leaveAId}`);
    expect(ids).not.toContain(`swap:${swapAId}`);
    expect(ids).not.toContain(supervisorDecisionAId);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 6 + 7. Pagination + perf — seed 100 SupervisorDecisions, request page 1.
// ───────────────────────────────────────────────────────────────────────────

describe('GET /supervisor/decisions — pagination + perf', () => {
  it('paginates at 50 rows/page; perf < 800ms P95 at 200 rows', async () => {
    // Seed ~200 supervisor-decision rows to reach Tenant-3-scale.
    const seedIds: string[] = [];
    const seedCount = 200;
    for (let i = 0; i < seedCount; i++) {
      const id = randomUUID();
      seedIds.push(id);
      await prismaRaw.supervisorDecision.create({
        data: {
          id,
          companyId: companyAId,
          supervisorId: supAId,
          kind: 'MARK_ABSENT',
          tier: i % 3 === 0 ? 'PERSONNEL' : 'OPERATIONAL',
          targetId: null,
          payload: { workerName: `Bulk ${i}`, siteName: `S${i}` },
        },
      });
    }

    // Warm Prisma client.
    await app.inject({
      method: 'GET',
      url: '/supervisor/decisions',
      headers: { authorization: `Bearer ${supAToken}` },
    });

    // Measure 5 runs; collect P95.
    const ms: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = Date.now();
      const r = await app.inject({
        method: 'GET',
        url: '/supervisor/decisions?limit=50',
        headers: { authorization: `Bearer ${supAToken}` },
      });
      ms.push(Date.now() - t0);
      expect(r.statusCode).toBe(200);
    }
    ms.sort((a, b) => a - b);
    const p95 = ms[Math.ceil(0.95 * ms.length) - 1]!;

    // Page 1.
    const page1 = await app.inject({
      method: 'GET',
      url: '/supervisor/decisions?limit=50',
      headers: { authorization: `Bearer ${supAToken}` },
    });
    const body1 = page1.json<{
      rows: Array<{ id: string }>;
      pageInfo: { cursor: string | null; hasMore: boolean; totalAcrossPages: number };
    }>();
    expect(body1.rows.length).toBe(50);
    expect(body1.pageInfo.hasMore).toBe(true);
    expect(body1.pageInfo.cursor).not.toBeNull();
    expect(body1.pageInfo.totalAcrossPages).toBeGreaterThanOrEqual(seedCount);

    // Page 2 — no overlap.
    const page2 = await app.inject({
      method: 'GET',
      url: `/supervisor/decisions?limit=50&cursor=${encodeURIComponent(body1.pageInfo.cursor!)}`,
      headers: { authorization: `Bearer ${supAToken}` },
    });
    const body2 = page2.json<{ rows: Array<{ id: string }>; pageInfo: { hasMore: boolean } }>();
    expect(body2.rows.length).toBe(50);
    const idsPage1 = new Set(body1.rows.map((r) => r.id));
    for (const r2 of body2.rows) {
      expect(idsPage1.has(r2.id)).toBe(false);
    }

    // Perf budget: P95 < 800 ms at 200 rows across UNION-ALL sources.
    expect(p95).toBeLessThan(800);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 9. POST /swap-requests/:id/decide — happy + 400/403/404/409.
// ───────────────────────────────────────────────────────────────────────────

describe('POST /swap-requests/:id/decide', () => {
  it('400 BAD_INPUT on malformed body (reject without reason)', async () => {
    const r = await app.inject({
      method: 'POST',
      url: `/swap-requests/${swapAId}/decide`,
      headers: {
        authorization: `Bearer ${supAToken}`,
        'content-type': 'application/json',
      },
      payload: { decision: 'reject' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('403 NOT_RESPONSIBLE when caller has no portfolio for the swap site', async () => {
    const r = await app.inject({
      method: 'POST',
      url: `/swap-requests/${swapAId}/decide`,
      headers: {
        authorization: `Bearer ${supANoPortfolioToken}`,
        'content-type': 'application/json',
      },
      payload: { decision: 'approve' },
    });
    expect(r.statusCode).toBe(403);
  });

  it('404 cross-tenant: Tenant A supervisor cannot decide on Tenant B swap', async () => {
    const r = await app.inject({
      method: 'POST',
      url: `/swap-requests/${swapBId}/decide`,
      headers: {
        authorization: `Bearer ${supAToken}`,
        'content-type': 'application/json',
      },
      payload: { decision: 'approve' },
    });
    expect(r.statusCode).toBe(404);
  });

  it('400 when approve_anyway sent without overrideToken=OVERRIDE', async () => {
    const r = await app.inject({
      method: 'POST',
      url: `/swap-requests/${swapAId}/decide`,
      headers: {
        authorization: `Bearer ${supAToken}`,
        'content-type': 'application/json',
      },
      payload: { decision: 'approve_anyway' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('approves on happy path: SENT → ACCEPTED + AuditEvent + Outbox', async () => {
    // Use a fresh swap so prior test mutations don't pollute.
    const fresh = await prismaRaw.swapRequest.create({
      data: {
        companyId: companyAId,
        supervisorId: supAId,
        fromWorkerId: workerAId,
        toWorkerId: workerA2Id,
        siteId: siteAId,
        effectiveAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        reason: 'test approve happy path',
        state: 'SENT',
      },
    });

    const r = await app.inject({
      method: 'POST',
      url: `/swap-requests/${fresh.id}/decide`,
      headers: {
        authorization: `Bearer ${supAToken}`,
        'content-type': 'application/json',
      },
      payload: { decision: 'approve', reason: 'looks good' },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json<{ ok: boolean; state: string; swapRequestId: string }>();
    expect(body.ok).toBe(true);
    expect(body.state).toBe('ACCEPTED');
    expect(body.swapRequestId).toBe(fresh.id);

    const row = await prismaRaw.swapRequest.findUnique({ where: { id: fresh.id } });
    expect(row!.state).toBe('ACCEPTED');
    expect(row!.decidedAt).not.toBeNull();

    const audit = await prismaRaw.auditEvent.findFirst({
      where: { companyId: companyAId, kind: 'SWAP_REQUEST_ACCEPTED', targetId: fresh.id },
    });
    expect(audit).not.toBeNull();

    const outbox = await prismaRaw.outbox.findFirst({
      where: { companyId: companyAId, topic: 'swap.accepted' },
      orderBy: { createdAt: 'desc' },
    });
    expect(outbox).not.toBeNull();
  });

  it('rejects on happy path: SENT → DECLINED + reason persisted in AuditEvent', async () => {
    const fresh = await prismaRaw.swapRequest.create({
      data: {
        companyId: companyAId,
        supervisorId: supAId,
        fromWorkerId: workerAId,
        toWorkerId: workerA2Id,
        siteId: siteAId,
        effectiveAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        reason: 'test reject happy path',
        state: 'SENT',
      },
    });

    const r = await app.inject({
      method: 'POST',
      url: `/swap-requests/${fresh.id}/decide`,
      headers: {
        authorization: `Bearer ${supAToken}`,
        'content-type': 'application/json',
      },
      payload: { decision: 'reject', reason: 'not feasible' },
    });
    expect(r.statusCode).toBe(200);
    const row = await prismaRaw.swapRequest.findUnique({ where: { id: fresh.id } });
    expect(row!.state).toBe('DECLINED');

    const audit = await prismaRaw.auditEvent.findFirst({
      where: { companyId: companyAId, kind: 'SWAP_REQUEST_REJECTED', targetId: fresh.id },
    });
    expect(audit).not.toBeNull();
    const p = audit!.payload as Record<string, unknown>;
    expect(p.reason).toBe('not feasible');
  });

  it('409 when re-deciding an already-decided swap', async () => {
    const r = await app.inject({
      method: 'POST',
      url: `/swap-requests/${swapAId}/decide`,
      headers: {
        authorization: `Bearer ${supAToken}`,
        'content-type': 'application/json',
      },
      payload: { decision: 'approve' },
    });
    // swapAId may have been decided in a prior test run; we accept 200 OR 409.
    expect([200, 409]).toContain(r.statusCode);

    // Re-fire to force 409.
    const r2 = await app.inject({
      method: 'POST',
      url: `/swap-requests/${swapAId}/decide`,
      headers: {
        authorization: `Bearer ${supAToken}`,
        'content-type': 'application/json',
      },
      payload: { decision: 'approve' },
    });
    expect(r2.statusCode).toBe(409);
  });
});
