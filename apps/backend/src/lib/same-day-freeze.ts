/**
 * Same-day supervisor-freeze policy (S-001) — API-layer guard.
 *
 * Policy (locked 2026-05-16 in
 *   docs/specs/2026-05-14-supervisor-responsibility-model.md §"2026-05-16 Update"
 *   docs/specs/2026-05-15-workflow-design-closure.md §"2026-05-16 Update"
 * — single-source wording):
 *
 *   "Once the day has started in the tenant's local timezone, no supervisor
 *    responsibility change may take effect for that site until the next
 *    tenant-local midnight."
 *
 * The guard is framed around the business outcome (no responsibility change
 * takes effect today), NOT around any single field. Any code path that mutates
 * a SiteSupervisorBinding row in a way that would change "who is officially
 * responsible today" must call this helper with the relevant boundary instants
 * BEFORE writing.
 *
 * F-002 round-2 atomicity + round-3 auth re-check inside /chat/apply remain in
 * place as defense-in-depth and are unaffected by this guard.
 *
 * @derives(supervisor-responsibility-model 2026-05-16 update)
 * @derives(workflow-design-closure 2026-05-16 update)
 * @derives(production-grade-rulebook rule 25 — policy-first)
 */

/**
 * Default timezone used when callers do not provide one. Axhy is an
 * India-market product (cleaning companies in India); IST is the right
 * launch default. When `Company.timeZone` is added to the schema later,
 * callers should pass `company.timeZone` explicitly.
 *
 * @derives(master-plan §G) — HR control plane / responsibility model
 */
export const DEFAULT_TENANT_TIME_ZONE = 'Asia/Kolkata';

/**
 * Error thrown when a binding mutation would change today's responsibility.
 * HTTP routes should map this to 400 BAD_INPUT.
 *
 * @derives(master-plan §G) — HR control plane / responsibility model
 */
export class SameDayFreezeError extends Error {
  readonly code = 'SAME_DAY_FREEZE' as const;
  constructor(message: string) {
    super(message);
    this.name = 'SameDayFreezeError';
  }
}

/**
 * @derives(master-plan §G) — HR control plane / responsibility model
 */
export type AssertNotChangingTodaysResponsibilityArgs = {
  /** Defaults to `new Date()`. Tests pass a fixed Date for determinism. */
  now?: Date;
  /** IANA timezone name. Defaults to {@link DEFAULT_TENANT_TIME_ZONE}. */
  tenantTimeZone?: string;
  /** When the mutation says a (new) binding becomes effective. */
  effectiveFrom?: Date | null;
  /** When the mutation says an (existing) binding stops being effective. */
  effectiveUntil?: Date | null;
};

/**
 * Throws {@link SameDayFreezeError} if either `effectiveFrom` or
 * `effectiveUntil` falls before the next tenant-local midnight relative to
 * `now`. Either argument can be `undefined` / `null` (skipped). Callers in HTTP
 * routes should map `SameDayFreezeError` to 400 BAD_INPUT.
 *
 * @derives(master-plan §G) — HR control plane / responsibility model
 */
export function assertNotChangingTodaysResponsibility(
  args: AssertNotChangingTodaysResponsibilityArgs,
): void {
  const now = args.now ?? new Date();
  const tz = args.tenantTimeZone ?? DEFAULT_TENANT_TIME_ZONE;
  const cutoff = tomorrowMidnightInTimeZone(now, tz);

  if (args.effectiveFrom != null && args.effectiveFrom.getTime() < cutoff.getTime()) {
    throw new SameDayFreezeError(
      `S-001 same-day supervisor-freeze: effectiveFrom ${args.effectiveFrom.toISOString()} is before the next tenant-local midnight (${cutoff.toISOString()}, tz=${tz}). Same-day responsibility changes are forbidden.`,
    );
  }
  if (args.effectiveUntil != null && args.effectiveUntil.getTime() < cutoff.getTime()) {
    throw new SameDayFreezeError(
      `S-001 same-day supervisor-freeze: effectiveUntil ${args.effectiveUntil.toISOString()} is before the next tenant-local midnight (${cutoff.toISOString()}, tz=${tz}). Same-day responsibility changes are forbidden.`,
    );
  }
}

/**
 * Compute the UTC instant at which the local clock in `tz` next reads
 * 00:00:00 strictly after `now`. Handles DST transitions because the offset
 * is sampled at the candidate instant, not assumed constant.
 *
 * Exported for tests; not part of the public guard API.
 *
 * @derives(master-plan §G) — HR control plane / responsibility model
 */
export function tomorrowMidnightInTimeZone(now: Date, tz: string): Date {
  const dateFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayParts = dateFmt.formatToParts(now);
  const y = Number(todayParts.find((p) => p.type === 'year')!.value);
  const m = Number(todayParts.find((p) => p.type === 'month')!.value);
  const d = Number(todayParts.find((p) => p.type === 'day')!.value);

  // Candidate: 00:00 of (tomorrow's date in tz) treated as if tz were UTC.
  const candidate = new Date(Date.UTC(y, m - 1, d + 1, 0, 0, 0));

  // Re-format the candidate in tz to observe its wall-clock representation
  // at that instant; the difference tells us the tz offset at this moment
  // (accounting for any DST transition).
  const fullFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const cparts = fullFmt.formatToParts(candidate);
  const cy = Number(cparts.find((p) => p.type === 'year')!.value);
  const cm = Number(cparts.find((p) => p.type === 'month')!.value);
  const cd = Number(cparts.find((p) => p.type === 'day')!.value);
  const ch = Number(cparts.find((p) => p.type === 'hour')!.value);
  const cmin = Number(cparts.find((p) => p.type === 'minute')!.value);
  const cs = Number(cparts.find((p) => p.type === 'second')!.value);
  const observedAsUtc = Date.UTC(cy, cm - 1, cd, ch, cmin, cs);
  const offsetMs = observedAsUtc - candidate.getTime();

  return new Date(candidate.getTime() - offsetMs);
}
