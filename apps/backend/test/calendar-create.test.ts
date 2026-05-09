/**
 * Real-DB integration test: POST /calendar
 *
 * Exercises:
 *   1. 401 unauth
 *   2. 400 malformed body
 *   3. 400 invalid kind payload (DEMAND missing siteId)
 *   4. happy path: NOTE entry persists + AuditEvent
 *   5. happy path: DEMAND entry with full payload
 *   6. happy path: TENTATIVE_ASSIGNMENT entry — supervisor's "thinking Pradeep" magic moment
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
const TEST_PREFIX = `cal-create-${Date.now()}-`;

let app: FastifyInstance;
let companyId: string;
let supervisorUserId: string;
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
      ownerPhone: '+919900000010',
      ownerName: 'Owner',
    },
  });
  companyId = co.id;

  const sup = await prismaRaw.user.create({
    data: { phone: `+9199${String(Date.now()).slice(-8)}`, name: 'Sup', locale: 'en' },
  });
  supervisorUserId = sup.id;

  await prismaRaw.membership.create({
    data: { companyId, userId: sup.id, role: 'SUPERVISOR', status: 'ACTIVE' },
  });

  const worker = await prismaRaw.worker.create({
    data: {
      companyId,
      name: 'Pradeep',
      phone: `+9188${String(Date.now()).slice(-8)}`,
      state: 'ACTIVE',
    },
  });
  workerId = worker.id;

  const site = await prismaRaw.site.create({
    data: { companyId, name: 'Apollo Hospital' },
  });
  siteId = site.id;

  accessToken = await issueAccessToken({
    userId: sup.id,
    companyId,
    role: 'SUPERVISOR',
    availableRoles: ['SUPERVISOR'],
    locale: 'en',
  });
});

afterAll(async () => {
  await prismaRaw.calendarEntry.deleteMany({ where: { companyId } });
  await prismaRaw.auditEvent.deleteMany({ where: { companyId } });
  await prismaRaw.worker.deleteMany({ where: { companyId } });
  await prismaRaw.site.deleteMany({ where: { companyId } });
  await prismaRaw.membership.deleteMany({ where: { companyId } });
  await prismaRaw.user.deleteMany({ where: { id: supervisorUserId } });
  await prismaRaw.company.delete({ where: { id: companyId } });
  await prismaRaw.$disconnect();
  await app.close();
});

describe('POST /calendar', () => {
  it('401 without auth', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/calendar',
      payload: { kind: 'NOTE', date: '2026-05-12', payload: {}, notes: 'test' },
    });
    expect(r.statusCode).toBe(401);
  });

  it('400 on missing kind', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/calendar',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { date: '2026-05-12', payload: {}, notes: 'test' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('400 on DEMAND without siteId', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/calendar',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { kind: 'DEMAND', date: '2026-05-12', payload: { headcount: 5 }, notes: 'apollo' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('happy path: NOTE entry', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/calendar',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        kind: 'NOTE',
        date: '2026-05-12',
        payload: {},
        notes: 'Diwali Mon — short shifts everywhere',
      },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.id).toBeTruthy();
    expect(body.kind).toBe('NOTE');
    expect(body.editableUntil).toBeTruthy();

    const row = await prismaRaw.calendarEntry.findUnique({ where: { id: body.id } });
    expect(row?.notes).toBe('Diwali Mon — short shifts everywhere');
    const audit = await prismaRaw.auditEvent.findFirst({
      where: { companyId, kind: 'CALENDAR_ENTRY_CREATED', targetId: body.id },
    });
    expect(audit).toBeTruthy();
  });

  it('happy path: DEMAND entry with full payload', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/calendar',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        kind: 'DEMAND',
        date: '2026-05-12',
        payload: { siteId, headcount: 5 },
        notes: 'Apollo needs 5 next Tuesday',
      },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.kind).toBe('DEMAND');
    expect(body.payload).toEqual({ siteId, headcount: 5 });
  });

  it('happy path: TENTATIVE_ASSIGNMENT (vignette 1 magic)', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/calendar',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        kind: 'TENTATIVE_ASSIGNMENT',
        date: '2026-05-12',
        payload: { workerId, siteId, shiftStart: '09:00', shiftEnd: '17:00' },
        notes: 'Thinking Pradeep at Apollo Tuesday',
      },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.kind).toBe('TENTATIVE_ASSIGNMENT');
    expect(body.payload.workerId).toBe(workerId);
  });
});
