/**
 * Conflict detection for proposed Assignment changes.
 *
 * Pure function. No DB access. Caller passes the relevant active state.
 *
 * Wave 4a-PRO MVP: only checks Assignment overlap (worker double-booking).
 * Visits / calendarEntries / changeRequests params accepted for forward
 * compatibility — populated by future waves.
 *
 * @derives(master-plan §G)
 * @derives(spec-1 §7.4)
 */

export type ConflictSeverity = 'SOFT' | 'HARD';

export type Conflict = {
  severity: ConflictSeverity;
  kind: 'WORKER_DOUBLE_BOOK' | 'EXACT_DUPLICATE';
  /** Human-readable message — surfaced in DecisionCard. */
  message: string;
  /** ID of the conflicting record so UI can deep-link. */
  conflictsWithAssignmentId?: string;
};

export type DetectConflictsInput = {
  workerId: string;
  dateRange: { from: Date; to: Date | null };
  newShift: { shiftStart: string; shiftEnd: string; dayMask: string };
};

export type ActiveAssignmentRow = {
  id: string;
  workerId: string;
  siteId: string;
  shiftStart: string;
  shiftEnd: string;
  dayMask: string;
  validFrom: Date;
  validUntil: Date | null;
  state: string;
};

export type DetectConflictsContext = {
  activeAssignments: ReadonlyArray<ActiveAssignmentRow>;
  /** Reserved for future visits-based conflict (Wave 4b). */
  visits: ReadonlyArray<unknown>;
  /** Reserved for future calendar-based conflict (Wave 4b). */
  calendarEntries: ReadonlyArray<unknown>;
  /** Reserved for future change-request-based conflict (Wave 2b). */
  changeRequests: ReadonlyArray<unknown>;
};

/**
 * Returns ALL conflicts found. Caller picks max severity to color the
 * DecisionCard (HARD ⇒ BLOCKED, any SOFT ⇒ WARN, none ⇒ CONFIRM).
 */
export function detectConflicts(
  input: DetectConflictsInput,
  ctx: DetectConflictsContext,
): Conflict[] {
  const conflicts: Conflict[] = [];
  for (const a of ctx.activeAssignments) {
    if (a.state !== 'ACTIVE') continue;
    if (a.workerId !== input.workerId) continue;

    if (!datesOverlap(input.dateRange, { from: a.validFrom, to: a.validUntil })) {
      continue;
    }
    if (!dayMasksIntersect(input.newShift.dayMask, a.dayMask)) {
      continue;
    }
    if (!shiftTimesOverlap(input.newShift, a)) {
      continue;
    }

    const isExactDup =
      a.shiftStart === input.newShift.shiftStart &&
      a.shiftEnd === input.newShift.shiftEnd &&
      a.dayMask === input.newShift.dayMask;

    conflicts.push({
      severity: isExactDup ? 'HARD' : 'SOFT',
      kind: isExactDup ? 'EXACT_DUPLICATE' : 'WORKER_DOUBLE_BOOK',
      message: isExactDup
        ? `Worker is already on this exact shift at site ${a.siteId}`
        : `Worker has overlapping shift ${a.shiftStart}-${a.shiftEnd} on ${a.dayMask} at site ${a.siteId}`,
      conflictsWithAssignmentId: a.id,
    });
  }
  return conflicts;
}

function datesOverlap(
  a: { from: Date; to: Date | null },
  b: { from: Date; to: Date | null },
): boolean {
  if (a.to !== null && a.to < b.from) return false;
  if (b.to !== null && b.to < a.from) return false;
  return true;
}

function dayMasksIntersect(a: string, b: string): boolean {
  if (a.length !== 7 || b.length !== 7) return false;
  for (let i = 0; i < 7; i++) {
    if (a[i] !== '_' && b[i] !== '_') return true;
  }
  return false;
}

function shiftTimesOverlap(
  a: { shiftStart: string; shiftEnd: string },
  b: { shiftStart: string; shiftEnd: string },
): boolean {
  const aStart = toMins(a.shiftStart);
  const aEnd = toMins(a.shiftEnd);
  const bStart = toMins(b.shiftStart);
  const bEnd = toMins(b.shiftEnd);
  return aStart < bEnd && bStart < aEnd;
}

function toMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
