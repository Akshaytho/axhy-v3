/**
 * Real-DB integration test: SUPERVISOR role gate on supervisor-surface routes.
 *
 * Locks in the 2026-06-05 fix that backfilled requireRole('SUPERVISOR') onto six
 * routes that previously gated on requireAuth only (so any authenticated WORKER
 * token could reach them, incl. the AI proposal engine that burns company budget):
 *   - POST /chat/messages
 *   - POST /chat/apply
 *   - GET  /decisions/proposed-for-me
 *   - POST /decisions/:id/dismiss
 *   - GET  /supervisor/updates
 *   - POST /supervisor/updates/:id/acknowledge
 *
 * Proves: a WORKER token gets 403 FORBIDDEN_WRONG_ROLE on every one (the gate runs
 * in the preHandler before any handler/AI logic); a SUPERVISOR token is never 403
 * (passes the gate — bad bodies fail later at validation, which is fine). Multi-role,
 * real prod DB, isolated test company, cleaned up in afterAll.
 *
 * @derives(S639 supervisor-only role gates — backfill of missed foundation routes)
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
const TEST_PREFIX = `rolegate-${Date.now()}-`;
const SUP_PHONE = `+9192${STAMP}`;
const WRK_PHONE = `+9191${STAMP}`;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

let app: FastifyInstance;
let coId: string;
let supToken: string;
let wrkToken: string;

async function mintToken(phone: string): Promise<string> {
  await app.inject({ method: 'POST', url: '/auth/otp/request', payload: { phone } });
  const verify = await app.inject({
    method: 'POST',
    url: '/auth/otp/verify',
    payload: { phone, code: '123456' },
  });
  return (verify.json() as { accessToken: string }).accessToken;
}

async function seedMember(
  companyId: string,
  phone: string,
  role: 'SUPERVISOR' | 'WORKER',
): Promise<string> {
  await mintToken(phone);
  const user = await prismaRaw.user.findUnique({ where: { phone } });
  if (!user) throw new Error(`test setup: user not created for ${phone}`);
  await prismaRaw.membership.create({ data: { companyId, userId: user.id, role } });
  return mintToken(phone);
}

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  app = await buildServer();
  await app.ready();

  const co = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919900000071',
      ownerName: 'Owner Gate',
    },
  });
  coId = co.id;

  supToken = await seedMember(coId, SUP_PHONE, 'SUPERVISOR');
  wrkToken = await seedMember(coId, WRK_PHONE, 'WORKER');
}, 120_000);

afterAll(async () => {
  if (coId) {
    await prismaRaw.membership.deleteMany({ where: { companyId: coId } });
    await prismaRaw.company.deleteMany({ where: { id: coId } });
  }
  await prismaRaw.user.deleteMany({ where: { phone: { in: [SUP_PHONE, WRK_PHONE] } } });
  await prismaRaw.$executeRawUnsafe(
    `DELETE FROM axhy.otp_attempts WHERE phone IN ($1, $2)`,
    SUP_PHONE,
    WRK_PHONE,
  );
  await prismaRaw.$disconnect();
  await app.close();
});

// Empty/minimal bodies on POSTs so a SUPERVISOR fails fast at body validation
// (≠403) instead of invoking the AI engine — the gate runs first regardless.
const GATED: Array<{ method: 'GET' | 'POST'; url: string; body?: unknown }> = [
  { method: 'POST', url: '/chat/messages', body: {} },
  { method: 'POST', url: '/chat/apply', body: {} },
  { method: 'GET', url: '/decisions/proposed-for-me' },
  { method: 'POST', url: `/decisions/${ZERO_UUID}/dismiss`, body: {} },
  { method: 'GET', url: '/supervisor/updates' },
  { method: 'POST', url: `/supervisor/updates/${ZERO_UUID}/acknowledge`, body: {} },
  // 2026-06-05: the rest of the supervisor surface (negative testing found a
  // worker token reached these with requireAuth only).
  { method: 'GET', url: '/supervisor/today' },
  { method: 'GET', url: '/supervisor/summary' },
  { method: 'GET', url: '/supervisor/context' },
  { method: 'GET', url: '/supervisor/living-doc' },
  { method: 'GET', url: '/supervisor/activity' },
  { method: 'GET', url: '/supervisor/replacement-invites' },
  { method: 'POST', url: '/supervisor/replacement-invites', body: {} },
  { method: 'POST', url: `/supervisor/replacement-invites/${ZERO_UUID}/cancel`, body: {} },
];

describe('SUPERVISOR role gate on supervisor-surface routes', { timeout: 40_000 }, () => {
  for (const r of GATED) {
    it(`WORKER token is 403 FORBIDDEN_WRONG_ROLE on ${r.method} ${r.url}`, async () => {
      const res = await app.inject({
        method: r.method,
        url: r.url,
        headers: { authorization: `Bearer ${wrkToken}` },
        ...(r.body !== undefined ? { payload: r.body } : {}),
      });
      expect(res.statusCode).toBe(403);
      expect((res.json() as { error?: string }).error).toBe('FORBIDDEN_WRONG_ROLE');
    });

    it(`SUPERVISOR token is NOT 403 on ${r.method} ${r.url}`, async () => {
      const res = await app.inject({
        method: r.method,
        url: r.url,
        headers: { authorization: `Bearer ${supToken}` },
        ...(r.body !== undefined ? { payload: r.body } : {}),
      });
      expect(res.statusCode).not.toBe(403);
    });
  }

  it('unauthenticated is 401 on a gated route', async () => {
    const res = await app.inject({ method: 'GET', url: '/supervisor/updates' });
    expect(res.statusCode).toBe(401);
  });
});
