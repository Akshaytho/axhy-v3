/**
 * Real-DB integration test for the LivingDoc moat — Wave 4b Phase 2.5
 * refactor.
 *
 * Replaces the prior shadow-implementation pattern (the test re-created
 * the /chat/apply route logic inline) with REAL ROUTE HITS via
 * `injectAuthed`. Adds cross-COMPANY isolation across 5 tenants — the
 * critical multi-tenant safety proof that was missing in Phase 2.
 *
 * Cases:
 *   1. first-read upsert: getLivingDoc creates row + version=0
 *   2. Tier 2 round-trip: seeded rule appears in formatLivingDocPrompt block
 *   3. /chat/apply real route: rule append + version bump + AuditEvent
 *   4. prompt_cache_key shape changes when version increments
 *   5. cross-supervisor isolation (within same tenant)
 *   6. cross-COMPANY isolation (5 tenants — the Tier-1 fix)
 *
 * @derives(master-plan §G)
 * @derives(ADR-0023)
 * @derives(spec-2 §3.5, §6, §8)
 */

import { describe, it, expect } from 'vitest';
import { PrismaClient, Prisma } from '@prisma/client';

import { getLivingDoc } from '../src/lib/living-doc.js';
import { formatLivingDocPrompt } from '../src/lib/living-doc-prompt.js';

import { withMultipleTenants } from './_helpers/with-multiple-tenants.js';
import { injectAuthed } from './_helpers/route-helpers.js';

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

describe('LivingDoc — Phase 2.5 (refactored to withMultipleTenants)', () => {
  it('case 1: first-read upsert returns empty doc; row inserted with version=0', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prisma },
      async ({ tenants }) => {
        const t = tenants[0]!;
        const sup = t.supervisors[0]!;
        const doc = await getLivingDoc(prisma, t.companyId, sup.userId);
        expect(doc.companyId).toBe(t.companyId);
        expect(doc.supervisorId).toBe(sup.userId);
        expect(doc.version).toBe(0);
        expect(doc.siteRules).toEqual([]);
        expect(doc.workerNotes).toEqual([]);
        expect(doc.clientPreferences).toEqual([]);
        expect(doc.recurringTasks).toEqual([]);
        expect(doc.freeNotes).toEqual([]);

        const row = await prisma.livingDoc.findUnique({
          where: { companyId_supervisorId: { companyId: t.companyId, supervisorId: sup.userId } },
        });
        expect(row).not.toBeNull();
        expect(row?.version).toBe(0);
      },
    );
  }, 60_000);

  it('case 2: Tier 2 round-trip — seeded rule appears in formatted prompt block', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prisma },
      async ({ tenants }) => {
        const t = tenants[0]!;
        const sup = t.supervisors[0]!;
        const rule = {
          id: '00000000-0000-0000-0000-000000000001',
          ruleText: 'Mukesh tends to be 5 min late on rainy days',
          description: 'Worker punctuality pattern from prior chat history.',
          visibility: 'SUPERVISOR_OWN',
          scope: {},
          createdAt: new Date().toISOString(),
          createdBy: 'supervisor',
          state: 'ACTIVE',
          source: {},
        };
        await prisma.livingDoc.upsert({
          where: { companyId_supervisorId: { companyId: t.companyId, supervisorId: sup.userId } },
          create: {
            companyId: t.companyId,
            supervisorId: sup.userId,
            workerNotes: [rule] as unknown as Prisma.InputJsonValue,
          },
          update: {
            workerNotes: [rule] as unknown as Prisma.InputJsonValue,
          },
        });

        const doc = await getLivingDoc(prisma, t.companyId, sup.userId);
        expect(doc.workerNotes).toHaveLength(1);
        expect(doc.workerNotes[0]?.ruleText).toBe(rule.ruleText);

        const block = formatLivingDocPrompt(doc);
        expect(block).toContain('Worker notes');
        expect(block).toContain(rule.ruleText);
        expect(block).toContain('1 active rule');
      },
    );
  }, 60_000);

  it('case 3: /chat/apply real route — rule append + version bump + AuditEvent', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prisma },
      async ({ tenants, app }) => {
        const t = tenants[0]!;
        const sup = t.supervisors[0]!;

        const res = await injectAuthed(app, sup, {
          method: 'POST',
          url: '/chat/apply',
          body: {
            chatMessageId: '00000000-0000-0000-0000-000000000abc',
            toolName: 'propose_living_doc_update',
            toolInput: {
              section: 'client_preferences',
              visibility: 'COMPANY',
              ruleText: 'Apollo Hospital prefers AC off after midnight',
              description: 'Client preference, year-round.',
              scope: {},
            },
          },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { ruleId: string; version: number };
        expect(body.ruleId).toBeDefined();
        expect(body.version).toBe(1);

        // Verify rule landed in correct section + version bumped
        const final = await prisma.livingDoc.findUniqueOrThrow({
          where: {
            companyId_supervisorId: { companyId: t.companyId, supervisorId: sup.userId },
          },
        });
        expect(final.version).toBe(1);
        const cps = final.clientPreferences as unknown as Array<{ id: string; ruleText: string }>;
        expect(cps).toHaveLength(1);
        expect(cps[0]?.id).toBe(body.ruleId);
        expect(cps[0]?.ruleText).toBe('Apollo Hospital prefers AC off after midnight');

        // Verify AuditEvent
        const audit = await prisma.auditEvent.findFirst({
          where: {
            companyId: t.companyId,
            kind: 'LIVING_DOC_RULE_ADDED',
            targetId: body.ruleId,
          },
        });
        expect(audit).not.toBeNull();
        const payload = audit?.payload as { section?: string; version?: number };
        expect(payload?.section).toBe('client_preferences');
        expect(payload?.version).toBe(1);
      },
    );
  }, 60_000);

  it('case 4: prompt_cache_key shape changes on version bump', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 1, prisma },
      async ({ tenants }) => {
        const t = tenants[0]!;
        const sup = t.supervisors[0]!;
        const docV0 = await getLivingDoc(prisma, t.companyId, sup.userId);
        const keyV0 = `${t.companyId}:${sup.userId}:v${docV0.version}`;
        expect(keyV0).toMatch(/:v0$/);

        await prisma.livingDoc.update({
          where: { companyId_supervisorId: { companyId: t.companyId, supervisorId: sup.userId } },
          data: { version: { increment: 5 } },
        });
        const docV5 = await getLivingDoc(prisma, t.companyId, sup.userId);
        const keyV5 = `${t.companyId}:${sup.userId}:v${docV5.version}`;
        expect(keyV5).not.toBe(keyV0);
        expect(keyV5).toMatch(/:v5$/);
      },
    );
  }, 60_000);

  it('case 5: cross-supervisor isolation within same tenant', async () => {
    await withMultipleTenants(
      { count: 1, supervisorsPerTenant: 2, prisma },
      async ({ tenants }) => {
        const t = tenants[0]!;
        const supA = t.supervisors[0]!;
        const supB = t.supervisors[1]!;

        // SupA gets a rule (full LivingDocRule shape so zod parse accepts it
        // — coerceSection filters out malformed rules during read).
        const rule = {
          id: '00000000-0000-0000-0000-000000000aaa',
          ruleText: 'A-only',
          description: 'Test rule for cross-supervisor isolation',
          visibility: 'SUPERVISOR_OWN',
          scope: {},
          createdAt: new Date().toISOString(),
          createdBy: 'supervisor',
          state: 'ACTIVE',
          source: {},
        };
        await prisma.livingDoc.upsert({
          where: { companyId_supervisorId: { companyId: t.companyId, supervisorId: supA.userId } },
          create: {
            companyId: t.companyId,
            supervisorId: supA.userId,
            workerNotes: [rule] as unknown as Prisma.InputJsonValue,
          },
          update: {
            workerNotes: [rule] as unknown as Prisma.InputJsonValue,
          },
        });

        const docA = await getLivingDoc(prisma, t.companyId, supA.userId);
        const docB = await getLivingDoc(prisma, t.companyId, supB.userId);
        expect(docA.workerNotes).toHaveLength(1);
        expect(docB.workerNotes).toHaveLength(0);
      },
    );
  }, 60_000);

  it('case 6 (TIER-1 FIX): cross-COMPANY isolation across 5 tenants', async () => {
    // The headline new test. 5 separate tenant companies; supervisor 0 in
    // tenant 0 saves a rule via the real /chat/apply route. We then assert
    // every other tenant's docs remain empty — proving no cross-tenant
    // bleed at the route + DB layer.
    await withMultipleTenants(
      { count: 5, supervisorsPerTenant: 1, prisma },
      async ({ tenants, app }) => {
        const tenantZero = tenants[0]!;
        const supZero = tenantZero.supervisors[0]!;

        // Tenant 0's supervisor saves a rule via REAL route
        const res = await injectAuthed(app, supZero, {
          method: 'POST',
          url: '/chat/apply',
          body: {
            chatMessageId: '00000000-0000-0000-0000-000000000def',
            toolName: 'propose_living_doc_update',
            toolInput: {
              section: 'site_rules',
              visibility: 'COMPANY',
              ruleText: 'Tenant 0 secret rule — should NOT leak to tenants 1-4',
              description: 'Tenant 0 only.',
              scope: {},
            },
          },
        });
        expect(res.statusCode).toBe(200);

        // Tenant 0 has the rule
        const t0Doc = await getLivingDoc(prisma, tenantZero.companyId, supZero.userId);
        expect(t0Doc.siteRules).toHaveLength(1);
        expect(t0Doc.siteRules[0]?.ruleText).toContain('Tenant 0 secret rule');

        // Every other tenant's doc must be empty
        for (let i = 1; i < tenants.length; i++) {
          const otherTenant = tenants[i]!;
          const otherSup = otherTenant.supervisors[0]!;
          const otherDoc = await getLivingDoc(prisma, otherTenant.companyId, otherSup.userId);
          expect(otherDoc.siteRules).toEqual([]);
          expect(otherDoc.workerNotes).toEqual([]);
          expect(otherDoc.clientPreferences).toEqual([]);
          expect(otherDoc.recurringTasks).toEqual([]);
          expect(otherDoc.freeNotes).toEqual([]);
          expect(otherDoc.version).toBe(0);
        }

        // Audit event must also be tenant-scoped
        const tenantZeroAudits = await prisma.auditEvent.count({
          where: { companyId: tenantZero.companyId, kind: 'LIVING_DOC_RULE_ADDED' },
        });
        expect(tenantZeroAudits).toBe(1);
        for (let i = 1; i < tenants.length; i++) {
          const otherTenant = tenants[i]!;
          const otherAudits = await prisma.auditEvent.count({
            where: { companyId: otherTenant.companyId, kind: 'LIVING_DOC_RULE_ADDED' },
          });
          expect(otherAudits).toBe(0);
        }
      },
    );
  }, 120_000);
});
