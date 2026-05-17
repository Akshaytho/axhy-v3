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
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
import { buildSupervisorContext } from '../lib/services/supervisor-context-service.js';

/**
 * Register GET /supervisor/context.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */
export async function registerSupervisorContextRoutes(app: FastifyInstance): Promise<void> {
  app.get('/supervisor/context', { preHandler: requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) {
      reply.code(401).send({ error: 'AUTH_REQUIRED', message: 'No auth on request' });
      return;
    }

    try {
      const out = await withTenantContext(prisma, auth.companyId, async (tx) =>
        buildSupervisorContext(tx, {
          companyId: auth.companyId,
          userId: auth.userId,
        }),
      );
      reply.code(200).send(out);
    } catch (err) {
      req.log.error({ err }, 'GET /supervisor/context failed');
      reply.code(500).send({ error: 'INTERNAL', message: 'Could not build supervisor context' });
    }
  });
}
