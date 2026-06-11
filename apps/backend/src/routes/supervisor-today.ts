/**
 * Supervisor Today route.
 *
 *   GET /supervisor/today
 *     Returns the supervisor's Today payload at request time. JWT-implicit;
 *     never accepts `companyId` from the client. RLS via `tenantReadClient`
 *     (company GUC per query, pool parallelism kept); supervisor portfolio
 *     resolution via `buildTodayForSupervisor` → `getSitesSupervisedByUser`.
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
import { requireAuth, tenantReadClient } from '../middleware/tenant-context.js';
import { requireRole } from '../middleware/role-gates.js';
import { buildTodayForSupervisor } from '../lib/services/today-service.js';

export async function registerSupervisorTodayRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/supervisor/today',
    { preHandler: [requireAuth, requireRole('SUPERVISOR')] },
    async (req, reply) => {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED', message: 'No auth on request' });
        return;
      }

      try {
        // Perf-fix (Cluster 1, QA-walkthrough 2026-05-18) + RLS Option-A
        // together: `tenantReadClient` runs each query as its OWN batch
        // transaction [set company GUC, query] on the pool, so Promise.all
        // queries still land on separate pooled connections (the 12s→3.4s
        // serialisation fix is preserved) AND every read passes RLS under
        // axhy_app. Every read query also keeps its explicit `companyId`
        // filter — app-level isolation unchanged, defense in depth restored.
        const out = await buildTodayForSupervisor(tenantReadClient(prisma, auth.companyId), {
          companyId: auth.companyId,
          userId: auth.userId,
        });
        reply.code(200).send(out);
      } catch (err) {
        req.log.error({ err }, 'GET /supervisor/today failed');
        reply.code(500).send({ error: 'INTERNAL', message: 'Could not build Today payload' });
      }
    },
  );
}
