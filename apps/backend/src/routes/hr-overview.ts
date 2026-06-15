/**
 * GET /hr/overview — HR dashboard aggregation (read-only).
 *
 * Returns everything the HR home screen renders, from already-stored data:
 *   - counts: pending leave + open complaints (HR-site-scoped)
 *   - today:  on-site / no-show / on-leave (today's attendance) + flagged (today's visits)
 *   - visits: today's verified / flagged / total
 *   - sites:  owned sites + worker & supervisor counts
 *   - activity: most recent audit events
 *
 * Auth: requireRole(OWNER, HR). HR is scoped to owned sites via Site.ownerHrUserId;
 * OWNER sees the whole tenant. All reads run inside withTenantRead (RLS GUC).
 * Read-only — no writes, no schema or state-machine changes.
 *
 * @derives(_design-handoff/AXHY-HR-Portal-FINISH-ALL-REMAINING.md PART 11)
 */
import type { FastifyInstance } from 'fastify';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantRead } from '../middleware/tenant-context.js';
import { requireRole } from '../middleware/role-gates.js';

/** UTC midnight of "today" — matches how Attendance.date / Visit.scheduledFor are stored. */
function todayUtcMidnight(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

/**
 * Registers the HR overview route.
 * @derives(master-plan §G)
 */
export async function registerHrOverviewRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/hr/overview',
    { preHandler: [requireAuth, requireRole('OWNER', 'HR')] },
    async (req, reply) => {
      const auth = req.auth!;
      const dayStart = todayUtcMidnight();

      const out = await withTenantRead(prisma, auth.companyId, async (tx) => {
        // Owned sites (HR) or all sites (OWNER).
        const sites = await tx.site.findMany({
          where:
            auth.role === 'HR'
              ? { companyId: auth.companyId, ownerHrUserId: auth.userId }
              : { companyId: auth.companyId },
          select: { id: true, name: true, state: true },
          orderBy: { createdAt: 'asc' },
        });
        const siteIds = sites.map((s) => s.id);

        // Workers with a live assignment to those sites.
        const asg = await tx.assignment.findMany({
          where: {
            companyId: auth.companyId,
            siteId: { in: siteIds },
            state: { in: ['ACTIVE', 'DRAFT'] },
          },
          select: { workerId: true, siteId: true },
        });
        const workerIds = [...new Set(asg.map((a) => a.workerId))];

        const [leaveRows, complaintRows, attGroups, visitGroups, bindings, activity] =
          await Promise.all([
            tx.leaveRequest.findMany({
              where: { companyId: auth.companyId, state: 'REQUESTED', workerId: { in: workerIds } },
              select: { createdAt: true },
            }),
            tx.complaint.findMany({
              where: {
                companyId: auth.companyId,
                siteId: { in: siteIds },
                state: { in: ['OPEN', 'IN_HR'] },
              },
              select: { createdAt: true, severity: true },
            }),
            tx.attendance.groupBy({
              by: ['status'],
              where: { companyId: auth.companyId, workerId: { in: workerIds }, date: dayStart },
              _count: { _all: true },
            }),
            tx.visit.groupBy({
              by: ['state'],
              where: {
                companyId: auth.companyId,
                siteId: { in: siteIds },
                scheduledFor: { gte: dayStart },
              },
              _count: { _all: true },
            }),
            tx.siteSupervisorBinding.groupBy({
              by: ['siteId'],
              where: { companyId: auth.companyId, siteId: { in: siteIds }, endedAt: null },
              _count: { _all: true },
            }),
            tx.auditEvent.findMany({
              // Exclude auth/session noise so the feed shows meaningful HR activity.
              where: { companyId: auth.companyId, NOT: { kind: { startsWith: 'AUTH_' } } },
              orderBy: { createdAt: 'desc' },
              take: 6,
              select: {
                id: true,
                kind: true,
                actorId: true,
                targetId: true,
                payload: true,
                createdAt: true,
              },
            }),
          ]);

        const att = (s: string) => attGroups.find((g) => g.status === s)?._count._all ?? 0;
        const vis = (s: string) => visitGroups.find((g) => g.state === s)?._count._all ?? 0;
        const visitsTotal = visitGroups.reduce((n, g) => n + g._count._all, 0);
        const oldest = (ds: Date[]) =>
          ds.length ? ds.reduce((a, b) => (a < b ? a : b)).toISOString() : null;

        const workersBySite = new Map<string, number>();
        for (const a of asg) workersBySite.set(a.siteId, (workersBySite.get(a.siteId) ?? 0) + 1);
        const supsBySite = new Map<string, number>();
        for (const g of bindings) supsBySite.set(g.siteId, g._count._all);

        return {
          counts: {
            leave: leaveRows.length,
            complaints: complaintRows.length,
            oldestLeaveAt: oldest(leaveRows.map((r) => r.createdAt)),
            oldestComplaintAt: oldest(complaintRows.map((r) => r.createdAt)),
            hasHighComplaint: complaintRows.some(
              (c) => c.severity === 'HIGH' || c.severity === 'URGENT',
            ),
          },
          today: {
            onSite: att('PRESENT'),
            noShow: att('ABSENT_NO_CALL'),
            onLeave: att('ABSENT_APPROVED_LEAVE'),
            flagged: vis('FLAGGED'),
          },
          visits: { verified: vis('VERIFIED'), flagged: vis('FLAGGED'), total: visitsTotal },
          sites: sites.map((s) => ({
            id: s.id,
            name: s.name,
            state: s.state,
            workers: workersBySite.get(s.id) ?? 0,
            supervisors: supsBySite.get(s.id) ?? 0,
          })),
          activity: activity.map((e) => ({
            id: e.id,
            kind: e.kind,
            actorId: e.actorId,
            targetId: e.targetId,
            payload: e.payload,
            createdAt: e.createdAt.toISOString(),
          })),
        };
      });

      reply.send(out);
    },
  );
}
