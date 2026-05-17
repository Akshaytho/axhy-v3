/**
 * P1.5b bootstrap-seed real-DB integration tests.
 *
 * Plan: /Users/thotaakshay/.claude/plans/tranquil-crunching-plum.md rev 4
 *       (S5 — 21 cases; 17a/17b inside one logical case).
 *
 * Strategy:
 * - Each test seeds a fresh `Company` (or multiple) under TEST_PREFIX in the
 *   real sandbox DB.
 * - Calls `runBootstrapSeed({ prisma, reportDir: os.tmpdir(), ... })` directly
 *   (NOT a subprocess) and asserts on the returned `BootstrapSeedRunResult`.
 * - Helper-level tests (`createPermanentBinding`, `getSitesSupervisedByUser`)
 *   open their own `withTenantContext` block.
 *
 * @derives(supervisor-responsibility-model Amendments 2026-05-17)
 */

import * as os from 'node:os';

import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

import { runBootstrapSeed } from '../scripts/p1_5_bootstrap_seed_bindings.js';
import { withTenantContext } from '../src/middleware/tenant-context.js';
import {
  createPermanentBinding,
  type CreatePermanentBindingResult,
} from '../src/lib/site-supervisor-binding.js';
import { getSitesSupervisedByUser } from '../src/lib/effective-responsibility.js';

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `p15b-${Date.now()}-`;
const REPORT_DIR = os.tmpdir();

let phoneSeq = 1;
function nextPhone(): string {
  // Stable within a single test run, unique across companies/users.
  const n = `${Date.now()}${phoneSeq++}`.slice(-10);
  return `+91${n}`;
}

/** Create an ACTIVE Company and return its id + slug. */
async function makeCompany(
  label: string,
  opts?: { status?: string },
): Promise<{ id: string; slug: string }> {
  const slug = `${TEST_PREFIX}${label}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const co = await prisma.company.create({
    data: {
      name: `${TEST_PREFIX}${label}-co`,
      slug,
      ownerPhone: nextPhone(),
      ownerName: 'Owner',
      status: opts?.status ?? 'ACTIVE',
    },
  });
  return { id: co.id, slug: co.slug };
}

/** Create a supervisor User + ACTIVE Membership in `companyId`. */
async function makeSupervisor(
  companyId: string,
  name: string,
  status: string = 'ACTIVE',
): Promise<string> {
  const u = await prisma.user.create({
    data: { phone: nextPhone(), name, locale: 'en' },
  });
  await prisma.membership.create({
    data: { companyId, userId: u.id, role: 'SUPERVISOR', status },
  });
  return u.id;
}

async function makeSite(companyId: string, name: string): Promise<string> {
  const s = await prisma.site.create({
    data: { companyId, name, state: 'ACTIVE' },
  });
  return s.id;
}

async function seedComplaints(
  companyId: string,
  siteId: string,
  supervisorId: string,
  count: number,
  createdAtOffsetDays: number = -1,
): Promise<void> {
  if (count <= 0) return;
  const createdAt = new Date(Date.now() + createdAtOffsetDays * 24 * 60 * 60 * 1000);
  await prisma.complaint.createMany({
    data: Array.from({ length: count }, () => ({
      companyId,
      siteId,
      supervisorId,
      text: 'seeded for test',
      severity: 'LOW',
      createdAt,
    })),
  });
}

async function seedSwapRequests(
  companyId: string,
  siteId: string,
  supervisorId: string,
  count: number,
  createdAtOffsetDays: number = -1,
  effectiveAtOffsetDays: number = 0,
): Promise<void> {
  if (count <= 0) return;
  const createdAt = new Date(Date.now() + createdAtOffsetDays * 24 * 60 * 60 * 1000);
  const effectiveAt = new Date(Date.now() + effectiveAtOffsetDays * 24 * 60 * 60 * 1000);

  // SwapRequest needs fromWorker + toWorker — seed minimal workers under
  // this company specifically for the test's purposes.
  const fw = await prisma.worker.create({
    data: {
      companyId,
      name: 'fromW-' + supervisorId,
      phone: nextPhone(),
      state: 'ACTIVE',
      baseSalaryPaise: 0,
    },
  });
  const tw = await prisma.worker.create({
    data: {
      companyId,
      name: 'toW-' + supervisorId,
      phone: nextPhone(),
      state: 'ACTIVE',
      baseSalaryPaise: 0,
    },
  });
  await prisma.swapRequest.createMany({
    data: Array.from({ length: count }, () => ({
      companyId,
      siteId,
      supervisorId,
      fromWorkerId: fw.id,
      toWorkerId: tw.id,
      state: 'DRAFT',
      effectiveAt,
      createdAt,
    })),
  });
}

/** Compute the next tenant-local midnight in Asia/Kolkata, given `now`. */
function nextKolkataMidnight(now: Date): Date {
  // Asia/Kolkata is UTC+5:30 with no DST.
  const kolkataOffsetMs = 5.5 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + kolkataOffsetMs);
  local.setUTCHours(24, 0, 0, 0);
  return new Date(local.getTime() - kolkataOffsetMs);
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('P1.5b bootstrap-seed (real DB)', () => {
  // -------------------------------------------------------------------------
  // Case 1 — Tier 1 Complaint-heavy
  // -------------------------------------------------------------------------
  it('Case 1: Tier-1 Complaint-heavy (A=7, B=2, C=1) → binds A', async () => {
    const co = await makeCompany('c1');
    const supA = await makeSupervisor(co.id, 'A');
    const supB = await makeSupervisor(co.id, 'B');
    const supC = await makeSupervisor(co.id, 'C');
    const site = await makeSite(co.id, 'Site 1');
    await seedComplaints(co.id, site, supA, 7);
    await seedComplaints(co.id, site, supB, 2);
    await seedComplaints(co.id, site, supC, 1);

    const r = await runBootstrapSeed({ prisma, companySlug: co.slug, reportDir: REPORT_DIR });

    expect(r.failed).toBe(false);
    expect(r.summary.companiesProcessed).toBe(1);
    const siteReport = r.report.companies[0].sites.find((s) => s.siteId === site);
    expect(siteReport).toBeDefined();
    expect(siteReport!.tier).toBe('tier1');
    expect(siteReport!.winnerUserId).toBe(supA);
    expect(siteReport!.winnerScore?.share).toBeCloseTo(0.7, 1);
    const binding = await prisma.siteSupervisorBinding.findFirst({
      where: { companyId: co.id, siteId: site, actingForUserId: null },
    });
    expect(binding).not.toBeNull();
    expect(binding!.userId).toBe(supA);
    expect(binding!.reason).toBe('BOOTSTRAP_SEED — pending HR review');
  });

  // -------------------------------------------------------------------------
  // Case 2 — Tier 1 SwapRequest-heavy
  // -------------------------------------------------------------------------
  it('Case 2: Tier-1 SwapRequest-heavy (A=7, B=1) → binds A', async () => {
    const co = await makeCompany('c2');
    const supA = await makeSupervisor(co.id, 'A');
    const supB = await makeSupervisor(co.id, 'B');
    const site = await makeSite(co.id, 'Site 2');
    await seedSwapRequests(co.id, site, supA, 7);
    await seedSwapRequests(co.id, site, supB, 1);

    const r = await runBootstrapSeed({ prisma, companySlug: co.slug, reportDir: REPORT_DIR });

    const siteReport = r.report.companies[0].sites.find((s) => s.siteId === site)!;
    expect(siteReport.tier).toBe('tier1');
    expect(siteReport.winnerUserId).toBe(supA);
  });

  // -------------------------------------------------------------------------
  // Case 3 — Tier 1 mixed sources
  // -------------------------------------------------------------------------
  it('Case 3: Tier-1 mixed (A=3 complaints + 4 swaps = 7, B=3) → binds A', async () => {
    const co = await makeCompany('c3');
    const supA = await makeSupervisor(co.id, 'A');
    const supB = await makeSupervisor(co.id, 'B');
    const site = await makeSite(co.id, 'Site 3');
    await seedComplaints(co.id, site, supA, 3);
    await seedSwapRequests(co.id, site, supA, 4);
    await seedComplaints(co.id, site, supB, 2);
    await seedSwapRequests(co.id, site, supB, 1);

    const r = await runBootstrapSeed({ prisma, companySlug: co.slug, reportDir: REPORT_DIR });

    const siteReport = r.report.companies[0].sites.find((s) => s.siteId === site)!;
    expect(siteReport.tier).toBe('tier1');
    expect(siteReport.winnerUserId).toBe(supA);
    expect(siteReport.winnerScore?.total).toBe(7);
    expect(siteReport.winnerScore?.share).toBeCloseTo(0.7, 1);
  });

  // -------------------------------------------------------------------------
  // Case 4 — Tier 1 below event minimum
  // -------------------------------------------------------------------------
  it('Case 4: Tier-1 below event minimum (A=1, B=1) → falls through', async () => {
    const co = await makeCompany('c4');
    const supA = await makeSupervisor(co.id, 'A');
    const supB = await makeSupervisor(co.id, 'B');
    const site = await makeSite(co.id, 'Site 4');
    await seedComplaints(co.id, site, supA, 1);
    await seedComplaints(co.id, site, supB, 1);

    const r = await runBootstrapSeed({ prisma, companySlug: co.slug, reportDir: REPORT_DIR });

    const siteReport = r.report.companies[0].sites.find((s) => s.siteId === site)!;
    // With 2 active supervisors and no winner, Tier-2 doesn't apply (sole-supervisor only).
    expect(siteReport.tier).toBe('tier3-unbound');
    expect(siteReport.winnerUserId).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Case 5 — Tier 1 below share threshold
  // -------------------------------------------------------------------------
  it('Case 5: Tier-1 below share threshold (A=3, B=3) → tie surfaced + falls through', async () => {
    const co = await makeCompany('c5');
    const supA = await makeSupervisor(co.id, 'A');
    const supB = await makeSupervisor(co.id, 'B');
    const site = await makeSite(co.id, 'Site 5');
    await seedComplaints(co.id, site, supA, 3);
    await seedComplaints(co.id, site, supB, 3);

    const r = await runBootstrapSeed({ prisma, companySlug: co.slug, reportDir: REPORT_DIR });

    const siteReport = r.report.companies[0].sites.find((s) => s.siteId === site)!;
    expect(siteReport.tier).toBe('tier3-unbound');
    expect(siteReport.warnings.some((w) => w.includes('exact tie'))).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Case 6 — Candidate no longer ACTIVE Membership
  // -------------------------------------------------------------------------
  it('Case 6: Tier-1 candidate has LEFT membership → filtered', async () => {
    const co = await makeCompany('c6');
    const supA = await makeSupervisor(co.id, 'A', 'LEFT');
    const supB = await makeSupervisor(co.id, 'B'); // sole ACTIVE
    const site = await makeSite(co.id, 'Site 6');
    await seedComplaints(co.id, site, supA, 10); // would win, but filtered

    const r = await runBootstrapSeed({ prisma, companySlug: co.slug, reportDir: REPORT_DIR });

    const siteReport = r.report.companies[0].sites.find((s) => s.siteId === site)!;
    // A is filtered out; only B remains ACTIVE → Tier 2 sole-supervisor.
    expect(siteReport.tier).toBe('tier2');
    expect(siteReport.winnerUserId).toBe(supB);
  });

  // -------------------------------------------------------------------------
  // Case 7 — Tier 2 sole supervisor
  // -------------------------------------------------------------------------
  it('Case 7: Tier-2 sole supervisor with no events → 2 sites both bind', async () => {
    const co = await makeCompany('c7');
    const sup = await makeSupervisor(co.id, 'Sole');
    const site1 = await makeSite(co.id, 'Site 7a');
    const site2 = await makeSite(co.id, 'Site 7b');

    const r = await runBootstrapSeed({ prisma, companySlug: co.slug, reportDir: REPORT_DIR });

    const sites = r.report.companies[0].sites;
    const s1 = sites.find((s) => s.siteId === site1)!;
    const s2 = sites.find((s) => s.siteId === site2)!;
    expect(s1.tier).toBe('tier2');
    expect(s2.tier).toBe('tier2');
    expect(s1.winnerUserId).toBe(sup);
    expect(s2.winnerUserId).toBe(sup);
  });

  // -------------------------------------------------------------------------
  // Case 8 — Tier 3 unbound
  // -------------------------------------------------------------------------
  it('Case 8: Tier-3 unbound (2 active sups, no events)', async () => {
    const co = await makeCompany('c8');
    await makeSupervisor(co.id, 'A');
    await makeSupervisor(co.id, 'B');
    const site = await makeSite(co.id, 'Site 8');

    const r = await runBootstrapSeed({ prisma, companySlug: co.slug, reportDir: REPORT_DIR });

    const siteReport = r.report.companies[0].sites.find((s) => s.siteId === site)!;
    expect(siteReport.tier).toBe('tier3-unbound');
    expect(siteReport.winnerUserId).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Case 9 — Idempotency: second run produces zero new bindings
  // -------------------------------------------------------------------------
  it('Case 9: Idempotent re-run produces no new bindings', async () => {
    const co = await makeCompany('c9');
    const sup = await makeSupervisor(co.id, 'Sole');
    const site = await makeSite(co.id, 'Site 9');
    await seedComplaints(co.id, site, sup, 5);

    const first = await runBootstrapSeed({ prisma, companySlug: co.slug, reportDir: REPORT_DIR });
    expect(first.summary.sitesBound).toBe(1);

    const second = await runBootstrapSeed({ prisma, companySlug: co.slug, reportDir: REPORT_DIR });
    const siteReport = second.report.companies[0].sites.find((s) => s.siteId === site)!;
    expect(siteReport.tier).toBe('skipped-window-overlap');
    expect(siteReport.conflictingBindingId).not.toBeNull();
    const countAfter = await prisma.siteSupervisorBinding.count({
      where: { companyId: co.id, siteId: site, actingForUserId: null },
    });
    expect(countAfter).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Case 10 — Tenancy isolation
  // -------------------------------------------------------------------------
  it('Case 10: Tenancy isolation — Company B untouched when seeding Company A', async () => {
    const coA = await makeCompany('c10a');
    const supA = await makeSupervisor(coA.id, 'A');
    const siteA = await makeSite(coA.id, 'A-Site');
    await seedComplaints(coA.id, siteA, supA, 5);

    const coB = await makeCompany('c10b');
    await makeSupervisor(coB.id, 'B');
    await makeSite(coB.id, 'B-Site');

    await runBootstrapSeed({ prisma, companySlug: coA.slug, reportDir: REPORT_DIR });

    const bCount = await prisma.siteSupervisorBinding.count({
      where: { companyId: coB.id },
    });
    expect(bCount).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Case 11 — Recent-HR-action skip
  // -------------------------------------------------------------------------
  it('Case 11: Recent HR action (endedAt = now − 3d) skips site', async () => {
    const co = await makeCompany('c11');
    const sup = await makeSupervisor(co.id, 'A');
    const site = await makeSite(co.id, 'Site 11');
    // Seed an ended PERMANENT binding 3 days ago.
    await prisma.siteSupervisorBinding.create({
      data: {
        companyId: co.id,
        siteId: site,
        userId: sup,
        actingForUserId: null,
        effectiveFrom: new Date(Date.now() - 30 * 86400_000),
        effectiveUntil: null,
        reason: 'pre-existing',
        createdBy: '00000000-0000-0000-0000-000000000000',
        endedAt: new Date(Date.now() - 3 * 86400_000),
        endedReason: 'manual',
      },
    });
    await seedComplaints(co.id, site, sup, 10);

    const r = await runBootstrapSeed({ prisma, companySlug: co.slug, reportDir: REPORT_DIR });

    const siteReport = r.report.companies[0].sites.find((s) => s.siteId === site)!;
    expect(siteReport.tier).toBe('skipped-recent-hr-action');
    expect(siteReport.conflictingBindingId).not.toBeNull();
  });

  // -------------------------------------------------------------------------
  // Case 12 — SwapRequest.effectiveAt outside window must NOT count
  // -------------------------------------------------------------------------
  it('Case 12: SwapRequest with old createdAt (−60d) ignored even if effectiveAt is recent', async () => {
    const co = await makeCompany('c12');
    const sup = await makeSupervisor(co.id, 'Sole');
    const site = await makeSite(co.id, 'Site 12');
    // createdAt = 60d ago (outside window), effectiveAt = 5d ago (inside)
    await seedSwapRequests(co.id, site, sup, 10, -60, -5);

    const r = await runBootstrapSeed({ prisma, companySlug: co.slug, reportDir: REPORT_DIR });

    const siteReport = r.report.companies[0].sites.find((s) => s.siteId === site)!;
    // No Tier-1 winner (createdAt out of window). Sole supervisor → Tier 2.
    expect(siteReport.tier).toBe('tier2');
  });

  // -------------------------------------------------------------------------
  // Case 13 — getSitesSupervisedByUser happy path
  // -------------------------------------------------------------------------
  it('Case 13: getSitesSupervisedByUser returns 1 site after seed', async () => {
    const co = await makeCompany('c13');
    const sup = await makeSupervisor(co.id, 'Sole');
    const site = await makeSite(co.id, 'Site 13');
    await seedComplaints(co.id, site, sup, 5);

    await runBootstrapSeed({ prisma, companySlug: co.slug, reportDir: REPORT_DIR });

    const result = await withTenantContext(prisma, co.id, async (tx) => {
      return getSitesSupervisedByUser(tx, { companyId: co.id, userId: sup });
    });
    expect(result.length).toBe(1);
    expect(result[0].siteId).toBe(site);
    expect(result[0].kind).toBe('PERMANENT');
  });

  // -------------------------------------------------------------------------
  // Case 14 — Acting-precedence in reverse query
  // -------------------------------------------------------------------------
  it('Case 14: ACTING binding overrides PERMANENT in getSitesSupervisedByUser', async () => {
    const co = await makeCompany('c14');
    const supA = await makeSupervisor(co.id, 'A');
    const supX = await makeSupervisor(co.id, 'X');
    const site = await makeSite(co.id, 'Site 14');
    await seedComplaints(co.id, site, supA, 5);

    await runBootstrapSeed({ prisma, companySlug: co.slug, reportDir: REPORT_DIR });

    // Add an ACTING binding for X overlapping now.
    await prisma.siteSupervisorBinding.create({
      data: {
        companyId: co.id,
        siteId: site,
        userId: supX,
        actingForUserId: supA,
        effectiveFrom: new Date(Date.now() - 60_000),
        effectiveUntil: new Date(Date.now() + 60 * 60_000),
        reason: 'acting cover',
        createdBy: '00000000-0000-0000-0000-000000000000',
      },
    });

    const [aSites, xSites] = await withTenantContext(prisma, co.id, async (tx) => {
      return Promise.all([
        getSitesSupervisedByUser(tx, { companyId: co.id, userId: supA }),
        getSitesSupervisedByUser(tx, { companyId: co.id, userId: supX }),
      ]);
    });
    expect(aSites.length).toBe(0);
    expect(xSites.length).toBe(1);
    expect(xSites[0].kind).toBe('ACTING');
  });

  // -------------------------------------------------------------------------
  // Case 15 — createPermanentBinding concurrency: two parallel callers
  // -------------------------------------------------------------------------
  it('Case 15: Concurrent createPermanentBinding — one CREATED, one WINDOW_OVERLAP', async () => {
    const co = await makeCompany('c15');
    const supA = await makeSupervisor(co.id, 'A');
    const site = await makeSite(co.id, 'Site 15');

    const effectiveFrom = new Date();

    const results = await Promise.all([
      withTenantContext(prisma, co.id, async (tx) =>
        createPermanentBinding(
          tx,
          {
            companyId: co.id,
            siteId: site,
            userId: supA,
            effectiveFrom,
            effectiveUntil: null,
            reason: 'concurrency test',
            createdBy: '00000000-0000-0000-0000-000000000000',
          },
          { tenantTimeZone: null, bypassFreezeReason: 'BOOTSTRAP_SEED' },
        ),
      ),
      withTenantContext(prisma, co.id, async (tx) =>
        createPermanentBinding(
          tx,
          {
            companyId: co.id,
            siteId: site,
            userId: supA,
            effectiveFrom,
            effectiveUntil: null,
            reason: 'concurrency test 2',
            createdBy: '00000000-0000-0000-0000-000000000000',
          },
          { tenantTimeZone: null, bypassFreezeReason: 'BOOTSTRAP_SEED' },
        ),
      ),
    ]);
    const created = results.filter(
      (r): r is Extract<CreatePermanentBindingResult, { kind: 'CREATED' }> => r.kind === 'CREATED',
    );
    const overlapped = results.filter(
      (r): r is Extract<CreatePermanentBindingResult, { kind: 'WINDOW_OVERLAP' }> =>
        r.kind === 'WINDOW_OVERLAP',
    );
    expect(created.length).toBe(1);
    expect(overlapped.length).toBe(1);
    expect(overlapped[0].conflictingBindingId).toBe(created[0].bindingId);
  });

  // -------------------------------------------------------------------------
  // Case 16 — tenantTimeZone:null without bypassFreezeReason throws
  // -------------------------------------------------------------------------
  it('Case 16: createPermanentBinding tz=null without bypassFreezeReason throws', async () => {
    const co = await makeCompany('c16');
    const sup = await makeSupervisor(co.id, 'A');
    const site = await makeSite(co.id, 'Site 16');

    await expect(
      withTenantContext(prisma, co.id, async (tx) =>
        createPermanentBinding(
          tx,
          {
            companyId: co.id,
            siteId: site,
            userId: sup,
            effectiveFrom: new Date(),
            effectiveUntil: null,
            reason: 'bad call',
            createdBy: '00000000-0000-0000-0000-000000000000',
          },
          { tenantTimeZone: null }, // no bypassFreezeReason
        ),
      ),
    ).rejects.toThrow(/bypassFreezeReason/);
  });

  // -------------------------------------------------------------------------
  // Case 17a — Same-day freeze: tz set + effectiveFrom=now → throws
  // -------------------------------------------------------------------------
  it('Case 17a: tz="Asia/Kolkata" + effectiveFrom=now throws SameDayFreezeError', async () => {
    const co = await makeCompany('c17a');
    const sup = await makeSupervisor(co.id, 'A');
    const site = await makeSite(co.id, 'Site 17a');

    await expect(
      withTenantContext(prisma, co.id, async (tx) =>
        createPermanentBinding(
          tx,
          {
            companyId: co.id,
            siteId: site,
            userId: sup,
            effectiveFrom: new Date(),
            effectiveUntil: null,
            reason: 'same-day attempt',
            createdBy: '00000000-0000-0000-0000-000000000000',
          },
          { tenantTimeZone: 'Asia/Kolkata' },
        ),
      ),
    ).rejects.toThrow(/SAME_DAY_FREEZE|same-day/i);
  });

  // -------------------------------------------------------------------------
  // Case 17b — effectiveFrom = next tenant-local midnight → CREATED
  // -------------------------------------------------------------------------
  it('Case 17b: tz="Asia/Kolkata" + effectiveFrom=next-midnight → CREATED', async () => {
    const co = await makeCompany('c17b');
    const sup = await makeSupervisor(co.id, 'A');
    const site = await makeSite(co.id, 'Site 17b');

    const tomorrow = nextKolkataMidnight(new Date());

    const result = await withTenantContext(prisma, co.id, async (tx) =>
      createPermanentBinding(
        tx,
        {
          companyId: co.id,
          siteId: site,
          userId: sup,
          effectiveFrom: tomorrow,
          effectiveUntil: null,
          reason: 'first-bind future-dated',
          createdBy: '00000000-0000-0000-0000-000000000000',
        },
        { tenantTimeZone: 'Asia/Kolkata' },
      ),
    );

    expect(result.kind).toBe('CREATED');
    const row = await prisma.siteSupervisorBinding.findFirst({
      where: { companyId: co.id, siteId: site, actingForUserId: null },
    });
    expect(row).not.toBeNull();
    expect(row!.effectiveFrom.getTime()).toBe(tomorrow.getTime());
  });

  // -------------------------------------------------------------------------
  // Case 18 — Future-dated overlap returns WINDOW_OVERLAP
  // -------------------------------------------------------------------------
  it('Case 18: Future-dated overlap returns WINDOW_OVERLAP', async () => {
    const co = await makeCompany('c18');
    const supA = await makeSupervisor(co.id, 'A');
    const supB = await makeSupervisor(co.id, 'B');
    const site = await makeSite(co.id, 'Site 18');

    const t1 = nextKolkataMidnight(new Date());
    const t2 = new Date(t1.getTime() + 7 * 86400_000);
    const t1Plus = new Date(t1.getTime() + 3 * 86400_000);
    const t2Plus = new Date(t2.getTime() + 3 * 86400_000);

    const first = await withTenantContext(prisma, co.id, async (tx) =>
      createPermanentBinding(
        tx,
        {
          companyId: co.id,
          siteId: site,
          userId: supA,
          effectiveFrom: t1,
          effectiveUntil: t2,
          reason: 'window A',
          createdBy: '00000000-0000-0000-0000-000000000000',
        },
        { tenantTimeZone: 'Asia/Kolkata' },
      ),
    );
    expect(first.kind).toBe('CREATED');

    const second = await withTenantContext(prisma, co.id, async (tx) =>
      createPermanentBinding(
        tx,
        {
          companyId: co.id,
          siteId: site,
          userId: supB,
          effectiveFrom: t1Plus,
          effectiveUntil: t2Plus,
          reason: 'window B (overlaps A)',
          createdBy: '00000000-0000-0000-0000-000000000000',
        },
        { tenantTimeZone: 'Asia/Kolkata' },
      ),
    );
    expect(second.kind).toBe('WINDOW_OVERLAP');
  });

  // -------------------------------------------------------------------------
  // Case 19 — Multi-company default run
  // -------------------------------------------------------------------------
  // Cases 19-21 invoke runBootstrapSeed without a companySlug, so the script
  // iterates every ACTIVE Company in the sandbox — including cruft accumulated
  // from prior test runs. Each company costs ~5s over the public proxy URL,
  // so the default 30s testTimeout is not enough. Use a per-test 180s budget.
  it(
    'Case 19: Multi-company default run processes ALL ACTIVE companies',
    { timeout: 360_000 },
    async () => {
      // Three fresh companies under a localized prefix so we can scope the assertion.
      const tag = `c19-${Date.now()}`;
      const cos = await Promise.all(
        ['a', 'b', 'c'].map(async (label) => {
          const co = await makeCompany(`${tag}-${label}`);
          const sup = await makeSupervisor(co.id, 'sup');
          const site = await makeSite(co.id, `S-${label}`);
          await seedComplaints(co.id, site, sup, 5);
          return { ...co, site, sup };
        }),
      );

      // Default run (no companySlug). Only assert on our seeded companies because
      // the sandbox may have others from earlier tests.
      const r = await runBootstrapSeed({ prisma, reportDir: REPORT_DIR });
      expect(r.failed).toBe(false);

      for (const co of cos) {
        const reportCo = r.report.companies.find((rc) => rc.companyId === co.id);
        expect(reportCo).toBeDefined();
        expect(reportCo!.failed).toBe(false);
        const reportSite = reportCo!.sites.find((s) => s.siteId === co.site);
        expect(reportSite?.tier).toMatch(/tier1|tier2/);
        const binding = await prisma.siteSupervisorBinding.findFirst({
          where: { companyId: co.id, siteId: co.site, actingForUserId: null },
        });
        expect(binding?.userId).toBe(co.sup);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Case 20 — Multi-company resilience via _testHookBeforeCompany
  // -------------------------------------------------------------------------
  it(
    'Case 20: Per-company fault is contained; other companies still process',
    { timeout: 360_000 },
    async () => {
      const tag = `c20-${Date.now()}`;
      const cos = await Promise.all(
        ['a', 'broken', 'c'].map(async (label) => {
          const co = await makeCompany(`${tag}-${label}`);
          const sup = await makeSupervisor(co.id, 'sup');
          const site = await makeSite(co.id, `S-${label}`);
          await seedComplaints(co.id, site, sup, 5);
          return { ...co, site, sup, label };
        }),
      );

      const brokenSlug = cos.find((c) => c.label === 'broken')!.slug;

      const r = await runBootstrapSeed({
        prisma,
        reportDir: REPORT_DIR,
        _testHookBeforeCompany: async (_id, slug) => {
          if (slug === brokenSlug) throw new Error('synthetic fault for case 20');
        },
      });

      // result.failed=true overall because one company failed.
      expect(r.failed).toBe(true);

      const aCo = r.report.companies.find((c) => c.companyId === cos[0].id)!;
      const brokenCo = r.report.companies.find((c) => c.companyId === cos[1].id)!;
      const cCo = r.report.companies.find((c) => c.companyId === cos[2].id)!;

      expect(aCo.failed).toBe(false);
      expect(brokenCo.failed).toBe(true);
      expect(brokenCo.warnings.some((w) => w.includes('synthetic fault for case 20'))).toBe(true);
      expect(cCo.failed).toBe(false);

      // Healthy companies still got bindings.
      const aBinding = await prisma.siteSupervisorBinding.findFirst({
        where: { companyId: cos[0].id, siteId: cos[0].site, actingForUserId: null },
      });
      const brokenBinding = await prisma.siteSupervisorBinding.findFirst({
        where: { companyId: cos[1].id, siteId: cos[1].site, actingForUserId: null },
      });
      const cBinding = await prisma.siteSupervisorBinding.findFirst({
        where: { companyId: cos[2].id, siteId: cos[2].site, actingForUserId: null },
      });
      expect(aBinding).not.toBeNull();
      expect(brokenBinding).toBeNull();
      expect(cBinding).not.toBeNull();
    },
  );

  // -------------------------------------------------------------------------
  // Case 23 — Query-count guard for getSitesSupervisedByUser (anti-N+1)
  // Panel-polish 2026-05-17 P2 #5: prevent regression back to the N+1 shape.
  // The refactored helper must run exactly 2 SiteSupervisorBinding queries,
  // independent of portfolio size. We seed 5 sites for one supervisor and
  // count the SELECTs Prisma issues.
  // -------------------------------------------------------------------------
  it(
    'Case 23: getSitesSupervisedByUser issues <=2 SiteSupervisorBinding queries regardless of portfolio size',
    { timeout: 60_000 },
    async () => {
      const co = await makeCompany('c23');
      const sup = await makeSupervisor(co.id, 'Sole');
      const sites: string[] = [];
      for (let i = 0; i < 5; i++) {
        const sId = await makeSite(co.id, `c23-site-${i}`);
        sites.push(sId);
        await seedComplaints(co.id, sId, sup, 5);
      }

      // Run bootstrap to populate 5 PERMANENT bindings for sup.
      await runBootstrapSeed({ prisma, companySlug: co.slug, reportDir: REPORT_DIR });

      // Build an instrumented prisma client for the query-count assertion.
      const instrumented = new PrismaClient({
        datasources: { db: { url: dbUrl } },
        log: [{ emit: 'event', level: 'query' }],
      });
      let bindingQueryCount = 0;
      // @ts-expect-error — query event types are loose in older Prisma versions
      instrumented.$on('query', (e: { query: string }) => {
        if (/SiteSupervisorBinding/i.test(e.query)) {
          bindingQueryCount += 1;
        }
      });

      try {
        const result = await withTenantContext(instrumented, co.id, async (tx) => {
          return getSitesSupervisedByUser(tx, { companyId: co.id, userId: sup });
        });
        expect(result.length).toBe(5);
        // Two SELECTs against SiteSupervisorBinding:
        //   (A) own-bindings effective-at-T
        //   (B) all bindings (any user) effective-at-T for those siteIds
        // Allow <=2 to account for any prepared-statement chatter Prisma may emit.
        expect(bindingQueryCount).toBeLessThanOrEqual(2);
        expect(bindingQueryCount).toBeGreaterThan(0);
      } finally {
        await instrumented.$disconnect();
      }
    },
  );

  // -------------------------------------------------------------------------
  // Case 22 — Targeted re-run with unknown slug must fail loud
  // -------------------------------------------------------------------------
  it('Case 22: --company <unknown-slug> throws (typo must not silently succeed)', async () => {
    const bogus = `${TEST_PREFIX}does-not-exist-${Date.now()}`;
    await expect(
      runBootstrapSeed({ prisma, companySlug: bogus, reportDir: REPORT_DIR }),
    ).rejects.toThrow(/no ACTIVE company found with slug/);
  });

  // -------------------------------------------------------------------------
  // Case 21 — Inactive company filter
  // -------------------------------------------------------------------------
  it(
    'Case 21: status="SUSPENDED" company is not touched on default run',
    { timeout: 360_000 },
    async () => {
      const coActive = await makeCompany('c21-a');
      const supA = await makeSupervisor(coActive.id, 'A');
      const siteA = await makeSite(coActive.id, 'A');
      await seedComplaints(coActive.id, siteA, supA, 5);

      const coSuspended = await makeCompany('c21-s', { status: 'SUSPENDED' });
      const supS = await makeSupervisor(coSuspended.id, 'S');
      const siteS = await makeSite(coSuspended.id, 'S');
      await seedComplaints(coSuspended.id, siteS, supS, 5);

      const r = await runBootstrapSeed({ prisma, reportDir: REPORT_DIR });

      expect(r.report.companies.some((c) => c.companyId === coActive.id)).toBe(true);
      expect(r.report.companies.some((c) => c.companyId === coSuspended.id)).toBe(false);
      const suspendedBindings = await prisma.siteSupervisorBinding.count({
        where: { companyId: coSuspended.id },
      });
      expect(suspendedBindings).toBe(0);
    },
  );
});
