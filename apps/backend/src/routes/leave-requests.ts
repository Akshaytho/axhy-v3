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
import { CreateLeaveRequestInput, LeaveDecisionInput } from '@axhy/shared-schema';
import type { LeaveDecisionOutput } from '@axhy/shared-schema';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
import { recordAuditEvent } from '../lib/audit-event.js';
import { enqueueOutbox } from '../lib/outbox.js';
import { createLeaveRequestService } from '../lib/services/leave-request-service.js';
import {
  deriveWorkerPrimarySiteId,
  getSitesSupervisedByUser,
} from '../lib/effective-responsibility.js';

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

    // Cluster A fix (P0) — role gate. Without this, any authenticated user
    // (worker, HR-portal user when it ships, owner) can decide leave on any
    // worker in the tenant. Wave 2's Decisions queue routes the row to the
    // responsible supervisor; the action endpoint must enforce the same
    // identity gate the read-side does.
    if (auth.role !== 'SUPERVISOR') {
      reply.code(403).send({ error: 'SUPERVISOR_ROLE_REQUIRED' });
      return;
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

        // Cluster A fix (P0) — portfolio check mirrors Wave 2's
        // decisions-service `leaveRequestSource`: caller must be a
        // supervisor whose portfolio includes the worker's primary
        // site. LeaveRequest has no "originating supervisor" field
        // (workers request their own leave; supervisors only decide),
        // so portfolio binding is the only valid responsibility gate.
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
}
