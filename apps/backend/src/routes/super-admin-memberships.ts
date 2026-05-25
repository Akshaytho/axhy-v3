/**
 * POST /super-admin/memberships
 *
 * Bootstraps the first OWNER of a tenant. The 5 wave-2 admin routes all
 * require OWNER or HR auth, so production needs this endpoint to seed
 * the hierarchy after a company is created.
 *
 * Caller: SUPER_ADMIN.
 * Target: OWNER (implicit — only role SUPER_ADMIN may create per
 * HIRING_AUTHORITY in docs/locked/hiring-hierarchy.md).
 *
 * companyId is supplied in the request body — SUPER_ADMIN tokens carry
 * no tenant context. The service verifies the company exists and is
 * ACTIVE before creating the membership.
 *
 * @derives(ADR-0026)
 * @derives(docs/locked/hiring-hierarchy.md)
 */

import type { FastifyInstance } from 'fastify';
import { SuperAdminCreateMembershipInput } from '@axhy/shared-schema';

import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/tenant-context.js';
import { requireRole } from '../middleware/role-gates.js';
import { superAdminCreateOwnerService } from '../lib/services/super-admin-owner-service.js';

// tenant-exempt: SUPER_ADMIN bootstraps tenants — companyId travels in the
// body, not auth context. withTenantContext would 0-row this by design.

/** @derives(ADR-0026) */
export async function registerSuperAdminMembershipRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/super-admin/memberships',
    { preHandler: [requireAuth, requireRole('SUPER_ADMIN')] },
    async (req, reply) => {
      const auth = req.auth!;
      const parsed = SuperAdminCreateMembershipInput.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
        return;
      }

      const out = await prisma.$transaction((tx) =>
        superAdminCreateOwnerService(tx, {
          callerUserId: auth.userId,
          body: parsed.data,
        }),
      );

      if (out.kind === 'FORBIDDEN_TARGET_ROLE') {
        reply.code(403).send({
          error: 'FORBIDDEN_TARGET_ROLE',
          message: 'SUPER_ADMIN is no longer permitted to create OWNER per HIRING_AUTHORITY',
        });
        return;
      }
      if (out.kind === 'COMPANY_NOT_FOUND') {
        reply.code(404).send({
          error: 'COMPANY_NOT_FOUND',
          message: `No company with id ${parsed.data.companyId}`,
        });
        return;
      }
      if (out.kind === 'COMPANY_NOT_ACTIVE') {
        reply.code(409).send({
          error: 'COMPANY_NOT_ACTIVE',
          message: `Company is in status ${out.status}; OWNER bootstrap requires ACTIVE`,
        });
        return;
      }
      if (out.kind === 'ALREADY_EXISTS') {
        reply.code(409).send({
          error: 'MEMBERSHIP_ALREADY_EXISTS',
          message: 'A membership with this phone and role already exists in this company',
        });
        return;
      }
      reply.send({
        membershipId: out.membershipId,
        userId: out.userId,
        companyId: out.companyId,
        role: 'OWNER',
        status: 'ACTIVE',
      });
    },
  );
}
