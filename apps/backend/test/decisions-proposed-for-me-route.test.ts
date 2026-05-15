/**
 * Real-DB integration test: GET /decisions/proposed-for-me.
 *
 * Layer 1 routing slice. Exercises the read-time-routing route end-to-end:
 *   - Worker-targeted kinds (MARK_ABSENT, APPROVE_LEAVE) route via
 *     deriveWorkerPrimarySiteId → getEffectiveBinding.
 *   - Site-targeted kinds (LOG_COMPLAINT) route via getEffectiveBinding directly.
 *   - Unsupported kinds fall back to origin-supervisor (caller sees the row iff
 *     they originated it).
 *   - APPLIED rows (appliedAt set) are never returned.
 *   - Cross-tenant rows are never returned.
 *   - Acting cover takes over from permanent.
 *
 * @derives(supervisor-responsibility-model §5.8 + §5.9 + §7.ii)
 * @derives(panel-2026-05-15) — Layer 1 routing slice
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

process.env.AXHY_OTP_BYPASS = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `dec-route-${Date.now()}-`;

let app: FastifyInstance;
let companyAId: string;
let companyBId: string;
let callerId: string; // The caller (User A)
let actingUserId: string; // Another supervisor that acts
let otherTenantUserId: string;
let hrUserId: string;
let callerToken: string;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  const { issueAccessToken } = await import('../src/lib/jwt.js');
  app = await buildServer();
  await app.ready();

  const a = await prisma.company.create({
    data: {
      name: TEST_PREFIX + 'CoA',
      slug: TEST_PREFIX + 'co-a',
      ownerPhone: '+919999000061',
      ownerName: 'Owner A',
    },
  });
  companyAId = a.id;
  const b = await prisma.company.create({
    data: {
      name: TEST_PREFIX + 'CoB',
      slug: TEST_PREFIX + 'co-b',
      ownerPhone: '+919999000062',
      ownerName: 'Owner B',
    },
  });
  companyBId = b.id;

  const mk = async (name: string, offset: number, cid: string) =>
    (
      await prisma.user.create({
        data: {
          phone: '+919999' + String(Date.now() + offset).slice(-7),
          name,
          locale: 'en',
          companyId: cid,
        },
      })
    ).id;

  callerId = await mk('Caller', 1400, companyAId);
  actingUserId = await mk('Acting User', 1401, companyAId);
  hrUserId = await mk('HR', 1402, companyAId);
  otherTenantUserId = await mk('OtherTenant', 1403, companyBId);

  await prisma.membership.create({
    data: { companyId: companyAId, userId: callerId, role: 'SUPERVISOR' },
  });

  callerToken = issueAccessToken({
    userId: callerId,
    companyId: companyAId,
    role: 'SUPERVISOR',
  });
});

afterAll(async () => {
  await prisma.company.deleteMany({ where: { slug: { startsWith: TEST_PREFIX } } });
  await app.close();
  await prisma.$disconnect();
});

async function seedSiteWithPermanent(
  name: string,
  permUserId: string,
  companyId: string,
): Promise<string> {
  const s = await prisma.site.create({ data: { companyId, name } });
  await prisma.siteSupervisorBinding.create({
    data: {
      companyId,
      siteId: s.id,
      userId: permUserId,
      actingForUserId: null,
      effectiveFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
      effectiveUntil: null,
      reason: 'Permanent',
      createdBy: hrUserId,
    },
  });
  return s.id;
}

async function listDecisions(): Promise<
  Array<{ id: string; kind: string; targetId: string | null }>
> {
  const res = await app.inject({
    method: 'GET',
    url: '/decisions/proposed-for-me',
    headers: { authorization: `Bearer ${callerToken}` },
  });
  expect(res.statusCode).toBe(200);
  return res.json().decisions;
}

describe('GET /decisions/proposed-for-me', () => {
  it('returns MARK_ABSENT DWI when caller is permanent supervisor of the worker primary site', async () => {
    const siteId = await seedSiteWithPermanent('MA-Mine', callerId, companyAId);
    const worker = await prisma.worker.create({
      data: {
        companyId: companyAId,
        name: 'Worker MA',
        phone: '+919999' + String(Date.now() + 500).slice(-7),
      },
    });
    await prisma.assignment.create({
      data: {
        companyId: companyAId,
        workerId: worker.id,
        siteId,
        shiftStart: '09:00',
        shiftEnd: '17:00',
        dayMask: 'MTWTFS_',
        validFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
        validUntil: null,
        state: 'ACTIVE',
      },
    });

    const dwi = await prisma.supervisorDecision.create({
      data: {
        companyId: companyAId,
        supervisorId: actingUserId, // Origin is someone else; routing is by current responsibility
        kind: 'MARK_ABSENT',
        tier: 'OPERATIONAL',
        targetId: worker.id,
        payload: {},
      },
    });

    const decisions = await listDecisions();
    expect(decisions.some((d) => d.id === dwi.id)).toBe(true);
  });

  it('routes the row to the acting cover instead of permanent when acting is in effect', async () => {
    const siteId = await seedSiteWithPermanent('Acting-Cover', callerId, companyAId);
    // Acting cover for the caller — actingUserId now sees, caller does not
    await prisma.siteSupervisorBinding.create({
      data: {
        companyId: companyAId,
        siteId,
        userId: actingUserId,
        actingForUserId: callerId,
        effectiveFrom: new Date(Date.now() - 60_000),
        effectiveUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        reason: 'Caller is on sick leave',
        createdBy: hrUserId,
      },
    });

    const worker = await prisma.worker.create({
      data: {
        companyId: companyAId,
        name: 'Worker AC',
        phone: '+919999' + String(Date.now() + 501).slice(-7),
      },
    });
    await prisma.assignment.create({
      data: {
        companyId: companyAId,
        workerId: worker.id,
        siteId,
        shiftStart: '09:00',
        shiftEnd: '17:00',
        dayMask: 'MTWTFS_',
        validFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
        validUntil: null,
        state: 'ACTIVE',
      },
    });

    const dwi = await prisma.supervisorDecision.create({
      data: {
        companyId: companyAId,
        supervisorId: callerId, // caller is the originator
        kind: 'APPROVE_LEAVE',
        tier: 'OPERATIONAL',
        targetId: worker.id,
        payload: {},
      },
    });

    // Caller should NOT see this DWI — current responsibility routes to actingUserId
    const decisions = await listDecisions();
    expect(decisions.some((d) => d.id === dwi.id)).toBe(false);
  });

  it('returns LOG_COMPLAINT DWI when caller is the effective supervisor of the targeted site', async () => {
    const siteId = await seedSiteWithPermanent('Complaint-Mine', callerId, companyAId);

    const dwi = await prisma.supervisorDecision.create({
      data: {
        companyId: companyAId,
        supervisorId: actingUserId, // origin doesn't matter for site-targeted routing
        kind: 'LOG_COMPLAINT',
        tier: 'NOTE',
        targetId: siteId,
        payload: { text: 'Test complaint' },
      },
    });

    const decisions = await listDecisions();
    expect(decisions.some((d) => d.id === dwi.id)).toBe(true);
  });

  it('falls back to origin-supervisor for unsupported kinds (caller sees iff they originated)', async () => {
    const siteId = await seedSiteWithPermanent('Fallback-OriginMine', callerId, companyAId);
    const _ = siteId;

    const mineByOrigin = await prisma.supervisorDecision.create({
      data: {
        companyId: companyAId,
        supervisorId: callerId, // caller is origin
        kind: 'SOMETHING_UNSUPPORTED',
        tier: 'NOTE',
        targetId: null,
        payload: {},
      },
    });
    const notMineByOrigin = await prisma.supervisorDecision.create({
      data: {
        companyId: companyAId,
        supervisorId: actingUserId, // someone else is origin
        kind: 'SOMETHING_UNSUPPORTED',
        tier: 'NOTE',
        targetId: null,
        payload: {},
      },
    });

    const decisions = await listDecisions();
    expect(decisions.some((d) => d.id === mineByOrigin.id)).toBe(true);
    expect(decisions.some((d) => d.id === notMineByOrigin.id)).toBe(false);
  });

  it('never returns APPLIED rows (appliedAt set)', async () => {
    const siteId = await seedSiteWithPermanent('Applied-Excluded', callerId, companyAId);
    const dwi = await prisma.supervisorDecision.create({
      data: {
        companyId: companyAId,
        supervisorId: callerId,
        kind: 'LOG_COMPLAINT',
        tier: 'NOTE',
        targetId: siteId,
        payload: {},
        appliedAt: new Date(),
      },
    });

    const decisions = await listDecisions();
    expect(decisions.some((d) => d.id === dwi.id)).toBe(false);
  });

  it('never returns cross-tenant rows (multi-tenant isolation)', async () => {
    const siteId = await prisma.site.create({ data: { companyId: companyBId, name: 'B-site' } });
    // Site in CoB. Bind CoB-side to the caller? No — caller is in CoA. The
    // route's withTenantContext + companyId filter must prevent this row.
    await prisma.siteSupervisorBinding.create({
      data: {
        companyId: companyBId,
        siteId: siteId.id,
        userId: callerId, // arbitrary
        actingForUserId: null,
        effectiveFrom: new Date(Date.now() - 60_000),
        effectiveUntil: null,
        reason: 'Cross-tenant',
        createdBy: otherTenantUserId,
      },
    });
    const dwi = await prisma.supervisorDecision.create({
      data: {
        companyId: companyBId,
        supervisorId: callerId, // even if origin matches the caller
        kind: 'LOG_COMPLAINT',
        tier: 'NOTE',
        targetId: siteId.id,
        payload: {},
      },
    });

    const decisions = await listDecisions();
    expect(decisions.some((d) => d.id === dwi.id)).toBe(false);
  });

  it('uses the worker primary-site fallback when no effective-at-T assignment exists', async () => {
    const siteId = await seedSiteWithPermanent('Fallback-PrimarySite', callerId, companyAId);
    const worker = await prisma.worker.create({
      data: {
        companyId: companyAId,
        name: 'Worker Fallback',
        phone: '+919999' + String(Date.now() + 502).slice(-7),
      },
    });
    // Assignment ended 10 days ago — Tier 1 misses, Tier 2 returns it
    await prisma.assignment.create({
      data: {
        companyId: companyAId,
        workerId: worker.id,
        siteId,
        shiftStart: '09:00',
        shiftEnd: '17:00',
        dayMask: 'MTWTFS_',
        validFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        validUntil: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        state: 'ACTIVE',
      },
    });

    const dwi = await prisma.supervisorDecision.create({
      data: {
        companyId: companyAId,
        supervisorId: actingUserId,
        kind: 'MARK_ABSENT',
        tier: 'OPERATIONAL',
        targetId: worker.id,
        payload: {},
      },
    });

    const decisions = await listDecisions();
    expect(decisions.some((d) => d.id === dwi.id)).toBe(true);
  });
});
