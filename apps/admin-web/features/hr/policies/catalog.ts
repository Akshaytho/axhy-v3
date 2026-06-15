/**
 * Policy display catalog — the v6 `more.jsx` policy list, verbatim metadata.
 *
 * The backend owns the real values + history + the write ACL (`editable`); this
 * file owns presentation only: human label, grouping category, control type,
 * unit/options, and the one-line hint. Keyed by the dotted policy key so the
 * screen can merge `GET /admin/policy` values onto the right row in v6 order.
 *
 * Mirrors apps/backend shared-schema DEFAULT_POLICY_KEYS (12) plus the two
 * owner-only AI keys v6 surfaces (ai.rules.company.tone, ai.limits.daily_messages).
 */

/**
 * The control type for a policy, picking how its value renders and edits.
 * @derives(master-plan §G)
 */
export type PolicyType = 'number' | 'select' | 'list' | 'bytes' | 'boolean' | 'text';

/**
 * Presentation metadata for a single policy row.
 * @derives(master-plan §G)
 */
export type PolicyMeta = {
  key: string;
  label: string;
  /** Display grouping shown as a chip — NOT the DB category enum. */
  category: string;
  type: PolicyType;
  unit?: string;
  options?: string[];
  hint: string;
};

/**
 * Ordered exactly as v6 renders them.
 * @derives(master-plan §G)
 */
export const POLICY_CATALOG: PolicyMeta[] = [
  {
    key: 'hr.queue.urgent_sla_minutes',
    label: 'Urgent request reply time',
    category: 'Queue',
    type: 'number',
    unit: 'min',
    hint: 'How fast an urgent request must get a first reply.',
  },
  {
    key: 'hr.queue.next_day_sla_minutes',
    label: 'Next-day reply time',
    category: 'Queue',
    type: 'number',
    unit: 'min',
    hint: 'Reply target for next-day requests.',
  },
  {
    key: 'hr.queue.standard_sla_days',
    label: 'Standard reply time',
    category: 'Queue',
    type: 'number',
    unit: 'days',
    hint: 'Reply target for standard requests.',
  },
  {
    key: 'hr.pod.target_worker_count',
    label: 'Workers per HR (target)',
    category: 'Workload',
    type: 'number',
    hint: 'Target roster size per HR.',
  },
  {
    key: 'hr.pod.target_supervisor_count',
    label: 'Supervisors per HR (target)',
    category: 'Workload',
    type: 'number',
    hint: 'Target supervisor count per HR.',
  },
  {
    key: 'worker.preferred_language_default',
    label: 'Default worker language',
    category: 'Workers',
    type: 'select',
    options: ['hi', 'te', 'en'],
    hint: 'Language new workers get by default.',
  },
  {
    key: 'worker.termination_appeal_days',
    label: 'Days a worker can appeal removal',
    category: 'Workers',
    type: 'number',
    unit: 'days',
    hint: 'Window for a removed worker to appeal.',
  },
  {
    key: 'ai.backlog.chip_upgrade_seconds',
    label: 'AI: slow-queue warning',
    category: 'AI ops',
    type: 'number',
    unit: 'sec',
    hint: 'When a queued AI item is flagged slow.',
  },
  {
    key: 'ai.backlog.global_banner_threshold',
    label: 'AI: busy-banner threshold',
    category: 'AI ops',
    type: 'number',
    hint: 'Backlog size that shows the busy banner.',
  },
  {
    key: 'notification.channel_fallback_chain',
    label: 'Message delivery order',
    category: 'Notifications',
    type: 'list',
    hint: 'Order AXHY tries to reach people.',
  },
  {
    key: 'handoff.max_size_bytes',
    label: 'Handover file size cap',
    category: 'Handoff',
    type: 'bytes',
    hint: 'Largest handover file allowed.',
  },
  {
    key: 'hr_updates.audience_workers_default',
    label: 'Send HR updates to workers by default',
    category: 'Updates',
    type: 'boolean',
    hint: 'Whether updates default to reaching workers.',
  },
  {
    key: 'ai.rules.company.tone',
    label: 'AI assistant tone',
    category: 'AI',
    type: 'text',
    hint: 'Company-wide AI behaviour. Owner-only — HR cannot change this.',
  },
  {
    key: 'ai.limits.daily_messages',
    label: 'AI daily message limit',
    category: 'AI',
    type: 'number',
    hint: 'Owner-only AI usage cap.',
  },
];

const LANG_LABEL: Record<string, string> = { hi: 'Hindi', te: 'Telugu', en: 'English' };

/**
 * Format a stored policy value for display, using the catalog type.
 * @derives(master-plan §G)
 */
export function fmtPolicyVal(meta: PolicyMeta, value: unknown): string {
  switch (meta.type) {
    case 'boolean':
      return value ? 'On' : 'Off';
    case 'list':
      return Array.isArray(value) ? value.join(' → ') : String(value ?? '');
    case 'bytes': {
      const n = Number(value) || 0;
      return n >= 1048576 ? `${n / 1048576} MB` : `${Math.round(n / 1024)} KB`;
    }
    case 'number':
      return `${value}${meta.unit ? ' ' + meta.unit : ''}`;
    case 'select':
      return LANG_LABEL[String(value)] ?? String(value);
    default:
      return String(value);
  }
}

/**
 * Format a history value (no unit suffix — the timeline is per-key).
 * @derives(master-plan §G)
 */
export function fmtHistVal(meta: PolicyMeta | undefined, value: unknown): string {
  if (Array.isArray(value)) return value.join(' → ');
  if (meta?.type === 'select') return LANG_LABEL[String(value)] ?? String(value);
  if (meta?.type === 'boolean') return value ? 'On' : 'Off';
  if (meta?.type === 'bytes') {
    const n = Number(value) || 0;
    return n >= 1048576 ? `${n / 1048576} MB` : `${Math.round(n / 1024)} KB`;
  }
  return String(value);
}
