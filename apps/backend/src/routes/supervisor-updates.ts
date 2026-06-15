/**
 * Supervisor HR Updates routes.
 *
 * GET /supervisor/updates
 *   Returns HR policy updates visible to the calling supervisor, split into
 *   `needsAck` and `recentAcked` sections. JWT-implicit; never accepts
 *   `companyId` from the client. RLS via `tenantReadClient` (company GUC per
 *   query, pool parallelism kept); the ack POST writes via withTenantContext.
 *
 * POST /supervisor/updates/:id/acknowledge
 *   Records the supervisor's 5-word own-voice acknowledgement of an HR update.
 *   Body: `{ text: string }`. Server validates `text` has >= 5 whitespace-
 *   delimited words. On success writes the ack onto the HRUpdate row and
 *   enqueues an HR_UPDATE_ACKED AuditEvent for the caller.
 *
 *   Errors:
 *     400 VALIDATION_FAILED — text has fewer than 5 words
 *     404 NOT_FOUND — HRUpdate not found in this tenant
 *     500 INTERNAL — unexpected DB error
 *
 * Schema note: per-supervisor acks live in the HRUpdateAck join table (one row
 * per update × supervisor), the source of truth for who-acked reporting. The
 * single `acknowledgedBy`/`acknowledgmentPhrase`/`acknowledgedAt` columns on
 * HRUpdate are kept as a back-compat mirror of the most-recent ack. The 5-word
 * own-words model still applies: no matching phrase is required, only 5+ words.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 */

import type { FastifyInstance } from 'fastify';
import { HRAckRequestBody } from '@axhy/shared-schema';

import { prisma } from '../lib/prisma.js';
import { requireAuth, tenantReadClient, withTenantContext } from '../middleware/tenant-context.js';
import { requireRole } from '../middleware/role-gates.js';
import { buildHRUpdatesForSupervisor } from '../lib/services/hr-updates-service.js';

/** Minimum words required in the ack text. */
const MIN_ACK_WORDS = 5;

/**
 * Returns the whitespace-delimited word count for a trimmed string.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 */
function wordCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Register GET /supervisor/updates and POST /supervisor/updates/:id/acknowledge.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 */
export async function registerSupervisorUpdatesRoutes(app: FastifyInstance): Promise<void> {
  // ---------------------------------------------------------------------------
  // GET /supervisor/updates — HR update feed
  // ---------------------------------------------------------------------------
  app.get(
    '/supervisor/updates',
    { preHandler: [requireAuth, requireRole('SUPERVISOR')] },
    async (req, reply) => {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED', message: 'No auth on request' });
        return;
      }

      try {
        // RLS Option-A + Cluster-1 latency fix together: tenantReadClient sets
        // the company GUC per query in its own batch tx — HRUpdate reads pass
        // RLS under axhy_app while staying parallel on the pool.
        const out = await buildHRUpdatesForSupervisor(tenantReadClient(prisma, auth.companyId), {
          companyId: auth.companyId,
          userId: auth.userId,
        });
        reply.code(200).send(out);
      } catch (err) {
        req.log.error({ err }, 'GET /supervisor/updates failed');
        reply.code(500).send({ error: 'INTERNAL', message: 'Could not build HR updates feed' });
      }
    },
  );

  // ---------------------------------------------------------------------------
  // POST /supervisor/updates/:id/acknowledge — write 5-word ack
  // ---------------------------------------------------------------------------
  app.post(
    '/supervisor/updates/:id/acknowledge',
    { preHandler: [requireAuth, requireRole('SUPERVISOR')] },
    async (req, reply) => {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED', message: 'No auth on request' });
        return;
      }

      const { id } = req.params as { id: string };

      // Parse + validate request body.
      const parsed = HRAckRequestBody.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({
          error: 'VALIDATION_FAILED',
          message: 'Request body must be { text: string }',
        });
        return;
      }
      const { text } = parsed.data;

      // Server-side word count gate — never trust the client.
      if (wordCount(text) < MIN_ACK_WORDS) {
        reply.code(400).send({
          error: 'VALIDATION_FAILED',
          message: `Acknowledgement text must contain at least ${MIN_ACK_WORDS} words.`,
        });
        return;
      }

      try {
        await withTenantContext(prisma, auth.companyId, async (tx) => {
          // Verify the update exists in this tenant and is visible to this supervisor.
          const update = await tx.hRUpdate.findFirst({
            where: {
              id,
              companyId: auth.companyId,
              OR: [{ targetSupervisorId: null }, { targetSupervisorId: auth.userId }],
            },
          });

          if (!update) {
            return reply.code(404).send({
              error: 'NOT_FOUND',
              message: 'HR update not found or not accessible',
            });
          }

          const now = new Date();

          // Legacy single-ack write (back-compat): mirror the most-recent ack onto
          // the HRUpdate row so older readers keep working. Idempotent.
          await tx.hRUpdate.update({
            where: { id },
            data: {
              acknowledgedBy: auth.userId,
              acknowledgedAt: now,
              acknowledgmentPhrase: text,
            },
          });

          // Per-supervisor ack row — the real source of truth for who-acked
          // reporting (a company-wide update can be acked by many supervisors).
          // Idempotent on (hrUpdateId, supervisorUserId): re-acking updates the
          // text + time rather than duplicating.
          await tx.hRUpdateAck.upsert({
            where: {
              hrUpdateId_supervisorUserId: { hrUpdateId: id, supervisorUserId: auth.userId },
            },
            create: {
              companyId: auth.companyId,
              hrUpdateId: id,
              supervisorUserId: auth.userId,
              ackText: text,
            },
            update: { ackText: text, ackedAt: now },
          });

          // Write audit event inside the same transaction.
          await tx.auditEvent.create({
            data: {
              companyId: auth.companyId,
              kind: 'HR_UPDATE_ACKED',
              actorId: auth.userId,
              targetId: id,
              payload: { ackTextWordCount: wordCount(text) },
            },
          });
        });

        reply.code(200).send({ ok: true, acknowledged: true });
      } catch (err) {
        req.log.error({ err }, 'POST /supervisor/updates/:id/acknowledge failed');
        reply.code(500).send({ error: 'INTERNAL', message: 'Could not record acknowledgement' });
      }
    },
  );
}
