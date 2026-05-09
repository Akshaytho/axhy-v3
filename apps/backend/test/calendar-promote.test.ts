/**
 * Real-DB integration test: POST /calendar/:id/promote
 *
 * Vignette 5 from Vision Narrative: AI's "lock in" moment.
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
const TEST_PREFIX = `cal-promote-${Date.now()}-`;

let app: FastifyInstance;
let companyId: string;
let supId: string;
let accessToken: string;
let workerId: string;
let siteId: string;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  const { issueAccessToken } = await import('../src/lib/jwt.js');
  app = await buildServer();
  await app.ready();

  const co = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919900000030',
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
  await prismaRaw.calendarEntry.deleteMany({ where: { companyId } });
  await prismaRaw.auditEvent.deleteMany({ where: { companyId } });
  await prismaRaw.worker.deleteMany({ where: { companyId } });
  await prismaRaw.site.deleteMany({ where: { companyId } });
  await prismaRaw.membership.deleteMany({ where: { companyId } });
  await prismaRaw.company.delete({ where: { id: companyId } });
  await prismaRaw.$disconnect();
  await app.close();
});

describe('POST /calendar/:id/promote', () => {
  it('happy path: TENTATIVE_ASSIGNMENT → deferred Assignment row', async () => {
    const entry = await prismaRaw.calendarEntry.create({
      data: {
        companyId,
        supervisorId: supId,
        date: new Date('2026-05-12'),
        kind: 'TENTATIVE_ASSIGNMENT',
        payload: { workerId, siteId, shiftStart: '09:00', shiftEnd: '17:00' },
        notes: null,
        editableUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const r = await app.inject({
      method: 'POST',
      url: `/calendar/${entry.id}/promote`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { target: 'assignment' },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.promoted.kind).toBe('ASSIGNMENT');
    expect(body.promoted.id).toBeTruthy();
    expect(body.promoted.deferred).toBe(true);

    const updatedEntry = await prismaRaw.calendarEntry.findUnique({ where: { id: entry.id } });
    expect(updatedEntry?.promotedToKind).toBe('ASSIGNMENT');
    expect(updatedEntry?.promotedToId).toBe(body.promoted.id);
    expect(updatedEntry?.promotedAt).toBeTruthy();
    expect(updatedEntry?.pendingAssignmentPayload).toBeTruthy();

    const audits = await prismaRaw.auditEvent.findMany({
      where: {
        companyId,
        OR: [{ kind: 'CALENDAR_ENTRY_PROMOTED' }, { kind: 'ASSIGNMENT_CREATED' }],
      },
    });
    expect(audits.length).toBeGreaterThanOrEqual(2);
  });

  it('400 when promoting NOTE (canPromote returns false)', async () => {
    const note = await prismaRaw.calendarEntry.create({
      data: {
        companyId,
        supervisorId: supId,
        date: new Date('2026-05-12'),
        kind: 'NOTE',
        payload: {},
        notes: 'cant promote',
        editableUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const r = await app.inject({
      method: 'POST',
      url: `/calendar/${note.id}/promote`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { target: 'assignment' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('501 for DEMAND → requirement (not Wave 1 scope)', async () => {
    const demand = await prismaRaw.calendarEntry.create({
      data: {
        companyId,
        supervisorId: supId,
        date: new Date('2026-05-12'),
        kind: 'DEMAND',
        payload: { siteId, headcount: 5 },
        notes: null,
        editableUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const r = await app.inject({
      method: 'POST',
      url: `/calendar/${demand.id}/promote`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { target: 'requirement' },
    });
    expect(r.statusCode).toBe(501);
  });
});
