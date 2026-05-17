/**
 * Supervisor Summary route.
 *
 *   GET /supervisor/summary
 *     Returns the supervisor's end-of-day digest payload at request time.
 *     JWT-implicit; never accepts `companyId` from the client. `userId` is
 *     taken from `req.auth.userId` and used both for tenant scoping (via
 *     `withTenantContext`) and portfolio resolution (via
 *     `buildSummaryForSupervisor` → `getSitesSupervisedByUser`).
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
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
import { buildSummaryForSupervisor } from '../lib/services/summary-service.js';

export async function registerSupervisorSummaryRoutes(app: FastifyInstance): Promise<void> {
  app.get('/supervisor/summary', { preHandler: requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) {
      reply.code(401).send({ error: 'AUTH_REQUIRED', message: 'No auth on request' });
      return;
    }

    try {
      const out = await withTenantContext(prisma, auth.companyId, async (tx) =>
        buildSummaryForSupervisor(tx, {
          companyId: auth.companyId,
          userId: auth.userId,
        }),
      );
      reply.code(200).send(out);
    } catch (err) {
      req.log.error({ err }, 'GET /supervisor/summary failed');
      reply.code(500).send({ error: 'INTERNAL', message: 'Could not build Summary payload' });
    }
  });
}
