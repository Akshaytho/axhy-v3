/**
 * Real-DB integration test: GET /sites/:siteId/effective-supervisor.
 *
 * Layer 1 routing slice. Exercises the route end-to-end through buildServer
 * (HTTP via Fastify inject), not just the helper. Multi-tenant + point-in-time
 * + future-dated cutover covered.
 *
 * @derives(supervisor-responsibility-model §5.5 + §5.8)
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

const TEST_PREFIX = `sites-eff-${Date.now()}-`;

let app: FastifyInstance;
let companyAId: string;
let companyBId: string;
let userAId: string;
let userBId: string;
let hrUserId: string;
let accessToken: string;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  const { issueAccessToken } = await import('../src/lib/jwt.js');
  app = await buildServer();
  await app.ready();

  const a = await prisma.company.create({
    data: {
      name: TEST_PREFIX + 'CoA',
      slug: TEST_PREFIX + 'co-a',
      ownerPhone: '+919999000051',
      ownerName: 'Owner A',
    },
  });
  companyAId = a.id;
  const b = await prisma.company.create({
    data: {
      name: TEST_PREFIX + 'CoB',
      slug: TEST_PREFIX + 'co-b',
      ownerPhone: '+919999000052',
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

  userAId = await mk('User A', 1300, companyAId);
  userBId = await mk('User B', 1301, companyAId);
  hrUserId = await mk('HR', 1302, companyAId);

  // Membership for the caller (User A is the caller)
  await prisma.membership.create({
    data: { companyId: companyAId, userId: userAId, role: 'SUPERVISOR' },
  });

  accessToken = await issueAccessToken({
    userId: userAId,
    companyId: companyAId,
    role: 'SUPERVISOR',
    availableRoles: ['SUPERVISOR'],
    locale: 'en',
  });
});

afterAll(async () => {
  await prisma.company.deleteMany({ where: { slug: { startsWith: TEST_PREFIX } } });
  await app.close();
  await prisma.$disconnect();
});

async function freshSite(name: string, companyId: string): Promise<string> {
  const s = await prisma.site.create({ data: { companyId, name } });
  return s.id;
}

describe('GET /sites/:siteId/effective-supervisor', () => {
  it('returns 200 with the currently-effective permanent binding', async () => {
    const siteId = await freshSite('Eff-Route-Perm', companyAId);
    await prisma.siteSupervisorBinding.create({
      data: {
        companyId: companyAId,
        siteId,
        userId: userAId,
        actingForUserId: null,
        effectiveFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
        effectiveUntil: null,
        reason: 'Permanent',
        createdBy: hrUserId,
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/sites/${siteId}/effective-supervisor`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.kind).toBe('PERMANENT');
    expect(body.userId).toBe(userAId);
    expect(body.actingForUserId).toBeNull();
  });

  it('returns historical attribution when ?at points at a past moment', async () => {
    const siteId = await freshSite('Eff-Route-Historical', companyAId);
    const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const cutover = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

    // Old bounded permanent (past .. cutover)
    await prisma.siteSupervisorBinding.create({
      data: {
        companyId: companyAId,
        siteId,
        userId: userAId,
        actingForUserId: null,
        effectiveFrom: past,
        effectiveUntil: cutover,
        reason: 'Old permanent',
        createdBy: hrUserId,
      },
    });
    // New permanent (cutover .. open)
    await prisma.siteSupervisorBinding.create({
      data: {
        companyId: companyAId,
        siteId,
        userId: userBId,
        actingForUserId: null,
        effectiveFrom: cutover,
        effectiveUntil: null,
        reason: 'New permanent',
        createdBy: hrUserId,
      },
    });

    // Query a moment inside the old window
    const inOldWindow = new Date(past.getTime() + 60_000);
    const res = await app.inject({
      method: 'GET',
      url: `/sites/${siteId}/effective-supervisor?at=${encodeURIComponent(inOldWindow.toISOString())}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().userId).toBe(userAId);

    // Query a moment after cutover
    const afterCutover = new Date(cutover.getTime() + 60_000);
    const res2 = await app.inject({
      method: 'GET',
      url: `/sites/${siteId}/effective-supervisor?at=${encodeURIComponent(afterCutover.toISOString())}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.json().userId).toBe(userBId);
  });

  it('returns post-cutover binding when ?at is in the future of a scheduled handoff', async () => {
    const siteId = await freshSite('Eff-Route-Future', companyAId);
    const cutover = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.siteSupervisorBinding.create({
      data: {
        companyId: companyAId,
        siteId,
        userId: userAId,
        actingForUserId: null,
        effectiveFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
        effectiveUntil: cutover,
        reason: 'Old',
        createdBy: hrUserId,
      },
    });
    await prisma.siteSupervisorBinding.create({
      data: {
        companyId: companyAId,
        siteId,
        userId: userBId,
        actingForUserId: null,
        effectiveFrom: cutover,
        effectiveUntil: null,
        reason: 'New',
        createdBy: hrUserId,
      },
    });

    const future = new Date(cutover.getTime() + 60_000);
    const res = await app.inject({
      method: 'GET',
      url: `/sites/${siteId}/effective-supervisor?at=${encodeURIComponent(future.toISOString())}`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().userId).toBe(userBId);
  });

  it('returns 404 NO_EFFECTIVE_BINDING when site has no binding at the requested instant', async () => {
    const siteId = await freshSite('Eff-Route-NoBinding', companyAId);
    const res = await app.inject({
      method: 'GET',
      url: `/sites/${siteId}/effective-supervisor`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('NO_EFFECTIVE_BINDING');
  });

  it('returns 404 SITE_NOT_FOUND for a cross-tenant siteId (no info leak)', async () => {
    const otherSite = await freshSite('Other-Tenant-Site', companyBId);
    // Even if a binding existed in CoB, caller is in CoA — should be 404
    await prisma.siteSupervisorBinding.create({
      data: {
        companyId: companyBId,
        siteId: otherSite,
        userId: userAId, // arbitrary; cross-tenant
        actingForUserId: null,
        effectiveFrom: new Date(Date.now() - 60_000),
        effectiveUntil: null,
        reason: 'Cross-tenant',
        createdBy: hrUserId,
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/sites/${otherSite}/effective-supervisor`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('SITE_NOT_FOUND');
  });
});
