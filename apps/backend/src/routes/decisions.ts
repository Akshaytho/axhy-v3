/**
 * Decisions read-time routing routes.
 *
 * GET /decisions/proposed-for-me
 *   Foundation read API for routing. Returns PROPOSED SupervisorDecision
 *   rows where the caller is the effective responsible supervisor for the
 *   decision's derived site at "now".
 *
 *   No existing read-time-routing consumer to rewire (none exists today);
 *   this is a net-new foundation read API. Future Today/Decisions UI
 *   surfaces route through getEffectiveBinding + deriveWorkerPrimarySiteId
 *   directly.
 *
 *   siteId derivation per kind (narrow, file-grounded):
 *     - MARK_ABSENT, APPROVE_LEAVE  → targetId is a Worker → deriveWorkerPrimarySiteId
 *     - LOG_COMPLAINT               → targetId is a Site directly
 *     - anything else (including future-named termination kinds)
 *                                   → origin-supervisor fallback: caller
 *                                     sees the row iff supervisorId === auth.userId
 *
 *   The supported-kinds list is deliberately narrow per the routing-slice
 *   scope review. Additional kinds get derivation entries when their writer
 *   code lands. The repo today has zero SupervisorDecision writers, so the
 *   kinds we support here are exercised only via test seed inserts.
 *
 * @derives(supervisor-responsibility-model §5.8 + §5.9 + §7.ii)
 * @derives(workflow-design-closure §3.1)
 * @derives(panel-2026-05-15) — Layer 1 routing slice
 */

import type { FastifyInstance } from 'fastify';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
import {
  deriveWorkerPrimarySiteId,
  getEffectiveResponsibleUserId,
} from '../lib/effective-responsibility.js';

// Kinds whose targetId is a Worker; siteId derived via §5.9 primary-site rule.
const WORKER_TARGETED_KINDS: ReadonlySet<string> = new Set(['MARK_ABSENT', 'APPROVE_LEAVE']);

// Kinds whose targetId is a Site; use directly.
const SITE_TARGETED_KINDS: ReadonlySet<string> = new Set(['LOG_COMPLAINT']);

/**
 * Register /decisions read-time-routing routes.
 *
 * @derives(ADR-0007) — JWT + tenant-context middleware
 * @derives(master-plan §G) — HR control plane / responsibility model
 */
export async function registerDecisionsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/decisions/proposed-for-me', { preHandler: requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) {
      reply.code(401).send({ error: 'AUTH_REQUIRED', message: 'No auth on request' });
      return;
    }

    const now = new Date();

    try {
      const out = await withTenantContext(prisma, auth.companyId, async (tx) => {
        // Pull PROPOSED candidates for the tenant. Pre-filter by either
        // (a) origin matches the caller (so the fallback path is cheap)
        // OR (b) kind is one we route by binding lookup (so we have to
        // check current responsibility). Single query keeps the surface
        // simple at small Layer-1 volumes; later slices may paginate.
        const candidates = await tx.supervisorDecision.findMany({
          where: {
            companyId: auth.companyId,
            appliedAt: null,
          },
          orderBy: { createdAt: 'desc' },
          take: 200,
        });

        const matched: typeof candidates = [];

        for (const dwi of candidates) {
          const routedToMe = await isRoutedToCaller(tx, {
            companyId: auth.companyId,
            callerUserId: auth.userId,
            dwi,
            now,
          });
          if (routedToMe) matched.push(dwi);
        }

        return matched;
      });

      reply.send({
        decisions: out.map((d) => ({
          id: d.id,
          kind: d.kind,
          tier: d.tier,
          targetId: d.targetId,
          supervisorId: d.supervisorId,
          payload: d.payload,
          createdAt: d.createdAt.toISOString(),
        })),
      });
    } catch (err) {
      req.log.error({ err }, 'decisions-proposed-for-me failed');
      reply.code(500).send({ error: 'INTERNAL', message: 'Could not list proposed decisions' });
    }
  });
}

/**
 * Resolve whether the caller should currently see a given PROPOSED DWI row.
 * Returns true iff:
 *   - kind is worker-targeted and the worker's primary site at `now` routes
 *     to the caller via effective binding, OR
 *   - kind is site-targeted and the site routes to the caller via effective
 *     binding at `now`, OR
 *   - kind is unsupported and the caller is the row's origin supervisor.
 *
 * The active-binding + primary-site predicates live in
 * effective-responsibility.ts; this function does NOT re-form them.
 *
 * @derives(supervisor-responsibility-model §5.9)
 * @derives(master-plan §G)
 */
async function isRoutedToCaller(
  tx: Parameters<typeof getEffectiveResponsibleUserId>[0],
  args: {
    companyId: string;
    callerUserId: string;
    dwi: {
      kind: string;
      targetId: string | null;
      supervisorId: string;
    };
    now: Date;
  },
): Promise<boolean> {
  const { companyId, callerUserId, dwi, now } = args;

  if (WORKER_TARGETED_KINDS.has(dwi.kind) && dwi.targetId) {
    const siteId = await deriveWorkerPrimarySiteId(tx, {
      companyId,
      workerId: dwi.targetId,
      at: now,
    });
    if (!siteId) {
      // Worker has no primary site derivable — fall back to origin.
      return dwi.supervisorId === callerUserId;
    }
    const responsible = await getEffectiveResponsibleUserId(tx, { companyId, siteId, at: now });
    return responsible === callerUserId;
  }

  if (SITE_TARGETED_KINDS.has(dwi.kind) && dwi.targetId) {
    const responsible = await getEffectiveResponsibleUserId(tx, {
      companyId,
      siteId: dwi.targetId,
      at: now,
    });
    return responsible === callerUserId;
  }

  // Unsupported kind: origin-supervisor fallback.
  return dwi.supervisorId === callerUserId;
}
