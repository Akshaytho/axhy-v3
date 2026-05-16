/**
 * Effective-responsibility read-time helpers — foundation read APIs for routing.
 *
 * SINGLE SOURCE OF TRUTH for "who is currently the responsible supervisor for
 * site S at time T" + "what is worker W's primary site at time T". All
 * consumers (current and future) must route through these helpers; the
 * underlying SQL predicates are NOT to be re-formed inline anywhere else in
 * the codebase. If you find yourself writing
 *   { endedAt: null, effectiveFrom: { lte: ... }, ... }
 * outside this file, you are drifting — call getEffectiveBinding instead.
 *
 * Scope: read-time routing only. Writes (binding creation, supersession,
 * manual ending) live in apps/backend/src/lib/site-supervisor-binding.ts.
 *
 * @derives(supervisor-responsibility-model §5.5 + §5.8 + §5.9 + §7)
 * @derives(workflow-design-closure §3.1)
 * @derives(panel-2026-05-15) — Layer 1 routing slice
 */

import type { Prisma } from '@prisma/client';

/** @derives(ADR-0003) @derives(master-plan §G) — HR control plane / responsibility model */
export type EffectiveBindingResult = {
  bindingId: string;
  companyId: string;
  siteId: string;
  userId: string;
  kind: 'ACTING' | 'PERMANENT';
  actingForUserId: string | null;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
} | null;

/** @derives(ADR-0003) @derives(master-plan §G) — HR control plane / responsibility model */
export type EffectiveBindingArgs = {
  companyId: string;
  siteId: string;
  /** Defaults to `new Date()`. Used for historical + future-dated point-in-time queries. */
  at?: Date;
};

/**
 * Return the binding effective for (companyId, siteId) at the given instant,
 * applying the precedence rule from responsibility-model §5.8: a temporary
 * ACTING binding overrides the baseline PERMANENT binding for the duration of
 * its window. The acting row is the answer when one exists; otherwise the
 * permanent row is the answer. Returns null when no binding is effective.
 *
 * Effective-at-T predicate (canonical, anti-drift):
 *   endedAt IS NULL
 *   AND effectiveFrom <= T
 *   AND (effectiveUntil IS NULL OR effectiveUntil > T)
 *
 * The acting + permanent rows can coexist in the result set (P1.5 EXCLUDE
 * constraint permits stacking different kinds). We sort acting-first to apply
 * precedence cheaply in one query.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / responsibility model
 * @derives(supervisor-responsibility-model §5.8 — precedence rule)
 */
export async function getEffectiveBinding(
  tx: Prisma.TransactionClient,
  args: EffectiveBindingArgs,
): Promise<EffectiveBindingResult> {
  const at = args.at ?? new Date();

  const rows = await tx.siteSupervisorBinding.findMany({
    where: {
      companyId: args.companyId,
      siteId: args.siteId,
      endedAt: null,
      effectiveFrom: { lte: at },
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: at } }],
    },
  });

  if (rows.length === 0) return null;

  // Precedence: ACTING (actingForUserId != null) beats PERMANENT.
  // EXCLUDE constraint already guarantees at most one of each kind active,
  // so a candidate set has at most 2 rows (one acting + one permanent).
  const acting = rows.find((r) => r.actingForUserId !== null);
  const permanent = rows.find((r) => r.actingForUserId === null);
  const winner = acting ?? permanent ?? null;
  if (!winner) return null;

  return {
    bindingId: winner.id,
    companyId: winner.companyId,
    siteId: winner.siteId,
    userId: winner.userId,
    kind: winner.actingForUserId === null ? 'PERMANENT' : 'ACTING',
    actingForUserId: winner.actingForUserId,
    effectiveFrom: winner.effectiveFrom,
    effectiveUntil: winner.effectiveUntil,
  };
}

/**
 * Thin convenience wrapper — returns just the responsible userId, or null.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / responsibility model
 */
export async function getEffectiveResponsibleUserId(
  tx: Prisma.TransactionClient,
  args: EffectiveBindingArgs,
): Promise<string | null> {
  const binding = await getEffectiveBinding(tx, args);
  return binding ? binding.userId : null;
}

/** @derives(ADR-0003) @derives(master-plan §G) — responsibility-model §5.9 derivation */
export type DeriveWorkerPrimarySiteIdArgs = {
  companyId: string;
  workerId: string;
  /** Defaults to `new Date()`. Drives the assignment-validity-at-T check. */
  at?: Date;
};

/**
 * Derive a worker's primary site for read-time routing of worker-targeted
 * DWIs (MARK_ABSENT, APPROVE_LEAVE, etc.) per responsibility-model §5.9.
 *
 * Point-in-time aware: fallback chain runs at the supplied `at`.
 *
 *   1. Effective-at-T match:
 *        state = 'ACTIVE'
 *        AND validFrom <= at
 *        AND (validUntil IS NULL OR validUntil >= at)
 *      → most recent by createdAt.
 *   2. Most-recent state='ACTIVE' regardless of validity window.
 *   3. Most-recent assignment of any state.
 *   4. null (worker has never been placed).
 *
 * SINGLE SOURCE OF TRUTH for this derivation. Do not re-form the predicate
 * elsewhere. Spec note: Worker has no `primarySiteId` column at launch —
 * derivation is always read-time.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / responsibility model
 * @derives(supervisor-responsibility-model §5.9 — worker→primary-site derivation)
 */
export async function deriveWorkerPrimarySiteId(
  tx: Prisma.TransactionClient,
  args: DeriveWorkerPrimarySiteIdArgs,
): Promise<string | null> {
  const at = args.at ?? new Date();

  // Tier 1: assignment effective at T
  const effective = await tx.assignment.findFirst({
    where: {
      companyId: args.companyId,
      workerId: args.workerId,
      state: 'ACTIVE',
      validFrom: { lte: at },
      OR: [{ validUntil: null }, { validUntil: { gte: at } }],
    },
    orderBy: { createdAt: 'desc' },
    select: { siteId: true },
  });
  if (effective) return effective.siteId;

  // Tier 2: most-recent ACTIVE regardless of validity
  const recentActive = await tx.assignment.findFirst({
    where: { companyId: args.companyId, workerId: args.workerId, state: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
    select: { siteId: true },
  });
  if (recentActive) return recentActive.siteId;

  // Tier 3: most-recent assignment of any state
  const recentAny = await tx.assignment.findFirst({
    where: { companyId: args.companyId, workerId: args.workerId },
    orderBy: { createdAt: 'desc' },
    select: { siteId: true },
  });
  return recentAny?.siteId ?? null;
}
