/**
 * Complaint thread routes — Wave 3 backend.
 *
 *   GET    /complaints?state=&siteId=&limit=&cursor=
 *       List the caller's complaints (supervisor-scoped). Pagination by
 *       opaque cursor (`<isoCreatedAt>:<id>`). Defaults: state filter off
 *       (all states), limit=20, ordered by createdAt DESC.
 *
 *   GET    /complaints/:id
 *       Single thread: parent Complaint + all ComplaintMessage rows
 *       (oldest first) annotated with `readByCallerAt`.
 *
 *   POST   /complaints/:id/messages
 *       Supervisor reply. Body: { body, attachments? }. Creates a
 *       ComplaintMessage authored by the caller. Bumps `lastReplyAt`.
 *
 *   POST   /complaints/:id/messages/:messageId/read
 *       Idempotent read receipt. Composite PK on (messageId, actorUserId)
 *       makes concurrent calls both succeed; the second one is treated as
 *       a no-op for counter math. When a SUPERVISOR reads an HR-authored
 *       message, decrements Complaint.unreadHrRepliesCount via conditional
 *       UPDATE (clamped at 0).
 *
 *   POST   /complaints/:id/resolve
 *       Supervisor closes a complaint they can see. Conditional UPDATE on
 *       state IN ('OPEN','IN_HR') so concurrent resolvers lose cleanly.
 *
 * Cross-tenant isolation:
 *   Every route filters by `companyId = req.auth.companyId` and runs inside
 *   `withTenantContext` (sets the `axhy.current_company_id` GUC so RLS
 *   policies fire as a defense in depth). A supervisor on Tenant A cannot
 *   list, read, reply to, mark-read, or resolve a complaint owned by
 *   Tenant B; all such attempts return 404 (same shape as a missing-id
 *   lookup so no info leak).
 *
 * HR-role access is out of scope this wave. When the HR portal lands the
 * same endpoints will be reused with role gating.
 *
 * @derives(supervisor-drawer-and-decisions-redesign.md §C)
 * @derives(panel-2026-05-18) — Wave 3 backend
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  CreateComplaintMessageInput,
  ListComplaintsQuery,
  type ComplaintRowT,
  type ComplaintMessageRowT,
  type ComplaintAuthorRole,
  type ComplaintKind,
  type ComplaintSeverityWaveThree,
  type ComplaintState,
} from '@axhy/shared-schema';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
import {
  appendComplaintMessage,
  markComplaintMessageRead,
  resolveComplaint,
} from '../lib/services/complaint-service.js';

// ─── Cursor encoding ─────────────────────────────────────────────────────────
//
// Opaque to the client. Encodes "<ISO createdAt>:<uuid id>". Combined sort
// key avoids the well-known pagination bug where two rows with the same
// createdAt timestamp get split across pages.

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}:${id}`, 'utf8').toString('base64url');
}

function decodeCursor(raw: string): { createdAt: Date; id: string } | null {
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    const sep = decoded.lastIndexOf(':');
    if (sep < 0) return null;
    const iso = decoded.slice(0, sep);
    const id = decoded.slice(sep + 1);
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return null;
    return { createdAt: dt, id };
  } catch {
    return null;
  }
}

// ─── Shape helpers ───────────────────────────────────────────────────────────

type ComplaintRowFromDb = {
  id: string;
  siteId: string;
  supervisorId: string;
  createdByUserId: string;
  kind: string;
  severity: string;
  state: string;
  text: string;
  unreadHrRepliesCount: number;
  lastReplyAt: Date | null;
  createdAt: Date;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  site: { name: string };
};

function toComplaintRow(c: ComplaintRowFromDb): ComplaintRowT {
  return {
    id: c.id,
    siteId: c.siteId,
    siteName: c.site.name,
    createdByUserId: c.createdByUserId,
    supervisorId: c.supervisorId,
    kind: c.kind as ComplaintKind,
    severity: c.severity as ComplaintSeverityWaveThree,
    state: c.state as ComplaintState,
    text: c.text,
    unreadHrRepliesCount: c.unreadHrRepliesCount,
    lastReplyAt: c.lastReplyAt ? c.lastReplyAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
    resolvedAt: c.resolvedAt ? c.resolvedAt.toISOString() : null,
    resolvedBy: c.resolvedBy,
  };
}

// ─── Caller role derivation ──────────────────────────────────────────────────
//
// Map the JWT role string onto the ComplaintAuthorRole enum. SUPER_ADMIN /
// OWNER and any future role default to ADMIN for complaint-message purposes
// so audit attribution stays correct. Worker / unauthenticated callers
// never reach this code path (requireAuth + complaint endpoints are
// supervisor-only at this slice).

function complaintRoleFromAuthRole(role: string): ComplaintAuthorRole {
  if (role === 'SUPERVISOR') return 'SUPERVISOR';
  if (role === 'HR') return 'HR';
  return 'ADMIN';
}

// ─── Route registration ─────────────────────────────────────────────────────

type IdParams = FastifyRequest<{ Params: { id: string } }>;
type MsgIdParams = FastifyRequest<{ Params: { id: string; messageId: string } }>;

/**
 * Register the Wave 3 complaint thread routes on `app`.
 * @derives(supervisor-drawer-and-decisions-redesign.md §C)
 * @derives(master-plan §G) — supervisor surface
 */
export async function registerComplaintRoutes(app: FastifyInstance): Promise<void> {
  // ── GET /complaints ──────────────────────────────────────────────────────
  app.get('/complaints', { preHandler: requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) {
      reply.code(401).send({ error: 'AUTH_REQUIRED' });
      return;
    }
    const parsed = ListComplaintsQuery.safeParse(req.query);
    if (!parsed.success) {
      reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
      return;
    }
    const { state, siteId, limit } = parsed.data;
    const cursor = parsed.data.cursor ? decodeCursor(parsed.data.cursor) : null;
    if (parsed.data.cursor && !cursor) {
      reply.code(400).send({ error: 'BAD_CURSOR', message: 'cursor failed to decode' });
      return;
    }

    const rows = await withTenantContext(prisma, auth.companyId, async (tx) =>
      tx.complaint.findMany({
        where: {
          companyId: auth.companyId,
          createdByUserId: auth.userId,
          ...(state ? { state } : {}),
          ...(siteId ? { siteId } : {}),
          ...(cursor
            ? {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        include: { site: { select: { name: true } } },
      }),
    );

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const nextCursor = hasMore && last ? encodeCursor(last.createdAt, last.id) : null;

    reply.code(200).send({
      complaints: page.map(toComplaintRow),
      nextCursor,
    });
  });

  // ── GET /complaints/:id ──────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/complaints/:id',
    { preHandler: requireAuth },
    async (req: IdParams, reply) => {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED' });
        return;
      }
      const complaintId = req.params.id;
      const out = await withTenantContext(prisma, auth.companyId, async (tx) => {
        const complaint = await tx.complaint.findFirst({
          where: {
            id: complaintId,
            companyId: auth.companyId,
            createdByUserId: auth.userId,
          },
          include: { site: { select: { name: true } } },
        });
        if (!complaint) return { kind: 'NOT_FOUND' as const };
        const messages = await tx.complaintMessage.findMany({
          where: { complaintId, companyId: auth.companyId },
          orderBy: { createdAt: 'asc' },
        });
        const reads = await tx.complaintMessageRead.findMany({
          where: {
            companyId: auth.companyId,
            actorUserId: auth.userId,
            messageId: { in: messages.map((m) => m.id) },
          },
        });
        return { kind: 'OK' as const, complaint, messages, reads };
      });
      if (out.kind === 'NOT_FOUND') {
        reply.code(404).send({ error: 'COMPLAINT_NOT_FOUND' });
        return;
      }
      const readByMessageId = new Map(out.reads.map((r) => [r.messageId, r.readAt]));
      const messageRows: ComplaintMessageRowT[] = out.messages.map((m) => {
        const readAt = readByMessageId.get(m.id);
        return {
          id: m.id,
          complaintId: m.complaintId,
          authorUserId: m.authorUserId,
          authorRole: m.authorRole as ComplaintAuthorRole,
          body: m.body,
          attachments: (m.attachments as ComplaintMessageRowT['attachments']) ?? null,
          createdAt: m.createdAt.toISOString(),
          readByCallerAt: readAt ? readAt.toISOString() : null,
        };
      });
      reply.code(200).send({
        complaint: toComplaintRow(out.complaint),
        messages: messageRows,
      });
    },
  );

  // ── POST /complaints/:id/messages ────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/complaints/:id/messages',
    { preHandler: requireAuth },
    async (req: IdParams, reply) => {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED' });
        return;
      }
      const parsed = CreateComplaintMessageInput.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
        return;
      }
      const complaintId = req.params.id;
      const authorRole = complaintRoleFromAuthRole(auth.role);

      const out = await withTenantContext(prisma, auth.companyId, async (tx) => {
        // Tenant + ownership check for supervisor caller. HR-portal callers
        // (future) skip the createdByUserId filter; out-of-scope this wave.
        const complaint = await tx.complaint.findFirst({
          where: {
            id: complaintId,
            companyId: auth.companyId,
            ...(authorRole === 'SUPERVISOR' ? { createdByUserId: auth.userId } : {}),
          },
          select: { id: true },
        });
        if (!complaint) return { kind: 'COMPLAINT_NOT_FOUND' as const };
        return appendComplaintMessage(tx, {
          companyId: auth.companyId,
          complaintId,
          authorUserId: auth.userId,
          authorRole,
          body: parsed.data.body,
          attachments: parsed.data.attachments ?? null,
        });
      });

      if (out.kind === 'COMPLAINT_NOT_FOUND') {
        reply.code(404).send({ error: 'COMPLAINT_NOT_FOUND' });
        return;
      }
      if (out.kind === 'COMPLAINT_TERMINAL') {
        reply.code(409).send({
          error: 'COMPLAINT_TERMINAL',
          state: out.state,
          message: `Complaint is already ${out.state}; cannot append messages`,
        });
        return;
      }
      reply.code(201).send({
        ok: true,
        messageId: out.messageId,
        createdAt: out.createdAt.toISOString(),
      });
    },
  );

  // ── POST /complaints/:id/messages/:messageId/read ────────────────────────
  app.post<{ Params: { id: string; messageId: string } }>(
    '/complaints/:id/messages/:messageId/read',
    { preHandler: requireAuth },
    async (req: MsgIdParams, reply) => {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED' });
        return;
      }
      const { id: complaintId, messageId } = req.params;
      const actorRole = complaintRoleFromAuthRole(auth.role);
      const out = await withTenantContext(prisma, auth.companyId, async (tx) => {
        // Ownership gate for supervisor — they can only mark-read messages
        // on complaints they created. HR-future-portal flag stays scoped.
        if (actorRole === 'SUPERVISOR') {
          const complaint = await tx.complaint.findFirst({
            where: {
              id: complaintId,
              companyId: auth.companyId,
              createdByUserId: auth.userId,
            },
            select: { id: true },
          });
          if (!complaint) return { kind: 'COMPLAINT_NOT_FOUND' as const };
        }
        return markComplaintMessageRead(tx, {
          companyId: auth.companyId,
          complaintId,
          messageId,
          actorUserId: auth.userId,
          actorRole,
        });
      });
      if (out.kind === 'COMPLAINT_NOT_FOUND') {
        reply.code(404).send({ error: 'COMPLAINT_NOT_FOUND' });
        return;
      }
      if (out.kind === 'MESSAGE_NOT_FOUND') {
        reply.code(404).send({ error: 'MESSAGE_NOT_FOUND' });
        return;
      }
      reply.code(200).send({ ok: true, wasAlreadyRead: out.wasAlreadyRead });
    },
  );

  // ── POST /complaints/:id/resolve ─────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/complaints/:id/resolve',
    { preHandler: requireAuth },
    async (req: IdParams, reply) => {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED' });
        return;
      }
      const complaintId = req.params.id;
      const out = await withTenantContext(prisma, auth.companyId, async (tx) => {
        const complaint = await tx.complaint.findFirst({
          where: {
            id: complaintId,
            companyId: auth.companyId,
            createdByUserId: auth.userId,
          },
          select: { id: true },
        });
        if (!complaint) return { kind: 'COMPLAINT_NOT_FOUND' as const };
        return resolveComplaint(tx, {
          companyId: auth.companyId,
          complaintId,
          resolverUserId: auth.userId,
        });
      });
      if (out.kind === 'COMPLAINT_NOT_FOUND') {
        reply.code(404).send({ error: 'COMPLAINT_NOT_FOUND' });
        return;
      }
      if (out.kind === 'ALREADY_TERMINAL') {
        reply.code(409).send({ error: 'ALREADY_TERMINAL', state: out.state });
        return;
      }
      reply.code(200).send({ ok: true, resolvedAt: out.resolvedAt.toISOString() });
    },
  );
}
