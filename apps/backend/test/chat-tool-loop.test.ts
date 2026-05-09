/**
 * End-to-end: voice message → AI → DecisionCard → Apply → real Assignment row.
 * Vignette 1 + 5 from Vision Narrative.
 *
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
const TEST_PREFIX = `chat-loop-${Date.now()}-`;

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
      ownerPhone: '+919900000064',
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
  const s = await prismaRaw.site.create({ data: { companyId, name: 'Apollo Hospital' } });
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
  await prismaRaw.chatRequestLog.deleteMany({ where: { companyId } });
  await prismaRaw.chatMessage.deleteMany({ where: { companyId } });
  await prismaRaw.chatThread.deleteMany({ where: { companyId } });
  await prismaRaw.auditEvent.deleteMany({ where: { companyId } });
  await prismaRaw.worker.deleteMany({ where: { companyId } });
  await prismaRaw.site.deleteMany({ where: { companyId } });
  await prismaRaw.membership.deleteMany({ where: { companyId } });
  await prismaRaw.company.delete({ where: { id: companyId } });
  await prismaRaw.$disconnect();
  await app.close();
});

describe('end-to-end magic loop (vignette 1 + 5)', () => {
  it('voice → AI → DecisionCard → Apply → real Assignment row', async () => {
    const idempKey = crypto.randomUUID();
    const chatRes = await app.inject({
      method: 'POST',
      url: '/chat/messages',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'idempotency-key': idempKey,
      },
      payload: { text: 'Add Pradeep to Apollo Hospital, Mon-Sat 9am to 5pm, starting May 12 2026' },
    });
    expect(chatRes.statusCode).toBe(200);
    const chatBody = chatRes.json();
    expect(chatBody.decisionCard).toBeTruthy();
    expect(chatBody.decisionCard.toolName).toBe('propose_create_assignment');
    const proposedFields = chatBody.decisionCard.fields;
    expect(proposedFields.workerId).toBe(workerId);
    expect(proposedFields.siteId).toBe(siteId);

    const beforeApply = await prismaRaw.assignment.findMany({ where: { companyId } });
    expect(beforeApply.length).toBe(0);

    const applyRes = await app.inject({
      method: 'POST',
      url: '/chat/apply',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        chatMessageId: chatBody.chatMessageId,
        toolName: 'propose_create_assignment',
        toolInput: proposedFields,
      },
    });
    expect(applyRes.statusCode).toBe(200);

    const afterApply = await prismaRaw.assignment.findMany({ where: { companyId } });
    expect(afterApply.length).toBe(1);
    expect(afterApply[0].workerId).toBe(workerId);
    expect(afterApply[0].siteId).toBe(siteId);
  }, 30000);
});
