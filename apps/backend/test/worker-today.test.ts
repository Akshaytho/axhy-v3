/**
 * Real-DB integration: GET /worker/today.
 *
 * Covers:
 *   1. happy path — 2 today-visits + supervisor binding → 200 with both visits ordered by scheduledFor + supervisorPhone
 *   2. empty day — no visits today → 200, visits=[], resumeCapture=null
 *   3. no supervisor binding — site has no effective binding → 200, supervisorPhone=null
 *   4. wrong role — SUPERVISOR token → 403 WRONG_ROLE
 *
 * @derives(WORKER_MVP_SLICE_2A_PLAN.md §1 + §6)
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
const TEST_PREFIX = `wt-${Date.now()}-`;
const WORKER_PHONE = `+9196${String(Date.now()).slice(-8)}`;
const SUPERVISOR_PHONE = `+9195${String(Date.now()).slice(-8)}`;
const NO_BINDING_WORKER_PHONE = `+9194${String(Date.now()).slice(-8)}`;

let app: FastifyInstance;
let companyId: string;
let workerUserId: string;
let workerId: string;
let supervisorUserId: string;
let siteId: string;
let workerToken: string;
let supervisorToken: string;

// Second worker (no supervisor binding) — for the no-binding test
let noBindingCompanyId: string;
let noBindingWorkerId: string;
let noBindingUserId: string;
let noBindingToken: string;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  const { issueAccessToken } = await import('../src/lib/jwt.js');
  app = await buildServer();
  await app.ready();

  // Primary company with supervisor binding
  const co = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919900000091',
      ownerName: 'Owner WT',
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
      name: 'Worker WT',
      phone: WORKER_PHONE,
      state: 'ACTIVE',
    },
  });
  workerId = wkr.id;

  const su = await prismaRaw.user.create({
    data: { phone: SUPERVISOR_PHONE, locale: 'en', name: 'Supervisor WT' },
  });
  supervisorUserId = su.id;
  await prismaRaw.membership.create({
    data: { companyId: co.id, userId: su.id, role: 'SUPERVISOR' },
  });

  const site = await prismaRaw.site.create({
    data: { companyId: co.id, name: 'Phoenix Mall WT', address: '101 MG Road' },
  });
  siteId = site.id;

  await prismaRaw.assignment.create({
    data: {
      companyId: co.id,
      workerId: wkr.id,
      siteId: site.id,
      shiftStart: '09:00',
      shiftEnd: '11:00',
      dayMask: 'MTWTFS_',
      validFrom: new Date(),
      state: 'ACTIVE',
    },
  });

  await prismaRaw.siteSupervisorBinding.create({
    data: {
      companyId: co.id,
      siteId: site.id,
      userId: su.id,
      effectiveFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
      reason: 'Test bind',
      createdBy: su.id,
    },
  });

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

  // Second company / worker without any SiteSupervisorBinding
  const noBindCo = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'NoBindCo',
      slug: TEST_PREFIX + 'nobindco',
      ownerPhone: '+919900000092',
      ownerName: 'Owner NB',
    },
  });
  noBindingCompanyId = noBindCo.id;
  const nbu = await prismaRaw.user.create({
    data: { phone: NO_BINDING_WORKER_PHONE, locale: 'en' },
  });
  noBindingUserId = nbu.id;
  await prismaRaw.membership.create({
    data: { companyId: noBindCo.id, userId: nbu.id, role: 'WORKER' },
  });
  const nbWkr = await prismaRaw.worker.create({
    data: {
      companyId: noBindCo.id,
      userId: nbu.id,
      name: 'Worker NoBind',
      phone: NO_BINDING_WORKER_PHONE,
      state: 'ACTIVE',
    },
  });
  noBindingWorkerId = nbWkr.id;
  noBindingToken = await issueAccessToken({
    userId: nbu.id,
    companyId: noBindCo.id,
    role: 'WORKER',
    availableRoles: ['WORKER'],
    locale: 'en',
  });
}, 90_000);

afterAll(async () => {
  for (const co of [companyId, noBindingCompanyId]) {
    if (!co) continue;
    await prismaRaw.visit.deleteMany({ where: { companyId: co } }).catch(() => undefined);
    await prismaRaw.assignment.deleteMany({ where: { companyId: co } }).catch(() => undefined);
    await prismaRaw.siteSupervisorBinding
      .deleteMany({ where: { companyId: co } })
      .catch(() => undefined);
    await prismaRaw.worker.deleteMany({ where: { companyId: co } }).catch(() => undefined);
    await prismaRaw.site.deleteMany({ where: { companyId: co } }).catch(() => undefined);
    await prismaRaw.membership.deleteMany({ where: { companyId: co } }).catch(() => undefined);
  }
  for (const uid of [workerUserId, supervisorUserId, noBindingUserId]) {
    if (uid) await prismaRaw.user.deleteMany({ where: { id: uid } }).catch(() => undefined);
  }
  for (const co of [companyId, noBindingCompanyId]) {
    if (!co) continue;
    await prismaRaw.company.deleteMany({ where: { id: co } }).catch(() => undefined);
  }
  await prismaRaw.$disconnect();
  await app.close();
});

function todayAt(hour: number, minute = 0): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

describe('GET /worker/today', () => {
  it('returns 2 today-visits in scheduledFor order + supervisorPhone from binding', async () => {
    const v1 = await prismaRaw.visit.create({
      data: {
        companyId,
        workerId,
        siteId,
        scheduledFor: todayAt(9),
        state: 'SCHEDULED',
        photosBefore: 0,
        photosAfter: 0,
      },
    });
    const v2 = await prismaRaw.visit.create({
      data: {
        companyId,
        workerId,
        siteId,
        scheduledFor: todayAt(14),
        state: 'SCHEDULED',
        photosBefore: 0,
        photosAfter: 0,
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/worker/today',
      headers: { authorization: `Bearer ${workerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      workerId: string;
      visits: Array<{ id: string; state: string; scheduledFor: string; siteName: string }>;
      supervisorPhone: string | null;
      resumeCapture: unknown;
    };
    expect(body.workerId).toBe(workerId);
    expect(body.visits).toHaveLength(2);
    expect(body.visits[0]?.id).toBe(v1.id);
    expect(body.visits[1]?.id).toBe(v2.id);
    expect(body.visits[0]?.siteName).toBe('Phoenix Mall WT');
    expect(body.supervisorPhone).toBe(SUPERVISOR_PHONE);
    expect(body.resumeCapture).toBeNull();

    await prismaRaw.visit.deleteMany({ where: { id: { in: [v1.id, v2.id] } } });
  });

  it('returns 200 with empty visits when worker has no visits today', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/worker/today',
      headers: { authorization: `Bearer ${workerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { visits: unknown[]; resumeCapture: unknown };
    expect(body.visits).toHaveLength(0);
    expect(body.resumeCapture).toBeNull();
  });

  it('returns supervisorPhone=null when worker has no effective binding', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/worker/today',
      headers: { authorization: `Bearer ${noBindingToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { supervisorPhone: string | null; workerId: string };
    expect(body.workerId).toBe(noBindingWorkerId);
    expect(body.supervisorPhone).toBeNull();
  });

  it('returns 403 WRONG_ROLE when called with a SUPERVISOR token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/worker/today',
      headers: { authorization: `Bearer ${supervisorToken}` },
    });
    expect(res.statusCode).toBe(403);
    const body = res.json() as { error: string };
    expect(body.error).toBe('WRONG_ROLE');
  });
});
