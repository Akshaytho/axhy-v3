/**
 * IST (Asia/Kolkata, UTC+05:30) day-boundary helpers.
 *
 * Indian cleaning-company supervisors think in "today" as their local day —
 * which rolls over at 00:00 IST, not 00:00 UTC. Using `getUTCHours` /
 * `setUTCHours(0,0,0,0)` for day boundaries gave them a `today` window
 * starting at 05:30 IST and ending at 05:30 IST the next morning. Those
 * helpers were replaced by these IST-aware ones (audit B-04 / C-14).
 *
 * All exports return Dates in the UTC epoch domain — the IST offset is
 * applied internally for date-component arithmetic, then unwound so the
 * returned Date can flow into Prisma / postgres unchanged.
 *
 * @derives(master-plan §G) — supervisor surface
 * @derives(ADR-0003)
 */

const IST_OFFSET_MS = 5.5 * 60 * 60_000; // +05:30

/** Shift a Date so its UTC accessors return IST values. */
function toIST(d: Date): Date {
  return new Date(d.getTime() + IST_OFFSET_MS);
}

/**
 * Start of the current IST day as a UTC-epoch Date.
 * @derives(master-plan §G) — supervisor surface
 */
export function startOfISTDay(d: Date = new Date()): Date {
  const ist = toIST(d);
  return new Date(
    Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS,
  );
}

/**
 * End (exclusive) of the current IST day as a UTC-epoch Date.
 * @derives(master-plan §G) — supervisor surface
 */
export function endOfISTDay(d: Date = new Date()): Date {
  return new Date(startOfISTDay(d).getTime() + 86_400_000);
}

/**
 * 0 = Monday … 6 = Sunday in IST, matching Assignment.dayMask layout.
 * @derives(master-plan §G) — supervisor surface
 */
export function mondayBasedDayIndexIST(d: Date = new Date()): number {
  const ist = toIST(d);
  return (ist.getUTCDay() + 6) % 7;
}

/**
 * Build a Date on the same IST day as `ref`, with hours:minutes set to `hh:mm`.
 * Used for comparing shift start times against actual visit times.
 * @derives(master-plan §G) — supervisor surface
 */
export function istTimeOnDate(ref: Date, hhmm: string): Date | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!match) return null;
  const [, hh, mm] = match;
  const dayStart = startOfISTDay(ref);
  return new Date(dayStart.getTime() + Number(hh) * 3_600_000 + Number(mm) * 60_000);
}

/**
 * IST bounds: [startInclusive, endExclusive) for "today".
 * @derives(master-plan §G) — supervisor surface
 */
export function todayISTBounds(): { gte: Date; lt: Date } {
  const start = startOfISTDay();
  return { gte: start, lt: new Date(start.getTime() + 86_400_000) };
}

/**
 * Calendar date string 'YYYY-MM-DD' for the IST day containing `d`.
 * Use this for any "today" DEFAULT shown to or recorded for Indian users —
 * `new Date().toISOString().slice(0,10)` is the UTC day and is one day
 * behind between 00:00-05:29 IST (findings 2026-06-10 C1; walk fix batch).
 * @derives(master-plan §G) — supervisor surface
 */
export function isoDateIST(d: Date = new Date()): string {
  const ist = toIST(d);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const day = String(ist.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * IST bounds for "yesterday".
 * @derives(master-plan §G) — supervisor surface
 */
export function yesterdayISTBounds(): { gte: Date; lt: Date } {
  const today = todayISTBounds();
  return { gte: new Date(today.gte.getTime() - 86_400_000), lt: today.gte };
}

/**
 * IST bounds for the current ISO week (Monday 00:00 IST → next Monday 00:00 IST).
 * @derives(master-plan §G) — supervisor surface
 */
export function thisWeekISTBounds(): { gte: Date; lt: Date } {
  const now = new Date();
  const daysFromMonday = mondayBasedDayIndexIST(now);
  const monday = new Date(startOfISTDay(now).getTime() - daysFromMonday * 86_400_000);
  const nextMonday = new Date(monday.getTime() + 7 * 86_400_000);
  return { gte: monday, lt: nextMonday };
}
