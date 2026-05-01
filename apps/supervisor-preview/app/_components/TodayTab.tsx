/**
 * TodayTab — Today's Plan tab for the Axhy supervisor mobile preview.
 *
 * Shows the stat strip, site cards with worker chips, an AI-draft action,
 * and the long-press-to-swap tip. Varies lightly on timeOfDay.
 *
 * @derives(master-plan §G)
 */

'use client';

import { SITES, WORKERS, type TimeOfDay, type Site, type Worker } from '../_lib/mock';

/** Map a site's todayStatus to the status pill label. @derives(master-plan §G) */
function statusLabel(status: Site['todayStatus']): string {
  switch (status) {
    case 'covered':
      return 'Covered';
    case 'short_staffed':
      return 'Short';
    case 'flagged':
      return 'Flagged';
    case 'pending':
      return 'Pending';
  }
}

/** CSS modifier class for a site card / status pill. @derives(master-plan §G) */
function siteModifier(status: Site['todayStatus']): string {
  switch (status) {
    case 'flagged':
      return 'is-flagged';
    case 'short_staffed':
      return 'is-short';
    case 'covered':
      return 'is-covered';
    case 'pending':
      return 'is-pending';
  }
}

/** CSS modifier for a worker chip based on todayStatus. @derives(master-plan §G) */
function chipModifier(status: Worker['todayStatus']): string {
  switch (status) {
    case 'absent_no_call':
      return 'is-absent';
    case 'absent_notified':
      return 'is-absent-noted';
    default:
      return '';
  }
}

/** Workers assigned to a given site. @derives(master-plan §G) */
function workersAtSite(siteId: string): Worker[] {
  return WORKERS.filter((w) => w.assignedSite === siteId);
}

/**
 * Compute the three headline stats from mock data.
 * present = any status that is NOT 'off'.
 * @derives(master-plan §G)
 */
function computeStats(): { presentCount: number; shortCount: number; flaggedCount: number } {
  const presentCount = WORKERS.filter(
    (w) =>
      w.todayStatus === 'present' ||
      w.todayStatus === 'absent_notified' ||
      w.todayStatus === 'absent_no_call',
  ).length;
  const shortCount = SITES.filter((s) => s.todayStatus === 'short_staffed').length;
  const flaggedCount = SITES.filter((s) => s.todayStatus === 'flagged').length;
  return { presentCount, shortCount, flaggedCount };
}

/** @derives(master-plan §G) */
export function TodayTab({ timeOfDay }: { timeOfDay: TimeOfDay }): React.ReactElement {
  const { presentCount, shortCount, flaggedCount } = computeStats();
  const totalWorkers = WORKERS.filter((w) => w.todayStatus !== 'off').length;

  const eyebrowSuffix =
    timeOfDay === '7am'
      ? 'MORNING ROUNDS'
      : timeOfDay === '11am'
        ? 'MID-MORNING'
        : timeOfDay === '3pm'
          ? 'AFTERNOON'
          : /* 11pm */ 'DAY WRAPPED';

  return (
    <>
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="sup-screen-header">
        <p className="sup-eyebrow">TUESDAY · MAY 1 · {eyebrowSuffix}</p>
        <h1 className="sup-h1">Today's plan</h1>
        <p style={{ margin: 0 }}>
          <span className="sup-bignum">
            <span className="sup-bignum-n">{SITES.length}</span>
            <span className="sup-bignum-label">sites</span>
          </span>
          {' · '}
          <span className="sup-bignum">
            <span className="sup-bignum-n">
              {WORKERS.filter((w) => w.todayStatus !== 'off').length}
            </span>
            <span className="sup-bignum-label">workers</span>
          </span>
        </p>
      </div>

      {/* ── Content ───────────────────────────────────────────────── */}
      <div className="sup-screen-content">
        {/* Stat strip */}
        <div className="sup-today-stats">
          <div className="sup-stat">
            <span className="sup-stat-num">
              {presentCount} / {totalWorkers}
            </span>
            <span className="sup-stat-label">Workers in</span>
          </div>
          <div className="sup-stat">
            <span className={`sup-stat-num${shortCount > 0 ? ' is-warn' : ''}`}>
              {shortCount} short
            </span>
            <span className="sup-stat-label">Sites short</span>
          </div>
          <div className="sup-stat">
            <span className={`sup-stat-num${flaggedCount > 0 ? ' is-danger' : ''}`}>
              {flaggedCount} flagged
            </span>
            <span className="sup-stat-label">Sites flagged</span>
          </div>
        </div>

        {/* AI draft action */}
        <button className="sup-secondary" type="button">
          Ask AI to draft today's plan
        </button>

        {/* Site cards */}
        {SITES.map((site) => {
          const mod = siteModifier(site.todayStatus);
          const label = statusLabel(site.todayStatus);
          const assigned = workersAtSite(site.id);

          return (
            <div key={site.id} className={`sup-site-card ${mod}`}>
              <div className="sup-site-head">
                <span className="sup-site-name">{site.name}</span>
                <span className={`sup-site-status ${mod}`}>{label.toUpperCase()}</span>
              </div>

              {site.quirk && <p className="sup-site-quirk">{site.quirk}</p>}

              <div className="sup-site-workers">
                {assigned.length > 0 ? (
                  assigned.map((worker) => {
                    const chipMod = chipModifier(worker.todayStatus);
                    return (
                      <span
                        key={worker.id}
                        className={`sup-worker-chip${chipMod ? ` ${chipMod}` : ''}`}
                      >
                        {worker.name.split(' ')[0]}
                      </span>
                    );
                  })
                ) : (
                  <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>Tap to assign workers</span>
                )}
              </div>
            </div>
          );
        })}

        {/* Long-press tip */}
        <div className="sup-card">
          <p className="sup-h2">Tip</p>
          <p>
            Long-press a worker chip to swap them. The AI will check today's plan and suggest where
            they fit best.
          </p>
        </div>

        {/* Day-wrapped footer — 11pm only */}
        {timeOfDay === '11pm' && (
          <div className="sup-card" style={{ borderColor: '#22c55e33', background: '#052e16' }}>
            <p>Day wrapped. 4 decisions applied. Tomorrow's draft ready in Summary.</p>
          </div>
        )}
      </div>
    </>
  );
}
