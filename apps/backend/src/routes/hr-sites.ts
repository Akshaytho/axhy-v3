/**
 * GET /hr/sites/:id — HR Site detail (read-only).
 *
 * One owned site + everything its detail screen renders, from stored data:
 *   - site:     name, state, address, geo, workdays, createdAt
 *   - today:    assigned / present / absent / uncovered (today's attendance)
 *   - roster:   workers with a live assignment (name, phone, status, state)
 *   - bindings: supervisors (permanent/acting, effective window, ended)
 *
 * Auth: requireRole(OWNER, HR). HR sees only sites they own (404 otherwise —
 * never leak existence). Reads in withTenantRead. Read-only.
 *
 * @derives(_design-handoff/axhy-hr-v6 sites.jsx SiteDetail)
 */
import type { FastifyInstance } from 'fastify';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantRead } from '../middleware/tenant-context.js';
import { requireRole } from '../middleware/role-gates.js';

function todayUtcMidnight(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

/**
 * Registers the HR site detail route.
 * @derives(master-plan §G)
 */
export async function registerHrSiteDetailRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>(
    '/hr/sites/:id',
    { preHandler: [requireAuth, requireRole('OWNER', 'HR')] },
    async (req, reply) => {
      const auth = req.auth!;
      const dayStart = todayUtcMidnight();

      const out = await withTenantRead(prisma, auth.companyId, async (tx) => {
        const site = await tx.site.findFirst({
          where:
            auth.role === 'HR'
              ? { id: req.params.id, companyId: auth.companyId, ownerHrUserId: auth.userId }
              : { id: req.params.id, companyId: auth.companyId },
          select: {
            id: true,
            name: true,
            state: true,
            address: true,
            latitude: true,
            longitude: true,
            workdays: true,
            createdAt: true,
          },
        });
        if (!site) return null;

        const asg = await tx.assignment.findMany({
          where: { companyId: auth.companyId, siteId: site.id, state: { in: ['ACTIVE', 'DRAFT'] } },
          select: { workerId: true, state: true },
        });
        const workerIds = [...new Set(asg.map((a) => a.workerId))];

        const [workers, attRows, bindings] = await Promise.all([
          tx.worker.findMany({
            where: { companyId: auth.companyId, id: { in: workerIds } },
            select: { id: true, name: true, phone: true, state: true, userId: true },
          }),
          tx.attendance.findMany({
            where: { companyId: auth.companyId, workerId: { in: workerIds }, date: dayStart },
            select: { workerId: true, status: true },
          }),
          tx.siteSupervisorBinding.findMany({
            where: { companyId: auth.companyId, siteId: site.id },
            orderBy: { effectiveFrom: 'desc' },
            select: {
              id: true,
              actingForUserId: true,
              effectiveFrom: true,
              effectiveUntil: true,
              endedAt: true,
              supervisor: { select: { name: true, phone: true } },
            },
          }),
        ]);

        // Worker membership status (anonymized via phone prefix).
        const userIds = workers.map((w) => w.userId).filter((x): x is string => !!x);
        const memberships = await tx.membership.findMany({
          where: { companyId: auth.companyId, role: 'WORKER', userId: { in: userIds } },
          select: { userId: true, status: true },
        });
        const statusByUser = new Map(memberships.map((m) => [m.userId, m.status]));
        const present = attRows.filter(
          (a) => a.status === 'PRESENT' || a.status === 'HALF_DAY',
        ).length;
        const absentNoCall = attRows.filter((a) => a.status === 'ABSENT_NO_CALL').length;

        return {
          site: {
            id: site.id,
            name: site.name,
            state: site.state,
            address: site.address,
            latitude: site.latitude ? String(site.latitude) : null,
            longitude: site.longitude ? String(site.longitude) : null,
            workdays: site.workdays,
            createdAt: site.createdAt.toISOString(),
          },
          today: { assigned: asg.length, present, absentNoCall, uncovered: absentNoCall },
          roster: workers
            .filter((w) => !w.phone.startsWith('anon:') && w.state !== 'TERMINATED')
            .map((w) => ({
              workerId: w.id,
              name: w.name,
              phone: w.phone,
              status: (w.userId && statusByUser.get(w.userId)) || 'ACTIVE',
              state: w.state,
            }))
            .sort((a, b) => a.name.localeCompare(b.name)),
          bindings: bindings.map((b) => ({
            id: b.id,
            name: b.supervisor?.name ?? 'Supervisor',
            phone: b.supervisor?.phone ?? '',
            type: b.actingForUserId ? 'Acting' : 'Permanent',
            from: b.effectiveFrom.toISOString(),
            until: b.effectiveUntil ? b.effectiveUntil.toISOString() : null,
            ended: b.endedAt ? b.endedAt.toISOString() : null,
          })),
        };
      });

      if (!out) {
        reply.code(404).send({ error: 'SITE_NOT_FOUND' });
        return;
      }
      reply.send(out);
    },
  );
}
