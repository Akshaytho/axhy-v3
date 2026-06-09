/**
 * RLS auth-bootstrap — real-DB test (lab :5433) of the ACTUAL app functions running
 * with the prisma singleton connected as the non-superuser axhy_app role.
 *
 * Proves the Phase-2 auth bootstrap works under RLS + migration 024's tenant_self_read:
 *   - resolveWorkerFromAuth returns the caller's OWN worker, NO_WORKER for an unknown user.
 *   - withUserContext lets a user read only their OWN Membership/Worker rows across
 *     companies — never another user's.
 *   - withTenantRead returns only the in-context company's rows (cross-tenant blocked).
 *
 * MUST run with the prisma singleton pointed at axhy_app:
 *   cd apps/backend && \
 *   AXHY_DB_URL="postgresql://axhy_app@localhost:5433/postgres" \
 *   RLS_ADMIN_URL="postgresql://postgres@localhost:5433/postgres" \
 *   npx vitest run test/rls-auth-bootstrap.test.ts
 *
 * @derives(packages/shared-schema/prisma/migrations/20260609_024_rls_auth_self_read)
 */
import crypto from 'node:crypto';

import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { prisma } from '../src/lib/prisma.js';
import {
  resolveWorkerFromAuth,
  withUserContext,
  withTenantRead,
} from '../src/middleware/tenant-context.js';

const { Pool } = pg;

const ADMIN_URL = process.env.RLS_ADMIN_URL ?? 'postgresql://postgres@localhost:5433/postgres';
const admin = new Pool({ connectionString: ADMIN_URL });

const uid = (): string => crypto.randomUUID();
const sfx = crypto.randomBytes(4).toString('hex');

const companyA = uid();
const companyB = uid();
const userA = uid();
const userB = uid();
const workerA = uid();
const workerB = uid();
const membershipA = uid();
const membershipB = uid();
const siteA = uid();

describe('RLS auth bootstrap (real functions as axhy_app)', () => {
  beforeAll(async () => {
    // Confirm the singleton really is axhy_app — otherwise the test would pass trivially
    // as a superuser that bypasses RLS.
    const who = await prisma.$queryRawUnsafe<{ u: string; s: string }[]>(
      `SELECT current_user AS u, current_setting('is_superuser') AS s`,
    );
    if (who[0]?.u !== 'axhy_app' || who[0]?.s !== 'off') {
      throw new Error(
        `Expected prisma to connect as non-superuser axhy_app, got ${who[0]?.u}/${who[0]?.s}. ` +
          `Run with AXHY_DB_URL=postgresql://axhy_app@localhost:5433/postgres`,
      );
    }

    await admin.query(
      `INSERT INTO axhy."Company"(id,name,slug,"ownerPhone","ownerName","updatedAt")
       VALUES ($1,$2,$3,$4,$5,now()),($6,$7,$8,$9,$10,now())`,
      [
        companyA,
        `abA-${sfx}`,
        `aba-${sfx}`,
        `+9111${sfx.slice(0, 4)}`,
        'A',
        companyB,
        `abB-${sfx}`,
        `abb-${sfx}`,
        `+9122${sfx.slice(0, 4)}`,
        'B',
      ],
    );
    await admin.query(
      `INSERT INTO axhy."User"(id,phone,"updatedAt") VALUES ($1,$2,now()),($3,$4,now())`,
      [userA, `+9133${sfx.slice(0, 4)}`, userB, `+9144${sfx.slice(0, 4)}`],
    );
    await admin.query(
      `INSERT INTO axhy."Worker"(id,"companyId","userId",name,phone,"updatedAt")
       VALUES ($1,$2,$3,$4,$5,now()),($6,$7,$8,$9,$10,now())`,
      [
        workerA,
        companyA,
        userA,
        `wkrA-${sfx}`,
        `+9155${sfx.slice(0, 4)}`,
        workerB,
        companyB,
        userB,
        `wkrB-${sfx}`,
        `+9166${sfx.slice(0, 4)}`,
      ],
    );
    await admin.query(
      `INSERT INTO axhy."Membership"(id,"companyId","userId",role,"updatedAt")
       VALUES ($1,$2,$3,$4,now()),($5,$6,$7,$8,now())`,
      [membershipA, companyA, userA, 'WORKER', membershipB, companyB, userB, 'WORKER'],
    );
    await admin.query(
      `INSERT INTO axhy."Site"(id,"companyId",name,"updatedAt") VALUES ($1,$2,$3,now())`,
      [siteA, companyA, `siteA-${sfx}`],
    );
  });

  afterAll(async () => {
    await admin.query(`DELETE FROM axhy."Membership" WHERE id = ANY($1::uuid[])`, [
      [membershipA, membershipB],
    ]);
    await admin.query(`DELETE FROM axhy."Worker" WHERE id = ANY($1::uuid[])`, [[workerA, workerB]]);
    await admin.query(`DELETE FROM axhy."Site" WHERE id = ANY($1::uuid[])`, [[siteA]]);
    await admin.query(`DELETE FROM axhy."User" WHERE id = ANY($1::uuid[])`, [[userA, userB]]);
    await admin.query(`DELETE FROM axhy."Company" WHERE id = ANY($1::uuid[])`, [
      [companyA, companyB],
    ]);
    await admin.end();
    await prisma.$disconnect();
  });

  it('resolveWorkerFromAuth returns the caller’s own worker (each user → own company)', async () => {
    const a = await resolveWorkerFromAuth(prisma, { userId: userA });
    expect(a).toEqual({ kind: 'OK', workerId: workerA, companyId: companyA });
    const b = await resolveWorkerFromAuth(prisma, { userId: userB });
    expect(b).toEqual({ kind: 'OK', workerId: workerB, companyId: companyB });
  });

  it('resolveWorkerFromAuth returns NO_WORKER for an unknown user', async () => {
    const r = await resolveWorkerFromAuth(prisma, { userId: uid() });
    expect(r).toEqual({ kind: 'NO_WORKER' });
  });

  it('withUserContext: a user reads only their OWN membership, never another user’s', async () => {
    const own = await withUserContext(prisma, userA, (tx) =>
      tx.membership.findMany({ where: { id: { in: [membershipA, membershipB] } } }),
    );
    const ids = own.map((m) => m.id);
    expect(ids).toContain(membershipA);
    expect(ids).not.toContain(membershipB);
  });

  it('withUserContext: a user cannot read another user’s worker row', async () => {
    const other = await withUserContext(prisma, userA, (tx) =>
      tx.worker.findUnique({ where: { userId: userB } }),
    );
    expect(other).toBeNull();
  });

  it('withTenantRead: returns only the in-context company’s rows (cross-tenant blocked)', async () => {
    const inA = await withTenantRead(prisma, companyA, (tx) =>
      tx.site.findMany({ where: { id: siteA } }),
    );
    expect(inA.map((s) => s.id)).toContain(siteA);

    const inB = await withTenantRead(prisma, companyB, (tx) =>
      tx.site.findMany({ where: { id: siteA } }),
    );
    expect(inB.length).toBe(0);
  });
});
