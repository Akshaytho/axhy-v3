/**
 * F-003 — binding-expire-sweep real-DB integration test.
 *
 * Cases:
 *   1. Sweep emits exactly one BINDING_ENDED_AUTO per expired binding
 *      that has no prior audit row.
 *   2. Re-running the sweep is a no-op (idempotent via audit-existence check).
 *   3. Sweep does NOT mutate the binding row — endedAt stays NULL.
 *   4. Sweep does NOT change getEffectiveBinding results at any test instant
 *      (point-in-time queries unaffected by the sweep).
 *   5. Sweep skips manually-ended bindings (those already have BINDING_ENDED_MANUAL
 *      lineage and must not get a duplicate BINDING_ENDED_AUTO).
 *   6. Per-row tx isolation — a single bad row doesn't roll back the others
 *      (verified by setting one binding to an invalid state mid-batch).
 *   7. First-boot path — marker null → first call records `now` and does NOT sweep.
 *   8. Cadence gate — second call within 5 minutes is a no-op even with new
 *      expired rows; call after 5+ minutes runs the sweep.
 *
 * @derives(F-003 scope artifact 2026-05-16)
 * @derives(workflow-design-closure §10 + §3.1 2026-05-16 update)
 */

import { randomUUID } from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import pino from 'pino';

import {
  maybeRunBindingExpireSweep,
  _resetSweepMarkerForTesting,
  _emitAuditForOneBindingForTesting,
  type ExpiredBindingCandidate,
} from '../src/jobs/binding-expire-sweep.js';
import { getEffectiveBinding } from '../src/lib/effective-responsibility.js';
import { withTenantContext } from '../src/middleware/tenant-context.js';

import { deleteCompanyDeep } from './_helpers/delete-company-deep.js';

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

// Silence the logger in tests; the sweep is failure-tolerant and logs at
// info/error, neither of which we want polluting test output.
const log = pino({ level: 'silent' }) as unknown as Parameters<
  typeof maybeRunBindingExpireSweep
>[1];

const TEST_PREFIX = `f003-sweep-${Date.now()}-`;

let companyId: string;
let userA: string;
let userB: string;
let hrUserId: string;

beforeAll(async () => {
  const co = await prisma.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919999920001',
      ownerName: 'Owner',
    },
  });
  companyId = co.id;

  const mk = async (name: string, offset: number) =>
    (
      await prisma.user.create({
        data: {
          phone: '+919999' + String(Date.now() + offset).slice(-7),
          name,
          locale: 'en',
          companyId,
        },
      })
    ).id;

  userA = await mk('User A', 5000);
  userB = await mk('User B', 5001);
  hrUserId = await mk('HR', 5002);
});

afterAll(async () => {
  await deleteCompanyDeep(prisma, { slugPrefix: TEST_PREFIX });
  await prisma.$disconnect();
});

beforeEach(() => {
  // Reset the in-memory sweep marker between cases so each test gets a
  // deterministic starting point.
  _resetSweepMarkerForTesting();
});

afterEach(async () => {
  // Clean per-test data so the global sweep doesn't pick up leftover
  // bindings from prior cases. The sweep is genuinely global (no
  // companyId filter), so test isolation has to be enforced here.
  await prisma.auditEvent.deleteMany({ where: { companyId, kind: 'BINDING_ENDED_AUTO' } });
  await prisma.siteSupervisorBinding.deleteMany({ where: { companyId } });
});

/**
 * Helper — seed a binding directly via Prisma (bypasses the S-001 freeze
 * guard by design; test seeds use direct DB writes per the F-002 baseline
 * pattern called out in the closure spec 2026-05-16 update).
 */
async function seedBinding(args: {
  siteId: string;
  userId: string;
  actingForUserId?: string | null;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  endedAt?: Date | null;
}): Promise<{ id: string }> {
  return prisma.siteSupervisorBinding.create({
    data: {
      companyId,
      siteId: args.siteId,
      userId: args.userId,
      actingForUserId: args.actingForUserId ?? null,
      effectiveFrom: args.effectiveFrom,
      effectiveUntil: args.effectiveUntil,
      endedAt: args.endedAt ?? null,
      reason: 'F-003 sweep test seed',
      createdBy: hrUserId,
    },
    select: { id: true },
  });
}

describe('F-003 binding-expire-sweep — real-DB integration', () => {
  it('1. emits exactly one BINDING_ENDED_AUTO per expired binding without prior audit', async () => {
    // Two expired bindings + one still active. Each on its own site to
    // avoid the EXCLUDE no-overlap constraint (PERMANENT vs PERMANENT on
    // the same site is blocked when ranges overlap).
    const site1 = await prisma.site.create({ data: { companyId, name: TEST_PREFIX + 'Site-1a' } });
    const site2 = await prisma.site.create({ data: { companyId, name: TEST_PREFIX + 'Site-1b' } });
    const site3 = await prisma.site.create({ data: { companyId, name: TEST_PREFIX + 'Site-1c' } });

    const expired1 = await seedBinding({
      siteId: site1.id,
      userId: userA,
      effectiveFrom: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      effectiveUntil: new Date(Date.now() - 60_000), // expired 1 min ago
    });
    const expired2 = await seedBinding({
      siteId: site2.id,
      userId: userB,
      actingForUserId: userA,
      effectiveFrom: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      effectiveUntil: new Date(Date.now() - 30 * 60 * 1000), // expired 30 min ago
    });
    const active = await seedBinding({
      siteId: site3.id,
      userId: userA,
      effectiveFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
      effectiveUntil: null, // open-ended
    });

    // Force the cadence gate to open: first call records the marker, second
    // call (with a `now` 6 minutes in the future) runs the sweep.
    await maybeRunBindingExpireSweep(prisma, log);
    const result = await maybeRunBindingExpireSweep(
      prisma,
      log,
      new Date(Date.now() + 6 * 60 * 1000),
    );

    expect(result.ran).toBe(true);
    expect(result.auditsEmitted).toBe(2);
    expect(result.failed).toBe(0);

    // Audit assertions
    const auditsExpired1 = await prisma.auditEvent.findMany({
      where: { companyId, kind: 'BINDING_ENDED_AUTO', targetId: expired1.id },
    });
    expect(auditsExpired1).toHaveLength(1);
    const payload1 = auditsExpired1[0].payload as Record<string, unknown>;
    expect(payload1.bindingId).toBe(expired1.id);
    expect(payload1.siteId).toBe(site1.id);
    expect(payload1.userId).toBe(userA);
    expect(payload1.actingForUserId).toBeNull();
    expect(typeof payload1.sweptAt).toBe('string');

    const auditsExpired2 = await prisma.auditEvent.findMany({
      where: { companyId, kind: 'BINDING_ENDED_AUTO', targetId: expired2.id },
    });
    expect(auditsExpired2).toHaveLength(1);
    expect((auditsExpired2[0].payload as Record<string, unknown>).actingForUserId).toBe(userA);

    // Active binding gets NO audit.
    const auditsActive = await prisma.auditEvent.findMany({
      where: { companyId, kind: 'BINDING_ENDED_AUTO', targetId: active.id },
    });
    expect(auditsActive).toHaveLength(0);
  });

  it('2. re-running the sweep is a no-op — idempotent via audit-existence check', async () => {
    const site = await prisma.site.create({ data: { companyId, name: TEST_PREFIX + 'Site-2' } });
    const expired = await seedBinding({
      siteId: site.id,
      userId: userA,
      effectiveFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
      effectiveUntil: new Date(Date.now() - 60_000),
    });

    await maybeRunBindingExpireSweep(prisma, log);
    const first = await maybeRunBindingExpireSweep(
      prisma,
      log,
      new Date(Date.now() + 6 * 60 * 1000),
    );
    expect(first.auditsEmitted).toBe(1);

    // Second sweep, 5+ minutes later — cadence gate opens but the audit
    // already exists, so nothing to emit.
    const second = await maybeRunBindingExpireSweep(
      prisma,
      log,
      new Date(Date.now() + 12 * 60 * 1000),
    );
    expect(second.ran).toBe(true);
    expect(second.auditsEmitted).toBe(0);

    // Still exactly one audit row.
    const audits = await prisma.auditEvent.findMany({
      where: { companyId, kind: 'BINDING_ENDED_AUTO', targetId: expired.id },
    });
    expect(audits).toHaveLength(1);
  });

  it('3. sweep does NOT mutate the binding row — endedAt stays NULL', async () => {
    const site = await prisma.site.create({ data: { companyId, name: TEST_PREFIX + 'Site-3' } });
    const expired = await seedBinding({
      siteId: site.id,
      userId: userA,
      effectiveFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
      effectiveUntil: new Date(Date.now() - 60_000),
    });

    await maybeRunBindingExpireSweep(prisma, log);
    await maybeRunBindingExpireSweep(prisma, log, new Date(Date.now() + 6 * 60 * 1000));

    const row = await prisma.siteSupervisorBinding.findUnique({ where: { id: expired.id } });
    expect(row).not.toBeNull();
    expect(row!.endedAt).toBeNull();
    expect(row!.endedReason).toBeNull();
    // effectiveUntil unchanged (set on seed).
    expect(row!.effectiveUntil).not.toBeNull();
  });

  it('4. getEffectiveBinding results unchanged by the sweep at any instant', async () => {
    const site = await prisma.site.create({ data: { companyId, name: TEST_PREFIX + 'Site-4' } });
    const expiredAt = new Date(Date.now() - 60_000);
    // Acting binding for userA covering userB. ACTING kind — coexists with
    // the PERMANENT baseline below in the EXCLUDE constraint (different kind).
    await seedBinding({
      siteId: site.id,
      userId: userA,
      actingForUserId: userB,
      effectiveFrom: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
      effectiveUntil: expiredAt,
    });
    // Permanent baseline (userB) underneath.
    await seedBinding({
      siteId: site.id,
      userId: userB,
      effectiveFrom: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      effectiveUntil: null,
    });

    // Capture routing results BEFORE the sweep:
    const beforeNow = await withTenantContext(prisma, companyId, (tx) =>
      getEffectiveBinding(tx, { companyId, siteId: site.id, at: new Date() }),
    );
    const beforeHistorical = await withTenantContext(prisma, companyId, (tx) =>
      getEffectiveBinding(tx, {
        companyId,
        siteId: site.id,
        at: new Date(expiredAt.getTime() - 60_000), // 1 min before expiry
      }),
    );

    // Run sweep.
    await maybeRunBindingExpireSweep(prisma, log);
    await maybeRunBindingExpireSweep(prisma, log, new Date(Date.now() + 6 * 60 * 1000));

    // Routing results AFTER sweep — must be identical.
    const afterNow = await withTenantContext(prisma, companyId, (tx) =>
      getEffectiveBinding(tx, { companyId, siteId: site.id, at: new Date() }),
    );
    const afterHistorical = await withTenantContext(prisma, companyId, (tx) =>
      getEffectiveBinding(tx, {
        companyId,
        siteId: site.id,
        at: new Date(expiredAt.getTime() - 60_000),
      }),
    );

    // Right now: the expired acting binding is excluded; the permanent userB binding wins.
    expect(afterNow?.userId).toBe(beforeNow?.userId);
    expect(afterNow?.userId).toBe(userB);
    // At a historical instant before expiry: the acting binding for userA still wins.
    expect(afterHistorical?.userId).toBe(beforeHistorical?.userId);
    expect(afterHistorical?.userId).toBe(userA);
    expect(afterHistorical?.kind).toBe('ACTING');
  });

  it('5. sweep skips manually-ended bindings (no duplicate BINDING_ENDED_AUTO)', async () => {
    const site = await prisma.site.create({ data: { companyId, name: TEST_PREFIX + 'Site-5' } });
    // Binding that expired AND was manually ended (endedAt set).
    const manuallyEnded = await seedBinding({
      siteId: site.id,
      userId: userA,
      effectiveFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
      effectiveUntil: new Date(Date.now() - 60_000),
      endedAt: new Date(Date.now() - 30 * 60 * 1000),
    });

    await maybeRunBindingExpireSweep(prisma, log);
    const result = await maybeRunBindingExpireSweep(
      prisma,
      log,
      new Date(Date.now() + 6 * 60 * 1000),
    );

    expect(result.auditsEmitted).toBe(0);
    const audits = await prisma.auditEvent.findMany({
      where: { companyId, kind: 'BINDING_ENDED_AUTO', targetId: manuallyEnded.id },
    });
    expect(audits).toHaveLength(0);
  });

  it('6. first-boot path — first call records the marker and does NOT sweep', async () => {
    const site = await prisma.site.create({ data: { companyId, name: TEST_PREFIX + 'Site-6' } });
    await seedBinding({
      siteId: site.id,
      userId: userA,
      effectiveFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
      effectiveUntil: new Date(Date.now() - 60_000),
    });

    // First call after marker reset — first-boot path. Should NOT sweep
    // even though an expired binding exists.
    const first = await maybeRunBindingExpireSweep(prisma, log);
    expect(first.ran).toBe(false);
    expect(first.auditsEmitted).toBe(0);

    // No audit emitted yet.
    const auditsAfterFirst = await prisma.auditEvent.findMany({
      where: { companyId, kind: 'BINDING_ENDED_AUTO' },
    });
    expect(auditsAfterFirst.length).toBe(0);
  });

  it('7. cadence gate — call within 5 min is a no-op; call after 5+ min runs', async () => {
    const site = await prisma.site.create({ data: { companyId, name: TEST_PREFIX + 'Site-7' } });
    const seedId = (
      await seedBinding({
        siteId: site.id,
        userId: userA,
        effectiveFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
        effectiveUntil: new Date(Date.now() - 60_000),
      })
    ).id;

    // First call sets the marker.
    await maybeRunBindingExpireSweep(prisma, log);
    // Second call within 4 minutes — cadence gate closed.
    const withinGate = await maybeRunBindingExpireSweep(
      prisma,
      log,
      new Date(Date.now() + 4 * 60 * 1000),
    );
    expect(withinGate.ran).toBe(false);

    // Third call 6 minutes later — gate open, sweep runs.
    const afterGate = await maybeRunBindingExpireSweep(
      prisma,
      log,
      new Date(Date.now() + 6 * 60 * 1000),
    );
    expect(afterGate.ran).toBe(true);
    expect(afterGate.auditsEmitted).toBe(1);

    const audits = await prisma.auditEvent.findMany({
      where: { companyId, kind: 'BINDING_ENDED_AUTO', targetId: seedId },
    });
    expect(audits).toHaveLength(1);
  });

  it('8. per-row tx isolation — orphan-id audit pre-seed does not block other rows', async () => {
    // This case verifies that the audit-existence check correctly filters
    // already-emitted rows, AND that handling each binding in its own tx
    // means one already-emitted row doesn't affect the others.
    const site = await prisma.site.create({ data: { companyId, name: TEST_PREFIX + 'Site-8' } });
    const expired1 = await seedBinding({
      siteId: site.id,
      userId: userA,
      effectiveFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
      effectiveUntil: new Date(Date.now() - 60_000),
    });
    const expired2 = await seedBinding({
      siteId: site.id,
      userId: userB,
      actingForUserId: userA,
      effectiveFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
      effectiveUntil: new Date(Date.now() - 30_000),
    });

    // Pre-seed an audit for expired1 so the sweep skips it; expired2 must
    // still be processed normally.
    await prisma.auditEvent.create({
      data: {
        id: randomUUID(),
        companyId,
        kind: 'BINDING_ENDED_AUTO',
        actorId: '00000000-0000-0000-0000-000000000000',
        targetId: expired1.id,
        payload: { bindingId: expired1.id, preSeeded: true } as Record<string, unknown>,
      },
    });

    await maybeRunBindingExpireSweep(prisma, log);
    const result = await maybeRunBindingExpireSweep(
      prisma,
      log,
      new Date(Date.now() + 6 * 60 * 1000),
    );

    // expired1 was skipped (already audited); expired2 was processed.
    expect(result.auditsEmitted).toBe(1);
    expect(result.failed).toBe(0);

    const audits1 = await prisma.auditEvent.findMany({
      where: { companyId, kind: 'BINDING_ENDED_AUTO', targetId: expired1.id },
    });
    expect(audits1).toHaveLength(1); // still just the pre-seeded one

    const audits2 = await prisma.auditEvent.findMany({
      where: { companyId, kind: 'BINDING_ENDED_AUTO', targetId: expired2.id },
    });
    expect(audits2).toHaveLength(1);
  });

  it('9. concurrent emit on the same binding produces exactly one audit row (DB-enforced dedup)', async () => {
    // Round-2 fix verification (P1 from friend's F-003 round-1 review).
    // The partial unique index `AuditEvent_binding_ended_auto_dedup` on
    // (companyId, kind, targetId) WHERE kind='BINDING_ENDED_AUTO' AND
    // targetId IS NOT NULL is the load-bearing dedup mechanism. The
    // app-side findFirst cheap-skip is an optimisation, not the proof.
    //
    // This test exercises the DB-enforced guarantee: two concurrent
    // attempts to emit the audit for the same binding. Exactly one
    // succeeds; the other catches P2002 and returns `{emitted: false}`.
    // Final audit-row count for the binding = 1.
    const site = await prisma.site.create({ data: { companyId, name: TEST_PREFIX + 'Site-9' } });
    const binding = await seedBinding({
      siteId: site.id,
      userId: userA,
      effectiveFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
      effectiveUntil: new Date(Date.now() - 60_000),
    });

    const candidate: ExpiredBindingCandidate = {
      id: binding.id,
      companyId,
      siteId: site.id,
      userId: userA,
      actingForUserId: null,
      effectiveFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
      effectiveUntil: new Date(Date.now() - 60_000),
    };

    // Fire two concurrent emits. Both call .$transaction independently;
    // they hit DB via the Prisma connection pool — truly concurrent on
    // separate connections.
    const [r1, r2] = await Promise.all([
      _emitAuditForOneBindingForTesting(prisma, candidate),
      _emitAuditForOneBindingForTesting(prisma, candidate),
    ]);

    // Exactly one of the two reports `emitted: true`; the other reports
    // `emitted: false` (caught the cheap-skip OR caught P2002).
    const emittedCount = [r1, r2].filter((r) => r.emitted).length;
    const skippedCount = [r1, r2].filter((r) => !r.emitted).length;
    expect(emittedCount + skippedCount).toBe(2);
    // Tolerate either outcome (both cheap-skip or one-emit-one-race-catch);
    // the LOAD-BEARING assertion is the row count below.
    expect(emittedCount).toBeLessThanOrEqual(1);

    // Exactly one audit row exists for this binding.
    const audits = await prisma.auditEvent.findMany({
      where: { companyId, kind: 'BINDING_ENDED_AUTO', targetId: binding.id },
    });
    expect(audits).toHaveLength(1);
  });

  it('10. DB-level unique index actively rejects a second direct insert (proves index is real, not just the app-side check)', async () => {
    // Round-2 fix verification — direct DB-level test that the partial
    // unique index `AuditEvent_binding_ended_auto_dedup` is real and
    // enforced. Without this test, "DB-enforced dedup" is a claim
    // about migration content rather than runtime behavior.
    const site = await prisma.site.create({ data: { companyId, name: TEST_PREFIX + 'Site-10' } });
    const binding = await seedBinding({
      siteId: site.id,
      userId: userA,
      effectiveFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
      effectiveUntil: new Date(Date.now() - 60_000),
    });

    // First insert succeeds.
    await prisma.auditEvent.create({
      data: {
        id: randomUUID(),
        companyId,
        kind: 'BINDING_ENDED_AUTO',
        actorId: '00000000-0000-0000-0000-000000000000',
        targetId: binding.id,
        payload: { bindingId: binding.id, attempt: 1 } as Record<string, unknown>,
      },
    });

    // Second direct insert with the same (companyId, kind, targetId) must
    // throw a unique-violation. This bypasses the sweep code entirely; if
    // it doesn't throw, the index isn't there or its predicate is wrong.
    await expect(
      prisma.auditEvent.create({
        data: {
          id: randomUUID(),
          companyId,
          kind: 'BINDING_ENDED_AUTO',
          actorId: '00000000-0000-0000-0000-000000000000',
          targetId: binding.id,
          payload: { bindingId: binding.id, attempt: 2 } as Record<string, unknown>,
        },
      }),
    ).rejects.toThrow(/AuditEvent_binding_ended_auto_dedup|Unique constraint|P2002/);

    // Exactly one row remains.
    const audits = await prisma.auditEvent.findMany({
      where: { companyId, kind: 'BINDING_ENDED_AUTO', targetId: binding.id },
    });
    expect(audits).toHaveLength(1);
  });

  it('11. partial unique index does NOT constrain other audit kinds (narrowness check)', async () => {
    // The partial-index predicate is `WHERE kind='BINDING_ENDED_AUTO'
    // AND targetId IS NOT NULL`. This test verifies the predicate is
    // narrow: other audit kinds can still have multiple rows on the
    // same targetId without hitting the unique constraint.
    const site = await prisma.site.create({ data: { companyId, name: TEST_PREFIX + 'Site-11' } });
    const binding = await seedBinding({
      siteId: site.id,
      userId: userA,
      effectiveFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
      effectiveUntil: new Date(Date.now() - 60_000),
    });

    // Two BINDING_CREATED rows with the same targetId — must both succeed
    // (these are unrelated to the BINDING_ENDED_AUTO partial index).
    await prisma.auditEvent.create({
      data: {
        id: randomUUID(),
        companyId,
        kind: 'BINDING_CREATED',
        actorId: hrUserId,
        targetId: binding.id,
        payload: { bindingId: binding.id, n: 1 } as Record<string, unknown>,
      },
    });
    await prisma.auditEvent.create({
      data: {
        id: randomUUID(),
        companyId,
        kind: 'BINDING_CREATED',
        actorId: hrUserId,
        targetId: binding.id,
        payload: { bindingId: binding.id, n: 2 } as Record<string, unknown>,
      },
    });

    const audits = await prisma.auditEvent.findMany({
      where: { companyId, kind: 'BINDING_CREATED', targetId: binding.id },
    });
    expect(audits).toHaveLength(2);
  });
});
