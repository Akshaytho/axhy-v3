/**
 * RLS Phase 2f — SUPER_ADMIN provisioning + HR helper, run as the non-superuser axhy_app
 * role against the lab. This exercises the hardest RLS WRITE path end-to-end:
 *   tx.company.create -> mid-tx set_config(company.id) -> COMPANY_CREATED audit (RLS) ->
 *   bootstrap OWNER Membership (RLS).
 * If the mid-tx GUC were missing, the audit/membership INSERTs would fail WITH CHECK under
 * axhy_app. It also proves getHrSiteIds self-wraps so it returns rows under axhy_app.
 *
 * MUST run with the prisma singleton pointed at axhy_app:
 *   cd apps/backend && \
 *   AXHY_DB_URL="postgresql://axhy_app@localhost:5433/postgres" \
 *   RLS_ADMIN_URL="postgresql://postgres@localhost:5433/postgres" \
 *   npx vitest run test/rls-superadmin-provision.test.ts
 *
 * @derives(migration 20260609_023_rls_tenant_isolation)
 */
import crypto from 'node:crypto';

import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { prisma } from '../src/lib/prisma.js';
import { superAdminCreateCompanyService } from '../src/lib/services/super-admin-company-service.js';
import { getHrSiteIds } from '../src/middleware/hr-site-scope.js';

const { Pool } = pg;
const ADMIN_URL = process.env.RLS_ADMIN_URL ?? 'postgresql://postgres@localhost:5433/postgres';
const admin = new Pool({ connectionString: ADMIN_URL });

const sfx = crypto.randomBytes(4).toString('hex');
const callerUserId = crypto.randomUUID();
const hrUserId = crypto.randomUUID();
const siteId = crypto.randomUUID();

let createdCompanyId: string | null = null;
let ownerUserId: string | null = null;

describe('RLS Phase 2f — super-admin provisioning as axhy_app', () => {
  beforeAll(async () => {
    const who = await prisma.$queryRawUnsafe<{ u: string; s: string }[]>(
      `SELECT current_user AS u, current_setting('is_superuser') AS s`,
    );
    if (who[0]?.u !== 'axhy_app' || who[0]?.s !== 'off') {
      throw new Error(
        `Expected prisma to connect as non-superuser axhy_app, got ${who[0]?.u}/${who[0]?.s}. ` +
          `Run with AXHY_DB_URL=postgresql://axhy_app@localhost:5433/postgres`,
      );
    }
  });

  afterAll(async () => {
    if (createdCompanyId) {
      await admin.query(`DELETE FROM axhy."Site" WHERE "companyId"=$1`, [createdCompanyId]);
      await admin.query(`DELETE FROM axhy."Membership" WHERE "companyId"=$1`, [createdCompanyId]);
      await admin.query(`DELETE FROM axhy."AuditEvent" WHERE "companyId"=$1`, [createdCompanyId]);
      if (ownerUserId) await admin.query(`DELETE FROM axhy."User" WHERE id=$1`, [ownerUserId]);
      await admin.query(`DELETE FROM axhy."Company" WHERE id=$1`, [createdCompanyId]);
    }
    await admin.query(`DELETE FROM axhy."User" WHERE id=$1`, [hrUserId]);
    await admin.end();
    await prisma.$disconnect();
  });

  it('superAdminCreateCompanyService succeeds under axhy_app (company + audit + OWNER membership)', async () => {
    const out = await prisma.$transaction(
      (tx) =>
        superAdminCreateCompanyService(tx, {
          callerUserId,
          body: {
            name: `2f Co ${sfx}`,
            ownerPhone: `+9177${sfx.slice(0, 4)}`,
            ownerName: `Owner ${sfx}`,
          },
        }),
      { timeout: 20_000, maxWait: 10_000 },
    );
    expect(out.kind).toBe('OK');
    if (out.kind !== 'OK') return;
    createdCompanyId = out.companyId;
    ownerUserId = out.ownerUserId;

    // The RLS-gated rows must actually have landed — verify via the admin pool (bypasses RLS).
    const m = await admin.query(`SELECT role, status FROM axhy."Membership" WHERE "companyId"=$1`, [
      out.companyId,
    ]);
    expect(m.rows.length).toBe(1);
    expect(m.rows[0].role).toBe('OWNER');
    expect(m.rows[0].status).toBe('ACTIVE');
    const a = await admin.query(
      `SELECT 1 FROM axhy."AuditEvent" WHERE "companyId"=$1 AND kind='COMPANY_CREATED'`,
      [out.companyId],
    );
    expect(a.rows.length).toBeGreaterThanOrEqual(1);
  });

  it('getHrSiteIds returns an HR-owned site under axhy_app (helper self-wraps the GUC)', async () => {
    expect(createdCompanyId).toBeTruthy();
    // Site.ownerHrUserId FKs to User — seed the HR user first.
    await admin.query(`INSERT INTO axhy."User"(id,phone,"updatedAt") VALUES ($1,$2,now())`, [
      hrUserId,
      `+9188${sfx.slice(0, 4)}`,
    ]);
    await admin.query(
      `INSERT INTO axhy."Site"(id,"companyId",name,"ownerHrUserId","updatedAt") VALUES ($1,$2,$3,$4,now())`,
      [siteId, createdCompanyId, `2f-site-${sfx}`, hrUserId],
    );
    const ids = await getHrSiteIds(prisma, hrUserId, createdCompanyId!);
    expect(ids).toContain(siteId);
    // A different HR (no owned sites) sees none — confirms the scope is real, not pass-through.
    const none = await getHrSiteIds(prisma, crypto.randomUUID(), createdCompanyId!);
    expect(none).not.toContain(siteId);
  });
});
