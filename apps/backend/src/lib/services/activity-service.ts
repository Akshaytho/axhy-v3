/**
 * activity-service — composes the `GET /supervisor/activity` response.
 *
 * Reads AuditEvent rows authored by the calling supervisor (scoped to
 * tenant via `withTenantContext`), sorted newest-first, capped at a
 * pagination limit. Composes a plain-English `summary` line per row from
 * the kind taxonomy + payload — so the client doesn't have to know the
 * payload shape.
 *
 * Accepts optional `dateFilter`, `siteIdFilter`, and `kindFilter` args to
 * narrow the result set — these map directly to the query params accepted
 * by `GET /supervisor/activity`.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 * @derives(panel-2026-05-17) — Activity slice
 */

import type { Prisma } from '@prisma/client';
import { ActivityResponse, type ActivityResponseT } from '@axhy/shared-schema';

import { todayISTBounds, yesterdayISTBounds, thisWeekISTBounds } from '../ist-date.js';

import { summarizeAuditKind } from './audit-summary.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// ---------------------------------------------------------------------------
// Filter type literals
// ---------------------------------------------------------------------------

/** Accepted values for the `?date=` query param. */
export type DateFilter = 'today' | 'yesterday' | 'this-week' | 'all';

/** Accepted values for the `?kind=` query param. */
export type KindFilter = 'all' | 'absences' | 'lates' | 'leaves';

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

/**
 * Arguments for `buildActivityForSupervisor`.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — Activity slice
 */
export type BuildActivityArgs = {
  companyId: string;
  userId: string;
  /** Page size, capped at MAX_LIMIT. */
  limit?: number;
  /**
   * Date window filter. Defaults to `'today'` when omitted.
   * - `today`      → createdAt within [start-of-today-UTC, end-of-today-UTC]
   * - `yesterday`  → createdAt within yesterday's UTC bounds
   * - `this-week`  → createdAt within Monday–Sunday of the current ISO week
   * - `all`        → no createdAt constraint
   */
  dateFilter?: DateFilter;
  /**
   * Narrows to rows where `AuditEvent.targetId` equals the given site UUID.
   * Best-effort: for site-bound events the targetId IS the siteId. Pass
   * `'all'` (or omit) to skip this filter.
   */
  siteIdFilter?: string | 'all';
  /**
   * Narrows to the audit-event kinds that belong to the requested category.
   * - `absences` → `WORKER_MARKED_ABSENT`
   * - `lates`    → `WORKER_MARKED_LATE` (filter returns nothing if kind absent from DB)
   * - `leaves`   → `LEAVE_REQUESTED | LEAVE_APPROVED | LEAVE_REJECTED`
   * - `all`      → no kind constraint
   */
  kindFilter?: KindFilter;
};

// ---------------------------------------------------------------------------
// Date-range helpers (IST — India Standard Time, UTC+05:30)
// ---------------------------------------------------------------------------

/**
 * Convert a `DateFilter` value to a Prisma `createdAt` where-clause fragment.
 * Returns `undefined` for `'all'` so the caller can spread it without adding
 * an unnecessary filter.
 *
 * @derives(ADR-0003)
 */
function dateFilterToWhere(filter: DateFilter): { gte: Date; lt: Date } | undefined {
  switch (filter) {
    case 'today':
      return todayISTBounds();
    case 'yesterday':
      return yesterdayISTBounds();
    case 'this-week':
      return thisWeekISTBounds();
    case 'all':
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Kind-filter helpers
// ---------------------------------------------------------------------------

const KIND_FILTER_MAP: Record<KindFilter, string[] | undefined> = {
  all: undefined,
  absences: ['WORKER_MARKED_ABSENT'],
  lates: ['WORKER_MARKED_LATE'],
  leaves: ['LEAVE_REQUESTED', 'LEAVE_APPROVED', 'LEAVE_REJECTED'],
};

/**
 * Convert a `KindFilter` value to a Prisma `kind` where-clause fragment.
 * Returns `undefined` for `'all'` so the caller can spread it without adding
 * an unnecessary filter.
 *
 * @derives(ADR-0003)
 */
function kindFilterToWhere(filter: KindFilter): { in: string[] } | undefined {
  const kinds = KIND_FILTER_MAP[filter];
  return kinds ? { in: kinds } : undefined;
}

// ---------------------------------------------------------------------------
// Main service function
// ---------------------------------------------------------------------------

/**
 * Build the `GET /supervisor/activity` response for the caller.
 *
 * Composes a Prisma `where` clause from the optional date / site / kind
 * filters before querying. The base constraint (companyId + actorId) is
 * always applied so a supervisor can never see another user's events.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */
export async function buildActivityForSupervisor(
  tx: Prisma.TransactionClient,
  args: BuildActivityArgs,
): Promise<ActivityResponseT> {
  const limit = Math.min(Math.max(args.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  const dateFilter = args.dateFilter ?? 'today';
  const siteIdFilter = args.siteIdFilter ?? 'all';
  const kindFilter = args.kindFilter ?? 'all';

  const createdAtWhere = dateFilterToWhere(dateFilter);
  const kindWhere = kindFilterToWhere(kindFilter);
  const siteWhere = siteIdFilter !== 'all' ? { targetId: siteIdFilter } : undefined;

  const rows = await tx.auditEvent.findMany({
    where: {
      companyId: args.companyId,
      actorId: args.userId,
      ...(createdAtWhere ? { createdAt: createdAtWhere } : {}),
      ...(kindWhere ? { kind: kindWhere } : {}),
      ...(siteWhere ?? {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      kind: true,
      targetId: true,
      payload: true,
      createdAt: true,
    },
  });

  const composed = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    when: r.createdAt.toISOString(),
    targetId: r.targetId ?? null,
    summary: summarizeAuditKind(r.kind, r.payload),
  }));

  return ActivityResponse.parse({ rows: composed });
}
