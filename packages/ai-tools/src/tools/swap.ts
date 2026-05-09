/**
 * propose_swap — exchange two workers' assignments at a site.
 *
 * @derives(master-plan §G)
 */

export const proposeSwapTool = {
  name: 'propose_swap',
  description:
    'Propose swapping two workers between sites or shifts. Use when supervisor says "Swap Ravi and Lakshmi at Hospital A tomorrow". Both workers must exist; resolve via find_workers first.',
  input_schema: {
    type: 'object' as const,
    properties: {
      fromWorkerId: { type: 'string', description: 'Worker leaving the site (UUID)' },
      toWorkerId: { type: 'string', description: 'Worker taking the site (UUID)' },
      siteId: { type: 'string', description: 'Site UUID from find_sites' },
      effectiveAt: { type: 'string', description: 'ISO datetime when swap takes effect' },
      reason: { type: 'string' },
    },
    required: ['fromWorkerId', 'toWorkerId', 'siteId', 'effectiveAt'],
  },
} as const;
