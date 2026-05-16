/**
 * F-007 round-2 v11 — Real-DB integration tests for the notification
 * dispatcher (`notification.supervisor_change` topic + composer + handler).
 *
 * Tests assert the v11 invariants:
 *   * Immutable rows (no coalescing in persistence).
 *   * ONE Notification row per (recipient × channel × site × source-event).
 *   * Channel set per recipient = push + in_app_banner (with `Worker.userId
 *     IS NULL` → in_app_banner only).
 *   * `deliveredAt`/`failedAt` always NULL from F-007 (delivery deferred).
 *   * ZERO `WORKER_SUPERVISOR_CHANGE_NOTIFIED` audit emits from F-007.
 *   * Cross-tenant isolation.
 *   * Telugu / Hindi / apostrophe rendering (v11 panel-test Aanya).
 *   * Idempotent replay via partial unique index (single P2002 catch).
 *   * DB CHECK constraint enforces audience mutual exclusion.
 *
 * @derives(F-007 scope round-2 v11 §5 + §8)
 */

import { randomUUID } from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Prisma, PrismaClient } from '@prisma/client';
import pino from 'pino';
import type { FastifyBaseLogger } from 'fastify';

import { writeHandoffPackage } from '../src/lib/handoff-package-writer.js';
import { composeHandoffPackage } from '../src/lib/handoff-package-composer.js';
import { withTenantContext } from '../src/middleware/tenant-context.js';
import { handleNotificationSupervisorChange } from '../src/dispatcher/handlers/notifications.js';
import {
  SupervisorChangeNotificationPayloadSchema,
  escapeMessageVar,
} from '../src/lib/notification-payload.js';

type JsonObject = Record<string, unknown>;

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const log = pino({ level: 'silent' }) as unknown as FastifyBaseLogger;

const TEST_PREFIX = `f007-notif-${Date.now()}-`;

let companyA: string;
let companyB: string; // cross-tenant
let ravi: string;
let anjali: string;
let lakshmi: string;
let hrUserId: string;
let workerWithUserA: string; // worker A — has userId
let workerNoUser: string; // worker B — userId NULL
let workerWithUserA_userId: string;

beforeAll(async () => {
  const coA = await prisma.company.create({
    data: {
      name: TEST_PREFIX + 'CoA',
      slug: TEST_PREFIX + 'co-a',
      ownerPhone: '+91' + String(Date.now() + 90000).slice(-10),
      ownerName: 'OwnerA',
    },
  });
  companyA = coA.id;
  const coB = await prisma.company.create({
    data: {
      name: TEST_PREFIX + 'CoB',
      slug: TEST_PREFIX + 'co-b',
      ownerPhone: '+91' + String(Date.now() + 90001).slice(-10),
      ownerName: 'OwnerB',
    },
  });
  companyB = coB.id;

  const mkUser = async (
    name: string,
    offset: number,
    cId: string,
    locale = 'en',
  ): Promise<string> =>
    (
      await prisma.user.create({
        data: {
          phone: '+91' + String(Date.now() + offset).slice(-10),
          name,
          locale,
          companyId: cId,
        },
      })
    ).id;

  ravi = await mkUser('Ravi', 1000, companyA, 'te');
  anjali = await mkUser('Anjali', 1001, companyA, 'en');
  lakshmi = await mkUser('Lakshmi', 1002, companyA, 'hi');
  hrUserId = await mkUser('HR-A', 1003, companyA, 'en');
  workerWithUserA_userId = await mkUser("Mr. D'Souza", 1004, companyA, 'te');

  // Worker A — has linked User (and Telugu preferred language)
  workerWithUserA = (
    await prisma.worker.create({
      data: {
        companyId: companyA,
        name: "Mr. D'Souza",
        phone: '+91' + String(Date.now() + 2000).slice(-10),
        baseSalaryPaise: 14000_00,
        userId: workerWithUserA_userId,
        preferredLanguage: 'te',
      },
    })
  ).id;

  // Worker B — NO linked User (push will be skipped per pick 5 exception)
  workerNoUser = (
    await prisma.worker.create({
      data: {
        companyId: companyA,
        name: 'Worker-NoUser',
        phone: '+91' + String(Date.now() + 2001).slice(-10),
        baseSalaryPaise: 12000_00,
        userId: null,
        preferredLanguage: 'hi',
      },
    })
  ).id;
});

afterAll(async () => {
  await prisma.company.deleteMany({ where: { slug: { startsWith: TEST_PREFIX } } });
  await prisma.$disconnect();
});

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

async function newSite(name: string, cId = companyA): Promise<string> {
  const s = await prisma.site.create({
    data: { companyId: cId, name: TEST_PREFIX + name + '-' + randomUUID().slice(0, 6) },
  });
  return s.id;
}

async function assignWorker(siteId: string, workerId: string, cId = companyA): Promise<void> {
  await prisma.assignment.create({
    data: {
      companyId: cId,
      siteId,
      workerId,
      shiftStart: '08:00',
      shiftEnd: '17:00',
      dayMask: 'MTWTFS_',
      validFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
      validUntil: null,
      state: 'ACTIVE',
    },
  });
}

/**
 * Drive the full Pattern A flow:
 *   1. Inside withTenantContext tx: create binding + call writeHandoffPackage
 *      (which emits the audit + outbox row).
 *   2. Read the outbox row.
 *   3. Invoke the dispatcher handler directly with the outbox payload.
 */
async function triggerHandoffPackageGenerated(args: {
  cId: string;
  siteId: string;
  outgoingSupervisorId: string | null;
  incomingSupervisorId: string;
  kind: 'PERMANENT' | 'ACTING';
}): Promise<{ bindingId: string; sourceAuditId: string; outboxId: string }> {
  return withTenantContext(prisma, args.cId, async (tx) => {
    const payload = await composeHandoffPackage(tx, {
      companyId: args.cId,
      siteId: args.siteId,
      outgoingSupervisorId: args.outgoingSupervisorId,
      incomingSupervisorId: args.incomingSupervisorId,
    });
    const binding = await tx.siteSupervisorBinding.create({
      data: {
        companyId: args.cId,
        siteId: args.siteId,
        userId: args.incomingSupervisorId,
        actingForUserId: args.kind === 'ACTING' ? args.outgoingSupervisorId : null,
        effectiveFrom: new Date(),
        effectiveUntil:
          args.kind === 'ACTING' ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : null,
        reason: 'F-007 test seed',
        createdBy: hrUserId,
        handoffPackage: payload as unknown as Prisma.InputJsonValue,
      },
    });
    await writeHandoffPackage(tx, {
      bindingId: binding.id,
      companyId: args.cId,
      siteId: args.siteId,
      outgoingSupervisorId: args.outgoingSupervisorId,
      incomingSupervisorId: args.incomingSupervisorId,
      payload,
      kind: args.kind,
      actorId: hrUserId,
    });
    // Read the outbox row + audit (both already committed in this tx by here).
    const outbox = await tx.outbox.findFirst({
      where: {
        companyId: args.cId,
        topic: 'notification.supervisor_change',
        payload: { path: ['bindingId'], equals: binding.id } as unknown as Prisma.JsonFilter,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!outbox) throw new Error('Outbox row not enqueued');
    const op = outbox.payload as JsonObject;
    return {
      bindingId: binding.id,
      sourceAuditId: op.sourceAuditId as string,
      outboxId: outbox.id,
    };
  });
}

async function runHandler(outboxPayload: {
  sourceAuditId: string;
  bindingId: string;
  eventKind: 'acting_start' | 'acting_end' | 'permanent_rebind';
}): Promise<void> {
  await handleNotificationSupervisorChange(outboxPayload, log);
}

async function notificationsFor(
  bindingId: string,
  cId = companyA,
): Promise<
  Array<{
    audienceUserId: string | null;
    audienceWorkerId: string | null;
    channel: string;
    payload: JsonObject;
    deliveredAt: Date | null;
    failedAt: Date | null;
  }>
> {
  const rows = await prisma.notification.findMany({
    where: {
      companyId: cId,
      kind: 'supervisor_change',
      payload: { path: ['bindingId'], equals: bindingId } as unknown as Prisma.JsonFilter,
    },
    orderBy: [{ audienceUserId: 'asc' }, { audienceWorkerId: 'asc' }, { channel: 'asc' }],
  });
  return rows.map((r) => ({
    audienceUserId: r.audienceUserId,
    audienceWorkerId: r.audienceWorkerId,
    channel: r.channel,
    payload: r.payload as JsonObject,
    deliveredAt: r.deliveredAt,
    failedAt: r.failedAt,
  }));
}

// ─────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────

describe('F-007 round-2 v11 — notification-supervisor-change (real-DB)', () => {
  it('1. permanent rebind → workers + outgoing + incoming × 2 channels; deliveredAt all NULL; ZERO audit emits', async () => {
    const siteId = await newSite('perm-1');
    await assignWorker(siteId, workerWithUserA);

    const { bindingId, sourceAuditId } = await triggerHandoffPackageGenerated({
      cId: companyA,
      siteId,
      outgoingSupervisorId: ravi,
      incomingSupervisorId: anjali,
      kind: 'PERMANENT',
    });
    await runHandler({ sourceAuditId, bindingId, eventKind: 'permanent_rebind' });

    const rows = await notificationsFor(bindingId);
    // 3 recipients (1 worker + outgoing ravi + incoming anjali) × 2 channels = 6 rows.
    expect(rows).toHaveLength(6);
    // No fake deliveredAt; no failedAt.
    for (const r of rows) {
      expect(r.deliveredAt).toBeNull();
      expect(r.failedAt).toBeNull();
      expect(r.payload.schemaVersion).toBe(1);
      expect(r.payload.siteId).toBe(siteId);
      expect(r.payload.eventKind).toBe('permanent_rebind');
    }
    // Channel set = push + in_app_banner only.
    const channels = new Set(rows.map((r) => r.channel));
    expect(channels).toEqual(new Set(['push', 'in_app_banner']));
    // Zero WORKER_SUPERVISOR_CHANGE_NOTIFIED audit rows.
    const audits = await prisma.auditEvent.count({
      where: { companyId: companyA, kind: 'WORKER_SUPERVISOR_CHANGE_NOTIFIED' },
    });
    expect(audits).toBe(0);
  });

  it('2. acting binding start → same audience shape with eventKind=acting_start', async () => {
    const siteId = await newSite('act-2');
    await assignWorker(siteId, workerWithUserA);

    const { bindingId } = await triggerHandoffPackageGenerated({
      cId: companyA,
      siteId,
      outgoingSupervisorId: ravi,
      incomingSupervisorId: lakshmi,
      kind: 'ACTING',
    });
    const ob = await prisma.outbox.findFirst({
      where: {
        companyId: companyA,
        topic: 'notification.supervisor_change',
        payload: { path: ['bindingId'], equals: bindingId } as unknown as Prisma.JsonFilter,
      },
    });
    await runHandler({
      sourceAuditId: (ob!.payload as JsonObject).sourceAuditId as string,
      bindingId,
      eventKind: 'acting_start',
    });

    const rows = await notificationsFor(bindingId);
    expect(rows).toHaveLength(6);
    for (const r of rows) expect(r.payload.eventKind).toBe('acting_start');
  });

  it('3. worker without userId → in_app_banner row only (push skipped per pick 5)', async () => {
    const siteId = await newSite('no-user-3');
    await assignWorker(siteId, workerWithUserA); // has userId → 2 rows
    await assignWorker(siteId, workerNoUser); // no userId → 1 row

    const { bindingId } = await triggerHandoffPackageGenerated({
      cId: companyA,
      siteId,
      outgoingSupervisorId: ravi,
      incomingSupervisorId: anjali,
      kind: 'PERMANENT',
    });
    const ob = await prisma.outbox.findFirst({
      where: {
        companyId: companyA,
        topic: 'notification.supervisor_change',
        payload: { path: ['bindingId'], equals: bindingId } as unknown as Prisma.JsonFilter,
      },
    });
    await runHandler({
      sourceAuditId: (ob!.payload as JsonObject).sourceAuditId as string,
      bindingId,
      eventKind: 'permanent_rebind',
    });

    const rows = await notificationsFor(bindingId);
    // Worker A (userId set): 2 rows. Worker B (userId NULL): 1 row. Outgoing: 2. Incoming: 2. Total: 7.
    expect(rows).toHaveLength(7);
    const workerARows = rows.filter((r) => r.audienceWorkerId === workerWithUserA);
    expect(workerARows.map((r) => r.channel).sort()).toEqual(['in_app_banner', 'push']);
    const workerBRows = rows.filter((r) => r.audienceWorkerId === workerNoUser);
    expect(workerBRows).toHaveLength(1);
    expect(workerBRows[0].channel).toBe('in_app_banner');
  });

  it('4. idempotent replay — same source event handler invoked twice → no duplicate rows (P2002 caught)', async () => {
    const siteId = await newSite('replay-4');
    await assignWorker(siteId, workerWithUserA);

    const { bindingId } = await triggerHandoffPackageGenerated({
      cId: companyA,
      siteId,
      outgoingSupervisorId: ravi,
      incomingSupervisorId: anjali,
      kind: 'PERMANENT',
    });
    const ob = await prisma.outbox.findFirst({
      where: {
        companyId: companyA,
        topic: 'notification.supervisor_change',
        payload: { path: ['bindingId'], equals: bindingId } as unknown as Prisma.JsonFilter,
      },
    });
    const payload = {
      sourceAuditId: (ob!.payload as JsonObject).sourceAuditId as string,
      bindingId,
      eventKind: 'permanent_rebind' as const,
    };
    await runHandler(payload);
    await runHandler(payload); // replay
    await runHandler(payload); // replay again

    const rows = await notificationsFor(bindingId);
    expect(rows).toHaveLength(6); // not 18 — replays caught by P2002 on partial unique index
  });

  it('5. worker multi-site no coalescing — same worker on 2 sites under different bindings = 2x rows per worker (one per site)', async () => {
    const site1 = await newSite('multisite-5a');
    const site2 = await newSite('multisite-5b');
    await assignWorker(site1, workerWithUserA);
    await assignWorker(site2, workerWithUserA);

    // Two separate permanent rebind events — one per site.
    const t1 = await triggerHandoffPackageGenerated({
      cId: companyA,
      siteId: site1,
      outgoingSupervisorId: ravi,
      incomingSupervisorId: anjali,
      kind: 'PERMANENT',
    });
    const ob1 = await prisma.outbox.findFirst({
      where: {
        companyId: companyA,
        topic: 'notification.supervisor_change',
        payload: { path: ['bindingId'], equals: t1.bindingId } as unknown as Prisma.JsonFilter,
      },
    });
    await runHandler({
      sourceAuditId: (ob1!.payload as JsonObject).sourceAuditId as string,
      bindingId: t1.bindingId,
      eventKind: 'permanent_rebind',
    });

    const t2 = await triggerHandoffPackageGenerated({
      cId: companyA,
      siteId: site2,
      outgoingSupervisorId: ravi,
      incomingSupervisorId: anjali,
      kind: 'PERMANENT',
    });
    const ob2 = await prisma.outbox.findFirst({
      where: {
        companyId: companyA,
        topic: 'notification.supervisor_change',
        payload: { path: ['bindingId'], equals: t2.bindingId } as unknown as Prisma.JsonFilter,
      },
    });
    await runHandler({
      sourceAuditId: (ob2!.payload as JsonObject).sourceAuditId as string,
      bindingId: t2.bindingId,
      eventKind: 'permanent_rebind',
    });

    // Worker A appears in both bindings' notification sets — totalling 2 × 2 = 4 rows for the worker.
    const workerRows = await prisma.notification.findMany({
      where: {
        companyId: companyA,
        kind: 'supervisor_change',
        audienceWorkerId: workerWithUserA,
        OR: [
          { payload: { path: ['siteId'], equals: site1 } as unknown as Prisma.JsonFilter },
          { payload: { path: ['siteId'], equals: site2 } as unknown as Prisma.JsonFilter },
        ],
      },
    });
    expect(workerRows).toHaveLength(4);
    // siteIds differ across rows — no merge.
    const siteIds = new Set(workerRows.map((r) => (r.payload as JsonObject).siteId));
    expect(siteIds.size).toBe(2);
  });

  it('6. cross-tenant isolation — companyB sees zero notification rows for companyA events', async () => {
    const siteId = await newSite('xt-6', companyA);
    await assignWorker(siteId, workerWithUserA);
    const { bindingId } = await triggerHandoffPackageGenerated({
      cId: companyA,
      siteId,
      outgoingSupervisorId: ravi,
      incomingSupervisorId: anjali,
      kind: 'PERMANENT',
    });
    const ob = await prisma.outbox.findFirst({
      where: {
        companyId: companyA,
        topic: 'notification.supervisor_change',
        payload: { path: ['bindingId'], equals: bindingId } as unknown as Prisma.JsonFilter,
      },
    });
    await runHandler({
      sourceAuditId: (ob!.payload as JsonObject).sourceAuditId as string,
      bindingId,
      eventKind: 'permanent_rebind',
    });

    const coBRows = await prisma.notification.findMany({
      where: { companyId: companyB, kind: 'supervisor_change' },
    });
    expect(coBRows).toHaveLength(0);
  });

  it('7. localisation + Telugu/Hindi + apostrophe escape (v11 panel-test Aanya)', async () => {
    const siteId = await newSite('loc-7');
    // Site with Telugu name "హైదరాబాద్"
    await prisma.site.update({ where: { id: siteId }, data: { name: 'హైదరాబాద్' } });
    await assignWorker(siteId, workerWithUserA); // Telugu preferredLanguage + apostrophe in name

    const { bindingId } = await triggerHandoffPackageGenerated({
      cId: companyA,
      siteId,
      outgoingSupervisorId: ravi,
      incomingSupervisorId: anjali,
      kind: 'PERMANENT',
    });
    const ob = await prisma.outbox.findFirst({
      where: {
        companyId: companyA,
        topic: 'notification.supervisor_change',
        payload: { path: ['bindingId'], equals: bindingId } as unknown as Prisma.JsonFilter,
      },
    });
    await runHandler({
      sourceAuditId: (ob!.payload as JsonObject).sourceAuditId as string,
      bindingId,
      eventKind: 'permanent_rebind',
    });

    const workerRows = await prisma.notification.findMany({
      where: {
        companyId: companyA,
        kind: 'supervisor_change',
        audienceWorkerId: workerWithUserA,
        payload: { path: ['bindingId'], equals: bindingId } as unknown as Prisma.JsonFilter,
      },
    });
    for (const r of workerRows) {
      const pl = r.payload as JsonObject;
      const messageVars = pl.messageVars as JsonObject;
      // Worker's preferredLanguage 'te' lands as lang variable.
      expect(messageVars.lang).toBe('te');
      // Site name in the messageVars is the Telugu string (no escape because no ${ in it).
      expect(messageVars.siteName).toBe('హైదరాబాద్');
      // Worker name "Mr. D'Souza" — apostrophe should be escaped via escapeMessageVar.
      expect(messageVars.workerName).toBe("Mr. D\\'Souza");
    }
  });

  it('8. first-ever-binding (outgoingSupervisorId IS NULL) → no rows for outgoing; workers + incoming still get rows', async () => {
    const siteId = await newSite('firstever-8');
    await assignWorker(siteId, workerWithUserA);

    const { bindingId } = await triggerHandoffPackageGenerated({
      cId: companyA,
      siteId,
      outgoingSupervisorId: null,
      incomingSupervisorId: anjali,
      kind: 'PERMANENT',
    });
    const ob = await prisma.outbox.findFirst({
      where: {
        companyId: companyA,
        topic: 'notification.supervisor_change',
        payload: { path: ['bindingId'], equals: bindingId } as unknown as Prisma.JsonFilter,
      },
    });
    await runHandler({
      sourceAuditId: (ob!.payload as JsonObject).sourceAuditId as string,
      bindingId,
      eventKind: 'permanent_rebind',
    });

    const rows = await notificationsFor(bindingId);
    // 1 worker + incoming anjali = 2 recipients × 2 channels = 4 rows.
    expect(rows).toHaveLength(4);
    // No row has the outgoing supervisor (he's null).
    const outgoingRows = rows.filter(
      (r) => r.audienceUserId === null && r.audienceWorkerId === null,
    );
    expect(outgoingRows).toHaveLength(0);
    // Every row's outgoingSupervisorId field in payload is null.
    for (const r of rows) {
      expect(r.payload.outgoingSupervisorId).toBeNull();
    }
  });

  it('9. DB CHECK constraint — direct INSERT with both audience FKs NULL is rejected', async () => {
    await expect(
      prisma.notification.create({
        data: {
          companyId: companyA,
          audienceUserId: null,
          audienceWorkerId: null,
          kind: 'supervisor_change',
          channel: 'push',
          priority: 'STANDARD',
          payload: {} as Prisma.InputJsonValue,
        },
      }),
    ).rejects.toThrow();

    // And both set is also rejected.
    await expect(
      prisma.notification.create({
        data: {
          companyId: companyA,
          audienceUserId: ravi,
          audienceWorkerId: workerWithUserA,
          kind: 'supervisor_change',
          channel: 'push',
          priority: 'STANDARD',
          payload: {} as Prisma.InputJsonValue,
        },
      }),
    ).rejects.toThrow();
  });

  it('10. Zod payload schema rejects missing/wrong schemaVersion (unit test)', () => {
    const validPayload = {
      schemaVersion: 1,
      messageKey: 'supervisor_change.permanent_rebind.worker',
      messageVars: { incomingName: 'Anjali' },
      eventKind: 'permanent_rebind' as const,
      bindingId: randomUUID(),
      outgoingSupervisorId: randomUUID(),
      incomingSupervisorId: randomUUID(),
      siteId: randomUUID(),
      sourceAuditId: randomUUID(),
      effectiveAt: new Date().toISOString(),
    };
    expect(SupervisorChangeNotificationPayloadSchema.safeParse(validPayload).success).toBe(true);

    // schemaVersion=0 fails.
    expect(
      SupervisorChangeNotificationPayloadSchema.safeParse({ ...validPayload, schemaVersion: 0 })
        .success,
    ).toBe(false);
    // schemaVersion=2 fails.
    expect(
      SupervisorChangeNotificationPayloadSchema.safeParse({ ...validPayload, schemaVersion: 2 })
        .success,
    ).toBe(false);
    // Missing schemaVersion fails.
    const { schemaVersion, ...withoutSchemaVersion } = validPayload;
    void schemaVersion;
    expect(SupervisorChangeNotificationPayloadSchema.safeParse(withoutSchemaVersion).success).toBe(
      false,
    );

    // escapeMessageVar safety on the named test case + devanagari script preserved.
    expect(escapeMessageVar("Mr. D'Souza")).toBe("Mr. D\\'Souza");
    expect(escapeMessageVar('हैदराबाद')).toBe('हैदराबाद');
    expect(escapeMessageVar('Total ${value}')).toBe('Total \\${value\\}');
  });

  it('11. supervisor multi-site no coalescing — 4 sites bound in one HR session produce 4×2=8 rows per supervisor (not 1 merged row)', async () => {
    const sites = [
      await newSite('supcoalesce-11a'),
      await newSite('supcoalesce-11b'),
      await newSite('supcoalesce-11c'),
      await newSite('supcoalesce-11d'),
    ];
    // No workers on these sites (keeps the assertion focused on the supervisor side).
    const bindingIds: string[] = [];
    for (const siteId of sites) {
      const { bindingId } = await triggerHandoffPackageGenerated({
        cId: companyA,
        siteId,
        outgoingSupervisorId: ravi,
        incomingSupervisorId: anjali,
        kind: 'PERMANENT',
      });
      const ob = await prisma.outbox.findFirst({
        where: {
          companyId: companyA,
          topic: 'notification.supervisor_change',
          payload: { path: ['bindingId'], equals: bindingId } as unknown as Prisma.JsonFilter,
        },
      });
      await runHandler({
        sourceAuditId: (ob!.payload as JsonObject).sourceAuditId as string,
        bindingId,
        eventKind: 'permanent_rebind',
      });
      bindingIds.push(bindingId);
    }
    // Incoming supervisor anjali across 4 events: 4 × 2 channels = 8 rows; each with distinct siteId.
    const anjaliRows = await prisma.notification.findMany({
      where: {
        companyId: companyA,
        kind: 'supervisor_change',
        audienceUserId: anjali,
        OR: bindingIds.map((id) => ({
          payload: { path: ['bindingId'], equals: id } as unknown as Prisma.JsonFilter,
        })),
      },
    });
    expect(anjaliRows).toHaveLength(8);
    const distinctSiteIds = new Set(anjaliRows.map((r) => (r.payload as JsonObject).siteId));
    expect(distinctSiteIds.size).toBe(4);
    // No row has a coalescedSiteIds field — v7 reset removed parallel arrays entirely.
    for (const r of anjaliRows) {
      const pl = r.payload as JsonObject;
      expect(pl.coalescedSiteIds).toBeUndefined();
      expect(pl.coalescedSourceAuditIds).toBeUndefined();
      expect(pl.eventTimestamps).toBeUndefined();
      expect(pl.firstSourceAuditId).toBeUndefined();
    }
  });
});
