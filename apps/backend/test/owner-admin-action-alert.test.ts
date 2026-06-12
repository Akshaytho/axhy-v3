/**
 * GAP 7 (docs/locked/security-gaps-to-fix.md:59-63) — OWNER alert on admin
 * actions. Policy writes already notify owners (policy-service.ts
 * emitOwnerNotificationsForPolicyChange); this suite covers the MEMBERSHIP-ADD
 * surface, which was missing the same emission.
 *
 * Proves, against the real DB through the real route:
 *   1. HR creating a SUPERVISOR membership → in-tx Notification row
 *      (kind 'membership_created', in_app_banner) for every ACTIVE OWNER.
 *   2. The acting user never gets notified about their own action
 *      (owner creating a membership → no self-notification).
 *   3. Tenant isolation: owners of OTHER companies get nothing.
 *
 * @derives(docs/locked/security-gaps-to-fix.md GAP 7)
 * @derives(feedback_tests_must_prove_the_bug_existed.md)
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { PrismaClient } from '@prisma/client';

import { withMultipleTenants } from './_helpers/with-multiple-tenants.js';

const prisma = new PrismaClient();

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GAP 7 — owner alert on membership-add', () => {
  test('HR-created membership notifies ACTIVE owners (and only them)', async () => {
    await withMultipleTenants(
      { count: 2, supervisorsPerTenant: 1, prisma, prefix: `gap7-${Date.now()}-` },
      async ({ tenants, app }) => {
        const tenantA = tenants[0]!;
        const tenantB = tenants[1]!;

        // Seed an OWNER + an HR actor on tenant A, and an OWNER on tenant B
        // (the cross-tenant negative control).
        const mkUserWithRole = async (companyId: string, role: 'OWNER' | 'HR', tag: string) => {
          const phone = `+9176${String(Date.now() + Math.floor(Math.random() * 1_000_000)).slice(-8)}`;
          const user = await prisma.user.create({
            data: { phone, name: `${tag}-${role}`, locale: 'en' },
          });
          const membership = await prisma.membership.create({
            data: { companyId, userId: user.id, role, status: 'ACTIVE' },
          });
          const { issueAccessToken } = await import('../src/lib/jwt.js');
          const accessToken = await issueAccessToken({
            userId: user.id,
            companyId,
            role,
            availableRoles: [role],
            locale: 'en',
            membershipId: membership.id,
            epoch: membership.tokenEpoch,
          });
          return { userId: user.id, accessToken };
        };

        const ownerA = await mkUserWithRole(tenantA.companyId, 'OWNER', 'A');
        const hrA = await mkUserWithRole(tenantA.companyId, 'HR', 'A');
        const ownerB = await mkUserWithRole(tenantB.companyId, 'OWNER', 'B');

        // ── 1. HR adds a SUPERVISOR → owner A notified ───────────────────
        const newSupPhone = `+9175${String(Date.now()).slice(-8)}`;
        const res = await app.inject({
          method: 'POST',
          url: '/admin/memberships',
          headers: { authorization: `Bearer ${hrA.accessToken}` },
          payload: {
            phone: newSupPhone,
            name: 'Gap7 New Supervisor',
            role: 'SUPERVISOR',
            baseSalaryPaise: 1_500_000,
          },
        });
        expect(res.statusCode).toBe(200);

        const ownerANotifs = await prisma.notification.findMany({
          where: {
            companyId: tenantA.companyId,
            audienceUserId: ownerA.userId,
            kind: 'membership_created',
          },
        });
        expect(ownerANotifs.length).toBe(1);
        const payload = ownerANotifs[0]!.payload as Record<string, unknown>;
        expect(payload.actorUserId).toBe(hrA.userId);
        expect(payload.targetRole).toBe('SUPERVISOR');
        expect(ownerANotifs[0]!.channel).toBe('in_app_banner');

        // The HR actor gets nothing about their own action.
        const actorNotifs = await prisma.notification.count({
          where: {
            companyId: tenantA.companyId,
            audienceUserId: hrA.userId,
            kind: 'membership_created',
          },
        });
        expect(actorNotifs).toBe(0);

        // ── 2. Cross-tenant: owner B sees nothing ────────────────────────
        const ownerBNotifs = await prisma.notification.count({
          where: { audienceUserId: ownerB.userId, kind: 'membership_created' },
        });
        expect(ownerBNotifs).toBe(0);

        // ── 3. Owner-created membership → no self-notification ───────────
        const newHrPhone = `+9174${String(Date.now()).slice(-8)}`;
        const res2 = await app.inject({
          method: 'POST',
          url: '/admin/memberships',
          headers: { authorization: `Bearer ${ownerA.accessToken}` },
          payload: {
            phone: newHrPhone,
            name: 'Gap7 New HR',
            role: 'HR',
            baseSalaryPaise: 2_000_000,
          },
        });
        expect(res2.statusCode).toBe(200);
        const ownerASelfNotifs = await prisma.notification.findMany({
          where: {
            companyId: tenantA.companyId,
            audienceUserId: ownerA.userId,
            kind: 'membership_created',
          },
        });
        // Still exactly the ONE from step 1 — no self-notification added.
        expect(ownerASelfNotifs.length).toBe(1);

        // Tidy the rows this test created (tenants helper cascades the rest).
        await prisma.notification.deleteMany({
          where: { companyId: { in: [tenantA.companyId, tenantB.companyId] } },
        });
      },
    );
  }, 120000);
});
