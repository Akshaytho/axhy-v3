/**
 * Conflict detection plumbed into chat — overlap returns WARN severity DecisionCard with chips.
 *
 * @derives(master-plan §G)
 * @derives(spec-1 §7.4)
 */

import crypto from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

process.env.AXHY_OTP_BYPASS = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);
const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;
const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const PFX = `chat-cf-${Date.now()}-`;

let app: FastifyInstance;
let companyId: string;
let workerId: string;
let siteAId: string;
let siteBId: string;
let token: string;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  const { issueAccessToken } = await import('../src/lib/jwt.js');
  app = await buildServer();
  await app.ready();

  const co = await prismaRaw.company.create({
    data: { name: PFX + 'Co', slug: PFX + 'co', ownerPhone: '+919900000204', ownerName: 'O' },
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
      name: 'Suresh',
      state: 'ACTIVE',
      phone: `+9199${String(Date.now() + 1).slice(-8)}`,
    },
  });
  workerId = w.id;
  const sA = await prismaRaw.site.create({
    data: { companyId, name: 'Apollo', address: 'Hyd' },
  });
  siteAId = sA.id;
  const sB = await prismaRaw.site.create({
    data: { companyId, name: 'Westfield', address: 'Hyd' },
  });
  siteBId = sB.id;

  // Seed an existing assignment that the new request will overlap.
  await prismaRaw.assignment.create({
    data: {
      companyId,
      workerId,
      siteId: siteAId,
      shiftStart: '09:00',
      shiftEnd: '17:00',
      dayMask: 'MTWTFS_',
      validFrom: new Date('2026-05-01'),
      validUntil: null,
      state: 'ACTIVE',
    },
  });
  token = await issueAccessToken({
    userId: sup.id,
    companyId,
    role: 'SUPERVISOR',
    availableRoles: ['SUPERVISOR'],
    locale: 'en',
  });
});

afterAll(async () => {
  await prismaRaw.assignment.deleteMany({ where: { companyId } });
  await prismaRaw.chatRequestLog.deleteMany({ where: { companyId } });
  await prismaRaw.chatMessage.deleteMany({ where: { companyId } });
  await prismaRaw.chatThread.deleteMany({ where: { companyId } });
  await prismaRaw.auditEvent.deleteMany({ where: { companyId } });
  await prismaRaw.outbox.deleteMany({ where: { companyId } }).catch(() => {});
  await prismaRaw.worker.deleteMany({ where: { companyId } });
  await prismaRaw.site.deleteMany({ where: { companyId } });
  await prismaRaw.membership.deleteMany({ where: { companyId } });
  await prismaRaw.company.delete({ where: { id: companyId } });
  await prismaRaw.$disconnect();
  await app.close();
});

describe('chat → conflict detection', () => {
  it('overlapping assignment returns WARN severity DecisionCard with chips', async () => {
    const idem = crypto.randomUUID();
    const r = await app.inject({
      method: 'POST',
      url: '/chat/messages',
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': idem },
      payload: {
        text: 'Add Suresh to Westfield Mon-Sat 12pm to 4pm starting May 12 2026',
      },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.decisionCard?.toolName).toBe('propose_create_assignment');
    expect(body.decisionCard.severity).toBe('WARN');
    expect(body.decisionCard.presets?.chips).toBeTruthy();
    expect(Array.isArray(body.decisionCard.presets.chips)).toBe(true);
    expect(body.decisionCard.presets.chips.length).toBeGreaterThan(0);
    expect(body.decisionCard.conflicts).toBeTruthy();
    expect(body.decisionCard.conflicts.length).toBeGreaterThan(0);
    expect(body.decisionCard.conflicts[0].severity).toBe('SOFT');
  }, 90000);
});
