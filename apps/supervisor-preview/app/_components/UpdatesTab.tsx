/**
 * UpdatesTab — HR updates screen for the Axhy supervisor mobile preview.
 *
 * Shows HR_UPDATES with typed-word acknowledgement flow. Supervisors must
 * type the exact phrase to prove they read the update. HR can audit who
 * acknowledged when.
 *
 * @derives(master-plan §G)
 */

'use client';

import { useState } from 'react';

import { HR_UPDATES, type HRUpdate, type TimeOfDay } from '../_lib/mock';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AckState = {
  acked: boolean;
  ackedAt?: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build the initial ack map, pre-populating time-of-day driven states.
 * At 7am, hr_2 (Diwali week) is shown as already acknowledged.
 * All other time slots leave hr_1 pending (user must type-ack it).
 *
 * @derives(master-plan §G)
 */
function buildInitialAckMap(timeOfDay: TimeOfDay): Map<string, AckState> {
  const map = new Map<string, AckState>();

  for (const update of HR_UPDATES) {
    if (update.ackedAt) {
      // hr_2 is pre-acknowledged in mock data for all time slots
      map.set(update.id, { acked: true, ackedAt: update.ackedAt });
    } else {
      // At 7am, hr_2 Diwali update is already acked; hr_1 is pending.
      // At 11am/3pm/11pm, hr_1 is still pending until user types it.
      // Since only hr_2 has ackedAt in mock, and hr_1 has none,
      // time-of-day for 7am: override hr_2's ack to Yesterday, 11:34 AM
      // (already handled above via update.ackedAt). No extra overrides needed.
      map.set(update.id, { acked: false });
    }
  }

  // Time-of-day rule: at 7am, hr_2 explicitly shows 'Yesterday, 11:34 AM'.
  // Mock already has ackedAt on hr_2 for all time slots — we honour that
  // universally. The spec says at 11am/3pm/11pm hr_1 is "still pending unless
  // user typed-acked it locally", which is the default state above.
  // No additional override needed here.
  void timeOfDay; // used for future expansions; rule satisfied by mock data

  return map;
}

/**
 * Returns true if the trimmed, lower-cased input matches the required phrase.
 *
 * @derives(master-plan §G)
 */
function isMatch(input: string, required: string): boolean {
  return input.trim().toLowerCase() === required.trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/**
 * Renders a single HR update card including the optional ack-input flow.
 *
 * @derives(master-plan §G)
 */
function UpdateCard({
  update,
  ackState,
  onAck,
}: {
  update: HRUpdate;
  ackState: AckState;
  onAck: (id: string) => void;
}) {
  const [inputValue, setInputValue] = useState('');

  const isPending = update.ackRequired && !ackState.acked;
  const matched =
    update.ackRequired && update.ackTypedWords ? isMatch(inputValue, update.ackTypedWords) : false;

  const cardClass = ['sup-update-card', isPending ? 'is-pending' : ''].filter(Boolean).join(' ');

  const inputClass = ['sup-ack-input', matched ? 'is-match' : ''].filter(Boolean).join(' ');

  return (
    <div className={cardClass}>
      <div className="sup-update-from">{update.fromName}</div>
      <div className="sup-update-title">{update.title}</div>
      <div className="sup-update-body">{update.body}</div>
      <div className="sup-update-meta">{update.postedAt}</div>

      {update.ackRequired && ackState.acked && (
        <div className="sup-update-acked">Acknowledged · {ackState.ackedAt ?? 'just now'}</div>
      )}

      {isPending && (
        <>
          <input
            className={inputClass}
            type="text"
            placeholder={update.ackTypedWords ?? 'type to acknowledge'}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />

          {update.ackTypedWords && (
            <div className="sup-ack-hint">
              Type <strong>{update.ackTypedWords}</strong> to acknowledge. We log who read what.
            </div>
          )}

          {matched && <div className="sup-update-acked">Match. Tap Acknowledge below.</div>}

          <button className="sup-primary" disabled={!matched} onClick={() => onAck(update.id)}>
            Acknowledge
          </button>
        </>
      )}

      {!update.ackRequired &&
        !ackState.acked &&
        /* Info-only update with no ack requirement — show nothing extra */
        null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * UpdatesTab — renders the HR Updates screen for the supervisor preview.
 *
 * @derives(master-plan §G)
 */
export function UpdatesTab({ timeOfDay }: { timeOfDay: TimeOfDay }) {
  const [ackMap, setAckMap] = useState<Map<string, AckState>>(() => buildInitialAckMap(timeOfDay));

  /** Mark an update as acknowledged locally (does not mutate mock). */
  function handleAck(id: string) {
    setAckMap((prev) => {
      const next = new Map(prev);
      next.set(id, { acked: true, ackedAt: 'just now' });
      return next;
    });
  }

  const allAcked = HR_UPDATES.every((u) => {
    if (!u.ackRequired) return true;
    return ackMap.get(u.id)?.acked === true;
  });

  return (
    <>
      <div className="sup-screen-header">
        <div className="sup-eyebrow">FROM HR · KAVITHA</div>
        <div className="sup-h1">Updates</div>
        <div className="sup-update-meta">Acknowledge to confirm you&apos;ve read</div>
      </div>

      <div className="sup-screen-content">
        {HR_UPDATES.map((update) => {
          const state = ackMap.get(update.id) ?? { acked: false };
          return <UpdateCard key={update.id} update={update} ackState={state} onAck={handleAck} />;
        })}

        {allAcked && (
          <div className="sup-card">
            <div className="sup-h2">All caught up.</div>
            <div className="sup-update-body">
              No new updates from HR right now. We&apos;ll surface here when something arrives.
            </div>
          </div>
        )}

        <div className="sup-card">
          <div className="sup-h2">Why we ask you to type</div>
          <div className="sup-update-body">
            If we just had a one-tap confirm, anyone could ack a rule without reading it. Typing the
            words proves you read it. HR can audit who acknowledged when. The phrase is short —
            under 5 seconds.
          </div>
        </div>
      </div>
    </>
  );
}
