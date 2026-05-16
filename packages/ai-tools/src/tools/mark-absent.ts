/**
 * propose_mark_absent — supervisor's #1 daily action.
 *
 * @derives(master-plan §G)
 */

export const proposeMarkAbsentTool = {
  name: 'propose_mark_absent',
  description:
    'Propose marking a worker absent for a specific date. Use when supervisor says "Mukesh is absent today" / "Suresh did not show up" / "Lakshmi called sick". After find_workers resolves the worker by name, propose this. Backend will detect if the worker is already on leave (conflict) and surface as WARN.',
  input_schema: {
    type: 'object' as const,
    properties: {
      workerId: { type: 'string', description: 'UUID from find_workers' },
      date: { type: 'string', description: 'ISO date YYYY-MM-DD; default today if omitted' },
      reason: {
        type: 'string',
        enum: ['sick', 'family', 'transport', 'unknown', 'other'],
        description: 'Common buckets; "unknown" if supervisor did not say',
      },
      reasonDetail: { type: 'string', description: 'Optional supervisor note' },
    },
    required: ['workerId'],
  },
} as const;
