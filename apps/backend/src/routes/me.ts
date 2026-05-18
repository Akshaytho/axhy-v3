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
import { requireAuth } from '../middleware/tenant-context.js';

export async function registerMeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/me', { preHandler: requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) {
      reply.code(401).send({ error: 'AUTH_REQUIRED', message: 'No auth on request' });
      return;
    }

    // Read-path latency fix (Cluster 1, QA-walkthrough 2026-05-18): drop
    // the transaction wrapper. Bare `prisma` lets the 3 queries below
    // dispatch in parallel via the connection pool instead of serialising
    // on a single tx connection. /me was 7.5s pre-fix; with parallel
    // dispatch it falls to ~1 RTT to Railway.
    const [user, company, memberships] = await Promise.all([
      prisma.user.findUnique({ where: { id: auth.userId } }),
      prisma.company.findUnique({ where: { id: auth.companyId } }),
      prisma.membership.findMany({
        where: { userId: auth.userId, status: 'ACTIVE' },
        include: { company: true },
      }),
    ]);

    if (!user || !company) {
      reply.code(404).send({ error: 'NOT_FOUND', message: 'User or company not found' });
      return;
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
    reply.send(result);
  });
}
