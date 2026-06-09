/**
 * #16 — tenant daily AI-budget projection. Real-DB lab test.
 *
 * assertTenantDailyBudget is the cumulative daily-budget check the tool loop now
 * re-runs per iteration (with the turn's accumulated real cost), so a multi-step
 * turn can't overshoot the cap. This verifies the projection: a tiny projected
 * cost passes; a projection over the daily cap throws AICostBudgetError.
 *
 * Run on the lab:
 *   cd apps/backend && DATABASE_URL="postgresql://postgres@localhost:5433/postgres" \
 *   npx vitest run test/ai-budget.test.ts
 *
 * @derives(PRODUCTION_BUG_LEDGER.md #16)
 */
import crypto from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { assertTenantDailyBudget, AICostBudgetError } from '@axhy/ai-tools';

import { prisma } from '../src/lib/prisma.js';

const companyId = crypto.randomUUID();
const sfx = crypto.randomBytes(4).toString('hex');

describe('#16 — assertTenantDailyBudget projection', () => {
  beforeAll(async () => {
    await prisma.company.create({
      data: {
        id: companyId,
        name: `bud-${sfx}`,
        slug: `bud-${sfx}`,
        ownerPhone: `+9193${sfx.slice(0, 4)}`,
        ownerName: 'BUD',
      },
    });
  });

  afterAll(async () => {
    await prisma.outbox.deleteMany({ where: { companyId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.$disconnect();
  });

  it('passes when the projected cost is well under the daily cap', async () => {
    await expect(assertTenantDailyBudget({ companyId, prisma }, 0.01)).resolves.toBeUndefined();
  });

  it('throws AICostBudgetError when the projection exceeds the daily cap', async () => {
    await expect(assertTenantDailyBudget({ companyId, prisma }, 9_999_999)).rejects.toBeInstanceOf(
      AICostBudgetError,
    );
  });
});
