/**
 * Real-DB integration tests: GET /supervisor/decisions + POST /supervisor/decisions/:id/dismiss.
 *
 * Covers:
 *   1. Happy: 3 PROPOSED rows of different tiers — correct sections + counts;
 *      EMPLOYMENT row has requiresTypedConfirm=true.
 *   2. Empty: no proposed decisions → empty rows, counts all 0.
 *   3. Cross-supervisor isolation: SupA + SupB in same tenant, SupA's decisions
 *      not visible to SupB.
 *   4. Dismiss happy path: POST dismiss → 200 + DWI_DISMISSED AuditEvent +
 *      decision.dismissedAt set.
 *   5. Dismiss already-dismissed → 409.
 *   6. 401: no token.
 *
 * Seed pattern: prismaRaw creates SupervisorDecision rows directly in beforeAll.
 * All rows are scoped to TEST_PREFIX tenant(s) and cleaned up in afterAll.
 *
 * Run via:
 *   cd apps/backend && railway run --service Postgres -- bash -c \
 *     'DATABASE_URL="$DATABASE_PUBLIC_URL" pnpm exec vitest run test/supervisor-decisions.test.ts'
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
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

const TEST_PREFIX = `sup-dec-${Date.now()}-`;

let app: FastifyInstance;

// Tenant A — used for most tests
let companyAId: string;
let supAUserId: string;
let supAToken: string;

// Tenant A — second supervisor (isolation test)
let supBUserId: string;
let supBToken: string;

// Decision ids seeded in beforeAll for case 1 (happy 3-row test)
let decOperational: string;
let decPersonnel: string;
let decEmployment: string;

// Tenant B — only used to verify no cross-tenant bleed (not needed; isolation
// is within same tenant across two supervisors).

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  const { issueAccessToken } = await import('../src/lib/jwt.js');
  app = await buildServer();
  await app.ready();

  // --- Tenant A setup ---
  const coA = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'A',
      slug: TEST_PREFIX + 'a',
      ownerPhone: '+919999' + String(Date.now()).slice(-7),
      ownerName: 'Owner',
    },
  });
  companyAId = coA.id;

  // Supervisor A
  const supA = await prismaRaw.user.create({
    data: {
      phone: '+9188' + String(Date.now() + 1).slice(-8),
      name: 'SupA',
      locale: 'en',
      companyId: companyAId,
    },
  });
  supAUserId = supA.id;
  await prismaRaw.membership.create({
    data: { companyId: companyAId, userId: supAUserId, role: 'SUPERVISOR', status: 'ACTIVE' },
  });
  supAToken = await issueAccessToken({
    userId: supAUserId,
    companyId: companyAId,
    role: 'SUPERVISOR',
    availableRoles: ['SUPERVISOR'],
    locale: 'en',
  });

  // Supervisor B (same tenant; for cross-supervisor isolation test)
  const supB = await prismaRaw.user.create({
    data: {
      phone: '+9177' + String(Date.now() + 2).slice(-8),
      name: 'SupB',
      locale: 'en',
      companyId: companyAId,
    },
  });
  supBUserId = supB.id;
  await prismaRaw.membership.create({
    data: { companyId: companyAId, userId: supBUserId, role: 'SUPERVISOR', status: 'ACTIVE' },
  });
  supBToken = await issueAccessToken({
    userId: supBUserId,
    companyId: companyAId,
    role: 'SUPERVISOR',
    availableRoles: ['SUPERVISOR'],
    locale: 'en',
  });

  // Seed 3 PROPOSED decisions for SupA with different tiers.
  decOperational = randomUUID();
  await prismaRaw.supervisorDecision.create({
    data: {
      id: decOperational,
      companyId: companyAId,
      supervisorId: supAUserId,
      kind: 'MARK_ABSENT',
      tier: 'OPERATIONAL',
      targetId: null,
      payload: { workerName: 'Ravi', siteName: 'Apollo' },
    },
  });

  decPersonnel = randomUUID();
  await prismaRaw.supervisorDecision.create({
    data: {
      id: decPersonnel,
      companyId: companyAId,
      supervisorId: supAUserId,
      kind: 'APPROVE_LEAVE',
      tier: 'PERSONNEL',
      targetId: null,
      payload: { workerName: 'Priya' },
    },
  });

  decEmployment = randomUUID();
  await prismaRaw.supervisorDecision.create({
    data: {
      id: decEmployment,
      companyId: companyAId,
      supervisorId: supAUserId,
      kind: 'TERMINATE_WORKER',
      tier: 'EMPLOYMENT',
      targetId: null,
      payload: { workerName: 'Suresh', noShowCount: 3 },
    },
  });
});

afterAll(async () => {
  // Cascade-delete cleans up all child rows (SupervisorDecision, AuditEvent, etc.)
  await prismaRaw.company.deleteMany({ where: { slug: { startsWith: TEST_PREFIX } } });
  await prismaRaw.$disconnect();
  await app.close();
});

// ---------------------------------------------------------------------------
// 1. Happy: 3 PROPOSED rows of different tiers
// ---------------------------------------------------------------------------

describe('GET /supervisor/decisions — happy path', () => {
  it('returns all 3 rows with correct sections + counts', async () => {
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
        title: string;
        requiresTypedConfirm: boolean;
        confirmPhrase: string | null;
      }>;
      counts: {
        needsYouNow: number;
        routine: number;
        stale: number;
        failedReview: number;
        total: number;
      };
    }>();

    expect(body.rows).toHaveLength(3);
    expect(body.counts.total).toBe(3);

    // OPERATIONAL → ROUTINE
    const opRow = body.rows.find((r) => r.id === decOperational);
    expect(opRow).toBeDefined();
    expect(opRow!.section).toBe('ROUTINE');
    expect(opRow!.tier).toBe('OPERATIONAL');
    expect(opRow!.requiresTypedConfirm).toBe(false);
    expect(opRow!.confirmPhrase).toBeNull();

    // PERSONNEL → NEEDS_YOU_NOW
    const perRow = body.rows.find((r) => r.id === decPersonnel);
    expect(perRow).toBeDefined();
    expect(perRow!.section).toBe('NEEDS_YOU_NOW');
    expect(perRow!.tier).toBe('PERSONNEL');
    expect(perRow!.requiresTypedConfirm).toBe(false);

    // EMPLOYMENT → NEEDS_YOU_NOW + requiresTypedConfirm=true
    const empRow = body.rows.find((r) => r.id === decEmployment);
    expect(empRow).toBeDefined();
    expect(empRow!.section).toBe('NEEDS_YOU_NOW');
    expect(empRow!.tier).toBe('EMPLOYMENT');
    expect(empRow!.requiresTypedConfirm).toBe(true);
    expect(empRow!.confirmPhrase).toBe('TERMINATE');

    // Section counts: 2 NEEDS_YOU_NOW (PERSONNEL + EMPLOYMENT), 1 ROUTINE
    expect(body.counts.needsYouNow).toBe(2);
    expect(body.counts.routine).toBe(1);
    expect(body.counts.stale).toBe(0);
    expect(body.counts.failedReview).toBe(0);

    // Ordering: NEEDS_YOU_NOW rows come before ROUTINE rows.
    const needsFirst = body.rows.findIndex((r) => r.section === 'NEEDS_YOU_NOW');
    const routineFirst = body.rows.findIndex((r) => r.section === 'ROUTINE');
    expect(needsFirst).toBeLessThan(routineFirst);
  });
});

// ---------------------------------------------------------------------------
// 2. Empty: no proposed decisions for a fresh supervisor
// ---------------------------------------------------------------------------

describe('GET /supervisor/decisions — empty state', () => {
  it('returns empty rows and zero counts when supervisor has no pending decisions', async () => {
    // Create a fresh supervisor with no decisions.
    const freshUser = await prismaRaw.user.create({
      data: {
        phone: '+9166' + String(Date.now() + 10).slice(-8),
        name: 'EmptySup',
        locale: 'en',
        companyId: companyAId,
      },
    });
    await prismaRaw.membership.create({
      data: { companyId: companyAId, userId: freshUser.id, role: 'SUPERVISOR', status: 'ACTIVE' },
    });
    const { issueAccessToken } = await import('../src/lib/jwt.js');
    const freshToken = await issueAccessToken({
      userId: freshUser.id,
      companyId: companyAId,
      role: 'SUPERVISOR',
      availableRoles: ['SUPERVISOR'],
      locale: 'en',
    });

    const r = await app.inject({
      method: 'GET',
      url: '/supervisor/decisions',
      headers: { authorization: `Bearer ${freshToken}` },
    });

    expect(r.statusCode).toBe(200);
    const body = r.json<{ rows: unknown[]; counts: Record<string, number> }>();
    expect(body.rows).toHaveLength(0);
    expect(body.counts.needsYouNow).toBe(0);
    expect(body.counts.routine).toBe(0);
    expect(body.counts.stale).toBe(0);
    expect(body.counts.failedReview).toBe(0);
    expect(body.counts.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Cross-supervisor isolation
// ---------------------------------------------------------------------------

describe('GET /supervisor/decisions — cross-supervisor isolation', () => {
  it("SupB (same tenant) does not see SupA's decisions", async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/supervisor/decisions',
      headers: { authorization: `Bearer ${supBToken}` },
    });

    expect(r.statusCode).toBe(200);
    const body = r.json<{ rows: Array<{ id: string }>; counts: Record<string, number> }>();

    // SupB has no decisions seeded; SupA's decisions should not appear.
    const ids = body.rows.map((r) => r.id);
    expect(ids).not.toContain(decOperational);
    expect(ids).not.toContain(decPersonnel);
    expect(ids).not.toContain(decEmployment);
    expect(body.counts.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Dismiss happy path
// ---------------------------------------------------------------------------

describe('POST /supervisor/decisions/:id/dismiss — happy path', () => {
  it('dismisses a decision, sets dismissedAt, and emits DWI_DISMISSED AuditEvent', async () => {
    // Seed a fresh PROPOSED row for the dismiss test.
    const dismissId = randomUUID();
    await prismaRaw.supervisorDecision.create({
      data: {
        id: dismissId,
        companyId: companyAId,
        supervisorId: supAUserId,
        kind: 'MARK_ABSENT',
        tier: 'OPERATIONAL',
        targetId: null,
        payload: { workerName: 'TestWorker' },
      },
    });

    const r = await app.inject({
      method: 'POST',
      url: `/supervisor/decisions/${dismissId}/dismiss`,
      headers: {
        authorization: `Bearer ${supAToken}`,
        'content-type': 'application/json',
      },
      payload: { reason: 'Not relevant today' },
    });

    expect(r.statusCode).toBe(200);
    const body = r.json<{ ok: boolean; decisionId: string; dismissedAt: string }>();
    expect(body.ok).toBe(true);
    expect(body.decisionId).toBe(dismissId);
    expect(typeof body.dismissedAt).toBe('string');

    // DB: dismissedAt set, appliedAt still null.
    const row = await prismaRaw.supervisorDecision.findUnique({ where: { id: dismissId } });
    expect(row!.dismissedAt).not.toBeNull();
    expect(row!.appliedAt).toBeNull();
    expect(row!.dismissedReason).toBe('Not relevant today');

    // Audit: DWI_DISMISSED emitted.
    const audit = await prismaRaw.auditEvent.findFirst({
      where: { companyId: companyAId, kind: 'DWI_DISMISSED', targetId: dismissId },
    });
    expect(audit).not.toBeNull();
    const p = audit!.payload as Record<string, unknown>;
    expect(p.decisionId).toBe(dismissId);
    expect(p.dismissedBy).toBe(supAUserId);
  });

  it('dismiss without reason body (optional field)', async () => {
    const dismissId2 = randomUUID();
    await prismaRaw.supervisorDecision.create({
      data: {
        id: dismissId2,
        companyId: companyAId,
        supervisorId: supAUserId,
        kind: 'MARK_ABSENT',
        tier: 'OPERATIONAL',
        targetId: null,
        payload: {},
      },
    });

    const r = await app.inject({
      method: 'POST',
      url: `/supervisor/decisions/${dismissId2}/dismiss`,
      headers: {
        authorization: `Bearer ${supAToken}`,
        'content-type': 'application/json',
      },
      payload: {},
    });

    expect(r.statusCode).toBe(200);
    const body = r.json<{ ok: boolean }>();
    expect(body.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Dismiss already-dismissed → 409
// ---------------------------------------------------------------------------

describe('POST /supervisor/decisions/:id/dismiss — already dismissed', () => {
  it('returns 409 when decision was previously dismissed', async () => {
    const alreadyId = randomUUID();
    await prismaRaw.supervisorDecision.create({
      data: {
        id: alreadyId,
        companyId: companyAId,
        supervisorId: supAUserId,
        kind: 'MARK_ABSENT',
        tier: 'OPERATIONAL',
        targetId: null,
        payload: {},
        dismissedAt: new Date(),
        dismissedReason: 'already done',
      },
    });

    const r = await app.inject({
      method: 'POST',
      url: `/supervisor/decisions/${alreadyId}/dismiss`,
      headers: {
        authorization: `Bearer ${supAToken}`,
        'content-type': 'application/json',
      },
      payload: { reason: 'again' },
    });

    expect(r.statusCode).toBe(409);
    const body = r.json<{ error: string }>();
    expect(body.error).toBe('ALREADY_DISMISSED');
  });
});

// ---------------------------------------------------------------------------
// 6. 401: no token
// ---------------------------------------------------------------------------

describe('401 — unauthenticated', () => {
  it('GET /supervisor/decisions returns 401 without token', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/supervisor/decisions',
    });
    expect(r.statusCode).toBe(401);
  });

  it('POST /supervisor/decisions/:id/dismiss returns 401 without token', async () => {
    const r = await app.inject({
      method: 'POST',
      url: `/supervisor/decisions/${randomUUID()}/dismiss`,
      headers: { 'content-type': 'application/json' },
      payload: { reason: 'test' },
    });
    expect(r.statusCode).toBe(401);
  });
});
