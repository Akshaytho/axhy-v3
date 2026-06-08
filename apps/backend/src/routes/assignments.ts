/**
 * @derives(master-plan §G)
 */

import type { FastifyInstance } from 'fastify';
import { CreateAssignmentInput } from '@axhy/shared-schema';
import { expandOneOffToRecurring } from '@axhy/state-machines';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
import { requireRole } from '../middleware/role-gates.js';
import { createAssignmentService } from '../lib/services/assignment-service.js';

export async function registerAssignmentRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/assignments',
    { preHandler: [requireAuth, requireRole('SUPERVISOR', 'HR')] },
    async (req, reply) => {
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

      // F-002.b (round-2 R2b-iii): the route is now a thin wrapper around
      // createAssignmentService. The same service is called by /chat/apply
      // INSIDE its own withTenantContext, so the lifecycle commit + domain
      // write share one Prisma transaction. See assignment-service.ts for
      // the implementation.
      const out = await withTenantContext(prisma, auth.companyId, async (tx) =>
        createAssignmentService(tx, normalized, {
          companyId: auth.companyId,
          userId: auth.userId,
        }),
      );

      if (out.kind === 'WORKER_NOT_FOUND') {
        reply.code(404).send({ error: 'WORKER_NOT_FOUND' });
        return;
      }
      if (out.kind === 'SITE_NOT_FOUND') {
        reply.code(404).send({ error: 'SITE_NOT_FOUND' });
        return;
      }
      if (out.kind === 'WORKER_DIFFERENT_HR') {
        // One worker = one HR (site-anchored ownership): the worker already
        // belongs to a different HR's sites, so they can't be put on this site.
        reply.code(409).send({
          error: 'WORKER_DIFFERENT_HR',
          message: 'This worker already belongs to a different HR. Reassign their sites first.',
        });
        return;
      }
      reply.code(200).send({
        id: out.assignment.id,
        state: out.assignment.state,
        dayMask: out.assignment.dayMask,
        validFrom: out.assignment.validFrom.toISOString().slice(0, 10),
        validUntil: out.assignment.validUntil?.toISOString().slice(0, 10) ?? null,
      });
    },
  );
}
