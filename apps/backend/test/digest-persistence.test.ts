/**
 * Real-DB integration test: Digest table persistence shape.
 *
 * Layer 1 PR 2. Verifies the Digest table accepts and persists the column
 * shape declared in closure §3.5: kind, channel, periodStart/periodEnd,
 * body JSONB, optional bodyText, optional deliveryChannel.
 *
 * @derives(workflow-design-closure §3.5 — Digest primitive)
 * @derives(panel-2026-05-15) — Layer 1 PR 2
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `digest-${Date.now()}-`;

let companyId: string;
let audienceUserId: string;

beforeAll(async () => {
  const co = await prisma.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919999500001',
      ownerName: 'Owner',
    },
  });
  companyId = co.id;

  const u = await prisma.user.create({
    data: {
      phone: '+919999' + String(Date.now() + 400).slice(-7),
      name: 'Digest Recipient',
      locale: 'te',
      companyId,
    },
  });
  audienceUserId = u.id;
});

afterAll(async () => {
  await prisma.company.deleteMany({ where: { slug: { startsWith: TEST_PREFIX } } });
  await prisma.$disconnect();
});

describe('Digest persistence shape', () => {
  it('inserts a Digest row with optional deliveryChannel + bodyText null', async () => {
    const periodStart = new Date('2026-05-01T00:00:00Z');
    const periodEnd = new Date('2026-06-01T00:00:00Z');

    const d = await prisma.digest.create({
      data: {
        companyId,
        audienceUserId,
        kind: 'owner_monthly',
        periodStart,
        periodEnd,
        body: { complaints: 12, terminations: 1, payroll_total: 1250000 },
        bodyText: null,
        deliveryChannel: null,
      },
    });

    expect(d.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(d.kind).toBe('owner_monthly');
    expect(d.audienceUserId).toBe(audienceUserId);
    expect(d.bodyText).toBeNull();
    expect(d.deliveryChannel).toBeNull();
    expect(d.deliveredAt).toBeNull();
    expect(d.composedAt).toBeInstanceOf(Date);

    const body = d.body as Record<string, unknown>;
    expect(body.complaints).toBe(12);
    expect(body.terminations).toBe(1);

    await prisma.digest.delete({ where: { id: d.id } });
  });

  it('inserts a Digest row with bodyText + deliveryChannel populated', async () => {
    const d = await prisma.digest.create({
      data: {
        companyId,
        audienceUserId,
        kind: 'supervisor_while_you_were_out',
        periodStart: new Date('2026-05-10T00:00:00Z'),
        periodEnd: new Date('2026-05-17T00:00:00Z'),
        body: { decisionsApplied: 8, complaintsLogged: 2 },
        bodyText: 'While you were out: 8 decisions applied, 2 complaints logged.',
        deliveryChannel: 'in_app',
      },
    });

    expect(d.bodyText).toContain('While you were out');
    expect(d.deliveryChannel).toBe('in_app');

    await prisma.digest.delete({ where: { id: d.id } });
  });
});
