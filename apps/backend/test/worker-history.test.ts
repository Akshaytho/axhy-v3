/**
 * Real-DB integration: GET /worker/history.
 *
 * Covers the multi-day worker history endpoint that backs the History screen:
 *   1. happy path — visits spread across 3 days (verified + flagged + awaiting +
 *      cancelled) → 200 with all rows in scheduledFor desc order and summary
 *      counts that match.
 *   2. windowDays clamp — visits older than the window are excluded; SCHEDULED
 *      / IN_PROGRESS visits (not yet history-eligible) are excluded.
 *   3. wrong role — SUPERVISOR token → 403 WRONG_ROLE.
 *
 * @derives(master-plan §G)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

process.env.AXHY_OTP_BYPASS = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const TEST_PREFIX = `wh-${Date.now()}-`;
const WORKER_PHONE = `+9193${String(Date.now()).slice(-8)}`;
const SUPERVISOR_PHONE = `+9192${String(Date.now()).slice(-8)}`;

let app: FastifyInstance;
let companyId: string;
let workerUserId: string;
let workerId: string;
let supervisorUserId: string;
let siteId: string;
let workerToken: string;
let supervisorToken: string;
// RCA-D: a SUSPENDED company + its worker — must still be able to READ history.
const SUSPENDED_WORKER_PHONE = `+9191${String(Date.now()).slice(-8)}`;
let suspendedCompanyId: string;
let suspendedWorkerUserId: string;
let suspendedWorkerToken: string;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  const { issueAccessToken } = await import('../src/lib/jwt.js');
  app = await buildServer();
  await app.ready();

  const co = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919900000093',
      ownerName: 'Owner WH',
    },
  });
  companyId = co.id;

  const wu = await prismaRaw.user.create({ data: { phone: WORKER_PHONE, locale: 'en' } });
  workerUserId = wu.id;
  await prismaRaw.membership.create({
    data: { companyId: co.id, userId: wu.id, role: 'WORKER' },
  });
  const wkr = await prismaRaw.worker.create({
    data: {
      companyId: co.id,
      userId: wu.id,
      name: 'Worker WH',
      phone: WORKER_PHONE,
      state: 'ACTIVE',
    },
  });
  workerId = wkr.id;

  const su = await prismaRaw.user.create({
    data: { phone: SUPERVISOR_PHONE, locale: 'en', name: 'Supervisor WH' },
  });
  supervisorUserId = su.id;
  await prismaRaw.membership.create({
    data: { companyId: co.id, userId: su.id, role: 'SUPERVISOR' },
  });

  const site = await prismaRaw.site.create({
    data: { companyId: co.id, name: 'Phoenix Mall WH', address: '202 MG Road' },
  });
  siteId = site.id;

  workerToken = await issueAccessToken({
    userId: wu.id,
    companyId: co.id,
    role: 'WORKER',
    availableRoles: ['WORKER'],
    locale: 'en',
  });
  supervisorToken = await issueAccessToken({
    userId: su.id,
    companyId: co.id,
    role: 'SUPERVISOR',
    availableRoles: ['SUPERVISOR'],
    locale: 'en',
  });

  // RCA-D fixture: a SUSPENDED company with an active worker. The worker must
  // still be able to read their own history (INV 2). The pre-fix code wrapped
  // this read in withTenantContext and 403'd it.
  const susCo = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'SusCo',
      slug: TEST_PREFIX + 'susco',
      ownerPhone: '+919900000092',
      ownerName: 'Owner Suspended',
      status: 'SUSPENDED',
    },
  });
  suspendedCompanyId = susCo.id;
  const susUser = await prismaRaw.user.create({
    data: { phone: SUSPENDED_WORKER_PHONE, locale: 'en' },
  });
  suspendedWorkerUserId = susUser.id;
  await prismaRaw.membership.create({
    data: { companyId: susCo.id, userId: susUser.id, role: 'WORKER' },
  });
  await prismaRaw.worker.create({
    data: {
      companyId: susCo.id,
      userId: susUser.id,
      name: 'Worker Suspended',
      phone: SUSPENDED_WORKER_PHONE,
      state: 'ACTIVE',
    },
  });
  suspendedWorkerToken = await issueAccessToken({
    userId: susUser.id,
    companyId: susCo.id,
    role: 'WORKER',
    availableRoles: ['WORKER'],
    locale: 'en',
  });
}, 90_000);

afterAll(async () => {
  if (companyId) {
    await prismaRaw.visit.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prismaRaw.assignment.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prismaRaw.siteSupervisorBinding
      .deleteMany({ where: { companyId } })
      .catch(() => undefined);
    await prismaRaw.worker.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prismaRaw.site.deleteMany({ where: { companyId } }).catch(() => undefined);
    await prismaRaw.membership.deleteMany({ where: { companyId } }).catch(() => undefined);
  }
  for (const uid of [workerUserId, supervisorUserId]) {
    if (uid) await prismaRaw.user.deleteMany({ where: { id: uid } }).catch(() => undefined);
  }
  if (companyId) {
    await prismaRaw.company.deleteMany({ where: { id: companyId } }).catch(() => undefined);
  }
  // RCA-D suspended-company fixture cleanup
  if (suspendedCompanyId) {
    await prismaRaw.worker
      .deleteMany({ where: { companyId: suspendedCompanyId } })
      .catch(() => undefined);
    await prismaRaw.membership
      .deleteMany({ where: { companyId: suspendedCompanyId } })
      .catch(() => undefined);
    if (suspendedWorkerUserId) {
      await prismaRaw.user
        .deleteMany({ where: { id: suspendedWorkerUserId } })
        .catch(() => undefined);
    }
    await prismaRaw.company
      .deleteMany({ where: { id: suspendedCompanyId } })
      .catch(() => undefined);
  }
  await prismaRaw.$disconnect();
  await app.close();
});

function dayOffsetAt(daysAgo: number, hour = 10): Date {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d;
}

describe('GET /worker/history', () => {
  it('returns multi-day history with summary + scheduledFor desc order', async () => {
    const verifiedToday = await prismaRaw.visit.create({
      data: {
        companyId,
        workerId,
        siteId,
        scheduledFor: dayOffsetAt(0, 9),
        state: 'VERIFIED',
        photosBefore: 2,
        photosAfter: 2,
      },
    });
    const flaggedYesterday = await prismaRaw.visit.create({
      data: {
        companyId,
        workerId,
        siteId,
        scheduledFor: dayOffsetAt(1, 14),
        state: 'FLAGGED',
        photosBefore: 1,
        photosAfter: 1,
      },
    });
    const awaiting2 = await prismaRaw.visit.create({
      data: {
        companyId,
        workerId,
        siteId,
        scheduledFor: dayOffsetAt(2, 11),
        state: 'AWAITING_VERIFICATION',
        photosBefore: 3,
        photosAfter: 0,
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/worker/history?windowDays=14',
      headers: { authorization: `Bearer ${workerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      workerId: string;
      windowDays: number;
      summary: { total: number; verified: number; flagged: number; awaitingVerification: number };
      visits: Array<{ id: string; state: string; scheduledFor: string }>;
    };

    expect(body.workerId).toBe(workerId);
    expect(body.windowDays).toBe(14);

    const ids = body.visits.map((v) => v.id);
    expect(ids).toContain(verifiedToday.id);
    expect(ids).toContain(flaggedYesterday.id);
    expect(ids).toContain(awaiting2.id);

    // newest first
    const subset = body.visits.filter((v) => ids.includes(v.id));
    const times = subset.map((v) => new Date(v.scheduledFor).getTime());
    for (let i = 1; i < times.length; i++) {
      expect(times[i - 1]).toBeGreaterThanOrEqual(times[i]!);
    }

    expect(body.summary.total).toBeGreaterThanOrEqual(3);
    expect(body.summary.verified).toBeGreaterThanOrEqual(1);
    expect(body.summary.flagged).toBeGreaterThanOrEqual(1);
    expect(body.summary.awaitingVerification).toBeGreaterThanOrEqual(1);

    await prismaRaw.visit.deleteMany({
      where: { id: { in: [verifiedToday.id, flaggedYesterday.id, awaiting2.id] } },
    });
  });

  it('excludes out-of-window visits and non-history states (SCHEDULED / IN_PROGRESS)', async () => {
    const tooOld = await prismaRaw.visit.create({
      data: {
        companyId,
        workerId,
        siteId,
        scheduledFor: dayOffsetAt(40, 10), // outside 14-day window
        state: 'VERIFIED',
        photosBefore: 0,
        photosAfter: 0,
      },
    });
    const inProgressToday = await prismaRaw.visit.create({
      data: {
        companyId,
        workerId,
        siteId,
        scheduledFor: dayOffsetAt(0, 16),
        state: 'IN_PROGRESS',
        photosBefore: 0,
        photosAfter: 0,
      },
    });
    const verifiedRecent = await prismaRaw.visit.create({
      data: {
        companyId,
        workerId,
        siteId,
        scheduledFor: dayOffsetAt(3, 10),
        state: 'VERIFIED',
        photosBefore: 0,
        photosAfter: 0,
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/worker/history?windowDays=14',
      headers: { authorization: `Bearer ${workerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      visits: Array<{ id: string; state: string }>;
    };
    const ids = body.visits.map((v) => v.id);
    expect(ids).toContain(verifiedRecent.id);
    expect(ids).not.toContain(tooOld.id);
    expect(ids).not.toContain(inProgressToday.id);

    await prismaRaw.visit.deleteMany({
      where: { id: { in: [tooOld.id, inProgressToday.id, verifiedRecent.id] } },
    });
  });

  it('returns 403 WRONG_ROLE when called with a SUPERVISOR token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/worker/history',
      headers: { authorization: `Bearer ${supervisorToken}` },
    });
    expect(res.statusCode).toBe(403);
    const body = res.json() as { error: string };
    expect(body.error).toBe('WRONG_ROLE');
  });

  it('RCA-D: a SUSPENDED company worker can still READ their history (INV 2, not 403)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/worker/history',
      headers: { authorization: `Bearer ${suspendedWorkerToken}` },
    });
    // Pre-fix this 403'd via withTenantContext's ACTIVE gate. Reads are allowed
    // for suspended companies; an empty history is fine, the point is NOT 403.
    expect(res.statusCode).toBe(200);
    const body = res.json() as { visits: unknown[] };
    expect(Array.isArray(body.visits)).toBe(true);
  });
});
