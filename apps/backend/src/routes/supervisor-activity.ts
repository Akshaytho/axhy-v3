/**
 * GET /supervisor/activity — read-only feed of the caller's audit events.
 *
 * JWT-implicit via `requireAuth`; never accepts `companyId` from the
 * client. RLS via `tenantReadClient` — every query carries the company GUC
 * in its own batch transaction, keeping pool parallelism (Cluster 1).
 *
 * Accepted query params:
 *   `?limit=`    — page size (1..200, default 50)
 *   `?date=`     — `today` | `yesterday` | `this-week` | `all` (default `today`)
 *   `?siteId=`   — UUID | `all` (default `all`)
 *   `?kind=`     — `all` | `absences` | `lates` | `leaves` (default `all`)
 *
 * Authorization is implicit: the service reads AuditEvent rows where
 * actorId = caller, so a supervisor never sees someone else's activity.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 * @derives(panel-2026-05-17) — Activity slice
 */

import type { FastifyInstance } from 'fastify';

import { prisma } from '../lib/prisma.js';
import { requireAuth, tenantReadClient } from '../middleware/tenant-context.js';
import { requireRole } from '../middleware/role-gates.js';
import {
  buildActivityForSupervisor,
  type DateFilter,
  type KindFilter,
} from '../lib/services/activity-service.js';

/** Valid values for the `?date=` query param. */
const DATE_FILTER_VALUES: ReadonlySet<string> = new Set(['today', 'yesterday', 'this-week', 'all']);

/** Valid values for the `?kind=` query param. */
const KIND_FILTER_VALUES: ReadonlySet<string> = new Set(['all', 'absences', 'lates', 'leaves']);

/** @derives(ADR-0003) — query string shape for `GET /supervisor/activity`. */
type ActivityQuerystring = {
  limit?: string;
  date?: string;
  siteId?: string;
  kind?: string;
};

/**
 * Register `GET /supervisor/activity` with filter query params.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */
export async function registerSupervisorActivityRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: ActivityQuerystring }>(
    '/supervisor/activity',
    { preHandler: [requireAuth, requireRole('SUPERVISOR')] },
    async (req, reply) => {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED', message: 'No auth on request' });
        return;
      }

      // --- limit ---
      const parsedLimit = req.query.limit ? Number.parseInt(req.query.limit, 10) : undefined;
      const limit =
        parsedLimit !== undefined && Number.isFinite(parsedLimit) ? parsedLimit : undefined;

      // --- date filter ---
      const rawDate = req.query.date ?? 'today';
      const dateFilter: DateFilter = DATE_FILTER_VALUES.has(rawDate)
        ? (rawDate as DateFilter)
        : 'today';

      // --- siteId filter ---
      // Accept any non-empty string; 'all' means no filter.
      const siteIdFilter = req.query.siteId?.trim() || 'all';

      // --- kind filter ---
      const rawKind = req.query.kind ?? 'all';
      const kindFilter: KindFilter = KIND_FILTER_VALUES.has(rawKind)
        ? (rawKind as KindFilter)
        : 'all';

      try {
        // RLS Option-A + Cluster-1 latency fix together: tenantReadClient sets
        // the company GUC per query in its own batch tx, so AuditEvent reads
        // pass RLS under axhy_app while staying parallel on the pool.
        const out = await buildActivityForSupervisor(tenantReadClient(prisma, auth.companyId), {
          companyId: auth.companyId,
          userId: auth.userId,
          limit,
          dateFilter,
          siteIdFilter,
          kindFilter,
        });
        reply.code(200).send(out);
      } catch (err) {
        req.log.error({ err }, 'GET /supervisor/activity failed');
        reply.code(500).send({ error: 'INTERNAL', message: 'Could not build activity feed' });
      }
    },
  );
}
