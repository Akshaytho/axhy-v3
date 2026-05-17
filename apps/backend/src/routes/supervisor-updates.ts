/**
 * Supervisor HR Updates routes.
 *
 * GET /supervisor/updates
 *   Returns HR policy updates visible to the calling supervisor, split into
 *   `needsAck` and `recentAcked` sections. JWT-implicit; never accepts
 *   `companyId` from the client. Wrapped in `withTenantContext` for RLS.
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
 * Schema note: HRUpdate stores a single `acknowledgedBy` UUID on the row (not
 * a join table). This is v0 — a per-user ack join table is a future slice. The
 * supervisor's typed ack text is stored in `acknowledgmentPhrase` on write
 * (overwriting HR's pre-set phrase, which is intentional for the 5-word own-
 * words model: no matching phrase is required, only 5+ words).
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 */

import type { FastifyInstance } from 'fastify';
import { HRAckRequestBody } from '@axhy/shared-schema';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
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
  app.get('/supervisor/updates', { preHandler: requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) {
      reply.code(401).send({ error: 'AUTH_REQUIRED', message: 'No auth on request' });
      return;
    }

    try {
      const out = await withTenantContext(prisma, auth.companyId, async (tx) =>
        buildHRUpdatesForSupervisor(tx, {
          companyId: auth.companyId,
          userId: auth.userId,
        }),
      );
      reply.code(200).send(out);
    } catch (err) {
      req.log.error({ err }, 'GET /supervisor/updates failed');
      reply.code(500).send({ error: 'INTERNAL', message: 'Could not build HR updates feed' });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /supervisor/updates/:id/acknowledge — write 5-word ack
  // ---------------------------------------------------------------------------
  app.post(
    '/supervisor/updates/:id/acknowledge',
    { preHandler: requireAuth },
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

          // Write ack: store user's text in acknowledgmentPhrase (v0 — no separate ack text column).
          // This is idempotent — re-acknowledging overwrites the prior text.
          await tx.hRUpdate.update({
            where: { id },
            data: {
              acknowledgedBy: auth.userId,
              acknowledgedAt: now,
              acknowledgmentPhrase: text,
            },
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
