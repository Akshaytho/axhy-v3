/**
 * Real-DB integration test: GET /supervisor/context
 *
 * Exercises:
 *   1. Empty portfolio (supervisor with 0 bindings) → `{ sitesActive: 0, workersActive: 0 }`.
 *   2. Happy path: supervisor with 2 sites + 4 workers (2 per site), all ACTIVE
 *      → `{ sitesActive: 2, workersActive: 4 }`.
 *   3. Cross-supervisor isolation: supervisor A's portfolio is hidden from
 *      supervisor B's count.
 *
 * Runs against real Railway Postgres sandbox; each scenario uses distinct
 * supervisors + sites so they do not interfere.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { SupervisorContext } from '@axhy/shared-schema';

process.env.AXHY_OTP_BYPASS = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `sup-ctx-${Date.now()}-`;

// Distinct phone suffixes per actor — Date.now() base + index keeps them unique
// even across re-runs.
const phone = (suffix: number) => `+9199${String(Date.now() + suffix).slice(-8)}`;

let app: FastifyInstance;
let companyId: string;

// Scenario 1 — empty portfolio
let emptySupToken: string;

// Scenario 2 — happy path (2 sites, 4 workers)
let happySupToken: string;

// Scenario 3 — cross-supervisor isolation
let crossSupAToken: string;
let crossSupBToken: string;

// Track user ids for afterAll cleanup
const allUserIds: string[] = [];

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

  // ───────── Scenario 1: empty portfolio ─────────
  const emptySup = await prismaRaw.user.create({
    data: { phone: phone(1), name: 'Sup Empty', locale: 'en' },
  });
  allUserIds.push(emptySup.id);
  await prismaRaw.membership.create({
    data: { companyId, userId: emptySup.id, role: 'SUPERVISOR' },
  });
  emptySupToken = await issue(emptySup.id);

  // ───────── Scenario 2: happy path — 2 sites, 4 workers ─────────
  const happySup = await prismaRaw.user.create({
    data: { phone: phone(2), name: 'Sup Happy', locale: 'en' },
  });
  allUserIds.push(happySup.id);
  await prismaRaw.membership.create({
    data: { companyId, userId: happySup.id, role: 'SUPERVISOR' },
  });
  happySupToken = await issue(happySup.id);

  const happySiteOne = await prismaRaw.site.create({
    data: { companyId, name: TEST_PREFIX + 'Happy-1', state: 'ACTIVE' },
  });
  const happySiteTwo = await prismaRaw.site.create({
    data: { companyId, name: TEST_PREFIX + 'Happy-2', state: 'ACTIVE' },
  });

  for (const siteId of [happySiteOne.id, happySiteTwo.id]) {
    await prismaRaw.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId,
        userId: happySup.id,
        effectiveFrom: new Date('2026-01-01'),
        reason: 'test seed — happy path PERMANENT',
        createdBy: happySup.id,
      },
    });
  }

  // 4 workers: 2 per site, each with an ACTIVE assignment valid now.
  for (let i = 0; i < 4; i++) {
    const siteId = i < 2 ? happySiteOne.id : happySiteTwo.id;
    const w = await prismaRaw.worker.create({
      data: {
        companyId,
        name: `Happy Worker ${i + 1}`,
        phone: phone(10 + i),
        state: 'ACTIVE',
        baseSalaryPaise: 1300000,
      },
    });
    await prismaRaw.assignment.create({
      data: {
        companyId,
        workerId: w.id,
        siteId,
        shiftStart: '09:00',
        shiftEnd: '18:00',
        dayMask: 'MTWTFSS',
        validFrom: new Date('2026-01-01'),
        state: 'ACTIVE',
      },
    });
  }

  // ───────── Scenario 3: cross-supervisor isolation ─────────
  const crossSupA = await prismaRaw.user.create({
    data: { phone: phone(30), name: 'Sup A Cross', locale: 'en' },
  });
  allUserIds.push(crossSupA.id);
  await prismaRaw.membership.create({
    data: { companyId, userId: crossSupA.id, role: 'SUPERVISOR' },
  });
  crossSupAToken = await issue(crossSupA.id);

  const crossSupB = await prismaRaw.user.create({
    data: { phone: phone(31), name: 'Sup B Cross', locale: 'en' },
  });
  allUserIds.push(crossSupB.id);
  await prismaRaw.membership.create({
    data: { companyId, userId: crossSupB.id, role: 'SUPERVISOR' },
  });
  crossSupBToken = await issue(crossSupB.id);

  // SupA gets 1 site with 2 workers; SupB gets 1 site with 1 worker.
  const crossSiteA = await prismaRaw.site.create({
    data: { companyId, name: TEST_PREFIX + 'CrossA', state: 'ACTIVE' },
  });
  const crossSiteB = await prismaRaw.site.create({
    data: { companyId, name: TEST_PREFIX + 'CrossB', state: 'ACTIVE' },
  });

  await prismaRaw.siteSupervisorBinding.create({
    data: {
      companyId,
      siteId: crossSiteA.id,
      userId: crossSupA.id,
      effectiveFrom: new Date('2026-01-01'),
      reason: 'cross-A PERMANENT',
      createdBy: crossSupA.id,
    },
  });
  await prismaRaw.siteSupervisorBinding.create({
    data: {
      companyId,
      siteId: crossSiteB.id,
      userId: crossSupB.id,
      effectiveFrom: new Date('2026-01-01'),
      reason: 'cross-B PERMANENT',
      createdBy: crossSupB.id,
    },
  });

  // 2 workers on SupA's site
  for (let i = 0; i < 2; i++) {
    const w = await prismaRaw.worker.create({
      data: {
        companyId,
        name: `Cross-A Worker ${i + 1}`,
        phone: phone(40 + i),
        state: 'ACTIVE',
        baseSalaryPaise: 1300000,
      },
    });
    await prismaRaw.assignment.create({
      data: {
        companyId,
        workerId: w.id,
        siteId: crossSiteA.id,
        shiftStart: '09:00',
        shiftEnd: '18:00',
        dayMask: 'MTWTFSS',
        validFrom: new Date('2026-01-01'),
        state: 'ACTIVE',
      },
    });
  }

  // 1 worker on SupB's site
  const wB = await prismaRaw.worker.create({
    data: {
      companyId,
      name: 'Cross-B Worker 1',
      phone: phone(42),
      state: 'ACTIVE',
      baseSalaryPaise: 1300000,
    },
  });
  await prismaRaw.assignment.create({
    data: {
      companyId,
      workerId: wB.id,
      siteId: crossSiteB.id,
      shiftStart: '09:00',
      shiftEnd: '18:00',
      dayMask: 'MTWTFSS',
      validFrom: new Date('2026-01-01'),
      state: 'ACTIVE',
    },
  });
});

afterAll(async () => {
  await app.close();
  await prismaRaw.siteSupervisorBinding.deleteMany({ where: { companyId } });
  await prismaRaw.assignment.deleteMany({ where: { companyId } });
  await prismaRaw.worker.deleteMany({ where: { companyId } });
  await prismaRaw.site.deleteMany({ where: { companyId } });
  await prismaRaw.membership.deleteMany({ where: { companyId } });
  await prismaRaw.user.deleteMany({ where: { id: { in: allUserIds } } });
  await prismaRaw.company.delete({ where: { id: companyId } });
  await prismaRaw.$disconnect();
});

function get(url: string, token?: string) {
  const headers: Record<string, string> = token ? { authorization: `Bearer ${token}` } : {};
  return app.inject({ method: 'GET', url, headers });
}

describe('GET /supervisor/context', () => {
  it('empty portfolio: supervisor with 0 bindings returns { sitesActive: 0, workersActive: 0 }', async () => {
    const res = await get('/supervisor/context', emptySupToken);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const parsed = SupervisorContext.safeParse(body);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toEqual({ sitesActive: 0, workersActive: 0 });
  });

  it('happy path: supervisor with 2 sites + 4 workers returns { sitesActive: 2, workersActive: 4 }', async () => {
    const res = await get('/supervisor/context', happySupToken);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    const parsed = SupervisorContext.safeParse(body);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toEqual({ sitesActive: 2, workersActive: 4 });
  });

  it('cross-supervisor isolation: SupA sees 1 site / 2 workers; SupB sees 1 site / 1 worker', async () => {
    const aRes = await get('/supervisor/context', crossSupAToken);
    expect(aRes.statusCode).toBe(200);
    const aParsed = SupervisorContext.parse(aRes.json());
    expect(aParsed.sitesActive).toBe(1);
    expect(aParsed.workersActive).toBe(2);

    const bRes = await get('/supervisor/context', crossSupBToken);
    expect(bRes.statusCode).toBe(200);
    const bParsed = SupervisorContext.parse(bRes.json());
    expect(bParsed.sitesActive).toBe(1);
    expect(bParsed.workersActive).toBe(1);
  });
});
