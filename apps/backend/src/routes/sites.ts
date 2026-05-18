/**
 * Site-scoped supervisor routes.
 *
 * POST /sites/:id/complaints   (NOTE tier, no confirm)
 *   Supervisor logs a complaint about a site (e.g., client called, area
 *   unclean, equipment missing). Inside one Prisma transaction:
 *     1. Verify site belongs to caller's company (RLS already protects;
 *        we double-check to return clean 404)
 *     2. Insert Complaint row
 *     3. Record AuditEvent (kind = SITE_COMPLAINT_LOGGED)
 *     4. Enqueue Outbox topic `hr.site_complaint`
 *
 *   The dispatcher (B.6) drains the outbox topic. No AI here.
 *   SiteState transitions on long-open complaints land in a future
 *   dispatcher cron (deferred — state strings only in Phase B).
 *
 * @derives(data-flow §5 — supervisor "Log complaint" NOTE-tier action)
 * @derives(panel-2026-05-08) — Phase B.5
 */

import type { FastifyInstance } from 'fastify';
import { LogComplaintInput } from '@axhy/shared-schema';
import type { LogComplaintOutput } from '@axhy/shared-schema';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
import { getEffectiveBinding } from '../lib/effective-responsibility.js';
import { createComplaintWithInitialMessage } from '../lib/services/complaint-service.js';

/**
 * Register site-scoped supervisor routes on the given Fastify app.
 *
 * @derives(ADR-0007) — JWT + tenant-context middleware
 * @derives(data-flow §5 — supervisor "Log complaint" action)
 */
export async function registerSitesRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { id: string } }>(
    '/sites/:id/complaints',
    { preHandler: requireAuth },
    async (req, reply) => {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED', message: 'No auth on request' });
        return;
      }

      const parsed = LogComplaintInput.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
        return;
      }

      const siteId = req.params.id;
      const { text, severity } = parsed.data;

      try {
        // Cluster H fix (P2, 2026-05-18): the direct-button route now
        // goes through the same `createComplaintWithInitialMessage`
        // service the chat tool-loop uses, so a complaint logged via
        // button has the same on-disk shape as one logged via chat
        // (Complaint row + initial supervisor ComplaintMessage + audit +
        // outbox, all in one tx). Previously the two paths drifted —
        // button-route complaints had zero ComplaintMessage rows so the
        // thread view rendered as empty.
        const out = await withTenantContext(prisma, auth.companyId, async (tx) =>
          createComplaintWithInitialMessage(tx, {
            companyId: auth.companyId,
            siteId,
            supervisorUserId: auth.userId,
            createdByUserId: auth.userId,
            text,
            severity,
            // Default kind for the direct-button route is `other` until
            // the supervisor UI exposes a kind picker. The chat tool-loop
            // sets kind explicitly via `propose_log_complaint`.
            kind: 'other',
            observedAt: null,
            origin: 'BUTTON',
          }),
        );

        if (out.kind === 'SITE_NOT_FOUND') {
          reply.code(404).send({
            error: 'SITE_NOT_FOUND',
            message: 'Site not found in this company',
          });
          return;
        }

        const result: LogComplaintOutput = {
          ok: true,
          complaintId: out.complaintId,
          siteId,
          severity,
          loggedBy: auth.userId,
          loggedAt: new Date().toISOString(),
        };
        reply.send(result);
      } catch (err) {
        req.log.error({ err }, 'log-complaint failed');
        reply.code(500).send({ error: 'INTERNAL', message: 'Could not log complaint' });
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /sites/:siteId/effective-supervisor
  //
  // Foundation read API for routing. Returns the binding currently effective
  // for the site at the requested instant, applying acting-over-permanent
  // precedence (responsibility-model §5.8).
  //
  // Query string:
  //   ?at=ISO8601  — point-in-time; defaults to now. Supports historical
  //                  attribution + future-dated cutover queries.
  //
  // Response:
  //   200 { bindingId, userId, kind, actingForUserId, effectiveFrom, effectiveUntil }
  //   404 { error: 'NO_EFFECTIVE_BINDING' }   ← site has no effective binding at `at`
  //   404 { error: 'SITE_NOT_FOUND' }         ← site missing in caller's tenant
  //
  // No existing read-time-routing consumer to rewire (none exists today);
  // this is a net-new foundation read API. Future Today/Decisions surfaces
  // route through getEffectiveBinding directly.
  //
  // @derives(supervisor-responsibility-model §5.5 + §5.8)
  // @derives(panel-2026-05-15) — Layer 1 routing slice
  // -------------------------------------------------------------------------
  app.get<{ Params: { siteId: string }; Querystring: { at?: string } }>(
    '/sites/:siteId/effective-supervisor',
    { preHandler: requireAuth },
    async (req, reply) => {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED', message: 'No auth on request' });
        return;
      }

      const { siteId } = req.params;

      let at: Date | undefined;
      if (req.query.at) {
        const parsed = new Date(req.query.at);
        if (Number.isNaN(parsed.getTime())) {
          reply.code(400).send({ error: 'BAD_INPUT', message: 'invalid ?at — expected ISO8601' });
          return;
        }
        at = parsed;
      }

      try {
        const out = await withTenantContext(prisma, auth.companyId, async (tx) => {
          // Tenant-scope check first — keep cross-tenant lookups indistinguishable
          // from missing-site lookups (no info leak).
          const site = await tx.site.findFirst({
            where: { id: siteId, companyId: auth.companyId },
            select: { id: true },
          });
          if (!site) return { kind: 'SITE_NOT_FOUND' as const };

          const binding = await getEffectiveBinding(tx, {
            companyId: auth.companyId,
            siteId,
            at,
          });
          if (!binding) return { kind: 'NO_EFFECTIVE_BINDING' as const };
          return { kind: 'OK' as const, binding };
        });

        if (out.kind === 'SITE_NOT_FOUND') {
          reply.code(404).send({ error: 'SITE_NOT_FOUND', message: 'Site not in this tenant' });
          return;
        }
        if (out.kind === 'NO_EFFECTIVE_BINDING') {
          reply.code(404).send({
            error: 'NO_EFFECTIVE_BINDING',
            message: 'No binding is effective at the requested instant',
          });
          return;
        }

        const b = out.binding;
        reply.send({
          bindingId: b.bindingId,
          userId: b.userId,
          kind: b.kind,
          actingForUserId: b.actingForUserId,
          effectiveFrom: b.effectiveFrom.toISOString(),
          effectiveUntil: b.effectiveUntil ? b.effectiveUntil.toISOString() : null,
        });
      } catch (err) {
        req.log.error({ err }, 'effective-supervisor lookup failed');
        reply.code(500).send({ error: 'INTERNAL', message: 'Could not resolve effective binding' });
      }
    },
  );
}
