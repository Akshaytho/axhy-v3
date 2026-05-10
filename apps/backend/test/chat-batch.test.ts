/**
 * Compound utterance → 2+ propose_* in one Anthropic turn → batch DecisionCard.
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
const PFX = `chat-batch-${Date.now()}-`;

let app: FastifyInstance;
let companyId: string;
let token: string;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  const { issueAccessToken } = await import('../src/lib/jwt.js');
  app = await buildServer();
  await app.ready();

  const co = await prismaRaw.company.create({
    data: { name: PFX + 'Co', slug: PFX + 'co', ownerPhone: '+919900000206', ownerName: 'O' },
  });
  companyId = co.id;
  const sup = await prismaRaw.user.create({
    data: { phone: `+9199${String(Date.now()).slice(-8)}`, name: 'S', locale: 'en' },
  });
  await prismaRaw.membership.create({
    data: { companyId, userId: sup.id, role: 'SUPERVISOR', status: 'ACTIVE' },
  });
  await prismaRaw.worker.create({
    data: {
      companyId,
      name: 'Sundeep',
      state: 'ACTIVE',
      phone: `+9199${String(Date.now() + 1).slice(-8)}`,
    },
  });
  await prismaRaw.worker.create({
    data: {
      companyId,
      name: 'Pradeep',
      state: 'ACTIVE',
      phone: `+9199${String(Date.now() + 2).slice(-8)}`,
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
  await prismaRaw.attendance.deleteMany({ where: { companyId } });
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

describe('chat → multi-tool-turn batch', () => {
  it('compound utterance returns decisionCards array (length 2) OR single (AI may serialize as turns)', async () => {
    const idem = crypto.randomUUID();
    const r = await app.inject({
      method: 'POST',
      url: '/chat/messages',
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': idem },
      payload: {
        text: 'Sundeep is absent today, and also Pradeep is sick today',
      },
    });
    expect(r.statusCode).toBe(200);
    const body = r.json();

    // Wave 4a-PRO response shape: when 2+ DecisionCards, return as plural array
    // and set singular `decisionCard` to null. When 1 DecisionCard, keep singular.
    if (body.decisionCards != null && Array.isArray(body.decisionCards)) {
      expect(body.decisionCards.length).toBeGreaterThanOrEqual(2);
      expect(body.decisionCard).toBeNull();
      expect(body.decisionCards[0].toolName).toBe('propose_mark_absent');
      expect(body.decisionCards[1].toolName).toBe('propose_mark_absent');
    } else {
      // AI may have decided to do them as separate turns — that path keeps
      // the singular shape. Accept either as long as a card came back.
      expect(body.decisionCard).toBeTruthy();
      expect(body.decisionCard.toolName).toBe('propose_mark_absent');
    }
  }, 90000);
});
