/**
 * SummaryTab — day-level summary view for the supervisor preview prototype.
 *
 * Shows hero headline, 4 metrics, today's decision log, and tomorrow's AI draft preview.
 *
 * @derives(master-plan §G)
 */
'use client';

import { TODAYS_DECISIONS, SITES, WORKERS, type TimeOfDay, type Decision } from '../_lib/mock';

/** @derives(master-plan §G) */
function heroLine(timeOfDay: TimeOfDay): string {
  switch (timeOfDay) {
    case '7am':
      return 'Quiet so far. 0 decisions today.';
    case '11am':
      return '3 decisions made. 1 site flagged.';
    case '3pm':
      return '4 decisions in. Phoenix complaint logged.';
    case '11pm':
      return "Day wrapped. 4 decisions applied to your team's records.";
  }
}

/** @derives(master-plan §G) */
function heroSub(timeOfDay: TimeOfDay): string {
  switch (timeOfDay) {
    case '7am':
      return 'Morning is just starting. Check in after the first round.';
    case '11am':
      return 'Half the day done. Phoenix still needs a follow-up.';
    case '3pm':
      return 'Afternoon check. Mukesh flagged for HR, plan ready at night.';
    case '11pm':
      return 'All applied. HR copy sent. Tomorrow draft is ready.';
  }
}

/** @derives(master-plan §G) */
function tomorrowText(timeOfDay: TimeOfDay): string {
  switch (timeOfDay) {
    case '7am':
    case '11am':
      return "AI will draft tomorrow's plan after midnight. Wrap up today's chats to feed it.";
    case '3pm':
      return 'AI sees: Sarita on leave (already approved), Mukesh follow-up pending. Draft will be ready 11:30 PM.';
    case '11pm':
      return 'Plan ready. Worker counts: Brigade 4, IT Park C 6 (with Anil leading), Apollo A 5, Phoenix 3, Central School 2. One swap suggestion: Vinod back to Phoenix from Apollo (after morning rounds).';
  }
}

/** @derives(master-plan §G) */
function tierModifier(tier: Decision['tier']): string {
  if (tier === 'EMPLOYMENT') return 'is-employment';
  if (tier === 'PERSONNEL') return 'is-personnel';
  return '';
}

/** @derives(master-plan §G) */
function tierLabel(tier: Decision['tier']): string {
  switch (tier) {
    case 'EMPLOYMENT':
      return 'Employment';
    case 'PERSONNEL':
      return 'Personnel';
    case 'OPERATIONAL':
      return 'Operational';
    case 'NOTE':
      return 'Note';
  }
}

/** @derives(master-plan §G) */
function payImpact(): string {
  // Sum ₹ amounts from consequence strings across all decisions.
  // Currently dec_3 carries "₹500".
  let total = 0;
  for (const d of TODAYS_DECISIONS) {
    if (!d.consequence) continue;
    const match = d.consequence.match(/₹(\d+(?:,\d+)*)/);
    if (match && match[1]) {
      total += parseInt(match[1].replace(/,/g, ''), 10);
    }
  }
  return `₹${total.toLocaleString('en-IN')}`;
}

/** @derives(master-plan §G) */
function workerPresence(): string {
  const present = WORKERS.filter((w) => w.todayStatus === 'present').length;
  return `${present} / ${WORKERS.length}`;
}

/** @derives(master-plan §G) */
function sitesNeedingFollowUp(): number {
  return SITES.filter((s) => s.todayStatus === 'flagged' || s.todayStatus === 'short_staffed')
    .length;
}

/**
 * SummaryTab renders the day-level summary screen for the supervisor preview.
 *
 * @derives(master-plan §G)
 */
export function SummaryTab({ timeOfDay }: { timeOfDay: TimeOfDay }) {
  const decisionCount = TODAYS_DECISIONS.length;
  const followUpCount = sitesNeedingFollowUp();
  const isEndOfDay = timeOfDay === '11pm';

  return (
    <div className="sup-screen-content">
      {/* Hero */}
      <div className="sup-summary-hero">
        <span className="sup-eyebrow">DAY SUMMARY · TUESDAY</span>
        <p className="sup-summary-bigline">{heroLine(timeOfDay)}</p>
        <p className="sup-summary-sub">{heroSub(timeOfDay)}</p>
      </div>

      {/* Metrics grid */}
      <div className="sup-metrics">
        <div className="sup-metric">
          <span className="sup-metric-num">{payImpact()}</span>
          <span className="sup-metric-label">Pay impact today</span>
        </div>
        <div className="sup-metric">
          <span className="sup-metric-num">{workerPresence()}</span>
          <span className="sup-metric-label">Worker presence</span>
        </div>
        <div className="sup-metric">
          <span className="sup-metric-num">{decisionCount}</span>
          <span className="sup-metric-label">Decisions logged</span>
        </div>
        <div className="sup-metric">
          <span className="sup-metric-num">{followUpCount}</span>
          <span className="sup-metric-label">Sites needing follow-up</span>
        </div>
      </div>

      {/* Decision list */}
      <h2 className="sup-h2">Today's decisions</h2>
      <div className="sup-decision-list">
        {TODAYS_DECISIONS.map((decision) => {
          const modifier = tierModifier(decision.tier);
          return (
            <div key={decision.id} className="sup-decision-row">
              <div className="sup-decision-row-head">
                <span className={`sup-decision-row-tier${modifier ? ` ${modifier}` : ''}`}>
                  {tierLabel(decision.tier)}
                </span>
                <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', opacity: 0.6 }}>
                  {decision.createdAt}
                </span>
              </div>
              <p className="sup-decision-row-summary">
                {decision.summary}
                {decision.status === 'pending' && (
                  <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', opacity: 0.7 }}>
                    · Pending HR confirm
                  </span>
                )}
              </p>
              {decision.consequence && (
                <p className="sup-decision-row-cons">{decision.consequence}</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Tomorrow preview */}
      <div className="sup-tomorrow-section">
        <span className="sup-tomorrow-label">TOMORROW'S DRAFT</span>
        <p className="sup-tomorrow-text">{tomorrowText(timeOfDay)}</p>
      </div>

      {/* HR action button */}
      <button
        className="sup-primary"
        disabled={!isEndOfDay}
        onClick={isEndOfDay ? () => undefined : undefined}
        style={{ marginTop: '1rem', width: '100%' }}
      >
        Send to HR for night review
      </button>
    </div>
  );
}
