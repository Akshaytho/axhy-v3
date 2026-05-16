/**
 * Real-DB test for the daily AI-spend reset cron piggybacking the
 * outbox dispatcher tick.
 *
 * Spec 2 §9.3 — at UTC midnight, every Company.aiSpendDailyInr resets
 * to 0 with one AuditEvent (kind=AI_SPEND_DAILY_RESET) per tenant.
 *
 * Cases:
 *   1. First-boot path — first call records today as already-done, no reset
 *   2. Same-day re-call is a no-op (marker dedup)
 *   3. Cross-midnight call — runs reset, all tenants → 0, audit row each
 *   4. Failure-tolerant — error logged, marker NOT advanced, no throw
 *
 * @derives(master-plan §G)
 * @derives(spec-2 §9.3)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';

import { maybeResetAiSpend, _resetMarkerForTesting } from '../src/jobs/reset-ai-spend.js';

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const TEST_PREFIX = `reset-ai-spend-${Date.now()}-`;

const tenantIds: string[] = [];

function silentLog(): FastifyBaseLogger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    trace: () => {},
    fatal: () => {},
    child: () => silentLog(),
    level: 'silent',
    silent: () => {},
    bindings: () => ({}),
  } as unknown as FastifyBaseLogger;
}

beforeAll(async () => {
  for (let i = 0; i < 3; i += 1) {
    const c = await prismaRaw.company.create({
      data: {
        name: TEST_PREFIX + i,
        slug: TEST_PREFIX + i,
        ownerPhone: '+9100' + (Date.now() + i).toString().slice(-9),
        ownerName: 'Test ' + i,
      },
    });
    tenantIds.push(c.id);
  }
});

beforeEach(() => {
  _resetMarkerForTesting();
});

afterAll(async () => {
  // Clean only the audit events created by these test tenants
  await prismaRaw.auditEvent.deleteMany({
    where: { companyId: { in: tenantIds }, kind: 'AI_SPEND_DAILY_RESET' },
  });
  await prismaRaw.company.deleteMany({ where: { id: { in: tenantIds } } });
  await prismaRaw.$disconnect();
});

describe('maybeResetAiSpend — daily UTC-midnight reset', () => {
  it('first-boot path: records today as already-done; does NOT reset', async () => {
    // Seed nonzero spend
    await prismaRaw.$executeRaw`UPDATE "axhy"."Company" SET "aiSpendDailyInr" = 99 WHERE id = ${tenantIds[0]}::uuid`;
    const result = await maybeResetAiSpend(prismaRaw, silentLog());
    expect(result.ran).toBe(false);
    expect(result.tenantsReset).toBe(0);
    const row = await prismaRaw.company.findUniqueOrThrow({
      where: { id: tenantIds[0] },
      select: { aiSpendDailyInr: true },
    });
    expect(Number(row.aiSpendDailyInr)).toBe(99); // not reset
  });

  it('same-day second call is a no-op', async () => {
    // First call records today
    await maybeResetAiSpend(prismaRaw, silentLog());
    // Seed nonzero so we'd notice if second call did fire
    await prismaRaw.$executeRaw`UPDATE "axhy"."Company" SET "aiSpendDailyInr" = 50 WHERE id = ${tenantIds[0]}::uuid`;
    const result = await maybeResetAiSpend(prismaRaw, silentLog());
    expect(result.ran).toBe(false);
    expect(result.tenantsReset).toBe(0);
    const row = await prismaRaw.company.findUniqueOrThrow({
      where: { id: tenantIds[0] },
      select: { aiSpendDailyInr: true },
    });
    expect(Number(row.aiSpendDailyInr)).toBe(50);
  });

  it('cross-midnight call: resets all tenants to 0 and writes one AuditEvent each', async () => {
    // First call records "today"
    const today = new Date();
    await maybeResetAiSpend(prismaRaw, silentLog(), today);
    // Seed nonzero spend on all 3 tenants
    await prismaRaw.$executeRaw`UPDATE "axhy"."Company" SET "aiSpendDailyInr" = 42 WHERE id = ${tenantIds[0]}::uuid`;
    await prismaRaw.$executeRaw`UPDATE "axhy"."Company" SET "aiSpendDailyInr" = 100 WHERE id = ${tenantIds[1]}::uuid`;
    await prismaRaw.$executeRaw`UPDATE "axhy"."Company" SET "aiSpendDailyInr" = 4500 WHERE id = ${tenantIds[2]}::uuid`;
    // Audit-row count BEFORE the reset (across ALL tenants in DB; we only
    // assert the delta for OUR tenants)
    const auditBefore = await prismaRaw.auditEvent.count({
      where: { companyId: { in: tenantIds }, kind: 'AI_SPEND_DAILY_RESET' },
    });
    // Cross UTC midnight
    const tomorrow = new Date(today.getTime() + 25 * 60 * 60 * 1000);
    const result = await maybeResetAiSpend(prismaRaw, silentLog(), tomorrow);
    expect(result.ran).toBe(true);
    // tenantsReset is the TOTAL company count in the DB, not just our 3
    // (the bulk UPDATE hits every row). Sanity-check it's at least our 3.
    expect(result.tenantsReset).toBeGreaterThanOrEqual(3);
    // All three OUR tenants should now be 0
    for (const id of tenantIds) {
      const r = await prismaRaw.company.findUniqueOrThrow({
        where: { id },
        select: { aiSpendDailyInr: true },
      });
      expect(Number(r.aiSpendDailyInr)).toBe(0);
    }
    // One new audit row per OUR tenant
    const auditAfter = await prismaRaw.auditEvent.count({
      where: { companyId: { in: tenantIds }, kind: 'AI_SPEND_DAILY_RESET' },
    });
    expect(auditAfter - auditBefore).toBe(3);
  });

  it('failure-tolerant: $executeRaw throws → logs error, marker not advanced, no throw', async () => {
    // First call records "today"
    const today = new Date();
    await maybeResetAiSpend(prismaRaw, silentLog(), today);
    // Build a Prisma-shaped client where $transaction rejects
    const failingClient = {
      $transaction: async () => {
        throw new Error('simulated DB failure');
      },
    } as unknown as PrismaClient;
    // Cross-midnight invocation: should NOT throw
    const tomorrow = new Date(today.getTime() + 25 * 60 * 60 * 1000);
    await expect(maybeResetAiSpend(failingClient, silentLog(), tomorrow)).resolves.toEqual({
      ran: false,
      tenantsReset: 0,
    });
    // Marker should NOT be advanced — next call (with real client) should
    // still attempt the reset
    const recovered = await maybeResetAiSpend(prismaRaw, silentLog(), tomorrow);
    expect(recovered.ran).toBe(true);
  });
});
