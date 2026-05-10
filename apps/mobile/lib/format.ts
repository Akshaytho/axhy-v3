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
  const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    if (mask[i] && mask[i] !== '_') days.push(labels[i]);
  }
  if (days.length === 0) return '(none)';
  if (days.length === 7) return 'Every day';
  if (mask === 'MTWTFS_') return 'Mon-Sat';
  if (mask === 'MTWTF__') return 'Weekdays';
  return days.join(', ');
}
