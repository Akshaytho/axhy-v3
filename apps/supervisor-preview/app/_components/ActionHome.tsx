/**
 * ActionHome — supervisor preview action-first home (panel-2026-05-06 round 3).
 *
 * Single home screen, stacked big-action buttons, giant voice mic, settings
 * gear. No tabs. Field-tool, not dashboard. Each action opens a focused sheet.
 *
 * @derives(master-plan §G)
 */

'use client';

import { useState } from 'react';

import { HR_UPDATES, SITES, SUPERVISOR, WORKERS, type TimeOfDay } from '../_lib/mock';

import { ActionSheet, type ActionKind } from './ActionSheets';
import { SettingsSheet } from './SettingsSheet';
import { VoiceMic } from './VoiceMic';

/** @derives(master-plan §G) */
export function ActionHome({ timeOfDay }: { timeOfDay: TimeOfDay }) {
  const [openSheet, setOpenSheet] = useState<ActionKind | 'settings' | null>(null);

  const pulse = makePulse(timeOfDay);

  return (
    <div className="sup-home">
      <div className="sup-home-top">
        <div className="sup-home-greet">
          <span className="sup-home-greet-name">{`Hi, ${SUPERVISOR.name}`}</span>
          <span className="sup-home-greet-meta">{topMeta(timeOfDay)}</span>
        </div>
        <button
          type="button"
          className="sup-home-gear"
          aria-label="Settings"
          onClick={() => setOpenSheet('settings')}
        >
          <GearIcon />
        </button>
      </div>

      {pulse && (
        <div className={pulse.tone === 'clear' ? 'sup-pulse is-clear' : 'sup-pulse'}>
          <div className="sup-pulse-line">{pulse.line}</div>
          {pulse.detail && <div className="sup-pulse-detail">{pulse.detail}</div>}
          {pulse.action && (
            <div className="sup-pulse-prompt">
              <button
                type="button"
                className="is-primary"
                onClick={() => setOpenSheet(pulse.action!.actionKind)}
              >
                {pulse.action.confirmLabel}
              </button>
              {pulse.action.cancelLabel && (
                <button type="button" className="is-secondary">
                  {pulse.action.cancelLabel}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="sup-actions">
        <ActionButton
          label="Mark worker absent"
          meta={absentCountMeta()}
          onClick={() => setOpenSheet('absent')}
        />
        <ActionButton
          label="Approve leave"
          meta={pendingLeaveMeta()}
          onClick={() => setOpenSheet('leave')}
        />
        <ActionButton
          label="Log site complaint"
          meta={flaggedSiteMeta()}
          onClick={() => setOpenSheet('complaint')}
        />
        <ActionButton
          label="Swap worker between sites"
          meta="any time"
          onClick={() => setOpenSheet('swap')}
        />
        <ActionButton
          label="Mark visit done"
          meta="with photo"
          onClick={() => setOpenSheet('visit_done')}
        />
        {pendingHrCount() > 0 && (
          <ActionButton
            label={`HR update needs your read`}
            meta={`${pendingHrCount()} pending`}
            primary
            onClick={() => setOpenSheet('hr_ack')}
          />
        )}
      </div>

      <div className="sup-mic-zone">
        <VoiceMic
          onResult={(_) => {
            /* In the prototype, the mic just shows the heard transcript and
               proposes an extracted action — no real Claude call. The
               component handles its own UI overlay. */
          }}
        />
        <span className="sup-mic-hint">Hold to speak · let go to send</span>
      </div>

      {openSheet === 'settings' && <SettingsSheet onClose={() => setOpenSheet(null)} />}
      {openSheet && openSheet !== 'settings' && (
        <ActionSheet kind={openSheet as ActionKind} onClose={() => setOpenSheet(null)} />
      )}
    </div>
  );
}

/** @derives(master-plan §G) */
function ActionButton({
  label,
  meta,
  primary,
  onClick,
}: {
  label: string;
  meta?: string;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={primary ? 'sup-action is-primary' : 'sup-action'}
      onClick={onClick}
    >
      <span>{label}</span>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
        {meta && <span className="sup-action-meta">{meta}</span>}
        <span className="sup-action-arrow">›</span>
      </span>
    </button>
  );
}

/** @derives(master-plan §G) */
function GearIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/* ── helpers (data-driven, no hardcoded counts) ─── */

function topMeta(t: TimeOfDay): string {
  const day = '· Tuesday May 1';
  if (t === '7am') return `Day starts now ${day}`;
  if (t === '11am') return `Mid-morning ${day}`;
  if (t === '3pm') return `Afternoon ${day}`;
  return `Day done ${day}`;
}

type Pulse = {
  tone: 'warn' | 'clear';
  line: string;
  detail?: string;
  action?: { actionKind: ActionKind; confirmLabel: string; cancelLabel?: string };
};

function makePulse(t: TimeOfDay): Pulse | null {
  const noCall = WORKERS.find((w) => w.todayStatus === 'absent_no_call');
  if (t === '7am') {
    return {
      tone: 'warn',
      line: 'Day not started yet.',
      detail: 'Workers will arrive between 6:30 and 7:30. Mark anyone who skips.',
    };
  }
  if (t === '11am' && noCall) {
    return {
      tone: 'warn',
      line: `${noCall.name} did not call in.`,
      detail: 'They were assigned to IT Park C this morning. Want to mark them absent now?',
      action: {
        actionKind: 'absent',
        confirmLabel: `Mark ${noCall.name} absent`,
        cancelLabel: 'Call first',
      },
    };
  }
  if (t === '3pm') {
    return {
      tone: 'warn',
      line: 'Phoenix Block C complaint is open.',
      detail: 'Logged 08:14. Building manager Mr. Rao expects a response by 5 PM.',
      action: { actionKind: 'complaint', confirmLabel: 'Update complaint' },
    };
  }
  if (t === '11pm') {
    return { tone: 'clear', line: "Day wrapped. Tomorrow's plan is ready." };
  }
  return null;
}

function absentCountMeta(): string {
  const absent = WORKERS.filter(
    (w) => w.todayStatus === 'absent_notified' || w.todayStatus === 'absent_no_call',
  ).length;
  if (!absent) return 'all in';
  return `${absent} today`;
}

function pendingLeaveMeta(): string {
  return '0 pending';
}

function flaggedSiteMeta(): string {
  const flagged = SITES.filter((s) => s.todayStatus === 'flagged').length;
  if (!flagged) return 'none';
  return `${flagged} site`;
}

function pendingHrCount(): number {
  return HR_UPDATES.filter((u) => u.ackRequired && !u.ackedAt).length;
}
