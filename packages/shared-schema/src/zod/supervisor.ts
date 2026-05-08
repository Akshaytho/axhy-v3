/**
 * Supervisor route Zod schemas — shared between backend + mobile.
 *
 * Tier 1 supervisor actions per data-flow §5:
 *   - mark-absent (PERSONNEL tier, single-tap confirm)
 *   - approve-leave / reject-leave (PERSONNEL tier)
 *   - log-complaint (NOTE tier, no confirm)
 *   - swap-worker (OPERATIONAL tier)
 *   - mark-visit-done (OPERATIONAL tier)
 *
 * Each route's Input/Output schemas live here and are imported by
 * apps/backend/src/routes/* (validates request body) and apps/mobile/
 * (types the API client + UI form state).
 *
 * @derives(data-flow §5 — supervisor action catalog)
 * @derives(panel-2026-05-08) — Phase B Tier 1 supervisor routes
 */

import { z } from 'zod';

// ─── Shared types ────────────────────────────────────────────────────────────

/**
 * ISO date-only string (YYYY-MM-DD), accepted by Postgres @db.Date.
 * @derives(data-flow §5)
 * @derives(ADR-0007)
 */
export const DateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

/**
 * Attendance status — one of the documented enum values.
 * @derives(data-flow §5 — supervisor mark-absent)
 * @derives(ADR-0007)
 */
export const AttendanceStatusSchema = z.enum([
  'PRESENT',
  'ABSENT_NO_CALL',
  'ABSENT_APPROVED_LEAVE',
  'HALF_DAY',
  'ON_BREAK',
]);

/**
 * Inferred attendance status type.
 * @derives(data-flow §5)
 * @derives(ADR-0007)
 */
export type AttendanceStatus = z.infer<typeof AttendanceStatusSchema>;

/**
 * Decision tier per data-flow §5.
 * @derives(data-flow §5 — decision tier coloring)
 * @derives(ADR-0007)
 */
export const DecisionTierSchema = z.enum(['NOTE', 'OPERATIONAL', 'PERSONNEL', 'EMPLOYMENT']);

/**
 * Inferred decision tier type.
 * @derives(data-flow §5)
 * @derives(ADR-0007)
 */
export type DecisionTier = z.infer<typeof DecisionTierSchema>;

// ─── POST /workers/:id/mark-absent ───────────────────────────────────────────

/**
 * Input shape for POST /workers/:id/mark-absent.
 * @derives(data-flow §5 — supervisor "Mark worker absent" action)
 * @derives(ADR-0007)
 */
export const MarkAbsentInput = z.object({
  /** Date to mark, YYYY-MM-DD. */
  date: DateOnlySchema,
  /** Status. Defaults to ABSENT_NO_CALL — the most common case. */
  status: AttendanceStatusSchema.default('ABSENT_NO_CALL'),
  /** Optional supervisor reason text. */
  reason: z.string().trim().max(500).optional(),
});

/**
 * Inferred input type for /workers/:id/mark-absent.
 * @derives(data-flow §5)
 * @derives(ADR-0007)
 */
export type MarkAbsentInput = z.infer<typeof MarkAbsentInput>;

/**
 * Output shape for POST /workers/:id/mark-absent.
 * @derives(data-flow §5 — supervisor "Mark worker absent" action)
 * @derives(ADR-0007)
 */
export const MarkAbsentOutput = z.object({
  ok: z.literal(true),
  attendanceId: z.string().uuid(),
  workerId: z.string().uuid(),
  date: DateOnlySchema,
  status: AttendanceStatusSchema,
  payDeductPaise: z.number().int().nonnegative(),
});

/**
 * Inferred output type for /workers/:id/mark-absent.
 * @derives(data-flow §5)
 * @derives(ADR-0007)
 */
export type MarkAbsentOutput = z.infer<typeof MarkAbsentOutput>;
