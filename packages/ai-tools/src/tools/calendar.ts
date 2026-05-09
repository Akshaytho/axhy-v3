/**
 * Calendar tool definitions (Anthropic-compatible JSON schema).
 *
 * Wave 1: schemas only. Wave 2 wires the Anthropic adapter that calls
 * these tools and routes to the backend POST /calendar / POST /calendar/:id/promote routes.
 *
 * @derives(master-plan §G)
 */

export const proposeCalendarEntryTool = {
  name: 'propose_calendar_entry',
  description:
    'Propose a soft-state calendar entry on a specific date for the supervisor. Use for: tentative plans, demand statements, free-form notes, and events. NOT for committed assignments — use propose_create_assignment for those. Multiple calls in one turn allowed for compound utterances (see Spec §9.6).',
  input_schema: {
    type: 'object' as const,
    properties: {
      date: {
        type: 'string',
        description: 'ISO date YYYY-MM-DD. Within the next 30 days from today.',
      },
      kind: {
        type: 'string',
        enum: ['NOTE', 'DEMAND', 'TENTATIVE_ASSIGNMENT', 'EVENT'],
        description:
          "NOTE = free-form text only. DEMAND = site needs N workers. TENTATIVE_ASSIGNMENT = supervisor's tentative pick of a worker for a site. EVENT = non-shift event (client visit, audit, etc).",
      },
      payload: {
        type: 'object',
        description:
          'Kind-specific structured fields. NOTE: empty {}. DEMAND: { siteId, headcount, shift?, skillRequired? }. TENTATIVE_ASSIGNMENT: { workerId, siteId, shiftStart?, shiftEnd? }. EVENT: { siteId?, title, startTime?, endTime? }.',
      },
      notes: {
        type: 'string',
        description: 'Free-form supervisor text. Required for NOTE; optional for other kinds.',
      },
    },
    required: ['date', 'kind', 'payload'],
  },
} as const;

export const proposePromoteCalendarEntryTool = {
  name: 'propose_promote_calendar_entry',
  description:
    "Promote a soft-state calendar entry to a hard-state row (Assignment, SiteShiftRequirement, or ChangeRequest). Use when supervisor says 'lock in', 'confirm', 'commit' on a previously-stored tentative or demand. Multiple promotes in one turn allowed for batch confirmations.",
  input_schema: {
    type: 'object' as const,
    properties: {
      entryId: {
        type: 'string',
        description: 'CalendarEntry.id to promote.',
      },
      target: {
        type: 'string',
        enum: ['assignment', 'requirement', 'change_request'],
        description:
          'TENTATIVE_ASSIGNMENT promotes to assignment. DEMAND promotes to requirement. NOTE/EVENT cannot promote.',
      },
      additionalFields: {
        type: 'object',
        description:
          "Optional overrides. Example: { validUntil: null } to make a TENTATIVE_ASSIGNMENT promotion open-ended (default is single-day matching entry's date).",
      },
    },
    required: ['entryId', 'target'],
  },
} as const;

export const calendarTools = [proposeCalendarEntryTool, proposePromoteCalendarEntryTool] as const;
