/**
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
const TEST_PREFIX = `assn-create-${Date.now()}-`;

let app: FastifyInstance;
let companyId: string;
let workerId: string;
let siteId: string;
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
      ownerPhone: '+919900000060',
      ownerName: 'O',
    },
  });
  companyId = co.id;
  const sup = await prismaRaw.user.create({
    data: { phone: `+9199${String(Date.now()).slice(-8)}`, name: 'S', locale: 'en' },
  });
  await prismaRaw.membership.create({
    data: { companyId, userId: sup.id, role: 'SUPERVISOR', status: 'ACTIVE' },
  });
  const w = await prismaRaw.worker.create({
    data: {
      companyId,
      name: 'Pradeep',
      state: 'ACTIVE',
      phone: `+9199${String(Date.now() + 1).slice(-8)}`,
    },
  });
  workerId = w.id;
  const s = await prismaRaw.site.create({ data: { companyId, name: 'Apollo' } });
  siteId = s.id;

  accessToken = await issueAccessToken({
    userId: sup.id,
    companyId,
    role: 'SUPERVISOR',
    availableRoles: ['SUPERVISOR'],
    locale: 'en',
  });
});

afterAll(async () => {
  await prismaRaw.assignment.deleteMany({ where: { companyId } });
  await prismaRaw.auditEvent.deleteMany({ where: { companyId } });
  await prismaRaw.worker.deleteMany({ where: { companyId } });
  await prismaRaw.site.deleteMany({ where: { companyId } });
  await prismaRaw.membership.deleteMany({ where: { companyId } });
  await prismaRaw.company.delete({ where: { id: companyId } });
  await prismaRaw.$disconnect();
  await app.close();
});

describe('POST /assignments', () => {
  it('401 without auth', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/assignments',
      payload: {
        workerId,
        siteId,
        dayMask: 'MTWTFS_',
        shiftStart: '09:00',
        shiftEnd: '17:00',
        validFrom: '2026-05-12',
      },
    });
    expect(r.statusCode).toBe(401);
  });

  it('400 on bad dayMask', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/assignments',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        workerId,
        siteId,
        dayMask: 'invalid',
        shiftStart: '09:00',
        shiftEnd: '17:00',
        validFrom: '2026-05-12',
      },
    });
    expect(r.statusCode).toBe(400);
  });

  it('happy path: recurring assignment', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/assignments',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        workerId,
        siteId,
        dayMask: 'MTWTFS_',
        shiftStart: '09:00',
        shiftEnd: '17:00',
        validFrom: '2026-05-12',
      },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.id).toBeTruthy();
    expect(body.state).toBe('DRAFT');

    const audit = await prismaRaw.auditEvent.findFirst({
      where: { companyId, kind: 'ASSIGNMENT_CREATED', targetId: body.id },
    });
    expect(audit).toBeTruthy();
  });

  it('happy path: oneOffDate shorthand expands to single-day Tuesday', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/assignments',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        workerId,
        siteId,
        oneOffDate: '2026-05-12',
        shiftStart: '09:00',
        shiftEnd: '17:00',
      },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.dayMask).toBe('_T_____'); // Tuesday
    expect(body.validFrom).toBe('2026-05-12');
    expect(body.validUntil).toBe('2026-05-12');
  });
});
