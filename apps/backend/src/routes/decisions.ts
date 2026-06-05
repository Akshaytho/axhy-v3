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
import { z } from 'zod';
import { routingModeFor } from '@axhy/shared-schema';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
import { requireRole } from '../middleware/role-gates.js';
import {
  deriveWorkerPrimarySiteId,
  getEffectiveResponsibleUserId,
} from '../lib/effective-responsibility.js';
import { dismissProposedDecision, LifecycleError } from '../lib/supervisor-decision-writer.js';

/**
 * Body schema for POST /decisions/:id/dismiss. The `reason` is mandatory and
 * surfaces in DwiDismissedPayload.dismissedReason + the row's dismissedReason
 * column. Length cap mirrors the audit payload schema.
 * @derives(F-002 scope §3c)
 */
const DismissDecisionBody = z
  .object({
    reason: z.string().min(1).max(2000),
  })
  .strict();

// F-002.6: kind-routing now driven by DECISION_KIND_REGISTRY. Adding a new
// kind in shared-schema/zod/supervisor-decision-kinds.ts wires it through
// here automatically. No parallel sets that can drift.

/**
 * Register /decisions read-time-routing routes.
 *
 * @derives(ADR-0007) — JWT + tenant-context middleware
 * @derives(master-plan §G) — HR control plane / responsibility model
 */
export async function registerDecisionsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/decisions/proposed-for-me',
    { preHandler: [requireAuth, requireRole('SUPERVISOR')] },
    async (req, reply) => {
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
          // F-002 §3c: PROPOSED predicate tightened — now excludes dismissed
          // rows too, since dismiss is part of the lifecycle this slice ships.
          const candidates = await tx.supervisorDecision.findMany({
            where: {
              companyId: auth.companyId,
              appliedAt: null,
              dismissedAt: null,
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
    },
  );

  /**
   * POST /decisions/:id/dismiss — F-002 §3c.
   *
   * Transitions a PROPOSED row to DISMISSED. Authorization mirrors apply:
   * the currently responsible supervisor for binding-routable kinds, the
   * original supervisor otherwise. Records `dismissedAt` + `dismissedReason`
   * and emits DWI_DISMISSED in one transaction.
   *
   * Returns 200 { decisionId, dismissedAt } on success. Errors map to:
   *   404 NOT_FOUND / CROSS_TENANT
   *   403 NOT_RESPONSIBLE
   *   409 ALREADY_APPLIED / ALREADY_DISMISSED
   *   400 BAD_INPUT (missing or invalid reason)
   *
   * @derives(F-002 scope §3c)
   * @derives(workflow-design-closure §3.2)
   */
  app.post(
    '/decisions/:id/dismiss',
    { preHandler: [requireAuth, requireRole('SUPERVISOR')] },
    async (req, reply) => {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED', message: 'No auth on request' });
        return;
      }
      const { id } = req.params as { id?: string };
      if (!id) {
        reply.code(400).send({ error: 'BAD_INPUT', message: 'Missing :id route param' });
        return;
      }
      const parsedBody = DismissDecisionBody.safeParse(req.body);
      if (!parsedBody.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsedBody.error.message });
        return;
      }

      try {
        const result = await withTenantContext(prisma, auth.companyId, async (tx) =>
          dismissProposedDecision(tx, {
            companyId: auth.companyId,
            decisionId: id,
            actorUserId: auth.userId,
            reason: parsedBody.data.reason,
          }),
        );
        reply.send({
          decisionId: result.decisionId,
          dismissedAt: result.dismissedAt.toISOString(),
        });
      } catch (err) {
        if (err instanceof LifecycleError) {
          const httpStatus =
            err.code === 'NOT_FOUND' || err.code === 'CROSS_TENANT'
              ? 404
              : err.code === 'NOT_RESPONSIBLE'
                ? 403
                : 409;
          reply.code(httpStatus).send({ error: err.code });
          return;
        }
        req.log.error({ err }, 'decision-dismiss failed');
        reply.code(500).send({ error: 'INTERNAL', message: 'Could not dismiss decision' });
      }
    },
  );
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
  const mode = routingModeFor(dwi.kind);

  // F-002.6 — routingMode is the discriminator. Pre-remediation this was two
  // parallel constant sets (WORKER_TARGETED_KINDS + SITE_TARGETED_KINDS) that
  // drifted from TOOL_TO_DWI in supervisor-decision-writer.ts. Unifying via
  // DECISION_KIND_REGISTRY removes the drift. Adding SWAP_WORKER /
  // TERMINATE_WORKER / CREATE_ASSIGNMENT to the registry automatically picks
  // them up here.
  if (mode === 'worker-targeted' && dwi.targetId) {
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

  if (mode === 'site-targeted' && dwi.targetId) {
    const responsible = await getEffectiveResponsibleUserId(tx, {
      companyId,
      siteId: dwi.targetId,
      at: now,
    });
    return responsible === callerUserId;
  }

  // 'origin-only' (registry-explicit) OR no targetId on a binding-routable kind:
  // fall back to origin supervisor.
  return dwi.supervisorId === callerUserId;
}
