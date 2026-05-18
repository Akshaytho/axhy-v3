/**
 * Water-flow pagination test for /supervisor/decisions.
 *
 * Founder lock 2026-05-18 PM: "did you check pagination when loading because
 * we can't fetch so much data at once when app grows."
 *
 * Production-grade requirement (P8 under-pressure): a supervisor with 80+
 * pending decisions must:
 *   1. Get page 1 with DEFAULT_LIMIT=50 rows + a cursor.
 *   2. Use the cursor to fetch page 2 — receives the remaining rows + cursor=null.
 *   3. No row appears on both pages (no duplicates).
 *   4. No row is missed (page1 ∪ page2 = full set).
 *   5. Round-trip works for ROUTINE rows (priority 1).
 *
 * Real DB (Railway sandbox). Seeds 80 SupervisorDecision rows with
 * recent createdAt so none are auto-dismissed by the 48h sweep.
 *
 * @derives(feedback_walk_every_screen_as_real_user_before_founder.md)
 * @derives(feedback_production_grade_workflow_rules.md — P8 under-pressure)
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
const TEST_PREFIX = `pagination-${Date.now()}-`;
const TOTAL_ROWS = 80;

let app: FastifyInstance;
let companyId: string;
let supId: string;
let supToken: string;
let seededIds: string[];

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  const { issueAccessToken } = await import('../src/lib/jwt.js');
  app = await buildServer();
  await app.ready();

  const co = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919900000401',
      ownerName: 'Owner',
    },
  });
  companyId = co.id;

  const sup = await prismaRaw.user.create({
    data: {
      phone: '+9181' + String(Date.now()).slice(-8),
      name: 'Sup Pagination',
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

  // Seed 80 PROPOSED rows — recent createdAt so the 48h sweep doesn't
  // touch them. Stagger createdAt by 1 minute each so the sort order is
  // deterministic.
  seededIds = [];
  const now = Date.now();
  const batch: Array<{
    id: string;
    companyId: string;
    supervisorId: string;
    kind: string;
    tier: string;
    targetId: string | null;
    payload: Record<string, unknown>;
    createdAt: Date;
  }> = [];
  for (let i = 0; i < TOTAL_ROWS; i++) {
    const id = randomUUID();
    seededIds.push(id);
    batch.push({
      id,
      companyId,
      supervisorId: supId,
      // Use OPERATIONAL → ROUTINE section so all rows land in the same
      // section, simplifying cursor verification (no cross-section paging).
      kind: 'MARK_ABSENT',
      tier: 'OPERATIONAL',
      targetId: null,
      payload: { workerName: `Pagination Worker ${i}`, idx: i },
      createdAt: new Date(now - (TOTAL_ROWS - i) * 60_000),
    });
  }
  await prismaRaw.supervisorDecision.createMany({ data: batch });
});

afterAll(async () => {
  try {
    await prismaRaw.auditEvent.deleteMany({ where: { companyId } });
    await prismaRaw.supervisorDecision.deleteMany({ where: { companyId } });
    await prismaRaw.membership.deleteMany({ where: { companyId } });
    await prismaRaw.company.delete({ where: { id: companyId } });
  } finally {
    await prismaRaw.$disconnect();
    await app.close();
  }
});

describe('GET /supervisor/decisions — cursor pagination at 80-row scale', () => {
  it('page 1 returns 50 rows + cursor; page 2 returns the rest; no overlap, no missed rows', async () => {
    // ── Page 1 ──
    const r1 = await app.inject({
      method: 'GET',
      url: '/supervisor/decisions',
      headers: { authorization: `Bearer ${supToken}` },
    });
    expect(r1.statusCode).toBe(200);
    const body1 = r1.json<{
      rows: Array<{ id: string; section: string }>;
      counts: { total: number };
      pageInfo: {
        cursor: string | null;
        hasMore: boolean;
        limit: number;
        totalAcrossPages: number;
      };
    }>();

    expect(body1.rows.length).toBe(50);
    expect(body1.pageInfo.limit).toBe(50);
    expect(body1.pageInfo.hasMore).toBe(true);
    expect(body1.pageInfo.cursor).not.toBeNull();
    expect(body1.pageInfo.totalAcrossPages).toBeGreaterThanOrEqual(TOTAL_ROWS);

    // All page-1 rows should be in the ROUTINE section (OPERATIONAL tier).
    for (const row of body1.rows) {
      expect(row.section).toBe('ROUTINE');
    }

    // ── Page 2 ──
    const cursor1 = body1.pageInfo.cursor!;
    const r2 = await app.inject({
      method: 'GET',
      url: `/supervisor/decisions?cursor=${encodeURIComponent(cursor1)}`,
      headers: { authorization: `Bearer ${supToken}` },
    });
    expect(r2.statusCode).toBe(200);
    const body2 = r2.json<{
      rows: Array<{ id: string; section: string }>;
      pageInfo: { cursor: string | null; hasMore: boolean };
    }>();

    expect(body2.rows.length).toBe(TOTAL_ROWS - 50);
    expect(body2.pageInfo.hasMore).toBe(false);
    expect(body2.pageInfo.cursor).toBeNull();

    // ── Integrity ──
    const idsPage1 = new Set(body1.rows.map((r) => r.id));
    const idsPage2 = new Set(body2.rows.map((r) => r.id));

    // No row on both pages.
    const overlap = [...idsPage1].filter((id) => idsPage2.has(id));
    expect(
      overlap,
      `pages overlap on ${overlap.length} ids: ${overlap.slice(0, 3).join(', ')}`,
    ).toHaveLength(0);

    // All 80 seeded rows are in page1 ∪ page2.
    const union = new Set([...idsPage1, ...idsPage2]);
    const missing = seededIds.filter((id) => !union.has(id));
    expect(missing, `${missing.length} seeded rows missed across both pages`).toHaveLength(0);

    // Cursor decodes round-trip — already proven by P0-1 unit test, but
    // verify here that a stale cursor token (page-1 cursor used twice)
    // produces the same page-2 result (idempotent reads).
    const r2bis = await app.inject({
      method: 'GET',
      url: `/supervisor/decisions?cursor=${encodeURIComponent(cursor1)}`,
      headers: { authorization: `Bearer ${supToken}` },
    });
    expect(r2bis.statusCode).toBe(200);
    const body2bis = r2bis.json<{ rows: Array<{ id: string }> }>();
    const ids2 = body2.rows.map((r) => r.id).sort();
    const ids2bis = body2bis.rows.map((r) => r.id).sort();
    expect(ids2bis).toEqual(ids2);
  });
});
