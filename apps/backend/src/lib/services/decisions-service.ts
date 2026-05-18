/**
 * decisions-service — composes the `GET /supervisor/decisions` response.
 *
 * Wave 2 (2026-05-18) — UNION ALL across multiple decision sources.
 *
 * Architecture
 * ────────────
 *
 * The Decisions queue is the supervisor's single decision surface. Five
 * domain tables can feed into it; each lives behind a `DecisionSource`
 * plug-in that:
 *
 *   1. Counts matching rows for this supervisor.
 *   2. Loads a page of rows (offset/limit honoured by the union-merger).
 *   3. Projects each row into a `DecisionRowT` with kind, tier, actions[],
 *      and the human-readable title/body.
 *
 * Wave 2 ships THREE sources in the builder:
 *
 *   - `supervisorDecisionSource`     — existing SupervisorDecision table.
 *   - `leaveRequestSource`           — LeaveRequest WHERE state='REQUESTED'.
 *   - `swapRequestSource`            — SwapRequest   WHERE state='SENT'.
 *
 * Two sources are intentionally NOT included this wave (Sprint 2 integration):
 *
 *   - REPLACEMENT_INVITE_OUTCOME     — Wave 1 subagent owns the model.
 *   - COMPLAINT_HR_REPLY             — Wave 3 subagent owns the schema.
 *
 * The caller supplies extra sources via `additionalDecisionSources` once
 * those models land. The builder is a one-line change at the call-site to
 * register a new source; no rewrite of the union/merge/pagination machinery.
 *
 * Routing
 * ───────
 *
 * Per the responsibility model (§5.8 + §5.9), a supervisor sees a row iff:
 *
 *   a. Origin match            — supervisorId == userId          (any source)
 *   b. Site-targeted match     — site is in supervisor's portfolio (now)
 *   c. Worker-targeted match   — worker's primary site is in portfolio
 *
 * Each source resolves routing INSIDE its own loader (it knows its FKs)
 * but the builder gives every source the same primitive bag
 * (supervisedSiteIds, deriveWorkerPrimarySiteId) so logic doesn't diverge.
 *
 * Pagination
 * ──────────
 *
 * Cursor by (section, proposedAt) — newest at top within a section, sections
 * ordered NEEDS_YOU_NOW < ROUTINE < FAILED_REVIEW. limit defaults to 50,
 * server-capped at 50. The cursor is a base64 JSON token so a later wave can
 * add tie-breakers without a wire-format break.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 * @derives(Wave 2 plan §3 — UNION ALL builder + actions[] contract)
 * @derives(drawer-redesign §B — Decisions queue UNION ALL)
 */

import type { Prisma } from '@prisma/client';
import {
  DecisionsResponse,
  type DecisionsResponseT,
  type DecisionRowT,
  type DecisionSectionT,
  type DecisionTierT,
  type DecisionActionT,
  decisionSpecByKind,
} from '@axhy/shared-schema';

import { getSitesSupervisedByUser } from '../effective-responsibility.js';
import { deriveWorkerPrimarySiteId } from '../effective-responsibility.js';

// ===========================================================================
// Public types
// ===========================================================================

/**
 * Arguments to `buildDecisionsForSupervisor`.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 * @derives(Wave 2 plan §3)
 */
export type BuildDecisionsArgs = {
  companyId: string;
  userId: string;
  /** Defaults to `new Date()`. */
  at?: Date;
  /** Opaque cursor from a prior page; see `encodeCursor` / `decodeCursor`. */
  cursor?: string;
  /** Page size; server caps at 50; defaults to 50. */
  limit?: number;
  /**
   * Extra decision sources to UNION with the three built-in ones. Wave 2
   * leaves this empty; Sprint 2 wires `replacementInviteSource` and
   * `complaintHrReplySource` here. The plug-in shape is the extension point
   * called out in the Wave 2 brief: adding a source is a one-line change at
   * the call-site, NOT a rewrite of the builder. Name reads as intentional.
   *
   * @derives(Wave 2 plan §3B — stable extension point)
   */
  additionalDecisionSources?: DecisionSource[];
};

/**
 * Shared primitives every `DecisionSource` consumes for routing.
 *
 * Computed once per builder invocation; pass-by-value to each source so the
 * source bodies never re-query the responsibility model.
 *
 * @derives(Wave 2 plan §3B)
 */
export type DecisionSourceContext = {
  companyId: string;
  userId: string;
  at: Date;
  /** Site ids this user is the effective responsible supervisor of at `at`. */
  supervisedSiteIds: Set<string>;
  /** Memoised worker→primary-site cache; sources may share. */
  workerPrimarySiteCache: Map<string, string | null>;
};

/**
 * A pluggable decision source. Each source maps one domain table into the
 * unified Decisions queue. The contract is intentionally narrow:
 *
 *   - `name`          identifies the source in cursor tokens + logs.
 *   - `loadRows`      returns ALL projected rows for this supervisor at `at`.
 *
 * Why "load ALL" and not "load a page": the queue UNION-merges across sources
 * with section + timestamp ordering. Doing pagination inside each source
 * leads to incorrect global ordering when one source has 80 rows in
 * NEEDS_YOU_NOW and another has 5 in ROUTINE — the page-2 cursor would skip
 * the smaller source's ROUTINE rows.
 *
 * For target scale (Tenant 3 = 2,100 workers, 200 pending decisions
 * across all sources), loading all matching rows is still <50ms. If we
 * ever exceed 5k pending decisions per supervisor, we'd switch to a
 * proper UNION ALL on the SQL side via Prisma `$queryRaw`; the source
 * contract intentionally permits that future without breaking callers.
 *
 * @derives(Wave 2 plan §3B + §3F)
 */
export type DecisionSource = {
  /** Stable identifier — appears in row.id prefix + perf logs. */
  name: string;
  /** Load + project all decision rows from this source for this supervisor. */
  loadRows(tx: Prisma.TransactionClient, ctx: DecisionSourceContext): Promise<DecisionRowT[]>;
};

// ===========================================================================
// Cursor encoding
// ===========================================================================

/**
 * Cursor payload — the position-key of the last row of the previous page.
 *
 * `priority` is the section ordinal (0 = NEEDS_YOU_NOW, 1 = ROUTINE,
 * 2 = FAILED_REVIEW). Combined with `proposedAt` it produces a total order
 * matching the queue's sort key, so the next page resumes precisely where
 * the previous ended without overlap or skip.
 *
 * @derives(Wave 2 plan §3F)
 */
type DecisionsCursorPayload = {
  /** Section ordinal of the last row on the prior page. */
  priority: 0 | 1 | 2;
  /** ISO `proposedAt` of the last row on the prior page. */
  proposedAt: string;
  /** Stable row id of the last row on the prior page; tiebreaks identical timestamps. */
  id: string;
};

const SECTION_PRIORITY: Record<DecisionSectionT, 0 | 1 | 2> = {
  NEEDS_YOU_NOW: 0,
  ROUTINE: 1,
  FAILED_REVIEW: 2,
};

function encodeCursor(p: DecisionsCursorPayload): string {
  return Buffer.from(JSON.stringify(p), 'utf8').toString('base64url');
}

function decodeCursor(token: string): DecisionsCursorPayload | null {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'priority' in parsed &&
      'proposedAt' in parsed &&
      'id' in parsed
    ) {
      const obj = parsed as Record<string, unknown>;
      const priority = obj.priority;
      const proposedAt = obj.proposedAt;
      const id = obj.id;
      if (
        (priority === 0 || priority === 1 || priority === 2) &&
        typeof proposedAt === 'string' &&
        typeof id === 'string'
      ) {
        return { priority, proposedAt, id };
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ===========================================================================
// Builder
// ===========================================================================

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 50;

/**
 * Build the `GET /supervisor/decisions` response for the calling supervisor.
 *
 * UNION ALL across the three built-in sources + any `additionalDecisionSources`
 * the caller registered. Honours pagination via `cursor` + `limit`.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 * @derives(Wave 2 plan §3)
 */
export async function buildDecisionsForSupervisor(
  tx: Prisma.TransactionClient,
  args: BuildDecisionsArgs,
): Promise<DecisionsResponseT> {
  const at = args.at ?? new Date();
  const limit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  // ── 1. Resolve the supervisor's portfolio once. ──
  const supervisedSites = await getSitesSupervisedByUser(tx, {
    companyId: args.companyId,
    userId: args.userId,
    at,
  });
  const supervisedSiteIds = new Set(supervisedSites.map((s) => s.siteId));

  const ctx: DecisionSourceContext = {
    companyId: args.companyId,
    userId: args.userId,
    at,
    supervisedSiteIds,
    workerPrimarySiteCache: new Map(),
  };

  // ── 2. Run all sources. ──
  const sources: DecisionSource[] = [
    supervisorDecisionSource,
    leaveRequestSource,
    swapRequestSource,
    ...(args.additionalDecisionSources ?? []),
  ];

  const sourceResults = await Promise.all(sources.map((s) => s.loadRows(tx, ctx)));
  const allRows = sourceResults.flat();

  // ── 3. Sort by (section, proposedAt asc, id asc — stable tiebreaker). ──
  allRows.sort((a, b) => {
    const aPri = SECTION_PRIORITY[a.section];
    const bPri = SECTION_PRIORITY[b.section];
    if (aPri !== bPri) return aPri - bPri;
    if (a.proposedAt !== b.proposedAt) return a.proposedAt < b.proposedAt ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  // ── 4. Apply cursor: skip everything ≤ cursor key. ──
  let cursorIdx = 0;
  if (args.cursor) {
    const parsed = decodeCursor(args.cursor);
    if (parsed) {
      const target = parsed;
      const found = allRows.findIndex((r) => {
        const rPri = SECTION_PRIORITY[r.section];
        if (rPri !== target.priority) return rPri > target.priority;
        if (r.proposedAt !== target.proposedAt) return r.proposedAt > target.proposedAt;
        return r.id > target.id;
      });
      cursorIdx = found === -1 ? allRows.length : found;
    }
  }

  const pageRows = allRows.slice(cursorIdx, cursorIdx + limit);
  const hasMore = cursorIdx + limit < allRows.length;

  // ── 5. Counts — for THIS page (back-compat) + cross-page total via pageInfo. ──
  const needsYouNow = pageRows.filter((r) => r.section === 'NEEDS_YOU_NOW').length;
  const routine = pageRows.filter((r) => r.section === 'ROUTINE').length;
  const failedReview = pageRows.filter((r) => r.section === 'FAILED_REVIEW').length;

  const lastRow = pageRows.length > 0 ? pageRows[pageRows.length - 1]! : null;
  const nextCursor =
    hasMore && lastRow
      ? encodeCursor({
          priority: SECTION_PRIORITY[lastRow.section],
          proposedAt: lastRow.proposedAt,
          id: lastRow.id,
        })
      : null;

  return DecisionsResponse.parse({
    rows: pageRows,
    counts: { needsYouNow, routine, failedReview, total: pageRows.length },
    pageInfo: {
      cursor: nextCursor,
      hasMore,
      limit,
      totalAcrossPages: allRows.length,
    },
  });
}

// ===========================================================================
// Source: SupervisorDecision (existing — chat-extracted decisions)
// ===========================================================================

/**
 * Loads PROPOSED `SupervisorDecision` rows routed to this supervisor under
 * the v0 (origin-or-portfolio) responsibility model. This is the prior
 * builder's behaviour, lifted into a source plug-in unchanged.
 *
 * @derives(Wave 2 plan §3B)
 */
const supervisorDecisionSource: DecisionSource = {
  name: 'supervisor-decision',
  async loadRows(tx, ctx): Promise<DecisionRowT[]> {
    const candidates = await tx.supervisorDecision.findMany({
      where: {
        companyId: ctx.companyId,
        appliedAt: null,
        dismissedAt: null,
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    if (candidates.length === 0) return [];

    const matched: typeof candidates = [];
    for (const row of candidates) {
      if (row.supervisorId === ctx.userId) {
        matched.push(row);
        continue;
      }
      if (row.targetId && ctx.supervisedSiteIds.has(row.targetId)) {
        matched.push(row);
        continue;
      }
      if (row.targetId) {
        const siteId = await getCachedWorkerPrimarySite(tx, ctx, row.targetId);
        if (siteId && ctx.supervisedSiteIds.has(siteId)) {
          matched.push(row);
          continue;
        }
      }
    }

    return matched.map((row) => {
      const payload = (row.payload ?? {}) as Record<string, unknown>;
      const tier = mapTier(row.tier);
      const section = assignSectionForTier(tier);
      const isEmployment = row.tier === 'EMPLOYMENT';
      const actions = supervisorDecisionActions(row.id, row.kind, isEmployment);

      return {
        id: row.id,
        section,
        tier,
        kind: row.kind,
        title: deriveSupervisorDecisionTitle(row.kind, payload),
        body: deriveSupervisorDecisionBody(row.kind, row.tier, payload),
        workerName: typeof payload.workerName === 'string' ? payload.workerName : null,
        siteName: typeof payload.siteName === 'string' ? payload.siteName : null,
        proposedAt: row.createdAt.toISOString(),
        summaryText: null,
        dayCount: null,
        requiresTypedConfirm: isEmployment,
        confirmPhrase: isEmployment ? 'TERMINATE' : null,
        actions,
      };
    });
  },
};

/**
 * Actions for an existing SupervisorDecision row. EMPLOYMENT-tier rows
 * surface a destructive Apply (typed-phrase) + Dismiss (reason-sheet);
 * all others surface Apply (none) + Dismiss (reason-sheet).
 *
 * @derives(Wave 2 plan §3C)
 */
function supervisorDecisionActions(
  decisionId: string,
  kind: string,
  isEmployment: boolean,
): DecisionActionT[] {
  const applyAction: DecisionActionT = isEmployment
    ? {
        label: humanizeApplyLabel(kind),
        style: 'danger',
        requiresConfirm: 'typed-phrase',
        confirmPhrase: 'TERMINATE',
        endpoint: `/decisions/${decisionId}/apply`,
        method: 'POST',
      }
    : {
        label: humanizeApplyLabel(kind),
        style: 'primary',
        requiresConfirm: 'none',
        endpoint: `/decisions/${decisionId}/apply`,
        method: 'POST',
      };

  const dismissAction: DecisionActionT = {
    label: 'Dismiss',
    style: 'secondary',
    requiresConfirm: 'reason-sheet',
    endpoint: `/supervisor/decisions/${decisionId}/dismiss`,
    method: 'POST',
  };

  return [applyAction, dismissAction];
}

function humanizeApplyLabel(kind: string): string {
  switch (kind) {
    case 'MARK_ABSENT':
      return 'Mark absent';
    case 'APPROVE_LEAVE':
      return 'Approve leave';
    case 'LOG_COMPLAINT':
      return 'Log complaint';
    case 'SWAP_WORKER':
      return 'Swap worker';
    case 'TERMINATE_WORKER':
      return 'Terminate';
    case 'CREATE_ASSIGNMENT':
      return 'Create assignment';
    case 'LIVING_DOC_RULE':
      return 'Apply rule';
    default:
      return 'Apply';
  }
}

// ===========================================================================
// Source: LeaveRequest (NEW — worker-initiated leave-approval queue)
// ===========================================================================

/**
 * Loads `LeaveRequest WHERE state='REQUESTED'` rows routed to this
 * supervisor — i.e. where the worker's primary site is in the supervisor's
 * portfolio at `at`. Projects each as a virtual `LEAVE_APPROVAL_PENDING`
 * DecisionRow with `[Approve, Reject]` actions.
 *
 * Section assignment per drawer-redesign §B.3:
 *   - `NEEDS_YOU_NOW` if fromDate ≤ today + 2 days, else `ROUTINE`.
 *
 * @derives(Wave 2 plan §3B + §3C + drawer-redesign §B.3)
 */
const leaveRequestSource: DecisionSource = {
  name: 'leave-request',
  async loadRows(tx, ctx): Promise<DecisionRowT[]> {
    // Hard cap at 200 per tenant (matches SupervisorDecision source). Founder
    // direction: 200 pending decisions across all sources is the target
    // upper bound for a Tenant-3-scale supervisor.
    const candidates = await tx.leaveRequest.findMany({
      where: {
        companyId: ctx.companyId,
        state: 'REQUESTED',
      },
      include: {
        worker: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    if (candidates.length === 0) return [];

    const out: DecisionRowT[] = [];
    for (const lr of candidates) {
      // Routing: worker's primary site at `at` must be in supervisor portfolio.
      const siteId = await getCachedWorkerPrimarySite(tx, ctx, lr.workerId);
      if (!siteId || !ctx.supervisedSiteIds.has(siteId)) continue;

      // Site lookup for siteName surfacing.
      const site = await tx.site.findFirst({
        where: { id: siteId, companyId: ctx.companyId },
        select: { name: true },
      });

      const dayCount = leaveDayCount(lr.fromDate, lr.toDate);
      const section = leaveSection(lr.fromDate, ctx.at);

      const actions: DecisionActionT[] = [
        {
          label: 'Approve',
          style: 'primary',
          // Approve does not require a typed phrase (PERSONNEL tier per
          // master-plan §G; EMPLOYMENT-only is the typed-phrase rule).
          // Optional reason note: mobile surfaces a `reason-sheet` UX, but
          // the route accepts an empty note, so we ship `none` to keep the
          // single-tap happy path fast. Mobile may locally add a note input
          // if founder later wants one — server contract still accepts it.
          requiresConfirm: 'none',
          endpoint: `/leave-requests/${lr.id}/approve`,
          method: 'POST',
          body: { dayCount },
        },
        {
          label: 'Reject',
          style: 'danger',
          // PERSONNEL-tier reject collects a reason via bottom-sheet (not
          // typed-phrase — see master-plan §G + drawer-redesign §B.4).
          requiresConfirm: 'reason-sheet',
          endpoint: `/leave-requests/${lr.id}/reject`,
          method: 'POST',
          body: { dayCount },
        },
      ];

      out.push({
        id: `leave:${lr.id}`,
        section,
        tier: 'PERSONNEL',
        kind: 'LEAVE_APPROVAL_PENDING',
        title: `Approve leave for ${lr.worker.name}`,
        body: leaveBody(lr.fromDate, lr.toDate, lr.reason, dayCount),
        workerName: lr.worker.name,
        siteName: site?.name ?? null,
        proposedAt: lr.createdAt.toISOString(),
        summaryText: null,
        dayCount,
        requiresTypedConfirm: false,
        confirmPhrase: null,
        actions,
      });
    }

    return out;
  },
};

function leaveDayCount(fromDate: Date, toDate: Date): number {
  const ms = toDate.getTime() - fromDate.getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, days);
}

function leaveSection(fromDate: Date, at: Date): DecisionSectionT {
  const twoDays = 2 * 24 * 60 * 60 * 1000;
  return fromDate.getTime() - at.getTime() <= twoDays ? 'NEEDS_YOU_NOW' : 'ROUTINE';
}

function leaveBody(fromDate: Date, toDate: Date, reason: string, dayCount: number): string {
  const from = fromDate.toISOString().slice(0, 10);
  const to = toDate.toISOString().slice(0, 10);
  const range = from === to ? from : `${from} → ${to}`;
  const dayWord = dayCount === 1 ? 'day' : 'days';
  return `${range} (${dayCount} ${dayWord}) · ${reason}`;
}

// ===========================================================================
// Source: SwapRequest (NEW — worker-initiated swap queue)
// ===========================================================================

/**
 * Loads `SwapRequest WHERE state='SENT'` rows whose siteId is in the
 * supervisor's portfolio at `at`. Projects each as a virtual
 * `SWAP_REQUEST_PENDING` DecisionRow.
 *
 * Section per drawer-redesign §B.3: `NEEDS_YOU_NOW` if effectiveAt ≤ today + 1
 * day, else `ROUTINE`.
 *
 * Skill-mismatch detection: not in this wave. The TwoButtonWithWarning
 * variant uses a `payload.skillMismatch` flag the source would set; left as
 * `false` for Wave 2 (no skill-cert data model yet — Wave 5 scope). When the
 * flag flips true, the "Accept anyway" override action with `typed-phrase
 * 'OVERRIDE'` is appended; the contract is in place.
 *
 * @derives(Wave 2 plan §3B + §3C + drawer-redesign §B.3 + §B.4)
 */
const swapRequestSource: DecisionSource = {
  name: 'swap-request',
  async loadRows(tx, ctx): Promise<DecisionRowT[]> {
    const candidates = await tx.swapRequest.findMany({
      where: {
        companyId: ctx.companyId,
        state: 'SENT',
        // Site-targeted: precise filter via portfolio.
        siteId: { in: Array.from(ctx.supervisedSiteIds) },
      },
      include: {
        fromWorker: { select: { id: true, name: true } },
        toWorker: { select: { id: true, name: true } },
        site: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    if (candidates.length === 0) return [];

    return candidates.map((sw) => {
      // Skill-mismatch detection: Wave 5 will populate this from a cert lookup.
      // Wave 2 contract: false everywhere; "Accept anyway" action not appended.
      const skillMismatch = false;

      const section = swapSection(sw.effectiveAt, ctx.at);

      const baseActions: DecisionActionT[] = [
        {
          label: 'Accept',
          style: 'primary',
          requiresConfirm: 'reason-sheet',
          endpoint: `/swap-requests/${sw.id}/decide`,
          method: 'POST',
          body: { decision: 'approve' },
        },
        {
          label: 'Reject',
          style: 'danger',
          requiresConfirm: 'reason-sheet',
          endpoint: `/swap-requests/${sw.id}/decide`,
          method: 'POST',
          body: { decision: 'reject' },
        },
      ];

      // Skill-mismatch override (drawer-redesign §B.4 TwoButtonWithWarning).
      // Single-button override per master-plan one-button-assign-anyway lock
      // + feedback_no_ai_suggestions_admin_decides.md. typed-phrase 'OVERRIDE'
      // matches the SwapDecisionInput.refine().
      const actions: DecisionActionT[] = skillMismatch
        ? [
            ...baseActions,
            {
              label: 'Accept anyway',
              style: 'secondary',
              requiresConfirm: 'typed-phrase',
              confirmPhrase: 'OVERRIDE',
              endpoint: `/swap-requests/${sw.id}/decide`,
              method: 'POST',
              body: { decision: 'approve_anyway', overrideToken: 'OVERRIDE' },
            },
          ]
        : baseActions;

      return {
        id: `swap:${sw.id}`,
        section,
        tier: 'OPERATIONAL',
        kind: 'SWAP_REQUEST_PENDING',
        title: `Swap ${sw.fromWorker.name} → ${sw.toWorker.name}`,
        body: `${sw.site.name} · ${formatHumanDateTimeIST(sw.effectiveAt)}${sw.reason ? ` · ${sw.reason}` : ''}`,
        workerName: sw.fromWorker.name,
        siteName: sw.site.name,
        proposedAt: sw.createdAt.toISOString(),
        summaryText: null,
        dayCount: null,
        requiresTypedConfirm: false,
        confirmPhrase: null,
        actions,
      };
    });
  },
};

function swapSection(effectiveAt: Date, at: Date): DecisionSectionT {
  const oneDay = 24 * 60 * 60 * 1000;
  return effectiveAt.getTime() - at.getTime() <= oneDay ? 'NEEDS_YOU_NOW' : 'ROUTINE';
}

// ===========================================================================
// Shared helpers
// ===========================================================================

// QA-round3 fix (R3-04): swap-request decision body was leaking raw ISO into
// the supervisor card ("IT Park C · 2026-05-09T10:02:56.947Z · …"). Format in
// IST so Suresh reads "May 9, 10:02 AM" instead.
const SWAP_DATE_FMT = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});
function formatHumanDateTimeIST(d: Date): string {
  return SWAP_DATE_FMT.format(d);
}

async function getCachedWorkerPrimarySite(
  tx: Prisma.TransactionClient,
  ctx: DecisionSourceContext,
  workerId: string,
): Promise<string | null> {
  if (ctx.workerPrimarySiteCache.has(workerId)) {
    return ctx.workerPrimarySiteCache.get(workerId)!;
  }
  const siteId = await deriveWorkerPrimarySiteId(tx, {
    companyId: ctx.companyId,
    workerId,
    at: ctx.at,
  });
  ctx.workerPrimarySiteCache.set(workerId, siteId);
  return siteId;
}

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

/**
 * Assign the UI section from a tier (used by SupervisorDecision source). Virtual
 * sources compute section from domain timing instead (proximity to fromDate /
 * effectiveAt / shift start).
 *
 * EMPLOYMENT and PERSONNEL are high-stakes → 'NEEDS_YOU_NOW'.
 * Everything else → 'ROUTINE'.
 * 'FAILED_REVIEW' is reserved; no rows land there yet.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */
function assignSectionForTier(tier: DecisionTierT): DecisionSectionT {
  if (tier === 'EMPLOYMENT' || tier === 'PERSONNEL') return 'NEEDS_YOU_NOW';
  return 'ROUTINE';
}

/**
 * Derive a plain-English title from a SupervisorDecision kind + payload.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */
function deriveSupervisorDecisionTitle(kind: string, payload: Record<string, unknown>): string {
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
function deriveSupervisorDecisionBody(
  kind: string,
  tier: string,
  payload: Record<string, unknown>,
): string | null {
  if (tier !== 'EMPLOYMENT') return null;

  const context = typeof payload.context === 'string' ? payload.context : null;
  if (context) return context;

  if (kind === 'TERMINATE_WORKER') {
    const noShowCount = typeof payload.noShowCount === 'number' ? payload.noShowCount : null;
    if (noShowCount !== null) {
      return `${noShowCount} no-show${noShowCount !== 1 ? 's' : ''} this week`;
    }
  }

  return null;
}

function humanizeKind(kind: string): string {
  return kind
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

// ===========================================================================
// Registry self-check (boot-time sanity).
//
// Wave 2 contract: the four new decisionKind values must exist in the
// registry. If a future refactor accidentally drops one, this throws at
// process boot, surfacing the regression before any HTTP request fires.
// ===========================================================================

const REQUIRED_WAVE_2_KINDS = [
  'LEAVE_APPROVAL_PENDING',
  'SWAP_REQUEST_PENDING',
  'REPLACEMENT_INVITE_OUTCOME',
  'COMPLAINT_HR_REPLY',
] as const;

for (const k of REQUIRED_WAVE_2_KINDS) {
  if (!decisionSpecByKind.has(k)) {
    throw new Error(
      `decisions-service: required Wave 2 decisionKind '${k}' is missing from DECISION_KIND_REGISTRY`,
    );
  }
}
