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
const TEST_PREFIX = `chat-xt-${Date.now()}-`;

let app: FastifyInstance;
let coAId: string;
let coBId: string;
let supATokenAValid: string;
let supBTokenBValid: string;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  const { issueAccessToken } = await import('../src/lib/jwt.js');
  app = await buildServer();
  await app.ready();

  const a = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'A',
      slug: TEST_PREFIX + 'a',
      ownerPhone: '+919900000065',
      ownerName: 'OA',
    },
  });
  coAId = a.id;
  const b = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'B',
      slug: TEST_PREFIX + 'b',
      ownerPhone: '+919900000066',
      ownerName: 'OB',
    },
  });
  coBId = b.id;

  const supA = await prismaRaw.user.create({
    data: { phone: `+9199${String(Date.now()).slice(-8)}`, name: 'A', locale: 'en' },
  });
  const supB = await prismaRaw.user.create({
    data: { phone: `+9199${String(Date.now() + 1).slice(-8)}`, name: 'B', locale: 'en' },
  });
  await prismaRaw.membership.create({
    data: { companyId: coAId, userId: supA.id, role: 'SUPERVISOR', status: 'ACTIVE' },
  });
  await prismaRaw.membership.create({
    data: { companyId: coBId, userId: supB.id, role: 'SUPERVISOR', status: 'ACTIVE' },
  });

  supATokenAValid = await issueAccessToken({
    userId: supA.id,
    companyId: coAId,
    role: 'SUPERVISOR',
    availableRoles: ['SUPERVISOR'],
    locale: 'en',
  });
  supBTokenBValid = await issueAccessToken({
    userId: supB.id,
    companyId: coBId,
    role: 'SUPERVISOR',
    availableRoles: ['SUPERVISOR'],
    locale: 'en',
  });
});

afterAll(async () => {
  await prismaRaw.chatRequestLog.deleteMany({
    where: { OR: [{ companyId: coAId }, { companyId: coBId }] },
  });
  await prismaRaw.chatMessage.deleteMany({
    where: { OR: [{ companyId: coAId }, { companyId: coBId }] },
  });
  await prismaRaw.chatThread.deleteMany({
    where: { OR: [{ companyId: coAId }, { companyId: coBId }] },
  });
  await prismaRaw.auditEvent.deleteMany({
    where: { OR: [{ companyId: coAId }, { companyId: coBId }] },
  });
  await prismaRaw.membership.deleteMany({
    where: { OR: [{ companyId: coAId }, { companyId: coBId }] },
  });
  await prismaRaw.company.deleteMany({ where: { id: { in: [coAId, coBId] } } });
  await prismaRaw.$disconnect();
  await app.close();
});

describe('cross-tenant chat isolation', () => {
  it('Tenant B cannot reuse Tenant A idempotency key', async () => {
    const sharedKey = crypto.randomUUID();

    await app.inject({
      method: 'POST',
      url: '/chat/messages',
      headers: { authorization: `Bearer ${supATokenAValid}`, 'idempotency-key': sharedKey },
      payload: { text: 'Hello A' },
    });

    const rB = await app.inject({
      method: 'POST',
      url: '/chat/messages',
      headers: { authorization: `Bearer ${supBTokenBValid}`, 'idempotency-key': sharedKey },
      payload: { text: 'Hello B' },
    });
    expect(rB.statusCode).toBe(200);

    const aThreads = await prismaRaw.chatThread.findMany({ where: { companyId: coAId } });
    const bThreads = await prismaRaw.chatThread.findMany({ where: { companyId: coBId } });
    expect(aThreads.length).toBe(1);
    expect(bThreads.length).toBe(1);
  }, 60000);
});
