/**
 * Calendar route Zod schemas — shared between backend + admin-web.
 *
 * CalendarEntry kinds per data-flow §6:
 *   - NOTE        — free-form note on a date
 *   - DEMAND      — headcount demand for a site on a date
 *   - TENTATIVE_ASSIGNMENT — informal pre-assignment before committing
 *   - EVENT       — generic calendar event (training, inspection, etc.)
 *
 * Each kind carries a typed payload (stored as Prisma Json).
 * The discriminated union on `CreateCalendarEntryInput` ensures
 * payload shape is validated at the application layer.
 *
 * @derives(data-flow §6 — calendar entry catalog)
 * @derives(ADR-0007)
 */

import { z } from 'zod';

// ─── Kind enum ───────────────────────────────────────────────────────────────

/**
 * Valid CalendarEntry kinds.
 * @derives(data-flow §6)
 * @derives(ADR-0007)
 */
export const CalendarEntryKind = z.enum(['NOTE', 'DEMAND', 'TENTATIVE_ASSIGNMENT', 'EVENT']);

/**
 * Inferred CalendarEntry kind type.
 * @derives(data-flow §6)
 * @derives(ADR-0007)
 */
export type CalendarEntryKindT = z.infer<typeof CalendarEntryKind>;

// ─── Per-kind payload schemas ─────────────────────────────────────────────────

/**
 * Payload for NOTE entries — no structured fields, notes carry the content.
 * @derives(data-flow §6)
 * @derives(ADR-0007)
 */
export const NotePayload = z.object({}).strict();

/**
 * Payload for DEMAND entries — headcount requirement for a site on a date.
 * @derives(data-flow §6)
 * @derives(ADR-0007)
 */
export const DemandPayload = z
  .object({
    /** Site this demand applies to. */
    siteId: z.string().uuid(),
    /** Number of workers required. */
    headcount: z.number().int().min(1).max(500),
    /** Optional shift window. */
    shift: z.object({ start: z.string(), end: z.string() }).optional(),
    /** Optional skill tag for the demand. */
    skillRequired: z.string().max(64).optional(),
  })
  .strict();

/**
 * Payload for TENTATIVE_ASSIGNMENT entries — informal pre-assignment.
 * @derives(data-flow §6)
 * @derives(ADR-0007)
 */
export const TentativeAssignmentPayload = z
  .object({
    /** Worker being tentatively placed. */
    workerId: z.string().uuid(),
    /** Site for the tentative assignment. */
    siteId: z.string().uuid(),
    /** Optional shift start, HH:MM. */
    shiftStart: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
    /** Optional shift end, HH:MM. */
    shiftEnd: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
  })
  .strict();

/**
 * Payload for EVENT entries — generic calendar event.
 * @derives(data-flow §6)
 * @derives(ADR-0007)
 */
export const EventPayload = z
  .object({
    /** Optional site this event is linked to. */
    siteId: z.string().uuid().optional(),
    /** Event title — required for EVENT kind. */
    title: z.string().min(1).max(200),
    /** Optional event start time, HH:MM. */
    startTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
    /** Optional event end time, HH:MM. */
    endTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .optional(),
  })
  .strict();

// ─── CreateCalendarEntryInput ─────────────────────────────────────────────────

/**
 * Discriminated input for POST /calendar-entries.
 * The `kind` field drives payload shape validation.
 *
 * @derives(data-flow §6 — calendar entry create)
 * @derives(ADR-0007)
 */
export const CreateCalendarEntryInput = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('NOTE'),
    /** Target date, YYYY-MM-DD. */
    date: z.string(),
    payload: NotePayload,
    /** Required note text for NOTE entries. */
    notes: z.string().min(1).max(2000),
  }),
  z.object({
    kind: z.literal('DEMAND'),
    /** Target date, YYYY-MM-DD. */
    date: z.string(),
    payload: DemandPayload,
    /** Optional additional notes. */
    notes: z.string().max(2000).optional(),
  }),
  z.object({
    kind: z.literal('TENTATIVE_ASSIGNMENT'),
    /** Target date, YYYY-MM-DD. */
    date: z.string(),
    payload: TentativeAssignmentPayload,
    /** Optional additional notes. */
    notes: z.string().max(2000).optional(),
  }),
  z.object({
    kind: z.literal('EVENT'),
    /** Target date, YYYY-MM-DD. */
    date: z.string(),
    payload: EventPayload,
    /** Optional additional notes. */
    notes: z.string().max(2000).optional(),
  }),
]);

/**
 * Inferred input type for POST /calendar-entries.
 * @derives(data-flow §6)
 * @derives(ADR-0007)
 */
export type CreateCalendarEntryInputT = z.infer<typeof CreateCalendarEntryInput>;

// ─── UpdateCalendarEntryInput ─────────────────────────────────────────────────

/**
 * Input shape for PATCH /calendar-entries/:id.
 * Payload is re-validated against the entry's kind in the route handler.
 *
 * @derives(data-flow §6 — calendar entry update)
 * @derives(ADR-0007)
 */
export const UpdateCalendarEntryInput = z
  .object({
    /** Updated payload — route re-validates against the stored kind. */
    payload: z.unknown().optional(),
    /** Updated notes — null clears notes. */
    notes: z.string().max(2000).nullable().optional(),
  })
  .strict();

/**
 * Inferred input type for PATCH /calendar-entries/:id.
 * @derives(data-flow §6)
 * @derives(ADR-0007)
 */
export type UpdateCalendarEntryInputT = z.infer<typeof UpdateCalendarEntryInput>;

// ─── PromoteCalendarEntryInput ────────────────────────────────────────────────

/**
 * Input shape for POST /calendar-entries/:id/promote.
 * Converts a tentative calendar entry into a concrete domain record.
 *
 * @derives(data-flow §6 — calendar entry promote)
 * @derives(ADR-0007)
 */
export const PromoteCalendarEntryInput = z
  .object({
    /** The domain record type to promote this entry into. */
    target: z.enum(['assignment', 'requirement', 'change_request']),
    /**
     * Additional fields required for the target promotion.
     * e.g., validFrom/validUntil for Assignment promotion.
     * Route handler validates these against the target schema.
     */
    additionalFields: z.record(z.unknown()).optional(),
  })
  .strict();

/**
 * Inferred input type for POST /calendar-entries/:id/promote.
 * @derives(data-flow §6)
 * @derives(ADR-0007)
 */
export type PromoteCalendarEntryInputT = z.infer<typeof PromoteCalendarEntryInput>;
