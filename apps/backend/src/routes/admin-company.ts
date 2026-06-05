/**
 * GET /admin/owner-summary
 *
 * Scopes to the caller's company context and returns metrics and settings
 * for the Owner/Admin dashboard.
 *
 * @derives(master-plan §G)
 * @derives(office_profiles_specification.md)
 */

import type { FastifyInstance } from 'fastify';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
import { requireRole } from '../middleware/role-gates.js';
import { startOfISTDay } from '../lib/ist-date.js';

/**
 * Register company/owner summary routes.
 *
 * @derives(master-plan §G)
 */
export async function registerAdminCompanyRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/admin/owner-summary',
    { preHandler: [requireAuth, requireRole('OWNER', 'SUPER_ADMIN')] },
    async (req, reply) => {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED', message: 'No auth on request' });
        return;
      }

      try {
        const today = startOfISTDay();

        const {
          company,
          activeWorkers,
          activeSites,
          absentWorkersToday,
          pendingReviews,
          policies,
        } = await withTenantContext(prisma, auth.companyId, async (tx) => {
          const [
            company,
            activeWorkers,
            activeSites,
            absentWorkersToday,
            pendingReviews,
            policies,
          ] = await Promise.all([
            tx.company.findUnique({
              where: { id: auth.companyId },
              select: {
                id: true,
                name: true,
                slug: true,
                status: true,
                aiSpendDailyInr: true,
                createdAt: true,
              },
            }),
            tx.worker.count({
              where: { companyId: auth.companyId, state: 'ACTIVE' },
            }),
            tx.site.count({
              where: { companyId: auth.companyId, state: 'ACTIVE' },
            }),
            tx.attendance.count({
              where: {
                companyId: auth.companyId,
                date: today,
                status: { in: ['ABSENT_NO_CALL', 'ABSENT_APPROVED_LEAVE'] },
              },
            }),
            tx.visit.count({
              where: { companyId: auth.companyId, flagged: true },
            }),
            tx.policy.findMany({
              where: { companyId: auth.companyId },
              orderBy: { setAt: 'desc' },
            }),
          ]);
          return {
            company,
            activeWorkers,
            activeSites,
            absentWorkersToday,
            pendingReviews,
            policies,
          };
        });

        if (!company) {
          reply.code(404).send({ error: 'COMPANY_NOT_FOUND', message: 'Company not found' });
          return;
        }

        // Deduplicate policies by key, keeping the most recent setAt
        const activePoliciesMap: Record<
          string,
          {
            id: string;
            key: string;
            value: unknown;
            category: string;
            setAt: string;
          }
        > = {};

        for (const p of policies) {
          if (!(p.key in activePoliciesMap)) {
            activePoliciesMap[p.key] = {
              id: p.id,
              key: p.key,
              value: p.value,
              category: p.category,
              setAt: p.setAt.toISOString(),
            };
          }
        }

        reply.code(200).send({
          company: {
            id: company.id,
            name: company.name,
            slug: company.slug,
            status: company.status,
            aiSpendDailyInr: company.aiSpendDailyInr.toString(),
            createdAt: company.createdAt.toISOString(),
          },
          stats: {
            activeWorkers,
            activeSites,
            absentWorkersToday,
            pendingReviews,
          },
          policies: Object.values(activePoliciesMap),
        });
      } catch (err) {
        req.log.error({ err }, 'GET /admin/owner-summary failed');
        reply.code(500).send({ error: 'INTERNAL', message: 'Could not fetch owner summary data' });
      }
    },
  );
}
