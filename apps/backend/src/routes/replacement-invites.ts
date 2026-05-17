/**
 * ReplacementInvite (F28) routes — Wave 1 backend.
 *
 *   POST   /supervisor/replacement-invites
 *       Supervisor broadcasts an invite to N candidate workers. One tx:
 *       inserts N rows sharing a generated groupId, enqueues N push
 *       notifications, emits N audit events. Returns `{ groupId, invites }`.
 *
 *   POST   /worker/replacement-invites/:id/accept
 *       Worker accepts. Atomic conditional UPDATE on status='PENDING' wins
 *       exactly one accept per group. On success: siblings auto-EXPIRE,
 *       Assignment is created, supervisor + losers are pushed.
 *
 *   POST   /worker/replacement-invites/:id/decline
 *       Worker declines. If everyone in the group has now declined, emits
 *       an outcome SupervisorDecision row + pushes the supervisor.
 *
 *   GET    /supervisor/replacement-invites?status=&groupId=&limit=&cursor=
 *       Supervisor inbox — open + recent broadcasts, paginated.
 *
 *   POST   /supervisor/replacement-invites/:groupId/cancel
 *       Supervisor recalls a broadcast. All PENDING rows flip to CANCELLED.
 *
 * Cross-tenant isolation: every route filters by `companyId = auth.companyId`
 * and runs inside `withTenantContext`. A supervisor on Tenant A cannot
 * create, list, cancel, or peek any invite owned by Tenant B; a worker on
 * Tenant B cannot accept or decline an invite from Tenant A. All such
 * attempts return 404 (same shape as missing-id; no info leak).
 *
 * Worker role isolation: accept/decline require the caller's userId to
 * match `toWorkerId` on the invite. Mismatch returns 404 (not 403) for the
 * same no-info-leak reason — a worker shouldn't be able to enumerate
 * other workers' invite IDs.
 *
 * @derives(master-plan §P.4 — ReplacementInvite)
 * @derives(master-plan §G:976 — PUBG-style invite locked design)
 * @derives(replacement-invite-feature-spec.md, 2026-05-18)
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  CreateReplacementInviteGroupInput,
  DeclineReplacementInviteInput,
  ListSupervisorReplacementInvitesQuery,
  ReplacementInviteStatusSchema,
  type ReplacementInviteRowT,
  type ReplacementInviteStatus,
} from '@axhy/shared-schema';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
import {
  createReplacementInviteGroup,
  acceptReplacementInvite,
  declineReplacementInvite,
  cancelReplacementInviteGroup,
} from '../lib/services/replacement-invite-service.js';

// ─── Cursor encoding (mirror complaints.ts) ─────────────────────────────────

function encodeCursor(sentAt: Date, id: string): string {
  return Buffer.from(`${sentAt.toISOString()}:${id}`, 'utf8').toString('base64url');
}

function decodeCursor(raw: string): { sentAt: Date; id: string } | null {
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    const sep = decoded.lastIndexOf(':');
    if (sep < 0) return null;
    const iso = decoded.slice(0, sep);
    const id = decoded.slice(sep + 1);
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return null;
    return { sentAt: dt, id };
  } catch {
    return null;
  }
}

// ─── Param types ────────────────────────────────────────────────────────────

type IdParams = FastifyRequest<{ Params: { id: string } }>;
type GroupIdParams = FastifyRequest<{ Params: { groupId: string } }>;

/**
 * Register the Wave 1 ReplacementInvite routes on `app`.
 *
 * @derives(master-plan §P.4)
 * @derives(master-plan §G) — supervisor surface
 */
export async function registerReplacementInviteRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /supervisor/replacement-invites ─────────────────────────────────
  app.post('/supervisor/replacement-invites', { preHandler: requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) {
      reply.code(401).send({ error: 'AUTH_REQUIRED' });
      return;
    }
    if (auth.role !== 'SUPERVISOR') {
      reply.code(403).send({ error: 'SUPERVISOR_ROLE_REQUIRED' });
      return;
    }
    const parsed = CreateReplacementInviteGroupInput.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
      return;
    }

    const out = await withTenantContext(prisma, auth.companyId, async (tx) =>
      createReplacementInviteGroup(tx, {
        ...parsed.data,
        companyId: auth.companyId,
        fromSupervisorId: auth.userId,
      }),
    );

    if (out.kind === 'SITE_NOT_FOUND') {
      reply.code(404).send({ error: 'SITE_NOT_FOUND' });
      return;
    }
    if (out.kind === 'VISIT_NOT_FOUND') {
      reply.code(404).send({ error: 'VISIT_NOT_FOUND' });
      return;
    }
    if (out.kind === 'CANDIDATE_NOT_FOUND') {
      reply.code(404).send({
        error: 'CANDIDATE_NOT_FOUND',
        missingUserId: out.missingUserId,
      });
      return;
    }
    if (out.kind === 'CANDIDATE_NOT_LINKED_TO_WORKER') {
      reply.code(409).send({
        error: 'CANDIDATE_NOT_LINKED_TO_WORKER',
        message:
          'Every candidate must have a linked Worker row in this tenant. ' +
          'Unlinked users cannot receive replacement invites.',
        userId: out.userId,
      });
      return;
    }

    req.log.info(
      {
        event: 'replacement_invite.group_created',
        groupId: out.groupId,
        candidateCount: out.invites.length,
        siteId: parsed.data.siteId,
        fromSupervisorId: auth.userId,
        expiresAt: out.invites[0]?.expiresAt,
      },
      'replacement-invite group created',
    );

    reply.code(201).send({ ok: true, groupId: out.groupId, invites: out.invites });
  });

  // ── POST /worker/replacement-invites/:id/accept ──────────────────────────
  app.post<{ Params: { id: string } }>(
    '/worker/replacement-invites/:id/accept',
    { preHandler: requireAuth },
    async (req: IdParams, reply) => {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED' });
        return;
      }
      // Note: WORKER role isn't a separate auth.role today — workers on this
      // surface authenticate as themselves with the same JWT pipeline. We
      // gate by checking `toWorkerId === auth.userId` inside the service.
      const inviteId = req.params.id;

      const out = await withTenantContext(prisma, auth.companyId, async (tx) =>
        acceptReplacementInvite(tx, {
          companyId: auth.companyId,
          inviteId,
          workerUserId: auth.userId,
        }),
      );

      if (out.kind === 'INVITE_NOT_FOUND' || out.kind === 'NOT_YOUR_INVITE') {
        // Same status code + envelope for both to avoid leaking existence
        // of an invite that the caller isn't the recipient of.
        reply.code(404).send({ error: 'INVITE_NOT_FOUND' });
        return;
      }
      if (out.kind === 'ALREADY_DECIDED') {
        reply.code(409).send({ error: 'ALREADY_DECIDED', status: out.status });
        return;
      }
      if (out.kind === 'WORKER_ROW_MISSING') {
        reply.code(409).send({
          error: 'WORKER_ROW_MISSING',
          message:
            'Worker row is no longer linked in this tenant. Contact HR to relink the account.',
        });
        return;
      }

      req.log.info(
        {
          event: 'replacement_invite.accepted',
          inviteId,
          groupId: out.invite.groupId,
          assignmentId: out.assignmentId,
          expiredSiblingCount: out.expiredSiblingCount,
        },
        'replacement-invite accepted',
      );

      reply.code(200).send({
        ok: true,
        invite: out.invite,
        assignmentId: out.assignmentId,
        expiredSiblingCount: out.expiredSiblingCount,
      });
    },
  );

  // ── POST /worker/replacement-invites/:id/decline ─────────────────────────
  app.post<{ Params: { id: string } }>(
    '/worker/replacement-invites/:id/decline',
    { preHandler: requireAuth },
    async (req: IdParams, reply) => {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED' });
        return;
      }
      const parsed = DeclineReplacementInviteInput.safeParse(req.body ?? {});
      if (!parsed.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
        return;
      }
      const inviteId = req.params.id;

      const out = await withTenantContext(prisma, auth.companyId, async (tx) =>
        declineReplacementInvite(tx, {
          companyId: auth.companyId,
          inviteId,
          workerUserId: auth.userId,
          reason: parsed.data.reason ?? null,
        }),
      );

      if (out.kind === 'INVITE_NOT_FOUND' || out.kind === 'NOT_YOUR_INVITE') {
        reply.code(404).send({ error: 'INVITE_NOT_FOUND' });
        return;
      }
      if (out.kind === 'ALREADY_DECIDED') {
        reply.code(409).send({ error: 'ALREADY_DECIDED', status: out.status });
        return;
      }

      reply.code(200).send({ ok: true, allDeclined: out.allDeclined });
    },
  );

  // ── GET /supervisor/replacement-invites ──────────────────────────────────
  app.get('/supervisor/replacement-invites', { preHandler: requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) {
      reply.code(401).send({ error: 'AUTH_REQUIRED' });
      return;
    }
    if (auth.role !== 'SUPERVISOR') {
      reply.code(403).send({ error: 'SUPERVISOR_ROLE_REQUIRED' });
      return;
    }
    const parsed = ListSupervisorReplacementInvitesQuery.safeParse(req.query);
    if (!parsed.success) {
      reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
      return;
    }
    const { status, groupId, limit } = parsed.data;
    const cursor = parsed.data.cursor ? decodeCursor(parsed.data.cursor) : null;
    if (parsed.data.cursor && !cursor) {
      reply.code(400).send({ error: 'BAD_CURSOR', message: 'cursor failed to decode' });
      return;
    }

    const rows = await withTenantContext(prisma, auth.companyId, async (tx) =>
      tx.replacementInvite.findMany({
        where: {
          companyId: auth.companyId,
          fromSupervisorId: auth.userId,
          ...(status ? { status } : {}),
          ...(groupId ? { groupId } : {}),
          ...(cursor
            ? {
                OR: [
                  { sentAt: { lt: cursor.sentAt } },
                  { sentAt: cursor.sentAt, id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        include: {
          site: { select: { name: true } },
          toWorker: { select: { name: true } },
        },
      }),
    );

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? encodeCursor(last.sentAt, last.id) : null;

    const invites: ReplacementInviteRowT[] = page.map((r) => ({
      id: r.id,
      groupId: r.groupId,
      fromSupervisorId: r.fromSupervisorId,
      toWorkerId: r.toWorkerId,
      toWorkerName: r.toWorker.name ?? null,
      visitId: r.visitId,
      siteId: r.siteId,
      siteName: r.site.name,
      scheduledStart: r.scheduledStart.toISOString(),
      status: ReplacementInviteStatusSchema.parse(r.status) as ReplacementInviteStatus,
      sentAt: r.sentAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      respondedAt: r.respondedAt ? r.respondedAt.toISOString() : null,
      respondReason: r.respondReason,
    }));

    reply.code(200).send({ invites, nextCursor });
  });

  // ── POST /supervisor/replacement-invites/:groupId/cancel ─────────────────
  app.post<{ Params: { groupId: string } }>(
    '/supervisor/replacement-invites/:groupId/cancel',
    { preHandler: requireAuth },
    async (req: GroupIdParams, reply) => {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED' });
        return;
      }
      if (auth.role !== 'SUPERVISOR') {
        reply.code(403).send({ error: 'SUPERVISOR_ROLE_REQUIRED' });
        return;
      }
      const groupId = req.params.groupId;

      const out = await withTenantContext(prisma, auth.companyId, async (tx) =>
        cancelReplacementInviteGroup(tx, {
          companyId: auth.companyId,
          groupId,
          fromSupervisorId: auth.userId,
        }),
      );

      if (out.kind === 'GROUP_NOT_FOUND' || out.kind === 'NOT_YOUR_GROUP') {
        reply.code(404).send({ error: 'GROUP_NOT_FOUND' });
        return;
      }

      req.log.info(
        {
          event: 'replacement_invite.group_cancelled',
          groupId,
          cancelledCount: out.cancelledCount,
          fromSupervisorId: auth.userId,
        },
        'replacement-invite group cancelled',
      );

      reply.code(200).send({ ok: true, cancelledCount: out.cancelledCount });
    },
  );
}
