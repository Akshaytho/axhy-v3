/**
 * POST /super-admin/companies
 *
 * Creates a new tenant (Company) and bootstraps its first OWNER in one
 * call — the entry point of customer onboarding. Before this, a tenant
 * could only be created by hand-editing the DB or running a seed script.
 *
 * Caller: SUPER_ADMIN. Tenant-exempt by design — SUPER_ADMIN tokens carry
 * no tenant context because this request CREATES the tenant. The owner
 * becomes loginable via OTP to ownerPhone immediately.
 *
 * @derives(ADR-0026)
 * @derives(docs/locked/hiring-hierarchy.md)
 */

import type { FastifyInstance } from 'fastify';
import { SuperAdminCreateCompanyInput } from '@axhy/shared-schema';

import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/tenant-context.js';
import { requireRole } from '../middleware/role-gates.js';
import { superAdminCreateCompanyService } from '../lib/services/super-admin-company-service.js';

// tenant-exempt: SUPER_ADMIN onboarding — this route CREATES the tenant, so
// no tenant context can exist yet (see "Tenant-exempt by design" header note).
/** @derives(ADR-0026) */
export async function registerSuperAdminCompanyRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/super-admin/companies',
    { preHandler: [requireAuth, requireRole('SUPER_ADMIN')] },
    async (req, reply) => {
      const auth = req.auth!;
      const parsed = SuperAdminCreateCompanyInput.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
        return;
      }

      // Onboarding is a rare, multi-step write (company + audit + user +
      // membership + audit = ~6 round-trips). Give it generous headroom above
      // Prisma's 5s interactive-transaction default so a latency spike can't
      // abort a half-finished onboarding.
      const out = await prisma.$transaction(
        (tx) =>
          superAdminCreateCompanyService(tx, {
            callerUserId: auth.userId,
            body: parsed.data,
          }),
        { timeout: 20_000, maxWait: 10_000 },
      );

      if (out.kind === 'SLUG_EXISTS') {
        reply.code(409).send({
          error: 'SLUG_EXISTS',
          message: `A company with slug "${out.slug}" already exists`,
        });
        return;
      }

      reply.send({
        companyId: out.companyId,
        slug: out.slug,
        ownerMembershipId: out.ownerMembershipId,
        ownerUserId: out.ownerUserId,
      });
    },
  );
}
