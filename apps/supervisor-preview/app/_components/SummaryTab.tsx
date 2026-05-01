/**
 * SummaryTab — "How's the day going?" single-answer summary for the supervisor preview.
 *
 * One sentence hero answer, drill-down sheet for decisions, tomorrow draft at end of day.
 * No metric grid. No decision list on landing. Less is more.
 *
 * @derives(master-plan §G)
 */
'use client';

import { useState } from 'react';

import { TODAYS_DECISIONS, SITES, type TimeOfDay, type Decision } from '../_lib/mock';

/** @derives(master-plan §G) */
function appliedCount(): number {
  return TODAYS_DECISIONS.filter((d) => d.status === 'applied').length;
}

/** @derives(master-plan §G) */
function payImpactFormatted(): string {
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
function followUpCount(): number {
  return SITES.filter((s) => s.todayStatus === 'flagged' || s.todayStatus === 'short_staffed')
    .length;
}

/** @derives(master-plan §G) */
function lastDecisionTime(): string {
  const last = TODAYS_DECISIONS[TODAYS_DECISIONS.length - 1];
  return last ? last.createdAt : '--:--';
}

/** @derives(master-plan §G) */
function heroAnswer(timeOfDay: TimeOfDay): string {
  switch (timeOfDay) {
    case '7am':
      return 'Quiet so far. 0 decisions today.';
    case '11am':
      return `${appliedCount()} decisions made. ${payImpactFormatted()} pay impact.`;
    case '3pm':
      return `${TODAYS_DECISIONS.length} decisions in. Phoenix complaint logged.`;
    case '11pm':
      return `Day wrapped. ${TODAYS_DECISIONS.length} decisions applied.`;
  }
}

/** @derives(master-plan §G) */
function heroDetail(timeOfDay: TimeOfDay): string {
  switch (timeOfDay) {
    case '7am':
      return 'Workers will start arriving by 6:30 AM. AI will parse their absences.';
    case '11am':
      return `Half the day done. ${followUpCount()} site needs follow-up.`;
    case '3pm':
      return "Vinod moved to Apollo this morning. Sarita's leave processed.";
    case '11pm':
      return 'Plan ready for tomorrow. Tap below to review.';
  }
}

/** @derives(master-plan §G) */
function tierModifierClass(tier: Decision['tier']): string {
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
function DecisionSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="sup-sheet">
      <div className="sup-sheet-header">
        <span className="sup-sheet-title">Today's decisions</span>
        <button className="sup-sheet-close" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="sup-decision-list">
        {TODAYS_DECISIONS.map((decision) => {
          const mod = tierModifierClass(decision.tier);
          return (
            <div key={decision.id} className="sup-decision-row">
              <div className="sup-decision-row-head">
                <span className={`sup-decision-row-tier${mod ? ` ${mod}` : ''}`}>
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
                    Pending HR confirm
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
    </div>
  );
}

/**
 * SummaryTab — single-answer "How's the day going?" screen.
 *
 * @derives(master-plan §G)
 */
export function SummaryTab({ timeOfDay }: { timeOfDay: TimeOfDay }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const isEndOfDay = timeOfDay === '11pm';
  const total = TODAYS_DECISIONS.length;

  return (
    <div className="sup-screen-content">
      {/* Hero */}
      <div className="sup-hero">
        <span className="sup-hero-eyebrow">Day summary · Tuesday</span>
        <p className="sup-hero-answer-sm">{heroAnswer(timeOfDay)}</p>
        <p className="sup-hero-detail">{heroDetail(timeOfDay)}</p>
      </div>

      {/* Drill-down row */}
      <button className="sup-drill" onClick={() => setSheetOpen(true)}>
        <span className="sup-drill-label">{total} decisions today</span>
        <span className="sup-drill-meta">Most recent {lastDecisionTime()}</span>
        <span className="sup-drill-chev">›</span>
      </button>

      {/* Decision sheet */}
      {sheetOpen && <DecisionSheet onClose={() => setSheetOpen(false)} />}

      {/* Tomorrow card — end of day only */}
      {isEndOfDay && (
        <div className="sup-tomorrow-section">
          <span className="sup-tomorrow-label">TOMORROW'S DRAFT</span>
          <p className="sup-tomorrow-text">
            Plan ready. Brigade 4, IT Park C 6, Apollo 5, Phoenix 3, Central School 2. One swap
            suggestion: Vinod back to Phoenix from Apollo.
          </p>
        </div>
      )}

      {/* Bottom action — end of day only */}
      {isEndOfDay && (
        <div className="sup-bottom-action">
          <button className="sup-primary">Send to HR for night review</button>
        </div>
      )}
    </div>
  );
}
