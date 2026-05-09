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
      const out = await withTenantContext(prisma, auth.companyId, async (tx) => {
        const worker = await tx.worker.findFirst({
          where: { id: workerId, companyId: auth.companyId },
        });
        if (!worker) return { kind: 'NOT_FOUND' as const };

        const leave = await tx.leaveRequest.create({
          data: {
            companyId: auth.companyId,
            workerId,
            fromDate: new Date(fromDate),
            toDate: new Date(toDate),
            reason,
            state: 'REQUESTED',
          },
        });

        await recordAuditEvent(tx, {
          companyId: auth.companyId,
          kind: 'LEAVE_REQUESTED',
          actorId: auth.userId,
          targetId: leave.id,
          payload: { workerId, workerName: worker.name, fromDate, toDate, reason },
        });

        await enqueueOutbox(tx, {
          companyId: auth.companyId,
          topic: 'hr.leave_requested',
          payload: {
            leaveRequestId: leave.id,
            workerId,
            workerName: worker.name,
            workerPhone: worker.phone,
            fromDate,
            toDate,
            reason,
          },
        });

        return { kind: 'OK' as const, leave };
      });

      if (out.kind === 'NOT_FOUND') {
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

    const parsed = LeaveDecisionInput.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
      return;
    }

    const leaveRequestId = req.params.id;
    const note = parsed.data.note ?? null;
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

        const decidedAt = new Date();
        const updated = await tx.leaveRequest.update({
          where: { id: leave.id },
          data: {
            state: newState,
            decidedBy: auth.userId,
            decidedAt,
            decisionNote: note,
          },
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
            reason: leave.reason,
            note,
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
          },
        });

        return { kind: 'OK' as const, leave: updated };
      });

      if (out.kind === 'NOT_FOUND') {
        reply.code(404).send({ error: 'LEAVE_NOT_FOUND', message: 'Leave request not found' });
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
