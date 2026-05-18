/**
 * Real-DB regression test for the STALE section (QA-round3 R3-05).
 *
 * Founder lock: feedback_stale_decisions_section_after_48h.md (2026-05-18).
 * A pending decision whose `proposedAt` is older than 48 hours must be
 * moved out of NEEDS_YOU_NOW / ROUTINE into a separate STALE section so
 * old items don't drown out fresh ones with the same red-dot urgency.
 *
 * This test proves the bug existed (per feedback_tests_must_prove_the_bug_existed.md):
 * - Before the fix, a 49h-old supervisor decision sat in NEEDS_YOU_NOW
 *   alongside a 1h-old one.
 * - After the fix, the 49h-old one lands in STALE; the 1h-old one stays
 *   in its tier-derived section (NEEDS_YOU_NOW or ROUTINE).
 *
 * Run via:
 *   cd apps/backend && railway run --service Postgres -- bash -c \
 *     'DATABASE_URL="$DATABASE_PUBLIC_URL" pnpm exec vitest run test/supervisor-decisions-stale-section.test.ts'
 *
 * @derives(feedback_stale_decisions_section_after_48h.md, 2026-05-18)
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */

import { randomUUID } from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

process.env.AXHY_OTP_BYPASS = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });
const TEST_PREFIX = `stale-${Date.now()}-`;

let app: FastifyInstance;
let companyId: string;
let supId: string;
let supToken: string;
let freshDecisionId: string;
let staleDecisionId: string;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  const { issueAccessToken } = await import('../src/lib/jwt.js');
  app = await buildServer();
  await app.ready();

  const company = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919999' + String(Date.now()).slice(-7),
      ownerName: 'Owner Stale',
    },
  });
  companyId = company.id;

  const sup = await prismaRaw.user.create({
    data: {
      phone: '+9181' + String(Date.now()).slice(-8),
      name: 'Sup Stale',
      locale: 'en',
      companyId,
    },
  });
  supId = sup.id;
  await prismaRaw.membership.create({
    data: { companyId, userId: supId, role: 'SUPERVISOR', status: 'ACTIVE' },
  });
  supToken = await issueAccessToken({
    userId: supId,
    companyId,
    role: 'SUPERVISOR',
    availableRoles: ['SUPERVISOR'],
    locale: 'en',
  });

  // Fresh decision — 1 hour old. Should land in section by its tier
  // (PERSONNEL → NEEDS_YOU_NOW). Never STALE.
  freshDecisionId = randomUUID();
  await prismaRaw.supervisorDecision.create({
    data: {
      id: freshDecisionId,
      companyId,
      supervisorId: supId,
      kind: 'MARK_ABSENT',
      tier: 'PERSONNEL',
      targetId: null,
      payload: { workerName: 'Fresh Worker', siteName: TEST_PREFIX + 'site' },
      createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
    },
  });

  // Stale decision — 49 hours old. Should be demoted to STALE regardless
  // of its tier (PERSONNEL would otherwise put it in NEEDS_YOU_NOW).
  staleDecisionId = randomUUID();
  await prismaRaw.supervisorDecision.create({
    data: {
      id: staleDecisionId,
      companyId,
      supervisorId: supId,
      kind: 'MARK_ABSENT',
      tier: 'PERSONNEL',
      targetId: null,
      payload: { workerName: 'Stale Worker', siteName: TEST_PREFIX + 'site' },
      createdAt: new Date(Date.now() - 49 * 60 * 60 * 1000),
    },
  });
});

afterAll(async () => {
  await app.close();
  await prismaRaw.$disconnect();
});

describe('GET /supervisor/decisions — STALE section (48h cutoff)', () => {
  it('routes a 49h-old decision to STALE and keeps a 1h-old decision in its tier-derived section', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/supervisor/decisions',
      headers: { authorization: `Bearer ${supToken}` },
    });

    expect(r.statusCode).toBe(200);
    const body = r.json<{
      rows: Array<{ id: string; section: string; tier: string }>;
      counts: {
        needsYouNow: number;
        routine: number;
        stale: number;
        failedReview: number;
        total: number;
      };
    }>();

    const fresh = body.rows.find((row) => row.id === freshDecisionId);
    const stale = body.rows.find((row) => row.id === staleDecisionId);

    expect(fresh).toBeDefined();
    expect(stale).toBeDefined();

    // Fresh — PERSONNEL tier → NEEDS_YOU_NOW (not STALE).
    expect(fresh!.section).toBe('NEEDS_YOU_NOW');

    // Stale — 49h old, demoted to STALE regardless of PERSONNEL tier.
    expect(stale!.section).toBe('STALE');

    // Counts reflect the bucket split.
    expect(body.counts.stale).toBeGreaterThanOrEqual(1);
    expect(body.counts.needsYouNow).toBeGreaterThanOrEqual(1);
  });

  it('orders STALE rows after NEEDS_YOU_NOW + ROUTINE in the response', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/supervisor/decisions',
      headers: { authorization: `Bearer ${supToken}` },
    });
    const body = r.json<{ rows: Array<{ id: string; section: string }> }>();

    const needsIdx = body.rows.findIndex((row) => row.section === 'NEEDS_YOU_NOW');
    const staleIdx = body.rows.findIndex((row) => row.section === 'STALE');

    expect(needsIdx).toBeGreaterThanOrEqual(0);
    expect(staleIdx).toBeGreaterThanOrEqual(0);
    expect(needsIdx).toBeLessThan(staleIdx);
  });
});
