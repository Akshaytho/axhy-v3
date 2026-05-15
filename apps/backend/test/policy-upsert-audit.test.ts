/**
 * Real-DB integration test: Policy table + recordPolicyChanged audit-emit.
 *
 * Layer 1 PR 2. Exercises the new Policy schema object AND the typed audit-
 * emit helper:
 *   1. Append new Policy row (per closure §3.6 append-only semantics)
 *   2. recordPolicyChanged writes a matching POLICY_CHANGED AuditEvent row
 *   3. Payload Zod schema rejects malformed inputs at the helper boundary
 *
 * Append-only check: writing two values for the same key creates two rows;
 * neither is updated in place. The "current" value semantic (most recent by
 * setAt) is a query concern, not a write concern, and is not exercised here.
 *
 * @derives(workflow-design-closure §3.6 — Policy primitive)
 * @derives(workflow-design-closure §9 — POLICY_CHANGED kind)
 * @derives(panel-2026-05-15) — Layer 1 PR 2
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

import { recordPolicyChanged } from '../src/lib/audit-event.js';
import { withTenantContext } from '../src/middleware/tenant-context.js';

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';

const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `policy-${Date.now()}-`;

let companyId: string;
let actorUserId: string;

beforeAll(async () => {
  const co = await prisma.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919999200001',
      ownerName: 'Owner',
    },
  });
  companyId = co.id;

  const actor = await prisma.user.create({
    data: {
      phone: '+919999' + String(Date.now() + 100).slice(-7),
      name: 'Policy Actor',
      locale: 'en',
      companyId,
    },
  });
  actorUserId = actor.id;
});

afterAll(async () => {
  await prisma.company.deleteMany({ where: { slug: { startsWith: TEST_PREFIX } } });
  await prisma.$disconnect();
});

describe('Policy + recordPolicyChanged', () => {
  it('writes Policy row + matching POLICY_CHANGED AuditEvent in one transaction', async () => {
    const policyKey = 'hr.queue.urgent_sla_minutes';
    const newValue = 120;

    const policyId = await withTenantContext(prisma, companyId, async (tx) => {
      const p = await tx.policy.create({
        data: {
          companyId,
          key: policyKey,
          value: newValue,
          setBy: actorUserId,
          category: 'sla',
          previousValueSnapshot: null,
        },
      });
      await recordPolicyChanged(tx, {
        companyId,
        actorId: actorUserId,
        policyId: p.id,
        payload: {
          key: policyKey,
          category: 'sla',
          value: newValue,
          previousValueSnapshot: null,
        },
      });
      return p.id;
    });

    // Verify Policy row exists
    const stored = await prisma.policy.findUnique({ where: { id: policyId } });
    expect(stored).not.toBeNull();
    expect(stored!.key).toBe(policyKey);
    expect(stored!.category).toBe('sla');
    expect(stored!.value).toBe(newValue);

    // Verify AuditEvent row exists with correct kind + targetId
    const events = await prisma.auditEvent.findMany({
      where: { companyId, kind: 'POLICY_CHANGED', targetId: policyId },
    });
    expect(events).toHaveLength(1);
    expect(events[0].actorId).toBe(actorUserId);

    const payload = events[0].payload as Record<string, unknown>;
    expect(payload.key).toBe(policyKey);
    expect(payload.category).toBe('sla');
    expect(payload.value).toBe(newValue);
    expect(payload.previousValueSnapshot).toBeNull();
  });

  it('records the previous value snapshot on subsequent writes (append-only)', async () => {
    const policyKey = 'hr.pod.target_worker_count';

    // First write — no previous
    const firstId = await withTenantContext(prisma, companyId, async (tx) => {
      const p = await tx.policy.create({
        data: {
          companyId,
          key: policyKey,
          value: 200,
          setBy: actorUserId,
          category: 'hr',
          previousValueSnapshot: null,
        },
      });
      await recordPolicyChanged(tx, {
        companyId,
        actorId: actorUserId,
        policyId: p.id,
        payload: { key: policyKey, category: 'hr', value: 200, previousValueSnapshot: null },
      });
      return p.id;
    });

    // Second write — previous = 200
    const secondId = await withTenantContext(prisma, companyId, async (tx) => {
      const p = await tx.policy.create({
        data: {
          companyId,
          key: policyKey,
          value: 250,
          setBy: actorUserId,
          category: 'hr',
          previousValueSnapshot: 200,
        },
      });
      await recordPolicyChanged(tx, {
        companyId,
        actorId: actorUserId,
        policyId: p.id,
        payload: { key: policyKey, category: 'hr', value: 250, previousValueSnapshot: 200 },
      });
      return p.id;
    });

    expect(firstId).not.toBe(secondId);

    // Both rows persist; neither is updated in place
    const rows = await prisma.policy.findMany({
      where: { companyId, key: policyKey },
      orderBy: { setAt: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].value).toBe(200);
    expect(rows[1].value).toBe(250);
    expect(rows[1].previousValueSnapshot).toBe(200);
  });

  it('rejects malformed payloads at the helper Zod boundary', async () => {
    await expect(
      withTenantContext(prisma, companyId, async (tx) => {
        await recordPolicyChanged(tx, {
          companyId,
          actorId: actorUserId,
          policyId: '00000000-0000-0000-0000-000000000000',
          payload: {
            // Empty key — violates min(1)
            key: '',
            category: 'sla',
            value: 60,
            previousValueSnapshot: null,
          },
        });
      }),
    ).rejects.toThrow();

    await expect(
      withTenantContext(prisma, companyId, async (tx) => {
        await recordPolicyChanged(tx, {
          companyId,
          actorId: actorUserId,
          policyId: '00000000-0000-0000-0000-000000000000',
          payload: {
            key: 'some.key',
            // Invalid category — not in the enum
            category: 'not_a_real_category' as never,
            value: 60,
            previousValueSnapshot: null,
          },
        });
      }),
    ).rejects.toThrow();
  });
});
