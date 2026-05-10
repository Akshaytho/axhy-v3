/**
 * Real-DB concurrency test for incrementSpend.
 *
 * Spec 2 §9.2 — atomic UPDATE … SET col = col + x must be race-free at
 * the 50-concurrent chat semaphore. This test fires 50 parallel
 * increments and asserts the final value matches the sum exactly —
 * any read-modify-write race would lose updates.
 *
 * Plus cross-tenant isolation (Tenant A's increment never touches
 * Tenant B's row) and edge cases (zero-cost no-op, negative-cost
 * defensive throw, missing-row throw).
 *
 * @derives(master-plan §G)
 * @derives(spec-2 §9.2)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { incrementSpend } from '@axhy/ai-tools';

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const TEST_PREFIX = `cost-ceiling-test-${Date.now()}-`;

let companyAId: string;
let companyBId: string;

beforeAll(async () => {
  const a = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'A',
      slug: TEST_PREFIX + 'a',
      ownerPhone: '+9100' + Date.now().toString().slice(-9),
      ownerName: 'Test Owner A',
    },
  });
  const b = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'B',
      slug: TEST_PREFIX + 'b',
      ownerPhone: '+9100' + (Date.now() + 1).toString().slice(-9),
      ownerName: 'Test Owner B',
    },
  });
  companyAId = a.id;
  companyBId = b.id;
});

afterAll(async () => {
  await prismaRaw.company.deleteMany({
    where: { id: { in: [companyAId, companyBId] } },
  });
  await prismaRaw.$disconnect();
});

describe('incrementSpend — atomic spend tracking', () => {
  it('50 parallel increments converge deterministically (race-free)', async () => {
    // Reset to 0
    await prismaRaw.$executeRaw`UPDATE "axhy"."Company" SET "aiSpendDailyInr" = 0 WHERE id = ${companyAId}::uuid`;
    // Fire 50 parallel ₹1.00 increments
    await Promise.all(Array.from({ length: 50 }, () => incrementSpend(companyAId, 1.0, prismaRaw)));
    const after = await prismaRaw.company.findUniqueOrThrow({
      where: { id: companyAId },
      select: { aiSpendDailyInr: true },
    });
    expect(Number(after.aiSpendDailyInr)).toBe(50.0);
  });

  it('cross-tenant isolation — A increments do not touch B', async () => {
    await prismaRaw.$executeRaw`UPDATE "axhy"."Company" SET "aiSpendDailyInr" = 0 WHERE id IN (${companyAId}::uuid, ${companyBId}::uuid)`;
    await Promise.all(Array.from({ length: 10 }, () => incrementSpend(companyAId, 1.5, prismaRaw)));
    const a = await prismaRaw.company.findUniqueOrThrow({
      where: { id: companyAId },
      select: { aiSpendDailyInr: true },
    });
    const b = await prismaRaw.company.findUniqueOrThrow({
      where: { id: companyBId },
      select: { aiSpendDailyInr: true },
    });
    expect(Number(a.aiSpendDailyInr)).toBe(15.0);
    expect(Number(b.aiSpendDailyInr)).toBe(0);
  });

  it('zero-cost is a no-op (no DB write, no error)', async () => {
    await prismaRaw.$executeRaw`UPDATE "axhy"."Company" SET "aiSpendDailyInr" = 100 WHERE id = ${companyAId}::uuid`;
    await incrementSpend(companyAId, 0, prismaRaw);
    const after = await prismaRaw.company.findUniqueOrThrow({
      where: { id: companyAId },
      select: { aiSpendDailyInr: true },
    });
    expect(Number(after.aiSpendDailyInr)).toBe(100);
  });

  it('negative cost throws (defensive — never trust upstream usage shape)', async () => {
    await expect(incrementSpend(companyAId, -1, prismaRaw)).rejects.toThrow(/invalid costInr/);
  });

  it('NaN cost throws', async () => {
    await expect(incrementSpend(companyAId, Number.NaN, prismaRaw)).rejects.toThrow(
      /invalid costInr/,
    );
  });

  it('missing tenant id throws (caller passed stale uuid)', async () => {
    const fakeUuid = '00000000-0000-0000-0000-000000000000';
    await expect(incrementSpend(fakeUuid, 1, prismaRaw)).rejects.toThrow(/no Company row matched/);
  });

  it('decimal precision — sub-paise increment math is preserved', async () => {
    await prismaRaw.$executeRaw`UPDATE "axhy"."Company" SET "aiSpendDailyInr" = 0 WHERE id = ${companyAId}::uuid`;
    await incrementSpend(companyAId, 0.1234, prismaRaw);
    await incrementSpend(companyAId, 0.5678, prismaRaw);
    const after = await prismaRaw.company.findUniqueOrThrow({
      where: { id: companyAId },
      select: { aiSpendDailyInr: true },
    });
    expect(Number(after.aiSpendDailyInr)).toBeCloseTo(0.6912, 4);
  });
});
