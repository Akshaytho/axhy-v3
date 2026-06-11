/**
 * RLS Option-A wiring — real-DB test (lab :5433) of the ACTUAL route plumbing
 * running with the prisma singleton connected as the non-superuser axhy_app
 * role. Proves the 2026-06-11 audit's breaking sites are fixed:
 *
 *   - tenantReadClient: the real buildTodayForSupervisor returns the seeded
 *     portfolio under axhy_app (the audit's break: empty payload), while the
 *     BARE client still returns empty (negative control proving the wrapper
 *     is what fixes it). Cross-tenant reads stay blocked. Parallel Promise.all
 *     works (Cluster-1 parallelism preserved).
 *   - withWorkerTenantRead: the real getWorkerToday resolves the worker and
 *     their visit under axhy_app (the audit's break: false 404
 *     NO_WORKER_PROFILE for every worker), bare tx as negative control.
 *   - revokeForCompromise: the real refresh-token store revokes the family
 *     AND bumps Membership.tokenEpoch under axhy_app (the audit's break:
 *     silent rollback leaving stolen tokens alive).
 *   - getLivingDoc lazy upsert passes the RLS WITH CHECK via tenantReadClient.
 *
 * Run on the lab:
 *   cd apps/backend && \
 *   AXHY_DB_URL="postgresql://axhy_app@localhost:5433/axhy_rls_lab" \
 *   RLS_ADMIN_URL="postgresql://postgres@localhost:5433/axhy_rls_lab" \
 *   npx vitest run test/rls-option-a-routes.test.ts
 *
 * @derives(docs/locked/operational-invariants.md INVARIANT 1)
 * @derives(migration 20260609_023_rls_tenant_isolation + 20260609_024_rls_auth_self_read)
 */
import crypto from 'node:crypto';

import pg from 'pg';
import pino from 'pino';
import type { FastifyBaseLogger } from 'fastify';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { prisma } from '../src/lib/prisma.js';
import { tenantReadClient, withWorkerTenantRead } from '../src/middleware/tenant-context.js';
import { buildTodayForSupervisor } from '../src/lib/services/today-service.js';
import { getWorkerToday } from '../src/lib/services/worker-today-service.js';
import { createRefreshTokenStore, sha256hex } from '../src/lib/services/refresh-token-store.js';
import { getLivingDoc } from '../src/lib/living-doc.js';

const { Pool } = pg;

const ADMIN_URL = process.env.RLS_ADMIN_URL ?? 'postgresql://postgres@localhost:5433/axhy_rls_lab';
const admin = new Pool({ connectionString: ADMIN_URL });

const uid = (): string => crypto.randomUUID();
const sfx = crypto.randomBytes(4).toString('hex');
const log = pino({ level: 'silent' }) as unknown as FastifyBaseLogger;

const companyA = uid();
const companyB = uid();
const supervisorUser = uid();
const workerUser = uid();
const workerId = uid();
const membershipW = uid();
const siteA = uid();
const bindingA = uid();
const assignmentA = uid();
const visitA = uid();
let refreshFamilyId = '';

describe('RLS Option-A route plumbing (real functions as axhy_app)', () => {
  beforeAll(async () => {
    const who = await prisma.$queryRawUnsafe<{ u: string; s: string }[]>(
      `SELECT current_user AS u, current_setting('is_superuser') AS s`,
    );
    if (who[0]?.u !== 'axhy_app' || who[0]?.s !== 'off') {
      throw new Error(
        `Expected prisma to connect as non-superuser axhy_app, got ${who[0]?.u}/${who[0]?.s}. ` +
          `Run with AXHY_DB_URL=postgresql://axhy_app@localhost:5433/axhy_rls_lab`,
      );
    }

    await admin.query(
      `INSERT INTO axhy."Company"(id,name,slug,"ownerPhone","ownerName","updatedAt")
       VALUES ($1,$2,$3,$4,$5,now()),($6,$7,$8,$9,$10,now())`,
      [
        companyA,
        `oaA-${sfx}`,
        `oaa-${sfx}`,
        `+9171${sfx.slice(0, 4)}`,
        'A',
        companyB,
        `oaB-${sfx}`,
        `oab-${sfx}`,
        `+9172${sfx.slice(0, 4)}`,
        'B',
      ],
    );
    await admin.query(
      `INSERT INTO axhy."User"(id,phone,"updatedAt") VALUES ($1,$2,now()),($3,$4,now())`,
      [supervisorUser, `+9173${sfx.slice(0, 4)}`, workerUser, `+9174${sfx.slice(0, 4)}`],
    );
    await admin.query(
      `INSERT INTO axhy."Site"(id,"companyId",name,"updatedAt") VALUES ($1,$2,$3,now())`,
      [siteA, companyA, `oaSite-${sfx}`],
    );
    await admin.query(
      `INSERT INTO axhy."SiteSupervisorBinding"
         (id,"companyId","siteId","userId","effectiveFrom",reason,"createdBy")
       VALUES ($1,$2,$3,$4,now() - interval '7 days','rls-option-a test',$5)`,
      [bindingA, companyA, siteA, supervisorUser, supervisorUser],
    );
    await admin.query(
      `INSERT INTO axhy."Worker"(id,"companyId","userId",name,phone,"updatedAt")
       VALUES ($1,$2,$3,$4,$5,now())`,
      [workerId, companyA, workerUser, `oaWkr-${sfx}`, `+9175${sfx.slice(0, 4)}`],
    );
    await admin.query(
      `INSERT INTO axhy."Assignment"
         (id,"companyId","workerId","siteId","shiftStart","shiftEnd","dayMask","validFrom",state,"updatedAt")
       VALUES ($1,$2,$3,$4,'09:00','17:00','1111111',now() - interval '7 days','ACTIVE',now())`,
      [assignmentA, companyA, workerId, siteA],
    );
    await admin.query(
      `INSERT INTO axhy."Visit"(id,"companyId","workerId","siteId","scheduledFor","updatedAt")
       VALUES ($1,$2,$3,$4,now() at time zone 'utc',now())`,
      [visitA, companyA, workerId, siteA],
    );
    await admin.query(
      `INSERT INTO axhy."Membership"(id,"companyId","userId",role,"updatedAt")
       VALUES ($1,$2,$3,'WORKER',now())`,
      [membershipW, companyA, workerUser],
    );
    const rt = await admin.query(
      `INSERT INTO axhy."RefreshToken"("userId","membershipId","currentTokenHash","expiresAt")
       VALUES ($1,$2,$3,now() + interval '30 days') RETURNING id`,
      [workerUser, membershipW, sha256hex(`rls-oa-${sfx}`)],
    );
    refreshFamilyId = (rt.rows[0] as { id: string }).id;
  });

  afterAll(async () => {
    await admin.query(`DELETE FROM axhy."RefreshToken" WHERE id = $1::uuid`, [refreshFamilyId]);
    await admin.query(`DELETE FROM axhy."LivingDoc" WHERE "companyId" = $1::uuid`, [companyA]);
    await admin.query(`DELETE FROM axhy."Visit" WHERE id = $1::uuid`, [visitA]);
    await admin.query(`DELETE FROM axhy."Assignment" WHERE id = $1::uuid`, [assignmentA]);
    await admin.query(`DELETE FROM axhy."Membership" WHERE id = $1::uuid`, [membershipW]);
    await admin.query(`DELETE FROM axhy."Worker" WHERE id = $1::uuid`, [workerId]);
    await admin.query(`DELETE FROM axhy."SiteSupervisorBinding" WHERE id = $1::uuid`, [bindingA]);
    await admin.query(`DELETE FROM axhy."Site" WHERE id = $1::uuid`, [siteA]);
    await admin.query(`DELETE FROM axhy."User" WHERE id = ANY($1::uuid[])`, [
      [supervisorUser, workerUser],
    ]);
    await admin.query(`DELETE FROM axhy."Company" WHERE id = ANY($1::uuid[])`, [
      [companyA, companyB],
    ]);
    await admin.end();
    await prisma.$disconnect();
  });

  it('NEGATIVE CONTROL — the bare client returns an EMPTY Today payload as axhy_app (the audit bug)', async () => {
    const out = await buildTodayForSupervisor(prisma, {
      companyId: companyA,
      userId: supervisorUser,
    });
    expect(out.sites.length).toBe(0);
    expect(out.workers.length).toBe(0);
  });

  it('tenantReadClient — the REAL buildTodayForSupervisor returns the seeded portfolio as axhy_app', async () => {
    const out = await buildTodayForSupervisor(tenantReadClient(prisma, companyA), {
      companyId: companyA,
      userId: supervisorUser,
    });
    expect(out.sites.map((s) => s.id)).toContain(siteA);
    expect(out.workers.map((w) => w.id)).toContain(workerId);
  });

  it('tenantReadClient — cross-tenant reads stay blocked', async () => {
    const inB = await tenantReadClient(prisma, companyB).site.findMany({
      where: { id: siteA },
    });
    expect(inB.length).toBe(0);
  });

  it('tenantReadClient — Promise.all parallel queries all carry the GUC', async () => {
    const c = tenantReadClient(prisma, companyA);
    const [sites, workers, visits] = await Promise.all([
      c.site.findMany({ where: { id: siteA } }),
      c.worker.findMany({ where: { id: workerId } }),
      c.visit.findMany({ where: { id: visitA } }),
    ]);
    expect(sites.length).toBe(1);
    expect(workers.length).toBe(1);
    expect(visits.length).toBe(1);
  });

  it('NEGATIVE CONTROL — bare $transaction yields NO_WORKER as axhy_app (the audit false-404)', async () => {
    const result = await prisma.$transaction((tx) => getWorkerToday(tx, { userId: workerUser }));
    expect(result.kind).toBe('NO_WORKER');
  });

  it('withWorkerTenantRead — the REAL getWorkerToday resolves the worker + visit as axhy_app', async () => {
    const result = await withWorkerTenantRead(prisma, workerUser, (tx) =>
      getWorkerToday(tx, { userId: workerUser }),
    );
    expect(result.kind).not.toBe('NO_WORKER');
    if (result.kind !== 'NO_WORKER') {
      const visitIds = result.data.visits.map((v) => v.id);
      expect(visitIds).toContain(visitA);
    }
  });

  it('revokeForCompromise — revokes the family AND bumps tokenEpoch as axhy_app', async () => {
    const store = createRefreshTokenStore(prisma);
    await store.revokeForCompromise(refreshFamilyId);

    const rt = await admin.query(
      `SELECT "revokedAt", "revokedReason" FROM axhy."RefreshToken" WHERE id = $1::uuid`,
      [refreshFamilyId],
    );
    expect(rt.rows[0].revokedAt).not.toBeNull();
    expect(rt.rows[0].revokedReason).toBe('COMPROMISE');

    const m = await admin.query(`SELECT token_epoch FROM axhy."Membership" WHERE id = $1::uuid`, [
      membershipW,
    ]);
    expect(m.rows[0].token_epoch).toBe(1);
  });

  it('getLivingDoc — lazy upsert passes the RLS WITH CHECK via tenantReadClient', async () => {
    const doc = await getLivingDoc(
      tenantReadClient(prisma, companyA),
      companyA,
      supervisorUser,
      log,
    );
    expect(doc.companyId).toBe(companyA);
    expect(doc.supervisorId).toBe(supervisorUser);
  });
});
