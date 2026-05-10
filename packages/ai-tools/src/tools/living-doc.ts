/**
 * propose_living_doc_update — supervisor codifies a rule for AI to remember.
 *
 * 15th propose_* tool per Spec 2 §6.2. Fires when supervisor utterance contains
 * an explicit rule pattern ("remember Mukesh tends to be late on rainy days",
 * "always assign Suresh to Apollo morning shifts", "Mukesh is also called Bihari Suresh").
 *
 * AI emits this tool call AS PART OF its main response (no extra Sonnet/GPT call;
 * same loop). The DecisionCard surfaces the proposed rule for supervisor confirm;
 * on Apply tap, /chat/apply writes the rule to LivingDoc and bumps version.
 *
 * @derives(master-plan §G)
 * @derives(ADR-0023)
 * @derives(spec-2 §6.2)
 */

export const proposeLivingDocUpdateTool = {
  name: 'propose_living_doc_update',
  description:
    'Codify a rule for the supervisor\'s LivingDoc so AI remembers it on future calls. Use when supervisor says "remember X", "always Y", "Mukesh tends to Z", or expresses a worker alias / site rule / client preference / recurring task / general note. AI proposes the rule; supervisor confirms via Apply.',
  input_schema: {
    type: 'object' as const,
    properties: {
      section: {
        type: 'string',
        enum: ['site_rules', 'worker_notes', 'client_preferences', 'recurring_tasks', 'free_notes'],
        description:
          'Which LivingDoc section the rule belongs in. site_rules = rules about a site (e.g. "no entry without ID"); worker_notes = facts about a worker (e.g. "Mukesh is late on rainy days"); client_preferences = client-side preferences (e.g. "Apollo prefers morning shifts"); recurring_tasks = repeating chores (e.g. "deep clean Sundays"); free_notes = general notes that do not fit elsewhere.',
      },
      visibility: {
        type: 'string',
        enum: ['COMPANY', 'SUPERVISOR_OWN', 'WORKER_OWN'],
        description:
          'COMPANY: visible to HR + Owner + all Supervisors. SUPERVISOR_OWN: visible only to this supervisor (default for personal patterns). WORKER_OWN: AI uses it when answering ABOUT this worker, not visible directly. Default to SUPERVISOR_OWN if unsure.',
      },
      ruleText: {
        type: 'string',
        description:
          'Human-readable rule for supervisor to read on the DecisionCard. Short; one sentence. e.g. "Mukesh is also called Bihari Suresh" or "Apollo Hospital prefers AC switched off after midnight".',
      },
      description: {
        type: 'string',
        description:
          'Natural-language elaboration for AI consumption on future calls. May include context, exceptions, history. e.g. "Worker alias: Mukesh (UUID xxx) is referred to by his nickname Bihari Suresh in informal speech; treat both names as the same worker".',
      },
      scope: {
        type: 'object',
        description:
          'Optional scope narrowing. Include workerId from find_workers when rule is about a specific worker; siteId from find_sites when about a site. Omit fields that do not apply.',
        properties: {
          workerId: { type: 'string', description: 'UUID from find_workers' },
          siteId: { type: 'string', description: 'UUID from find_sites' },
          clientId: {
            type: 'string',
            description: 'UUID (clientId not yet exposed via find tool; rare)',
          },
        },
      },
    },
    required: ['section', 'visibility', 'ruleText', 'description'],
  },
} as const;
