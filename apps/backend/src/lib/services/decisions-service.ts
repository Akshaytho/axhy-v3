/**
 * decisions-service — composes the `GET /supervisor/decisions` response.
 *
 * Reads PROPOSED SupervisorDecision rows (appliedAt IS NULL AND
 * dismissedAt IS NULL) for the calling supervisor's tenant, filters to
 * rows routed to this supervisor (v0 routing: actorId match OR site
 * membership via getSitesSupervisedByUser), groups into sections, and
 * composes a plain-English title + body for each row.
 *
 * V0 routing note: this is the pragmatic routing implementation for
 * the Decisions tab. The responsibility-model-aware routing (F-001 per
 * site binding chains) is a separate slice. Here we filter in JS by
 * `supervisorId === userId` OR site membership via the routing primitives.
 *
 * Section assignment:
 *   - EMPLOYMENT tier → 'NEEDS_YOU_NOW'
 *   - PERSONNEL tier  → 'NEEDS_YOU_NOW'
 *   - All others      → 'ROUTINE'
 *   - FAILED_REVIEW   → not yet in use (no FAILED state); count = 0
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */

import type { Prisma } from '@prisma/client';
import {
  DecisionsResponse,
  type DecisionsResponseT,
  type DecisionSectionT,
  type DecisionTierT,
  // DecisionsTierSchema is also exported from decisions.ts (renamed by linter
  // to avoid collision with supervisor.ts's DecisionTierSchema).
} from '@axhy/shared-schema';

import { getSitesSupervisedByUser } from '../effective-responsibility.js';
import { deriveWorkerPrimarySiteId } from '../effective-responsibility.js';

/**
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */
export type BuildDecisionsArgs = {
  companyId: string;
  userId: string;
  /** Defaults to `new Date()`. */
  at?: Date;
};

/**
 * Build the `GET /supervisor/decisions` response for the calling supervisor.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */
export async function buildDecisionsForSupervisor(
  tx: Prisma.TransactionClient,
  args: BuildDecisionsArgs,
): Promise<DecisionsResponseT> {
  const at = args.at ?? new Date();

  // 1. Pull all PROPOSED decisions in tenant (capped at 200 — same as the
  //    existing decisions/proposed-for-me route). Filter to this supervisor's
  //    rows in JS below.
  const candidates = await tx.supervisorDecision.findMany({
    where: {
      companyId: args.companyId,
      appliedAt: null,
      dismissedAt: null,
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });

  if (candidates.length === 0) {
    return DecisionsResponse.parse({
      rows: [],
      counts: { needsYouNow: 0, routine: 0, failedReview: 0, total: 0 },
    });
  }

  // 2. Collect the supervisor's current sites via the responsibility model.
  //    We use getSitesSupervisedByUser to get the site ids and then resolve
  //    which rows are routed to this supervisor.
  const supervisedSites = await getSitesSupervisedByUser(tx, {
    companyId: args.companyId,
    userId: args.userId,
    at,
  });
  const supervisedSiteIds = new Set(supervisedSites.map((s: { siteId: string }) => s.siteId));

  // 3. Filter candidates to those routed to this supervisor.
  //    V0 routing logic (origin or site membership):
  //      a. supervisorId === userId (original proposer)
  //      b. site-targeted: targetId is one of supervisedSiteIds
  //      c. worker-targeted: worker's primary site is in supervisedSiteIds
  //    Comment: responsibility-model-aware routing (effective binding chain)
  //    is the F-001 slice. This v0 logic handles the Decisions tab launch.

  const matched: (typeof candidates)[number][] = [];

  for (const row of candidates) {
    // Origin match — always included.
    if (row.supervisorId === args.userId) {
      matched.push(row);
      continue;
    }

    // Site-targeted: targetId is a site this supervisor owns now.
    if (row.targetId && supervisedSiteIds.has(row.targetId)) {
      matched.push(row);
      continue;
    }

    // Worker-targeted: derive primary site and check membership.
    if (row.targetId) {
      const siteId = await deriveWorkerPrimarySiteId(tx, {
        companyId: args.companyId,
        workerId: row.targetId,
        at,
      });
      if (siteId && supervisedSiteIds.has(siteId)) {
        matched.push(row);
        continue;
      }
    }
  }

  // 4. Compose rows into DecisionRowT shape.
  const rows = matched.map((row) => {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const tier = mapTier(row.tier);
    const section = assignSection(tier);

    return {
      id: row.id,
      section,
      tier,
      title: deriveTitle(row.kind, payload),
      body: deriveBody(row.kind, row.tier, payload),
      workerName: typeof payload.workerName === 'string' ? payload.workerName : null,
      siteName: typeof payload.siteName === 'string' ? payload.siteName : null,
      proposedAt: row.createdAt.toISOString(),
      requiresTypedConfirm: row.tier === 'EMPLOYMENT',
      confirmPhrase: row.tier === 'EMPLOYMENT' ? 'TERMINATE' : null,
    };
  });

  // 5. Sort: NEEDS_YOU_NOW first (oldest within), then ROUTINE (oldest within),
  //    then FAILED_REVIEW (empty for now).
  const sectionOrder: Record<DecisionSectionT, number> = {
    NEEDS_YOU_NOW: 0,
    ROUTINE: 1,
    FAILED_REVIEW: 2,
  };
  rows.sort((a, b) => {
    const sectionDiff = sectionOrder[a.section] - sectionOrder[b.section];
    if (sectionDiff !== 0) return sectionDiff;
    return a.proposedAt < b.proposedAt ? -1 : a.proposedAt > b.proposedAt ? 1 : 0;
  });

  // 6. Counts.
  const needsYouNow = rows.filter((r) => r.section === 'NEEDS_YOU_NOW').length;
  const routine = rows.filter((r) => r.section === 'ROUTINE').length;
  const failedReview = rows.filter((r) => r.section === 'FAILED_REVIEW').length;

  return DecisionsResponse.parse({
    rows,
    counts: { needsYouNow, routine, failedReview, total: rows.length },
  });
}

// ---------------------------------------------------------------------------
// Tier normalisation
// ---------------------------------------------------------------------------

/**
 * Map the raw DB tier string to DecisionTierT. Unknown tiers → 'OPERATIONAL'.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */
function mapTier(raw: string): DecisionTierT {
  switch (raw) {
    case 'NOTE':
      return 'NOTE';
    case 'OPERATIONAL':
      return 'OPERATIONAL';
    case 'PERSONNEL':
      return 'PERSONNEL';
    case 'EMPLOYMENT':
      return 'EMPLOYMENT';
    case 'REVIEW':
      return 'REVIEW';
    default:
      return 'OPERATIONAL';
  }
}

// ---------------------------------------------------------------------------
// Section assignment
// ---------------------------------------------------------------------------

/**
 * Assign the UI section from the tier.
 *
 * EMPLOYMENT and PERSONNEL are high-stakes → 'NEEDS_YOU_NOW'.
 * Everything else → 'ROUTINE'.
 * 'FAILED_REVIEW' is reserved; no rows land there yet.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */
function assignSection(tier: DecisionTierT): DecisionSectionT {
  if (tier === 'EMPLOYMENT' || tier === 'PERSONNEL') return 'NEEDS_YOU_NOW';
  return 'ROUTINE';
}

// ---------------------------------------------------------------------------
// Title + body derivation (mirrors summarize() in activity-service.ts)
// ---------------------------------------------------------------------------

/**
 * Derive a plain-English title from the decision kind + payload.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */
function deriveTitle(kind: string, payload: Record<string, unknown>): string {
  const workerName = typeof payload.workerName === 'string' ? payload.workerName : null;
  const siteName = typeof payload.siteName === 'string' ? payload.siteName : null;

  switch (kind) {
    case 'MARK_ABSENT':
      return `Mark ${workerName ?? 'worker'} absent`;
    case 'APPROVE_LEAVE':
      return `Approve leave${workerName ? ` for ${workerName}` : ''}`;
    case 'LOG_COMPLAINT':
      return `Log complaint${siteName ? ` at ${siteName}` : ''}`;
    case 'SWAP_WORKER':
      return `Swap worker${siteName ? ` at ${siteName}` : ''}`;
    case 'TERMINATE_WORKER':
      return `Terminate ${workerName ?? 'worker'}`;
    case 'CREATE_ASSIGNMENT':
      return `Create assignment${workerName ? ` for ${workerName}` : ''}${siteName ? ` at ${siteName}` : ''}`;
    case 'LIVING_DOC_RULE':
      return 'Update living doc rule';
    default:
      return humanizeKind(kind);
  }
}

/**
 * Derive an optional longer explanation body. Returns null for most rows;
 * populated for EMPLOYMENT tier to surface context.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */
function deriveBody(kind: string, tier: string, payload: Record<string, unknown>): string | null {
  if (tier !== 'EMPLOYMENT') return null;

  const context = typeof payload.context === 'string' ? payload.context : null;
  if (context) return context;

  // Fallback for TERMINATE_WORKER: surface no-show count if present.
  if (kind === 'TERMINATE_WORKER') {
    const noShowCount = typeof payload.noShowCount === 'number' ? payload.noShowCount : null;
    if (noShowCount !== null) {
      return `${noShowCount} no-show${noShowCount !== 1 ? 's' : ''} this week`;
    }
  }

  return null;
}

function humanizeKind(kind: string): string {
  const words = kind
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
  return words;
}
