/**
 * GET /hr/today — HR "Today board" coverage (read-only).
 *
 * Live coverage across the HR's owned sites, computed from data already stored:
 *   - pulse:   on-site / running-late / no-show / on-leave / flagged totals
 *   - sites:   per-site assigned / present / absent / on-leave / uncovered / flagged
 *   - noShows: workers absent (no call) today, with their site + supervisor
 *
 * Auth: requireRole(OWNER, HR). HR scoped to owned sites via Site.ownerHrUserId.
 * All reads inside withTenantRead (RLS GUC). Read-only — no writes.
 *
 * "Today" = UTC midnight, matching how Attendance.date / Visit.scheduledFor are
 * stored. "Uncovered" = no-call absences (each is an open gap until a
 * replacement is booked; replacement-invite data refines this in a later slice).
 * "Running late" is 0 until per-shift lateness tracking ships — there is no
 * stored "late" attendance status today, so we report the honest 0.
 *
 * @derives(_design-handoff/axhy-hr-v6 ops.jsx TodayScreen)
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
 * Registers the HR today route.
 * @derives(master-plan §G)
 */
export async function registerHrTodayRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/hr/today',
    { preHandler: [requireAuth, requireRole('OWNER', 'HR')] },
    async (req, reply) => {
      const auth = req.auth!;
      const dayStart = todayUtcMidnight();

      const out = await withTenantRead(prisma, auth.companyId, async (tx) => {
        const sites = await tx.site.findMany({
          where:
            auth.role === 'HR'
              ? { companyId: auth.companyId, ownerHrUserId: auth.userId }
              : { companyId: auth.companyId },
          select: { id: true, name: true },
          orderBy: { createdAt: 'asc' },
        });
        const siteIds = sites.map((s) => s.id);

        const [asg, bindings] = await Promise.all([
          tx.assignment.findMany({
            where: { companyId: auth.companyId, siteId: { in: siteIds }, state: 'ACTIVE' },
            select: { workerId: true, siteId: true, shiftStart: true },
          }),
          tx.siteSupervisorBinding.findMany({
            where: { companyId: auth.companyId, siteId: { in: siteIds }, endedAt: null },
            select: { siteId: true, actingForUserId: true, supervisor: { select: { name: true } } },
          }),
        ]);
        const workerIds = [...new Set(asg.map((a) => a.workerId))];

        const [attRows, flaggedVisits, workers] = await Promise.all([
          tx.attendance.findMany({
            where: { companyId: auth.companyId, workerId: { in: workerIds }, date: dayStart },
            select: { workerId: true, status: true },
          }),
          tx.visit.groupBy({
            by: ['siteId'],
            where: {
              companyId: auth.companyId,
              siteId: { in: siteIds },
              scheduledFor: { gte: dayStart },
              state: 'FLAGGED',
            },
            _count: { _all: true },
          }),
          tx.worker.findMany({
            where: { companyId: auth.companyId, id: { in: workerIds } },
            select: { id: true, name: true },
          }),
        ]);

        const statusByWorker = new Map(attRows.map((a) => [a.workerId, a.status]));
        const nameByWorker = new Map(workers.map((w) => [w.id, w.name]));
        const siteName = new Map(sites.map((s) => [s.id, s.name]));
        const flaggedBySite = new Map(flaggedVisits.map((g) => [g.siteId, g._count._all]));

        // Prefer the permanent supervisor (actingForUserId null) per site.
        const supBySite = new Map<string, string>();
        for (const b of bindings) {
          if (!supBySite.has(b.siteId) || b.actingForUserId == null) {
            if (b.supervisor?.name) supBySite.set(b.siteId, b.supervisor.name);
          }
        }

        type Row = {
          siteId: string;
          site: string;
          assigned: number;
          present: number;
          absentNoCall: number;
          onLeave: number;
          uncovered: number;
          flagged: number;
        };
        const bySite = new Map<string, Row>();
        for (const s of sites) {
          bySite.set(s.id, {
            siteId: s.id,
            site: s.name,
            assigned: 0,
            present: 0,
            absentNoCall: 0,
            onLeave: 0,
            uncovered: 0,
            flagged: flaggedBySite.get(s.id) ?? 0,
          });
        }

        const noShows: { worker: string; site: string; since: string; supervisor: string }[] = [];
        for (const a of asg) {
          const row = bySite.get(a.siteId);
          if (!row) continue;
          row.assigned += 1;
          const st = statusByWorker.get(a.workerId);
          if (st === 'PRESENT' || st === 'HALF_DAY' || st === 'ON_BREAK') row.present += 1;
          else if (st === 'ABSENT_NO_CALL') {
            row.absentNoCall += 1;
            row.uncovered += 1;
            noShows.push({
              worker: nameByWorker.get(a.workerId) ?? 'Worker',
              site: siteName.get(a.siteId) ?? '—',
              since: a.shiftStart,
              supervisor: supBySite.get(a.siteId) ?? '—',
            });
          } else if (st === 'ABSENT_APPROVED_LEAVE') row.onLeave += 1;
        }

        const siteRows = [...bySite.values()];
        const pulse = {
          onSite: siteRows.reduce((n, r) => n + r.present, 0),
          late: 0,
          noShow: siteRows.reduce((n, r) => n + r.absentNoCall, 0),
          onLeave: siteRows.reduce((n, r) => n + r.onLeave, 0),
          flagged: siteRows.reduce((n, r) => n + r.flagged, 0),
          asOf: new Date().toISOString(),
        };

        return { pulse, sites: siteRows, noShows };
      });

      reply.send(out);
    },
  );
}
