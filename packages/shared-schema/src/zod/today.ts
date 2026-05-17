/**
 * Today route Zod schemas — shared between backend + mobile.
 *
 * `TodayResponse` is the wire shape for `GET /supervisor/today`. The route
 * powers the Today tab in supervisor mobile (R6 prototype port). Every
 * field corresponds to a derivation in `today-service.ts` — no fields
 * pass through unchanged from a single underlying table.
 *
 * Field source notes (anti-fabrication; per `feedback_planning_decision_rules.md`):
 *   - `sites.workersOn` — count of active Assignment rows whose worker has
 *     Attendance.status='PRESENT' today OR a Visit with state IN_PROGRESS/COMPLETED today.
 *   - `sites.workersDue` — count of active Assignment rows for the site whose
 *     `dayMask` bit for today is set.
 *   - `sites.flagged` — true when any Visit at the site scheduled today has
 *     `Visit.flagged = true`.
 *   - `workers.state` — derived from Attendance + Visit (see service).
 *   - `flaggedVisits.reason` — sourced from `Visit.verificationText` when
 *     present (AI verification surface fires before flag is set). NULL when
 *     no AI verification ran. Visit has no dedicated reason column; the
 *     R6 prototype's `reason` field is a free-form display slot.
 *   - `flaggedVisits.photoCount` — `Visit.photosBefore + Visit.photosAfter`.
 *     No separate `photos[]` relation exists; photo counts are inline.
 *
 * R6 fields NOT modeled here (deliberate omissions, per plan):
 *   - `shifts[]` — R6 ad-hoc shape with no schema backing.
 *   - `rules[]` — R6 ad-hoc shape with no schema backing.
 *
 * @derives(supervisor-responsibility-model §5.5 + §5.8 + §5.9)
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 * @derives(panel-2026-05-17) — Today slice
 */

import { z } from 'zod';

/**
 * Per-worker state shown on the Today tab.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 * @derives(panel-2026-05-17) — Today slice
 */
export const TodayWorkerState = z.enum(['on_site', 'late', 'no_show', 'on_leave', 'pending']);

export type TodayWorkerStateT = z.infer<typeof TodayWorkerState>;

/**
 * Site card shape on the Today tab.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 * @derives(panel-2026-05-17) — Today slice
 */
export const TodaySite = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    workersOn: z.number().int().nonnegative(),
    workersDue: z.number().int().nonnegative(),
    flagged: z.boolean(),
  })
  .strict();

export type TodaySiteT = z.infer<typeof TodaySite>;

/**
 * Per-worker row on the Today tab.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 * @derives(panel-2026-05-17) — Today slice
 */
export const TodayWorker = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    siteId: z.string().uuid(),
    state: TodayWorkerState,
    /** ISO timestamp of clock-in (Visit.startedAt) when present. */
    clockIn: z.string().datetime().nullable(),
    /** Free-form note (Attendance.reason) when present. */
    note: z.string().nullable(),
  })
  .strict();

export type TodayWorkerT = z.infer<typeof TodayWorker>;

/**
 * Single-row "floor pulse" — aggregate counters across this supervisor's portfolio.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 * @derives(panel-2026-05-17) — Today slice
 */
export const TodayPulse = z
  .object({
    onSite: z.number().int().nonnegative(),
    late: z.number().int().nonnegative(),
    noShow: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    flagged: z.number().int().nonnegative(),
  })
  .strict();

export type TodayPulseT = z.infer<typeof TodayPulse>;

/**
 * Flagged-visit entry surfaced for supervisor review.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 * @derives(panel-2026-05-17) — Today slice
 */
export const TodayFlaggedVisit = z
  .object({
    visitId: z.string().uuid(),
    workerId: z.string().uuid(),
    workerName: z.string(),
    siteId: z.string().uuid(),
    siteName: z.string(),
    /** ISO timestamp — Visit.completedAt ?? Visit.startedAt ?? Visit.scheduledFor. */
    when: z.string().datetime(),
    /** Visit.photosBefore + Visit.photosAfter. */
    photoCount: z.number().int().nonnegative(),
    /** Visit.verificationText (AI verification reason) when present. Null when
     * no AI verification ran — Visit has no dedicated `reason` column. */
    reason: z.string().nullable(),
  })
  .strict();

export type TodayFlaggedVisitT = z.infer<typeof TodayFlaggedVisit>;

/**
 * Full response shape for `GET /supervisor/today`.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 * @derives(panel-2026-05-17) — Today slice
 */
export const TodayResponse = z
  .object({
    sites: z.array(TodaySite),
    workers: z.array(TodayWorker),
    pulse: TodayPulse,
    flaggedVisits: z.array(TodayFlaggedVisit),
  })
  .strict();

export type TodayResponseT = z.infer<typeof TodayResponse>;
