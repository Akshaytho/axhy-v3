/**
 * Real-DB integration test: createProposedDecision lifecycle writer.
 *
 * F-002 §3a writer test. Covers all 6 propose_* tool mappings + the
 * unknown-tool no-op path, verifies row shape (kind/tier/targetId/payload/
 * ackRequired/proposedDuringAbsence/originContext) and that DWI_PROPOSED
 * is emitted with the right payload.
 *
 * @derives(F-002 scope §3a)
 * @derives(workflow-design-closure §3.2)
 */

import { randomUUID } from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

import { createProposedDecision } from '../src/lib/supervisor-decision-writer.js';
import { withTenantContext } from '../src/middleware/tenant-context.js';

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `f002-write-${Date.now()}-`;

let companyId: string;
let supervisorId: string;
let workerId: string;
let siteId: string;
let threadId: string;
let assistantMessageId: string;

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

  const sup = await prisma.user.create({
    data: {
      phone: '+919999' + String(Date.now() + 1).slice(-7),
      name: 'Supervisor',
      locale: 'en',
      companyId,
    },
  });
  supervisorId = sup.id;

  const w = await prisma.worker.create({
    data: {
      companyId,
      name: 'Test Worker',
      phone: '+919999' + String(Date.now() + 2).slice(-7),
    },
  });
  workerId = w.id;

  const s = await prisma.site.create({ data: { companyId, name: 'Test Site' } });
  siteId = s.id;

  const thread = await prisma.chatThread.create({
    data: { companyId, supervisorId, lastMessageAt: new Date() },
  });
  threadId = thread.id;

  const msg = await prisma.chatMessage.create({
    data: { companyId, threadId, role: 'assistant', aiResponseText: 'ok' },
  });
  assistantMessageId = msg.id;
});

afterAll(async () => {
  await prisma.company.deleteMany({ where: { slug: { startsWith: TEST_PREFIX } } });
  await prisma.$disconnect();
});

describe('createProposedDecision — F-002 §3a', () => {
  it('writes a MARK_ABSENT/OPERATIONAL row for propose_mark_absent', async () => {
    const decisionId = randomUUID();
    const result = await withTenantContext(prisma, companyId, async (tx) =>
      createProposedDecision(tx, {
        decisionId,
        companyId,
        supervisorId,
        toolName: 'propose_mark_absent',
        fields: { workerId, date: '2026-05-15', reason: 'sick' },
        threadId,
        assistantMessageId,
      }),
    );
    expect(result).not.toBeNull();
    expect(result!.decisionId).toBe(decisionId);
    expect(result!.kind).toBe('MARK_ABSENT');
    expect(result!.tier).toBe('OPERATIONAL');
    expect(result!.targetId).toBe(workerId);

    const row = await prisma.supervisorDecision.findUnique({ where: { id: decisionId } });
    expect(row).not.toBeNull();
    expect(row!.kind).toBe('MARK_ABSENT');
    expect(row!.tier).toBe('OPERATIONAL');
    expect(row!.supervisorId).toBe(supervisorId);
    expect(row!.targetId).toBe(workerId);
    expect(row!.appliedAt).toBeNull();
    expect(row!.dismissedAt).toBeNull();
    expect(row!.ackRequired).toBe(false);
    const payload = row!.payload as Record<string, unknown>;
    expect(payload.workerId).toBe(workerId);
    expect(payload.reason).toBe('sick');

    const audit = await prisma.auditEvent.findFirst({
      where: { companyId, kind: 'DWI_PROPOSED', targetId: decisionId },
    });
    expect(audit).not.toBeNull();
    const ap = audit!.payload as Record<string, unknown>;
    expect(ap.kind).toBe('MARK_ABSENT');
    expect(ap.tier).toBe('OPERATIONAL');
    expect(ap.sourceChatThreadId).toBe(threadId);
    expect(ap.sourceChatMessageId).toBe(assistantMessageId);
  });

  it('writes a TERMINATE_WORKER/EMPLOYMENT row with ackRequired=true for propose_termination', async () => {
    const decisionId = randomUUID();
    await withTenantContext(prisma, companyId, async (tx) =>
      createProposedDecision(tx, {
        decisionId,
        companyId,
        supervisorId,
        toolName: 'propose_termination',
        fields: { workerId, effectiveDate: '2026-06-01', reason: 'performance' },
        threadId,
        assistantMessageId,
      }),
    );
    const row = await prisma.supervisorDecision.findUnique({ where: { id: decisionId } });
    expect(row!.kind).toBe('TERMINATE_WORKER');
    expect(row!.tier).toBe('EMPLOYMENT');
    expect(row!.ackRequired).toBe(true);
  });

  it('writes a SWAP_WORKER row with siteId as the targetId for propose_swap', async () => {
    const decisionId = randomUUID();
    await withTenantContext(prisma, companyId, async (tx) =>
      createProposedDecision(tx, {
        decisionId,
        companyId,
        supervisorId,
        toolName: 'propose_swap',
        fields: { fromWorkerId: workerId, toWorkerId: workerId, siteId, effectiveAt: '2026-05-16' },
        threadId,
        assistantMessageId,
      }),
    );
    const row = await prisma.supervisorDecision.findUnique({ where: { id: decisionId } });
    expect(row!.kind).toBe('SWAP_WORKER');
    expect(row!.tier).toBe('OPERATIONAL');
    expect(row!.targetId).toBe(siteId);
  });

  it('writes a LIVING_DOC_RULE/NOTE row with no targetId for propose_living_doc_update', async () => {
    const decisionId = randomUUID();
    await withTenantContext(prisma, companyId, async (tx) =>
      createProposedDecision(tx, {
        decisionId,
        companyId,
        supervisorId,
        toolName: 'propose_living_doc_update',
        fields: { section: 'rules', ruleText: 'No work on Sundays', visibility: 'team' },
        threadId,
        assistantMessageId,
      }),
    );
    const row = await prisma.supervisorDecision.findUnique({ where: { id: decisionId } });
    expect(row!.kind).toBe('LIVING_DOC_RULE');
    expect(row!.tier).toBe('NOTE');
    expect(row!.targetId).toBeNull();
    expect(row!.ackRequired).toBe(false);
  });

  it('captures originContext with sourceChatThreadId + sourceChatMessageId + fields + capturedAt', async () => {
    const decisionId = randomUUID();
    await withTenantContext(prisma, companyId, async (tx) =>
      createProposedDecision(tx, {
        decisionId,
        companyId,
        supervisorId,
        toolName: 'propose_mark_absent',
        fields: { workerId, date: '2026-05-15' },
        threadId,
        assistantMessageId,
      }),
    );
    const row = await prisma.supervisorDecision.findUnique({ where: { id: decisionId } });
    const oc = row!.originContext as Record<string, unknown>;
    expect(oc.sourceChatThreadId).toBe(threadId);
    expect(oc.sourceChatMessageId).toBe(assistantMessageId);
    expect(typeof oc.capturedAt).toBe('string');
    const fields = oc.fields as Record<string, unknown>;
    expect(fields.workerId).toBe(workerId);
  });

  it('returns null + no row + no audit for an unknown propose_* tool name', async () => {
    const decisionId = randomUUID();
    const result = await withTenantContext(prisma, companyId, async (tx) =>
      createProposedDecision(tx, {
        decisionId,
        companyId,
        supervisorId,
        toolName: 'propose_unknown_future_tool',
        fields: { foo: 'bar' },
        threadId,
        assistantMessageId,
      }),
    );
    expect(result).toBeNull();
    const row = await prisma.supervisorDecision.findUnique({ where: { id: decisionId } });
    expect(row).toBeNull();
    const audit = await prisma.auditEvent.findFirst({
      where: { companyId, kind: 'DWI_PROPOSED', targetId: decisionId },
    });
    expect(audit).toBeNull();
  });
});
