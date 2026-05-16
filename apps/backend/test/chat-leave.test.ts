/**
 * @derives(master-plan §G)
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
const PFX = `chat-lv-${Date.now()}-`;

let app: FastifyInstance;
let companyId: string;
let workerId: string;
let token: string;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  const { issueAccessToken } = await import('../src/lib/jwt.js');
  app = await buildServer();
  await app.ready();

  const co = await prismaRaw.company.create({
    data: { name: PFX + 'Co', slug: PFX + 'co', ownerPhone: '+919900000202', ownerName: 'O' },
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
  token = await issueAccessToken({
    userId: sup.id,
    companyId,
    role: 'SUPERVISOR',
    availableRoles: ['SUPERVISOR'],
    locale: 'en',
  });
});

afterAll(async () => {
  await prismaRaw.leaveRequest.deleteMany({ where: { companyId } });
  await prismaRaw.chatRequestLog.deleteMany({ where: { companyId } });
  await prismaRaw.chatMessage.deleteMany({ where: { companyId } });
  await prismaRaw.chatThread.deleteMany({ where: { companyId } });
  await prismaRaw.auditEvent.deleteMany({ where: { companyId } });
  await prismaRaw.outbox.deleteMany({ where: { companyId } }).catch(() => {});
  await prismaRaw.worker.deleteMany({ where: { companyId } });
  await prismaRaw.membership.deleteMany({ where: { companyId } });
  await prismaRaw.company.delete({ where: { id: companyId } });
  await prismaRaw.$disconnect();
  await app.close();
});

describe('chat → propose_leave', () => {
  it('voice → AI → DecisionCard → Apply → LeaveRequest row', async () => {
    const idem = crypto.randomUUID();
    const chatRes = await app.inject({
      method: 'POST',
      url: '/chat/messages',
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': idem },
      payload: { text: 'Pradeep needs sick leave from May 12 to May 14 2026' },
    });
    expect(chatRes.statusCode).toBe(200);
    const body = chatRes.json();
    expect(body.decisionCard?.toolName).toBe('propose_leave');
    const proposed = body.decisionCard.fields;
    expect(proposed.workerId).toBe(workerId);
    expect(proposed.fromDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(proposed.toDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // F-002.5: decisionId required.
    expect(body.decisionCard.decisionId).toBeTruthy();
    const applyRes = await app.inject({
      method: 'POST',
      url: '/chat/apply',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        chatMessageId: body.chatMessageId,
        toolName: 'propose_leave',
        toolInput: proposed,
        decisionId: body.decisionCard.decisionId,
      },
    });
    expect(applyRes.statusCode).toBe(201);

    const leave = await prismaRaw.leaveRequest.findFirst({ where: { companyId, workerId } });
    expect(leave).toBeTruthy();
    expect(leave?.state).toBe('REQUESTED');
  }, 90000);
});
