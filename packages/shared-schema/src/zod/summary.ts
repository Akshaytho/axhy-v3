/**
 * Summary route Zod schemas — shared between backend + mobile.
 *
 * Wire shape for `GET /supervisor/summary` — the end-of-day digest that
 * surfaces four headline metrics, a chronological audit timeline, and a
 * wages placeholder. Mirrors the R6 prototype layout from
 * `docs/prototypes/supervisor-mobile-r6/project/src/summary.jsx`.
 *
 * Field source notes:
 *   - `changesToday` — COUNT(*) AuditEvent WHERE actorId = caller AND
 *     createdAt within today UTC window.
 *   - `flagged` — COUNT(*) Visit WHERE flagged=true AND scheduledFor today
 *     AND siteId IN caller's portfolio.
 *   - `leavePending` — COUNT(*) LeaveRequest WHERE state='REQUESTED' AND
 *     worker has an ACTIVE Assignment in caller's portfolio.
 *   - `tomorrowRoster` — DISTINCT workerIds with ACTIVE Assignment whose
 *     validFrom/validUntil window covers tomorrow and dayMask covers
 *     tomorrow's weekday index, siteId IN portfolio.
 *   - `timeline` — caller's AuditEvents today, newest-first, capped at 30,
 *     each mapped to a plain-English summary line via the shared
 *     `summarizeAuditKind` helper.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 * @derives(supervisor-mobile-r6-design 2026-05-12) — Summary tab
 */

import { z } from 'zod';

/**
 * One timeline entry in the end-of-day digest.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */
export const SummaryTimelineEntry = z
  .object({
    /** AuditEvent.id */
    id: z.string().uuid(),
    /** AuditEvent.kind */
    kind: z.string(),
    /** Plain-English description of the event. */
    summary: z.string(),
    /** ISO 8601 datetime when the event was recorded. */
    when: z.string().datetime(),
  })
  .strict();

export type SummaryTimelineEntryT = z.infer<typeof SummaryTimelineEntry>;

/**
 * Full response shape for `GET /supervisor/summary`.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 * @derives(supervisor-mobile-r6-design 2026-05-12) — Summary tab
 */
export const SummaryResponse = z
  .object({
    /** Day name derived from the request timestamp, e.g. "Tuesday". */
    weekday: z.string(),
    /** AuditEvent rows authored by the caller today. */
    changesToday: z.number().int().nonnegative(),
    /** Visits with flagged=true in the caller's portfolio today. */
    flagged: z.number().int().nonnegative(),
    /** LeaveRequest rows in state REQUESTED whose worker belongs to the
     * caller's portfolio. */
    leavePending: z.number().int().nonnegative(),
    /** Distinct workers with an ACTIVE Assignment that covers tomorrow. */
    tomorrowRoster: z.number().int().nonnegative(),
    /** Up to 30 most-recent audit events by the caller today, oldest-last. */
    timeline: z.array(SummaryTimelineEntry),
  })
  .strict();

export type SummaryResponseT = z.infer<typeof SummaryResponse>;
