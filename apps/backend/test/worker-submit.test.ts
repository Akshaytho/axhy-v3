/**
 * Real-DB integration tests: POST /worker/visits/:visitId/submit
 *                            GET  /worker/visits/:visitId/verify-status
 *
 * Setup creates a Company, Site, Worker (with userId link), Membership, and a
 * Visit pre-seeded in PHOTOS_PENDING state so the submit route can transition
 * it. Teardown deletes all rows in reverse FK order (Company cascade handles
 * VisitPhoto/Visit/Worker children, but explicit deletes are listed for clarity).
 *
 * @derives(master-plan §G)
 * @derives(WORKER_MVP_SLICE_2B_3_PLAN.md §T5)
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

const TEST_PREFIX = `submit-${Date.now()}-`;
const WORKER_PHONE = `+9197${String(Date.now()).slice(-8)}`;
const SUPERVISOR_PHONE = `+9196${String(Date.now()).slice(-8)}`;
const OTHER_WORKER_PHONE = `+9195${String(Date.now()).slice(-8)}`;

let app: FastifyInstance;
let companyId: string;
let workerUserId: string;
let siteId: string;
let workerDbId: string;
let visitId: string;
let otherVisitId: string;
let workerToken: string;
let supervisorToken: string;
let otherWorkerToken: string;

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

  // Company
  const co = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919900000095',
      ownerName: 'Owner Submit',
    },
  });
  companyId = co.id;

  // Site
  const site = await prismaRaw.site.create({
    data: { companyId, name: TEST_PREFIX + 'Site' },
  });
  siteId = site.id;

  // Worker user + membership
  await mintToken(WORKER_PHONE);
  const workerUser = await prismaRaw.user.findUnique({ where: { phone: WORKER_PHONE } });
  if (!workerUser) throw new Error('test setup: worker user not created');
  workerUserId = workerUser.id;
  await prismaRaw.membership.create({ data: { companyId, userId: workerUserId, role: 'WORKER' } });

  // Worker DB row (links to User so ownership checks work)
  const workerDb = await prismaRaw.worker.create({
    data: { companyId, userId: workerUserId, name: 'Test Worker', phone: WORKER_PHONE },
  });
  workerDbId = workerDb.id;

  workerToken = await mintToken(WORKER_PHONE);

  // Supervisor (for wrong-role test)
  await mintToken(SUPERVISOR_PHONE);
  const supervisorUser = await prismaRaw.user.findUnique({ where: { phone: SUPERVISOR_PHONE } });
  if (!supervisorUser) throw new Error('test setup: supervisor user not created');
  await prismaRaw.membership.create({
    data: { companyId, userId: supervisorUser.id, role: 'SUPERVISOR' },
  });
  supervisorToken = await mintToken(SUPERVISOR_PHONE);

  // Other worker (for wrong-worker test)
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

  // Visit in PHOTOS_PENDING for the primary worker
  const visit = await prismaRaw.visit.create({
    data: {
      companyId,
      workerId: workerDbId,
      siteId,
      state: 'PHOTOS_PENDING',
      scheduledFor: new Date(),
    },
  });
  visitId = visit.id;

  // Visit already in IN_PROGRESS (wrong state test)
  const otherVisit = await prismaRaw.visit.create({
    data: {
      companyId,
      workerId: workerDbId,
      siteId,
      state: 'IN_PROGRESS',
      scheduledFor: new Date(),
    },
  });
  otherVisitId = otherVisit.id;
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
  await prismaRaw.company.deleteMany({ where: { id: companyId } });
  await prismaRaw.$disconnect();
  await app.close();
});

const VALID_PHOTOS = [
  { phase: 'before', index: 1, contentType: 'image/jpeg' },
  { phase: 'before', index: 2, contentType: 'image/jpeg' },
  { phase: 'after', index: 1, contentType: 'image/jpeg' },
];

describe('POST /worker/visits/:visitId/submit', () => {
  it('rejects requests without token with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/worker/visits/${visitId}/submit`,
      payload: { photos: VALID_PHOTOS },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects SUPERVISOR with 403 WRONG_ROLE', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/worker/visits/${visitId}/submit`,
      payload: { photos: VALID_PHOTOS },
      headers: { authorization: `Bearer ${supervisorToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { error: string }).error).toBe('WRONG_ROLE');
  });

  it('rejects wrong worker (another worker owns the visit) with 403 WRONG_WORKER', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/worker/visits/${visitId}/submit`,
      payload: { photos: VALID_PHOTOS },
      headers: { authorization: `Bearer ${otherWorkerToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { error: string }).error).toBe('WRONG_WORKER');
  });

  it('rejects visit not in PHOTOS_PENDING with 409 WRONG_STATE', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/worker/visits/${otherVisitId}/submit`,
      payload: { photos: VALID_PHOTOS },
      headers: { authorization: `Bearer ${workerToken}` },
    });
    expect(res.statusCode).toBe(409);
    expect((res.json() as { error: string; currentState: string }).error).toBe('WRONG_STATE');
    expect((res.json() as { currentState: string }).currentState).toBe('IN_PROGRESS');
  });

  it('rejects empty photos array with 400 BAD_INPUT', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/worker/visits/${visitId}/submit`,
      payload: { photos: [] },
      headers: { authorization: `Bearer ${workerToken}` },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe('BAD_INPUT');
  });

  it('accepts valid submit: creates VisitPhoto rows and transitions visit to AWAITING_VERIFICATION', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/worker/visits/${visitId}/submit`,
      payload: { photos: VALID_PHOTOS },
      headers: { authorization: `Bearer ${workerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      visitId: string;
      visitState: string;
      photosBefore: number;
      photosAfter: number;
    };
    expect(body.visitId).toBe(visitId);
    expect(body.visitState).toBe('AWAITING_VERIFICATION');
    expect(body.photosBefore).toBe(2);
    expect(body.photosAfter).toBe(1);

    // Verify rows were actually created in DB
    const photos = await prismaRaw.visitPhoto.findMany({ where: { visitId } });
    expect(photos).toHaveLength(3);
    expect(photos.every((p) => p.aiVerifyStatus === 'PENDING')).toBe(true);
    expect(photos.filter((p) => p.side === 'BEFORE')).toHaveLength(2);
    expect(photos.filter((p) => p.side === 'AFTER')).toHaveLength(1);

    const updated = await prismaRaw.visit.findUnique({
      where: { id: visitId },
      select: { state: true, photosBefore: true, photosAfter: true },
    });
    expect(updated?.state).toBe('AWAITING_VERIFICATION');
    expect(updated?.photosBefore).toBe(2);
    expect(updated?.photosAfter).toBe(1);
  });
});

describe('GET /worker/visits/:visitId/verify-status', () => {
  it('returns visitState + photos with aiVerifyStatus PENDING after submit', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/worker/visits/${visitId}/verify-status`,
      headers: { authorization: `Bearer ${workerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      visitId: string;
      visitState: string;
      photos: Array<{ id: string; side: string; aiVerifyStatus: string }>;
    };
    expect(body.visitId).toBe(visitId);
    expect(body.visitState).toBe('AWAITING_VERIFICATION');
    expect(body.photos).toHaveLength(3);
    expect(body.photos.every((p) => p.aiVerifyStatus === 'PENDING')).toBe(true);
  });
});
