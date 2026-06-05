/**
 * Today-service — composes the shape behind `GET /supervisor/today`.
 *
 * `buildTodayForSupervisor` is the SINGLE source of truth for what the
 * supervisor mobile Today tab renders. Worker state labels are derived
 * server-side and never recomputed on the client (production-grade rule:
 * server-derived state, never client-recomputed).
 *
 * Composition (all reads only; no mutation):
 *   1. `getSitesSupervisedByUser` → portfolio of siteIds at T.
 *   2. Parallel reads, bounded by `siteIds[]`:
 *      - Sites (id, name)
 *      - Active Assignments on those sites
 *      - Today's Attendance rows for the assigned workers
 *      - Today's Visits for those sites
 *      - Today's flagged Visits with worker + site joins
 *   3. JS aggregation into `TodayResponse`.
 *   4. Zod-validate before returning.
 *
 * State derivation rules (server-side only; canonical Visit machine per
 * `@axhy/state-machines/visit.ts` — 12 states):
 *
 *   - `no_show`  ← Attendance.status = 'ABSENT_NO_CALL'  OR  Visit.state = 'NO_SHOW'
 *   - `on_leave` ← Attendance.status = 'ABSENT_APPROVED_LEAVE'
 *   - `on_site`  ← Attendance.status = 'PRESENT'
 *                  OR Visit.state ∈ {IN_PROGRESS, PHOTOS_PENDING,
 *                                     AWAITING_VERIFICATION, VERIFIED, FLAGGED}
 *                  (worker has clocked in for today; FLAGGED still counts —
 *                  flag is a content-quality signal, not a presence signal)
 *   - `late`     ← Visit.state = 'IN_PROGRESS' AND startedAt > 15 min after
 *                  Assignment.shiftStart
 *   - else       → `pending`  (visit in SCHEDULED/NOTIFIED/EN_ROUTE/ON_SITE,
 *                              or no visit at all)
 *
 * Visit states CANCELLED and ARCHIVED do not contribute to today's pulse —
 * a cancelled visit isn't worked; an archived visit is past the window.
 *
 * `on_leave` workers are not counted in pulse — pulse tracks actionable
 * counters (on-site / late / no-show / pending / flagged); on-leave is its
 * own per-worker bucket but not aggregated.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 * @derives(@axhy/state-machines/visit.ts VisitStateValue)
 * @derives(supervisor-responsibility-model §5.5 + §5.8 + §5.9)
 * @derives(panel-2026-05-17) — Today slice
 */

import type { Prisma } from '@prisma/client';
import {
  TodayResponse,
  type TodayFlaggedVisitT,
  type TodayPulseT,
  type TodayResponseT,
  type TodaySiteT,
  type TodayWorkerStateT,
  type TodayWorkerT,
} from '@axhy/shared-schema';

import { startOfISTDay, endOfISTDay, mondayBasedDayIndexIST, istTimeOnDate } from '../ist-date.js';
import { getSitesSupervisedByUser } from '../effective-responsibility.js';

const LATE_THRESHOLD_MINUTES = 15;

/**
 * Canonical Visit states that count as "worker on/done at the site today."
 * Per @axhy/state-machines/visit.ts:
 *   IN_PROGRESS           — actively cleaning (also drives `late` check)
 *   PHOTOS_PENDING        — clocked out, uploading proof
 *   AWAITING_VERIFICATION — proof uploaded, AI processing
 *   VERIFIED              — AI cleared the work
 *   FLAGGED               — AI raised a concern (still on-site for the day)
 *
 * Worker WAS at the site today even if the visit later cancels — but CANCELLED
 * and ARCHIVED are excluded because they represent "did not work" or "out of
 * scope for today" respectively.
 */
const ON_SITE_VISIT_STATES = new Set<string>([
  'IN_PROGRESS',
  'PHOTOS_PENDING',
  'AWAITING_VERIFICATION',
  'VERIFIED',
  'FLAGGED',
]);

/** Visit states that indicate the worker has finished their part for the day. */
const DONE_TODAY_STATES = new Set<string>([
  'PHOTOS_PENDING',
  'AWAITING_VERIFICATION',
  'VERIFIED',
  'FLAGGED',
]);

/** @derives(ADR-0003) @derives(master-plan §G) — Today slice */
export type BuildTodayArgs = {
  companyId: string;
  userId: string;
  /** Defaults to `new Date()`. */
  at?: Date;
};

/**
 * Build the `GET /supervisor/today` response for the caller.
 *
 * Perf-fix (Cluster 1, QA-walkthrough 2026-05-18): accepts either a
 * `Prisma.TransactionClient` (legacy, queries serialise on one
 * connection) or a `PrismaClient` (read-path, queries run in parallel
 * via the connection pool — the `Promise.all`s below become genuine
 * concurrent dispatches). The route layer now passes the bare client
 * for read paths; mutations still wrap in `withTenantContext`.
 *
 * Pre-fix: `/supervisor/today` was 12s (cold) / 3.4s (warm) — every
 * `Promise.all` of `tx.X.findMany` actually serialised because Prisma
 * interactive transactions queue queries on a single connection. With
 * the bare client each query lands on its own pooled connection.
 *
 * @derives(panel-2026-05-17) — Today slice
 * @derives(2026-05-18-supervisor-qa-walkthrough.md Cluster 1)
 */
export async function buildTodayForSupervisor(
  tx: Prisma.TransactionClient | import('@prisma/client').PrismaClient,
  args: BuildTodayArgs,
): Promise<TodayResponseT> {
  const at = args.at ?? new Date();

  const portfolio = await getSitesSupervisedByUser(tx, {
    companyId: args.companyId,
    userId: args.userId,
    at,
  });

  if (portfolio.length === 0) {
    return TodayResponse.parse({
      sites: [],
      workers: [],
      pulse: { onSite: 0, late: 0, noShow: 0, pending: 0, flagged: 0 },
      flaggedVisits: [],
    });
  }

  const siteIds = portfolio.map((p) => p.siteId);
  const dayStart = startOfISTDay(at);
  const dayEnd = endOfISTDay(at);
  const todayDate = dayStart;

  const [siteRows, assignmentRows, todaysFlaggedVisits] = await Promise.all([
    tx.site.findMany({
      where: { companyId: args.companyId, id: { in: siteIds } },
      select: { id: true, name: true },
    }),
    tx.assignment.findMany({
      where: {
        companyId: args.companyId,
        siteId: { in: siteIds },
        state: 'ACTIVE',
        validFrom: { lte: at },
        OR: [{ validUntil: null }, { validUntil: { gte: at } }],
      },
      select: {
        id: true,
        workerId: true,
        siteId: true,
        shiftStart: true,
        dayMask: true,
        worker: { select: { id: true, name: true, userId: true } },
      },
    }),
    tx.visit.findMany({
      where: {
        companyId: args.companyId,
        siteId: { in: siteIds },
        scheduledFor: { gte: dayStart, lt: dayEnd },
        flagged: true,
      },
      select: {
        id: true,
        workerId: true,
        siteId: true,
        scheduledFor: true,
        startedAt: true,
        completedAt: true,
        photosBefore: true,
        photosAfter: true,
        verificationText: true,
        worker: { select: { name: true } },
        site: { select: { name: true } },
      },
    }),
  ]);

  const workerIds = [...new Set(assignmentRows.map((a) => a.workerId))];

  const [todaysAttendance, todaysVisits] = await Promise.all([
    workerIds.length === 0
      ? []
      : tx.attendance.findMany({
          where: {
            companyId: args.companyId,
            workerId: { in: workerIds },
            date: todayDate,
          },
          select: { workerId: true, status: true, reason: true },
        }),
    tx.visit.findMany({
      where: {
        companyId: args.companyId,
        siteId: { in: siteIds },
        scheduledFor: { gte: dayStart, lt: dayEnd },
      },
      select: {
        workerId: true,
        siteId: true,
        state: true,
        startedAt: true,
      },
    }),
  ]);

  // ---- Aggregation ---------------------------------------------------------

  const todayDayIndex = mondayBasedDayIndexIST(at); // Mon=0..Sun=6
  const attendanceByWorker = new Map(todaysAttendance.map((a) => [a.workerId, a]));
  const visitsByWorker = new Map<string, typeof todaysVisits>();
  for (const v of todaysVisits) {
    const arr = visitsByWorker.get(v.workerId) ?? [];
    arr.push(v);
    visitsByWorker.set(v.workerId, arr);
  }

  // Each worker appears once on Today — keyed by first ACTIVE assignment for them
  // across the supervisor's portfolio. If a worker has multiple assignments to
  // different sites under this supervisor, we keep the first (deterministic
  // by Prisma's findMany default ordering on createdAt asc); the schema does
  // not encode "primary site" and §5.9 derivation is read-only/per-worker.
  const workerRows: TodayWorkerT[] = [];
  const seenWorkers = new Set<string>();
  for (const a of assignmentRows) {
    if (seenWorkers.has(a.workerId)) continue;
    seenWorkers.add(a.workerId);

    const att = attendanceByWorker.get(a.workerId);
    const visits = visitsByWorker.get(a.workerId) ?? [];
    const ongoing = visits.find((v) => v.state === 'IN_PROGRESS');
    const doneToday = visits.find((v) => DONE_TODAY_STATES.has(v.state));

    const state = deriveWorkerState({
      attendanceStatus: att?.status ?? null,
      visitStates: visits.map((v) => v.state),
      ongoingVisit: ongoing ?? null,
      assignmentShiftStart: a.shiftStart,
      at,
    });

    const clockInIso = (ongoing?.startedAt ?? doneToday?.startedAt ?? null)?.toISOString() ?? null;

    workerRows.push({
      id: a.worker.id,
      userId: a.worker.userId,
      name: a.worker.name,
      siteId: a.siteId,
      state,
      clockIn: clockInIso,
      note: att?.reason ?? null,
    });
  }

  // Site cards
  const siteNameById = new Map(siteRows.map((s) => [s.id, s.name]));
  const assignmentsBySite = new Map<string, typeof assignmentRows>();
  for (const a of assignmentRows) {
    const arr = assignmentsBySite.get(a.siteId) ?? [];
    arr.push(a);
    assignmentsBySite.set(a.siteId, arr);
  }
  const flaggedSiteIds = new Set(todaysFlaggedVisits.map((v) => v.siteId));

  const sites: TodaySiteT[] = siteIds.map((sid) => {
    const sa = assignmentsBySite.get(sid) ?? [];
    const dueToday = sa.filter((a) => dayMaskMatchesIndex(a.dayMask, todayDayIndex));
    const workersOn = workerRows.filter((w) => w.siteId === sid && w.state === 'on_site').length;
    return {
      id: sid,
      name: siteNameById.get(sid) ?? '',
      workersOn,
      workersDue: dueToday.length,
      flagged: flaggedSiteIds.has(sid),
    };
  });

  // Pulse counters
  const pulse: TodayPulseT = {
    onSite: workerRows.filter((w) => w.state === 'on_site').length,
    late: workerRows.filter((w) => w.state === 'late').length,
    noShow: workerRows.filter((w) => w.state === 'no_show').length,
    pending: workerRows.filter((w) => w.state === 'pending').length,
    flagged: todaysFlaggedVisits.length,
  };

  // Flagged visits — one row per flagged Visit
  const flaggedVisits: TodayFlaggedVisitT[] = todaysFlaggedVisits.map((v) => ({
    visitId: v.id,
    workerId: v.workerId,
    workerName: v.worker.name,
    siteId: v.siteId,
    siteName: v.site.name,
    when: (v.completedAt ?? v.startedAt ?? v.scheduledFor).toISOString(),
    photoCount: v.photosBefore + v.photosAfter,
    reason: v.verificationText,
  }));

  return TodayResponse.parse({ sites, workers: workerRows, pulse, flaggedVisits });
}

// ───────────────────────────────────────────────────────────────────────────
// Pure helpers
// ───────────────────────────────────────────────────────────────────────────

/** True when the assignment's dayMask has a non-`_` character at index. */
function dayMaskMatchesIndex(mask: string, index: number): boolean {
  if (index < 0 || index >= mask.length) return false;
  return mask[index] !== '_';
}

type DeriveStateArgs = {
  attendanceStatus: string | null;
  visitStates: ReadonlyArray<string>;
  ongoingVisit: { state: string; startedAt: Date | null } | null;
  assignmentShiftStart: string;
  at: Date;
};

function deriveWorkerState(args: DeriveStateArgs): TodayWorkerStateT {
  // Attendance.status takes precedence — it's the supervisor's explicit mark.
  if (args.attendanceStatus === 'ABSENT_NO_CALL') return 'no_show';
  if (args.attendanceStatus === 'ABSENT_APPROVED_LEAVE') return 'on_leave';
  if (args.visitStates.includes('NO_SHOW')) return 'no_show';

  // Late detection: IN_PROGRESS started > 15 min after shiftStart.
  if (args.ongoingVisit !== null && args.ongoingVisit.startedAt) {
    const lateBy = minutesAfterShiftStart(args.ongoingVisit.startedAt, args.assignmentShiftStart);
    if (lateBy !== null && lateBy > LATE_THRESHOLD_MINUTES) return 'late';
  }

  const hasOnSiteVisit = args.visitStates.some((s) => ON_SITE_VISIT_STATES.has(s));
  const presentByAttendance = args.attendanceStatus === 'PRESENT';
  if (presentByAttendance || hasOnSiteVisit) return 'on_site';

  // Pre-clock-in or no visit yet today.
  return 'pending';
}

/**
 * Returns how many minutes after the assignment's shiftStart the visit
 * actually started. Same UTC day assumed (the queries already bound to
 * today). Null when shiftStart cannot be parsed.
 */
function minutesAfterShiftStart(startedAt: Date, shiftStart: string): number | null {
  const shiftAt = istTimeOnDate(startedAt, shiftStart);
  if (!shiftAt) return null;
  return Math.floor((startedAt.getTime() - shiftAt.getTime()) / 60_000);
}
