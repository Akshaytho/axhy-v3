/**
 * Integration tests for GET /admin/owner-summary.
 *
 * Covers:
 *  - OWNER can fetch owner summary -> 200
 *  - Gated by OWNER / SUPER_ADMIN roles -> other roles get 403
 *  - Response matches expected structure with active counts and policies
 *
 * @derives(master-plan §G)
 * @derives(office_profiles_specification.md)
 */

import { describe, it, expect } from 'vitest';
import { PrismaClient } from '@prisma/client';

import { withMultipleTenants } from './_helpers/with-multiple-tenants.js';

const prisma = new PrismaClient();

async function issueTokenAs(args: {
  userId: string;
  companyId: string;
  role: 'OWNER' | 'HR' | 'SUPERVISOR' | 'WORKER' | 'SUPER_ADMIN';
}): Promise<string> {
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);
  const { issueAccessToken } = await import('../src/lib/jwt.js');
  return issueAccessToken({
    userId: args.userId,
    companyId: args.companyId,
    role: args.role,
    availableRoles: [args.role],
    locale: 'en',
  });
}

describe('GET /admin/owner-summary', () => {
  it('OWNER can retrieve company stats and policies', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `owner-sum-${Date.now()}-`, prisma },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        const userId = tenant.supervisors[0]!.userId;
        const ownerToken = await issueTokenAs({
          userId,
          companyId: tenant.companyId,
          role: 'OWNER',
        });

        // Write a mock policy row so we verify policy list is returned
        await prisma.policy.create({
          data: {
            companyId: tenant.companyId,
            key: 'ai.limits.daily_spend_cap',
            value: 800,
            category: 'ai',
            setBy: userId,
          },
        });

        const res = await app.inject({
          method: 'GET',
          url: '/admin/owner-summary',
          headers: {
            authorization: `Bearer ${ownerToken}`,
          },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body).toHaveProperty('company');
        expect(body.company.id).toBe(tenant.companyId);
        expect(body).toHaveProperty('stats');
        expect(body.stats).toHaveProperty('activeWorkers');
        expect(body.stats).toHaveProperty('activeSites');
        expect(body.stats).toHaveProperty('absentWorkersToday');
        expect(body.stats).toHaveProperty('pendingReviews');
        expect(body).toHaveProperty('policies');
        expect(body.policies).toHaveLength(1);
        expect(body.policies[0].key).toBe('ai.limits.daily_spend_cap');
        expect(body.policies[0].value).toBe(800);

        // Cleanup
        await prisma.policy.deleteMany({ where: { companyId: tenant.companyId } });
      },
    );
  });

  it('SUPERVISOR cannot retrieve owner summary -> 403', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `owner-sum-sup-${Date.now()}-`, prisma },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        const supToken = tenant.supervisors[0]!.accessToken;

        const res = await app.inject({
          method: 'GET',
          url: '/admin/owner-summary',
          headers: {
            authorization: `Bearer ${supToken}`,
          },
        });

        expect(res.statusCode).toBe(403);
        expect(res.json().error).toBe('FORBIDDEN_WRONG_ROLE');
      },
    );
  });
});
