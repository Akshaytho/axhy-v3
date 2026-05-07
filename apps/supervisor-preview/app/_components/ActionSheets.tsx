/**
 * ActionSheets — focused single-task sheets that open from ActionHome.
 *
 * Each sheet is a 2-tap flow:
 *   1. Pick the target (worker / site / etc) from a list
 *   2. Confirm with a consequence summary
 *   3. Show "done" feedback for 1.5s, auto-close
 *
 * No forms. No tabs. One verb per sheet. Field-tool simple.
 *
 * @derives(master-plan §G)
 */

'use client';

import { useEffect, useState } from 'react';

import { HR_UPDATES, SITES, WORKERS, type Site, type Worker } from '../_lib/mock';

/** @derives(master-plan §G) */
export type ActionKind = 'absent' | 'leave' | 'complaint' | 'swap' | 'visit_done' | 'hr_ack';

const TITLES: Record<ActionKind, { question: string; donePrefix: string }> = {
  absent: { question: 'Who did not show up?', donePrefix: 'Marked absent' },
  leave: { question: 'Whose leave to approve?', donePrefix: 'Leave approved' },
  complaint: { question: 'Which site has the complaint?', donePrefix: 'Complaint logged' },
  swap: { question: 'Which worker to swap?', donePrefix: 'Worker moved' },
  visit_done: { question: 'Which site is done?', donePrefix: 'Visit marked done' },
  hr_ack: { question: 'Read and acknowledge', donePrefix: 'Acknowledged' },
};

/** @derives(master-plan §G) */
export function ActionSheet({ kind, onClose }: { kind: ActionKind; onClose: () => void }) {
  const [step, setStep] = useState<'pick' | 'confirm' | 'done'>('pick');
  const [pickedWorkerId, setPickedWorkerId] = useState<string | null>(null);
  const [pickedSiteId, setPickedSiteId] = useState<string | null>(null);
  const [destSiteId, setDestSiteId] = useState<string | null>(null);
  const [doneText, setDoneText] = useState<string>('');

  useEffect(() => {
    if (step !== 'done') return;
    const t = setTimeout(() => onClose(), 1500);
    return () => clearTimeout(t);
  }, [step, onClose]);

  const t = TITLES[kind];

  return (
    <div className="sup-sheet">
      <div className="sup-sheet-head">
        <button type="button" className="sup-back" onClick={onClose} aria-label="Close">
          ‹
        </button>
        <span className="sup-sheet-title">{t.question}</span>
      </div>

      <div className="sup-sheet-body">
        {step === 'pick' && (
          <PickStep
            kind={kind}
            pickedWorkerId={pickedWorkerId}
            pickedSiteId={pickedSiteId}
            destSiteId={destSiteId}
            onPickWorker={setPickedWorkerId}
            onPickSite={setPickedSiteId}
            onPickDestSite={setDestSiteId}
            onAdvance={() => setStep('confirm')}
          />
        )}
        {step === 'confirm' && (
          <ConfirmStep
            kind={kind}
            workerId={pickedWorkerId}
            siteId={pickedSiteId}
            destSiteId={destSiteId}
            onBack={() => setStep('pick')}
            onConfirm={(label) => {
              setDoneText(label);
              setStep('done');
            }}
          />
        )}
        {step === 'done' && (
          <div className="sup-done">
            <div className="sup-done-mark">
              <CheckIcon />
            </div>
            <div className="sup-done-title">{t.donePrefix}</div>
            <div className="sup-done-detail">{doneText}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/** @derives(master-plan §G) */
function PickStep({
  kind,
  pickedWorkerId,
  pickedSiteId,
  destSiteId,
  onPickWorker,
  onPickSite,
  onPickDestSite,
  onAdvance,
}: {
  kind: ActionKind;
  pickedWorkerId: string | null;
  pickedSiteId: string | null;
  destSiteId: string | null;
  onPickWorker: (id: string) => void;
  onPickSite: (id: string) => void;
  onPickDestSite: (id: string) => void;
  onAdvance: () => void;
}) {
  if (kind === 'absent') {
    const candidates = WORKERS.filter((w) => w.todayStatus !== 'off');
    return (
      <PickListWorkers
        workers={candidates}
        pickedId={pickedWorkerId}
        onPick={(id) => {
          onPickWorker(id);
          onAdvance();
        }}
      />
    );
  }

  if (kind === 'leave') {
    return (
      <div style={{ paddingTop: 24, color: 'var(--text-dim)', textAlign: 'center' }}>
        No pending leave requests right now.
        <br />
        <span style={{ fontSize: 13 }}>Sarita&apos;s leave was approved at 06:45.</span>
      </div>
    );
  }

  if (kind === 'complaint') {
    return (
      <PickListSites
        sites={SITES}
        pickedId={pickedSiteId}
        onPick={(id) => {
          onPickSite(id);
          onAdvance();
        }}
      />
    );
  }

  if (kind === 'swap') {
    if (!pickedWorkerId) {
      const candidates = WORKERS.filter((w) => w.todayStatus === 'present');
      return (
        <>
          <div style={{ color: 'var(--text-mute)', fontSize: 12, fontFamily: 'var(--mono)' }}>
            STEP 1 OF 2
          </div>
          <PickListWorkers workers={candidates} pickedId={null} onPick={(id) => onPickWorker(id)} />
        </>
      );
    }
    return (
      <>
        <div style={{ color: 'var(--text-mute)', fontSize: 12, fontFamily: 'var(--mono)' }}>
          STEP 2 OF 2 · Where to send?
        </div>
        <PickListSites
          sites={SITES}
          pickedId={destSiteId}
          onPick={(id) => {
            onPickDestSite(id);
            onAdvance();
          }}
        />
      </>
    );
  }

  if (kind === 'visit_done') {
    return (
      <PickListSites
        sites={SITES}
        pickedId={pickedSiteId}
        onPick={(id) => {
          onPickSite(id);
          onAdvance();
        }}
      />
    );
  }

  if (kind === 'hr_ack') {
    const u = HR_UPDATES.find((h) => h.ackRequired && !h.ackedAt);
    if (!u) {
      return (
        <div style={{ paddingTop: 24, color: 'var(--text-dim)', textAlign: 'center' }}>
          All caught up.
        </div>
      );
    }
    return (
      <div className="sup-update-card is-pending">
        <div className="sup-update-from">{u.fromName}</div>
        <div className="sup-update-title">{u.title}</div>
        <div className="sup-update-body">{u.body}</div>
        <div className="sup-update-meta">{u.postedAt}</div>
        <button type="button" className="sup-primary" style={{ marginTop: 8 }} onClick={onAdvance}>
          Read &amp; acknowledge
        </button>
      </div>
    );
  }

  return null;
}

/** @derives(master-plan §G) */
function PickListWorkers({
  workers,
  pickedId,
  onPick,
}: {
  workers: Worker[];
  pickedId: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <>
      {workers.map((w) => {
        const cls = pickedId === w.id ? 'sup-pick-row is-selected' : 'sup-pick-row';
        const status = workerStatusLabel(w);
        return (
          <button key={w.id} type="button" className={cls} onClick={() => onPick(w.id)}>
            <span
              style={{
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 2,
              }}
            >
              <span>{w.name}</span>
              {w.assignedSite && (
                <span className="sup-pick-row-meta">
                  {SITES.find((s) => s.id === w.assignedSite)?.shortName ?? '—'}
                </span>
              )}
            </span>
            {status && (
              <span className={`sup-pick-row-status ${status.modifier}`}>{status.text}</span>
            )}
          </button>
        );
      })}
    </>
  );
}

/** @derives(master-plan §G) */
function PickListSites({
  sites,
  pickedId,
  onPick,
}: {
  sites: Site[];
  pickedId: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <>
      {sites.map((s) => {
        const cls = pickedId === s.id ? 'sup-pick-row is-selected' : 'sup-pick-row';
        const status = siteStatusLabel(s);
        return (
          <button key={s.id} type="button" className={cls} onClick={() => onPick(s.id)}>
            <span
              style={{
                display: 'inline-flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: 2,
              }}
            >
              <span>{s.shortName}</span>
              <span className="sup-pick-row-meta">{s.workersAssigned} workers</span>
            </span>
            <span className={`sup-pick-row-status ${status.modifier}`}>{status.text}</span>
          </button>
        );
      })}
    </>
  );
}

/** @derives(master-plan §G) */
function ConfirmStep({
  kind,
  workerId,
  siteId,
  destSiteId,
  onBack,
  onConfirm,
}: {
  kind: ActionKind;
  workerId: string | null;
  siteId: string | null;
  destSiteId: string | null;
  onBack: () => void;
  onConfirm: (doneText: string) => void;
}) {
  const w = workerId ? WORKERS.find((x) => x.id === workerId) : null;
  const s = siteId ? SITES.find((x) => x.id === siteId) : null;
  const dest = destSiteId ? SITES.find((x) => x.id === destSiteId) : null;

  const summary = makeSummary(kind, w, s, dest);

  return (
    <div className="sup-confirm">
      <div className="sup-confirm-line">{summary.line}</div>
      <div className="sup-confirm-cons">{summary.cons}</div>
      <div className="sup-confirm-actions">
        <button type="button" className="is-back" onClick={onBack}>
          Back
        </button>
        <button type="button" className="is-go" onClick={() => onConfirm(summary.line)}>
          {summary.cta}
        </button>
      </div>
    </div>
  );
}

function makeSummary(
  kind: ActionKind,
  w: Worker | null | undefined,
  s: Site | null | undefined,
  dest: Site | null | undefined,
): { line: string; cons: string; cta: string } {
  if (kind === 'absent' && w) {
    return {
      line: `Mark ${w.name} absent today`,
      cons: 'HR will be notified. Pay drops ₹500 for the day.',
      cta: 'Mark absent',
    };
  }
  if (kind === 'leave' && w) {
    return {
      line: `Approve ${w.name}'s leave`,
      cons: 'Pay drops ₹500 for the day. HR auto-notified.',
      cta: 'Approve',
    };
  }
  if (kind === 'complaint' && s) {
    return {
      line: `Log complaint at ${s.shortName}`,
      cons: 'AI will draft a follow-up note. You can refine it before sending.',
      cta: 'Log complaint',
    };
  }
  if (kind === 'swap' && w && dest) {
    const from = w.assignedSite
      ? SITES.find((x) => x.id === w.assignedSite)?.shortName
      : 'unassigned';
    return {
      line: `Move ${w.name}: ${from ?? 'unassigned'} → ${dest.shortName}`,
      cons: `${dest.shortName} gets +1 worker today. AI will rebalance the day's plan.`,
      cta: 'Move worker',
    };
  }
  if (kind === 'visit_done' && s) {
    return {
      line: `Mark visit done at ${s.shortName}`,
      cons: 'Photo + AI verification will run in the background.',
      cta: 'Mark done',
    };
  }
  if (kind === 'hr_ack') {
    return {
      line: 'Acknowledge HR update',
      cons: 'HR sees your name + timestamp. Stored permanently.',
      cta: 'Acknowledge',
    };
  }
  return { line: 'Confirm action', cons: '', cta: 'Confirm' };
}

function workerStatusLabel(w: Worker): { text: string; modifier: string } {
  if (w.todayStatus === 'present') return { text: 'Present', modifier: 'is-clear' };
  if (w.todayStatus === 'absent_notified') return { text: 'On leave', modifier: 'is-warn' };
  if (w.todayStatus === 'absent_no_call') return { text: 'No call', modifier: 'is-danger' };
  return { text: 'Off today', modifier: '' };
}

function siteStatusLabel(s: Site): { text: string; modifier: string } {
  if (s.todayStatus === 'covered') return { text: 'Covered', modifier: 'is-clear' };
  if (s.todayStatus === 'short_staffed') return { text: 'Short', modifier: 'is-warn' };
  if (s.todayStatus === 'flagged') return { text: 'Flagged', modifier: 'is-danger' };
  return { text: 'Pending', modifier: '' };
}

/** @derives(master-plan §G) */
function CheckIcon() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}
