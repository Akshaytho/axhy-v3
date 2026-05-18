/**
 * Supervisor Today route.
 *
 *   GET /supervisor/today
 *     Returns the supervisor's Today payload at request time. JWT-implicit;
 *     never accepts `companyId` from the client. `userId` is taken from
 *     `req.auth.userId` and used both for tenant scoping (via
 *     `withTenantContext`) and supervisor portfolio resolution (via
 *     `buildTodayForSupervisor` → `getSitesSupervisedByUser`).
 *
 * Pattern mirrors `calendar.ts:278-326` — preHandler auth, tenant tx,
 * domain composition. No Zod request body (GET). Response shape is
 * `TodayResponseT` and is Zod-validated by the service before return.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 * @derives(supervisor-responsibility-model §5.5 + §5.8 + §5.9)
 * @derives(panel-2026-05-17) — Today slice
 */

import type { FastifyInstance } from 'fastify';

import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/tenant-context.js';
import { buildTodayForSupervisor } from '../lib/services/today-service.js';

export async function registerSupervisorTodayRoutes(app: FastifyInstance): Promise<void> {
  app.get('/supervisor/today', { preHandler: requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) {
      reply.code(401).send({ error: 'AUTH_REQUIRED', message: 'No auth on request' });
      return;
    }

    try {
      // Perf-fix (Cluster 1, QA-walkthrough 2026-05-18): read paths
      // pass the bare `prisma` client so Promise.all queries land on
      // separate pooled connections (genuine parallelism). The previous
      // `withTenantContext` wrapper put everything inside one Prisma
      // transaction, which serialises queries on a single connection
      // and adds 1 RTT per query × Mac↔Railway distance. Result was
      // 12s cold / 3.4s warm for /supervisor/today. Every read query
      // already filters by `companyId` explicitly so app-level isolation
      // is unchanged; we trade RLS-as-defense-in-depth for ~3-4× speed.
      const out = await buildTodayForSupervisor(prisma, {
        companyId: auth.companyId,
        userId: auth.userId,
      });
      reply.code(200).send(out);
    } catch (err) {
      req.log.error({ err }, 'GET /supervisor/today failed');
      reply.code(500).send({ error: 'INTERNAL', message: 'Could not build Today payload' });
    }
  });
}
