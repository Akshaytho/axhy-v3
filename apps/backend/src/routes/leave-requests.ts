/**
 * Leave-request supervisor routes.
 *
 * POST /leave-requests/:id/approve   (PERSONNEL tier)
 *   Transitions the LeaveRequest from REQUESTED → APPROVED.
 *   Optionally transitions the affected Worker → ON_LEAVE for the
 *   leave-window dates (Phase B does the LeaveRequest transition only;
 *   Worker.state recompute lands in B.6 dispatcher topic
 *   `worker.recompute_state`).
 *   Writes AuditEvent + Outbox topic `worker.leave_approved`.
 *
 * POST /leave-requests/:id/reject    (PERSONNEL tier)
 *   Transitions REQUESTED → REJECTED. Worker.state unchanged.
 *   Writes AuditEvent + Outbox topic `worker.leave_rejected`.
 *
 * Both routes require the LeaveRequest to be in REQUESTED state. Re-
 * deciding an already-decided leave returns 409 (the supervisor should
 * see the current state and explicitly cancel-and-reissue if needed).
 *
 * @derives(ADR-0007)
 * @derives(data-flow §5 — approve leave PERSONNEL tier)
 * @derives(panel-2026-05-08) — Phase B.4
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { CreateLeaveRequestInput, LeaveDecisionInput } from '@axhy/shared-schema';
import type { LeaveDecisionOutput } from '@axhy/shared-schema';

import { prisma } from '../lib/prisma.js';
import {
  requireAuth,
  withTenantContext,
  resolveWorkerFromAuth,
} from '../middleware/tenant-context.js';
import { requireRole } from '../middleware/role-gates.js';
import { getMyPodIds } from '../middleware/pod-scope.js';
import { recordAuditEvent } from '../lib/audit-event.js';
import { enqueueOutbox } from '../lib/outbox.js';
import { createLeaveRequestService } from '../lib/services/leave-request-service.js';
import {
  deriveWorkerPrimarySiteId,
  getSitesSupervisedByUser,
} from '../lib/effective-responsibility.js';

// ─── Cursor encoding ─────────────────────────────────────────────────────────
//
// Opaque to the client. Encodes "<ISO createdAt>:<uuid id>". Mirrors the
// pattern in routes/complaints.ts and routes/admin-workers.ts. Once a fourth
// call site appears, extract to lib/cursor.ts (HR A1 plan Task 5 tracks this).
//
// @derives(ADR-0026)

function encodeCursor(input: { createdAt: Date; id: string }): string {
  return Buffer.from(`${input.createdAt.toISOString()}:${input.id}`, 'utf8').toString('base64url');
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
    if (!id) return null;
    return { createdAt: dt, id };
  } catch {
    return null;
  }
}

const ListQuery = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

type DecisionKind = 'approve' | 'reject';
type DecisionRequest = FastifyRequest<{ Params: { id: string } }>;

/**
 * Register leave-request supervisor routes.
 *
 * @derives(ADR-0007)
 * @derives(data-flow §5)
 */
export async function registerLeaveRequestRoutes(app: FastifyInstance): Promise<void> {
  app.post('/leave-requests', { preHandler: requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) {
      reply.code(401).send({ error: 'AUTH_REQUIRED' });
      return;
    }
    const parsed = CreateLeaveRequestInput.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
      return;
    }
    const { workerId, fromDate, toDate, reason } = parsed.data;

    if (new Date(fromDate) > new Date(toDate)) {
      reply.code(400).send({ error: 'BAD_RANGE', message: 'fromDate must be ≤ toDate' });
      return;
    }

    // Identity binding (RCA-H 2026-06-04). This route is role-agnostic
    // (requireAuth only) because supervisors/HR/owner legitimately file
    // leave on a worker's behalf and /chat/apply reuses this route — so we
    // do NOT add a blanket role gate. But createLeaveRequestService only
    // scopes by companyId; it never binds `workerId` to the caller. Without
    // this guard any WORKER could POST another worker's Worker.id (same
    // tenant) and fabricate a leave request for them. So: a WORKER caller
    // may only ever request leave for THEMSELVES. Non-worker roles keep the
    // on-behalf-of contract (the service still 404s an unknown worker).
    if (auth.role === 'WORKER') {
      const self = await resolveWorkerFromAuth(prisma, auth);
      if (self.kind === 'NO_WORKER') {
        reply.code(403).send({
          error: 'NOT_A_WORKER',
          message: 'No worker profile is linked to this account.',
        });
        return;
      }
      if (self.workerId !== workerId) {
        reply.code(403).send({
          error: 'FORBIDDEN_NOT_SELF',
          message: 'A worker can only request leave for themselves.',
        });
        return;
      }
    }

    try {
      // F-002.b (round-2 R2b-iii): route is now a thin wrapper around
      // createLeaveRequestService. /chat/apply (F-002.15) calls the same
      // service INSIDE its own withTenantContext for atomic lifecycle +
      // domain.
      const out = await withTenantContext(prisma, auth.companyId, async (tx) =>
        createLeaveRequestService(
          tx,
          { workerId, fromDate, toDate, reason },
          { companyId: auth.companyId, userId: auth.userId },
        ),
      );

      if (out.kind === 'WORKER_NOT_FOUND') {
        reply.code(404).send({ error: 'WORKER_NOT_FOUND' });
        return;
      }

      reply.code(201).send({
        ok: true,
        leaveRequestId: out.leave.id,
        workerId: out.leave.workerId,
        fromDate: out.leave.fromDate.toISOString().slice(0, 10),
        toDate: out.leave.toDate.toISOString().slice(0, 10),
        state: out.leave.state,
      });
    } catch (err) {
      req.log.error({ err }, 'create-leave-request failed');
      reply.code(500).send({ error: 'INTERNAL', message: 'Could not create leave request' });
    }
  });

  for (const action of ['approve', 'reject'] as const) {
    app.post<{ Params: { id: string } }>(
      `/leave-requests/:id/${action}`,
      { preHandler: requireAuth },
      async (req, reply) => {
        await handleDecision(req, reply, action);
      },
    );
  }

  async function handleDecision(
    req: DecisionRequest,
    reply: FastifyReply,
    action: DecisionKind,
  ): Promise<void> {
    const auth = req.auth;
    if (!auth) {
      reply.code(401).send({ error: 'AUTH_REQUIRED', message: 'No auth on request' });
      return;
    }

    // HR A1 (Task 7) — role gate. SUPERVISOR or HR may decide leave. HR
    // is further pod-scoped: the worker's membership must be in one of
    // the HR's owned pods (primary or backup). @derives(spec 3.3)
    if (auth.role !== 'SUPERVISOR' && auth.role !== 'HR') {
      reply.code(403).send({ error: 'SUPERVISOR_OR_HR_REQUIRED' });
      return;
    }

    // [ORCHESTRATOR_EXCEPTION] worker-identity contract — LeaveRequest.workerId is Worker.id; join through Worker.user.memberships
    if (auth.role === 'HR') {
      // LeaveRequest.workerId references Worker.id (schema line 510-524).
      // Join through Worker → User → Membership to resolve the worker's
      // current pod assignment. The prior implementation used workerId as
      // User.id which silently returned null podId for every leave.
      // @derives(parent-brief 2026-05-29)
      const leaveForPodCheck = await prisma.leaveRequest.findFirst({
        where: { id: req.params.id, companyId: auth.companyId },
        select: {
          worker: {
            select: {
              user: {
                select: {
                  memberships: {
                    where: { companyId: auth.companyId, role: 'WORKER' },
                    select: { podId: true },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      });
      if (leaveForPodCheck) {
        const workerPodId = leaveForPodCheck.worker?.user?.memberships?.[0]?.podId ?? null;
        if (!workerPodId) {
          reply.code(403).send({ error: 'WORKER_NOT_IN_POD' });
          return;
        }
        const myPodIds = await getMyPodIds(prisma, auth.userId, auth.companyId);
        if (!myPodIds.includes(workerPodId)) {
          reply.code(403).send({ error: 'NOT_YOUR_POD' });
          return;
        }
      }
      // If leave doesn't exist (cross-tenant or wrong id), fall through
      // to the transactional path which returns 404 LEAVE_NOT_FOUND.
    }

    const parsed = LeaveDecisionInput.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
      return;
    }

    const leaveRequestId = req.params.id;
    // Prefer `reason` (Wave 2 reason-sheet); fall back to `note` for
    // back-compat with older mobile builds. Either field, if present, is
    // the supervisor's reason for the decision — distinct from the
    // worker's original `LeaveRequest.reason`.
    const decisionReason = parsed.data.reason ?? parsed.data.note ?? null;
    // Reject path requires a reason — per Wave 2 spec the mobile shows a
    // reason-sheet on Reject. Approve may omit reason.
    if (action === 'reject' && (!decisionReason || decisionReason.length === 0)) {
      reply.code(400).send({
        error: 'REASON_REQUIRED',
        message: 'Provide a reason when rejecting a leave request.',
      });
      return;
    }
    const newState = action === 'approve' ? 'APPROVED' : 'REJECTED';

    try {
      const out = await withTenantContext(prisma, auth.companyId, async (tx) => {
        const leave = await tx.leaveRequest.findFirst({
          where: { id: leaveRequestId, companyId: auth.companyId },
          include: { worker: true },
        });
        if (!leave) {
          return { kind: 'NOT_FOUND' as const };
        }
        if (leave.state !== 'REQUESTED') {
          return { kind: 'ALREADY_DECIDED' as const, state: leave.state };
        }

        // SUPERVISOR portfolio check — caller must supervise the worker's
        // primary site. LeaveRequest has no "originating supervisor"
        // field (workers request their own leave; supervisors only
        // decide), so portfolio binding is the only valid responsibility
        // gate for SUPERVISOR. HR callers already passed the pod-scope
        // gate above (Task 7 / spec 3.3). @derives(spec 3.3)
        if (auth.role === 'SUPERVISOR') {
          const workerPrimarySiteId = await deriveWorkerPrimarySiteId(tx, {
            companyId: auth.companyId,
            workerId: leave.workerId,
          });
          const portfolio = await getSitesSupervisedByUser(tx, {
            companyId: auth.companyId,
            userId: auth.userId,
          });
          const portfolioSiteIds = new Set(portfolio.map((p) => p.siteId));
          const isResponsibleSupervisor =
            workerPrimarySiteId !== null && portfolioSiteIds.has(workerPrimarySiteId);
          if (!isResponsibleSupervisor) {
            return { kind: 'NOT_RESPONSIBLE' as const };
          }
        }

        const decidedAt = new Date();
        // Cluster A fix (P0) — conditional UPDATE so concurrent deciders
        // can't both succeed. Without this guard the earlier
        // findFirst→update pattern allows two callers to pass the
        // `state === 'REQUESTED'` check and both fire side effects.
        const updateResult = await tx.leaveRequest.updateMany({
          where: { id: leave.id, companyId: auth.companyId, state: 'REQUESTED' },
          data: {
            state: newState,
            decidedBy: auth.userId,
            decidedAt,
            decisionNote: decisionReason,
          },
        });
        if (updateResult.count === 0) {
          // Race: another caller decided between our read and our write.
          // Re-read to surface the actual terminal state to the loser.
          const after = await tx.leaveRequest.findFirstOrThrow({
            where: { id: leave.id, companyId: auth.companyId },
            select: { state: true },
          });
          return { kind: 'ALREADY_DECIDED' as const, state: after.state };
        }
        const updated = await tx.leaveRequest.findFirstOrThrow({
          where: { id: leave.id, companyId: auth.companyId },
        });

        await recordAuditEvent(tx, {
          companyId: auth.companyId,
          kind: action === 'approve' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
          actorId: auth.userId,
          targetId: leave.id,
          payload: {
            workerId: leave.workerId,
            workerName: leave.worker.name,
            fromDate: leave.fromDate.toISOString().slice(0, 10),
            toDate: leave.toDate.toISOString().slice(0, 10),
            // Original worker-supplied reason for the leave.
            workerReason: leave.reason,
            // Supervisor's decision reason (Cluster A fix — this used to
            // be overwritten by `leave.reason` and the supervisor's
            // typed reason was silently discarded).
            decisionReason,
          },
        });

        await enqueueOutbox(tx, {
          companyId: auth.companyId,
          topic: action === 'approve' ? 'worker.leave_approved' : 'worker.leave_rejected',
          payload: {
            leaveRequestId: leave.id,
            workerId: leave.workerId,
            workerName: leave.worker.name,
            workerPhone: leave.worker.phone,
            fromDate: leave.fromDate.toISOString().slice(0, 10),
            toDate: leave.toDate.toISOString().slice(0, 10),
            decidedBy: auth.userId,
            decisionReason,
          },
        });

        return { kind: 'OK' as const, leave: updated };
      });

      if (out.kind === 'NOT_FOUND') {
        reply.code(404).send({ error: 'LEAVE_NOT_FOUND', message: 'Leave request not found' });
        return;
      }
      if (out.kind === 'NOT_RESPONSIBLE') {
        reply.code(403).send({
          error: 'NOT_RESPONSIBLE',
          message:
            "You are not the supervisor responsible for this worker. Only the originating supervisor or a supervisor bound to the worker's primary site may decide this leave.",
        });
        return;
      }
      if (out.kind === 'ALREADY_DECIDED') {
        reply.code(409).send({
          error: 'ALREADY_DECIDED',
          message: `Leave request is already ${out.state}; cannot ${action} again`,
          state: out.state,
        });
        return;
      }

      const result: LeaveDecisionOutput = {
        ok: true,
        leaveRequestId: out.leave.id,
        workerId: out.leave.workerId,
        state: newState,
        decidedBy: auth.userId,
        decidedAt: out.leave.decidedAt!.toISOString(),
      };
      reply.send(result);
    } catch (err) {
      req.log.error({ err }, `${action}-leave failed`);
      reply.code(500).send({ error: 'INTERNAL', message: `Could not ${action} leave request` });
    }
  }

  // ─── GET /leave-requests (HR inbox) ───────────────────────────────────────
  //
  // HR sees REQUESTED leaves where the worker's membership is in one of
  // HR's owned pods (primary or backup). Cursor pagination on createdAt DESC.
  // @derives(spec 3.1, HR A1 Task 7)
  app.get(
    '/leave-requests',
    { preHandler: [requireAuth, requireRole('HR')] },
    async (req, reply) => {
      const auth = req.auth!;
      const parsed = ListQuery.safeParse(req.query);
      if (!parsed.success) {
        reply.code(400).send({ error: 'QUERY_INVALID' });
        return;
      }
      const { cursor: rawCursor, limit } = parsed.data;
      const cursor = rawCursor === undefined ? null : decodeCursor(rawCursor);
      if (rawCursor !== undefined && cursor === null) {
        reply.code(400).send({ error: 'CURSOR_INVALID' });
        return;
      }

      // [ORCHESTRATOR_EXCEPTION] worker-identity contract — filter via Worker join, not via User.id list
      // LeaveRequest.workerId IS Worker.id (schema line 524). The prior
      // implementation filtered by `workerId IN <User.ids>` which returned
      // zero rows for every HR caller. Correct path: filter via the
      // worker relation (Worker → User → Membership in caller pods).
      // @derives(parent-brief 2026-05-29)
      const myPodIds = await getMyPodIds(prisma, auth.userId, auth.companyId);

      type LeaveWhere = NonNullable<Parameters<typeof prisma.leaveRequest.findMany>[0]>['where'];
      const where: LeaveWhere = {
        companyId: auth.companyId,
        state: 'REQUESTED',
        worker: {
          user: {
            memberships: {
              some: {
                companyId: auth.companyId,
                role: 'WORKER',
                podId: { in: myPodIds },
              },
            },
          },
        },
      };
      if (cursor) {
        where.OR = [
          { createdAt: { lt: cursor.createdAt } },
          {
            AND: [{ createdAt: cursor.createdAt }, { id: { lt: cursor.id } }],
          },
        ];
      }
      const rows = await prisma.leaveRequest.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
      });
      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const items = page.map((r) => ({
        id: r.id,
        workerId: r.workerId,
        fromDate: r.fromDate.toISOString().slice(0, 10),
        toDate: r.toDate.toISOString().slice(0, 10),
        reason: r.reason,
        state: r.state,
        createdAt: r.createdAt.toISOString(),
      }));
      const last = page.at(-1);
      reply.send({
        items,
        nextCursor:
          hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
      });
    },
  );

  // ─── GET /leave-requests/:id (detail) ─────────────────────────────────────
  //
  // HR sees details iff worker is in HR's pod (404 otherwise to avoid
  // leaking existence). SUPERVISOR sees details iff portfolio includes
  // the worker's primary site. Cross-tenant always 404.
  // @derives(parent-deviation HR A1 Task 7)
  // [ORCHESTRATOR_EXCEPTION] worker-identity contract — join through Worker.user.memberships; expose workerName/workerPhone per parent brief
  app.get<{ Params: { id: string } }>(
    '/leave-requests/:id',
    { preHandler: [requireAuth, requireRole('HR', 'SUPERVISOR')] },
    async (req, reply) => {
      const auth = req.auth!;
      // Fetch leave with worker join (worker name+phone needed for response)
      // plus the worker's WORKER membership in this company (for HR pod gate).
      // @derives(parent-brief 2026-05-29)
      const leave = await prisma.leaveRequest.findFirst({
        where: { id: req.params.id, companyId: auth.companyId },
        include: {
          worker: {
            select: {
              id: true,
              name: true,
              phone: true,
              userId: true,
              user: {
                select: {
                  memberships: {
                    where: { companyId: auth.companyId, role: 'WORKER' },
                    select: { podId: true },
                    take: 1,
                  },
                },
              },
            },
          },
        },
      });
      if (!leave) {
        reply.code(404).send({ error: 'LEAVE_NOT_FOUND' });
        return;
      }

      if (auth.role === 'HR') {
        const workerPodId = leave.worker?.user?.memberships?.[0]?.podId ?? null;
        if (!workerPodId) {
          reply.code(404).send({ error: 'LEAVE_NOT_FOUND' });
          return;
        }
        const myPodIds = await getMyPodIds(prisma, auth.userId, auth.companyId);
        if (!myPodIds.includes(workerPodId)) {
          reply.code(404).send({ error: 'LEAVE_NOT_FOUND' });
          return;
        }
      } else {
        // SUPERVISOR — portfolio binding gate (responsibility-model §5.9).
        const workerPrimarySiteId = await deriveWorkerPrimarySiteId(prisma, {
          companyId: auth.companyId,
          workerId: leave.workerId,
        });
        const portfolio = await getSitesSupervisedByUser(prisma, {
          companyId: auth.companyId,
          userId: auth.userId,
        });
        const portfolioSiteIds = new Set(portfolio.map((p) => p.siteId));
        const isResponsibleSupervisor =
          workerPrimarySiteId !== null && portfolioSiteIds.has(workerPrimarySiteId);
        if (!isResponsibleSupervisor) {
          reply.code(404).send({ error: 'LEAVE_NOT_FOUND' });
          return;
        }
      }

      reply.send({
        id: leave.id,
        workerId: leave.workerId,
        workerName: leave.worker.name,
        workerPhone: leave.worker.phone,
        fromDate: leave.fromDate.toISOString().slice(0, 10),
        toDate: leave.toDate.toISOString().slice(0, 10),
        reason: leave.reason,
        state: leave.state,
        decidedBy: leave.decidedBy,
        decidedAt: leave.decidedAt ? leave.decidedAt.toISOString() : null,
        decisionNote: leave.decisionNote,
        createdAt: leave.createdAt.toISOString(),
      });
    },
  );
}
