/**
 * GET /hr/audit — HR Record screen reads (read-only).
 *
 *   - events: company audit ledger (auth noise excluded), newest first, each
 *     with resolved actor name + icon + a human sentence built from payload.
 *   - flaggedVisits: FLAGGED / NO_SHOW visits on owned sites (worker + site +
 *     AI concern) for the "Flagged visits" tab.
 *
 * Auth: requireRole(OWNER, HR), site-anchored via Site.ownerHrUserId. Reads run
 * inside withTenantRead (RLS GUC). Read-only.
 *
 * @derives(_design-handoff/axhy-hr-v6 oversight2.jsx RecordScreen)
 */
import type { FastifyInstance } from 'fastify';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantRead } from '../middleware/tenant-context.js';
import { requireRole } from '../middleware/role-gates.js';
import { getHrSiteIds } from '../middleware/hr-site-scope.js';

const ICON: Record<string, string> = {
  LEAVE_APPROVED: 'calCheck',
  LEAVE_REJECTED: 'calX',
  LEAVE_REQUESTED: 'calendarOff',
  WORKER_CREATED: 'userPlus',
  WORKER_MARKED_ABSENT: 'userX',
  WORKER_RESIGNED: 'userX',
  BINDING_ADDED: 'shield',
  SITE_CREATED: 'building',
  SITE_COMPLAINT_LOGGED: 'complaint',
  VISIT_RESOLVED: 'checkCircle',
  VISIT_REJECTED: 'calX',
  ASSIGNMENT_CREATED: 'briefcase',
};

function sentence(kind: string, p: Record<string, unknown>): string {
  const worker = typeof p.workerName === 'string' ? p.workerName : null;
  const site = typeof p.siteName === 'string' ? p.siteName : null;
  const sup = typeof p.supervisorName === 'string' ? p.supervisorName : null;
  const range = typeof p.dateRange === 'string' ? p.dateRange : null;
  const reason = typeof p.reason === 'string' ? p.reason : null;
  switch (kind) {
    case 'LEAVE_APPROVED':
      return `Approved leave for ${worker ?? 'a worker'}${range ? `, ${range}` : ''}.`;
    case 'LEAVE_REJECTED':
      return `Rejected ${worker ?? 'a worker'}'s leave${range ? `, ${range}` : ''}.`;
    case 'LEAVE_REQUESTED':
      return `${worker ?? 'A worker'} requested leave${range ? `, ${range}` : ''}.`;
    case 'WORKER_CREATED':
      return `Added worker ${worker ?? ''}${site ? ` to ${site}` : ''}.`.replace('  ', ' ');
    case 'WORKER_MARKED_ABSENT':
      return `Marked ${worker ?? 'a worker'} absent${site ? ` at ${site}` : ''}.`;
    case 'WORKER_RESIGNED':
      return `${worker ?? 'A worker'} was marked resigned.`;
    case 'BINDING_ADDED':
      return `Bound ${sup ?? 'a supervisor'} as supervisor${site ? ` at ${site}` : ''}.`;
    case 'SITE_CREATED':
      return `Created site ${site ?? ''}.`.replace(' .', '.');
    case 'SITE_COMPLAINT_LOGGED':
      return `Logged a complaint${site ? ` at ${site}` : ''}${reason ? `: ${reason}` : ''}.`;
    case 'VISIT_RESOLVED':
      return `Cleared a flagged check-in${site ? ` at ${site}` : ''}.`;
    case 'VISIT_REJECTED':
      return `Flagged a check-in${site ? ` at ${site}` : ''} for review.`;
    case 'ASSIGNMENT_CREATED':
      return `A new assignment was created${site ? ` at ${site}` : ''}.`;
    default:
      return kind.toLowerCase().replace(/_/g, ' ');
  }
}

/**
 * Registers the HR audit log route.
 * @derives(master-plan §G)
 */
export async function registerHrAuditRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/hr/audit',
    { preHandler: [requireAuth, requireRole('OWNER', 'HR')] },
    async (req, reply) => {
      const auth = req.auth!;
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

        const [events, visits] = await Promise.all([
          tx.auditEvent.findMany({
            where: { companyId: auth.companyId, NOT: { kind: { startsWith: 'AUTH_' } } },
            orderBy: { createdAt: 'desc' },
            take: 100,
            select: {
              id: true,
              kind: true,
              actorId: true,
              targetId: true,
              payload: true,
              createdAt: true,
            },
          }),
          tx.visit.findMany({
            where: {
              companyId: auth.companyId,
              siteId: { in: siteIds },
              state: { in: ['FLAGGED', 'NO_SHOW'] },
            },
            orderBy: { scheduledFor: 'desc' },
            take: 50,
            select: {
              id: true,
              state: true,
              scheduledFor: true,
              verificationText: true,
              photosBefore: true,
              photosAfter: true,
              worker: { select: { name: true } },
              site: { select: { name: true } },
            },
          }),
        ]);

        const actorIds = [...new Set(events.map((e) => e.actorId))];
        const users = await tx.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, name: true },
        });
        const actorName = new Map(users.map((u) => [u.id, u.name ?? null]));

        return {
          events: events.map((e) => ({
            id: e.id,
            kind: e.kind,
            icon: ICON[e.kind] ?? 'check',
            text: sentence(e.kind, (e.payload as Record<string, unknown>) ?? {}),
            actor: actorName.get(e.actorId) ?? null,
            targetId: e.targetId,
            createdAt: e.createdAt.toISOString(),
          })),
          flaggedVisits: visits.map((v) => ({
            id: v.id,
            worker: v.worker.name,
            site: v.site.name,
            state: v.state,
            scheduledFor: v.scheduledFor.toISOString(),
            verificationText: v.verificationText,
            photosBefore: v.photosBefore,
            photosAfter: v.photosAfter,
          })),
        };
      });
      reply.send(out);
    },
  );
}
