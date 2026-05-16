/**
 * UI formatting helpers — humanize raw backend values.
 *
 * @derives(master-plan §G)
 */

/**
 * Convert 7-char Mon-Sun dayMask to human-readable.
 * "MTWTFS_" → "Mon-Sat"
 * "MTWTFSS" → "Every day"
 * "MTWTF__" → "Weekdays"
 * "_T_____" → "Tue"
 * "M_W_F__" → "Mon, Wed, Fri"
 * "_______" → "(none)"
 */
export function humanizeDayMask(mask: string): string {
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const ch = mask[i];
    const label = labels[i];
    if (ch && ch !== '_' && label) days.push(label);
  }
  if (days.length === 0) return '(none)';
  if (days.length === 7) return 'Every day';
  if (mask === 'MTWTFS_') return 'Mon-Sat';
  if (mask === 'MTWTF__') return 'Weekdays';
  return days.join(', ');
}
