/**
 * Real-DB integration test for the owner AI-budget alert path.
 *
 * Spec 2 §9.4. Exercises:
 *   - dispatchBudgetAlert idempotency (same key same day → 1 row)
 *   - cross-tenant isolation (A's alerts never delivered to B)
 *   - dispatcher drains the topics correctly (handler stubs fire,
 *     audit row written, processedAt set)
 *
 * Phase D will swap the handler stubs for real Slack/Gupshup. This
 * test still passes after that swap because it asserts on Outbox row
 * + AuditEvent row, not on the egress side-effect.
 *
 * @derives(master-plan §G)
 * @derives(spec-2 §9.4, §12)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import pino from 'pino';
import type { FastifyBaseLogger } from 'fastify';
import { dispatchBudgetAlert } from '@axhy/ai-tools';

import { processOnce } from '../src/dispatcher/index.js';

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const TEST_PREFIX = `owner-budget-test-${Date.now()}-`;
const log = pino({ level: 'silent' }) as unknown as FastifyBaseLogger;

let companyAId: string;
let companyBId: string;

beforeAll(async () => {
  const a = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'A',
      slug: TEST_PREFIX + 'a',
      ownerPhone: '+9100' + Date.now().toString().slice(-9),
      ownerName: 'Test A',
    },
  });
  const b = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'B',
      slug: TEST_PREFIX + 'b',
      ownerPhone: '+9100' + (Date.now() + 1).toString().slice(-9),
      ownerName: 'Test B',
    },
  });
  companyAId = a.id;
  companyBId = b.id;
});

beforeEach(async () => {
  // Clear outbox + audit rows for our test tenants between cases.
  await prismaRaw.outbox.deleteMany({
    where: {
      companyId: { in: [companyAId, companyBId] },
      topic: { in: ['owner.ai_budget_warning', 'owner.ai_budget_capped'] },
    },
  });
  await prismaRaw.auditEvent.deleteMany({
    where: {
      companyId: { in: [companyAId, companyBId] },
      kind: 'OWNER_BUDGET_ALERT_DISPATCHED',
    },
  });
});

afterAll(async () => {
  await prismaRaw.outbox.deleteMany({
    where: { companyId: { in: [companyAId, companyBId] } },
  });
  await prismaRaw.auditEvent.deleteMany({
    where: { companyId: { in: [companyAId, companyBId] } },
  });
  await prismaRaw.company.deleteMany({
    where: { id: { in: [companyAId, companyBId] } },
  });
  await prismaRaw.$disconnect();
});

describe('dispatchBudgetAlert + owner-budget handlers', () => {
  it('warn fires once per UTC day; second call same day is idempotent', async () => {
    await dispatchBudgetAlert(companyAId, 'WARN', prismaRaw);
    await dispatchBudgetAlert(companyAId, 'WARN', prismaRaw);
    const rows = await prismaRaw.outbox.findMany({
      where: { companyId: companyAId, topic: 'owner.ai_budget_warning' },
    });
    expect(rows.length).toBe(1);
  });

  it('warn + cap on the same tenant same day → 2 outbox rows (different idempotency keys)', async () => {
    await dispatchBudgetAlert(companyAId, 'WARN', prismaRaw);
    await dispatchBudgetAlert(companyAId, 'CAP', prismaRaw);
    const all = await prismaRaw.outbox.findMany({
      where: {
        companyId: companyAId,
        topic: { in: ['owner.ai_budget_warning', 'owner.ai_budget_capped'] },
      },
      orderBy: { topic: 'asc' },
    });
    expect(all.length).toBe(2);
    expect(all.map((r) => r.topic).sort()).toEqual([
      'owner.ai_budget_capped',
      'owner.ai_budget_warning',
    ]);
  });

  it('cross-tenant isolation: A and B alerts coexist with no key collision', async () => {
    await dispatchBudgetAlert(companyAId, 'WARN', prismaRaw);
    await dispatchBudgetAlert(companyBId, 'WARN', prismaRaw);
    const rowsA = await prismaRaw.outbox.findMany({
      where: { companyId: companyAId, topic: 'owner.ai_budget_warning' },
    });
    const rowsB = await prismaRaw.outbox.findMany({
      where: { companyId: companyBId, topic: 'owner.ai_budget_warning' },
    });
    expect(rowsA.length).toBe(1);
    expect(rowsB.length).toBe(1);
    expect(rowsA[0]?.idempotencyKey).not.toBe(rowsB[0]?.idempotencyKey);
  });

  it('dispatcher drains warn handler: payload validated, audit row written, processedAt set', async () => {
    await dispatchBudgetAlert(companyAId, 'WARN', prismaRaw);
    const result = await processOnce(prismaRaw, log, { companyId: companyAId });
    expect(result.processed).toBeGreaterThanOrEqual(1);
    const drained = await prismaRaw.outbox.findFirst({
      where: { companyId: companyAId, topic: 'owner.ai_budget_warning' },
    });
    expect(drained?.processedAt).not.toBeNull();
    const audit = await prismaRaw.auditEvent.findFirst({
      where: { companyId: companyAId, kind: 'OWNER_BUDGET_ALERT_DISPATCHED' },
    });
    expect(audit).not.toBeNull();
    const auditPayload = audit?.payload as { topic?: string; alertKind?: string };
    expect(auditPayload?.topic).toBe('owner.ai_budget_warning');
    expect(auditPayload?.alertKind).toBe('WARN');
  });

  it('dispatcher drains cap handler: same shape as warn but kind=CAP', async () => {
    await dispatchBudgetAlert(companyAId, 'CAP', prismaRaw);
    const result = await processOnce(prismaRaw, log, { companyId: companyAId });
    expect(result.processed).toBeGreaterThanOrEqual(1);
    const audit = await prismaRaw.auditEvent.findFirst({
      where: { companyId: companyAId, kind: 'OWNER_BUDGET_ALERT_DISPATCHED' },
    });
    const auditPayload = audit?.payload as { alertKind?: string };
    expect(auditPayload?.alertKind).toBe('CAP');
  });

  it('handler rejects malformed payload (missing fields) → outbox row failCount++', async () => {
    // Insert a malformed outbox row directly (skipping dispatchBudgetAlert validation).
    const bad = await prismaRaw.outbox.create({
      data: {
        companyId: companyAId,
        topic: 'owner.ai_budget_warning',
        payload: { kind: 'WARN' /* missing dateUtc + companyId + topic */ },
        idempotencyKey: `${companyAId}:budget_WARN:malformed-${Date.now()}`,
      },
    });
    const before = await prismaRaw.outbox.findUniqueOrThrow({ where: { id: bad.id } });
    expect(before.failCount).toBe(0);
    await processOnce(prismaRaw, log, { companyId: companyAId });
    const after = await prismaRaw.outbox.findUniqueOrThrow({ where: { id: bad.id } });
    expect(after.failCount).toBe(1);
    expect(after.processedAt).toBeNull();
    expect(after.lastError).toContain('missing required field');
  });
});
