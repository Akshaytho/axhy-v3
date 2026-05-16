/**
 * End-to-end real-Railway integration test for the Wave 4b cost ceiling.
 *
 * Spec 2 §9.2 + §9.3 + §9.4 + §9.5. Exercises the gateway
 * (`assertWithinBudget`) directly with the real DB, the real
 * `dispatchBudgetAlert` outbox path, and the daily reset cron — covering
 * every threshold-boundary case the spec calls out.
 *
 * No OpenAI mocking needed: `assertWithinBudget` runs BEFORE any LLM
 * call, so testing it directly proves the chat route's pre-flight
 * behavior end-to-end. The Task 1.4 chat-cost-ceiling.test.ts covers
 * the post-call increment path; this test covers the pre-call gate.
 *
 * @derives(master-plan §G)
 * @derives(spec-2 §9.2, §9.3, §9.4, §9.5)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import pino from 'pino';
import type { FastifyBaseLogger } from 'fastify';
import { assertWithinBudget, AICostBudgetError, type TenantBudgetCtx } from '@axhy/ai-tools';

import { maybeResetAiSpend, _resetMarkerForTesting } from '../src/jobs/reset-ai-spend.js';

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const TEST_PREFIX = `cost-ceiling-e2e-${Date.now()}-`;
const log = pino({ level: 'silent' }) as unknown as FastifyBaseLogger;

let companyAId: string;
let companyBId: string;

function ctxFor(companyId: string): TenantBudgetCtx {
  return { companyId, prisma: prismaRaw };
}

async function setSpend(companyId: string, inr: number): Promise<void> {
  await prismaRaw.$executeRaw`
    UPDATE "axhy"."Company"
    SET "aiSpendDailyInr" = ${inr}::numeric
    WHERE "id" = ${companyId}::uuid
  `;
}

async function countOutboxRows(companyId: string, topic: string): Promise<number> {
  return prismaRaw.outbox.count({ where: { companyId, topic } });
}

beforeAll(async () => {
  const a = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'A',
      slug: TEST_PREFIX + 'a',
      ownerPhone: '+9100' + Date.now().toString().slice(-9),
      ownerName: 'Test A',
    },
  });
  const b = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'B',
      slug: TEST_PREFIX + 'b',
      ownerPhone: '+9100' + (Date.now() + 1).toString().slice(-9),
      ownerName: 'Test B',
    },
  });
  companyAId = a.id;
  companyBId = b.id;
});

beforeEach(async () => {
  // Reset spend + outbox + audit per case so each test is hermetic.
  await setSpend(companyAId, 0);
  await setSpend(companyBId, 0);
  await prismaRaw.outbox.deleteMany({
    where: {
      companyId: { in: [companyAId, companyBId] },
      topic: { in: ['owner.ai_budget_warning', 'owner.ai_budget_capped'] },
    },
  });
  await prismaRaw.auditEvent.deleteMany({
    where: {
      companyId: { in: [companyAId, companyBId] },
      kind: { in: ['OWNER_BUDGET_ALERT_DISPATCHED', 'AI_SPEND_DAILY_RESET'] },
    },
  });
  _resetMarkerForTesting();
});

afterAll(async () => {
  await prismaRaw.outbox.deleteMany({ where: { companyId: { in: [companyAId, companyBId] } } });
  await prismaRaw.auditEvent.deleteMany({ where: { companyId: { in: [companyAId, companyBId] } } });
  await prismaRaw.company.deleteMany({ where: { id: { in: [companyAId, companyBId] } } });
  await prismaRaw.$disconnect();
});

describe('Wave 4b cost ceiling — end-to-end', () => {
  it('case 1: under-warn → proceeds, no outbox row', async () => {
    await setSpend(companyAId, 100);
    // voice_change_parse surface ceiling is ₹0.10; estimate ₹0.05 stays under.
    await expect(
      assertWithinBudget('voice_change_parse', 0.05, ctxFor(companyAId)),
    ).resolves.toBeUndefined();
    expect(await countOutboxRows(companyAId, 'owner.ai_budget_warning')).toBe(0);
    expect(await countOutboxRows(companyAId, 'owner.ai_budget_capped')).toBe(0);
  });

  it('case 2: at-warn just-crossed → proceeds, exactly 1 warn outbox row', async () => {
    // 2999.95 + 0.06 = 3000.01 ≥ ₹3000 warn → fires WARN
    await setSpend(companyAId, 2999.95);
    await expect(
      assertWithinBudget('voice_change_parse', 0.06, ctxFor(companyAId)),
    ).resolves.toBeUndefined();
    expect(await countOutboxRows(companyAId, 'owner.ai_budget_warning')).toBe(1);
    expect(await countOutboxRows(companyAId, 'owner.ai_budget_capped')).toBe(0);
  });

  it('case 3: past-warn no double-fire (idempotency)', async () => {
    // First call crosses warn threshold
    await setSpend(companyAId, 2999.95);
    await assertWithinBudget('voice_change_parse', 0.06, ctxFor(companyAId));
    expect(await countOutboxRows(companyAId, 'owner.ai_budget_warning')).toBe(1);
    // Bump spend (simulating a real increment after the call) and re-fire gate
    await setSpend(companyAId, 3500);
    await assertWithinBudget('voice_change_parse', 0.05, ctxFor(companyAId));
    // Still 1 warn row — daily idempotency holds via DB unique constraint
    expect(await countOutboxRows(companyAId, 'owner.ai_budget_warning')).toBe(1);
    expect(await countOutboxRows(companyAId, 'owner.ai_budget_capped')).toBe(0);
  });

  it('case 4: at-cap → throws AICostBudgetError, exactly 1 cap outbox row', async () => {
    // 4999.95 + 0.06 = 5000.01 ≥ ₹5000 cap → fires CAP + throws
    await setSpend(companyAId, 4999.95);
    await expect(
      assertWithinBudget('voice_change_parse', 0.06, ctxFor(companyAId)),
    ).rejects.toBeInstanceOf(AICostBudgetError);
    expect(await countOutboxRows(companyAId, 'owner.ai_budget_capped')).toBe(1);
  });

  it('case 5: past-cap re-call still throws, still 1 cap row', async () => {
    await setSpend(companyAId, 4999.95);
    await assertWithinBudget('voice_change_parse', 0.06, ctxFor(companyAId)).catch(() => {});
    expect(await countOutboxRows(companyAId, 'owner.ai_budget_capped')).toBe(1);
    // Re-fire on already-capped tenant
    await setSpend(companyAId, 5500);
    await expect(
      assertWithinBudget('voice_change_parse', 0.05, ctxFor(companyAId)),
    ).rejects.toBeInstanceOf(AICostBudgetError);
    // Still 1 cap row — idempotency holds
    expect(await countOutboxRows(companyAId, 'owner.ai_budget_capped')).toBe(1);
  });

  it('case 6: cron reset → counter back to 0, gate proceeds again', async () => {
    // Push tenant past cap
    await setSpend(companyAId, 5500);
    await expect(
      assertWithinBudget('voice_change_parse', 0.05, ctxFor(companyAId)),
    ).rejects.toBeInstanceOf(AICostBudgetError);
    // First boot of the marker (record today as already-done)
    const today = new Date();
    await maybeResetAiSpend(prismaRaw, log, today);
    // Cross UTC midnight — real reset fires
    const tomorrow = new Date(today.getTime() + 25 * 60 * 60 * 1000);
    const result = await maybeResetAiSpend(prismaRaw, log, tomorrow);
    expect(result.ran).toBe(true);
    // Now spend is 0; gate proceeds even with the same surface estimate
    const after = await prismaRaw.company.findUniqueOrThrow({
      where: { id: companyAId },
      select: { aiSpendDailyInr: true },
    });
    expect(Number(after.aiSpendDailyInr)).toBe(0);
    await expect(
      assertWithinBudget('voice_change_parse', 0.05, ctxFor(companyAId)),
    ).resolves.toBeUndefined();
  });

  it('case 7: cross-tenant isolation — A caps, B unaffected and gets no alerts', async () => {
    await setSpend(companyAId, 4999.95);
    await setSpend(companyBId, 100);
    // A trips cap (4999.95 + 0.06 = 5000.01 ≥ 5000)
    await expect(
      assertWithinBudget('voice_change_parse', 0.06, ctxFor(companyAId)),
    ).rejects.toBeInstanceOf(AICostBudgetError);
    expect(await countOutboxRows(companyAId, 'owner.ai_budget_capped')).toBe(1);
    // B is untouched
    const bAfter = await prismaRaw.company.findUniqueOrThrow({
      where: { id: companyBId },
      select: { aiSpendDailyInr: true },
    });
    expect(Number(bAfter.aiSpendDailyInr)).toBe(100);
    expect(await countOutboxRows(companyBId, 'owner.ai_budget_warning')).toBe(0);
    expect(await countOutboxRows(companyBId, 'owner.ai_budget_capped')).toBe(0);
    // B's gate proceeds normally
    await expect(
      assertWithinBudget('voice_change_parse', 0.05, ctxFor(companyBId)),
    ).resolves.toBeUndefined();
  });
});
