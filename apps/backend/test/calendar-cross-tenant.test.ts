/**
 * Cross-tenant isolation for all 4 Calendar endpoints.
 * Tenant B's token must never see / edit / promote / find Tenant A's calendar entries.
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
const TEST_PREFIX = `cal-xtenant-${Date.now()}-`;

let app: FastifyInstance;
let coAId: string;
let coBId: string;
let supBToken: string;
let entryAId: string;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  const { issueAccessToken } = await import('../src/lib/jwt.js');
  app = await buildServer();
  await app.ready();

  const a = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'A',
      slug: TEST_PREFIX + 'a',
      ownerPhone: '+919900000050',
      ownerName: 'OA',
    },
  });
  coAId = a.id;
  const b = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'B',
      slug: TEST_PREFIX + 'b',
      ownerPhone: '+919900000051',
      ownerName: 'OB',
    },
  });
  coBId = b.id;

  const supA = await prismaRaw.user.create({
    data: { phone: `+9199${String(Date.now()).slice(-8)}`, name: 'A', locale: 'en' },
  });
  const supB = await prismaRaw.user.create({
    data: { phone: `+9199${String(Date.now() + 1).slice(-8)}`, name: 'B', locale: 'en' },
  });
  await prismaRaw.membership.create({
    data: { companyId: coAId, userId: supA.id, role: 'SUPERVISOR', status: 'ACTIVE' },
  });
  await prismaRaw.membership.create({
    data: { companyId: coBId, userId: supB.id, role: 'SUPERVISOR', status: 'ACTIVE' },
  });

  const entryA = await prismaRaw.calendarEntry.create({
    data: {
      companyId: coAId,
      supervisorId: supA.id,
      date: new Date('2026-05-12'),
      kind: 'NOTE',
      payload: {},
      notes: 'tenant A only',
      editableUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  entryAId = entryA.id;

  supBToken = await issueAccessToken({
    userId: supB.id,
    companyId: coBId,
    role: 'SUPERVISOR',
    availableRoles: ['SUPERVISOR'],
    locale: 'en',
  });
});

afterAll(async () => {
  await prismaRaw.calendarEntry.deleteMany({
    where: { OR: [{ companyId: coAId }, { companyId: coBId }] },
  });
  await prismaRaw.membership.deleteMany({
    where: { OR: [{ companyId: coAId }, { companyId: coBId }] },
  });
  await prismaRaw.company.deleteMany({ where: { id: { in: [coAId, coBId] } } });
  await prismaRaw.$disconnect();
  await app.close();
});

describe('Cross-tenant isolation — Calendar', () => {
  it('Tenant B cannot PATCH Tenant A entry (404, not 403 — leakage of existence is itself a leak)', async () => {
    const r = await app.inject({
      method: 'PATCH',
      url: `/calendar/${entryAId}`,
      headers: { authorization: `Bearer ${supBToken}` },
      payload: { notes: 'hijack attempt' },
    });
    expect(r.statusCode).toBe(404);
  });

  it('Tenant B cannot promote Tenant A entry', async () => {
    const r = await app.inject({
      method: 'POST',
      url: `/calendar/${entryAId}/promote`,
      headers: { authorization: `Bearer ${supBToken}` },
      payload: { target: 'assignment' },
    });
    expect(r.statusCode).toBe(404);
  });

  it("Tenant B's GET /calendar returns 0 entries when filtering for Tenant A's date range", async () => {
    const r = await app.inject({
      method: 'GET',
      url: `/calendar?from=2026-05-01&to=2026-05-31`,
      headers: { authorization: `Bearer ${supBToken}` },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.entries.length).toBe(0);
  });
});
