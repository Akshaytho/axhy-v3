/**
 * Real-DB integration test: PATCH /calendar/:id
 *
 * Exercises:
 *   1. 404 on wrong id
 *   2. happy path: notes update + AuditEvent
 *   3. 403 if past editableUntil
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
const TEST_PREFIX = `cal-edit-${Date.now()}-`;

let app: FastifyInstance;
let companyId: string;
let supervisorUserId: string;
let accessToken: string;
let entryId: string;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  const { issueAccessToken } = await import('../src/lib/jwt.js');
  app = await buildServer();
  await app.ready();

  const co = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919900000020',
      ownerName: 'O',
    },
  });
  companyId = co.id;
  const sup = await prismaRaw.user.create({
    data: { phone: `+9199${String(Date.now()).slice(-8)}`, name: 'S', locale: 'en' },
  });
  supervisorUserId = sup.id;
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

  // Seed an entry to edit
  const entry = await prismaRaw.calendarEntry.create({
    data: {
      companyId,
      supervisorId: sup.id,
      date: new Date('2026-05-12'),
      kind: 'NOTE',
      payload: {},
      notes: 'original',
      editableUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  entryId = entry.id;
});

afterAll(async () => {
  await prismaRaw.calendarEntry.deleteMany({ where: { companyId } });
  await prismaRaw.auditEvent.deleteMany({ where: { companyId } });
  await prismaRaw.membership.deleteMany({ where: { companyId } });
  await prismaRaw.company.delete({ where: { id: companyId } });
  await prismaRaw.$disconnect();
  await app.close();
});

describe('PATCH /calendar/:id', () => {
  it('404 on wrong id', async () => {
    const r = await app.inject({
      method: 'PATCH',
      url: '/calendar/00000000-0000-4000-8000-000000000000',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { notes: 'updated' },
    });
    expect(r.statusCode).toBe(404);
  });

  it('happy path: notes update', async () => {
    const r = await app.inject({
      method: 'PATCH',
      url: `/calendar/${entryId}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { notes: 'updated text' },
    });
    expect(r.statusCode).toBe(200);
    const row = await prismaRaw.calendarEntry.findUnique({ where: { id: entryId } });
    expect(row?.notes).toBe('updated text');

    const audit = await prismaRaw.auditEvent.findFirst({
      where: { companyId, kind: 'CALENDAR_ENTRY_UPDATED', targetId: entryId },
    });
    expect(audit).toBeTruthy();
  });

  it('403 if past editableUntil', async () => {
    await prismaRaw.calendarEntry.update({
      where: { id: entryId },
      data: { editableUntil: new Date(Date.now() - 60_000) },
    });
    const r = await app.inject({
      method: 'PATCH',
      url: `/calendar/${entryId}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { notes: 'too late' },
    });
    expect(r.statusCode).toBe(403);
  });
});
