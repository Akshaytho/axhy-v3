/**
 * GET /supervisor/activity — read-only feed of the caller's audit events.
 *
 * JWT-implicit via `requireAuth`; never accepts `companyId` from the
 * client. Wrapped in `withTenantContext` for RLS. Accepts an optional
 * `?limit=` query (1..200, default 50). Authorization is implicit: the
 * service reads AuditEvent rows where actorId = caller, so a supervisor
 * never sees someone else's activity.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 * @derives(panel-2026-05-17) — Activity slice
 */

import type { FastifyInstance } from 'fastify';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
import { buildActivityForSupervisor } from '../lib/services/activity-service.js';

export async function registerSupervisorActivityRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { limit?: string } }>(
    '/supervisor/activity',
    { preHandler: requireAuth },
    async (req, reply) => {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED', message: 'No auth on request' });
        return;
      }

      const parsedLimit = req.query.limit ? Number.parseInt(req.query.limit, 10) : undefined;
      const limit =
        parsedLimit !== undefined && Number.isFinite(parsedLimit) ? parsedLimit : undefined;

      try {
        const out = await withTenantContext(prisma, auth.companyId, async (tx) =>
          buildActivityForSupervisor(tx, {
            companyId: auth.companyId,
            userId: auth.userId,
            limit,
          }),
        );
        reply.code(200).send(out);
      } catch (err) {
        req.log.error({ err }, 'GET /supervisor/activity failed');
        reply.code(500).send({ error: 'INTERNAL', message: 'Could not build activity feed' });
      }
    },
  );
}
