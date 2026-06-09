/**
 * #4 + #21 (RLS) — supervisor/leave responsibility reads honour axhy_app RLS.
 *
 * Both fixes route previously-bare-`prisma` reads of FORCE-RLS tables
 * (SiteSupervisorBinding, Assignment) through `withTenantRead`, which sets the
 * `axhy.current_company_id` GUC transaction-locally. This test proves the exact
 * property the fixes depend on, connecting as the non-superuser `axhy_app` role:
 *
 *   - getSitesSupervisedByUser  (the supervisor portfolio read used by both
 *     GET /supervisor/decisions (#4) and the GET /leave-requests/:id gate (#21))
 *   - deriveWorkerPrimarySiteId (the worker→site read used by the same gates)
 *
 * Asserted as axhy_app:
 *   - WITHOUT the GUC (bare client)        → fail-closed: [] / null  (the OLD bug)
 *   - WITH the GUC (via withTenantRead)     → the tenant's real rows   (the FIX)
 *   - admin (superuser, BYPASSRLS)          → rows present (proves the seed)
 *
 * The auto-sweep mutation under RLS (#4) is covered transitively: SupervisorDecision
 * is one of the 27 FORCE-RLS tables proven by rls-tenant-isolation.test.ts, and the
 * sweep now runs on the same GUC-set withTenantRead tx (decisions-service.ts).
 *
 * Run on the lab:
 *   cd apps/backend && \
 *   RLS_ADMIN_URL="postgresql://postgres@localhost:5433/postgres" \
 *   RLS_APP_URL="postgresql://axhy_app@localhost:5433/postgres" \
 *   npx vitest run test/rls-supervisor-leave-reads.test.ts
 *
 * @derives(PRODUCTION_BUG_LEDGER.md #4, #21)
 * @derives(docs/locked/operational-invariants.md INVARIANT 1)
 */
import crypto from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  deriveWorkerPrimarySiteId,
  getSitesSupervisedByUser,
} from '../src/lib/effective-responsibility.js';
import { withTenantRead } from '../src/middleware/tenant-context.js';

const ADMIN_URL =
  process.env.RLS_ADMIN_URL ??
  process.env.DATABASE_URL ??
  'postgresql://postgres@localhost:5433/postgres';
const APP_URL = process.env.RLS_APP_URL ?? 'postgresql://axhy_app@localhost:5433/postgres';

const admin = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } });
const app = new PrismaClient({ datasources: { db: { url: APP_URL } } });

const uid = (): string => crypto.randomUUID();
const sfx = crypto.randomBytes(4).toString('hex');

const companyId = uid();
const supervisorUserId = uid();
const siteId = uid();
const workerId = uid();

describe('#4/#21 — supervisor + leave responsibility reads under axhy_app RLS', () => {
  beforeAll(async () => {
    // Seed as superuser (bypasses RLS) — the rows the two helpers read.
    await admin.company.create({
      data: {
        id: companyId,
        name: `rls-sl-${sfx}`,
        slug: `rls-sl-${sfx}`,
        ownerPhone: `+9193${sfx.slice(0, 4)}`,
        ownerName: 'SL',
      },
    });
    await admin.user.create({
      data: { id: supervisorUserId, phone: `+9194${sfx.slice(0, 4)}`, name: 'Sup' },
    });
    await admin.site.create({
      data: { id: siteId, companyId, name: `site-${sfx}`, state: 'ACTIVE' },
    });
    await admin.worker.create({
      data: { id: workerId, companyId, name: `wk-${sfx}`, phone: `+9195${sfx.slice(0, 4)}` },
    });
    await admin.siteSupervisorBinding.create({
      data: {
        companyId,
        siteId,
        userId: supervisorUserId,
        effectiveFrom: new Date(Date.now() - 86_400_000), // yesterday
        reason: 'seed',
        createdBy: supervisorUserId,
      },
    });
    await admin.assignment.create({
      data: {
        companyId,
        workerId,
        siteId,
        shiftStart: '09:00',
        shiftEnd: '17:00',
        dayMask: 'MTWTFS_',
        validFrom: new Date(Date.now() - 86_400_000),
        state: 'ACTIVE',
      },
    });
  });

  afterAll(async () => {
    await admin.assignment.deleteMany({ where: { companyId } });
    await admin.siteSupervisorBinding.deleteMany({ where: { companyId } });
    await admin.worker.deleteMany({ where: { companyId } });
    await admin.site.deleteMany({ where: { companyId } });
    await admin.user.deleteMany({ where: { id: supervisorUserId } });
    await admin.company.deleteMany({ where: { id: companyId } });
    await admin.$disconnect();
    await app.$disconnect();
  });

  it('admin (superuser) sees the seeded portfolio + assignment (seed sanity)', async () => {
    const sites = await getSitesSupervisedByUser(admin, { companyId, userId: supervisorUserId });
    expect(sites.map((s) => s.siteId)).toContain(siteId);
    const derived = await deriveWorkerPrimarySiteId(admin, { companyId, workerId });
    expect(derived).toBe(siteId);
  });

  it('axhy_app WITHOUT the GUC fails closed — the OLD #4/#21 bug', async () => {
    // Bare axhy_app client, no withTenant* wrap → RLS hides every tenant row.
    const sites = await getSitesSupervisedByUser(app, { companyId, userId: supervisorUserId });
    expect(sites).toEqual([]);
    const derived = await deriveWorkerPrimarySiteId(app, { companyId, workerId });
    expect(derived).toBeNull();
  });

  it('axhy_app WITH the GUC (withTenantRead) sees the tenant rows — the FIX', async () => {
    const sites = await withTenantRead(app, companyId, (tx) =>
      getSitesSupervisedByUser(tx, { companyId, userId: supervisorUserId }),
    );
    expect(sites.map((s) => s.siteId)).toContain(siteId);

    const derived = await withTenantRead(app, companyId, (tx) =>
      deriveWorkerPrimarySiteId(tx, { companyId, workerId }),
    );
    expect(derived).toBe(siteId);
  });
});
