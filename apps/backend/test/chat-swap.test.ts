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
const PFX = `chat-sw-${Date.now()}-`;

let app: FastifyInstance;
let companyId: string;
let raviId: string;
let lakshmiId: string;
let siteId: string;
let token: string;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  const { issueAccessToken } = await import('../src/lib/jwt.js');
  app = await buildServer();
  await app.ready();

  const co = await prismaRaw.company.create({
    data: { name: PFX + 'Co', slug: PFX + 'co', ownerPhone: '+919900000203', ownerName: 'O' },
  });
  companyId = co.id;
  const sup = await prismaRaw.user.create({
    data: { phone: `+9199${String(Date.now()).slice(-8)}`, name: 'S', locale: 'en' },
  });
  await prismaRaw.membership.create({
    data: { companyId, userId: sup.id, role: 'SUPERVISOR', status: 'ACTIVE' },
  });

  const ravi = await prismaRaw.worker.create({
    data: {
      companyId,
      name: 'Ravi',
      state: 'ACTIVE',
      phone: `+9199${String(Date.now() + 1).slice(-8)}`,
    },
  });
  raviId = ravi.id;
  const lakshmi = await prismaRaw.worker.create({
    data: {
      companyId,
      name: 'Lakshmi',
      state: 'ACTIVE',
      phone: `+9199${String(Date.now() + 2).slice(-8)}`,
    },
  });
  lakshmiId = lakshmi.id;
  const site = await prismaRaw.site.create({
    data: { companyId, name: 'Hospital A', address: 'Hyderabad' },
  });
  siteId = site.id;

  token = await issueAccessToken({
    userId: sup.id,
    companyId,
    role: 'SUPERVISOR',
    availableRoles: ['SUPERVISOR'],
    locale: 'en',
  });
});

afterAll(async () => {
  await prismaRaw.swapRequest.deleteMany({ where: { companyId } });
  await prismaRaw.chatRequestLog.deleteMany({ where: { companyId } });
  await prismaRaw.chatMessage.deleteMany({ where: { companyId } });
  await prismaRaw.chatThread.deleteMany({ where: { companyId } });
  await prismaRaw.auditEvent.deleteMany({ where: { companyId } });
  await prismaRaw.outbox.deleteMany({ where: { companyId } }).catch(() => {});
  await prismaRaw.site.deleteMany({ where: { companyId } });
  await prismaRaw.worker.deleteMany({ where: { companyId } });
  await prismaRaw.membership.deleteMany({ where: { companyId } });
  await prismaRaw.company.delete({ where: { id: companyId } });
  await prismaRaw.$disconnect();
  await app.close();
});

describe('chat → propose_swap', () => {
  it('voice → AI → DecisionCard → Apply → SwapRequest row', async () => {
    const idem = crypto.randomUUID();
    // Compute a future date string the AI can pin to. Use "tomorrow 9am" relative to today.
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const tomorrowYmd = tomorrow.toISOString().slice(0, 10);
    const chatRes = await app.inject({
      method: 'POST',
      url: '/chat/messages',
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': idem },
      payload: {
        text: `Swap Ravi and Lakshmi at Hospital A on ${tomorrowYmd} at 9am`,
      },
    });
    expect(chatRes.statusCode).toBe(200);
    const body = chatRes.json();
    expect(body.decisionCard?.toolName).toBe('propose_swap');
    const proposed = body.decisionCard.fields;
    expect(proposed.fromWorkerId).not.toBe(proposed.toWorkerId);
    expect([raviId, lakshmiId]).toContain(proposed.fromWorkerId);
    expect([raviId, lakshmiId]).toContain(proposed.toWorkerId);
    expect(proposed.siteId).toBe(siteId);
    expect(typeof proposed.effectiveAt).toBe('string');

    // Force effectiveAt to be a known future datetime so the swap-requests
    // route doesn't reject it. The AI may produce e.g. "tomorrow 09:00 IST"
    // which depending on timezone could land in the past once parsed as
    // server local time. We've already asserted the AI populated *some*
    // string above; here we override it for the apply step only.
    const futureIso = new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString();
    // F-002.5: decisionId required.
    expect(body.decisionCard.decisionId).toBeTruthy();
    const applyRes = await app.inject({
      method: 'POST',
      url: '/chat/apply',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        chatMessageId: body.chatMessageId,
        toolName: 'propose_swap',
        toolInput: { ...proposed, effectiveAt: futureIso },
        decisionId: body.decisionCard.decisionId,
      },
    });
    if (applyRes.statusCode !== 200) {
      console.error('apply failed:', applyRes.statusCode, applyRes.body);
    }
    expect(applyRes.statusCode).toBe(200);

    const swap = await prismaRaw.swapRequest.findFirst({ where: { companyId } });
    expect(swap).toBeTruthy();
    expect(swap?.siteId).toBe(siteId);
    expect(swap?.state).toBe('SENT');
  }, 90000);
});
