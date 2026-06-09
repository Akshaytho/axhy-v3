/**
 * RLS tenant-isolation — real-DB test (lab :5433).
 *
 * Proves migration 20260609_023's FORCE RLS + USING/WITH CHECK policies isolate
 * tenants when the app connects as the non-superuser `axhy_app` role.
 *
 * Connects as BOTH roles:
 *   - admin (postgres, superuser, bypasses RLS) — seeds + cleans up its own rows.
 *   - app   (axhy_app, NOSUPERUSER NOBYPASSRLS) — the isolation assertions.
 *
 * The app path mirrors withTenantContext exactly: a transaction that first runs
 * SELECT set_config('axhy.current_company_id', $1, true), so the GUC is
 * transaction-local (auto-resets on COMMIT) — the only pooling-safe pattern
 * (a session-level GUC would leak across pooled requests).
 *
 * Run on the lab:
 *   cd apps/backend && \
 *   RLS_ADMIN_URL="postgresql://postgres@localhost:5433/postgres" \
 *   RLS_APP_URL="postgresql://axhy_app@localhost:5433/postgres" \
 *   npx vitest run test/rls-tenant-isolation.test.ts
 *
 * @derives(docs/locked/operational-invariants.md INVARIANT 1)
 * @derives(migration 20260609_023_rls_tenant_isolation)
 */
import crypto from 'node:crypto';

import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const { Pool } = pg;

const ADMIN_URL =
  process.env.RLS_ADMIN_URL ??
  process.env.DATABASE_URL ??
  'postgresql://postgres@localhost:5433/postgres';
const APP_URL = process.env.RLS_APP_URL ?? 'postgresql://axhy_app@localhost:5433/postgres';

const uid = (): string => crypto.randomUUID();
const sfx = crypto.randomBytes(4).toString('hex');

const companyA = uid();
const companyB = uid();
const siteA = uid();
const siteB = uid();

const admin = new Pool({ connectionString: ADMIN_URL });
const app = new Pool({ connectionString: APP_URL });

/**
 * Run `fn` inside a transaction with the company GUC set transaction-locally —
 * the exact pattern withTenantContext uses (set_config(..., true)).
 */
async function asCompany<T>(
  pool: pg.Pool,
  companyId: string | null,
  fn: (c: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (companyId !== null) {
      await client.query("SELECT set_config('axhy.current_company_id', $1, true)", [companyId]);
    }
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** The 27 tenant tables: every axhy companyId-bearing table EXCEPT User/Outbox/IdempotencyKey. */
const TENANT_TABLES = [
  'Membership',
  'Site',
  'Worker',
  'Visit',
  'CalendarEntry',
  'Assignment',
  'ChatThread',
  'ChatMessage',
  'ChatRequestLog',
  'LeaveRequest',
  'AuditEvent',
  'Device',
  'Attendance',
  'Complaint',
  'ComplaintMessage',
  'ComplaintMessageRead',
  'SwapRequest',
  'SupervisorDecision',
  'LivingDoc',
  'HRUpdate',
  'VisitPhoto',
  'HRPod',
  'Policy',
  'Notification',
  'Digest',
  'SiteSupervisorBinding',
  'ReplacementInvite',
];

describe('RLS tenant isolation (axhy_app, FORCE RLS)', () => {
  beforeAll(async () => {
    await admin.query(
      `INSERT INTO axhy."Company"(id,name,slug,"ownerPhone","ownerName","updatedAt")
       VALUES ($1,$2,$3,$4,$5,now()),($6,$7,$8,$9,$10,now())`,
      [
        companyA,
        `rlsA-${sfx}`,
        `rlsa-${sfx}`,
        `+91100${sfx.slice(0, 5)}`,
        'A',
        companyB,
        `rlsB-${sfx}`,
        `rlsb-${sfx}`,
        `+91200${sfx.slice(0, 5)}`,
        'B',
      ],
    );
    await admin.query(
      `INSERT INTO axhy."Site"(id,"companyId",name,"updatedAt")
       VALUES ($1,$2,$3,now()),($4,$5,$6,now())`,
      [siteA, companyA, `siteA-${sfx}`, siteB, companyB, `siteB-${sfx}`],
    );
  });

  afterAll(async () => {
    await admin.query(`DELETE FROM axhy."Site" WHERE id = ANY($1::uuid[])`, [[siteA, siteB]]);
    await admin.query(`DELETE FROM axhy."Company" WHERE id = ANY($1::uuid[])`, [
      [companyA, companyB],
    ]);
    await admin.end();
    await app.end();
  });

  it('app connects as a non-superuser role', async () => {
    const { rows } = await app.query(
      `SELECT current_user AS u, current_setting('is_superuser') AS s`,
    );
    expect(rows[0].u).toBe('axhy_app');
    expect(rows[0].s).toBe('off');
  });

  it('SELECT under company A context sees only A rows, never B', async () => {
    const rows = await asCompany(app, companyA, (c) =>
      c
        .query(`SELECT id FROM axhy."Site" WHERE id = ANY($1::uuid[])`, [[siteA, siteB]])
        .then((r) => r.rows),
    );
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(siteA);
    expect(ids).not.toContain(siteB);
  });

  it('SELECT with NO company context is fail-closed (zero rows)', async () => {
    const rows = await asCompany(app, null, (c) =>
      c
        .query(`SELECT id FROM axhy."Site" WHERE id = ANY($1::uuid[])`, [[siteA, siteB]])
        .then((r) => r.rows),
    );
    expect(rows.length).toBe(0);
  });

  it('cross-company INSERT is rejected by WITH CHECK', async () => {
    await expect(
      asCompany(app, companyA, (c) =>
        c.query(
          `INSERT INTO axhy."Site"(id,"companyId",name,"updatedAt") VALUES ($1,$2,$3,now())`,
          [uid(), companyB, `evil-${sfx}`],
        ),
      ),
    ).rejects.toThrow(/row-level security|policy/i);
  });

  it('same-company INSERT succeeds', async () => {
    const newId = uid();
    await asCompany(app, companyA, (c) =>
      c.query(`INSERT INTO axhy."Site"(id,"companyId",name,"updatedAt") VALUES ($1,$2,$3,now())`, [
        newId,
        companyA,
        `ok-${sfx}`,
      ]),
    );
    const { rows } = await admin.query(`SELECT id FROM axhy."Site" WHERE id=$1`, [newId]);
    expect(rows.length).toBe(1);
    await admin.query(`DELETE FROM axhy."Site" WHERE id=$1`, [newId]);
  });

  it('cross-company UPDATE and DELETE affect zero rows (target invisible)', async () => {
    const upd = await asCompany(app, companyA, (c) =>
      c.query(`UPDATE axhy."Site" SET name='hax' WHERE id=$1`, [siteB]),
    );
    expect(upd.rowCount).toBe(0);
    const del = await asCompany(app, companyA, (c) =>
      c.query(`DELETE FROM axhy."Site" WHERE id=$1`, [siteB]),
    );
    expect(del.rowCount).toBe(0);
    const { rows } = await admin.query(`SELECT name FROM axhy."Site" WHERE id=$1`, [siteB]);
    expect(rows[0]?.name).toBe(`siteB-${sfx}`);
  });

  it('all 27 tenant tables have RLS enabled, forced, and a tenant_isolation policy', async () => {
    const { rows } = await admin.query(
      `SELECT c.relname,
              c.relrowsecurity      AS rls,
              c.relforcerowsecurity AS forced,
              (SELECT count(*) FROM pg_policy p
                 WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation') AS pol
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'axhy' AND c.relkind = 'r' AND c.relname = ANY($1::text[])`,
      [TENANT_TABLES],
    );
    const byName = new Map(rows.map((r) => [r.relname as string, r]));
    for (const t of TENANT_TABLES) {
      const r = byName.get(t);
      expect(r, `${t} not found`).toBeTruthy();
      expect(r.rls, `${t}: RLS not enabled`).toBe(true);
      expect(r.forced, `${t}: RLS not forced`).toBe(true);
      expect(Number(r.pol), `${t}: tenant_isolation policy missing`).toBe(1);
    }
    expect(rows.length).toBe(27);
  });

  it('excluded tables (User, Outbox, IdempotencyKey) have NO RLS', async () => {
    const { rows } = await admin.query(
      `SELECT c.relname, c.relrowsecurity AS rls
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'axhy' AND c.relname = ANY($1::text[])`,
      [['User', 'Outbox', 'IdempotencyKey']],
    );
    expect(rows.length).toBe(3);
    for (const r of rows) expect(r.rls, `${r.relname} should NOT have RLS`).toBe(false);
  });
});
