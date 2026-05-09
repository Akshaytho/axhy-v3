/**
 * Read tool definitions — find_workers, find_sites.
 * AI uses these to resolve names → IDs before proposing actions.
 *
 * @derives(master-plan §G)
 */

export const findWorkersTool = {
  name: 'find_workers',
  description:
    'Look up workers by name, alias, or phone-last-4. Returns exact matches + ambiguous candidates with disambiguation context (phone_last4, recentSite, recentAction, tenureDays). Use BEFORE proposing any worker-related action when the supervisor said a name.',
  input_schema: {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Worker name, alias, or phone-last-4' },
      supervisorScope: {
        type: 'boolean',
        description: "true = only workers in this supervisor's sites; false = company-wide",
      },
    },
    required: ['query', 'supervisorScope'],
  },
} as const;

export const findSitesTool = {
  name: 'find_sites',
  description:
    'Look up sites by name or alias. Returns exact + ambiguous matches with context (alias, address_brief, activeAssignments count, client_name). Use BEFORE proposing any site-related action when supervisor said a site name.',
  input_schema: {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Site name or alias' },
      supervisorScope: { type: 'boolean', description: "true = only this supervisor's sites" },
    },
    required: ['query', 'supervisorScope'],
  },
} as const;
