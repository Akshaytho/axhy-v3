/**
 * Real-DB integration test: GET /supervisor/today
 *
 * Exercises:
 *   1. Happy path — supervisor with 2 sites / 4 workers / 2 visits / 1 flagged
 *   2. Empty — supervisor with 0 effective bindings
 *   3. Cross-supervisor isolation within same tenant
 *   4. §5.8 acting-over-permanent precedence
 *   5. 401 — missing Bearer token
 *
 * Runs against real Railway Postgres sandbox; each scenario uses distinct
 * supervisors + sites so they don't interfere.
 *
 * @derives(supervisor-responsibility-model §5.5 + §5.8 + §5.9)
 * @derives(panel-2026-05-17) — Today slice
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { TodayResponse } from '@axhy/shared-schema';

process.env.AXHY_OTP_BYPASS = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `sup-today-${Date.now()}-`;

// Distinct phone suffixes per actor — Date.now() base + index keeps them unique
// even across re-runs.
const phone = (suffix: number) => `+9199${String(Date.now() + suffix).slice(-8)}`;

let app: FastifyInstance;
let companyId: string;

let happySupId: string;
let happySupToken: string;
let happySiteOneId: string;
let happySiteTwoId: string;
let happyWorkerW1Id: string;
let happyFlaggedVisitId: string;

let emptySupId: string;
let emptySupToken: string;

let crossSupAId: string;
let crossSupAToken: string;
let crossSupBId: string;
let crossSupBToken: string;
let crossSiteForAId: string;
let crossSiteForBId: string;

let permSupId: string;
let permSupToken: string;
let actingSupId: string;
let actingSupToken: string;
let actingSiteId: string;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  const { issueAccessToken } = await import('../src/lib/jwt.js');
  app = await buildServer();
  await app.ready();

  const company = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: phone(0),
      ownerName: 'Owner',
    },
  });
  companyId = company.id;

  const issue = async (userId: string) =>
    issueAccessToken({
      userId,
      companyId,
      role: 'SUPERVISOR',
      availableRoles: ['SUPERVISOR'],
      locale: 'en',
    });

  // ───────── Scenario 1: happy path ─────────
  const happySup = await prismaRaw.user.create({
    data: { phone: phone(1), name: 'Sup Happy', locale: 'en' },
  });
  happySupId = happySup.id;
  await prismaRaw.membership.create({
    data: { companyId, userId: happySup.id, role: 'SUPERVISOR' },
  });
  happySupToken = await issue(happySup.id);

  const happySiteOne = await prismaRaw.site.create({
    data: { companyId, name: TEST_PREFIX + 'Happy-1', state: 'ACTIVE' },
  });
  happySiteOneId = happySiteOne.id;
  const happySiteTwo = await prismaRaw.site.create({
    data: { companyId, name: TEST_PREFIX + 'Happy-2', state: 'ACTIVE' },
  });
  happySiteTwoId = happySiteTwo.id;

  for (const siteId of [happySiteOneId, happySiteTwoId]) {
    await prismaRaw.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId,
        userId: happySupId,
        effectiveFrom: new Date('2026-01-01'),
        reason: 'test seed — happy path PERMANENT',
        createdBy: happySupId,
      },
    });
  }

  // 4 workers: 2 per site.
  // Pick shiftStart from the current UTC clock so the IN_PROGRESS visit's
  // startedAt=now lands within the 15-min "on time" window; otherwise the
  // late-detection rule trips and the test becomes time-of-day flaky.
  const now = new Date();
  const shiftHH = String(now.getUTCHours()).padStart(2, '0');
  const shiftMM = String(now.getUTCMinutes()).padStart(2, '0');
  const shiftStart = `${shiftHH}:${shiftMM}`;
  const happyWorkers: { id: string; siteId: string }[] = [];
  for (let i = 0; i < 4; i++) {
    const siteId = i < 2 ? happySiteOneId : happySiteTwoId;
    const w = await prismaRaw.worker.create({
      data: {
        companyId,
        name: `Happy Worker ${i + 1}`,
        phone: phone(10 + i),
        state: 'ACTIVE',
        baseSalaryPaise: 1300000,
      },
    });
    happyWorkers.push({ id: w.id, siteId });
    await prismaRaw.assignment.create({
      data: {
        companyId,
        workerId: w.id,
        siteId,
        shiftStart,
        shiftEnd: '23:59',
        // 7-char all-days mask so day-of-week never flakes the test
        dayMask: 'MTWTFSS',
        validFrom: new Date('2026-01-01'),
        state: 'ACTIVE',
      },
    });
  }
  happyWorkerW1Id = happyWorkers[0]!.id;

  // 2 Visits today on site one — W1 has IN_PROGRESS (actively cleaning, on-site);
  // W2 has VERIFIED (clocked out + photos uploaded + AI cleared; counts as on_site for the day).
  await prismaRaw.visit.create({
    data: {
      companyId,
      workerId: happyWorkers[0]!.id,
      siteId: happySiteOneId,
      state: 'IN_PROGRESS',
      scheduledFor: now,
      startedAt: now,
    },
  });
  await prismaRaw.visit.create({
    data: {
      companyId,
      workerId: happyWorkers[1]!.id,
      siteId: happySiteOneId,
      state: 'VERIFIED',
      scheduledFor: now,
      startedAt: now,
      completedAt: now,
    },
  });

  // 1 flagged Visit today on site two — W3.
  // Visit.state='FLAGGED' is the canonical state when AI raised a concern.
  // Visit.flagged=true is the boolean column the schema tracks separately
  // (verified in schema.prisma:226) — keep both consistent.
  const flagged = await prismaRaw.visit.create({
    data: {
      companyId,
      workerId: happyWorkers[2]!.id,
      siteId: happySiteTwoId,
      state: 'FLAGGED',
      scheduledFor: now,
      startedAt: now,
      completedAt: now,
      photosBefore: 2,
      photosAfter: 3,
      flagged: true,
      verificationText: 'Looks empty — AI flagged for review',
    },
  });
  happyFlaggedVisitId = flagged.id;

  // ───────── Scenario 2: empty (no bindings) ─────────
  const emptySup = await prismaRaw.user.create({
    data: { phone: phone(20), name: 'Sup Empty', locale: 'en' },
  });
  emptySupId = emptySup.id;
  await prismaRaw.membership.create({
    data: { companyId, userId: emptySup.id, role: 'SUPERVISOR' },
  });
  emptySupToken = await issue(emptySup.id);

  // ───────── Scenario 3: cross-supervisor isolation ─────────
  const crossSupA = await prismaRaw.user.create({
    data: { phone: phone(30), name: 'Sup A Cross', locale: 'en' },
  });
  crossSupAId = crossSupA.id;
  await prismaRaw.membership.create({
    data: { companyId, userId: crossSupA.id, role: 'SUPERVISOR' },
  });
  crossSupAToken = await issue(crossSupA.id);

  const crossSupB = await prismaRaw.user.create({
    data: { phone: phone(31), name: 'Sup B Cross', locale: 'en' },
  });
  crossSupBId = crossSupB.id;
  await prismaRaw.membership.create({
    data: { companyId, userId: crossSupB.id, role: 'SUPERVISOR' },
  });
  crossSupBToken = await issue(crossSupB.id);

  const crossSiteA = await prismaRaw.site.create({
    data: { companyId, name: TEST_PREFIX + 'CrossA', state: 'ACTIVE' },
  });
  crossSiteForAId = crossSiteA.id;
  const crossSiteB = await prismaRaw.site.create({
    data: { companyId, name: TEST_PREFIX + 'CrossB', state: 'ACTIVE' },
  });
  crossSiteForBId = crossSiteB.id;

  await prismaRaw.siteSupervisorBinding.create({
    data: {
      companyId,
      siteId: crossSiteForAId,
      userId: crossSupAId,
      effectiveFrom: new Date('2026-01-01'),
      reason: 'cross-A PERMANENT',
      createdBy: crossSupAId,
    },
  });
  await prismaRaw.siteSupervisorBinding.create({
    data: {
      companyId,
      siteId: crossSiteForBId,
      userId: crossSupBId,
      effectiveFrom: new Date('2026-01-01'),
      reason: 'cross-B PERMANENT',
      createdBy: crossSupBId,
    },
  });

  // ───────── Scenario 4: §5.8 acting precedence ─────────
  const permSup = await prismaRaw.user.create({
    data: { phone: phone(40), name: 'Sup Perm', locale: 'en' },
  });
  permSupId = permSup.id;
  await prismaRaw.membership.create({
    data: { companyId, userId: permSup.id, role: 'SUPERVISOR' },
  });
  permSupToken = await issue(permSup.id);

  const actingSup = await prismaRaw.user.create({
    data: { phone: phone(41), name: 'Sup Acting', locale: 'en' },
  });
  actingSupId = actingSup.id;
  await prismaRaw.membership.create({
    data: { companyId, userId: actingSup.id, role: 'SUPERVISOR' },
  });
  actingSupToken = await issue(actingSup.id);

  const actingSite = await prismaRaw.site.create({
    data: { companyId, name: TEST_PREFIX + 'Acting', state: 'ACTIVE' },
  });
  actingSiteId = actingSite.id;

  // PERMANENT — permSup owns the site from 2026-01-01, open-ended.
  await prismaRaw.siteSupervisorBinding.create({
    data: {
      companyId,
      siteId: actingSiteId,
      userId: permSupId,
      effectiveFrom: new Date('2026-01-01'),
      reason: 'acting-test PERMANENT',
      createdBy: permSupId,
    },
  });
  // ACTING — actingSup covers from yesterday through tomorrow; §5.8 wins now.
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await prismaRaw.siteSupervisorBinding.create({
    data: {
      companyId,
      siteId: actingSiteId,
      userId: actingSupId,
      actingForUserId: permSupId,
      effectiveFrom: yesterday,
      effectiveUntil: tomorrow,
      reason: 'acting-test ACTING window',
      createdBy: permSupId,
    },
  });
});

afterAll(async () => {
  await app.close();
  // Cascade via Company delete handles Site / Assignment / Worker / Visit / Binding / Outbox / AuditEvent
  await prismaRaw.attendance.deleteMany({ where: { companyId } });
  await prismaRaw.outbox.deleteMany({ where: { companyId } });
  await prismaRaw.auditEvent.deleteMany({ where: { companyId } });
  await prismaRaw.visit.deleteMany({ where: { companyId } });
  await prismaRaw.siteSupervisorBinding.deleteMany({ where: { companyId } });
  await prismaRaw.assignment.deleteMany({ where: { companyId } });
  await prismaRaw.worker.deleteMany({ where: { companyId } });
  await prismaRaw.site.deleteMany({ where: { companyId } });
  await prismaRaw.membership.deleteMany({ where: { companyId } });
  await prismaRaw.user.deleteMany({
    where: {
      id: {
        in: [happySupId, emptySupId, crossSupAId, crossSupBId, permSupId, actingSupId].filter(
          Boolean,
        ) as string[],
      },
    },
  });
  await prismaRaw.company.delete({ where: { id: companyId } });
  await prismaRaw.$disconnect();
});

async function get(url: string, token?: string) {
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
  return app.inject({ method: 'GET', url, headers });
}

describe('GET /supervisor/today', () => {
  it('happy path: 2 sites, 4 workers, 2 visits, 1 flagged — shape matches Zod and aggregates correctly', async () => {
    const res = await get('/supervisor/today', happySupToken);
    expect(res.statusCode).toBe(200);
    const body = res.json();

    const parsed = TodayResponse.safeParse(body);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const today = parsed.data;

    // 2 sites in portfolio
    expect(today.sites).toHaveLength(2);
    const siteIds = today.sites.map((s) => s.id).sort();
    expect(siteIds).toEqual([happySiteOneId, happySiteTwoId].sort());

    // 4 workers
    expect(today.workers).toHaveLength(4);
    // W1 has IN_PROGRESS visit → on_site with clockIn timestamp
    const w1 = today.workers.find((w) => w.id === happyWorkerW1Id);
    expect(w1).toBeDefined();
    expect(w1!.state).toBe('on_site');
    expect(w1!.clockIn).not.toBeNull();

    // pulse:
    //   onSite=3 — W1 (IN_PROGRESS on site_one) + W2 (COMPLETED on site_one)
    //     + W3 (COMPLETED+flagged on site_two; flagged still counts as on_site
    //     per the derivation rule).
    //   pending=1 — W4 only (no visit, no attendance).
    //   flagged=1 — one flagged Visit.
    expect(today.pulse.onSite).toBe(3);
    expect(today.pulse.late).toBe(0);
    expect(today.pulse.noShow).toBe(0);
    expect(today.pulse.pending).toBe(1);
    expect(today.pulse.flagged).toBe(1);

    // 1 flagged visit
    expect(today.flaggedVisits).toHaveLength(1);
    expect(today.flaggedVisits[0]!.visitId).toBe(happyFlaggedVisitId);
    expect(today.flaggedVisits[0]!.photoCount).toBe(5);
    expect(today.flaggedVisits[0]!.reason).toBe('Looks empty — AI flagged for review');

    // site flagged flag
    const siteTwo = today.sites.find((s) => s.id === happySiteTwoId);
    expect(siteTwo!.flagged).toBe(true);
    const siteOne = today.sites.find((s) => s.id === happySiteOneId);
    expect(siteOne!.flagged).toBe(false);
  });

  it('empty: supervisor with 0 bindings returns zero-shape response', async () => {
    const res = await get('/supervisor/today', emptySupToken);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toEqual({
      sites: [],
      workers: [],
      pulse: { onSite: 0, late: 0, noShow: 0, pending: 0, flagged: 0 },
      flaggedVisits: [],
    });
  });

  it('cross-supervisor isolation: SupA sees only its sites; SupB sees only its sites', async () => {
    const aRes = await get('/supervisor/today', crossSupAToken);
    expect(aRes.statusCode).toBe(200);
    const aBody = TodayResponse.parse(aRes.json());
    const aSiteIds = aBody.sites.map((s) => s.id);
    expect(aSiteIds).toEqual([crossSiteForAId]);
    expect(aSiteIds).not.toContain(crossSiteForBId);

    const bRes = await get('/supervisor/today', crossSupBToken);
    expect(bRes.statusCode).toBe(200);
    const bBody = TodayResponse.parse(bRes.json());
    const bSiteIds = bBody.sites.map((s) => s.id);
    expect(bSiteIds).toEqual([crossSiteForBId]);
    expect(bSiteIds).not.toContain(crossSiteForAId);
  });

  it('acting precedence: ACTING overrides PERMANENT — SupActing sees the site; SupPerm does not', async () => {
    const permRes = await get('/supervisor/today', permSupToken);
    expect(permRes.statusCode).toBe(200);
    const permBody = TodayResponse.parse(permRes.json());
    const permSiteIds = permBody.sites.map((s) => s.id);
    expect(permSiteIds).not.toContain(actingSiteId);

    const actingRes = await get('/supervisor/today', actingSupToken);
    expect(actingRes.statusCode).toBe(200);
    const actingBody = TodayResponse.parse(actingRes.json());
    const actingSiteIds = actingBody.sites.map((s) => s.id);
    expect(actingSiteIds).toContain(actingSiteId);
  });

  it('rejects requests with no Bearer token with 401', async () => {
    const res = await get('/supervisor/today');
    expect(res.statusCode).toBe(401);
  });
});
