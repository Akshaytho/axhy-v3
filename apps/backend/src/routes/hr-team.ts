/**
 * GET /hr/team — HR Team screen (read-only).
 *
 * HR + supervisors connected to the caller's owned sites, each with a real
 * site count (supervisor = active site bindings; HR = owned sites; owner = all
 * sites). Mirrors the v6 Team table.
 *
 * Auth: requireRole(OWNER, HR), site-anchored. Reads in withTenantRead. Read-only.
 *
 * @derives(_design-handoff/axhy-hr-v6 more.jsx TeamScreen)
 */
import type { FastifyInstance } from 'fastify';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantRead } from '../middleware/tenant-context.js';
import { requireRole } from '../middleware/role-gates.js';
import { getHrSiteIds } from '../middleware/hr-site-scope.js';

/**
 * Registers the HR team route.
 * @derives(master-plan §G)
 */
export async function registerHrTeamRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/hr/team',
    { preHandler: [requireAuth, requireRole('OWNER', 'HR')] },
    async (req, reply) => {
      const auth = req.auth!;
      const out = await withTenantRead(prisma, auth.companyId, async (tx) => {
        const allSites = await tx.site.findMany({
          where: { companyId: auth.companyId },
          select: { id: true, ownerHrUserId: true },
        });
        const ownedSiteIds =
          auth.role === 'HR'
            ? await getHrSiteIds(prisma, auth.userId, auth.companyId)
            : allSites.map((s) => s.id);

        // Supervisors with an active binding to an owned site.
        const bindings = await tx.siteSupervisorBinding.findMany({
          where: { companyId: auth.companyId, siteId: { in: ownedSiteIds }, endedAt: null },
          select: { userId: true, siteId: true },
        });
        const supSiteCount = new Map<string, Set<string>>();
        for (const b of bindings) {
          const set = supSiteCount.get(b.userId) ?? new Set<string>();
          set.add(b.siteId);
          supSiteCount.set(b.userId, set);
        }
        const supUserIds = [...supSiteCount.keys()];

        // HR/OWNER memberships in the tenant + the supervisor users above.
        const memberships = await tx.membership.findMany({
          where: {
            companyId: auth.companyId,
            OR: [
              { role: { in: ['HR', 'OWNER'] } },
              { userId: { in: supUserIds }, role: 'SUPERVISOR' },
            ],
          },
          select: {
            id: true,
            userId: true,
            role: true,
            status: true,
            createdAt: true,
            user: { select: { name: true, phone: true } },
          },
          orderBy: { createdAt: 'asc' },
        });

        const sitesFor = (m: { userId: string; role: string }) => {
          if (m.role === 'SUPERVISOR') return supSiteCount.get(m.userId)?.size ?? 0;
          if (m.role === 'HR') return allSites.filter((s) => s.ownerHrUserId === m.userId).length;
          return allSites.length; // OWNER
        };

        // Rank: me first, then HR, then supervisors.
        const rank = (m: { userId: string; role: string }) =>
          m.userId === auth.userId ? 0 : m.role === 'HR' ? 1 : m.role === 'OWNER' ? 2 : 3;

        return memberships
          .map((m) => ({
            id: m.id,
            userId: m.userId,
            name: m.user?.name ?? '—',
            phone: m.user?.phone ?? '',
            role: m.role,
            status: m.status,
            sites: sitesFor(m),
            added: m.createdAt.toISOString().slice(0, 10),
            isMe: m.userId === auth.userId,
          }))
          .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
      });
      reply.send({ members: out });
    },
  );

  /**
   * GET /hr/team/:userId — one member's detail (read-only).
   *
   * Real per-member read for the v6 Team MemberDetail drill-in: profile +
   * monthly salary + masked bank account, plus sites owned (HR/OWNER) or site
   * bindings (SUPERVISOR, permanent/acting + window). All data already stored —
   * no fabrication, no schema change. The deactivate/resend actions in the v6
   * menu stay not-live (no lifecycle endpoint; membership status must move
   * through its machine), so the screen marks them Soon rather than fake them.
   *
   * Auth: requireRole(OWNER, HR). Read-only inside withTenantRead (RLS GUC).
   */
  app.get(
    '/hr/team/:userId',
    { preHandler: [requireAuth, requireRole('OWNER', 'HR')] },
    async (req, reply) => {
      const auth = req.auth!;
      const { userId } = req.params as { userId: string };
      const out = await withTenantRead(prisma, auth.companyId, async (tx) => {
        const m = await tx.membership.findFirst({
          where: { companyId: auth.companyId, userId },
          select: {
            userId: true,
            role: true,
            status: true,
            baseSalaryPaise: true,
            bankAcct: true,
            createdAt: true,
            user: { select: { name: true, phone: true } },
          },
        });
        if (!m) return null;

        let owns: string[] | null = null;
        let bindings: { site: string; type: string; from: string; until: string | null }[] | null =
          null;

        if (m.role === 'HR' || m.role === 'OWNER') {
          const sites = await tx.site.findMany({
            where:
              m.role === 'OWNER'
                ? { companyId: auth.companyId }
                : { companyId: auth.companyId, ownerHrUserId: userId },
            select: { name: true },
            orderBy: { createdAt: 'asc' },
          });
          owns = sites.map((s) => s.name);
        } else if (m.role === 'SUPERVISOR') {
          const binds = await tx.siteSupervisorBinding.findMany({
            where: { companyId: auth.companyId, userId },
            select: {
              siteId: true,
              actingForUserId: true,
              effectiveFrom: true,
              effectiveUntil: true,
              endedAt: true,
            },
            orderBy: { effectiveFrom: 'desc' },
          });
          const siteIds = [...new Set(binds.map((b) => b.siteId))];
          const sites = await tx.site.findMany({
            where: { companyId: auth.companyId, id: { in: siteIds } },
            select: { id: true, name: true },
          });
          const nameBySite = new Map(sites.map((s) => [s.id, s.name]));
          bindings = binds.map((b) => ({
            site: nameBySite.get(b.siteId) ?? '—',
            type: b.actingForUserId ? 'Acting' : 'Permanent',
            from: b.effectiveFrom.toISOString().slice(0, 10),
            until: b.endedAt
              ? b.endedAt.toISOString().slice(0, 10)
              : b.effectiveUntil
                ? b.effectiveUntil.toISOString().slice(0, 10)
                : null,
          }));
        }

        return {
          userId: m.userId,
          name: m.user?.name ?? '—',
          phone: m.user?.phone ?? '',
          role: m.role,
          status: m.status,
          salaryPaise: m.baseSalaryPaise ?? null,
          bankAcctLast4: m.bankAcct ? m.bankAcct.slice(-4) : null,
          owns,
          bindings,
        };
      });
      if (!out) {
        reply.code(404).send({ error: 'NOT_FOUND', message: 'Member not found in this company' });
        return;
      }
      reply.send(out);
    },
  );
}
