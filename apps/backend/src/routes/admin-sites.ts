/**
 * /admin/sites/* routes (R4 + R5).
 *
 * - POST /admin/sites               (R4) — OWNER or HR creates Site
 * - POST /admin/sites/:id/bindings  (R5) — OWNER or HR binds Supervisor to Site
 *
 * @derives(ADR-0026)
 * @derives(ADR-0003)
 * @derives(docs/locked/hiring-hierarchy.md)
 */

import type { FastifyInstance } from 'fastify';
import { AdminCreateSiteInput, AdminCreateBindingInput } from '@axhy/shared-schema';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
import { requireRole } from '../middleware/role-gates.js';
import {
  adminCreateSiteService,
  adminCreateBindingService,
} from '../lib/services/admin-site-service.js';

/** @derives(ADR-0026) */
export async function registerAdminSiteRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/admin/sites',
    { preHandler: [requireAuth, requireRole('OWNER', 'HR')] },
    async (req, reply) => {
      const auth = req.auth!;
      const parsed = AdminCreateSiteInput.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
        return;
      }
      const out = await withTenantContext(prisma, auth.companyId, async (tx) =>
        adminCreateSiteService(tx, {
          callerCompanyId: auth.companyId,
          callerUserId: auth.userId,
          body: parsed.data,
        }),
      );
      reply.send({ siteId: out.siteId, state: 'DRAFT' });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/admin/sites/:id/bindings',
    { preHandler: [requireAuth, requireRole('OWNER', 'HR')] },
    async (req, reply) => {
      const auth = req.auth!;
      const parsed = AdminCreateBindingInput.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
        return;
      }
      const out = await withTenantContext(prisma, auth.companyId, async (tx) =>
        adminCreateBindingService(tx, {
          siteId: req.params.id,
          callerCompanyId: auth.companyId,
          callerUserId: auth.userId,
          body: parsed.data,
        }),
      );
      if (out.kind === 'SITE_NOT_FOUND') {
        reply
          .code(404)
          .send({ error: 'SITE_NOT_FOUND', message: 'Site not found in this company' });
        return;
      }
      if (out.kind === 'SUPERVISOR_NOT_FOUND') {
        reply.code(404).send({
          error: 'SUPERVISOR_NOT_FOUND',
          message: 'Supervisor with that userId is not an active member of this company',
        });
        return;
      }
      reply.send({ bindingId: out.bindingId });
    },
  );
}
