/**
 * Real-DB integration test: proposedDuringAbsence flag detection.
 *
 * F-002 §3a + scope Q5. The flag is auto-set TRUE when the originating
 * supervisor is currently being covered by someone else acting for them
 * at the routed site. False otherwise.
 *
 * Cases covered:
 *   1. ACTING binding covers originator → flag TRUE.
 *   2. PERMANENT binding only → flag FALSE.
 *   3. ACTING binding covers a DIFFERENT user (not originator) → flag FALSE.
 *   4. No binding on the site at all → flag FALSE (best-effort, defaults to false).
 *   5. Non-binding-routable kind (LIVING_DOC_RULE, no targetId) → flag FALSE.
 *
 * @derives(F-002 scope §3a + §7-Q5)
 * @derives(workflow-design-closure §3.2 — proposedDuringAbsence)
 */

import { randomUUID } from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

import { createProposedDecision } from '../src/lib/supervisor-decision-writer.js';
import { withTenantContext } from '../src/middleware/tenant-context.js';

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `f002-pda-${Date.now()}-`;

let companyId: string;
let userA: string; // originator + permanent owner of siteCovered
let userB: string; // acting cover for userA
let userC: string; // unrelated user (acts for someone else in another test)
let workerOnSiteCovered: string;
let workerOnSiteNoBinding: string;
let siteCovered: string; // userA permanent + userB acting (covers userA)
let sitePermOnly: string; // userA permanent only
let siteOtherActing: string; // permanent userA + acting userB covering userC
let siteEmpty: string; // no binding at all

beforeAll(async () => {
  const co = await prisma.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919999923001',
      ownerName: 'O',
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

  userA = await mk('A', 2300);
  userB = await mk('B', 2301);
  userC = await mk('C', 2302);

  siteCovered = (await prisma.site.create({ data: { companyId, name: 'covered' } })).id;
  sitePermOnly = (await prisma.site.create({ data: { companyId, name: 'permOnly' } })).id;
  siteOtherActing = (await prisma.site.create({ data: { companyId, name: 'otherActing' } })).id;
  siteEmpty = (await prisma.site.create({ data: { companyId, name: 'empty' } })).id;

  // siteCovered: userA permanent + userB acting for userA → flag should be TRUE.
  await prisma.siteSupervisorBinding.create({
    data: {
      companyId,
      siteId: siteCovered,
      userId: userA,
      actingForUserId: null,
      effectiveFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      effectiveUntil: null,
      reason: 'perm',
      createdBy: userA,
    },
  });
  await prisma.siteSupervisorBinding.create({
    data: {
      companyId,
      siteId: siteCovered,
      userId: userB,
      actingForUserId: userA,
      effectiveFrom: new Date(Date.now() - 60_000),
      effectiveUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      reason: 'acting cover for userA',
      createdBy: userA,
    },
  });

  // sitePermOnly: userA permanent only → flag should be FALSE.
  await prisma.siteSupervisorBinding.create({
    data: {
      companyId,
      siteId: sitePermOnly,
      userId: userA,
      actingForUserId: null,
      effectiveFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      effectiveUntil: null,
      reason: 'perm only',
      createdBy: userA,
    },
  });

  // siteOtherActing: userA permanent + userB acting for userC → flag FALSE
  // (the acting binding is for someone other than the originator).
  await prisma.siteSupervisorBinding.create({
    data: {
      companyId,
      siteId: siteOtherActing,
      userId: userA,
      actingForUserId: null,
      effectiveFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      effectiveUntil: null,
      reason: 'perm',
      createdBy: userA,
    },
  });
  await prisma.siteSupervisorBinding.create({
    data: {
      companyId,
      siteId: siteOtherActing,
      userId: userB,
      actingForUserId: userC,
      effectiveFrom: new Date(Date.now() - 60_000),
      effectiveUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      reason: 'acting cover for userC',
      createdBy: userA,
    },
  });

  // Workers — bind to the right sites via assignments so deriveWorkerPrimarySiteId routes correctly.
  const wCovered = await prisma.worker.create({
    data: {
      companyId,
      name: 'W-covered',
      phone: '+919999' + String(Date.now() + 2310).slice(-7),
    },
  });
  workerOnSiteCovered = wCovered.id;
  await prisma.assignment.create({
    data: {
      companyId,
      workerId: workerOnSiteCovered,
      siteId: siteCovered,
      shiftStart: '09:00',
      shiftEnd: '17:00',
      dayMask: 'MTWTFS_',
      validFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
      validUntil: null,
      state: 'ACTIVE',
    },
  });

  const wNoBinding = await prisma.worker.create({
    data: {
      companyId,
      name: 'W-nobinding',
      phone: '+919999' + String(Date.now() + 2311).slice(-7),
    },
  });
  workerOnSiteNoBinding = wNoBinding.id;
  await prisma.assignment.create({
    data: {
      companyId,
      workerId: workerOnSiteNoBinding,
      siteId: siteEmpty,
      shiftStart: '09:00',
      shiftEnd: '17:00',
      dayMask: 'MTWTFS_',
      validFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
      validUntil: null,
      state: 'ACTIVE',
    },
  });
});

afterAll(async () => {
  await prisma.company.deleteMany({ where: { slug: { startsWith: TEST_PREFIX } } });
  await prisma.$disconnect();
});

async function makeProposal(args: {
  toolName: string;
  fields: Record<string, unknown>;
  supervisorId?: string;
}): Promise<{ proposedDuringAbsence: boolean; decisionId: string }> {
  const decisionId = randomUUID();
  const supId = args.supervisorId ?? userA;
  // ChatThread has a unique (companyId, supervisorId) constraint; reuse via upsert.
  const thread = await prisma.chatThread.upsert({
    where: { companyId_supervisorId: { companyId, supervisorId: supId } },
    create: { companyId, supervisorId: supId, lastMessageAt: new Date() },
    update: { lastMessageAt: new Date() },
  });
  const msg = await prisma.chatMessage.create({
    data: { companyId, threadId: thread.id, role: 'assistant', aiResponseText: 'ok' },
  });
  await withTenantContext(prisma, companyId, async (tx) =>
    createProposedDecision(tx, {
      decisionId,
      companyId,
      supervisorId: args.supervisorId ?? userA,
      toolName: args.toolName,
      fields: args.fields,
      threadId: thread.id,
      assistantMessageId: msg.id,
    }),
  );
  const row = await prisma.supervisorDecision.findUnique({ where: { id: decisionId } });
  return { proposedDuringAbsence: row!.proposedDuringAbsence, decisionId };
}

describe('proposedDuringAbsence — F-002 §3a + Q5', () => {
  it('TRUE: originator (userA) proposes about a worker whose site has an acting binding covering userA', async () => {
    const { proposedDuringAbsence } = await makeProposal({
      toolName: 'propose_mark_absent',
      fields: { workerId: workerOnSiteCovered, date: '2026-05-15' },
      supervisorId: userA,
    });
    expect(proposedDuringAbsence).toBe(true);
  });

  it('FALSE: site has only a permanent binding (no acting)', async () => {
    // Create a worker on sitePermOnly to make the route resolvable.
    const w = await prisma.worker.create({
      data: {
        companyId,
        name: 'W-perm',
        phone: '+919999' + String(Date.now() + 2320).slice(-7),
      },
    });
    await prisma.assignment.create({
      data: {
        companyId,
        workerId: w.id,
        siteId: sitePermOnly,
        shiftStart: '09:00',
        shiftEnd: '17:00',
        dayMask: 'MTWTFS_',
        validFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
        validUntil: null,
        state: 'ACTIVE',
      },
    });
    const { proposedDuringAbsence } = await makeProposal({
      toolName: 'propose_mark_absent',
      fields: { workerId: w.id, date: '2026-05-15' },
      supervisorId: userA,
    });
    expect(proposedDuringAbsence).toBe(false);
  });

  it('FALSE: acting binding exists but covers someone other than the originator', async () => {
    const w = await prisma.worker.create({
      data: {
        companyId,
        name: 'W-other',
        phone: '+919999' + String(Date.now() + 2321).slice(-7),
      },
    });
    await prisma.assignment.create({
      data: {
        companyId,
        workerId: w.id,
        siteId: siteOtherActing,
        shiftStart: '09:00',
        shiftEnd: '17:00',
        dayMask: 'MTWTFS_',
        validFrom: new Date(Date.now() - 24 * 60 * 60 * 1000),
        validUntil: null,
        state: 'ACTIVE',
      },
    });
    // userA proposes; acting binding here covers userC, not userA → flag FALSE.
    const { proposedDuringAbsence } = await makeProposal({
      toolName: 'propose_mark_absent',
      fields: { workerId: w.id, date: '2026-05-15' },
      supervisorId: userA,
    });
    expect(proposedDuringAbsence).toBe(false);
  });

  it('FALSE: target worker has no resolvable site (no assignment to a bound site)', async () => {
    const { proposedDuringAbsence } = await makeProposal({
      toolName: 'propose_mark_absent',
      fields: { workerId: workerOnSiteNoBinding, date: '2026-05-15' },
      supervisorId: userA,
    });
    expect(proposedDuringAbsence).toBe(false);
  });

  it('FALSE: non-binding-routable kind (LIVING_DOC_RULE, no targetId)', async () => {
    const { proposedDuringAbsence } = await makeProposal({
      toolName: 'propose_living_doc_update',
      fields: { section: 'rules', ruleText: 'x', visibility: 'team' },
      supervisorId: userA,
    });
    expect(proposedDuringAbsence).toBe(false);
  });
});
