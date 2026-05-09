/**
 * @derives(master-plan §G)
 */

import type { FastifyInstance } from 'fastify';
import { CreateAssignmentInput } from '@axhy/shared-schema';
import { expandOneOffToRecurring } from '@axhy/state-machines';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
import { recordAuditEvent } from '../lib/audit-event.js';

export async function registerAssignmentRoutes(app: FastifyInstance): Promise<void> {
  app.post('/assignments', { preHandler: requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) {
      reply.code(401).send({ error: 'AUTH_REQUIRED' });
      return;
    }

    const parsed = CreateAssignmentInput.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
      return;
    }

    // Normalize: oneOffDate variant → recurring shape
    let normalized: {
      workerId: string;
      siteId: string;
      dayMask: string;
      shiftStart: string;
      shiftEnd: string;
      validFrom: string;
      validUntil: string | null;
    };
    if ('oneOffDate' in parsed.data) {
      const expanded = expandOneOffToRecurring(parsed.data);
      normalized = { ...expanded };
    } else {
      normalized = {
        workerId: parsed.data.workerId,
        siteId: parsed.data.siteId,
        dayMask: parsed.data.dayMask,
        shiftStart: parsed.data.shiftStart,
        shiftEnd: parsed.data.shiftEnd,
        validFrom: parsed.data.validFrom,
        validUntil: parsed.data.validUntil ?? null,
      };
    }

    const out = await withTenantContext(prisma, auth.companyId, async (tx) => {
      const worker = await tx.worker.findFirst({
        where: { id: normalized.workerId, companyId: auth.companyId },
      });
      if (!worker) return { kind: 'WORKER_NOT_FOUND' as const };
      const site = await tx.site.findFirst({
        where: { id: normalized.siteId, companyId: auth.companyId },
      });
      if (!site) return { kind: 'SITE_NOT_FOUND' as const };

      const assignment = await tx.assignment.create({
        data: {
          companyId: auth.companyId,
          workerId: normalized.workerId,
          siteId: normalized.siteId,
          shiftStart: normalized.shiftStart,
          shiftEnd: normalized.shiftEnd,
          dayMask: normalized.dayMask,
          validFrom: new Date(normalized.validFrom),
          validUntil: normalized.validUntil ? new Date(normalized.validUntil) : null,
          state: 'DRAFT',
        },
      });

      await recordAuditEvent(tx, {
        companyId: auth.companyId,
        kind: 'ASSIGNMENT_CREATED',
        actorId: auth.userId,
        targetId: assignment.id,
        payload: {
          workerId: normalized.workerId,
          workerName: worker.name,
          siteId: normalized.siteId,
          siteName: site.name,
          dayMask: normalized.dayMask,
        },
      });

      return { kind: 'OK' as const, assignment };
    });

    if (out.kind === 'WORKER_NOT_FOUND') {
      reply.code(404).send({ error: 'WORKER_NOT_FOUND' });
      return;
    }
    if (out.kind === 'SITE_NOT_FOUND') {
      reply.code(404).send({ error: 'SITE_NOT_FOUND' });
      return;
    }
    reply.code(200).send({
      id: out.assignment.id,
      state: out.assignment.state,
      dayMask: out.assignment.dayMask,
      validFrom: out.assignment.validFrom.toISOString().slice(0, 10),
      validUntil: out.assignment.validUntil?.toISOString().slice(0, 10) ?? null,
    });
  });
}
