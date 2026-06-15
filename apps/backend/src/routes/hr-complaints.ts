/**
 * GET /hr/complaints  + GET /hr/complaints/:id — HR Complaints screen reads.
 *
 * Name-enriched aggregates over the complaint store, HR-site-scoped:
 *   - list:   complaints on owned sites + supervisor name (the raw /complaints
 *             returns only supervisorId).
 *   - detail: complaint + full message thread with each author's name + role.
 *
 * Writes (reply, resolve, log) still go through the existing
 * POST /complaints, /complaints/:id/messages, /complaints/:id/resolve.
 * Auth: requireRole(OWNER, HR), site-anchored via Site.ownerHrUserId. Reads run
 * inside withTenantRead (RLS GUC). Read-only.
 *
 * @derives(_design-handoff/axhy-hr-v6 complaints.jsx)
 */
import type { FastifyInstance } from 'fastify';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantRead } from '../middleware/tenant-context.js';
import { requireRole } from '../middleware/role-gates.js';
import { getHrSiteIds } from '../middleware/hr-site-scope.js';

async function ownedSiteIds(
  tx: typeof prisma,
  auth: { role: string; userId: string; companyId: string },
): Promise<string[]> {
  if (auth.role === 'HR') return getHrSiteIds(prisma, auth.userId, auth.companyId);
  const sites = await tx.site.findMany({
    where: { companyId: auth.companyId },
    select: { id: true },
  });
  return sites.map((s) => s.id);
}

/**
 * Registers the HR complaints route.
 * @derives(master-plan §G)
 */
export async function registerHrComplaintsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/hr/complaints',
    { preHandler: [requireAuth, requireRole('OWNER', 'HR')] },
    async (req, reply) => {
      const auth = req.auth!;
      const out = await withTenantRead(prisma, auth.companyId, async (tx) => {
        const siteIds = await ownedSiteIds(prisma, auth);
        const rows = await tx.complaint.findMany({
          where: { companyId: auth.companyId, siteId: { in: siteIds } },
          orderBy: { createdAt: 'desc' },
          take: 100,
          include: { site: { select: { name: true } } },
        });
        const supIds = [...new Set(rows.map((r) => r.supervisorId))];
        const sups = await tx.user.findMany({
          where: { id: { in: supIds } },
          select: { id: true, name: true },
        });
        const supName = new Map(sups.map((u) => [u.id, u.name ?? 'Supervisor']));
        return rows.map((c) => ({
          id: c.id,
          siteId: c.siteId,
          siteName: c.site.name,
          supervisorId: c.supervisorId,
          supervisorName: supName.get(c.supervisorId) ?? 'Supervisor',
          kind: c.kind,
          severity: c.severity,
          state: c.state,
          text: c.text,
          unreadHrRepliesCount: c.unreadHrRepliesCount,
          lastReplyAt: c.lastReplyAt ? c.lastReplyAt.toISOString() : null,
          createdAt: c.createdAt.toISOString(),
          resolvedAt: c.resolvedAt ? c.resolvedAt.toISOString() : null,
        }));
      });
      reply.send({ complaints: out });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/hr/complaints/:id',
    { preHandler: [requireAuth, requireRole('OWNER', 'HR')] },
    async (req, reply) => {
      const auth = req.auth!;
      const out = await withTenantRead(prisma, auth.companyId, async (tx) => {
        const siteIds = await ownedSiteIds(prisma, auth);
        const c = await tx.complaint.findFirst({
          where: { id: req.params.id, companyId: auth.companyId, siteId: { in: siteIds } },
          include: { site: { select: { name: true } } },
        });
        if (!c) return null;
        const messages = await tx.complaintMessage.findMany({
          where: { complaintId: c.id, companyId: auth.companyId },
          orderBy: { createdAt: 'asc' },
        });
        const authorIds = [...new Set([c.supervisorId, ...messages.map((m) => m.authorUserId)])];
        const users = await tx.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, name: true },
        });
        const name = new Map(users.map((u) => [u.id, u.name ?? 'User']));
        return {
          complaint: {
            id: c.id,
            siteId: c.siteId,
            siteName: c.site.name,
            supervisorId: c.supervisorId,
            supervisorName: name.get(c.supervisorId) ?? 'Supervisor',
            kind: c.kind,
            severity: c.severity,
            state: c.state,
            text: c.text,
            createdAt: c.createdAt.toISOString(),
            resolvedAt: c.resolvedAt ? c.resolvedAt.toISOString() : null,
            resolvedBy: c.resolvedBy,
          },
          messages: messages.map((m) => ({
            id: m.id,
            authorUserId: m.authorUserId,
            authorRole: m.authorRole,
            authorName: name.get(m.authorUserId) ?? (m.authorRole === 'HR' ? 'HR' : 'Supervisor'),
            body: m.body,
            createdAt: m.createdAt.toISOString(),
          })),
        };
      });
      if (!out) {
        reply.code(404).send({ error: 'COMPLAINT_NOT_FOUND' });
        return;
      }
      reply.send(out);
    },
  );
}
