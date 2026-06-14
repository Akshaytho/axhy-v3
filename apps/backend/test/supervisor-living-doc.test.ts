/**
 * Real-DB integration test: GET /supervisor/living-doc.
 *
 * Proves the supervisor Memory screen's read route:
 *  - returns the caller's own LivingDoc sections (ACTIVE rules)
 *  - FILTERS OUT WORKER_OWN-visibility rules (locked: "visible to nobody
 *    directly") while keeping COMPANY + SUPERVISOR_OWN
 *  - JWT-implicit + tenant-scoped: a supervisor never sees another tenant's
 *    doc; a fresh supervisor gets empty sections
 *  - 401 without a token
 *
 * @derives(docs/locked/livingdoc-extraction-rules.md)
 * @derives(master-plan §G)
 */

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

import { deleteCompanyDeep } from './_helpers/delete-company-deep.js';

process.env.AXHY_OTP_BYPASS = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const STAMP = String(Date.now()).slice(-8);
const TEST_PREFIX = `livingdoc-${Date.now()}-`;
const S1_PHONE = `+9194${STAMP}`; // supervisor in co1 (seeded rules)
const S2_PHONE = `+9193${STAMP}`; // supervisor in co2 (fresh)

let app: FastifyInstance;
let co1Id: string;
let co2Id: string;
let s1UserId: string;
let s1Token: string;
let s2Token: string;

function mkRule(visibility: 'COMPANY' | 'SUPERVISOR_OWN' | 'WORKER_OWN', text: string) {
  return {
    id: randomUUID(),
    ruleText: text,
    description: `${text} — why`,
    visibility,
    scope: {},
    createdAt: new Date('2026-06-01T00:00:00.000Z').toISOString(),
    createdBy: 'supervisor' as const,
    state: 'ACTIVE' as const,
    source: {},
  };
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

async function seedSupervisor(
  companyId: string,
  phone: string,
): Promise<{ userId: string; token: string }> {
  await mintToken(phone);
  const user = await prismaRaw.user.findUnique({ where: { phone } });
  if (!user) throw new Error(`test setup: user not created for ${phone}`);
  await prismaRaw.membership.create({ data: { companyId, userId: user.id, role: 'SUPERVISOR' } });
  const token = await mintToken(phone);
  return { userId: user.id, token };
}

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  app = await buildServer();
  await app.ready();

  const co1 = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'Co1',
      slug: TEST_PREFIX + 'co1',
      ownerPhone: '+919900000061',
      ownerName: 'Owner One',
    },
  });
  co1Id = co1.id;
  const co2 = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'Co2',
      slug: TEST_PREFIX + 'co2',
      ownerPhone: '+919900000062',
      ownerName: 'Owner Two',
    },
  });
  co2Id = co2.id;

  const s1 = await seedSupervisor(co1Id, S1_PHONE);
  s1UserId = s1.userId;
  s1Token = s1.token;
  const s2 = await seedSupervisor(co2Id, S2_PHONE);
  s2Token = s2.token;

  // Seed S1's LivingDoc with three site rules of differing visibility.
  await prismaRaw.livingDoc.create({
    data: {
      companyId: co1Id,
      supervisorId: s1UserId,
      siteRules: [
        mkRule('COMPANY', 'Lobby done before 8am at BigCorp'),
        mkRule('SUPERVISOR_OWN', 'I prefer Ravi on the 3rd floor'),
        mkRule('WORKER_OWN', 'Suresh has a medical note — light duties'),
      ],
    },
  });
}, 120_000);

afterAll(async () => {
  for (const companyId of [co1Id, co2Id]) {
    if (!companyId) continue;
    await prismaRaw.livingDoc.deleteMany({ where: { companyId } });
    await prismaRaw.membership.deleteMany({ where: { companyId } });
  }
  await prismaRaw.user.deleteMany({ where: { phone: { in: [S1_PHONE, S2_PHONE] } } });
  await prismaRaw.$executeRawUnsafe(
    `DELETE FROM axhy.otp_attempts WHERE phone IN ($1, $2)`,
    S1_PHONE,
    S2_PHONE,
  );
  await deleteCompanyDeep(prismaRaw, { ids: [co1Id, co2Id] });
  await prismaRaw.$disconnect();
  await app.close();
});

interface LivingDocBody {
  id: string;
  companyId: string;
  supervisorId: string;
  version: number;
  siteRules: Array<{ ruleText: string; visibility: string }>;
  workerNotes: unknown[];
  clientPreferences: unknown[];
  recurringTasks: unknown[];
  freeNotes: unknown[];
}

describe('GET /supervisor/living-doc', { timeout: 25_000 }, () => {
  it('rejects an unauthenticated request with 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/supervisor/living-doc' });
    expect(res.statusCode).toBe(401);
  });

  it('returns the supervisor own sections and FILTERS OUT WORKER_OWN rules', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/supervisor/living-doc',
      headers: { authorization: `Bearer ${s1Token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as LivingDocBody;
    expect(body.supervisorId).toBe(s1UserId);
    expect(body.companyId).toBe(co1Id);

    const visibilities = body.siteRules.map((r) => r.visibility).sort();
    expect(visibilities).toEqual(['COMPANY', 'SUPERVISOR_OWN']); // WORKER_OWN dropped
    const texts = body.siteRules.map((r) => r.ruleText);
    expect(texts).toContain('Lobby done before 8am at BigCorp');
    expect(texts).toContain('I prefer Ravi on the 3rd floor');
    expect(texts).not.toContain('Suresh has a medical note — light duties'); // WORKER_OWN hidden
    expect(body.workerNotes).toEqual([]);
  });

  it('returns empty sections for a fresh supervisor in a different tenant (isolation)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/supervisor/living-doc',
      headers: { authorization: `Bearer ${s2Token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as LivingDocBody;
    expect(body.companyId).toBe(co2Id);
    // Never sees co1's seeded rules.
    expect(body.siteRules).toEqual([]);
    expect(body.workerNotes).toEqual([]);
    expect(body.clientPreferences).toEqual([]);
    expect(body.recurringTasks).toEqual([]);
    expect(body.freeNotes).toEqual([]);
  });
});
