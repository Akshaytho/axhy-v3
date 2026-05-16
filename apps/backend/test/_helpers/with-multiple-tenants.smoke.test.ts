/**
 * Smoke test for withMultipleTenants — proves the helper:
 *   1. Creates the requested fleet (5×2 by default)
 *   2. Issues distinct JWTs per supervisor
 *   3. Cleanly tears down on success
 *   4. Cleanly tears down on failure (no row leaks)
 *
 * If this test breaks, all multi-tenant tests downstream break.
 *
 * @derives(master-plan §G)
 * @derives(ADR-0023)
 */

import { describe, it, expect } from 'vitest';
import { PrismaClient } from '@prisma/client';

import { withMultipleTenants } from './with-multiple-tenants.js';

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

describe('withMultipleTenants — smoke', () => {
  it('default 5×2 fleet: creates + cleans up', async () => {
    const prefix = `smoke-default-${Date.now()}-`;
    let observedTenantsCount = 0;
    let observedSupervisorsCount = 0;
    const seenCompanyIds: string[] = [];

    await withMultipleTenants({ prefix, prisma }, async ({ tenants }) => {
      observedTenantsCount = tenants.length;
      observedSupervisorsCount = tenants.reduce((sum, t) => sum + t.supervisors.length, 0);
      for (const t of tenants) seenCompanyIds.push(t.companyId);

      // Distinct JWTs (no accidental token reuse)
      const tokens = tenants.flatMap((t) => t.supervisors.map((s) => s.accessToken));
      expect(new Set(tokens).size).toBe(tokens.length);
    });

    expect(observedTenantsCount).toBe(5);
    expect(observedSupervisorsCount).toBe(10);

    // Verify cleanup: no Company rows remain with our prefix
    const leftover = await prisma.company.count({
      where: { id: { in: seenCompanyIds } },
    });
    expect(leftover).toBe(0);
  }, 60_000);

  it('count: 3 override creates 3×2 fleet', async () => {
    const prefix = `smoke-override-${Date.now()}-`;
    let observedCount = 0;

    await withMultipleTenants({ count: 3, prefix, prisma }, async ({ tenants }) => {
      observedCount = tenants.length;
    });

    expect(observedCount).toBe(3);
  }, 30_000);

  it('cleans up even when fn throws', async () => {
    const prefix = `smoke-throw-${Date.now()}-`;
    const seenCompanyIds: string[] = [];

    await expect(
      withMultipleTenants({ count: 2, prefix, prisma }, async ({ tenants }) => {
        for (const t of tenants) seenCompanyIds.push(t.companyId);
        throw new Error('intentional test failure');
      }),
    ).rejects.toThrow('intentional test failure');

    // Cleanup should still have run despite the throw
    const leftover = await prisma.company.count({
      where: { id: { in: seenCompanyIds } },
    });
    expect(leftover).toBe(0);
  }, 30_000);
});
