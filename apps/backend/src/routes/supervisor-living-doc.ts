/**
 * Supervisor LivingDoc route.
 *
 *   GET /supervisor/living-doc
 *     Returns the calling supervisor's own LivingDoc — the 5 sections
 *     (siteRules, workerNotes, clientPreferences, recurringTasks, freeNotes),
 *     each an array of ACTIVE rules. JWT-implicit via `requireAuth`; never
 *     accepts companyId/supervisorId from the client.
 *
 * WORKER_OWN-visibility rules are filtered OUT before send: per the locked
 * LivingDoc extraction rules they are "visible to nobody directly" (the AI
 * uses them only when answering ABOUT that worker), so they must never reach
 * the supervisor's Memory screen.
 *
 * Pattern mirrors `supervisor-context.ts` — preHandler auth, read-only bare
 * prisma, try/catch. getLivingDoc already scopes by the composite key
 * {companyId, supervisorId} and returns ACTIVE-only sections.
 *
 * @derives(docs/locked/livingdoc-extraction-rules.md)
 * @derives(master-plan §G) — supervisor surface
 */

import type { FastifyInstance } from 'fastify';
import { LivingDocResponse, type LivingDocRule } from '@axhy/shared-schema';

import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/tenant-context.js';
import { requireRole } from '../middleware/role-gates.js';
import { getLivingDoc } from '../lib/living-doc.js';

/** Drop AI-internal WORKER_OWN rules — never surfaced on the supervisor screen. */
function supervisorVisible(rules: LivingDocRule[]): LivingDocRule[] {
  return rules.filter((r) => r.visibility !== 'WORKER_OWN');
}

/**
 * Register GET /supervisor/living-doc.
 *
 * @derives(master-plan §G) — supervisor surface
 */
export async function registerSupervisorLivingDocRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/supervisor/living-doc',
    { preHandler: [requireAuth, requireRole('SUPERVISOR')] },
    async (req, reply) => {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED', message: 'No auth on request' });
        return;
      }

      try {
        // tenant-exempt: read-only, bare prisma; getLivingDoc keys on
        // {companyId, supervisorId=auth.userId} so isolation holds.
        const doc = await getLivingDoc(prisma, auth.companyId, auth.userId, req.log);
        const out = LivingDocResponse.parse({
          id: doc.id,
          companyId: doc.companyId,
          supervisorId: doc.supervisorId,
          version: doc.version,
          siteRules: supervisorVisible(doc.siteRules),
          workerNotes: supervisorVisible(doc.workerNotes),
          clientPreferences: supervisorVisible(doc.clientPreferences),
          recurringTasks: supervisorVisible(doc.recurringTasks),
          freeNotes: supervisorVisible(doc.freeNotes),
        });
        reply.code(200).send(out);
      } catch (err) {
        req.log.error({ err }, 'GET /supervisor/living-doc failed');
        reply.code(500).send({ error: 'INTERNAL', message: 'Could not load living doc' });
      }
    },
  );
}
