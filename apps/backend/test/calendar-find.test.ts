/**
 * Real-DB integration test: GET /calendar?supervisorId&from&to
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
const TEST_PREFIX = `cal-find-${Date.now()}-`;

let app: FastifyInstance;
let companyId: string;
let supId: string;
let accessToken: string;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  const { issueAccessToken } = await import('../src/lib/jwt.js');
  app = await buildServer();
  await app.ready();

  const co = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919900000040',
      ownerName: 'O',
    },
  });
  companyId = co.id;
  const sup = await prismaRaw.user.create({
    data: { phone: `+9199${String(Date.now()).slice(-8)}`, name: 'S', locale: 'en' },
  });
  supId = sup.id;
  await prismaRaw.membership.create({
    data: { companyId, userId: sup.id, role: 'SUPERVISOR', status: 'ACTIVE' },
  });

  accessToken = await issueAccessToken({
    userId: sup.id,
    companyId,
    role: 'SUPERVISOR',
    availableRoles: ['SUPERVISOR'],
    locale: 'en',
  });

  await prismaRaw.calendarEntry.createMany({
    data: [
      {
        companyId,
        supervisorId: sup.id,
        date: new Date('2026-05-12'),
        kind: 'NOTE',
        payload: {},
        notes: 'in range',
        editableUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      {
        companyId,
        supervisorId: sup.id,
        date: new Date('2026-04-01'),
        kind: 'NOTE',
        payload: {},
        notes: 'before',
        editableUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      {
        companyId,
        supervisorId: sup.id,
        date: new Date('2026-06-30'),
        kind: 'NOTE',
        payload: {},
        notes: 'after',
        editableUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    ],
  });
});

afterAll(async () => {
  await prismaRaw.calendarEntry.deleteMany({ where: { companyId } });
  await prismaRaw.membership.deleteMany({ where: { companyId } });
  await prismaRaw.company.delete({ where: { id: companyId } });
  await prismaRaw.$disconnect();
  await app.close();
});

describe('GET /calendar', () => {
  it('returns only entries within from/to range', async () => {
    const r = await app.inject({
      method: 'GET',
      url: `/calendar?supervisorId=${supId}&from=2026-05-01&to=2026-05-31`,
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.entries.length).toBe(1);
    expect(body.entries[0].notes).toBe('in range');
  });
});
