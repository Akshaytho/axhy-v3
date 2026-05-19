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

    // tenant-exempt: read-only parallel queries, no writes.
    // Latency fix (Cluster 1, 2026-05-18): bare prisma → parallel dispatch.
    // /me was 7.5s with tx; ~1 RTT without.
    // learned-ok: intentional Promise.all — /me is foundational, mobile
    // app calls it on every screen mount and depends on ALL three rows;
    // partial-degradation here would mask real errors (e.g. orphan user
    // with no company) that should surface as 404 not silent-success.
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
