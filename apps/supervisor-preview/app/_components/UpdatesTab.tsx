/**
 * UpdatesTab — "Anything from HR?" One pending update prominent, or all-caught-up.
 * Past updates hidden in drill-down sheet. Typed-ack proves read.
 * @derives(master-plan §G)
 */

'use client';

import { useState } from 'react';

import { HR_UPDATES, type HRUpdate, type TimeOfDay } from '../_lib/mock';

type AckState = { acked: boolean; ackedAt?: string };

/**
 * Initial ack map from mock. At 7am hr_2 (Diwali) is pre-acked via mock.ackedAt.
 * hr_1 is pending at all time slots until user types it this session.
 * @derives(master-plan §G)
 */
function buildInitialAckMap(timeOfDay: TimeOfDay): Map<string, AckState> {
  void timeOfDay;
  const map = new Map<string, AckState>();
  for (const u of HR_UPDATES) {
    map.set(u.id, u.ackedAt ? { acked: true, ackedAt: u.ackedAt } : { acked: false });
  }
  return map;
}

/** Case-insensitive trimmed match for ack phrases. @derives(master-plan §G) */
function isMatch(input: string, required: string): boolean {
  return input.trim().toLowerCase() === required.trim().toLowerCase();
}

/** First update that requires ack and is not yet acked. @derives(master-plan §G) */
function getPendingUpdate(ackMap: Map<string, AckState>): HRUpdate | null {
  return HR_UPDATES.find((u) => u.ackRequired && !ackMap.get(u.id)?.acked) ?? null;
}

/** Read-only sheet of all past updates. @derives(master-plan §G) */
function PastSheet({ ackMap, onClose }: { ackMap: Map<string, AckState>; onClose: () => void }) {
  return (
    <div className="sup-sheet">
      <div className="sup-sheet-head">
        <button className="sup-back" onClick={onClose}>
          ‹ Back
        </button>
        <div className="sup-sheet-title">Past updates</div>
      </div>
      <div className="sup-sheet-body">
        {HR_UPDATES.map((u) => {
          const state = ackMap.get(u.id) ?? { acked: false };
          const cls = ['sup-update-card', u.ackRequired && !state.acked ? 'is-pending' : '']
            .filter(Boolean)
            .join(' ');
          return (
            <div key={u.id} className={cls}>
              <div className="sup-update-from">{u.fromName.toUpperCase()}</div>
              <div className="sup-update-title">{u.title}</div>
              <div className="sup-update-body">{u.body}</div>
              <div className="sup-update-meta">{u.postedAt}</div>
              {state.acked && (
                <div className="sup-update-acked">Acknowledged · {state.ackedAt ?? 'just now'}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Pending update card with typed-ack input flow. @derives(master-plan §G) */
function PendingCard({ update, onAck }: { update: HRUpdate; onAck: (id: string) => void }) {
  const [inputValue, setInputValue] = useState('');
  const matched = update.ackTypedWords != null && isMatch(inputValue, update.ackTypedWords);
  const inputCls = ['sup-ack-input', matched ? 'is-match' : ''].filter(Boolean).join(' ');

  return (
    <div className="sup-update-card is-pending">
      <div className="sup-update-from">{update.fromName.toUpperCase()}</div>
      <div className="sup-update-title">{update.title}</div>
      <div className="sup-update-body">{update.body}</div>
      <div className="sup-update-meta">{update.postedAt}</div>
      <input
        className={inputCls}
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
          Type <strong>{update.ackTypedWords}</strong> to acknowledge.
        </div>
      )}
      <button className="sup-primary" disabled={!matched} onClick={() => onAck(update.id)}>
        Acknowledge
      </button>
    </div>
  );
}

/**
 * UpdatesTab — named export taking { timeOfDay }.
 * @derives(master-plan §G)
 */
export function UpdatesTab({ timeOfDay }: { timeOfDay: TimeOfDay }) {
  const [ackMap, setAckMap] = useState<Map<string, AckState>>(() => buildInitialAckMap(timeOfDay));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [justAcked, setJustAcked] = useState(false);

  /** @derives(master-plan §G) */
  function handleAck(id: string) {
    setAckMap((prev) => new Map(prev).set(id, { acked: true, ackedAt: 'just now' }));
    setJustAcked(true);
    setTimeout(() => setJustAcked(false), 2000);
  }

  const pendingUpdate = getPendingUpdate(ackMap);
  const hasPending = pendingUpdate !== null;

  if (sheetOpen) {
    return <PastSheet ackMap={ackMap} onClose={() => setSheetOpen(false)} />;
  }

  return (
    <>
      {justAcked && (
        <div className="sup-update-acked" style={{ textAlign: 'center', padding: '8px 16px' }}>
          Acknowledged · just now
        </div>
      )}

      <div className="sup-screen-header">
        <div className="sup-hero">
          <div className="sup-hero-eyebrow">From Kavitha · HR</div>
          <div className="sup-hero-answer-sm">
            {hasPending ? '1 update needs your read' : 'All caught up'}
          </div>
          <div className="sup-hero-detail">
            {hasPending
              ? 'Tap the card below to read and acknowledge.'
              : "We'll show new updates here when HR sends them."}
          </div>
        </div>
      </div>

      <div className="sup-screen-content">
        {hasPending && !justAcked && <PendingCard update={pendingUpdate} onAck={handleAck} />}

        {!hasPending && (
          <div className="sup-clear">
            <div className="sup-clear-mark">
              <svg
                viewBox="0 0 24 24"
                width="32"
                height="32"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12.5l4.5 4.5L19 7" />
              </svg>
            </div>
            <div className="sup-clear-title">All caught up</div>
            <div className="sup-clear-sub">
              No pending HR updates. Past updates available below.
            </div>
          </div>
        )}

        {hasPending && (
          <div className="sup-card">
            <div className="sup-h2">Why type the words?</div>
            <div className="sup-update-body">
              Tapping is too easy to do by accident. Typing proves you read it. HR can audit who
              confirmed what.
            </div>
          </div>
        )}

        <div className="sup-drill" onClick={() => setSheetOpen(true)}>
          <div className="sup-drill-label">Past updates</div>
          <div className="sup-drill-meta">{HR_UPDATES.length} archived</div>
          <div className="sup-drill-chev">&#8250;</div>
        </div>
      </div>
    </>
  );
}
