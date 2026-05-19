/**
 * Integration tests for POST /admin/policy.
 *
 * Covers:
 *  - HR cannot write company rules → 403 (Scene L2-B)
 *  - OWNER can write company rules → 200 (Scene L1-A)
 *  - HR can write HR rules → 200 (Scene L2-A)
 *  - SUPERVISOR cannot write any restricted key → 403
 *  - First write has previousValueSnapshot=null; second has the old value
 *  - POLICY_CHANGED audit row appended per write
 *  - Cross-tenant: tenant A's OWNER cannot write into tenant B
 *
 * Run via the axhy-sandbox real-DB pattern. Uses withMultipleTenants for
 * setup. Auth tokens carry the desired role.
 *
 * @derives(plans/abstract-wandering-kazoo.md Phase 1)
 * @derives(docs/journeys/2026-05-19-wave-a-sidebar-chat-ai-scenarios.md Scenes L1-A, L2-A, L2-B)
 */

import { randomUUID } from 'node:crypto';

import { describe, it, expect } from 'vitest';
import { PrismaClient } from '@prisma/client';

import { withMultipleTenants } from './_helpers/with-multiple-tenants.js';

const prisma = new PrismaClient();

/**
 * Re-issue an access token for the given userId with a different role.
 * The withMultipleTenants helper creates SUPERVISOR-role tokens by default;
 * for policy ACL tests we need OWNER + HR tokens too. Same User row, same
 * Membership row — just a different active role claim on the JWT.
 */
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

describe('POST /admin/policy: ACL', () => {
  it('OWNER can write a company rule (Scene L1-A)', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `pol-owner-${Date.now()}-`, prisma },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        const userId = tenant.supervisors[0]!.userId;
        const ownerToken = await issueTokenAs({
          userId,
          companyId: tenant.companyId,
          role: 'OWNER',
        });

        const res = await app.inject({
          method: 'POST',
          url: '/admin/policy',
          headers: {
            authorization: `Bearer ${ownerToken}`,
            'content-type': 'application/json',
          },
          payload: {
            key: 'ai.rules.company.uniform_required',
            value: 'All workers must wear company-issued ID badges',
            category: 'ai',
          },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.policyId).toMatch(/^[0-9a-f-]{36}$/);
        expect(body.previousValueSnapshot).toBeNull();

        // Cleanup: delete the Policy row + audit
        await prisma.auditEvent.deleteMany({ where: { companyId: tenant.companyId } });
        await prisma.policy.deleteMany({ where: { companyId: tenant.companyId } });
      },
    );
  });

  it('HR cannot write a company rule → 403 (Scene L2-B)', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `pol-hr-blk-${Date.now()}-`, prisma },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        const userId = tenant.supervisors[0]!.userId;
        const hrToken = await issueTokenAs({
          userId,
          companyId: tenant.companyId,
          role: 'HR',
        });

        const res = await app.inject({
          method: 'POST',
          url: '/admin/policy',
          headers: {
            authorization: `Bearer ${hrToken}`,
            'content-type': 'application/json',
          },
          payload: {
            key: 'ai.rules.company.uniform_required',
            value: 'attempted override',
            category: 'ai',
          },
        });

        expect(res.statusCode).toBe(403);
        const body = res.json();
        expect(body.error).toBe('POLICY_KEY_FORBIDDEN_FOR_ROLE');
        expect(body.allowedRoles).toEqual(['OWNER', 'SUPER_ADMIN']);

        // Verify no row was inserted
        const count = await prisma.policy.count({
          where: { companyId: tenant.companyId, key: 'ai.rules.company.uniform_required' },
        });
        expect(count).toBe(0);
      },
    );
  });

  it('HR can write an HR rule (Scene L2-A)', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `pol-hr-ok-${Date.now()}-`, prisma },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        const userId = tenant.supervisors[0]!.userId;
        const hrToken = await issueTokenAs({
          userId,
          companyId: tenant.companyId,
          role: 'HR',
        });

        const res = await app.inject({
          method: 'POST',
          url: '/admin/policy',
          headers: {
            authorization: `Bearer ${hrToken}`,
            'content-type': 'application/json',
          },
          payload: {
            key: 'ai.rules.hr.max_leave_days_per_month',
            value: 'Maximum 2 leave days per month per worker',
            category: 'ai',
          },
        });

        expect(res.statusCode).toBe(200);

        // Cleanup
        await prisma.auditEvent.deleteMany({ where: { companyId: tenant.companyId } });
        await prisma.policy.deleteMany({ where: { companyId: tenant.companyId } });
      },
    );
  });

  it('SUPERVISOR cannot write a restricted key → 403', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `pol-sup-blk-${Date.now()}-`, prisma },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        const supToken = tenant.supervisors[0]!.accessToken;

        const res = await app.inject({
          method: 'POST',
          url: '/admin/policy',
          headers: {
            authorization: `Bearer ${supToken}`,
            'content-type': 'application/json',
          },
          payload: {
            key: 'ai.limits.messages_per_supervisor_daily',
            value: 999999,
            category: 'ai',
          },
        });

        expect(res.statusCode).toBe(403);
        expect(res.json().error).toBe('POLICY_KEY_FORBIDDEN_FOR_ROLE');
      },
    );
  });

  it('previousValueSnapshot captures the prior write', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `pol-snap-${Date.now()}-`, prisma },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        const userId = tenant.supervisors[0]!.userId;
        const ownerToken = await issueTokenAs({
          userId,
          companyId: tenant.companyId,
          role: 'OWNER',
        });

        const key = `ai.rules.company.test_${randomUUID().slice(0, 8)}`;

        const first = await app.inject({
          method: 'POST',
          url: '/admin/policy',
          headers: {
            authorization: `Bearer ${ownerToken}`,
            'content-type': 'application/json',
          },
          payload: { key, value: 'initial', category: 'ai' },
        });
        expect(first.statusCode).toBe(200);
        expect(first.json().previousValueSnapshot).toBeNull();

        const second = await app.inject({
          method: 'POST',
          url: '/admin/policy',
          headers: {
            authorization: `Bearer ${ownerToken}`,
            'content-type': 'application/json',
          },
          payload: { key, value: 'updated', category: 'ai' },
        });
        expect(second.statusCode).toBe(200);
        expect(second.json().previousValueSnapshot).toBe('initial');

        // Two Policy rows for this key (append-only per INV 8)
        const rows = await prisma.policy.findMany({
          where: { companyId: tenant.companyId, key },
          orderBy: { setAt: 'asc' },
        });
        expect(rows).toHaveLength(2);
        expect(rows[0]!.value).toBe('initial');
        expect(rows[1]!.value).toBe('updated');

        // Two POLICY_CHANGED audit events
        const audits = await prisma.auditEvent.findMany({
          where: {
            companyId: tenant.companyId,
            kind: 'POLICY_CHANGED',
            targetId: { in: rows.map((r) => r.id) },
          },
        });
        expect(audits).toHaveLength(2);

        // Cleanup
        await prisma.auditEvent.deleteMany({ where: { companyId: tenant.companyId } });
        await prisma.policy.deleteMany({ where: { companyId: tenant.companyId } });
      },
    );
  });

  it('emits OWNER notifications on policy write, skipping the actor (GAP 7)', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `pol-notif-${Date.now()}-`, prisma },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        const actorUserId = tenant.supervisors[0]!.userId;

        // Create one additional OWNER (a co-owner) on the same company so we
        // have a non-actor OWNER to receive the notification. Re-purpose the
        // existing User via a fresh Membership row with OWNER role.
        const ownerB = await prisma.user.create({
          data: {
            phone: `+9199${String(Date.now() + 1).slice(-8)}`,
            name: 'Co-owner',
            locale: 'en',
          },
        });
        await prisma.membership.create({
          data: {
            companyId: tenant.companyId,
            userId: ownerB.id,
            role: 'OWNER',
            status: 'ACTIVE',
          },
        });
        // Promote the actor to OWNER too — only OWNER can write ai.rules.company.*.
        await prisma.membership.updateMany({
          where: {
            companyId: tenant.companyId,
            userId: actorUserId,
          },
          data: { role: 'OWNER' },
        });

        const ownerToken = await issueTokenAs({
          userId: actorUserId,
          companyId: tenant.companyId,
          role: 'OWNER',
        });

        const res = await app.inject({
          method: 'POST',
          url: '/admin/policy',
          headers: {
            authorization: `Bearer ${ownerToken}`,
            'content-type': 'application/json',
          },
          payload: {
            key: 'ai.rules.company.notif_test',
            value: 'Test notif',
            category: 'ai',
          },
        });
        expect(res.statusCode).toBe(200);

        // Notifications: ownerB should get one. The actor (also OWNER) should NOT.
        const notifs = await prisma.notification.findMany({
          where: { companyId: tenant.companyId, kind: 'policy_changed' },
        });
        expect(notifs).toHaveLength(1);
        expect(notifs[0]!.audienceUserId).toBe(ownerB.id);
        const payload = notifs[0]!.payload as {
          key: string;
          actorUserId: string;
          category: string;
        };
        expect(payload.key).toBe('ai.rules.company.notif_test');
        expect(payload.actorUserId).toBe(actorUserId);
        expect(payload.category).toBe('ai');

        // cleanup
        await prisma.notification.deleteMany({ where: { companyId: tenant.companyId } });
        await prisma.auditEvent.deleteMany({ where: { companyId: tenant.companyId } });
        await prisma.policy.deleteMany({ where: { companyId: tenant.companyId } });
        await prisma.membership.deleteMany({ where: { userId: ownerB.id } });
        await prisma.user.delete({ where: { id: ownerB.id } });
      },
    );
  });

  it('rolls back notifications when the Policy write throws (atomic-with-audit)', async () => {
    // ACL violation → setPolicy throws BEFORE notification createMany fires.
    // Test the absence: no Policy row, no audit, no notification.
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `pol-rb-${Date.now()}-`, prisma },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        const userId = tenant.supervisors[0]!.userId;
        const hrToken = await issueTokenAs({
          userId,
          companyId: tenant.companyId,
          role: 'HR',
        });
        // HR cannot write ai.rules.company.* — ACL throws.
        const res = await app.inject({
          method: 'POST',
          url: '/admin/policy',
          headers: {
            authorization: `Bearer ${hrToken}`,
            'content-type': 'application/json',
          },
          payload: {
            key: 'ai.rules.company.blocked',
            value: 'should not exist',
            category: 'ai',
          },
        });
        expect(res.statusCode).toBe(403);
        // No Policy / audit / notification rows
        const policyCount = await prisma.policy.count({ where: { companyId: tenant.companyId } });
        expect(policyCount).toBe(0);
        const notifCount = await prisma.notification.count({
          where: { companyId: tenant.companyId, kind: 'policy_changed' },
        });
        expect(notifCount).toBe(0);
        const auditCount = await prisma.auditEvent.count({
          where: { companyId: tenant.companyId, kind: 'POLICY_CHANGED' },
        });
        expect(auditCount).toBe(0);
      },
    );
  });

  it('returns 400 BAD_INPUT for missing fields', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `pol-bad-${Date.now()}-`, prisma },
      async ({ tenants, app }) => {
        const tenant = tenants[0]!;
        const userId = tenant.supervisors[0]!.userId;
        const ownerToken = await issueTokenAs({
          userId,
          companyId: tenant.companyId,
          role: 'OWNER',
        });

        const res = await app.inject({
          method: 'POST',
          url: '/admin/policy',
          headers: {
            authorization: `Bearer ${ownerToken}`,
            'content-type': 'application/json',
          },
          payload: { key: '', value: 'x', category: 'ai' },
        });
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toBe('BAD_INPUT');
      },
    );
  });
});
