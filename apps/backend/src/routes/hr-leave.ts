/**
 * GET /hr/leave — HR leave screen aggregate (read-only).
 *
 * Returns everything the Leave screen renders, HR-site-scoped:
 *   - pending: REQUESTED leave for workers on owned sites, each enriched with
 *     name/phone/site + review context (present-last-30, leaves-this-quarter,
 *     active-since, same-site overlap on the requested dates).
 *   - history: decided (APPROVED/REJECTED) leave with decider name + note.
 *
 * Decisions still go through the existing POST /leave-requests/:id/{approve,reject}.
 * Auth: requireRole(OWNER, HR), site-anchored via Site.ownerHrUserId. Reads run
 * inside withTenantRead (RLS GUC). Read-only.
 *
 * @derives(_design-handoff/axhy-hr-v6 leave.jsx)
 */
import type { FastifyInstance } from 'fastify';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantRead } from '../middleware/tenant-context.js';
import { requireRole } from '../middleware/role-gates.js';
import { getHrSiteIds } from '../middleware/hr-site-scope.js';

type LeaveRow = {
  id: string;
  workerId: string;
  fromDate: Date;
  toDate: Date;
  reason: string;
  state: string;
  decidedBy: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
  createdAt: Date;
  worker: {
    name: string;
    phone: string;
    joinedAt: Date;
    assignments: { state: string; site: { id: string; name: string } }[];
  };
};

const overlaps = (aFrom: Date, aTo: Date, bFrom: Date, bTo: Date) => aFrom <= bTo && bFrom <= aTo;
const primarySite = (w: LeaveRow['worker']) =>
  (w.assignments.find((a) => a.state === 'ACTIVE') ?? w.assignments[0])?.site ?? null;

/**
 * Registers the HR leave route.
 * @derives(master-plan §G)
 */
export async function registerHrLeaveRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/hr/leave',
    { preHandler: [requireAuth, requireRole('OWNER', 'HR')] },
    async (req, reply) => {
      const auth = req.auth!;
      const now = new Date();
      const since30 = new Date(now.getTime() - 30 * 86_400_000);
      const since90 = new Date(now.getTime() - 90 * 86_400_000);

      const out = await withTenantRead(prisma, auth.companyId, async (tx) => {
        const siteIds =
          auth.role === 'HR'
            ? await getHrSiteIds(prisma, auth.userId, auth.companyId)
            : (
                await tx.site.findMany({
                  where: { companyId: auth.companyId },
                  select: { id: true },
                })
              ).map((s) => s.id);

        const scope = {
          companyId: auth.companyId,
          worker: {
            assignments: { some: { siteId: { in: siteIds }, state: { in: ['ACTIVE', 'DRAFT'] } } },
          },
        };
        const include = {
          worker: {
            select: {
              name: true,
              phone: true,
              joinedAt: true,
              assignments: {
                where: { state: { in: ['ACTIVE', 'DRAFT'] } },
                select: { state: true, site: { select: { id: true, name: true } } },
              },
            },
          },
        };

        const [pendingRaw, historyRaw] = await Promise.all([
          tx.leaveRequest.findMany({
            where: { ...scope, state: 'REQUESTED' },
            orderBy: { createdAt: 'desc' },
            include,
          }),
          tx.leaveRequest.findMany({
            where: { ...scope, state: { in: ['APPROVED', 'REJECTED', 'CANCELLED'] } },
            orderBy: { decidedAt: 'desc' },
            take: 50,
            include,
          }),
        ]);

        const pending = pendingRaw as unknown as LeaveRow[];
        const history = historyRaw as unknown as LeaveRow[];
        const pendingWorkerIds = [...new Set(pending.map((p) => p.workerId))];

        // Review context, batched.
        const [presentRows, approved90, siteLeaves] = await Promise.all([
          tx.attendance.groupBy({
            by: ['workerId'],
            where: {
              companyId: auth.companyId,
              workerId: { in: pendingWorkerIds },
              status: 'PRESENT',
              date: { gte: since30 },
            },
            _count: { _all: true },
          }),
          tx.leaveRequest.groupBy({
            by: ['workerId'],
            where: {
              companyId: auth.companyId,
              workerId: { in: pendingWorkerIds },
              state: 'APPROVED',
              createdAt: { gte: since90 },
            },
            _count: { _all: true },
          }),
          // All current/upcoming leaves on owned sites, to compute same-site overlap.
          tx.leaveRequest.findMany({
            where: { ...scope, state: { in: ['REQUESTED', 'APPROVED'] } },
            select: {
              id: true,
              workerId: true,
              fromDate: true,
              toDate: true,
              worker: {
                select: {
                  assignments: {
                    where: { state: { in: ['ACTIVE', 'DRAFT'] } },
                    select: { state: true, site: { select: { id: true } } },
                  },
                },
              },
            },
          }),
        ]);
        const present30 = new Map(presentRows.map((r) => [r.workerId, r._count._all]));
        const leave90 = new Map(approved90.map((r) => [r.workerId, r._count._all]));
        const siteOf = (alist: { state: string; site: { id: string } }[]) =>
          (alist.find((a) => a.state === 'ACTIVE') ?? alist[0])?.site.id ?? null;

        const resolveDecider = async () => {
          const ids = [...new Set(history.map((h) => h.decidedBy).filter((x): x is string => !!x))];
          if (ids.length === 0) return new Map<string, string>();
          const users = await tx.user.findMany({
            where: { id: { in: ids } },
            select: { id: true, name: true },
          });
          return new Map(users.map((u) => [u.id, u.name ?? 'HR']));
        };
        const deciderName = await resolveDecider();

        return {
          pending: pending.map((p) => {
            const site = primarySite(p.worker);
            const overlap = siteLeaves.filter(
              (l) =>
                l.id !== p.id &&
                l.workerId !== p.workerId &&
                site != null &&
                siteOf(l.worker.assignments) === site.id &&
                overlaps(p.fromDate, p.toDate, l.fromDate, l.toDate),
            ).length;
            return {
              id: p.id,
              workerId: p.workerId,
              name: p.worker.name,
              phone: p.worker.phone,
              site: site?.name ?? '—',
              fromDate: p.fromDate.toISOString().slice(0, 10),
              toDate: p.toDate.toISOString().slice(0, 10),
              reason: p.reason,
              createdAt: p.createdAt.toISOString(),
              present30: present30.get(p.workerId) ?? 0,
              leave90: leave90.get(p.workerId) ?? 0,
              activeSince: p.worker.joinedAt.toISOString().slice(0, 10),
              overlap,
            };
          }),
          history: history.map((h) => ({
            id: h.id,
            workerId: h.workerId,
            name: h.worker.name,
            phone: h.worker.phone,
            fromDate: h.fromDate.toISOString().slice(0, 10),
            toDate: h.toDate.toISOString().slice(0, 10),
            reason: h.reason,
            state: h.state,
            decidedAt: h.decidedAt ? h.decidedAt.toISOString() : null,
            decidedByName: h.decidedBy ? (deciderName.get(h.decidedBy) ?? 'HR') : 'HR',
            decidedByYou: h.decidedBy === auth.userId,
            note: h.decisionNote,
          })),
        };
      });

      reply.send(out);
    },
  );
}
