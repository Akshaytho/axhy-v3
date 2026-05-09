/**
 * Real-DB integration test: outbox dispatcher.
 *
 * Exercises:
 *   1. Known-topic row → handler runs → processedAt set
 *   2. Unknown-topic row → failCount increments + lastError set
 *   3. Unknown-topic row past MAX_FAIL → not picked up again (stays quarantined)
 *   4. Future nextRetryAt → row skipped this batch
 *   5. Already-processed row (processedAt set) → row skipped
 *   6. Backoff math: failCount=1→+5s, failCount=3→+20s, etc.
 *
 * Uses real Railway Postgres + the same singleton `prisma` the dispatcher
 * uses in production.
 *
 * @derives(ADR-0009)
 * @derives(panel-2026-05-08) — phase B.6
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import pino from 'pino';
import type { FastifyBaseLogger } from 'fastify';

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const silentLog = pino({ level: 'silent' }) as unknown as FastifyBaseLogger;

const TEST_PREFIX = `dispatcher-${Date.now()}-`;
let companyId: string;

beforeAll(async () => {
  const c = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919900000099',
      ownerName: 'Dispatcher Test Owner',
    },
  });
  companyId = c.id;
});

afterAll(async () => {
  await prismaRaw.outbox.deleteMany({ where: { companyId } });
  await prismaRaw.company.deleteMany({ where: { id: companyId } });
  await prismaRaw.$disconnect();
});

beforeEach(async () => {
  // Drain the table for THIS tenant only between tests so each test sees
  // a clean slate. Other tenants' rows (other tests) are untouched.
  await prismaRaw.outbox.deleteMany({ where: { companyId } });
});

describe('outbox dispatcher — processOnce()', () => {
  it('processes a known-topic row and sets processedAt', async () => {
    const { processOnce } = await import('../src/dispatcher/index.js');
    const row = await prismaRaw.outbox.create({
      data: {
        companyId,
        topic: 'hr.worker_absent',
        payload: { workerId: 'fake', supervisorId: 'fake', date: '2026-05-09' },
      },
    });

    const result = await processOnce(prismaRaw, silentLog, { companyId });

    expect(result.processed).toBeGreaterThanOrEqual(1);
    const after = await prismaRaw.outbox.findUnique({ where: { id: row.id } });
    expect(after!.processedAt).not.toBeNull();
    expect(after!.failCount).toBe(0);
    expect(after!.lastError).toBeNull();
  });

  it('marks unknown-topic row as failed with lastError', async () => {
    const { processOnce } = await import('../src/dispatcher/index.js');
    const row = await prismaRaw.outbox.create({
      data: {
        companyId,
        topic: 'no.such.topic',
        payload: { foo: 'bar' },
      },
    });

    const result = await processOnce(prismaRaw, silentLog, { companyId });

    expect(result.failed + result.quarantined).toBeGreaterThanOrEqual(1);
    const after = await prismaRaw.outbox.findUnique({ where: { id: row.id } });
    expect(after!.processedAt).toBeNull();
    expect(after!.failCount).toBe(1);
    expect(after!.lastError).toContain('UNKNOWN_TOPIC');
    expect(after!.nextRetryAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('skips already-quarantined rows (failCount >= MAX_FAIL)', async () => {
    const { processOnce, MAX_FAIL } = await import('../src/dispatcher/index.js');
    const row = await prismaRaw.outbox.create({
      data: {
        companyId,
        topic: 'no.such.topic',
        payload: {},
        failCount: MAX_FAIL,
        lastError: 'previously quarantined',
      },
    });

    const result = await processOnce(prismaRaw, silentLog, { companyId });

    // Quarantined row should NOT have been touched.
    expect(result.processed).toBe(0);
    const after = await prismaRaw.outbox.findUnique({ where: { id: row.id } });
    expect(after!.failCount).toBe(MAX_FAIL); // unchanged
    expect(after!.processedAt).toBeNull();
  });

  it('skips rows whose nextRetryAt is in the future', async () => {
    const { processOnce } = await import('../src/dispatcher/index.js');
    const future = new Date(Date.now() + 60_000); // 1 minute out
    const row = await prismaRaw.outbox.create({
      data: {
        companyId,
        topic: 'hr.worker_absent',
        payload: {},
        nextRetryAt: future,
      },
    });

    const result = await processOnce(prismaRaw, silentLog, { companyId });

    expect(result.processed).toBe(0);
    const after = await prismaRaw.outbox.findUnique({ where: { id: row.id } });
    expect(after!.processedAt).toBeNull();
  });

  it('skips already-processed rows', async () => {
    const { processOnce } = await import('../src/dispatcher/index.js');
    const row = await prismaRaw.outbox.create({
      data: {
        companyId,
        topic: 'hr.worker_absent',
        payload: {},
        processedAt: new Date(),
      },
    });

    const result = await processOnce(prismaRaw, silentLog, { companyId });

    expect(result.processed).toBe(0);
    const after = await prismaRaw.outbox.findUnique({ where: { id: row.id } });
    // processedAt should remain set, not be re-touched
    expect(after!.processedAt).not.toBeNull();
  });

  it('computeNextRetryAt: exponential backoff with cap', async () => {
    const { computeNextRetryAt } = await import('../src/dispatcher/index.js');
    const now = new Date(2026, 0, 1);
    const f1 = computeNextRetryAt(1, now);
    const f3 = computeNextRetryAt(3, now);
    const f10 = computeNextRetryAt(10, now); // capped

    expect(Math.round((f1.getTime() - now.getTime()) / 1000)).toBe(5);
    expect(Math.round((f3.getTime() - now.getTime()) / 1000)).toBe(20);
    expect(Math.round((f10.getTime() - now.getTime()) / 1000)).toBe(300); // 5min cap
  });
});
