/**
 * Assignment state-machine helpers (3 states: DRAFT, ACTIVE, TERMINATED).
 *
 * All functions pure. No DB access, no side effects.
 *
 * @derives(master-plan §G)
 */

export type AssignmentState = 'DRAFT' | 'ACTIVE' | 'TERMINATED';

/**
 * Allowed transitions.
 * DRAFT can go to ACTIVE (confirmed) or TERMINATED (cancelled before activation).
 * ACTIVE can only go to TERMINATED.
 * TERMINATED is terminal.
 */
export function canTransition(from: AssignmentState, to: AssignmentState): boolean {
  if (from === 'DRAFT' && to === 'ACTIVE') return true;
  if (from === 'DRAFT' && to === 'TERMINATED') return true;
  if (from === 'ACTIVE' && to === 'TERMINATED') return true;
  return false;
}

/**
 * 7-char dayMask Mon-Sun.
 * Index 0 = Monday, index 6 = Sunday.
 * Single-day mask = letter at the date's day-of-week index, '_' elsewhere.
 *
 * @derives(master-plan §G)
 */
export function dayMaskFromDate(date: Date): string {
  const dayOfWeek = date.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  // Convert Sun-indexed JS day to Mon-indexed mask position
  const mondayIdx = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  return labels.map((ch, i) => (i === mondayIdx ? ch : '_')).join('');
}

type OneOffInput = {
  workerId: string;
  siteId: string;
  oneOffDate: string; // ISO YYYY-MM-DD
  shiftStart: string;
  shiftEnd: string;
};

type RecurringShape = {
  workerId: string;
  siteId: string;
  dayMask: string;
  shiftStart: string;
  shiftEnd: string;
  validFrom: string;
  validUntil: string;
};

/**
 * Convert a single-day "send Suresh today only" input into the canonical
 * recurring shape with validFrom = validUntil = oneOffDate.
 *
 * @derives(master-plan §G)
 */
export function expandOneOffToRecurring(input: OneOffInput): RecurringShape {
  const date = new Date(input.oneOffDate + 'T00:00:00Z');
  return {
    workerId: input.workerId,
    siteId: input.siteId,
    dayMask: dayMaskFromDate(date),
    shiftStart: input.shiftStart,
    shiftEnd: input.shiftEnd,
    validFrom: input.oneOffDate,
    validUntil: input.oneOffDate,
  };
}
