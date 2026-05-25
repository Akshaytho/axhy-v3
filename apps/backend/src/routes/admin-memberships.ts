/**
 * POST /admin/memberships (R1)
 *
 * Caller: OWNER or HR.
 * Target: HR (OWNER only) or SUPERVISOR (HR only). Enforced via
 * assertTargetRole against the locked HIRING_AUTHORITY table.
 *
 * @derives(ADR-0026)
 * @derives(ADR-0025)
 * @derives(docs/locked/hiring-hierarchy.md)
 */

import type { FastifyInstance } from 'fastify';
import { AdminCreateMembershipInput } from '@axhy/shared-schema';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
import { requireRole } from '../middleware/role-gates.js';
import { adminCreateMembershipService } from '../lib/services/admin-membership-service.js';

/** @derives(ADR-0026) */
export async function registerAdminMembershipRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/admin/memberships',
    { preHandler: [requireAuth, requireRole('OWNER', 'HR')] },
    async (req, reply) => {
      const auth = req.auth!;
      const parsed = AdminCreateMembershipInput.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
        return;
      }

      const out = await withTenantContext(prisma, auth.companyId, async (tx) =>
        adminCreateMembershipService(tx, {
          callerRole: auth.role,
          callerCompanyId: auth.companyId,
          callerUserId: auth.userId,
          body: parsed.data,
        }),
      );

      if (out.kind === 'FORBIDDEN_TARGET_ROLE') {
        reply.code(403).send({
          error: 'FORBIDDEN_TARGET_ROLE',
          message: `Role ${out.callerRole} cannot create members of role ${out.targetRole}`,
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
        role: out.role,
        status: 'ACTIVE',
      });
    },
  );
}
