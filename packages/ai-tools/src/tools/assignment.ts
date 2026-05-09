/**
 * propose_create_assignment tool.
 *
 * @derives(master-plan §G)
 */

export const proposeCreateAssignmentTool = {
  name: 'propose_create_assignment',
  description:
    'Propose creating an Assignment (recurring worker × site × shift pattern). Returns DecisionCard that supervisor must confirm via separate Apply call. Use after find_workers/find_sites resolved the IDs. Two shapes: recurring (provide dayMask + validFrom/validUntil) or one-off (provide oneOffDate for single-day; backend auto-fills the rest).',
  input_schema: {
    type: 'object' as const,
    properties: {
      workerId: { type: 'string', description: 'Worker UUID from find_workers' },
      siteId: { type: 'string', description: 'Site UUID from find_sites' },
      shiftStart: { type: 'string', description: 'HH:mm 24h format, e.g., "09:00"' },
      shiftEnd: { type: 'string', description: 'HH:mm 24h format, e.g., "17:00"' },
      dayMask: {
        type: 'string',
        description: '7-char Mon-Sun mask, e.g., "MTWTFS_" for Mon-Sat. Required for recurring.',
      },
      validFrom: { type: 'string', description: 'ISO date YYYY-MM-DD. When the pattern starts.' },
      validUntil: { type: ['string', 'null'], description: 'ISO date or null. null = open-ended.' },
      oneOffDate: {
        type: 'string',
        description:
          'ISO date for single-day. Backend computes dayMask + validFrom=validUntil from this. Provide INSTEAD OF dayMask/validFrom/validUntil.',
      },
    },
    required: ['workerId', 'siteId', 'shiftStart', 'shiftEnd'],
  },
} as const;
