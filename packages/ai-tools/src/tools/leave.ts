/**
 * propose_leave — workers requesting time off.
 *
 * @derives(master-plan §G)
 */

export const proposeLeaveTool = {
  name: 'propose_leave',
  description:
    'Propose a leave request for a worker. Use when supervisor says "Suresh sick for 3 days" / "Pradeep needs leave Monday to Wednesday". HR approves per Spec 1 §6 approver-role table.',
  input_schema: {
    type: 'object' as const,
    properties: {
      workerId: { type: 'string', description: 'UUID from find_workers' },
      fromDate: { type: 'string', description: 'ISO date YYYY-MM-DD' },
      toDate: {
        type: 'string',
        description: 'ISO date YYYY-MM-DD; same as fromDate for one-day',
      },
      reason: {
        type: 'string',
        enum: ['sick', 'casual', 'vacation', 'emergency', 'other'],
      },
      reasonDetail: { type: 'string' },
    },
    required: ['workerId', 'fromDate', 'toDate'],
  },
} as const;
