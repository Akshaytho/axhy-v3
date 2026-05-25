/**
 * /admin/workers/* routes.
 *
 * - POST /admin/workers              (R2) — HR creates Worker (PENDING_ACTIVATION)
 * - POST /admin/workers/:id/anonymize (R3) — HR resigns Worker
 *
 * @derives(ADR-0026)
 * @derives(ADR-0025)
 * @derives(docs/locked/hiring-hierarchy.md)
 */

import type { FastifyInstance } from 'fastify';
import { AdminCreateWorkerInput, AdminAnonymizeWorkerInput } from '@axhy/shared-schema';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
import { requireRole } from '../middleware/role-gates.js';
import { adminCreateWorkerService } from '../lib/services/admin-worker-service.js';
import { anonymizeWorkerService } from '../lib/services/anonymize-worker-service.js';

/** @derives(ADR-0026) */
export async function registerAdminWorkerRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/admin/workers',
    { preHandler: [requireAuth, requireRole('HR')] },
    async (req, reply) => {
      const auth = req.auth!;
      const parsed = AdminCreateWorkerInput.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
        return;
      }
      const out = await withTenantContext(prisma, auth.companyId, async (tx) =>
        adminCreateWorkerService(tx, {
          callerCompanyId: auth.companyId,
          callerUserId: auth.userId,
          body: parsed.data,
        }),
      );
      if (out.kind === 'ALREADY_EXISTS') {
        reply.code(409).send({
          error: 'WORKER_ALREADY_EXISTS',
          message: 'A worker with this phone already exists in this company',
        });
        return;
      }
      reply.send({
        workerId: out.workerId,
        userId: out.userId,
        membershipId: out.membershipId,
        state: 'PENDING_ACTIVATION',
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/admin/workers/:id/anonymize',
    { preHandler: [requireAuth, requireRole('HR')] },
    async (req, reply) => {
      const auth = req.auth!;
      const parsed = AdminAnonymizeWorkerInput.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
        return;
      }
      const out = await withTenantContext(prisma, auth.companyId, async (tx) =>
        anonymizeWorkerService(tx, {
          workerId: req.params.id,
          callerCompanyId: auth.companyId,
          callerUserId: auth.userId,
          reason: parsed.data.reason,
          effectiveAt: parsed.data.effectiveAt ? new Date(parsed.data.effectiveAt) : undefined,
        }),
      );
      if (out.kind === 'WORKER_NOT_FOUND') {
        reply.code(404).send({
          error: 'WORKER_NOT_FOUND',
          message: 'Worker not found in this company',
        });
        return;
      }
      if (out.kind === 'WORKER_ALREADY_TERMINATED') {
        reply.code(409).send({
          error: 'WORKER_ALREADY_TERMINATED',
          message: 'Worker is already terminated or archived',
        });
        return;
      }
      reply.send({
        workerId: out.workerId,
        anonymizedAt: out.anonymizedAt.toISOString(),
      });
    },
  );
}
