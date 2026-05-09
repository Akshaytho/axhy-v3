/**
 * propose_termination — single tool; backend resolves probation/permanent via tenure.
 *
 * @derives(master-plan §G)
 */

export const proposeTerminationTool = {
  name: 'propose_termination',
  description:
    'Propose terminating a worker. Use when supervisor says "Fire Pradeep, performance issues". Backend computes whether this is probation (tenure < 240 days, HR approves) or permanent (tenure >= 240 days, OWNER approves) per Spec 1 §6.',
  input_schema: {
    type: 'object' as const,
    properties: {
      workerId: { type: 'string', description: 'UUID from find_workers' },
      effectiveDate: { type: 'string', description: 'ISO date YYYY-MM-DD' },
      reason: {
        type: 'string',
        enum: ['performance', 'attendance', 'misconduct', 'mutual', 'redundancy', 'other'],
      },
      reasonDetail: {
        type: 'string',
        description: 'Required for permanent terminations (>=240 days tenure)',
      },
    },
    required: ['workerId', 'effectiveDate', 'reason'],
  },
} as const;
