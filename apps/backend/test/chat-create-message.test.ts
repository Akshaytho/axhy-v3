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
const TEST_PREFIX = `chat-msg-${Date.now()}-`;

let app: FastifyInstance;
let companyId: string;
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
      ownerPhone: '+919900000063',
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

  accessToken = await issueAccessToken({
    userId: sup.id,
    companyId,
    role: 'SUPERVISOR',
    availableRoles: ['SUPERVISOR'],
    locale: 'en',
  });
});

afterAll(async () => {
  await prismaRaw.chatRequestLog.deleteMany({ where: { companyId } });
  await prismaRaw.chatMessage.deleteMany({ where: { companyId } });
  await prismaRaw.chatThread.deleteMany({ where: { companyId } });
  await prismaRaw.auditEvent.deleteMany({ where: { companyId } });
  await prismaRaw.membership.deleteMany({ where: { companyId } });
  await prismaRaw.company.delete({ where: { id: companyId } });
  await prismaRaw.$disconnect();
  await app.close();
});

describe('POST /chat/messages', () => {
  it('400 on missing Idempotency-Key', async () => {
    const r = await app.inject({
      method: 'POST',
      url: '/chat/messages',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { text: 'hello' },
    });
    expect(r.statusCode).toBe(400);
  });

  it('happy path returns assistantText + decisionCard fields', async () => {
    const idempKey = crypto.randomUUID();
    const r = await app.inject({
      method: 'POST',
      url: '/chat/messages',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'idempotency-key': idempKey,
      },
      payload: { text: 'Hello, can you say hi back?' },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.chatMessageId).toBeTruthy();
    expect(typeof body.assistantText).toBe('string');

    const thread = await prismaRaw.chatThread.findFirst({ where: { companyId } });
    expect(thread).toBeTruthy();
    const messages = await prismaRaw.chatMessage.findMany({ where: { companyId } });
    expect(messages.length).toBeGreaterThanOrEqual(2);
  }, 60000);

  it('idempotency dedup: same key returns cached response', async () => {
    const idempKey = crypto.randomUUID();
    const r1 = await app.inject({
      method: 'POST',
      url: '/chat/messages',
      headers: { authorization: `Bearer ${accessToken}`, 'idempotency-key': idempKey },
      payload: { text: 'Test idempotency' },
    });
    const r2 = await app.inject({
      method: 'POST',
      url: '/chat/messages',
      headers: { authorization: `Bearer ${accessToken}`, 'idempotency-key': idempKey },
      payload: { text: 'Test idempotency' },
    });
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
    expect(r1.json().chatMessageId).toBe(r2.json().chatMessageId);
  }, 60000);
});
