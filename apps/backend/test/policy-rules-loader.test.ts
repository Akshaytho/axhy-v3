/**
 * Real-DB tests for the policy-rules-loader.
 *
 * Covers the chat-side reads of Layer 1 (Company) + Layer 2 (HR) rules
 * from the Policy table for prompt composition.
 *
 * Per docs/locked/operational-invariants.md INV 8 (Policy is append-only):
 *  - Multiple rows per key — we read the most-recent
 *  - value=null is the deletion sentinel — we skip it
 *
 * Per docs/locked/chat-abuse-prevention.md Limits:
 *  - Max 50 rules per layer (defense-in-depth in the loader)
 *  - Max 500 chars per rule text (truncated by the loader)
 *
 * @derives(plans/abstract-wandering-kazoo.md Phase 2)
 */

import { describe, it, expect } from 'vitest';
import { PrismaClient } from '@prisma/client';

import { loadCompanyRules, loadHrRules } from '../src/lib/policy-rules-loader.js';
import { withTenantContext } from '../src/middleware/tenant-context.js';

import { withMultipleTenants } from './_helpers/with-multiple-tenants.js';

const prisma = new PrismaClient();

const ACTOR_ID = '00000000-0000-0000-0000-000000000001';

describe('loadCompanyRules', () => {
  it('returns empty array when no company rules exist', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `prl-empty-${Date.now()}-`, prisma },
      async ({ tenants }) => {
        const tenant = tenants[0]!;
        const rules = await withTenantContext(prisma, tenant.companyId, async (tx) =>
          loadCompanyRules(tx, tenant.companyId),
        );
        expect(rules).toEqual([]);
      },
    );
  });

  it('returns a single rule when one Policy row exists', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `prl-1rule-${Date.now()}-`, prisma },
      async ({ tenants }) => {
        const tenant = tenants[0]!;
        // Need a valid User row for setBy FK — use the supervisor that
        // withMultipleTenants already created.
        const actorId = tenant.supervisors[0]!.userId;
        await prisma.policy.create({
          data: {
            companyId: tenant.companyId,
            key: 'ai.rules.company.uniform_required',
            value: 'All workers must wear ID badges',
            setBy: actorId,
            category: 'ai',
          },
        });

        const rules = await withTenantContext(prisma, tenant.companyId, async (tx) =>
          loadCompanyRules(tx, tenant.companyId),
        );
        expect(rules).toHaveLength(1);
        expect(rules[0]!.key).toBe('ai.rules.company.uniform_required');
        expect(rules[0]!.text).toBe('All workers must wear ID badges');

        // cleanup
        await prisma.policy.deleteMany({ where: { companyId: tenant.companyId } });
      },
    );
  });

  it('returns the most-recent value per key (append-only semantics)', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `prl-newest-${Date.now()}-`, prisma },
      async ({ tenants }) => {
        const tenant = tenants[0]!;
        const actorId = tenant.supervisors[0]!.userId;

        // Two rows for the same key — second should win
        await prisma.policy.create({
          data: {
            companyId: tenant.companyId,
            key: 'ai.rules.company.uniform_required',
            value: 'initial value',
            setBy: actorId,
            category: 'ai',
            setAt: new Date('2026-05-01T00:00:00Z'),
          },
        });
        await prisma.policy.create({
          data: {
            companyId: tenant.companyId,
            key: 'ai.rules.company.uniform_required',
            value: 'updated value',
            setBy: actorId,
            category: 'ai',
            setAt: new Date('2026-05-19T00:00:00Z'),
          },
        });

        const rules = await withTenantContext(prisma, tenant.companyId, async (tx) =>
          loadCompanyRules(tx, tenant.companyId),
        );
        expect(rules).toHaveLength(1);
        expect(rules[0]!.text).toBe('updated value');

        await prisma.policy.deleteMany({ where: { companyId: tenant.companyId } });
      },
    );
  });

  it('skips keys whose most-recent value is null (deletion sentinel)', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `prl-del-${Date.now()}-`, prisma },
      async ({ tenants }) => {
        const tenant = tenants[0]!;
        const actorId = tenant.supervisors[0]!.userId;

        await prisma.policy.create({
          data: {
            companyId: tenant.companyId,
            key: 'ai.rules.company.no_smoking',
            value: 'No smoking',
            setBy: actorId,
            category: 'ai',
            setAt: new Date('2026-05-01T00:00:00Z'),
          },
        });
        await prisma.policy.create({
          data: {
            companyId: tenant.companyId,
            key: 'ai.rules.company.no_smoking',
            // Prisma JSON: must explicitly use Prisma.JsonNull to write a
            // JSON null (vs SQL NULL).
            value: null as never,
            setBy: actorId,
            category: 'ai',
            setAt: new Date('2026-05-19T00:00:00Z'),
          },
        });

        const rules = await withTenantContext(prisma, tenant.companyId, async (tx) =>
          loadCompanyRules(tx, tenant.companyId),
        );
        expect(rules).toEqual([]);

        await prisma.policy.deleteMany({ where: { companyId: tenant.companyId } });
      },
    );
  });

  it('ignores keys outside the ai.rules.company.* namespace', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `prl-other-${Date.now()}-`, prisma },
      async ({ tenants }) => {
        const tenant = tenants[0]!;
        const actorId = tenant.supervisors[0]!.userId;

        await prisma.policy.create({
          data: {
            companyId: tenant.companyId,
            key: 'ai.rules.company.uniform_required',
            value: 'Wear badges',
            setBy: actorId,
            category: 'ai',
          },
        });
        await prisma.policy.create({
          data: {
            companyId: tenant.companyId,
            key: 'ai.rules.hr.max_leaves',
            value: 'Max 2 leaves/month',
            setBy: actorId,
            category: 'ai',
          },
        });
        await prisma.policy.create({
          data: {
            companyId: tenant.companyId,
            key: 'sla.default',
            value: 30,
            setBy: actorId,
            category: 'sla',
          },
        });

        const companyRules = await withTenantContext(prisma, tenant.companyId, async (tx) =>
          loadCompanyRules(tx, tenant.companyId),
        );
        expect(companyRules).toHaveLength(1);
        expect(companyRules[0]!.key).toBe('ai.rules.company.uniform_required');

        const hrRules = await withTenantContext(prisma, tenant.companyId, async (tx) =>
          loadHrRules(tx, tenant.companyId),
        );
        expect(hrRules).toHaveLength(1);
        expect(hrRules[0]!.key).toBe('ai.rules.hr.max_leaves');

        await prisma.policy.deleteMany({ where: { companyId: tenant.companyId } });
      },
    );
  });

  it('truncates rule text > 500 chars', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `prl-trunc-${Date.now()}-`, prisma },
      async ({ tenants }) => {
        const tenant = tenants[0]!;
        const actorId = tenant.supervisors[0]!.userId;

        const longText = 'X'.repeat(800);
        await prisma.policy.create({
          data: {
            companyId: tenant.companyId,
            key: 'ai.rules.company.long',
            value: longText,
            setBy: actorId,
            category: 'ai',
          },
        });

        const rules = await withTenantContext(prisma, tenant.companyId, async (tx) =>
          loadCompanyRules(tx, tenant.companyId),
        );
        expect(rules).toHaveLength(1);
        expect(rules[0]!.text.length).toBe(500);

        await prisma.policy.deleteMany({ where: { companyId: tenant.companyId } });
      },
    );
  });

  it('supports object-shaped values via { text: "..." }', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prefix: `prl-obj-${Date.now()}-`, prisma },
      async ({ tenants }) => {
        const tenant = tenants[0]!;
        const actorId = tenant.supervisors[0]!.userId;

        await prisma.policy.create({
          data: {
            companyId: tenant.companyId,
            key: 'ai.rules.company.structured',
            value: { text: 'rule body inside object', active: true },
            setBy: actorId,
            category: 'ai',
          },
        });

        const rules = await withTenantContext(prisma, tenant.companyId, async (tx) =>
          loadCompanyRules(tx, tenant.companyId),
        );
        expect(rules).toHaveLength(1);
        expect(rules[0]!.text).toBe('rule body inside object');

        await prisma.policy.deleteMany({ where: { companyId: tenant.companyId } });
      },
    );
  });
});

describe('cross-tenant isolation', () => {
  it('Tenant A rules do not leak into Tenant B reads', async () => {
    await withMultipleTenants(
      { count: 2, supervisorsPerTenant: 1, prefix: `prl-xt-${Date.now()}-`, prisma },
      async ({ tenants }) => {
        const tenantA = tenants[0]!;
        const tenantB = tenants[1]!;
        const actorA = tenantA.supervisors[0]!.userId;

        await prisma.policy.create({
          data: {
            companyId: tenantA.companyId,
            key: 'ai.rules.company.tenant_a_only',
            value: 'tenant A secret rule',
            setBy: actorA,
            category: 'ai',
          },
        });

        const aRules = await withTenantContext(prisma, tenantA.companyId, async (tx) =>
          loadCompanyRules(tx, tenantA.companyId),
        );
        expect(aRules).toHaveLength(1);

        const bRules = await withTenantContext(prisma, tenantB.companyId, async (tx) =>
          loadCompanyRules(tx, tenantB.companyId),
        );
        expect(bRules).toEqual([]);

        await prisma.policy.deleteMany({ where: { companyId: tenantA.companyId } });
      },
    );
  });
});
