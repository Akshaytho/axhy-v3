/**
 * Supervisor Summary route.
 *
 *   GET /supervisor/summary
 *     Returns the supervisor's end-of-day digest payload at request time.
 *     JWT-implicit; never accepts `companyId` from the client. RLS via
 *     `tenantReadClient` (company GUC per query, pool parallelism kept);
 *     portfolio resolution via `buildSummaryForSupervisor` →
 *     `getSitesSupervisedByUser`.
 *
 * Pattern mirrors `supervisor-today.ts` — preHandler auth, tenant tx,
 * domain composition. No Zod request body (GET). Response shape is
 * `SummaryResponseT` and is Zod-validated by the service before return.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 * @derives(supervisor-mobile-r6-design 2026-05-12) — Summary tab
 */

import type { FastifyInstance } from 'fastify';

import { prisma } from '../lib/prisma.js';
import { requireAuth, tenantReadClient } from '../middleware/tenant-context.js';
import { requireRole } from '../middleware/role-gates.js';
import { buildSummaryForSupervisor } from '../lib/services/summary-service.js';

export async function registerSupervisorSummaryRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/supervisor/summary',
    { preHandler: [requireAuth, requireRole('SUPERVISOR')] },
    async (req, reply) => {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED', message: 'No auth on request' });
        return;
      }

      try {
        // RLS Option-A + Cluster-1 latency fix together: tenantReadClient sets
        // the company GUC per query in its own batch tx — the five RLS models
        // this digest reads stay visible under axhy_app AND queries stay
        // parallel on the connection pool.
        const out = await buildSummaryForSupervisor(tenantReadClient(prisma, auth.companyId), {
          companyId: auth.companyId,
          userId: auth.userId,
        });
        reply.code(200).send(out);
      } catch (err) {
        req.log.error({ err }, 'GET /supervisor/summary failed');
        reply.code(500).send({ error: 'INTERNAL', message: 'Could not build Summary payload' });
      }
    },
  );
}
