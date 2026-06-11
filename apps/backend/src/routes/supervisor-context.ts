/**
 * Supervisor Context route.
 *
 *   GET /supervisor/context
 *     Returns `{ sitesActive, workersActive }` for the calling supervisor.
 *     JWT-implicit via `requireAuth`; never accepts `companyId` from the
 *     client. Both counts are portfolio-scoped to the caller at request time.
 *
 * Pattern mirrors `supervisor-today.ts` — preHandler auth, tenant tx,
 * domain composition.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */

import type { FastifyInstance } from 'fastify';

import { prisma } from '../lib/prisma.js';
import { requireAuth, tenantReadClient } from '../middleware/tenant-context.js';
import { requireRole } from '../middleware/role-gates.js';
import { buildSupervisorContext } from '../lib/services/supervisor-context-service.js';

/**
 * Register GET /supervisor/context.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */
export async function registerSupervisorContextRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/supervisor/context',
    { preHandler: [requireAuth, requireRole('SUPERVISOR')] },
    async (req, reply) => {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED', message: 'No auth on request' });
        return;
      }

      try {
        // RLS Option-A: tenantReadClient sets the company GUC per query in its
        // own batch tx — Assignment/SiteSupervisorBinding reads pass RLS under
        // axhy_app while parallel query dispatch is preserved.
        const out = await buildSupervisorContext(tenantReadClient(prisma, auth.companyId), {
          companyId: auth.companyId,
          userId: auth.userId,
        });
        reply.code(200).send(out);
      } catch (err) {
        req.log.error({ err }, 'GET /supervisor/context failed');
        reply.code(500).send({ error: 'INTERNAL', message: 'Could not build supervisor context' });
      }
    },
  );
}
