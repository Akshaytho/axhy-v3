/**
 * Real-DB integration test: /chat/apply input validation parity with direct routes.
 *
 * F-002.18 — friend's round-3 R3.1 fix verification. Round-2's refactor moved
 * /chat/apply off `app.inject` for mark_absent / leave / swap and bypassed
 * the route-level Zod schemas (P1 regression). R3.1 re-applies the same
 * schemas the direct routes use, so the chat path and the direct route
 * accept/reject identical inputs.
 *
 * The load-bearing case (friend's P1 example): self-swap is rejected by the
 * direct /swap-requests route via `CreateSwapRequestInput.refine`. The chat
 * path must reject it the same way.
 *
 * Cases:
 *   1. propose_swap with fromWorkerId === toWorkerId → 400 BAD_INPUT
 *      (regression-prevention).
 *   2. propose_swap with malformed effectiveAt (not ISO) → 400 BAD_INPUT.
 *   3. propose_mark_absent with non-uuid workerId → 400 BAD_INPUT.
 *   4. propose_leave with malformed date → 400 BAD_INPUT.
 *
 * @derives(F-002.18 / R3.1)
 * @derives(production-grade-rulebook P5 — single source of validation truth)
 */

import { randomUUID } from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

process.env.AXHY_OTP_BYPASS = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `f002-validation-${Date.now()}-`;

let app: FastifyInstance;
let companyId: string;
let userA: string;
let worker: string;
let site: string;
let token: string;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  const { issueAccessToken } = await import('../src/lib/jwt.js');
  app = await buildServer();
  await app.ready();

  const co = await prisma.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919999929001',
      ownerName: 'O',
    },
  });
  companyId = co.id;

  userA = (
    await prisma.user.create({
      data: {
        phone: '+919999' + String(Date.now() + 1).slice(-7),
        name: 'A',
        locale: 'en',
        companyId,
      },
    })
  ).id;
  await prisma.membership.create({
    data: { companyId, userId: userA, role: 'SUPERVISOR' },
  });

  worker = (
    await prisma.worker.create({
      data: {
        companyId,
        name: 'W',
        state: 'ACTIVE',
        phone: '+919999' + String(Date.now() + 2).slice(-7),
      },
    })
  ).id;
  site = (await prisma.site.create({ data: { companyId, name: 'site' } })).id;

  await prisma.siteSupervisorBinding.create({
    data: {
      companyId,
      siteId: site,
      userId: userA,
      actingForUserId: null,
      effectiveFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
      effectiveUntil: null,
      reason: 'Permanent',
      createdBy: userA,
    },
  });
  await prisma.assignment.create({
    data: {
      companyId,
      workerId: worker,
      siteId: site,
      shiftStart: '09:00',
      shiftEnd: '17:00',
      dayMask: 'MTWTFS_',
      validFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
      validUntil: null,
      state: 'ACTIVE',
    },
  });

  token = await issueAccessToken({
    userId: userA,
    companyId,
    role: 'SUPERVISOR',
    availableRoles: ['SUPERVISOR'],
    locale: 'en',
  });
});

afterAll(async () => {
  await prisma.company.deleteMany({ where: { slug: { startsWith: TEST_PREFIX } } });
  await app.close();
  await prisma.$disconnect();
});

async function seedProposed(args: {
  kind: string;
  tier?: string;
  targetId: string | null;
}): Promise<string> {
  const decisionId = randomUUID();
  await prisma.supervisorDecision.create({
    data: {
      id: decisionId,
      companyId,
      supervisorId: userA,
      kind: args.kind,
      tier: args.tier ?? 'OPERATIONAL',
      targetId: args.targetId,
      payload: {},
    },
  });
  return decisionId;
}

describe('/chat/apply input validation parity with direct routes — F-002.18 / R3.1', () => {
  it('propose_swap: rejects self-swap (fromWorkerId === toWorkerId) with 400 — friend P1 regression-prevention', async () => {
    const decisionId = await seedProposed({ kind: 'SWAP_WORKER', targetId: site });
    const futureIso = new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString();
    const res = await app.inject({
      method: 'POST',
      url: '/chat/apply',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        chatMessageId: randomUUID(),
        toolName: 'propose_swap',
        toolInput: {
          fromWorkerId: worker,
          toWorkerId: worker, // same as fromWorkerId — must be rejected
          siteId: site,
          effectiveAt: futureIso,
        },
        decisionId,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('BAD_INPUT');
    // Confirm the lifecycle row wasn't touched.
    const row = await prisma.supervisorDecision.findUnique({ where: { id: decisionId } });
    expect(row!.appliedAt).toBeNull();
    // Confirm no SwapRequest row was created.
    const swap = await prisma.swapRequest.findFirst({ where: { companyId } });
    expect(swap).toBeNull();
  });

  it('propose_swap: rejects malformed effectiveAt (not ISO) with 400', async () => {
    const decisionId = await seedProposed({ kind: 'SWAP_WORKER', targetId: site });
    const worker2 = await prisma.worker.create({
      data: {
        companyId,
        name: 'W2',
        state: 'ACTIVE',
        phone: '+919999' + String(Date.now() + 2900).slice(-7),
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/chat/apply',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        chatMessageId: randomUUID(),
        toolName: 'propose_swap',
        toolInput: {
          fromWorkerId: worker,
          toWorkerId: worker2.id,
          siteId: site,
          effectiveAt: 'not-an-iso-timestamp', // malformed
        },
        decisionId,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('BAD_INPUT');
  });

  it('propose_mark_absent: rejects non-uuid workerId with 400', async () => {
    const decisionId = await seedProposed({ kind: 'MARK_ABSENT', targetId: worker });
    const res = await app.inject({
      method: 'POST',
      url: '/chat/apply',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        chatMessageId: randomUUID(),
        toolName: 'propose_mark_absent',
        toolInput: {
          workerId: 'not-a-uuid', // malformed
          date: '2026-04-25',
        },
        decisionId,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('BAD_INPUT');
    const row = await prisma.supervisorDecision.findUnique({ where: { id: decisionId } });
    expect(row!.appliedAt).toBeNull();
  });

  it('propose_leave: rejects malformed fromDate (not YYYY-MM-DD) with 400', async () => {
    const decisionId = await seedProposed({ kind: 'APPROVE_LEAVE', targetId: worker });
    const res = await app.inject({
      method: 'POST',
      url: '/chat/apply',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        chatMessageId: randomUUID(),
        toolName: 'propose_leave',
        toolInput: {
          workerId: worker,
          fromDate: 'tomorrow', // malformed; schema wants YYYY-MM-DD
          toDate: '2026-04-26',
          reason: 'sick',
        },
        decisionId,
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('BAD_INPUT');
  });
});
