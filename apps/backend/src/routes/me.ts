/**
 * GET /me
 *
 * Returns the authenticated user's profile + active company + all memberships.
 * Mobile + admin call this on every screen mount to confirm session health.
 *
 * @derives(ADR-0007)
 */

import type { FastifyInstance } from 'fastify';
import type { MeOutput, Role } from '@axhy/shared-schema';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';

export async function registerMeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/me', { preHandler: requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) {
      reply.code(401).send({ error: 'AUTH_REQUIRED', message: 'No auth on request' });
      return;
    }

    const out = await withTenantContext(prisma, auth.companyId, async (tx) => {
      const user = await tx.user.findUnique({ where: { id: auth.userId } });
      const company = await tx.company.findUnique({ where: { id: auth.companyId } });
      const memberships = await tx.membership.findMany({
        where: { userId: auth.userId, status: 'ACTIVE' },
        include: { company: true },
      });

      if (!user || !company) {
        throw new Error('User or company not found inside tenant context');
      }

      const result: MeOutput = {
        user: {
          id: user.id,
          phone: user.phone,
          name: user.name,
          locale: user.locale,
        },
        activeCompany: {
          id: company.id,
          name: company.name,
          slug: company.slug,
        },
        activeRole: auth.role,
        availableRoles: [...auth.availableRoles],
        memberships: memberships.map((m) => ({
          companyId: m.companyId,
          companyName: m.company.name,
          role: m.role as Role,
        })),
      };
      return result;
    });

    reply.send(out);
  });
}
