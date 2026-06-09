/**
 * #14 — VisitPhoto insert idempotency. Real-DB lab test.
 *
 * Proves the @@unique([visitId, r2Key]) + createMany skipDuplicates makes photo inserts
 * idempotent across retries: a repeated (visitId, r2Key) is a no-op, a new key inserts.
 *
 * Run on the lab:
 *   cd apps/backend && DATABASE_URL="postgresql://postgres@localhost:5433/postgres" \
 *   npx vitest run test/visitphoto-idempotency.test.ts
 *
 * @derives(PRODUCTION_BUG_LEDGER.md #14)
 */
import crypto from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { prisma } from '../src/lib/prisma.js';

const uid = (): string => crypto.randomUUID();
const sfx = crypto.randomBytes(4).toString('hex');

const companyId = uid();
const siteId = uid();
const workerId = uid();
const visitId = uid();
const r2Key = `caps/${workerId}/${visitId}/before-1-${sfx}.jpg`;

describe('#14 — VisitPhoto idempotent inserts', () => {
  beforeAll(async () => {
    await prisma.company.create({
      data: {
        id: companyId,
        name: `vp-${sfx}`,
        slug: `vp-${sfx}`,
        ownerPhone: `+9198${sfx.slice(0, 4)}`,
        ownerName: 'VP',
      },
    });
    await prisma.site.create({ data: { id: siteId, companyId, name: `vp-site-${sfx}` } });
    await prisma.worker.create({
      data: { id: workerId, companyId, name: `vp-wkr-${sfx}`, phone: `+9197${sfx.slice(0, 4)}` },
    });
    await prisma.visit.create({
      data: { id: visitId, companyId, workerId, siteId, scheduledFor: new Date() },
    });
  });

  afterAll(async () => {
    await prisma.visitPhoto.deleteMany({ where: { companyId } });
    await prisma.visit.deleteMany({ where: { companyId } });
    await prisma.worker.deleteMany({ where: { companyId } });
    await prisma.site.deleteMany({ where: { companyId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.$disconnect();
  });

  it('createMany skipDuplicates collapses an in-batch duplicate (visitId, r2Key) to one row', async () => {
    const row = { companyId, visitId, side: 'BEFORE', r2Key, aiVerifyStatus: 'PENDING' };
    await prisma.visitPhoto.createMany({ data: [row, { ...row }], skipDuplicates: true });
    const count = await prisma.visitPhoto.count({ where: { visitId, r2Key } });
    expect(count).toBe(1);
  });

  it('a retried submit (same key again) adds zero rows; a new key adds one', async () => {
    const retry = { companyId, visitId, side: 'BEFORE', r2Key, aiVerifyStatus: 'PENDING' };
    await prisma.visitPhoto.createMany({ data: [retry], skipDuplicates: true });
    expect(await prisma.visitPhoto.count({ where: { visitId } })).toBe(1);

    const otherKey = `${r2Key}.after`;
    await prisma.visitPhoto.createMany({
      data: [{ companyId, visitId, side: 'AFTER', r2Key: otherKey, aiVerifyStatus: 'PENDING' }],
      skipDuplicates: true,
    });
    expect(await prisma.visitPhoto.count({ where: { visitId } })).toBe(2);
  });
});
