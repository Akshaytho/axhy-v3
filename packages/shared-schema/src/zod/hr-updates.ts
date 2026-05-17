/**
 * HR Updates Zod schemas — shared between backend + mobile.
 *
 * Wire shape for `GET /supervisor/updates` and `POST /supervisor/updates/:id/acknowledge`.
 *
 * Schema note: HRUpdate in Prisma stores a single `acknowledgedBy` UUID
 * directly on the row (not a join table). This means one HRUpdate tracks
 * one ack entry — the most-recent acknowledger. For v0 we treat the row
 * as acknowledged-by-this-user when `acknowledgedBy === userId`. A proper
 * per-user ack join table is a future slice.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 */

import { z } from 'zod';

/**
 * One HRUpdate row as seen by the calling supervisor.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 */
export const HRUpdateRow = z
  .object({
    id: z.string().uuid(),
    title: z.string(),
    /** Full body text of the HR update. */
    body: z.string(),
    /** Whether this update requires an explicit acknowledgement from supervisors. */
    requiresAck: z.boolean(),
    /** True when the calling supervisor has acknowledged this update. */
    acknowledged: z.boolean(),
    /** The caller's prior acknowledgement text, null if not yet acknowledged. */
    ackText: z.string().nullable(),
    /** ISO timestamp of the caller's acknowledgement, null if not yet acknowledged. */
    ackedAt: z.string().datetime().nullable(),
    /** ISO timestamp when the update was created by HR. */
    createdAt: z.string().datetime(),
  })
  .strict();

/** @derives(ADR-0003) @derives(master-plan §G) — HR control plane / supervisor surface */
export type HRUpdateRowT = z.infer<typeof HRUpdateRow>;

/**
 * Counts sub-object on the HR updates response.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 */
export const HRUpdateCounts = z
  .object({
    needsAck: z.number().int().nonnegative(),
    recentAcked: z.number().int().nonnegative(),
  })
  .strict();

/** @derives(ADR-0003) @derives(master-plan §G) — HR control plane / supervisor surface */
export type HRUpdateCountsT = z.infer<typeof HRUpdateCounts>;

/**
 * Full response shape for `GET /supervisor/updates`.
 *
 * `needsAck` — updates requiring ack that the caller has not yet acknowledged.
 * `recentAcked` — updates acknowledged by the caller in the last 30 days (capped at 20).
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 */
export const HRUpdatesResponse = z
  .object({
    needsAck: z.array(HRUpdateRow),
    recentAcked: z.array(HRUpdateRow),
    counts: HRUpdateCounts,
  })
  .strict();

/** @derives(ADR-0003) @derives(master-plan §G) — HR control plane / supervisor surface */
export type HRUpdatesResponseT = z.infer<typeof HRUpdatesResponse>;

/**
 * Request body for `POST /supervisor/updates/:id/acknowledge`.
 *
 * Server validates: trimmed text must have >= 5 whitespace-delimited words.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 */
export const HRAckRequestBody = z
  .object({
    text: z.string(),
  })
  .strict();

/** @derives(ADR-0003) @derives(master-plan §G) — HR control plane / supervisor surface */
export type HRAckRequestBodyT = z.infer<typeof HRAckRequestBody>;

/**
 * Response body for a successful `POST /supervisor/updates/:id/acknowledge`.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 */
export const HRAckResponse = z
  .object({
    ok: z.literal(true),
    acknowledged: z.literal(true),
  })
  .strict();

/** @derives(ADR-0003) @derives(master-plan §G) — HR control plane / supervisor surface */
export type HRAckResponseT = z.infer<typeof HRAckResponse>;
