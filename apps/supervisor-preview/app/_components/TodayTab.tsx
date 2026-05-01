/**
 * TodayTab — answers ONE question: "Anything I need to handle today?"
 * Hero number (present/total), absences in plain language, site status tag,
 * drill-down to site cards, single AI action button.
 *
 * @derives(master-plan §G)
 */

'use client';

import { useState } from 'react';

import { SITES, WORKERS, type TimeOfDay, type Site, type Worker } from '../_lib/mock';

/** Map todayStatus to pill label. @derives(master-plan §G) */
const LABEL: Record<Site['todayStatus'], string> = {
  covered: 'Covered',
  short_staffed: 'Short',
  flagged: 'Flagged',
  pending: 'Pending',
};
function statusLabel(s: Site['todayStatus']): string {
  return LABEL[s];
}

/** CSS modifier for site card / pill. @derives(master-plan §G) */
const MOD: Record<Site['todayStatus'], string> = {
  flagged: 'is-flagged',
  short_staffed: 'is-short',
  covered: 'is-covered',
  pending: 'is-pending',
};
function siteModifier(s: Site['todayStatus']): string {
  return MOD[s];
}

/** CSS modifier for worker chip. @derives(master-plan §G) */
function chipModifier(status: Worker['todayStatus']): string {
  if (status === 'absent_no_call') return 'is-absent';
  if (status === 'absent_notified') return 'is-absent-noted';
  return '';
}

/** Workers at a given site. @derives(master-plan §G) */
function workersAtSite(siteId: string): Worker[] {
  return WORKERS.filter((w) => w.assignedSite === siteId);
}

/**
 * Compute hero stats from mock data.
 * present = status 'present' only (absent/off do not count as present).
 * total   = all workers not 'off'.
 * @derives(master-plan §G)
 */
function computeHero(): {
  presentCount: number;
  totalCount: number;
  absenceDetail: string;
  flaggedCount: number;
  shortCount: number;
} {
  const presentCount = WORKERS.filter((w) => w.todayStatus === 'present').length;
  const totalCount = WORKERS.filter((w) => w.todayStatus !== 'off').length;

  const onLeave = WORKERS.filter((w) => w.todayStatus === 'absent_notified').map(
    (w) => `${w.name} on leave`,
  );
  const noCall = WORKERS.filter((w) => w.todayStatus === 'absent_no_call').map(
    (w) => `${w.name} no-call`,
  );
  const allParts = [...onLeave, ...noCall];

  let absenceDetail = '';
  if (allParts.length === 0) {
    absenceDetail = 'All workers accounted for';
  } else {
    const joined = allParts.join(' · ');
    if (joined.length <= 60) {
      absenceDetail = joined;
    } else {
      // keep fitting items, append "+N more"
      let running = '';
      let shown = 0;
      for (const part of allParts) {
        const candidate = running ? `${running} · ${part}` : part;
        const withMore = `${candidate} +${allParts.length - shown - 1} more`;
        if (withMore.length > 60 && running) break;
        running = candidate;
        shown++;
      }
      const remaining = allParts.length - shown;
      absenceDetail = remaining > 0 ? `${running} +${remaining} more` : running;
    }
  }

  const flaggedCount = SITES.filter((s) => s.todayStatus === 'flagged').length;
  const shortCount = SITES.filter((s) => s.todayStatus === 'short_staffed').length;

  return { presentCount, totalCount, absenceDetail, flaggedCount, shortCount };
}

/** Time-of-day suffix for the drill-down meta. @derives(master-plan §G) */
function drillMeta(timeOfDay: TimeOfDay): string {
  switch (timeOfDay) {
    case '7am':
      return 'Plan ready';
    case '11am':
      return 'Mid-morning';
    case '3pm':
      return 'Afternoon';
    case '11pm':
      return 'Day done';
  }
}

/** @derives(master-plan §G) */
export function TodayTab({ timeOfDay }: { timeOfDay: TimeOfDay }): React.ReactElement {
  const [sheetOpen, setSheetOpen] = useState(false);

  const { presentCount, totalCount, absenceDetail, flaggedCount, shortCount } = computeHero();

  const statusDotMod = flaggedCount > 0 ? 'is-danger' : shortCount > 0 ? 'is-warn' : 'is-clear';

  const statusText =
    flaggedCount > 0
      ? `${flaggedCount} site${flaggedCount > 1 ? 's' : ''} flagged`
      : shortCount > 0
        ? `${shortCount} site${shortCount > 1 ? 's' : ''} short-staffed`
        : 'all clear';

  return (
    <>
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div className="sup-hero">
        <p className="sup-hero-eyebrow">Today · May 1</p>

        <p className="sup-hero-answer">
          {presentCount}/{totalCount}
        </p>

        <p className="sup-hero-detail">{absenceDetail}</p>

        {/* Status tag */}
        <p className="sup-hero-tag">
          <span className={`sup-dot ${statusDotMod}`} />
          {statusText}
        </p>
      </div>

      {/* ── Drill-down ────────────────────────────────────────────────── */}
      <button type="button" className="sup-drill" onClick={() => setSheetOpen(true)}>
        <span className="sup-drill-label">{SITES.length} sites — see today&apos;s plan</span>
        <span className="sup-drill-meta">{drillMeta(timeOfDay)} ›</span>
      </button>

      {/* ── Bottom action ─────────────────────────────────────────────── */}
      <div className="sup-bottom-action">
        <button type="button" className="sup-primary">
          Talk to AI
        </button>
      </div>

      {/* ── Slide-up sheet ────────────────────────────────────────────── */}
      {sheetOpen && (
        <div className="sup-sheet">
          <div className="sup-sheet-head">
            <button type="button" className="sup-back" onClick={() => setSheetOpen(false)}>
              ‹ Back
            </button>
            <span className="sup-sheet-title">Today&apos;s plan</span>
          </div>

          {SITES.map((site) => {
            const mod = siteModifier(site.todayStatus);
            const assigned = workersAtSite(site.id);
            return (
              <div key={site.id} className={`sup-site-card ${mod}`}>
                <div className="sup-site-head">
                  <span className="sup-site-name">{site.name}</span>
                  <span className={`sup-site-status ${mod}`}>{statusLabel(site.todayStatus)}</span>
                </div>
                {site.quirk && <p className="sup-site-quirk">{site.quirk}</p>}
                <div className="sup-site-workers">
                  {assigned.length > 0 ? (
                    assigned.map((w) => (
                      <span
                        key={w.id}
                        className={`sup-worker-chip${chipModifier(w.todayStatus) ? ` ${chipModifier(w.todayStatus)}` : ''}`}
                      >
                        {w.name.split(' ')[0]}
                      </span>
                    ))
                  ) : (
                    <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>No workers assigned</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
