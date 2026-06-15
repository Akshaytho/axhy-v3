/**
 * GET /hr/payroll — HR Payroll screen (read-only).
 *
 * Per-worker monthly pay = Membership.baseSalaryPaise − this month's
 * unpaid-absence deductions (sum of Attendance.payDeductPaise), with the
 * deduction days attached for the drill-in sheet. HR-site-scoped.
 *
 * AXHY shows the numbers; paying salaries stays manual (per locked pricing).
 * Auth: requireRole(OWNER, HR), site-anchored. Reads in withTenantRead. Read-only.
 *
 * @derives(_design-handoff/axhy-hr-v6 ops.jsx PayrollScreen, ADR-0025)
 */
import type { FastifyInstance } from 'fastify';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantRead } from '../middleware/tenant-context.js';
import { requireRole } from '../middleware/role-gates.js';
import { getHrSiteIds } from '../middleware/hr-site-scope.js';

const ONBOARDING = ['PENDING_ACTIVATION', 'INVITED'];

/**
 * Registers the HR payroll route.
 * @derives(master-plan §G)
 */
export async function registerHrPayrollRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/hr/payroll',
    { preHandler: [requireAuth, requireRole('OWNER', 'HR')] },
    async (req, reply) => {
      const auth = req.auth!;
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

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

        // Workers with a live assignment to an owned site, + their site.
        const asg = await tx.assignment.findMany({
          where: {
            companyId: auth.companyId,
            siteId: { in: siteIds },
            state: { in: ['ACTIVE', 'DRAFT'] },
          },
          select: { workerId: true, state: true, site: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
        });
        const siteByWorker = new Map<string, string>();
        for (const a of asg) {
          const cur = siteByWorker.get(a.workerId);
          if (!cur || a.state === 'ACTIVE') siteByWorker.set(a.workerId, a.site.name);
        }
        const workerIds = [...siteByWorker.keys()];

        const workers = await tx.worker.findMany({
          where: { companyId: auth.companyId, id: { in: workerIds } },
          select: { id: true, name: true, state: true, userId: true },
        });
        const userIds = workers.map((w) => w.userId).filter((x): x is string => !!x);
        const memberships = await tx.membership.findMany({
          where: { companyId: auth.companyId, role: 'WORKER', userId: { in: userIds } },
          select: { userId: true, baseSalaryPaise: true },
        });
        const salaryByUser = new Map(memberships.map((m) => [m.userId, m.baseSalaryPaise]));

        const att = await tx.attendance.findMany({
          where: {
            companyId: auth.companyId,
            workerId: { in: workerIds },
            date: { gte: monthStart, lt: monthEnd },
          },
          select: { workerId: true, date: true, status: true, payDeductPaise: true },
          orderBy: { date: 'asc' },
        });
        const present = new Map<string, number>();
        const deduct = new Map<string, number>();
        const deductionDays = new Map<
          string,
          { date: string; status: string; deductPaise: number }[]
        >();
        for (const a of att) {
          if (a.status === 'PRESENT' || a.status === 'HALF_DAY')
            present.set(a.workerId, (present.get(a.workerId) ?? 0) + 1);
          if (a.payDeductPaise > 0) {
            deduct.set(a.workerId, (deduct.get(a.workerId) ?? 0) + a.payDeductPaise);
            const list = deductionDays.get(a.workerId) ?? [];
            list.push({
              date: a.date.toISOString().slice(0, 10),
              status: a.status,
              deductPaise: a.payDeductPaise,
            });
            deductionDays.set(a.workerId, list);
          }
        }

        const rows = workers
          .map((w) => {
            const basePaise = (w.userId && salaryByUser.get(w.userId)) || 0;
            const presentDays = present.get(w.id) ?? 0;
            const deductPaise = deduct.get(w.id) ?? 0;
            const notReady =
              ONBOARDING.includes(w.state) || (presentDays === 0 && deductPaise === 0);
            return {
              workerId: w.id,
              worker: w.name,
              site: siteByWorker.get(w.id) ?? '—',
              basePaise,
              presentDays,
              deductPaise,
              netPaise: basePaise - deductPaise,
              notReady,
              deductionDays: deductionDays.get(w.id) ?? [],
            };
          })
          .sort((a, b) => a.worker.localeCompare(b.worker));

        const totals = rows.reduce(
          (acc, r) => ({
            base: acc.base + r.basePaise,
            deduct: acc.deduct + r.deductPaise,
            net: acc.net + r.netPaise,
          }),
          { base: 0, deduct: 0, net: 0 },
        );

        return { month, rows, totals };
      });

      reply.send(out);
    },
  );
}
