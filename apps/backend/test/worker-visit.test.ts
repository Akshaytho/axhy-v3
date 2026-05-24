/**
 * Real-DB integration: GET /worker/visits/:id.
 *
 * Covers:
 *   1. happy path — worker fetches own visit → 200 with detail + supervisorPhone
 *   2. cross-worker — worker A fetches worker B's visit → 403 FORBIDDEN
 *   3. not found — random UUID → 404
 *   4. wrong role — SUPERVISOR token fetches a visit → 403 WRONG_ROLE
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
const TEST_PREFIX = `wv-${Date.now()}-`;
const WORKER_A_PHONE = `+9193${String(Date.now()).slice(-8)}`;
const WORKER_B_PHONE = `+9192${String(Date.now()).slice(-8)}`;
const SUPERVISOR_PHONE = `+9191${String(Date.now()).slice(-8)}`;

let app: FastifyInstance;
let companyId: string;
let workerAUserId: string;
let workerAId: string;
let workerBUserId: string;
let workerBId: string;
let supervisorUserId: string;
let siteId: string;
let workerAVisitId: string;
let workerBVisitId: string;
let workerAToken: string;
let supervisorToken: string;

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
      ownerName: 'Owner WV',
    },
  });
  companyId = co.id;

  // Worker A
  const wuA = await prismaRaw.user.create({ data: { phone: WORKER_A_PHONE, locale: 'en' } });
  workerAUserId = wuA.id;
  await prismaRaw.membership.create({
    data: { companyId: co.id, userId: wuA.id, role: 'WORKER' },
  });
  const wkrA = await prismaRaw.worker.create({
    data: {
      companyId: co.id,
      userId: wuA.id,
      name: 'Worker A',
      phone: WORKER_A_PHONE,
      state: 'ACTIVE',
    },
  });
  workerAId = wkrA.id;

  // Worker B (for cross-worker test)
  const wuB = await prismaRaw.user.create({ data: { phone: WORKER_B_PHONE, locale: 'en' } });
  workerBUserId = wuB.id;
  await prismaRaw.membership.create({
    data: { companyId: co.id, userId: wuB.id, role: 'WORKER' },
  });
  const wkrB = await prismaRaw.worker.create({
    data: {
      companyId: co.id,
      userId: wuB.id,
      name: 'Worker B',
      phone: WORKER_B_PHONE,
      state: 'ACTIVE',
    },
  });
  workerBId = wkrB.id;

  // Supervisor (for wrong-role test + for the binding)
  const su = await prismaRaw.user.create({
    data: { phone: SUPERVISOR_PHONE, locale: 'en', name: 'Supervisor WV' },
  });
  supervisorUserId = su.id;
  await prismaRaw.membership.create({
    data: { companyId: co.id, userId: su.id, role: 'SUPERVISOR' },
  });

  const site = await prismaRaw.site.create({
    data: { companyId: co.id, name: 'Lulu Mall WV', address: '202 Brigade Road' },
  });
  siteId = site.id;

  await prismaRaw.assignment.create({
    data: {
      companyId: co.id,
      workerId: wkrA.id,
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
      reason: 'Test bind WV',
      createdBy: su.id,
    },
  });

  // Visits — one per worker
  const visitA = await prismaRaw.visit.create({
    data: {
      companyId: co.id,
      workerId: wkrA.id,
      siteId: site.id,
      scheduledFor: new Date(),
      state: 'SCHEDULED',
    },
  });
  workerAVisitId = visitA.id;
  const visitB = await prismaRaw.visit.create({
    data: {
      companyId: co.id,
      workerId: wkrB.id,
      siteId: site.id,
      scheduledFor: new Date(),
      state: 'SCHEDULED',
    },
  });
  workerBVisitId = visitB.id;

  workerAToken = await issueAccessToken({
    userId: wuA.id,
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
}, 90_000);

afterAll(async () => {
  await prismaRaw.visit.deleteMany({ where: { companyId } }).catch(() => undefined);
  await prismaRaw.assignment.deleteMany({ where: { companyId } }).catch(() => undefined);
  await prismaRaw.siteSupervisorBinding.deleteMany({ where: { companyId } }).catch(() => undefined);
  await prismaRaw.worker.deleteMany({ where: { companyId } }).catch(() => undefined);
  await prismaRaw.site.deleteMany({ where: { companyId } }).catch(() => undefined);
  await prismaRaw.membership.deleteMany({ where: { companyId } }).catch(() => undefined);
  for (const uid of [workerAUserId, workerBUserId, supervisorUserId]) {
    if (uid) await prismaRaw.user.deleteMany({ where: { id: uid } }).catch(() => undefined);
  }
  await prismaRaw.company.deleteMany({ where: { id: companyId } }).catch(() => undefined);
  await prismaRaw.$disconnect();
  await app.close();
});

describe('GET /worker/visits/:id', () => {
  it('returns 200 visit detail with supervisorPhone when worker fetches own visit', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/worker/visits/${workerAVisitId}`,
      headers: { authorization: `Bearer ${workerAToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      id: string;
      workerId: string;
      siteName: string;
      siteAddress: string | null;
      state: string;
      supervisorPhone: string | null;
    };
    expect(body.id).toBe(workerAVisitId);
    expect(body.workerId).toBe(workerAId);
    expect(body.siteName).toBe('Lulu Mall WV');
    expect(body.siteAddress).toBe('202 Brigade Road');
    expect(body.state).toBe('SCHEDULED');
    expect(body.supervisorPhone).toBe(SUPERVISOR_PHONE);
  });

  it('returns 403 FORBIDDEN when worker A tries to fetch worker B visit', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/worker/visits/${workerBVisitId}`,
      headers: { authorization: `Bearer ${workerAToken}` },
    });
    expect(res.statusCode).toBe(403);
    const body = res.json() as { error: string };
    expect(body.error).toBe('FORBIDDEN');
  });

  it('returns 404 for non-existent visit id', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await app.inject({
      method: 'GET',
      url: `/worker/visits/${fakeId}`,
      headers: { authorization: `Bearer ${workerAToken}` },
    });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { error: string };
    expect(body.error).toBe('VISIT_NOT_FOUND');
  });

  it('returns 403 WRONG_ROLE when SUPERVISOR tries to fetch a worker visit', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/worker/visits/${workerAVisitId}`,
      headers: { authorization: `Bearer ${supervisorToken}` },
    });
    expect(res.statusCode).toBe(403);
    const body = res.json() as { error: string };
    expect(body.error).toBe('WRONG_ROLE');
  });
});

describe.skipIf(!process.env.REDIS_URL)('GET /worker/visits/:id — per-user rate limit', () => {
  it('returns 429 RATE_LIMITED + Retry-After header after exhausting the per-user budget', async () => {
    const { getRedis } = await import('../src/lib/redis.js');
    const { RedisKeys } = await import('../src/lib/redis-keys.js');
    await getRedis().del(RedisKeys.rateLimit('worker:visit', workerAUserId));

    const envKey = 'RATE_LIMIT_WORKER_VISIT_PER_MIN';
    const prev = process.env[envKey];
    process.env[envKey] = '2';
    try {
      for (let i = 0; i < 2; i++) {
        const ok = await app.inject({
          method: 'GET',
          url: `/worker/visits/${workerAVisitId}`,
          headers: { authorization: `Bearer ${workerAToken}` },
        });
        expect(ok.statusCode).not.toBe(429);
      }
      const limited = await app.inject({
        method: 'GET',
        url: `/worker/visits/${workerAVisitId}`,
        headers: { authorization: `Bearer ${workerAToken}` },
      });
      expect(limited.statusCode).toBe(429);
      const body = limited.json() as { error: string; retryAfterMs: number };
      expect(body.error).toBe('RATE_LIMITED');
      expect(body.retryAfterMs).toBeGreaterThan(0);
      expect(limited.headers['retry-after']).toBeDefined();
    } finally {
      if (prev === undefined) delete process.env[envKey];
      else process.env[envKey] = prev;
    }
  });
});
