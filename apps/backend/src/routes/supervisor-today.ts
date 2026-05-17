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
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
import { buildTodayForSupervisor } from '../lib/services/today-service.js';

export async function registerSupervisorTodayRoutes(app: FastifyInstance): Promise<void> {
  app.get('/supervisor/today', { preHandler: requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) {
      reply.code(401).send({ error: 'AUTH_REQUIRED', message: 'No auth on request' });
      return;
    }

    try {
      const out = await withTenantContext(prisma, auth.companyId, async (tx) =>
        buildTodayForSupervisor(tx, {
          companyId: auth.companyId,
          userId: auth.userId,
        }),
      );
      reply.code(200).send(out);
    } catch (err) {
      req.log.error({ err }, 'GET /supervisor/today failed');
      reply.code(500).send({ error: 'INTERNAL', message: 'Could not build Today payload' });
    }
  });
}
