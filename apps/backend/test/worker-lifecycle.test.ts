/**
 * Real-DB integration tests: POST /worker/visits/:visitId/clock-in
 *                            POST /worker/visits/:visitId/clock-out
 *
 * Ensures worker-owned lifecycle transitions are honest:
 * - state changes happen only from legal source states
 * - startedAt / completedAt are persisted
 * - idempotent retries preserve the original timestamps
 * - cross-worker and wrong-role access is rejected
 *
 * @derives(master-plan §G)
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

import { deleteCompanyDeep } from './_helpers/delete-company-deep.js';

process.env.AXHY_OTP_BYPASS = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `lifecycle-${Date.now()}-`;
const WORKER_PHONE = `+9194${String(Date.now()).slice(-8)}`;
const SUPERVISOR_PHONE = `+9193${String(Date.now()).slice(-8)}`;
const OTHER_WORKER_PHONE = `+9192${String(Date.now()).slice(-8)}`;

let app: FastifyInstance;
let companyId: string;
let workerUserId: string;
let siteId: string;
let workerDbId: string;
let workerToken: string;
let supervisorToken: string;
let otherWorkerToken: string;

let scheduledVisitId: string;
let inProgressVisitId: string;
let clockOutVisitId: string;
let pendingVisitId: string;
let terminalVisitId: string;

const seededStartedAt = new Date('2026-06-03T04:30:00.000Z');
const seededCompletedAt = new Date('2026-06-03T05:15:00.000Z');

async function mintToken(phone: string): Promise<string> {
  await app.inject({ method: 'POST', url: '/auth/otp/request', payload: { phone } });
  const verify = await app.inject({
    method: 'POST',
    url: '/auth/otp/verify',
    payload: { phone, code: '123456' },
  });
  return (verify.json() as { accessToken: string }).accessToken;
}

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  app = await buildServer();
  await app.ready();

  const co = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919900000094',
      ownerName: 'Owner Lifecycle',
    },
  });
  companyId = co.id;

  const site = await prismaRaw.site.create({
    data: { companyId, name: TEST_PREFIX + 'Site' },
  });
  siteId = site.id;

  await mintToken(WORKER_PHONE);
  const workerUser = await prismaRaw.user.findUnique({ where: { phone: WORKER_PHONE } });
  if (!workerUser) throw new Error('test setup: worker user not created');
  workerUserId = workerUser.id;
  await prismaRaw.membership.create({ data: { companyId, userId: workerUserId, role: 'WORKER' } });
  const workerDb = await prismaRaw.worker.create({
    data: { companyId, userId: workerUserId, name: 'Lifecycle Worker', phone: WORKER_PHONE },
  });
  workerDbId = workerDb.id;
  workerToken = await mintToken(WORKER_PHONE);

  await mintToken(SUPERVISOR_PHONE);
  const supervisorUser = await prismaRaw.user.findUnique({ where: { phone: SUPERVISOR_PHONE } });
  if (!supervisorUser) throw new Error('test setup: supervisor user not created');
  await prismaRaw.membership.create({
    data: { companyId, userId: supervisorUser.id, role: 'SUPERVISOR' },
  });
  supervisorToken = await mintToken(SUPERVISOR_PHONE);

  await mintToken(OTHER_WORKER_PHONE);
  const otherUser = await prismaRaw.user.findUnique({ where: { phone: OTHER_WORKER_PHONE } });
  if (!otherUser) throw new Error('test setup: other worker user not created');
  await prismaRaw.membership.create({
    data: { companyId, userId: otherUser.id, role: 'WORKER' },
  });
  await prismaRaw.worker.create({
    data: { companyId, userId: otherUser.id, name: 'Other Worker', phone: OTHER_WORKER_PHONE },
  });
  otherWorkerToken = await mintToken(OTHER_WORKER_PHONE);

  const scheduledVisit = await prismaRaw.visit.create({
    data: {
      companyId,
      workerId: workerDbId,
      siteId,
      state: 'SCHEDULED',
      scheduledFor: new Date(),
    },
  });
  scheduledVisitId = scheduledVisit.id;

  const inProgressVisit = await prismaRaw.visit.create({
    data: {
      companyId,
      workerId: workerDbId,
      siteId,
      state: 'IN_PROGRESS',
      scheduledFor: new Date(),
      startedAt: seededStartedAt,
    },
  });
  inProgressVisitId = inProgressVisit.id;

  const clockOutVisit = await prismaRaw.visit.create({
    data: {
      companyId,
      workerId: workerDbId,
      siteId,
      state: 'IN_PROGRESS',
      scheduledFor: new Date(),
      startedAt: new Date('2026-06-03T06:00:00.000Z'),
    },
  });
  clockOutVisitId = clockOutVisit.id;

  const pendingVisit = await prismaRaw.visit.create({
    data: {
      companyId,
      workerId: workerDbId,
      siteId,
      state: 'PHOTOS_PENDING',
      scheduledFor: new Date(),
      startedAt: seededStartedAt,
      completedAt: seededCompletedAt,
    },
  });
  pendingVisitId = pendingVisit.id;

  const terminalVisit = await prismaRaw.visit.create({
    data: {
      companyId,
      workerId: workerDbId,
      siteId,
      state: 'VERIFIED',
      scheduledFor: new Date(),
      startedAt: seededStartedAt,
      completedAt: seededCompletedAt,
    },
  });
  terminalVisitId = terminalVisit.id;
}, 120_000);

afterAll(async () => {
  await prismaRaw.visitPhoto.deleteMany({ where: { companyId } });
  await prismaRaw.visit.deleteMany({ where: { companyId } });
  await prismaRaw.worker.deleteMany({ where: { companyId } });
  await prismaRaw.membership.deleteMany({ where: { companyId } });
  await prismaRaw.user.deleteMany({
    where: { phone: { in: [WORKER_PHONE, SUPERVISOR_PHONE, OTHER_WORKER_PHONE] } },
  });
  await prismaRaw.$executeRawUnsafe(
    `DELETE FROM axhy.otp_attempts WHERE phone IN ($1, $2, $3)`,
    WORKER_PHONE,
    SUPERVISOR_PHONE,
    OTHER_WORKER_PHONE,
  );
  await prismaRaw.site.deleteMany({ where: { companyId } });
  await deleteCompanyDeep(prismaRaw, { ids: [companyId] });
  await prismaRaw.$disconnect();
  await app.close();
});

describe('POST /worker/visits/:visitId/clock-in', { timeout: 20_000 }, () => {
  it('rejects requests without token with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/worker/visits/${scheduledVisitId}/clock-in`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects SUPERVISOR with 403 WRONG_ROLE', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/worker/visits/${scheduledVisitId}/clock-in`,
      headers: { authorization: `Bearer ${supervisorToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { error: string }).error).toBe('WRONG_ROLE');
  });

  it('rejects wrong worker with 403 WRONG_WORKER', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/worker/visits/${scheduledVisitId}/clock-in`,
      headers: { authorization: `Bearer ${otherWorkerToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { error: string }).error).toBe('WRONG_WORKER');
  });

  it('transitions SCHEDULED to IN_PROGRESS and persists startedAt', async () => {
    // Park the other seeded IN_PROGRESS visits (inProgressVisitId, clockOutVisitId)
    // so they don't trip Rule A (ACTIVE_TIMER_EXISTS). They are restored in the
    // finally so the downstream idempotent / clock-out tests still see the
    // exact seeded shape.
    const savedIp = await prismaRaw.visit.findUnique({
      where: { id: inProgressVisitId },
      select: { state: true, startedAt: true },
    });
    const savedCo = await prismaRaw.visit.findUnique({
      where: { id: clockOutVisitId },
      select: { state: true, startedAt: true },
    });
    await prismaRaw.visit.update({
      where: { id: inProgressVisitId },
      data: { state: 'ON_SITE' },
    });
    await prismaRaw.visit.update({
      where: { id: clockOutVisitId },
      data: { state: 'ON_SITE' },
    });

    try {
      const before = await prismaRaw.visit.findUnique({
        where: { id: scheduledVisitId },
        select: { startedAt: true },
      });
      expect(before?.startedAt).toBeNull();

      const res = await app.inject({
        method: 'POST',
        url: `/worker/visits/${scheduledVisitId}/clock-in`,
        headers: { authorization: `Bearer ${workerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        visitId: string;
        visitState: string;
        alreadyInProgress: boolean;
      };
      expect(body.visitId).toBe(scheduledVisitId);
      expect(body.visitState).toBe('IN_PROGRESS');
      expect(body.alreadyInProgress).toBe(false);

      const updated = await prismaRaw.visit.findUnique({
        where: { id: scheduledVisitId },
        select: { state: true, startedAt: true },
      });
      expect(updated?.state).toBe('IN_PROGRESS');
      expect(updated?.startedAt).not.toBeNull();
    } finally {
      // Move scheduledVisitId aside too (now it's IN_PROGRESS post-test) so
      // it doesn't itself trip Rule A on the parked visits' restoration or
      // on the new ACTIVE_TIMER_EXISTS test below.
      await prismaRaw.visit.update({
        where: { id: scheduledVisitId },
        data: { state: 'PHOTOS_PENDING', completedAt: new Date() },
      });
      await prismaRaw.visit.update({
        where: { id: inProgressVisitId },
        data: { state: savedIp?.state ?? 'IN_PROGRESS', startedAt: savedIp?.startedAt ?? null },
      });
      await prismaRaw.visit.update({
        where: { id: clockOutVisitId },
        data: { state: savedCo?.state ?? 'IN_PROGRESS', startedAt: savedCo?.startedAt ?? null },
      });
    }
  });

  it('is idempotent for an already IN_PROGRESS visit and preserves startedAt', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/worker/visits/${inProgressVisitId}/clock-in`,
      headers: { authorization: `Bearer ${workerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      visitState: string;
      alreadyInProgress: boolean;
    };
    expect(body.visitState).toBe('IN_PROGRESS');
    expect(body.alreadyInProgress).toBe(true);

    const updated = await prismaRaw.visit.findUnique({
      where: { id: inProgressVisitId },
      select: { state: true, startedAt: true },
    });
    expect(updated?.state).toBe('IN_PROGRESS');
    expect(updated?.startedAt?.toISOString()).toBe(seededStartedAt.toISOString());
  });

  it('rejects terminal states with 409 WRONG_STATE', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/worker/visits/${terminalVisitId}/clock-in`,
      headers: { authorization: `Bearer ${workerToken}` },
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: string }).error).toBe('WRONG_STATE');
  });

  // Rule A — one active timer per worker. The worker already owns at least
  // one IN_PROGRESS visit (inProgressVisitId, seeded), so starting a fresh
  // SCHEDULED visit must be refused. The error body must surface the active
  // visit id so the mobile client can route the worker back to it.
  it('rejects clock-in with 409 ACTIVE_TIMER_EXISTS when another visit is IN_PROGRESS', async () => {
    const otherScheduled = await prismaRaw.visit.create({
      data: {
        companyId,
        workerId: workerDbId,
        siteId,
        state: 'SCHEDULED',
        scheduledFor: new Date(),
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/worker/visits/${otherScheduled.id}/clock-in`,
      headers: { authorization: `Bearer ${workerToken}` },
    });
    expect(res.statusCode).toBe(409);
    const body = res.json() as { error: string; activeVisitId?: string };
    expect(body.error).toBe('ACTIVE_TIMER_EXISTS');
    expect(typeof body.activeVisitId).toBe('string');
    expect(body.activeVisitId).not.toBe(otherScheduled.id);

    // The visit being clocked in must remain SCHEDULED — no write happened.
    const stillScheduled = await prismaRaw.visit.findUnique({
      where: { id: otherScheduled.id },
      select: { state: true, startedAt: true },
    });
    expect(stillScheduled?.state).toBe('SCHEDULED');
    expect(stillScheduled?.startedAt).toBeNull();
  });

  // PHOTOS_PENDING is post-timer; it must not block a fresh clock-in. We use
  // an isolated worker (no IN_PROGRESS visits at all, just a PHOTOS_PENDING
  // one) so we don't perturb the seeded state that downstream clock-out tests
  // depend on.
  it('allows clock-in when the only other in-flight visit is PHOTOS_PENDING', async () => {
    const isoCo = await prismaRaw.company.create({
      data: {
        name: TEST_PREFIX + 'IsoCo',
        slug: TEST_PREFIX + 'iso',
        ownerPhone: '+919900000095',
        ownerName: 'Owner Iso',
      },
    });
    const isoSite = await prismaRaw.site.create({
      data: { companyId: isoCo.id, name: TEST_PREFIX + 'IsoSite' },
    });
    const isoPhone = `+9191${String(Date.now()).slice(-8)}`;
    await mintToken(isoPhone);
    const isoUser = await prismaRaw.user.findUnique({ where: { phone: isoPhone } });
    if (!isoUser) throw new Error('iso worker user missing');
    await prismaRaw.membership.create({
      data: { companyId: isoCo.id, userId: isoUser.id, role: 'WORKER' },
    });
    const isoWorker = await prismaRaw.worker.create({
      data: { companyId: isoCo.id, userId: isoUser.id, name: 'Iso Worker', phone: isoPhone },
    });
    const isoToken = await mintToken(isoPhone);

    try {
      // Seed: a PHOTOS_PENDING visit (post-timer) — must NOT block.
      await prismaRaw.visit.create({
        data: {
          companyId: isoCo.id,
          workerId: isoWorker.id,
          siteId: isoSite.id,
          state: 'PHOTOS_PENDING',
          scheduledFor: new Date(),
          startedAt: new Date(Date.now() - 60_000),
          completedAt: new Date(),
        },
      });

      const fresh = await prismaRaw.visit.create({
        data: {
          companyId: isoCo.id,
          workerId: isoWorker.id,
          siteId: isoSite.id,
          state: 'SCHEDULED',
          scheduledFor: new Date(),
        },
      });

      const res = await app.inject({
        method: 'POST',
        url: `/worker/visits/${fresh.id}/clock-in`,
        headers: { authorization: `Bearer ${isoToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { visitState: string; alreadyInProgress: boolean };
      expect(body.visitState).toBe('IN_PROGRESS');
      expect(body.alreadyInProgress).toBe(false);
    } finally {
      await prismaRaw.visit.deleteMany({ where: { companyId: isoCo.id } });
      await prismaRaw.worker.deleteMany({ where: { companyId: isoCo.id } });
      await prismaRaw.membership.deleteMany({ where: { companyId: isoCo.id } });
      await prismaRaw.user.deleteMany({ where: { id: isoUser.id } });
      await prismaRaw.$executeRawUnsafe(`DELETE FROM axhy.otp_attempts WHERE phone = $1`, isoPhone);
      await prismaRaw.site.deleteMany({ where: { companyId: isoCo.id } });
      await deleteCompanyDeep(prismaRaw, { ids: [isoCo.id] });
    }
  }, 60_000);
});

describe('POST /worker/visits/:visitId/clock-out', { timeout: 20_000 }, () => {
  it('rejects wrong worker with 403 WRONG_WORKER', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/worker/visits/${clockOutVisitId}/clock-out`,
      headers: { authorization: `Bearer ${otherWorkerToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { error: string }).error).toBe('WRONG_WORKER');
  });

  it('transitions IN_PROGRESS to PHOTOS_PENDING and persists completedAt', async () => {
    const before = await prismaRaw.visit.findUnique({
      where: { id: clockOutVisitId },
      select: { completedAt: true, startedAt: true },
    });
    expect(before?.completedAt).toBeNull();
    expect(before?.startedAt).not.toBeNull();

    const res = await app.inject({
      method: 'POST',
      url: `/worker/visits/${clockOutVisitId}/clock-out`,
      headers: { authorization: `Bearer ${workerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      visitId: string;
      visitState: string;
      alreadyPending: boolean;
    };
    expect(body.visitId).toBe(clockOutVisitId);
    expect(body.visitState).toBe('PHOTOS_PENDING');
    expect(body.alreadyPending).toBe(false);

    const updated = await prismaRaw.visit.findUnique({
      where: { id: clockOutVisitId },
      select: { state: true, completedAt: true, startedAt: true },
    });
    expect(updated?.state).toBe('PHOTOS_PENDING');
    expect(updated?.completedAt).not.toBeNull();
    expect(updated?.startedAt?.toISOString()).toBe(before?.startedAt?.toISOString());
  });

  it('is idempotent for an already PHOTOS_PENDING visit and preserves completedAt', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/worker/visits/${pendingVisitId}/clock-out`,
      headers: { authorization: `Bearer ${workerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      visitState: string;
      alreadyPending: boolean;
    };
    expect(body.visitState).toBe('PHOTOS_PENDING');
    expect(body.alreadyPending).toBe(true);

    const updated = await prismaRaw.visit.findUnique({
      where: { id: pendingVisitId },
      select: { state: true, completedAt: true },
    });
    expect(updated?.state).toBe('PHOTOS_PENDING');
    expect(updated?.completedAt?.toISOString()).toBe(seededCompletedAt.toISOString());
  });

  it('rejects terminal states with 409 WRONG_STATE', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/worker/visits/${terminalVisitId}/clock-out`,
      headers: { authorization: `Bearer ${workerToken}` },
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: string }).error).toBe('WRONG_STATE');
  });
});
