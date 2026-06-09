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

// ===========================================================================
// Reverse query — sites supervised by a given user (P1.5b 2026-05-17)
// ===========================================================================
//
// Companion to getEffectiveBinding (site -> supervisor): this answers
// "what sites is supervisor X responsible for right now?" — the read shape
// used by Today / Decisions / payroll / portfolio views.
//
// Honors §5.8 acting-over-permanent precedence: a user with a PERMANENT
// binding for site S may be overridden by someone else's ACTING binding
// over the same window. The returned set is the set of sites where this
// user is the WINNER of the precedence rule, not merely the holder of any
// effective binding row.
//
// Implementation (panel-polish 2026-05-17 P2 #4 — one-shot, no N+1):
//   1. Query A — all effective-at-T bindings for this user. Yields the
//      candidate siteIds.
//   2. Query B — all effective-at-T bindings (any user) for those siteIds.
//      Yields the data needed to apply ACTING-over-PERMANENT precedence.
//   3. Group by siteId in JS, pick winner per §5.8, keep where winner.userId
//      === args.userId.
// Total: 2 Prisma round-trips regardless of portfolio size. Asserted by an
// integration test using a $on('query') counter so any future regression
// back to N+1 fails CI loudly.
//
// @derives(supervisor-responsibility-model Amendments 2026-05-17 A-5)
// @derives(supervisor-responsibility-model §5.5 + §5.8)
// ---------------------------------------------------------------------------

/** @derives(ADR-0003) @derives(master-plan §G) @derives(supervisor-responsibility-model Amendments 2026-05-17 A-5) */
export type SitesSupervisedByUserArgs = {
  companyId: string;
  userId: string;
  /** Defaults to `new Date()`. Used for point-in-time portfolio queries. */
  at?: Date;
};

/** @derives(ADR-0003) @derives(master-plan §G) @derives(supervisor-responsibility-model Amendments 2026-05-17 A-5) */
export type SitesSupervisedByUserResult = Array<{
  siteId: string;
  bindingId: string;
  kind: 'ACTING' | 'PERMANENT';
  effectiveFrom: Date;
  effectiveUntil: Date | null;
}>;

/**
 * Return every site where `userId` is the effective responsible supervisor
 * at `at`, after applying §5.8 acting-over-permanent precedence.
 *
 * Two Prisma round-trips regardless of portfolio size; see implementation
 * note above for the design. Anti-drift integration test guards against
 * regression back to N+1.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / responsibility model
 * @derives(supervisor-responsibility-model Amendments 2026-05-17 A-5)
 */
export async function getSitesSupervisedByUser(
  tx: Prisma.TransactionClient | import('@prisma/client').PrismaClient,
  args: SitesSupervisedByUserArgs,
): Promise<SitesSupervisedByUserResult> {
  const at = args.at ?? new Date();

  // Query A — this user's candidate bindings effective at T.
  const ownBindings = await tx.siteSupervisorBinding.findMany({
    where: {
      companyId: args.companyId,
      userId: args.userId,
      endedAt: null,
      effectiveFrom: { lte: at },
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: at } }],
    },
    select: {
      id: true,
      siteId: true,
      userId: true,
      actingForUserId: true,
      effectiveFrom: true,
      effectiveUntil: true,
    },
  });

  if (ownBindings.length === 0) return [];

  const candidateSiteIds = [...new Set(ownBindings.map((b) => b.siteId))];

  // Query B — all effective-at-T bindings for those siteIds (any userId).
  // Needed because somebody else's ACTING binding can override this user's
  // PERMANENT on the same site (§5.8). EXCLUDE constraint at
  // migration.sql:131-138 guarantees at most one ACTING + one PERMANENT
  // active per site, so this set is bounded at 2N rows.
  const siteBindings = await tx.siteSupervisorBinding.findMany({
    where: {
      companyId: args.companyId,
      siteId: { in: candidateSiteIds },
      endedAt: null,
      effectiveFrom: { lte: at },
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: at } }],
    },
    select: {
      id: true,
      siteId: true,
      userId: true,
      actingForUserId: true,
      effectiveFrom: true,
      effectiveUntil: true,
    },
  });

  // Group by siteId; apply §5.8 ACTING-over-PERMANENT precedence locally.
  const bySite = new Map<string, typeof siteBindings>();
  for (const row of siteBindings) {
    const arr = bySite.get(row.siteId) ?? [];
    arr.push(row);
    bySite.set(row.siteId, arr);
  }

  const winners: SitesSupervisedByUserResult = [];
  for (const siteId of candidateSiteIds) {
    const rows = bySite.get(siteId) ?? [];
    const acting = rows.find((r) => r.actingForUserId !== null);
    const permanent = rows.find((r) => r.actingForUserId === null);
    const winner = acting ?? permanent ?? null;
    if (!winner || winner.userId !== args.userId) continue;
    winners.push({
      siteId: winner.siteId,
      bindingId: winner.id,
      kind: winner.actingForUserId === null ? 'PERMANENT' : 'ACTING',
      effectiveFrom: winner.effectiveFrom,
      effectiveUntil: winner.effectiveUntil,
    });
  }

  return winners;
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

/**
 * Batched Tier-1 derivation of worker→primary-site for routing fan-out (#15).
 *
 * Runs the SAME Tier-1 predicate as `deriveWorkerPrimarySiteId` (effective-at-T
 * ACTIVE, most-recent by createdAt) for many workers in ONE query, returning a
 * Map for the workers that HAVE a Tier-1 hit. Workers with no Tier-1 hit are
 * ABSENT from the map — the caller MUST fall back to the full
 * `deriveWorkerPrimarySiteId` (tiers 2/3) for them. This is purely a fan-out
 * optimisation: for any worker with a Tier-1 assignment the result is identical
 * to the per-row helper (Tier 1 wins there too), so priming a cache with this is
 * behaviour-preserving.
 *
 * KEEP THE PREDICATE BELOW IN LOCKSTEP with Tier 1 of `deriveWorkerPrimarySiteId`.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor responsibility model §5.9 (batched fan-out)
 * @derives(PRODUCTION_BUG_LEDGER.md #15)
 */
export async function deriveWorkerPrimarySiteIdsBatch(
  tx: Prisma.TransactionClient,
  args: { companyId: string; workerIds: ReadonlyArray<string>; at?: Date },
): Promise<Map<string, string>> {
  const at = args.at ?? new Date();
  const ids = [...new Set(args.workerIds)];
  if (ids.length === 0) return new Map();

  // Tier 1 ONLY — mirrors deriveWorkerPrimarySiteId's effective-at-T ACTIVE branch.
  const rows = await tx.assignment.findMany({
    where: {
      companyId: args.companyId,
      workerId: { in: ids },
      state: 'ACTIVE',
      validFrom: { lte: at },
      OR: [{ validUntil: null }, { validUntil: { gte: at } }],
    },
    orderBy: { createdAt: 'desc' },
    select: { workerId: true, siteId: true },
  });

  const out = new Map<string, string>();
  for (const r of rows) {
    // createdAt desc → the first row seen per worker is the most recent (Tier 1).
    if (!out.has(r.workerId)) out.set(r.workerId, r.siteId);
  }
  return out;
}
