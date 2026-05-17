/**
 * Wave 3 chat tools — `propose_log_complaint` + `propose_clarify`.
 *
 * `propose_log_complaint` is invoked when the intent classifier determines
 * the supervisor is describing a quality issue / missed work / damage /
 * theft / hygiene / noise / attitude / photo-mismatch / gate-pass event
 * at a site, OR quoting a client complaint. The tool persists a Complaint
 * row + an initial ComplaintMessage row authored by the supervisor and
 * enqueues the `hr.site_complaint` outbox event.
 *
 * `propose_clarify` is the confidence-gated fallback. When intent classifier
 * confidence drops below 0.7 (a property of how the model phrases the tool
 * call — the tool description includes the rubric), the model picks
 * `propose_clarify` with 2–4 short options instead of guessing. Mobile
 * renders the options as tappable chips.
 *
 * Few-shot examples and the classification rubric live in the system prompt
 * (see `apps/backend/src/routes/chat.ts:SYSTEM_PROMPT_WAVE_THREE`), not here,
 * so this file stays tool-shape-only.
 *
 * @derives(supervisor-drawer-and-decisions-redesign.md §C)
 * @derives(supervisor-30day-scenarios.md scenarios #26–38)
 * @derives(panel-2026-05-18) — Wave 3 backend
 */

/**
 * Anthropic-shaped tool for `propose_log_complaint`.
 * @derives(supervisor-drawer-and-decisions-redesign.md §C.3)
 * @derives(master-plan §G) — supervisor surface
 */
export const proposeLogComplaintTool = {
  name: 'propose_log_complaint',
  description:
    'Log a complaint about a site. Use when the supervisor describes a concrete quality issue, missed work, damage, theft accusation, hygiene problem, noise problem, attitude / rudeness, photo mismatch, gate-pass issue at a specific site OR quotes a client complaint. Requires a CONCRETE site AND a CONCRETE event — if either is missing or ambiguous, call propose_clarify instead. Do NOT call this for general venting ("everything is bad today"). Do NOT call this for worker absence ("Mukesh did not come today" → propose_mark_absent). Severity rubric: LOW = single occurrence / "minor" / "small"; MEDIUM = "again" / "second time" / "client noticed"; HIGH = "client threatening to cancel" / "damage" / "theft" / "injury" / "very angry". Kind rubric: photo_mismatch | missed_area | attitude | theft_accusation | hygiene | noise | damage | gate_pass | other.',
  input_schema: {
    type: 'object' as const,
    properties: {
      siteId: {
        type: 'string',
        description:
          'UUID from find_sites. The site the complaint is about. If supervisor named a site but find_sites returned multiple candidates, call propose_clarify instead of guessing.',
      },
      severity: {
        type: 'string',
        enum: ['LOW', 'MEDIUM', 'HIGH'],
        description:
          'LOW = minor / single occurrence. MEDIUM = repeat / client noticed. HIGH = damage / theft / injury / client threatening to cancel.',
      },
      kind: {
        type: 'string',
        enum: [
          'photo_mismatch',
          'missed_area',
          'attitude',
          'theft_accusation',
          'hygiene',
          'noise',
          'damage',
          'gate_pass',
          'other',
        ],
        description:
          'Specific complaint kind. Use "other" only when none of the named kinds fit. Use "theft_accusation" rather than "theft" (the accusation is what we log; investigation is HR\'s job).',
      },
      description: {
        type: 'string',
        description:
          "Supervisor's words, cleaned of filler ('um', 'you know'), max 280 chars. Preserve the supervisor's language (Hindi / Telugu / English / mix) — do not translate.",
      },
      observedAt: {
        type: 'string',
        description:
          'Optional ISO-8601 datetime when the incident was observed. Omit if the supervisor did not say.',
      },
    },
    required: ['siteId', 'severity', 'kind', 'description'],
  },
} as const;

/**
 * Anthropic-shaped tool for `propose_clarify` — confidence-gated fallback.
 * @derives(supervisor-drawer-and-decisions-redesign.md §C.2)
 * @derives(master-plan §G) — supervisor surface
 */
export const proposeClarifyTool = {
  name: 'propose_clarify',
  description:
    "Ask the supervisor to pick from 2-4 short options when intent classification confidence is below 0.7. Use when the supervisor's message is ambiguous between two or more tools (e.g. 'Mukesh issue at Aparna' — could be mark_absent OR log_complaint), when the site name matches multiple sites, or when the severity is unclear and the choice changes the downstream flow. Do NOT use this for missing single fields (use a plain text follow-up question instead). Do NOT use this for general chit-chat (use general response).",
  input_schema: {
    type: 'object' as const,
    properties: {
      question: {
        type: 'string',
        description:
          'One-line question shown above the chips. ≤140 chars. Match the supervisor\'s language. Example: "Mukesh ke baare mein — kya karna hai?" (Hindi) or "What do you want to do about Mukesh?"',
      },
      options: {
        type: 'array',
        items: { type: 'string' },
        minItems: 2,
        maxItems: 4,
        description:
          'Tap options for the supervisor. Each ≤24 chars (single chip line). Examples: ["Mark absent", "Log complaint", "Send swap"] or ["Aparna A-block", "Aparna B-block", "Cancel"].',
      },
    },
    required: ['question', 'options'],
  },
} as const;
