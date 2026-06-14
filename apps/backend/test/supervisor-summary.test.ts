/**
 * Real-DB integration test: GET /supervisor/summary
 *
 * Exercises:
 *   1. Empty — supervisor with no effective bindings returns all-zero payload.
 *   2. Happy path — supervisor with portfolio, seeded AuditEvents, flagged
 *      visit, leave request, and tomorrow assignment; all metrics non-zero.
 *
 * Runs against real Railway Postgres sandbox (AXHY_DB_URL env). Each
 * scenario uses a distinct supervisor so there's no cross-contamination.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 * @derives(panel-2026-05-17) — Summary slice
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { SummaryResponse } from '@axhy/shared-schema';

import { deleteCompanyDeep } from './_helpers/delete-company-deep.js';

process.env.AXHY_OTP_BYPASS = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `sup-summary-${Date.now()}-`;
const phone = (offset: number) => `+9199${String(Date.now() + offset).slice(-8)}`;

let app: FastifyInstance;
let companyId: string;

// Scenario 1 — empty (no bindings)
let emptySupToken: string;

// Scenario 2 — happy path
let happySupToken: string;
let happySupId: string;
let happySiteId: string;
let happyWorkerId: string;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  const { issueAccessToken } = await import('../src/lib/jwt.js');
  app = await buildServer();
  await app.ready();

  const company = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: phone(0),
      ownerName: 'Owner',
    },
  });
  companyId = company.id;

  const issue = (userId: string) =>
    issueAccessToken({
      userId,
      companyId,
      role: 'SUPERVISOR',
      availableRoles: ['SUPERVISOR'],
      locale: 'en',
    });

  // ── Scenario 1: empty supervisor ──────────────────────────────────────
  const emptySup = await prismaRaw.user.create({
    data: { phone: phone(1), name: 'Empty Sup', locale: 'en' },
  });
  await prismaRaw.membership.create({
    data: { companyId, userId: emptySup.id, role: 'SUPERVISOR' },
  });
  emptySupToken = await issue(emptySup.id);

  // ── Scenario 2: happy path ─────────────────────────────────────────────
  const happySup = await prismaRaw.user.create({
    data: { phone: phone(2), name: 'Happy Sup', locale: 'en' },
  });
  happySupId = happySup.id;
  await prismaRaw.membership.create({
    data: { companyId, userId: happySup.id, role: 'SUPERVISOR' },
  });
  happySupToken = await issue(happySup.id);

  const site = await prismaRaw.site.create({
    data: { companyId, name: TEST_PREFIX + 'Site', state: 'ACTIVE' },
  });
  happySiteId = site.id;

  await prismaRaw.siteSupervisorBinding.create({
    data: {
      companyId,
      siteId: site.id,
      userId: happySup.id,
      effectiveFrom: new Date('2026-01-01'),
      reason: 'test seed — happy path',
      createdBy: happySup.id,
    },
  });

  // Worker + assignment that covers today (all 7 days for simplicity).
  const worker = await prismaRaw.worker.create({
    data: {
      companyId,
      name: 'Test Worker',
      phone: phone(3),
      state: 'ACTIVE',
    },
  });
  happyWorkerId = worker.id;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  await prismaRaw.assignment.create({
    data: {
      companyId,
      workerId: worker.id,
      siteId: site.id,
      shiftStart: '09:00',
      shiftEnd: '17:00',
      dayMask: 'MTWTFSS',
      validFrom: today,
      validUntil: null,
      state: 'ACTIVE',
    },
  });

  // Two AuditEvent rows authored by happySup today — changesToday = 2.
  const nowTs = new Date();
  await prismaRaw.auditEvent.createMany({
    data: [
      {
        companyId,
        kind: 'LEAVE_APPROVED',
        actorId: happySup.id,
        targetId: worker.id,
        payload: { workerName: 'Test Worker' },
        createdAt: nowTs,
      },
      {
        companyId,
        kind: 'WORKER_MARKED_ABSENT',
        actorId: happySup.id,
        targetId: worker.id,
        payload: { workerName: 'Test Worker', date: today.toISOString().slice(0, 10) },
        createdAt: new Date(nowTs.getTime() + 1000),
      },
    ],
  });

  // Flagged visit today — flagged = 1.
  await prismaRaw.visit.create({
    data: {
      companyId,
      workerId: worker.id,
      siteId: site.id,
      scheduledFor: nowTs,
      state: 'FLAGGED',
      flagged: true,
      photosBefore: 2,
      photosAfter: 2,
    },
  });

  // Leave request in REQUESTED state for the worker — leavePending = 1.
  await prismaRaw.leaveRequest.create({
    data: {
      companyId,
      workerId: worker.id,
      fromDate: new Date(today.getTime() + 86400_000),
      toDate: new Date(today.getTime() + 86400_000),
      reason: 'Family function',
      state: 'REQUESTED',
    },
  });
});

afterAll(async () => {
  // Cascade-delete via company row (all child rows follow via onDelete:Cascade).
  await deleteCompanyDeep(prismaRaw, { slugPrefix: TEST_PREFIX });
  await prismaRaw.$disconnect();
  await app.close();
});

describe('GET /supervisor/summary', () => {
  it('empty — no bindings returns all-zero payload with correct schema', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/supervisor/summary',
      headers: { authorization: `Bearer ${emptySupToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    // Validate against the canonical Zod schema.
    const parsed = SummaryResponse.safeParse(body);
    expect(parsed.success, JSON.stringify((parsed as { error?: unknown }).error)).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.changesToday).toBe(0);
    expect(parsed.data.flagged).toBe(0);
    expect(parsed.data.leavePending).toBe(0);
    expect(parsed.data.tomorrowRoster).toBe(0);
    expect(parsed.data.timeline).toHaveLength(0);
    expect(typeof parsed.data.weekday).toBe('string');
    expect(parsed.data.weekday.length).toBeGreaterThan(0);
  });

  it('happy path — seeded data surfaces correct metric counts', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/supervisor/summary',
      headers: { authorization: `Bearer ${happySupToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    const parsed = SummaryResponse.safeParse(body);
    expect(parsed.success, JSON.stringify((parsed as { error?: unknown }).error)).toBe(true);
    if (!parsed.success) return;

    // 2 AuditEvents by happySup today.
    expect(parsed.data.changesToday).toBe(2);
    // 1 flagged visit in portfolio today.
    expect(parsed.data.flagged).toBe(1);
    // 1 leave request in REQUESTED state for portfolio worker.
    expect(parsed.data.leavePending).toBe(1);
    // 1 worker scheduled tomorrow (dayMask covers all 7 days).
    expect(parsed.data.tomorrowRoster).toBe(1);
    // Timeline should have 2 entries (both AuditEvents authored today).
    expect(parsed.data.timeline).toHaveLength(2);
    // Newest first — second event (WORKER_MARKED_ABSENT) should be index 0.
    expect(parsed.data.timeline[0].kind).toBe('WORKER_MARKED_ABSENT');
    expect(parsed.data.timeline[1].kind).toBe('LEAVE_APPROVED');
    // Each timeline entry has a non-empty summary line.
    for (const entry of parsed.data.timeline) {
      expect(entry.summary.length).toBeGreaterThan(0);
      expect(entry.when).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });
});
