/**
 * ReplacementInvite (F28) routes — Wave 1 backend.
 *
 *   POST   /supervisor/replacement-invites
 *       Supervisor sends ONE invite to ONE candidate worker. Body:
 *       { siteId, scheduledStart, candidateUserId, visitId?, expiresInSec? }.
 *       2-minute default TTL. On terminal state the supervisor may send a
 *       fresh invite to the same worker or a different one (no broadcast).
 *
 *   POST   /worker/replacement-invites/:id/accept
 *       Worker accepts the invite. Conditional UPDATE on status='PENDING'.
 *       On success: ACTIVE one-day Assignment auto-created, supervisor
 *       pushed.
 *
 *   POST   /worker/replacement-invites/:id/decline
 *       Worker declines. Supervisor pushed so they can send a fresh
 *       invite to a different worker.
 *
 *   GET    /supervisor/replacement-invites?status=&limit=&cursor=
 *       Supervisor inbox — open + recent invites, paginated.
 *
 *   POST   /supervisor/replacement-invites/:id/cancel
 *       Supervisor recalls a PENDING invite. Candidate pushed.
 *
 * Cross-tenant isolation: every route filters by
 * `companyId = auth.companyId` and runs inside `withTenantContext`. A
 * supervisor on Tenant A cannot list, cancel, or peek any invite owned
 * by Tenant B; a worker on Tenant B cannot accept or decline an invite
 * from Tenant A. All such attempts return 404 (same shape as missing-id;
 * no info leak).
 *
 * @derives(master-plan §P.4 — ReplacementInvite)
 * @derives(feedback_replacement_invite_single_recipient.md, 2026-05-18)
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  CreateReplacementInviteInput,
  DeclineReplacementInviteInput,
  ListSupervisorReplacementInvitesQuery,
  ReplacementInviteStatusSchema,
  type ReplacementInviteRowT,
  type ReplacementInviteStatus,
} from '@axhy/shared-schema';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
import { withIdempotency } from '../lib/idempotency-key.js';
import {
  createReplacementInvite,
  acceptReplacementInvite,
  declineReplacementInvite,
  cancelReplacementInvite,
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

type IdParams = FastifyRequest<{ Params: { id: string } }>;

/**
 * Register the Wave 1 ReplacementInvite routes on `app`.
 *
 * @derives(master-plan §P.4)
 * @derives(master-plan §G) — supervisor surface
 */
export async function registerReplacementInviteRoutes(app: FastifyInstance): Promise<void> {
  // ── POST /supervisor/replacement-invites ─────────────────────────────────
  // Idempotency-Key supported (Cluster F fix): a Slow-3G double-tap with
  // the same key returns the cached invite row instead of creating two.
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
    const parsed = CreateReplacementInviteInput.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
      return;
    }

    await withIdempotency(
      req,
      reply,
      { companyId: auth.companyId, routeKey: 'POST:/supervisor/replacement-invites' },
      async () => {
        const out = await withTenantContext(prisma, auth.companyId, async (tx) =>
          createReplacementInvite(tx, {
            ...parsed.data,
            companyId: auth.companyId,
            fromSupervisorId: auth.userId,
          }),
        );

        if (out.kind === 'SITE_NOT_FOUND') {
          return { status: 404, body: { error: 'SITE_NOT_FOUND' } };
        }
        if (out.kind === 'VISIT_NOT_FOUND') {
          return { status: 404, body: { error: 'VISIT_NOT_FOUND' } };
        }
        if (out.kind === 'CANDIDATE_NOT_FOUND') {
          return { status: 404, body: { error: 'CANDIDATE_NOT_FOUND' } };
        }
        if (out.kind === 'CANDIDATE_NOT_LINKED_TO_WORKER') {
          return {
            status: 409,
            body: {
              error: 'CANDIDATE_NOT_LINKED_TO_WORKER',
              message:
                'Candidate must have a linked Worker row in this tenant. ' +
                'Unlinked users cannot receive replacement invites.',
            },
          };
        }

        req.log.info(
          {
            event: 'replacement_invite.sent',
            inviteId: out.invite.id,
            toWorkerUserId: out.invite.toWorkerId,
            siteId: parsed.data.siteId,
            fromSupervisorId: auth.userId,
            expiresAt: out.invite.expiresAt,
          },
          'replacement-invite sent',
        );

        return { status: 201, body: { ok: true, invite: out.invite } };
      },
    );
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
      const inviteId = req.params.id;

      const out = await withTenantContext(prisma, auth.companyId, async (tx) =>
        acceptReplacementInvite(tx, {
          companyId: auth.companyId,
          inviteId,
          workerUserId: auth.userId,
        }),
      );

      if (out.kind === 'INVITE_NOT_FOUND' || out.kind === 'NOT_YOUR_INVITE') {
        // Same envelope for both — never reveal that an invite exists if
        // the caller isn't the intended recipient.
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
          assignmentId: out.assignmentId,
        },
        'replacement-invite accepted',
      );

      reply.code(200).send({
        ok: true,
        invite: out.invite,
        assignmentId: out.assignmentId,
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

      reply.code(200).send({ ok: true });
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
    const { status, limit } = parsed.data;
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

  // ── POST /supervisor/replacement-invites/:id/cancel ──────────────────────
  app.post<{ Params: { id: string } }>(
    '/supervisor/replacement-invites/:id/cancel',
    { preHandler: requireAuth },
    async (req: IdParams, reply) => {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED' });
        return;
      }
      if (auth.role !== 'SUPERVISOR') {
        reply.code(403).send({ error: 'SUPERVISOR_ROLE_REQUIRED' });
        return;
      }
      const inviteId = req.params.id;

      const out = await withTenantContext(prisma, auth.companyId, async (tx) =>
        cancelReplacementInvite(tx, {
          companyId: auth.companyId,
          inviteId,
          fromSupervisorId: auth.userId,
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

      req.log.info(
        {
          event: 'replacement_invite.cancelled',
          inviteId,
          fromSupervisorId: auth.userId,
        },
        'replacement-invite cancelled',
      );

      reply.code(200).send({ ok: true });
    },
  );
}
