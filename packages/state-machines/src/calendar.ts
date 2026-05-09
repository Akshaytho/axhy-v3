/**
 * CalendarEntry state-machine helpers.
 *
 * All functions pure. No DB access, no side effects.
 *
 * @derives(master-plan §G)
 */

export type CalendarKind = 'NOTE' | 'DEMAND' | 'TENTATIVE_ASSIGNMENT' | 'EVENT';
export type PromoteTarget = 'assignment' | 'requirement' | 'change_request';

const EDITABLE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function computeEditableUntil(createdAt: Date, promotedAt: Date | null): Date {
  const cap = new Date(createdAt.getTime() + EDITABLE_WINDOW_MS);
  if (!promotedAt) return cap;
  return promotedAt.getTime() < cap.getTime() ? promotedAt : cap;
}

export function canEdit(
  editableUntil: Date,
  promotedAt: Date | null,
  now: Date = new Date(),
): boolean {
  if (promotedAt) return false;
  return now.getTime() < editableUntil.getTime();
}

/**
 * Which kinds can promote to which targets.
 *
 * @derives(master-plan §G)
 */
export function canPromote(kind: CalendarKind, target: PromoteTarget): boolean {
  if (kind === 'NOTE') return false;
  if (kind === 'EVENT') return false;
  if (kind === 'DEMAND') return target === 'requirement';
  if (kind === 'TENTATIVE_ASSIGNMENT') return target === 'assignment';
  return false;
}

type TentativeAssignmentPayload = {
  workerId: string;
  siteId: string;
  shiftStart?: string;
  shiftEnd?: string;
};

/**
 * Map TENTATIVE_ASSIGNMENT calendar entry → Assignment row inputs for
 * single-day promotion (validFrom = validUntil = entry's date).
 *
 * Day-mask layout: 7-char string, Monday-indexed (M T W T F S S).
 *
 * @derives(master-plan §G)
 */
export function mapCalendarPayloadToAssignment(
  payload: TentativeAssignmentPayload,
  date: Date,
  opts: { extraFields?: { validUntil?: Date | null } } = {},
): {
  workerId: string;
  siteId: string;
  shiftStart: string;
  shiftEnd: string;
  dayMask: string;
  validFrom: Date;
  validUntil: Date | null;
} {
  const dayOfWeek = date.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  // Convert Sun-indexed JS day to Mon-indexed mask position
  const mondayIdx = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const dayMask = labels.map((ch, i) => (i === mondayIdx ? ch : '_')).join('');

  const overrideValidUntil = opts.extraFields?.validUntil;
  return {
    workerId: payload.workerId,
    siteId: payload.siteId,
    shiftStart: payload.shiftStart ?? '09:00',
    shiftEnd: payload.shiftEnd ?? '17:00',
    dayMask,
    validFrom: date,
    validUntil: overrideValidUntil === undefined ? date : overrideValidUntil,
  };
}
