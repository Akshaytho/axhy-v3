/**
 * Activity route Zod schemas — shared between backend + mobile.
 *
 * Wire shape for `GET /supervisor/activity` — a chronological list of
 * AuditEvent rows authored by the calling supervisor. The shape is
 * deliberately thin: kind / when / target / summary line. The full
 * payload stays server-side; clients show curated text.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 * @derives(panel-2026-05-17) — Activity slice
 */

import { z } from 'zod';

/**
 * One activity row in the supervisor's feed.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */
export const ActivityRow = z
  .object({
    /** AuditEvent.id. */
    id: z.string().uuid(),
    /** AuditEvent.kind (e.g. WORKER_MARKED_ABSENT). */
    kind: z.string(),
    /** ISO timestamp when the event was recorded. */
    when: z.string().datetime(),
    /** Free-form composed line describing the event in plain English. */
    summary: z.string(),
    /** Optional target id (worker, site, etc.) for deeplinking later. */
    targetId: z.string().nullable(),
  })
  .strict();

export type ActivityRowT = z.infer<typeof ActivityRow>;

/**
 * Response shape for `GET /supervisor/activity`.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */
export const ActivityResponse = z
  .object({
    rows: z.array(ActivityRow),
  })
  .strict();

export type ActivityResponseT = z.infer<typeof ActivityResponse>;
