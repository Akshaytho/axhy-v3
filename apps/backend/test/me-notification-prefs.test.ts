/**
 * Real-DB integration test: GET /me notificationPrefs + PATCH /me/notification-prefs.
 *
 * Proves the notification-prefs persistence slice:
 *  - a fresh membership reads as all-true (the {} column default + fallback)
 *  - PATCH persists, GET /me + the Membership row reflect it, an audit is written
 *  - a partial PATCH MERGES over current prefs (never clears other channels)
 *  - per-membership scoping: one user's PATCH never touches another tenant's
 *  - 401 without a token
 *
 * @derives(2026-06-04 notification-prefs persistence)
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

process.env.AXHY_OTP_BYPASS = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const STAMP = String(Date.now()).slice(-8);
const TEST_PREFIX = `notifprefs-${Date.now()}-`;
const P1 = `+9194${STAMP}`; // supervisor in co1
const P2 = `+9193${STAMP}`; // supervisor in co2

let app: FastifyInstance;
let co1Id: string;
let co2Id: string;
let u1Id: string;
let token1: string;
let token2: string;

interface Prefs {
  push: boolean;
  whatsapp: boolean;
  email: boolean;
}

async function mintToken(phone: string): Promise<string> {
  await app.inject({ method: 'POST', url: '/auth/otp/request', payload: { phone } });
  const verify = await app.inject({
    method: 'POST',
    url: '/auth/otp/verify',
    payload: { phone, code: '123456' },
  });
  return (verify.json() as { accessToken: string }).accessToken;
}

async function seedSupervisor(companyId: string, phone: string): Promise<string> {
  await mintToken(phone);
  const user = await prismaRaw.user.findUnique({ where: { phone } });
  if (!user) throw new Error(`test setup: user not created for ${phone}`);
  await prismaRaw.membership.create({ data: { companyId, userId: user.id, role: 'SUPERVISOR' } });
  return user.id;
}

async function getMe(token: string): Promise<{ status: number; notificationPrefs?: Prefs }> {
  const res = await app.inject({
    method: 'GET',
    url: '/me',
    headers: { authorization: `Bearer ${token}` },
  });
  const body = res.statusCode === 200 ? (res.json() as { notificationPrefs: Prefs }) : undefined;
  return { status: res.statusCode, notificationPrefs: body?.notificationPrefs };
}

async function patchPrefs(
  token: string,
  body: Partial<Prefs>,
): Promise<{ status: number; notificationPrefs?: Prefs }> {
  const res = await app.inject({
    method: 'PATCH',
    url: '/me/notification-prefs',
    headers: { authorization: `Bearer ${token}` },
    payload: body,
  });
  const j = res.statusCode === 200 ? (res.json() as { notificationPrefs: Prefs }) : undefined;
  return { status: res.statusCode, notificationPrefs: j?.notificationPrefs };
}

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  app = await buildServer();
  await app.ready();

  const co1 = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'Co1',
      slug: TEST_PREFIX + 'co1',
      ownerPhone: '+919900000051',
      ownerName: 'Owner One',
    },
  });
  co1Id = co1.id;
  const co2 = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'Co2',
      slug: TEST_PREFIX + 'co2',
      ownerPhone: '+919900000052',
      ownerName: 'Owner Two',
    },
  });
  co2Id = co2.id;

  u1Id = await seedSupervisor(co1Id, P1);
  token1 = await mintToken(P1);
  await seedSupervisor(co2Id, P2);
  token2 = await mintToken(P2);
}, 120_000);

afterAll(async () => {
  for (const companyId of [co1Id, co2Id]) {
    if (!companyId) continue;
    await prismaRaw.auditEvent.deleteMany({ where: { companyId } });
    await prismaRaw.membership.deleteMany({ where: { companyId } });
  }
  await prismaRaw.user.deleteMany({ where: { phone: { in: [P1, P2] } } });
  await prismaRaw.$executeRawUnsafe(
    `DELETE FROM axhy.otp_attempts WHERE phone IN ($1, $2)`,
    P1,
    P2,
  );
  await prismaRaw.company.deleteMany({ where: { id: { in: [co1Id, co2Id] } } });
  await prismaRaw.$disconnect();
  await app.close();
});

describe('notification prefs', { timeout: 25_000 }, () => {
  it('GET /me returns all-true for a fresh membership ({} default)', async () => {
    const me = await getMe(token1);
    expect(me.status).toBe(200);
    expect(me.notificationPrefs).toEqual({ push: true, whatsapp: true, email: true });
  });

  it('rejects an unauthenticated PATCH with 401', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/me/notification-prefs',
      payload: { push: false },
    });
    expect(res.statusCode).toBe(401);
  });

  it('PATCH persists a toggle, GET /me + the DB row reflect it, audit written', async () => {
    const patched = await patchPrefs(token1, { push: false });
    expect(patched.status).toBe(200);
    expect(patched.notificationPrefs).toEqual({ push: false, whatsapp: true, email: true });

    const me = await getMe(token1);
    expect(me.notificationPrefs).toEqual({ push: false, whatsapp: true, email: true });

    const row = await prismaRaw.membership.findFirst({
      where: { userId: u1Id, companyId: co1Id },
      select: { notificationPrefs: true },
    });
    expect(row?.notificationPrefs).toMatchObject({ push: false });

    const audit = await prismaRaw.auditEvent.findFirst({
      where: { companyId: co1Id, kind: 'MEMBERSHIP_NOTIFICATION_PREFS_UPDATED', actorId: u1Id },
    });
    expect(audit).not.toBeNull();
  });

  it('a partial PATCH MERGES over current prefs (does not clear others)', async () => {
    // push is already false from the prior test; now flip email only.
    const patched = await patchPrefs(token1, { email: false });
    expect(patched.status).toBe(200);
    expect(patched.notificationPrefs).toEqual({ push: false, whatsapp: true, email: false });
  });

  it('rejects an unknown channel with 400 (strict schema)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/me/notification-prefs',
      headers: { authorization: `Bearer ${token1}` },
      payload: { sms: true },
    });
    expect(res.statusCode).toBe(400);
  });

  it('per-membership isolation: another tenant user is unaffected', async () => {
    const me2 = await getMe(token2);
    expect(me2.status).toBe(200);
    expect(me2.notificationPrefs).toEqual({ push: true, whatsapp: true, email: true });
  });
});
