/**
 * summary-service — composes the shape behind `GET /supervisor/summary`.
 *
 * `buildSummaryForSupervisor` is the single source of truth for what the
 * supervisor mobile Summary (end-of-day digest) screen renders. All reads
 * are bounded to the caller's tenant and portfolio; no mutation occurs here.
 *
 * Composition:
 *   1. `getSitesSupervisedByUser` → siteIds in the caller's portfolio.
 *   2. Parallel reads bounded by portfolio + today UTC window:
 *      - changesToday: COUNT AuditEvent by caller today.
 *      - flagged: COUNT Visit.flagged=true in portfolio today.
 *      - leavePending: COUNT LeaveRequest state=REQUESTED whose worker has
 *        an ACTIVE Assignment in the portfolio.
 *      - tomorrowRoster: DISTINCT workerIds with ACTIVE Assignment that
 *        covers tomorrow.
 *      - timeline: caller's AuditEvents today, desc, limit 30.
 *   3. Zod-validate before returning.
 *
 * Tomorrow-roster day-mask check:
 *   tomorrowIndex = mondayBasedDayIndex(tomorrow)
 *   Assignment.dayMask[tomorrowIndex] !== '_'
 *   AND Assignment.state = 'ACTIVE'
 *   AND Assignment.validFrom <= tomorrow
 *   AND (Assignment.validUntil IS NULL OR Assignment.validUntil >= tomorrow)
 *   AND Assignment.siteId IN portfolio
 *
 * Note: dayMask is a 7-char string where index 0 = Monday … index 6 = Sunday.
 * We filter in JS after fetching the candidate rows — the count is always
 * small (portfolio size × workers per site) so a full table scan is avoided
 * by the siteId IN portfolio predicate. A DB-level mask check would require
 * raw SQL; the current approach keeps code plain and testable.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 * @derives(supervisor-mobile-r6-design 2026-05-12) — Summary tab
 * @derives(panel-2026-05-17) — Summary slice
 */

import type { Prisma } from '@prisma/client';
import { SummaryResponse, type SummaryResponseT } from '@axhy/shared-schema';

import { getSitesSupervisedByUser } from '../effective-responsibility.js';

import { summarizeAuditKind } from './audit-summary.js';

const TIMELINE_LIMIT = 30;

/**
 * Arguments for building the end-of-day summary.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */
export type BuildSummaryArgs = {
  companyId: string;
  userId: string;
  /** Defaults to `new Date()`. Used for day-boundary + weekday derivation. */
  at?: Date;
};

/**
 * Build the `GET /supervisor/summary` response for the calling supervisor.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 * @derives(panel-2026-05-17) — Summary slice
 */
export async function buildSummaryForSupervisor(
  tx: Prisma.TransactionClient,
  args: BuildSummaryArgs,
): Promise<SummaryResponseT> {
  const at = args.at ?? new Date();

  const weekday = at.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });

  const dayStart = startOfUtcDay(at);
  const dayEnd = endOfUtcDay(at);

  const tomorrow = new Date(dayStart);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowIndex = mondayBasedDayIndex(tomorrow);

  const portfolio = await getSitesSupervisedByUser(tx, {
    companyId: args.companyId,
    userId: args.userId,
    at,
  });

  // Empty portfolio — return all-zero payload; no DB reads needed.
  if (portfolio.length === 0) {
    return SummaryResponse.parse({
      weekday,
      changesToday: 0,
      flagged: 0,
      leavePending: 0,
      tomorrowRoster: 0,
      timeline: [],
    });
  }

  const siteIds = portfolio.map((p) => p.siteId);

  // All parallel — no data dependency between these reads.
  const [changesTodayRows, flaggedRows, portfolioWorkerRows, tomorrowAssignmentRows, timelineRows] =
    await Promise.all([
      // 1. Count of AuditEvents authored by caller today.
      tx.auditEvent.count({
        where: {
          companyId: args.companyId,
          actorId: args.userId,
          createdAt: { gte: dayStart, lt: dayEnd },
        },
      }),

      // 2. Flagged visits in portfolio today.
      tx.visit.count({
        where: {
          companyId: args.companyId,
          siteId: { in: siteIds },
          scheduledFor: { gte: dayStart, lt: dayEnd },
          flagged: true,
        },
      }),

      // 3. Fetch workerIds with an ACTIVE assignment in portfolio (for leavePending).
      tx.assignment.findMany({
        where: {
          companyId: args.companyId,
          siteId: { in: siteIds },
          state: 'ACTIVE',
        },
        select: { workerId: true },
        distinct: ['workerId'],
      }),

      // 4. ACTIVE assignments covering tomorrow (for tomorrowRoster).
      tx.assignment.findMany({
        where: {
          companyId: args.companyId,
          siteId: { in: siteIds },
          state: 'ACTIVE',
          validFrom: { lte: tomorrow },
          OR: [{ validUntil: null }, { validUntil: { gte: tomorrow } }],
        },
        select: { workerId: true, dayMask: true },
      }),

      // 5. Caller's audit timeline for today — newest first, capped at 30.
      tx.auditEvent.findMany({
        where: {
          companyId: args.companyId,
          actorId: args.userId,
          createdAt: { gte: dayStart, lt: dayEnd },
        },
        orderBy: { createdAt: 'desc' },
        take: TIMELINE_LIMIT,
        select: { id: true, kind: true, payload: true, createdAt: true },
      }),
    ]);

  // leavePending: LeaveRequest rows in state REQUESTED whose worker is in
  // the caller's portfolio.
  const portfolioWorkerIds = portfolioWorkerRows.map((r) => r.workerId);

  const leavePending =
    portfolioWorkerIds.length === 0
      ? 0
      : await tx.leaveRequest.count({
          where: {
            companyId: args.companyId,
            workerId: { in: portfolioWorkerIds },
            state: 'REQUESTED',
          },
        });

  // tomorrowRoster: count DISTINCT workerIds whose assignment's dayMask
  // covers tomorrow's weekday index.
  const tomorrowRosterSet = new Set<string>();
  for (const a of tomorrowAssignmentRows) {
    if (dayMaskMatchesIndex(a.dayMask, tomorrowIndex)) {
      tomorrowRosterSet.add(a.workerId);
    }
  }

  // Map timeline rows to wire shape.
  const timeline = timelineRows.map((r) => ({
    id: r.id,
    kind: r.kind,
    summary: summarizeAuditKind(r.kind, r.payload),
    when: r.createdAt.toISOString(),
  }));

  return SummaryResponse.parse({
    weekday,
    changesToday: changesTodayRows,
    flagged: flaggedRows,
    leavePending,
    tomorrowRoster: tomorrowRosterSet.size,
    timeline,
  });
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function startOfUtcDay(d: Date): Date {
  const s = new Date(d);
  s.setUTCHours(0, 0, 0, 0);
  return s;
}

function endOfUtcDay(d: Date): Date {
  const e = new Date(d);
  e.setUTCHours(24, 0, 0, 0);
  return e;
}

/** Returns 0 for Monday … 6 for Sunday (matches Assignment.dayMask layout). */
function mondayBasedDayIndex(d: Date): number {
  return (d.getUTCDay() + 6) % 7;
}

/** True when the assignment's dayMask has a non-`_` character at index. */
function dayMaskMatchesIndex(mask: string, index: number): boolean {
  if (index < 0 || index >= mask.length) return false;
  return mask[index] !== '_';
}
