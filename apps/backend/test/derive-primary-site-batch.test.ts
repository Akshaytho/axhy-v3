/**
 * #15 — deriveWorkerPrimarySiteIdsBatch is behaviour-preserving (Tier-1 in lockstep).
 *
 * The batch collapses the per-row N+1 worker→primary-site derivation in
 * decisions-service into one query. It must return EXACTLY the Tier-1 result of
 * the per-row deriveWorkerPrimarySiteId, and OMIT workers with no Tier-1 hit so
 * the caller falls back to the full per-row tiers 2/3.
 *
 *   - W1: ACTIVE assignment valid now (Tier 1) → batch returns W1→site, matching
 *     the per-row helper.
 *   - W2: ACTIVE assignment whose validUntil is in the PAST (not Tier-1 now) →
 *     batch OMITS W2; the per-row helper still resolves it via Tier 2
 *     ("most-recent ACTIVE regardless of validity"). Proves the fallback contract.
 *
 * Run on the lab:
 *   cd apps/backend && DATABASE_URL="postgresql://postgres@localhost:5433/postgres" \
 *   npx vitest run test/derive-primary-site-batch.test.ts
 *
 * @derives(PRODUCTION_BUG_LEDGER.md #15)
 */
import crypto from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  deriveWorkerPrimarySiteId,
  deriveWorkerPrimarySiteIdsBatch,
} from '../src/lib/effective-responsibility.js';
import { prisma } from '../src/lib/prisma.js';

const DAY = 86_400_000;
const companyId = crypto.randomUUID();
const siteId = crypto.randomUUID();
const w1 = crypto.randomUUID(); // Tier-1 (valid now)
const w2 = crypto.randomUUID(); // only a past-expired ACTIVE assignment (Tier 2)
const sfx = crypto.randomBytes(4).toString('hex');
const now = new Date();

describe('#15 — deriveWorkerPrimarySiteIdsBatch matches Tier-1, omits non-Tier-1', () => {
  beforeAll(async () => {
    await prisma.company.create({
      data: {
        id: companyId,
        name: `b-${sfx}`,
        slug: `b-${sfx}`,
        ownerPhone: `+9181${sfx.slice(0, 4)}`,
        ownerName: 'B',
      },
    });
    await prisma.site.create({
      data: { id: siteId, companyId, name: `S-${sfx}`, state: 'ACTIVE' },
    });
    await prisma.worker.create({
      data: { id: w1, companyId, name: `w1-${sfx}`, phone: `+9182${sfx.slice(0, 4)}` },
    });
    await prisma.worker.create({
      data: { id: w2, companyId, name: `w2-${sfx}`, phone: `+9183${sfx.slice(0, 4)}` },
    });

    const base = {
      companyId,
      siteId,
      shiftStart: '09:00',
      shiftEnd: '17:00',
      dayMask: 'MTWTFS_',
      state: 'ACTIVE',
    };
    // W1 — valid now (Tier 1).
    await prisma.assignment.create({
      data: {
        ...base,
        workerId: w1,
        validFrom: new Date(now.getTime() - 5 * DAY),
        validUntil: null,
      },
    });
    // W2 — ACTIVE but window ended 2 days ago (NOT Tier-1 now; resolvable via Tier 2).
    await prisma.assignment.create({
      data: {
        ...base,
        workerId: w2,
        validFrom: new Date(now.getTime() - 20 * DAY),
        validUntil: new Date(now.getTime() - 2 * DAY),
      },
    });
  });

  afterAll(async () => {
    await prisma.assignment.deleteMany({ where: { companyId } });
    await prisma.worker.deleteMany({ where: { companyId } });
    await prisma.site.deleteMany({ where: { companyId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.$disconnect();
  });

  it('batch returns the Tier-1 worker and matches the per-row helper', async () => {
    const batch = await deriveWorkerPrimarySiteIdsBatch(prisma, {
      companyId,
      workerIds: [w1, w2],
      at: now,
    });
    expect(batch.get(w1)).toBe(siteId);
    // Matches the authoritative per-row derivation for the Tier-1 worker.
    expect(await deriveWorkerPrimarySiteId(prisma, { companyId, workerId: w1, at: now })).toBe(
      siteId,
    );
  });

  it('batch OMITS the non-Tier-1 worker, but the per-row helper still resolves it (Tier 2 fallback)', async () => {
    const batch = await deriveWorkerPrimarySiteIdsBatch(prisma, {
      companyId,
      workerIds: [w1, w2],
      at: now,
    });
    expect(batch.has(w2)).toBe(false); // omitted → caller falls back
    // Full per-row derivation still finds it via Tier 2 (most-recent ACTIVE).
    expect(await deriveWorkerPrimarySiteId(prisma, { companyId, workerId: w2, at: now })).toBe(
      siteId,
    );
  });

  it('empty input returns an empty map (no query)', async () => {
    const batch = await deriveWorkerPrimarySiteIdsBatch(prisma, {
      companyId,
      workerIds: [],
      at: now,
    });
    expect(batch.size).toBe(0);
  });
});
