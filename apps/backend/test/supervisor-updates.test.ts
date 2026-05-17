/**
 * Real-DB integration test: GET /supervisor/updates + POST /supervisor/updates/:id/acknowledge
 *
 * Exercises:
 *   1. Empty — no HRUpdate rows → both arrays empty, counts all zero.
 *   2. Happy — 2 HRUpdate rows requiring ack, caller has acked none → both in needsAck.
 *   3. Ack flow — seed 1 HRUpdate, POST acknowledge with 5-word text → 200,
 *      subsequent GET shows row in recentAcked with acknowledged=true.
 *
 * Runs against real Railway Postgres sandbox. Each scenario uses distinct
 * companies / users so cases don't interfere.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { HRUpdatesResponse } from '@axhy/shared-schema';

process.env.AXHY_OTP_BYPASS = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `sup-updates-${Date.now()}-`;

const phone = (suffix: number) => `+9188${String(Date.now() + suffix).slice(-8)}`;

let app: FastifyInstance;

// --- Scenario 1: empty tenant --------------------------------------------------
let emptyCompanyId: string;
let emptySupToken: string;
let emptySupId: string;

// --- Scenario 2: happy (2 updates, 0 acked) ------------------------------------
let happyCompanyId: string;
let happySupToken: string;
let happySupId: string;
let happyUpdate1Id: string;
let happyUpdate2Id: string;

// --- Scenario 3: ack flow (1 update, ack then re-GET) --------------------------
let ackCompanyId: string;
let ackSupToken: string;
let ackSupId: string;
let ackUpdateId: string;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  const { issueAccessToken } = await import('../src/lib/jwt.js');
  app = await buildServer();
  await app.ready();

  const issue = async (userId: string, companyId: string) =>
    issueAccessToken({
      userId,
      companyId,
      role: 'SUPERVISOR',
      availableRoles: ['SUPERVISOR'],
      locale: 'en',
    });

  // ─── Scenario 1: empty ───────────────────────────────────────────────────
  const emptyCompany = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'empty-co',
      slug: TEST_PREFIX + 'empty-co',
      ownerPhone: phone(0),
      ownerName: 'Owner Empty',
    },
  });
  emptyCompanyId = emptyCompany.id;

  const emptySup = await prismaRaw.user.create({
    data: { phone: phone(1), name: 'Sup Empty', locale: 'en' },
  });
  emptySupId = emptySup.id;
  await prismaRaw.membership.create({
    data: { companyId: emptyCompanyId, userId: emptySup.id, role: 'SUPERVISOR' },
  });
  emptySupToken = await issue(emptySup.id, emptyCompanyId);

  // ─── Scenario 2: happy (2 updates, 0 acked) ──────────────────────────────
  const happyCompany = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'happy-co',
      slug: TEST_PREFIX + 'happy-co',
      ownerPhone: phone(10),
      ownerName: 'Owner Happy',
    },
  });
  happyCompanyId = happyCompany.id;

  const happySup = await prismaRaw.user.create({
    data: { phone: phone(11), name: 'Sup Happy', locale: 'en' },
  });
  happySupId = happySup.id;
  await prismaRaw.membership.create({
    data: { companyId: happyCompanyId, userId: happySup.id, role: 'SUPERVISOR' },
  });
  happySupToken = await issue(happySup.id, happyCompanyId);

  // Seed an HR user as the author (just a UUID — HRUpdate.hrId is not a FK).
  const hrUserId = happySupId; // self-referential for test simplicity

  const u1 = await prismaRaw.hRUpdate.create({
    data: {
      companyId: happyCompanyId,
      hrId: hrUserId,
      kind: 'POLICY_CHANGE',
      content: 'Supervisors must log site entry time from Monday onwards.',
      acknowledgmentRequired: true,
    },
  });
  happyUpdate1Id = u1.id;

  const u2 = await prismaRaw.hRUpdate.create({
    data: {
      companyId: happyCompanyId,
      hrId: hrUserId,
      kind: 'URGENT_NOTICE',
      content: 'All workers must wear PPE at client sites effective immediately.',
      acknowledgmentRequired: true,
    },
  });
  happyUpdate2Id = u2.id;

  // ─── Scenario 3: ack flow ─────────────────────────────────────────────────
  const ackCompany = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'ack-co',
      slug: TEST_PREFIX + 'ack-co',
      ownerPhone: phone(20),
      ownerName: 'Owner Ack',
    },
  });
  ackCompanyId = ackCompany.id;

  const ackSup = await prismaRaw.user.create({
    data: { phone: phone(21), name: 'Sup Ack', locale: 'en' },
  });
  ackSupId = ackSup.id;
  await prismaRaw.membership.create({
    data: { companyId: ackCompanyId, userId: ackSup.id, role: 'SUPERVISOR' },
  });
  ackSupToken = await issue(ackSup.id, ackCompanyId);

  const ackUpdate = await prismaRaw.hRUpdate.create({
    data: {
      companyId: ackCompanyId,
      hrId: ackSupId,
      kind: 'POLICY_CHANGE',
      content: 'New sign-in sheet required at each site from next week.',
      acknowledgmentRequired: true,
    },
  });
  ackUpdateId = ackUpdate.id;
});

afterAll(async () => {
  await app.close();

  // Clean up all three scenarios. Delete in FK-safe order.
  for (const cid of [emptyCompanyId, happyCompanyId, ackCompanyId]) {
    if (!cid) continue;
    await prismaRaw.auditEvent.deleteMany({ where: { companyId: cid } });
    await prismaRaw.hRUpdate.deleteMany({ where: { companyId: cid } });
    await prismaRaw.membership.deleteMany({ where: { companyId: cid } });
  }

  for (const uid of [emptySupId, happySupId, ackSupId]) {
    if (!uid) continue;
    await prismaRaw.user.deleteMany({ where: { id: uid } });
  }

  for (const cid of [emptyCompanyId, happyCompanyId, ackCompanyId]) {
    if (!cid) continue;
    await prismaRaw.company.delete({ where: { id: cid } }).catch(() => null);
  }

  await prismaRaw.$disconnect();
});

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

async function getUpdates(token: string) {
  return app.inject({
    method: 'GET',
    url: '/supervisor/updates',
    headers: { authorization: `Bearer ${token}` },
  });
}

async function postAck(id: string, text: string, token: string) {
  return app.inject({
    method: 'POST',
    url: `/supervisor/updates/${id}/acknowledge`,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Test cases
// ────────────────────────────────────────────────────────────────────────────

describe('GET /supervisor/updates', () => {
  it('1. empty tenant — both arrays empty, counts all zero', async () => {
    const res = await getUpdates(emptySupToken);
    expect(res.statusCode).toBe(200);
    const body = res.json();

    const parsed = HRUpdatesResponse.safeParse(body);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.needsAck).toHaveLength(0);
    expect(parsed.data.recentAcked).toHaveLength(0);
    expect(parsed.data.counts.needsAck).toBe(0);
    expect(parsed.data.counts.recentAcked).toBe(0);
  });

  it('2. happy: 2 unacked updates requiring ack → both appear in needsAck', async () => {
    const res = await getUpdates(happySupToken);
    expect(res.statusCode).toBe(200);
    const body = res.json();

    const parsed = HRUpdatesResponse.safeParse(body);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    // Both seeded updates appear in needsAck.
    expect(parsed.data.needsAck).toHaveLength(2);
    expect(parsed.data.recentAcked).toHaveLength(0);
    expect(parsed.data.counts.needsAck).toBe(2);
    expect(parsed.data.counts.recentAcked).toBe(0);

    // Shape check — both update IDs present.
    const ids = parsed.data.needsAck.map((u) => u.id).sort();
    expect(ids).toEqual([happyUpdate1Id, happyUpdate2Id].sort());

    // All rows are unacknowledged for this caller.
    for (const row of parsed.data.needsAck) {
      expect(row.acknowledged).toBe(false);
      expect(row.ackText).toBeNull();
      expect(row.ackedAt).toBeNull();
      expect(row.requiresAck).toBe(true);
    }
  });
});

describe('POST /supervisor/updates/:id/acknowledge + GET /supervisor/updates', () => {
  it('3. ack flow: POST with 5-word text → 200; re-GET shows row in recentAcked with acknowledged=true', async () => {
    // Step 1: confirm the update starts in needsAck.
    const before = await getUpdates(ackSupToken);
    expect(before.statusCode).toBe(200);
    const beforeBody = HRUpdatesResponse.parse(before.json());
    expect(beforeBody.needsAck.map((u) => u.id)).toContain(ackUpdateId);
    expect(beforeBody.recentAcked).toHaveLength(0);

    // Step 2: POST the acknowledgement — 5 words minimum.
    const ackText = 'I will follow this policy immediately';
    const ackRes = await postAck(ackUpdateId, ackText, ackSupToken);
    expect(ackRes.statusCode).toBe(200);
    expect(ackRes.json()).toEqual({ ok: true, acknowledged: true });

    // Step 3: re-GET — row must now be in recentAcked, NOT in needsAck.
    const after = await getUpdates(ackSupToken);
    expect(after.statusCode).toBe(200);
    const afterBody = HRUpdatesResponse.parse(after.json());

    expect(afterBody.needsAck.map((u) => u.id)).not.toContain(ackUpdateId);
    expect(afterBody.recentAcked).toHaveLength(1);
    expect(afterBody.counts.recentAcked).toBe(1);
    expect(afterBody.counts.needsAck).toBe(0);

    const ackedRow = afterBody.recentAcked[0]!;
    expect(ackedRow.id).toBe(ackUpdateId);
    expect(ackedRow.acknowledged).toBe(true);
    expect(ackedRow.ackText).toBe(ackText);
    expect(ackedRow.ackedAt).not.toBeNull();
  });
});

describe('POST /supervisor/updates/:id/acknowledge — validation', () => {
  it('rejects text with fewer than 5 words (400)', async () => {
    const res = await postAck(ackUpdateId, 'too short', ackSupToken);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('VALIDATION_FAILED');
  });

  it('returns 401 when no Bearer token provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/supervisor/updates/${ackUpdateId}/acknowledge`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'I confirm this five words here' }),
    });
    expect(res.statusCode).toBe(401);
  });
});
