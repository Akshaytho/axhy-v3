/**
 * Real-DB + real-R2 integration / water-flow test: worker capture upload.
 *
 * RCA-A (2026-06-04): the R2 object key MUST embed Worker.id (not User.id) so
 * the presign path matches what worker-submit reconstructs for VisitPhoto.r2Key
 * (buildObjectKey at worker-submit-service.ts:88). This test:
 *   - seeds TWO companies, each with a real Worker row (multi-tenant isolation),
 *   - asserts each worker's presign key is scoped to its OWN Worker.id,
 *   - asserts the key is NOT the User.id (the pre-fix bug),
 *   - asserts a WORKER membership with no Worker row gets 404 (resolution path),
 *   - water-flow: presign objectKey === buildObjectKey(Worker.id, …) — i.e. the
 *     presign path is exactly what submit will look for.
 *
 * Hits Railway Postgres via DATABASE_PUBLIC_URL; R2 assertions run only when the
 * R2_* env vars are present (otherwise the 503 contract is asserted instead).
 *
 * @derives(WORKER_MVP_SLICE_2B_2_PLAN.md §1)
 * @derives(AUDIT-worker-supervisor/06_RCA_AND_FIX_PLAN.md RCA-A)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

import { buildObjectKey } from '../src/lib/r2-presign.js';

import { deleteCompanyDeep } from './_helpers/delete-company-deep.js';

process.env.AXHY_OTP_BYPASS = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const r2Configured =
  Boolean(process.env.R2_ACCOUNT_ID) &&
  Boolean(process.env.R2_ACCESS_KEY_ID) &&
  Boolean(process.env.R2_SECRET_ACCESS_KEY) &&
  Boolean(process.env.R2_BUCKET_NAME);

const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const STAMP = `${Date.now()}`.slice(-9);
const TEST_PREFIX = `captures-${STAMP}-`;
// Distinct phones per principal across two companies.
const PH = {
  workerA: `+9197${STAMP}`,
  workerB: `+9196${STAMP}`,
  supervisorA: `+9195${STAMP}`,
  noRowWorker: `+9194${STAMP}`,
};

let app: FastifyInstance;
let companyA: string;
let companyB: string;
let workerA_userId: string;
let workerA_workerId: string; // Worker.id — the correct key root
let workerB_workerId: string;
let workerAToken: string;
let workerBToken: string;
let supervisorToken: string;
let noRowWorkerToken: string;

async function mintToken(phone: string): Promise<string> {
  await app.inject({ method: 'POST', url: '/auth/otp/request', payload: { phone } });
  const verify = await app.inject({
    method: 'POST',
    url: '/auth/otp/verify',
    payload: { phone, code: '123456' },
  });
  return (verify.json() as { accessToken: string }).accessToken;
}

async function userIdFor(phone: string): Promise<string> {
  const u = await prismaRaw.user.findUnique({ where: { phone } });
  if (!u) throw new Error(`test setup: user ${phone} not created`);
  return u.id;
}

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  app = await buildServer();
  await app.ready();

  const coA = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'CoA',
      slug: TEST_PREFIX + 'coa',
      ownerPhone: '+919900000094',
      ownerName: 'Owner A',
    },
  });
  const coB = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'CoB',
      slug: TEST_PREFIX + 'cob',
      ownerPhone: '+919900000095',
      ownerName: 'Owner B',
    },
  });
  companyA = coA.id;
  companyB = coB.id;

  // Worker A (company A) — full: User + Membership + Worker row
  await mintToken(PH.workerA);
  workerA_userId = await userIdFor(PH.workerA);
  await prismaRaw.membership.create({
    data: { companyId: companyA, userId: workerA_userId, role: 'WORKER' },
  });
  const wA = await prismaRaw.worker.create({
    data: {
      companyId: companyA,
      userId: workerA_userId,
      name: 'Worker A',
      phone: PH.workerA,
      state: 'ACTIVE',
    },
  });
  workerA_workerId = wA.id;
  workerAToken = await mintToken(PH.workerA);

  // Worker B (company B) — full, different tenant
  await mintToken(PH.workerB);
  const workerB_userId = await userIdFor(PH.workerB);
  await prismaRaw.membership.create({
    data: { companyId: companyB, userId: workerB_userId, role: 'WORKER' },
  });
  const wB = await prismaRaw.worker.create({
    data: {
      companyId: companyB,
      userId: workerB_userId,
      name: 'Worker B',
      phone: PH.workerB,
      state: 'ACTIVE',
    },
  });
  workerB_workerId = wB.id;
  workerBToken = await mintToken(PH.workerB);

  // Supervisor A — for role negative test
  await mintToken(PH.supervisorA);
  const supId = await userIdFor(PH.supervisorA);
  await prismaRaw.membership.create({
    data: { companyId: companyA, userId: supId, role: 'SUPERVISOR' },
  });
  supervisorToken = await mintToken(PH.supervisorA);

  // WORKER membership with NO Worker row — must 404 (resolution path)
  await mintToken(PH.noRowWorker);
  const nrId = await userIdFor(PH.noRowWorker);
  await prismaRaw.membership.create({
    data: { companyId: companyA, userId: nrId, role: 'WORKER' },
  });
  noRowWorkerToken = await mintToken(PH.noRowWorker);
}, 120_000);

afterAll(async () => {
  const phones = Object.values(PH);
  await prismaRaw.worker.deleteMany({ where: { companyId: { in: [companyA, companyB] } } });
  await prismaRaw.membership.deleteMany({ where: { companyId: { in: [companyA, companyB] } } });
  await prismaRaw.user.deleteMany({ where: { phone: { in: phones } } });
  await prismaRaw.$executeRawUnsafe(
    `DELETE FROM axhy.otp_attempts WHERE phone = ANY($1::text[])`,
    phones,
  );
  await deleteCompanyDeep(prismaRaw, { ids: [companyA, companyB] });
  await prismaRaw.$disconnect();
  await app.close();
});

const VISIT_ID = 'visit-test-12345';
const VALID_BODY = {
  visitId: VISIT_ID,
  files: [
    { phase: 'before', index: 1, contentType: 'image/jpeg', fileSize: 500_000 },
    { phase: 'before', index: 2, contentType: 'image/jpeg', fileSize: 500_000 },
    { phase: 'before', index: 3, contentType: 'image/jpeg', fileSize: 500_000 },
  ],
};

describe('POST /worker/captures/upload-urls — auth + validation', () => {
  it('rejects unauth requests with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/worker/captures/upload-urls',
      payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects SUPERVISOR with 403 WRONG_ROLE', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/worker/captures/upload-urls',
      payload: VALID_BODY,
      headers: { authorization: `Bearer ${supervisorToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { error: string }).error).toBe('WRONG_ROLE');
  });

  it('rejects bad input (missing visitId) with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/worker/captures/upload-urls',
      payload: { files: VALID_BODY.files },
      headers: { authorization: `Bearer ${workerAToken}` },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe('BAD_INPUT');
  });

  it('WORKER membership with NO Worker row → 404 WORKER_NOT_FOUND (RCA-A resolution path)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/worker/captures/upload-urls',
      payload: VALID_BODY,
      headers: { authorization: `Bearer ${noRowWorkerToken}` },
    });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: string }).error).toBe('WORKER_NOT_FOUND');
  });
});

describe.skipIf(!r2Configured)(
  'POST /worker/captures/upload-urls — R2 key uses Worker.id (RCA-A)',
  () => {
    it('keys photos under Worker.id, NOT User.id, and matches buildObjectKey (presign == submit path)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/worker/captures/upload-urls',
        payload: VALID_BODY,
        headers: { authorization: `Bearer ${workerAToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        urls: Array<{ phase: string; index: number; objectKey: string; uploadUrl: string }>;
      };
      expect(body.urls).toHaveLength(3);
      for (const entry of body.urls) {
        // (1) keyed by Worker.id — the actual fix
        expect(entry.objectKey).toMatch(
          new RegExp(`^v3-captures/${workerA_workerId}/${VISIT_ID}/`),
        );
        // (2) NOT keyed by User.id — the pre-fix bug must be gone
        expect(entry.objectKey).not.toContain(workerA_userId);
        // (3) water-flow: presign key === what worker-submit reconstructs
        const expected = buildObjectKey(workerA_workerId, VISIT_ID, {
          phase: entry.phase as 'before' | 'after',
          index: entry.index,
          contentType: 'image/jpeg',
        });
        expect(entry.objectKey).toBe(expected);
        expect(entry.uploadUrl).toMatch(/r2\.cloudflarestorage\.com/);
      }
    });

    it('multi-tenant isolation: company B worker keys under its OWN Worker.id', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/worker/captures/upload-urls',
        payload: VALID_BODY,
        headers: { authorization: `Bearer ${workerBToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { urls: Array<{ objectKey: string }> };
      for (const entry of body.urls) {
        expect(entry.objectKey).toMatch(new RegExp(`^v3-captures/${workerB_workerId}/`));
        // never leaks company A's worker namespace
        expect(entry.objectKey).not.toContain(workerA_workerId);
      }
    });
  },
);

describe.skipIf(r2Configured)(
  'POST /worker/captures/upload-urls — 503 when R2 unconfigured',
  () => {
    it('returns 503 R2_NOT_CONFIGURED (Worker row exists so it reaches the R2 check)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/worker/captures/upload-urls',
        payload: VALID_BODY,
        headers: { authorization: `Bearer ${workerAToken}` },
      });
      expect(res.statusCode).toBe(503);
      expect((res.json() as { error: string }).error).toBe('R2_NOT_CONFIGURED');
    });
  },
);
