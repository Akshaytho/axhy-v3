/**
 * #26 — system AuditEvent dedup. Real-DB lab test.
 *
 * Proves the AuditEvent (companyId, dedupKey) unique constraint + createMany skipDuplicates
 * make redelivered system audit writes idempotent, while human-action audits (NULL dedupKey)
 * are never deduped.
 *
 * Run on the lab:
 *   cd apps/backend && DATABASE_URL="postgresql://postgres@localhost:5433/postgres" \
 *   npx vitest run test/auditevent-dedup.test.ts
 *
 * @derives(PRODUCTION_BUG_LEDGER.md #26)
 */
import crypto from 'node:crypto';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { prisma } from '../src/lib/prisma.js';

const SYSTEM = '00000000-0000-0000-0000-000000000000';
const companyId = crypto.randomUUID();
const sfx = crypto.randomBytes(4).toString('hex');

const sysRow = (dedupKey: string | null) => ({
  companyId,
  kind: 'OWNER_BUDGET_ALERT_DISPATCHED',
  actorId: SYSTEM,
  targetId: null,
  payload: { sfx },
  dedupKey,
});

describe('#26 — AuditEvent system-write dedup', () => {
  beforeAll(async () => {
    await prisma.company.create({
      data: {
        id: companyId,
        name: `ae-${sfx}`,
        slug: `ae-${sfx}`,
        ownerPhone: `+9192${sfx.slice(0, 4)}`,
        ownerName: 'AE',
      },
    });
  });

  afterAll(async () => {
    await prisma.auditEvent.deleteMany({ where: { companyId } });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await prisma.$disconnect();
  });

  it('same dedupKey via skipDuplicates collapses to one row', async () => {
    const key = `owner_budget:${sfx}:cap`;
    await prisma.auditEvent.createMany({ data: [sysRow(key), sysRow(key)], skipDuplicates: true });
    // simulate redelivery
    await prisma.auditEvent.createMany({ data: [sysRow(key)], skipDuplicates: true });
    expect(await prisma.auditEvent.count({ where: { companyId, dedupKey: key } })).toBe(1);
  });

  it('a different dedupKey adds a distinct row', async () => {
    await prisma.auditEvent.createMany({
      data: [sysRow(`owner_budget:${sfx}:warn`)],
      skipDuplicates: true,
    });
    expect(
      await prisma.auditEvent.count({ where: { companyId, dedupKey: `owner_budget:${sfx}:warn` } }),
    ).toBe(1);
  });

  it('NULL dedupKey (human-action audits) is never deduped', async () => {
    await prisma.auditEvent.createMany({
      data: [sysRow(null), sysRow(null)],
      skipDuplicates: true,
    });
    expect(await prisma.auditEvent.count({ where: { companyId, dedupKey: null } })).toBe(2);
  });
});
