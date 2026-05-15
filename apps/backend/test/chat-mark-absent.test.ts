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
const PFX = `chat-mka-${Date.now()}-`;

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
    data: { name: PFX + 'Co', slug: PFX + 'co', ownerPhone: '+919900000201', ownerName: 'O' },
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
      name: 'Sundeep',
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
  await prismaRaw.attendance.deleteMany({ where: { companyId } });
  await prismaRaw.chatRequestLog.deleteMany({ where: { companyId } });
  await prismaRaw.chatMessage.deleteMany({ where: { companyId } });
  await prismaRaw.chatThread.deleteMany({ where: { companyId } });
  await prismaRaw.auditEvent.deleteMany({ where: { companyId } });
  await prismaRaw.outbox.deleteMany({ where: { companyId } }).catch(() => {});
  await prismaRaw.worker.deleteMany({ where: { companyId } });
  await prismaRaw.membership.deleteMany({ where: { companyId } });
  await prismaRaw.user.deleteMany({ where: { id: { in: [] } } }).catch(() => {});
  await prismaRaw.company.delete({ where: { id: companyId } });
  await prismaRaw.$disconnect();
  await app.close();
});

describe('chat → propose_mark_absent', () => {
  it('voice → AI → DecisionCard → Apply → Attendance row', async () => {
    const idem = crypto.randomUUID();
    const chatRes = await app.inject({
      method: 'POST',
      url: '/chat/messages',
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': idem },
      payload: { text: 'Sundeep is absent today, called in sick' },
    });
    expect(chatRes.statusCode).toBe(200);
    const body = chatRes.json();
    expect(body.decisionCard).toBeTruthy();
    // Anthropic should have called find_workers then propose_mark_absent.
    expect(body.decisionCard.toolName).toBe('propose_mark_absent');
    const proposed = body.decisionCard.fields;
    expect(proposed.workerId).toBe(workerId);
    // F-002.5: decisionId is now required on /chat/apply. The chat extractor
    // sets it on decisionCard at propose time (F-002 §3a).
    expect(body.decisionCard.decisionId).toBeTruthy();

    const applyRes = await app.inject({
      method: 'POST',
      url: '/chat/apply',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        chatMessageId: body.chatMessageId,
        toolName: 'propose_mark_absent',
        toolInput: proposed,
        decisionId: body.decisionCard.decisionId,
      },
    });
    expect(applyRes.statusCode).toBe(200);

    const attendance = await prismaRaw.attendance.findFirst({ where: { companyId, workerId } });
    expect(attendance).toBeTruthy();
    // MarkAbsentInput defaults status to 'ABSENT_NO_CALL' per
    // packages/shared-schema/src/zod/supervisor.ts:75
    expect(attendance?.status).toBe('ABSENT_NO_CALL');
  }, 90000);
});
