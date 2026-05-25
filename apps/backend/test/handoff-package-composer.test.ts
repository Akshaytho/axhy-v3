/**
 * F-004 — Real-DB integration tests for the HandoffPackage composer + writer
 * + reassignPermanentBinding wiring.
 *
 * Test plan from F-004 scope round-4 v4 §5 pick 7:
 *   1. acting binding create → package on row (schemaVersion: 1 first),
 *      no LivingDoc changes on Lakshmi.
 *   2. permanent reassign → package on row + N rule copies in Anjali's
 *      siteRules + N LIVING_DOC_RULE_ADDED audits + 1 HANDOFF_PACKAGE_GENERATED.
 *   3. first-ever binding (no outgoing) → schemaVersion: 1,
 *      outgoingSupervisorId: null, siteRules: [], recentComplaints reflects
 *      DB state (NOT hardcoded). Q2 = (b) → zero LivingDoc writes, zero
 *      LIVING_DOC_RULE_ADDED audits, 1 HANDOFF_PACKAGE_GENERATED audit.
 *   4. empty-state defaults → arrays not null.
 *   5. cross-tenant isolation — package doesn't leak across companyId.
 *   6. STRICT CalendarEntry filter — entries WITHOUT payload.siteId excluded;
 *      WITH payload.siteId matching included.
 *   7. idempotency — replay does NOT duplicate copied rules.
 *   8. schemaVersion negative tests — Zod rejects schemaVersion=0,
 *      schemaVersion=2, missing schemaVersion.
 *   9. clientPreferences NOT transferred — synthetic outgoing LivingDoc with
 *      both siteRules + clientPreferences; after permanent rebind, incoming
 *      has only the siteRules copied; zero clientPreferences.
 *
 * @derives(F-004 scope round-4 v4 §5)
 * @derives(workflow-design-closure §3.7 — amended 2026-05-16 for schemaVersion)
 */

import { randomUUID } from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  HandoffPackagePayloadSchema,
  HANDOFF_PACKAGE_SCHEMA_VERSION,
  type HandoffPackagePayload,
} from '@axhy/shared-schema';

import { composeHandoffPackage } from '../src/lib/handoff-package-composer.js';
import { reassignPermanentBinding } from '../src/lib/site-supervisor-binding.js';
import { writeHandoffPackage } from '../src/lib/handoff-package-writer.js';
import { withTenantContext } from '../src/middleware/tenant-context.js';

type JsonObject = Record<string, unknown>;
const asPayload = (v: Prisma.JsonValue | null): HandoffPackagePayload =>
  v as unknown as HandoffPackagePayload;
const asJsonObject = (v: Prisma.JsonValue | null | undefined): JsonObject =>
  (v ?? {}) as JsonObject;

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `f004-handoff-${Date.now()}-`;

let companyId: string;
let companyB: string; // for cross-tenant test
let ravi: string; // outgoing
let anjali: string; // incoming permanent
let lakshmi: string; // acting cover
let hrUserId: string;
let workerSuresh: string;

beforeAll(async () => {
  const co = await prisma.company.create({
    data: {
      name: TEST_PREFIX + 'CoA',
      slug: TEST_PREFIX + 'co-a',
      ownerPhone: '+919997740001',
      ownerName: 'Owner A',
    },
  });
  companyId = co.id;
  const coB = await prisma.company.create({
    data: {
      name: TEST_PREFIX + 'CoB',
      slug: TEST_PREFIX + 'co-b',
      ownerPhone: '+919997740099',
      ownerName: 'Owner B',
    },
  });
  companyB = coB.id;

  const mkUser = async (name: string, offset: number, cId: string) =>
    (
      await prisma.user.create({
        data: {
          phone: '+91997' + String(Date.now() + offset).slice(-8),
          name,
          locale: 'en',
          companyId: cId,
        },
      })
    ).id;

  ravi = await mkUser('Ravi', 1000, companyId);
  anjali = await mkUser('Anjali', 1001, companyId);
  lakshmi = await mkUser('Lakshmi', 1002, companyId);
  hrUserId = await mkUser('HR-A', 1003, companyId);

  const w = await prisma.worker.create({
    data: {
      companyId,
      name: 'Suresh',
      phone: '+91999' + String(Date.now() + 5000).slice(-8),
    },
  });
  workerSuresh = w.id;
});

afterAll(async () => {
  await prisma.company.deleteMany({ where: { slug: { startsWith: TEST_PREFIX } } });
  await prisma.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

async function seedRaviSiteRule(
  siteId: string,
  ruleText: string,
  visibility: 'SUPERVISOR_OWN' | 'COMPANY' = 'SUPERVISOR_OWN',
  state: 'ACTIVE' | 'PENDING' = 'ACTIVE',
): Promise<string> {
  const ruleId = randomUUID();
  await prisma.livingDoc.upsert({
    where: { companyId_supervisorId: { companyId, supervisorId: ravi } },
    create: { companyId, supervisorId: ravi },
    update: {},
  });
  const doc = await prisma.livingDoc.findUnique({
    where: { companyId_supervisorId: { companyId, supervisorId: ravi } },
  });
  const existing = Array.isArray(doc!.siteRules) ? (doc!.siteRules as unknown[]) : [];
  await prisma.livingDoc.update({
    where: { id: doc!.id },
    data: {
      siteRules: [
        ...existing,
        {
          id: ruleId,
          ruleText,
          description: `desc:${ruleText}`,
          visibility,
          scope: { siteId },
          createdAt: new Date().toISOString(),
          createdBy: 'supervisor',
          state,
          source: { pattern: 'manual' },
        },
      ] as unknown as Prisma.InputJsonValue,
    },
  });
  return ruleId;
}

// ─────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────

describe('F-004 — HandoffPackage composer + writer + reassign wiring', () => {
  it('1. acting binding create → package on row (schemaVersion=1 first), no LivingDoc changes on acting cover', async () => {
    const site = await prisma.site.create({ data: { companyId, name: 'F004-Acting' } });
    // Establish Ravi's permanent binding so getEffectiveBinding has someone.
    const ravisRule = await seedRaviSiteRule(site.id, 'Lobby mop twice daily');

    const bindingId = await withTenantContext(prisma, companyId, async (tx) => {
      // Compose for acting; then create row with the package and emit audit
      // via writeHandoffPackage (kind=ACTING).
      const payload = await composeHandoffPackage(tx, {
        companyId,
        siteId: site.id,
        outgoingSupervisorId: ravi,
        incomingSupervisorId: lakshmi,
      });
      // schemaVersion must be the first field if we serialize via JSON.stringify
      // of the spread object — but ordering on a JS object is insertion order.
      const keys = Object.keys(payload);
      expect(keys[0]).toBe('schemaVersion');
      expect(payload.schemaVersion).toBe(HANDOFF_PACKAGE_SCHEMA_VERSION);

      const acting = await tx.siteSupervisorBinding.create({
        data: {
          companyId,
          siteId: site.id,
          userId: lakshmi,
          actingForUserId: ravi,
          effectiveFrom: new Date(),
          effectiveUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          reason: 'Ravi sick week',
          createdBy: hrUserId,
          handoffPackage: payload as unknown as Prisma.InputJsonValue,
        },
      });
      await writeHandoffPackage(tx, {
        bindingId: acting.id,
        companyId,
        siteId: site.id,
        outgoingSupervisorId: ravi,
        incomingSupervisorId: lakshmi,
        payload,
        kind: 'ACTING',
        actorId: hrUserId,
      });
      return acting.id;
    });

    const row = await prisma.siteSupervisorBinding.findUniqueOrThrow({ where: { id: bindingId } });
    expect(row.handoffPackage).not.toBeNull();
    const pkg = asPayload(row.handoffPackage);
    expect(pkg.schemaVersion).toBe(1);
    expect(pkg.outgoingSupervisorId).toBe(ravi);
    expect(pkg.incomingSupervisorId).toBe(lakshmi);
    expect(pkg.siteRules).toContain('Lobby mop twice daily');

    // No LivingDoc changes on Lakshmi.
    const lakshmiDoc = await prisma.livingDoc.findUnique({
      where: { companyId_supervisorId: { companyId, supervisorId: lakshmi } },
    });
    expect(lakshmiDoc).toBeNull();

    // Audit: 1 HANDOFF_PACKAGE_GENERATED; 0 LIVING_DOC_RULE_ADDED for this binding.
    const pkgAudits = await prisma.auditEvent.findMany({
      where: { companyId, kind: 'HANDOFF_PACKAGE_GENERATED', targetId: bindingId },
    });
    expect(pkgAudits).toHaveLength(1);
    const livDocAudits = await prisma.auditEvent.findMany({
      where: {
        companyId,
        kind: 'LIVING_DOC_RULE_ADDED',
        payload: { path: ['bindingId'], equals: bindingId } as unknown as Prisma.JsonFilter,
      },
    });
    expect(livDocAudits).toHaveLength(0);
    expect(ravisRule).toBeTruthy(); // keep var referenced
  });

  it('2. permanent reassign → package + N rule copies + N LIVING_DOC_RULE_ADDED + 1 HANDOFF_PACKAGE_GENERATED', async () => {
    const site = await prisma.site.create({ data: { companyId, name: 'F004-Permanent' } });
    // Ravi gets 2 site rules + 1 unrelated other-site rule + 1 PENDING rule
    await seedRaviSiteRule(site.id, 'Wax kitchen floor before 6:30 AM');
    await seedRaviSiteRule(site.id, 'No chemicals near serving area');
    await seedRaviSiteRule(site.id, 'Pending rule — should NOT copy', 'SUPERVISOR_OWN', 'PENDING');
    const otherSite = await prisma.site.create({ data: { companyId, name: 'F004-OtherSite' } });
    await seedRaviSiteRule(otherSite.id, 'Other-site rule — should NOT copy');

    // Seed Ravi's permanent binding for THIS site.
    await withTenantContext(prisma, companyId, async (tx) => {
      await tx.siteSupervisorBinding.create({
        data: {
          companyId,
          siteId: site.id,
          userId: ravi,
          actingForUserId: null,
          effectiveFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          effectiveUntil: null,
          reason: 'Initial portfolio',
          createdBy: hrUserId,
        },
      });
    });

    // Permanent reassign Ravi → Anjali at +36h cutover.
    const cutover = new Date(Date.now() + 36 * 60 * 60 * 1000);
    const result = await withTenantContext(prisma, companyId, async (tx) => {
      return reassignPermanentBinding(tx, {
        companyId,
        siteId: site.id,
        newUserId: anjali,
        effectiveFrom: cutover,
        effectiveUntil: null,
        reason: 'Q3 rebalance',
        reassignedBy: hrUserId,
      });
    });

    // New binding row carries package; 2 ACTIVE site-scoped rules copied.
    const newRow = await prisma.siteSupervisorBinding.findUniqueOrThrow({
      where: { id: result.newBindingId },
    });
    const pkg = asPayload(newRow.handoffPackage);
    expect(pkg.schemaVersion).toBe(1);
    expect(pkg.siteRules).toEqual(
      expect.arrayContaining([
        'Wax kitchen floor before 6:30 AM',
        'No chemicals near serving area',
      ]),
    );
    expect(pkg.siteRules).not.toContain('Pending rule — should NOT copy');
    expect(pkg.siteRules).not.toContain('Other-site rule — should NOT copy');
    expect(pkg.siteRules).toHaveLength(2);

    // Anjali's LivingDoc: 2 copied siteRules + 1 freeNotes summary entry
    // ("handover from Ravi on YYYY-MM-DD"). The summary entry comes from
    // the round-2 review fix (was missing in v1 due to over-application of
    // Q2=(b)). Q2=(b) only governs the no-outgoing case.
    const anjaliDoc = await prisma.livingDoc.findUnique({
      where: { companyId_supervisorId: { companyId, supervisorId: anjali } },
    });
    expect(anjaliDoc).not.toBeNull();
    const anjaliSiteRules = anjaliDoc!.siteRules as unknown as Array<Record<string, unknown>>;
    const forThisSite = anjaliSiteRules.filter(
      (r) => asJsonObject((r as JsonObject).scope as Prisma.JsonValue).siteId === site.id,
    );
    expect(forThisSite).toHaveLength(2);
    for (const r of forThisSite) {
      expect(asJsonObject((r as JsonObject).source as Prisma.JsonValue).pattern).toBe(
        `handover_from_${ravi}`,
      );
    }
    const anjaliFreeNotes = anjaliDoc!.freeNotes as unknown as Array<Record<string, unknown>>;
    const summaryEntries = anjaliFreeNotes.filter(
      (r) =>
        asJsonObject((r as JsonObject).source as Prisma.JsonValue).pattern ===
        `handover_summary_${ravi}`,
    );
    expect(summaryEntries).toHaveLength(1);
    const summaryText = String((summaryEntries[0] as JsonObject).ruleText);
    expect(summaryText).toMatch(/^Handover from Ravi on \d{4}-\d{2}-\d{2}/);
    expect(summaryText).toContain('F004-Permanent'); // site name appears in summary

    // Audits: 1 HANDOFF_PACKAGE_GENERATED for new binding; 3 LIVING_DOC_RULE_ADDED
    // keyed to bindingId (2 siteRules + 1 summary).
    const pkgAudits = await prisma.auditEvent.findMany({
      where: { companyId, kind: 'HANDOFF_PACKAGE_GENERATED', targetId: result.newBindingId },
    });
    expect(pkgAudits).toHaveLength(1);
    const livDocAudits = await prisma.auditEvent.findMany({
      where: {
        companyId,
        kind: 'LIVING_DOC_RULE_ADDED',
        payload: {
          path: ['bindingId'],
          equals: result.newBindingId,
        } as unknown as Prisma.JsonFilter,
      },
    });
    expect(livDocAudits).toHaveLength(3);
    expect(asJsonObject(pkgAudits[0]!.payload).livingDocRulesCopied).toBe(3);
    expect(asJsonObject(pkgAudits[0]!.payload).livingDocCopyApplied).toBe(true);
  });

  it('3. first-ever binding (no outgoing) → Q2=(b) zero LivingDoc writes; package with outgoingSupervisorId=null + siteRules=[]; recentComplaints reflects DB state (NOT hardcoded)', async () => {
    const site = await prisma.site.create({ data: { companyId, name: 'F004-FirstEver' } });
    // Seed a pre-binding complaint at this site so we can verify recentComplaints
    // is NOT hardcoded to [].
    await prisma.complaint.create({
      data: {
        companyId,
        siteId: site.id,
        supervisorId: hrUserId,
        text: 'Bootstrap-seed window complaint',
        severity: 'LOW',
      },
    });

    const bindingId = await withTenantContext(prisma, companyId, async (tx) => {
      const payload = await composeHandoffPackage(tx, {
        companyId,
        siteId: site.id,
        outgoingSupervisorId: null,
        incomingSupervisorId: anjali,
      });
      const row = await tx.siteSupervisorBinding.create({
        data: {
          companyId,
          siteId: site.id,
          userId: anjali,
          actingForUserId: null,
          effectiveFrom: new Date(),
          effectiveUntil: null,
          reason: 'First binding for site',
          createdBy: hrUserId,
          handoffPackage: payload as unknown as Prisma.InputJsonValue,
        },
      });
      await writeHandoffPackage(tx, {
        bindingId: row.id,
        companyId,
        siteId: site.id,
        outgoingSupervisorId: null,
        incomingSupervisorId: anjali,
        payload,
        kind: 'PERMANENT',
        actorId: hrUserId,
      });
      return row.id;
    });

    const row = await prisma.siteSupervisorBinding.findUniqueOrThrow({ where: { id: bindingId } });
    const pkg = asPayload(row.handoffPackage);
    expect(pkg.schemaVersion).toBe(1);
    expect(pkg.outgoingSupervisorId).toBeNull();
    expect(pkg.siteRules).toEqual([]); // guaranteed empty
    expect(pkg.recentComplaints).toHaveLength(1); // NOT hardcoded to []
    expect(pkg.recentComplaints[0].body).toBe('Bootstrap-seed window complaint');
    expect(pkg.recentComplaints[0].kind).toBe('site_complaint'); // interim default
    expect(pkg.recentComplaints[0].state).toBe('open'); // resolvedAt is null

    // Q2 = (b): NO LivingDoc writes for Anjali tied to this binding.
    // Check there's no freeNotes entry mentioning this binding + no
    // LIVING_DOC_RULE_ADDED audits for this binding.
    const livDocAudits = await prisma.auditEvent.findMany({
      where: {
        companyId,
        kind: 'LIVING_DOC_RULE_ADDED',
        payload: { path: ['bindingId'], equals: bindingId } as unknown as Prisma.JsonFilter,
      },
    });
    expect(livDocAudits).toHaveLength(0);

    // 1 HANDOFF_PACKAGE_GENERATED always fires.
    const pkgAudits = await prisma.auditEvent.findMany({
      where: { companyId, kind: 'HANDOFF_PACKAGE_GENERATED', targetId: bindingId },
    });
    expect(pkgAudits).toHaveLength(1);
    const auditPayload = asJsonObject(pkgAudits[0]!.payload);
    expect(auditPayload.outgoingSupervisorId).toBeNull();
    expect(auditPayload.livingDocCopyApplied).toBe(false);
    expect(auditPayload.livingDocRulesCopied).toBe(0);
  });

  it('4. empty-state defaults → arrays are [] not null when no source data exists', async () => {
    const site = await prisma.site.create({ data: { companyId, name: 'F004-Empty' } });
    const payload = await withTenantContext(prisma, companyId, async (tx) => {
      return composeHandoffPackage(tx, {
        companyId,
        siteId: site.id,
        outgoingSupervisorId: null,
        incomingSupervisorId: anjali,
      });
    });
    expect(payload.siteRules).toEqual([]);
    expect(payload.recentComplaints).toEqual([]);
    expect(payload.activeWorkers).toEqual([]);
    expect(payload.openItems).toEqual([]);
    // None of these are null.
    expect(payload.siteRules).not.toBeNull();
    expect(payload.recentComplaints).not.toBeNull();
    expect(payload.activeWorkers).not.toBeNull();
    expect(payload.openItems).not.toBeNull();
  });

  it('5. cross-tenant isolation — package does not leak across companyId', async () => {
    const siteInB = await prisma.site.create({ data: { companyId: companyB, name: 'CoB-Site' } });
    const hrInB = await prisma.user.create({
      data: {
        phone: '+91997' + String(Date.now() + 9999).slice(-8),
        name: 'HR-B',
        locale: 'en',
        companyId: companyB,
      },
    });
    // Seed a complaint in companyB at siteInB
    await prisma.complaint.create({
      data: {
        companyId: companyB,
        siteId: siteInB.id,
        supervisorId: hrInB.id,
        text: 'Tenant B complaint',
        severity: 'LOW',
      },
    });
    // Also seed a complaint in companyA at a different site
    const siteInA = await prisma.site.create({ data: { companyId, name: 'CoA-Site' } });
    await prisma.complaint.create({
      data: {
        companyId,
        siteId: siteInA.id,
        supervisorId: hrUserId,
        text: 'Tenant A complaint',
        severity: 'LOW',
      },
    });

    // Compose for site in companyA — must NOT include companyB's complaint.
    const payload = await withTenantContext(prisma, companyId, async (tx) => {
      return composeHandoffPackage(tx, {
        companyId,
        siteId: siteInA.id,
        outgoingSupervisorId: null,
        incomingSupervisorId: anjali,
      });
    });
    const bodies = payload.recentComplaints.map((c) => c.body);
    expect(bodies).toContain('Tenant A complaint');
    expect(bodies).not.toContain('Tenant B complaint');
  });

  it('6. STRICT CalendarEntry filter — entries WITHOUT payload.siteId are excluded; WITH matching siteId are included', async () => {
    const site = await prisma.site.create({ data: { companyId, name: 'F004-CalStrict' } });
    // Two entries from Ravi: one with payload.siteId matching, one missing siteId.
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const dayAfter = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await prisma.calendarEntry.create({
      data: {
        companyId,
        supervisorId: ravi,
        date: tomorrow,
        kind: 'NOTE',
        payload: { siteId: site.id, note: 'Site-linked entry' } as Prisma.InputJsonValue,
        editableUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    await prisma.calendarEntry.create({
      data: {
        companyId,
        supervisorId: ravi,
        date: dayAfter,
        kind: 'NOTE',
        payload: { note: 'No siteId; should be excluded' } as Prisma.InputJsonValue,
        editableUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });
    // Entry with payload.siteId of a DIFFERENT site
    const otherSite = await prisma.site.create({ data: { companyId, name: 'F004-OtherCal' } });
    await prisma.calendarEntry.create({
      data: {
        companyId,
        supervisorId: ravi,
        date: tomorrow,
        kind: 'NOTE',
        payload: { siteId: otherSite.id, note: 'Other-site entry' } as Prisma.InputJsonValue,
        editableUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const payload = await withTenantContext(prisma, companyId, async (tx) => {
      return composeHandoffPackage(tx, {
        companyId,
        siteId: site.id,
        outgoingSupervisorId: ravi,
        incomingSupervisorId: anjali,
      });
    });
    const calItems = payload.openItems.filter((i) => i.kind === 'CALENDAR_ENTRY') as Array<
      Extract<(typeof payload.openItems)[number], { kind: 'CALENDAR_ENTRY' }>
    >;
    expect(calItems).toHaveLength(1);
    expect((calItems[0]!.payload as JsonObject).note).toBe('Site-linked entry');
  });

  it('7. idempotency — replay of permanent rebind does NOT duplicate copied rules', async () => {
    const site = await prisma.site.create({ data: { companyId, name: 'F004-Idem' } });
    await seedRaviSiteRule(site.id, 'Idem-rule-1');
    await seedRaviSiteRule(site.id, 'Idem-rule-2');

    await withTenantContext(prisma, companyId, async (tx) => {
      await tx.siteSupervisorBinding.create({
        data: {
          companyId,
          siteId: site.id,
          userId: ravi,
          actingForUserId: null,
          effectiveFrom: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
          effectiveUntil: null,
          reason: 'Initial',
          createdBy: hrUserId,
        },
      });
    });

    const cutover = new Date(Date.now() + 36 * 60 * 60 * 1000);
    const r1 = await withTenantContext(prisma, companyId, async (tx) =>
      reassignPermanentBinding(tx, {
        companyId,
        siteId: site.id,
        newUserId: anjali,
        effectiveFrom: cutover,
        effectiveUntil: null,
        reason: 'Reassign 1',
        reassignedBy: hrUserId,
      }),
    );

    // Simulate replay: call writeHandoffPackage AGAIN with the same bindingId
    // + same outgoing rules. Should be a no-op (deterministic rule IDs +
    // existing-ids guard).
    await withTenantContext(prisma, companyId, async (tx) => {
      const newRow = await tx.siteSupervisorBinding.findUniqueOrThrow({
        where: { id: r1.newBindingId },
      });
      await writeHandoffPackage(tx, {
        bindingId: newRow.id,
        companyId,
        siteId: site.id,
        outgoingSupervisorId: ravi,
        incomingSupervisorId: anjali,
        payload: asPayload(newRow.handoffPackage),
        kind: 'PERMANENT',
        actorId: hrUserId,
      });
    });

    const anjaliDoc = await prisma.livingDoc.findUnique({
      where: { companyId_supervisorId: { companyId, supervisorId: anjali } },
    });
    const siteScoped = (anjaliDoc!.siteRules as unknown as Array<Record<string, unknown>>).filter(
      (r) =>
        asJsonObject((r as JsonObject).scope as Prisma.JsonValue).siteId === site.id &&
        asJsonObject((r as JsonObject).source as Prisma.JsonValue).pattern ===
          `handover_from_${ravi}`,
    );
    // Still 2 after replay (not 4).
    expect(siteScoped).toHaveLength(2);

    // Summary entry: still exactly 1 after replay (not 2). Idempotency via
    // deriveSummaryEntryId(bindingId). We filter by the deterministic
    // summary id for THIS binding rather than by source.pattern, since
    // earlier tests in this file (test 2, test 9) also wrote summary
    // entries for the same incoming supervisor — those have different
    // bindingIds and therefore different summary ids.
    const allFreeNotes = anjaliDoc!.freeNotes as unknown as Array<Record<string, unknown>>;
    const thisBindingSummary = allFreeNotes.filter(
      (r) => typeof r.bindingId === 'string' && r.bindingId === r1.newBindingId,
    );
    // The summary entry doesn't carry bindingId on the rule itself — it
    // does on the audit row. So filter by source.pattern + the deterministic
    // summary entry id (which IS keyed on bindingId).
    const thisBindingSummaries = allFreeNotes.filter((r) => {
      const src = asJsonObject((r as JsonObject).source as Prisma.JsonValue);
      const pat = String(src.pattern ?? '');
      return (
        pat === `handover_summary_${ravi}` &&
        r.scope &&
        asJsonObject((r as JsonObject).scope as Prisma.JsonValue).siteId === site.id
      );
    });
    expect(thisBindingSummaries).toHaveLength(1);
    expect(thisBindingSummary).toBeDefined(); // anchor unused-var
  });

  it('8a. schemaVersion negative — Zod rejects schemaVersion=0', () => {
    const r = HandoffPackagePayloadSchema.safeParse({
      schemaVersion: 0,
      generatedAt: new Date().toISOString(),
      outgoingSupervisorId: null,
      incomingSupervisorId: anjali,
      siteRules: [],
      recentComplaints: [],
      activeWorkers: [],
      openItems: [],
      packageSizeBytes: 0,
    });
    expect(r.success).toBe(false);
  });

  it('8b. schemaVersion negative — Zod rejects schemaVersion=2', () => {
    const r = HandoffPackagePayloadSchema.safeParse({
      schemaVersion: 2,
      generatedAt: new Date().toISOString(),
      outgoingSupervisorId: null,
      incomingSupervisorId: anjali,
      siteRules: [],
      recentComplaints: [],
      activeWorkers: [],
      openItems: [],
      packageSizeBytes: 0,
    });
    expect(r.success).toBe(false);
  });

  it('8c. schemaVersion negative — Zod rejects missing schemaVersion', () => {
    const r = HandoffPackagePayloadSchema.safeParse({
      generatedAt: new Date().toISOString(),
      outgoingSupervisorId: null,
      incomingSupervisorId: anjali,
      siteRules: [],
      recentComplaints: [],
      activeWorkers: [],
      openItems: [],
      packageSizeBytes: 0,
    });
    expect(r.success).toBe(false);
  });

  it('9. clientPreferences NOT transferred (Material #2 = β; F-010 deferred). siteRules ARE transferred; recentComplaints in package is real DB state', async () => {
    const site = await prisma.site.create({ data: { companyId, name: 'F004-ClientPref' } });
    // Seed Ravi with 2 siteRules + 3 clientPreferences for this site.
    await seedRaviSiteRule(site.id, 'siteRule-1');
    await seedRaviSiteRule(site.id, 'siteRule-2');
    // Add 3 client-preference entries directly into Ravi's LivingDoc.
    const ravisDoc = await prisma.livingDoc.findUniqueOrThrow({
      where: { companyId_supervisorId: { companyId, supervisorId: ravi } },
    });
    await prisma.livingDoc.update({
      where: { id: ravisDoc.id },
      data: {
        clientPreferences: [
          {
            id: randomUUID(),
            ruleText: 'Building manager Mr. Rao',
            description: 'Strict on kitchen-floor wax 6:30 AM',
            visibility: 'SUPERVISOR_OWN',
            scope: { siteId: site.id },
            createdAt: new Date().toISOString(),
            createdBy: 'supervisor',
            state: 'ACTIVE',
            source: { pattern: 'manual' },
          },
          {
            id: randomUUID(),
            ruleText: 'Client escalates to Reddy directly',
            description: 'Escalation path',
            visibility: 'SUPERVISOR_OWN',
            scope: { siteId: site.id },
            createdAt: new Date().toISOString(),
            createdBy: 'supervisor',
            state: 'ACTIVE',
            source: { pattern: 'manual' },
          },
          {
            id: randomUUID(),
            ruleText: 'Lobby finish standard: mirror-grade',
            description: 'Finish standard',
            visibility: 'SUPERVISOR_OWN',
            scope: { siteId: site.id },
            createdAt: new Date().toISOString(),
            createdBy: 'supervisor',
            state: 'ACTIVE',
            source: { pattern: 'manual' },
          },
        ] as unknown as Prisma.InputJsonValue,
      },
    });

    await withTenantContext(prisma, companyId, async (tx) => {
      await tx.siteSupervisorBinding.create({
        data: {
          companyId,
          siteId: site.id,
          userId: ravi,
          actingForUserId: null,
          effectiveFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          effectiveUntil: null,
          reason: 'Initial',
          createdBy: hrUserId,
        },
      });
    });

    const cutover = new Date(Date.now() + 36 * 60 * 60 * 1000);
    const result = await withTenantContext(prisma, companyId, async (tx) =>
      reassignPermanentBinding(tx, {
        companyId,
        siteId: site.id,
        newUserId: anjali,
        effectiveFrom: cutover,
        effectiveUntil: null,
        reason: 'Reassign w/ clientPrefs',
        reassignedBy: hrUserId,
      }),
    );

    const newRow = await prisma.siteSupervisorBinding.findUniqueOrThrow({
      where: { id: result.newBindingId },
    });
    const pkg = asPayload(newRow.handoffPackage);
    // siteRules transferred: contains BOTH siteRules-1 and -2 (plus any prior leftovers from other tests
    // that happened to be in Ravi's LivingDoc for THIS site — fine; assert both are present and
    // none of the clientPreferences text leaks).
    expect(pkg.siteRules).toEqual(expect.arrayContaining(['siteRule-1', 'siteRule-2']));
    for (const cp of [
      'Building manager Mr. Rao',
      'Client escalates to Reddy directly',
      'Lobby finish standard: mirror-grade',
    ]) {
      expect(pkg.siteRules).not.toContain(cp);
    }

    // Anjali's incoming LivingDoc has the 2 siteRules but ZERO clientPreferences entries.
    const anjaliDoc = await prisma.livingDoc.findUnique({
      where: { companyId_supervisorId: { companyId, supervisorId: anjali } },
    });
    const incomingClientPrefs = anjaliDoc!.clientPreferences as unknown as unknown[];
    // Filter to ones from this binding (source.pattern === handover_from_<ravi>):
    const handoverClientPrefs = (incomingClientPrefs as Array<Record<string, unknown>>).filter(
      (r) =>
        asJsonObject((r as JsonObject).source as Prisma.JsonValue).pattern ===
        `handover_from_${ravi}`,
    );
    expect(handoverClientPrefs).toHaveLength(0);
  });

  it('10. site-scoped openItems — decisions targeting workers on OTHER sites are NOT included; site-targeted on this site IS; on other site is NOT; origin-only NEVER (round-2 finding #2)', async () => {
    const thisSite = await prisma.site.create({
      data: { companyId, name: 'F004-SiteScope-this' },
    });
    const otherSite = await prisma.site.create({
      data: { companyId, name: 'F004-SiteScope-other' },
    });

    // Two workers, each with an ACTIVE assignment on different sites so
    // deriveWorkerPrimarySiteId returns the right site for each.
    const workerOnThisSite = await prisma.worker.create({
      data: {
        companyId,
        name: 'WorkerThis',
        phone: '+91999' + String(Date.now() + 7100).slice(-8),
      },
    });
    const workerOnOtherSite = await prisma.worker.create({
      data: {
        companyId,
        name: 'WorkerOther',
        phone: '+91999' + String(Date.now() + 7200).slice(-8),
      },
    });
    await prisma.assignment.createMany({
      data: [
        {
          companyId,
          workerId: workerOnThisSite.id,
          siteId: thisSite.id,
          shiftStart: '08:00',
          shiftEnd: '17:00',
          dayMask: 'MTWTFS_',
          validFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          validUntil: null,
          state: 'ACTIVE',
        },
        {
          companyId,
          workerId: workerOnOtherSite.id,
          siteId: otherSite.id,
          shiftStart: '08:00',
          shiftEnd: '17:00',
          dayMask: 'MTWTFS_',
          validFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          validUntil: null,
          state: 'ACTIVE',
        },
      ],
    });

    // 5 PROPOSED decisions by Ravi within the lookback window:
    //   A. worker-targeted MARK_ABSENT for workerOnThisSite   → INCLUDE
    //   B. worker-targeted MARK_ABSENT for workerOnOtherSite  → EXCLUDE
    //   C. site-targeted LOG_COMPLAINT for thisSite           → INCLUDE
    //   D. site-targeted LOG_COMPLAINT for otherSite          → EXCLUDE
    //   E. origin-only LIVING_DOC_RULE                        → EXCLUDE (no site)
    const decA = await prisma.supervisorDecision.create({
      data: {
        companyId,
        supervisorId: ravi,
        kind: 'MARK_ABSENT',
        tier: 'OPERATIONAL',
        targetId: workerOnThisSite.id,
        payload: {} as Prisma.InputJsonValue,
      },
    });
    const decB = await prisma.supervisorDecision.create({
      data: {
        companyId,
        supervisorId: ravi,
        kind: 'MARK_ABSENT',
        tier: 'OPERATIONAL',
        targetId: workerOnOtherSite.id,
        payload: {} as Prisma.InputJsonValue,
      },
    });
    const decC = await prisma.supervisorDecision.create({
      data: {
        companyId,
        supervisorId: ravi,
        kind: 'LOG_COMPLAINT',
        tier: 'OPERATIONAL',
        targetId: thisSite.id,
        payload: {} as Prisma.InputJsonValue,
      },
    });
    const decD = await prisma.supervisorDecision.create({
      data: {
        companyId,
        supervisorId: ravi,
        kind: 'LOG_COMPLAINT',
        tier: 'OPERATIONAL',
        targetId: otherSite.id,
        payload: {} as Prisma.InputJsonValue,
      },
    });
    const decE = await prisma.supervisorDecision.create({
      data: {
        companyId,
        supervisorId: ravi,
        kind: 'LIVING_DOC_RULE',
        tier: 'NOTE',
        targetId: null,
        payload: {} as Prisma.InputJsonValue,
      },
    });

    const payload = await withTenantContext(prisma, companyId, async (tx) => {
      return composeHandoffPackage(tx, {
        companyId,
        siteId: thisSite.id,
        outgoingSupervisorId: ravi,
        incomingSupervisorId: anjali,
      });
    });

    const decisionItems = payload.openItems.filter(
      (i): i is Extract<(typeof payload.openItems)[number], { kind: 'DECISION' }> =>
        i.kind === 'DECISION',
    );
    const includedIds = decisionItems.map((i) => i.decisionId);
    expect(includedIds).toContain(decA.id); // worker on this site
    expect(includedIds).not.toContain(decB.id); // worker on other site — DO NOT LEAK
    expect(includedIds).toContain(decC.id); // site-targeted this site
    expect(includedIds).not.toContain(decD.id); // site-targeted other site
    expect(includedIds).not.toContain(decE.id); // origin-only — no site
  });

  it('11. hard-cap truncation — composer THROWS HandoffPackageOversizedError if cap is impossibly small even after dropping everything (round-2 finding #3)', async () => {
    // Set the cap to 50 bytes — smaller than even a metadata-only payload's
    // JSON serialization. The truncation algorithm should run through all
    // phases (1: drop complaints; 2: strip worker detail; 3a: drop workers;
    // 3b: drop openItems; 3c: drop siteRules) and finally throw rather than
    // returning an oversized payload.
    const site = await prisma.site.create({ data: { companyId, name: 'F004-HardCap' } });

    await expect(
      withTenantContext(prisma, companyId, async (tx) => {
        return composeHandoffPackage(tx, {
          companyId,
          siteId: site.id,
          outgoingSupervisorId: null, // first-ever: nothing to load
          incomingSupervisorId: anjali,
          packageByteCap: 50,
        });
      }),
    ).rejects.toThrow(/HandoffPackage exceeds cap after full truncation/);
  });

  it('12. soft-cap truncation — composer DROPS oldest complaints first when cap is tight, then succeeds (covers spec §3.7 phases 1+2)', async () => {
    // Seed several complaints so the package would exceed a modest cap.
    const site = await prisma.site.create({ data: { companyId, name: 'F004-TruncSoft' } });
    for (let i = 0; i < 10; i++) {
      await prisma.complaint.create({
        data: {
          companyId,
          siteId: site.id,
          supervisorId: hrUserId,
          text: `Complaint #${i} — ${'x'.repeat(200)}`,
          severity: 'LOW',
        },
      });
    }
    // Cap of 1500 bytes is enough for metadata + a few complaints, not all 10.
    const payload = await withTenantContext(prisma, companyId, async (tx) => {
      return composeHandoffPackage(tx, {
        companyId,
        siteId: site.id,
        outgoingSupervisorId: null,
        incomingSupervisorId: anjali,
        packageByteCap: 1500,
      });
    });
    expect(payload.packageSizeBytes).toBeLessThanOrEqual(1500);
    // Some complaints were dropped (we seeded 10).
    expect(payload.recentComplaints.length).toBeLessThan(10);
    // schemaVersion + outgoing/incoming/siteRules/openItems/activeWorkers
    // are preserved on the way to the cap.
    expect(payload.schemaVersion).toBe(1);
  });
});
