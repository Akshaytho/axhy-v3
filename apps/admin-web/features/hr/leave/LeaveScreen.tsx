'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Icon } from '../../../components/ui/Icon';
import { Chip } from '../../../components/ui/Chip';
import { Avatar, Empty } from '../../../components/ui/primitives';
import { fmtDate, fmtDateShort, fmtDateTime } from '../../../lib/format';
import type { LeaveData, LeavePending, LeaveHistory } from '../data';

import { approveLeave, rejectLeave } from './actions';

/** Inclusive day span between two YYYY-MM-DD dates. */
function daySpan(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00Z').getTime();
  const b = new Date(to + 'T00:00:00Z').getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}
/** "6 hours ago" / "2 days ago" from an ISO timestamp. */
function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? 's' : ''} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

/**
 * HR leave screen: shows pending requests and leave history with approvals.
 * @derives(master-plan §G)
 */
export function LeaveScreen({ data }: { data: LeaveData }) {
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [q, setQ] = useState('');
  const [hist, setHist] = useState<'all' | 'approved' | 'rejected'>('all');
  const [sel, setSel] = useState<LeavePending | null>(null);
  const [histSel, setHistSel] = useState<LeaveHistory | null>(null);

  const pending = data.pending;
  const shownPending = pending.filter(
    (lv) => !q || lv.name.toLowerCase().includes(q.toLowerCase()),
  );
  const history = data.history.filter(
    (h) => hist === 'all' || h.state === (hist === 'approved' ? 'APPROVED' : 'REJECTED'),
  );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">People · Leave</div>
          <h1 className="page-title">
            Leave requests
            {tab === 'pending' && pending.length > 0 && (
              <span className="count-chip">{pending.length} pending</span>
            )}
          </h1>
          <p className="page-sub">
            Review and decide leave for workers on your sites. Approving marks the days as approved
            leave with no pay deduction.
          </p>
        </div>
      </div>

      <div className="toolbar">
        <div className="seg">
          <button
            className={tab === 'pending' ? 'on' : ''}
            onClick={() => setTab('pending')}
            type="button"
          >
            Pending
          </button>
          <button
            className={tab === 'history' ? 'on' : ''}
            onClick={() => setTab('history')}
            type="button"
          >
            History
          </button>
        </div>
        <div style={{ flex: 1 }} />
        {tab === 'pending' ? (
          <div className="field-search" style={{ minWidth: 220 }}>
            <Icon name="search" size={16} />
            <input
              placeholder="Filter loaded results…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        ) : (
          <div className="seg">
            {(['all', 'approved', 'rejected'] as const).map((s) => (
              <button
                key={s}
                className={hist === s ? 'on' : ''}
                onClick={() => setHist(s)}
                type="button"
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === 'pending' ? (
        shownPending.length === 0 ? (
          pending.length === 0 ? (
            <AllCaught />
          ) : (
            <Empty icon="search" title="No match" body="No pending request matches that name." />
          )
        ) : (
          <div className="leave-layout">
            {shownPending.map((lv) => (
              <LeaveCard
                key={lv.id}
                lv={lv}
                selected={sel?.id === lv.id}
                onClick={() => setSel(lv)}
              />
            ))}
          </div>
        )
      ) : (
        <LeaveHistoryList history={history} onOpen={setHistSel} />
      )}

      {sel && <ReviewSheet lv={sel} onClose={() => setSel(null)} />}
      {histSel && <HistorySheet lv={histSel} onClose={() => setHistSel(null)} />}
    </div>
  );
}

function LeaveCard({
  lv,
  selected,
  onClick,
}: {
  lv: LeavePending;
  selected: boolean;
  onClick: () => void;
}) {
  const span = daySpan(lv.fromDate, lv.toDate);
  return (
    <div className={`lv-card ${selected ? 'sel' : ''}`} onClick={onClick}>
      <Avatar name={lv.name} />
      <div className="lv-main">
        <div className="lv-name">
          {lv.name}{' '}
          <Chip tone="warn" sm>
            Waiting on you
          </Chip>
        </div>
        <div className="lv-dates">
          <Icon name="calendar" size={14} />
          {span === 1
            ? fmtDate(lv.fromDate)
            : `${fmtDateShort(lv.fromDate)} – ${fmtDate(lv.toDate)}`}
          <span className="days">
            · {span} day{span > 1 ? 's' : ''}
          </span>
        </div>
        <div className="lv-reason">{lv.reason}</div>
      </div>
      <div className="lv-right">
        <span className="lv-ago">{ago(lv.createdAt)}</span>
        <Icon name="chevR" size={18} className="dim" />
      </div>
    </div>
  );
}

function LeaveHistoryList({
  history,
  onOpen,
}: {
  history: LeaveHistory[];
  onOpen: (h: LeaveHistory) => void;
}) {
  if (history.length === 0)
    return (
      <Empty
        icon="calendarOff"
        title="No decided leave"
        body="Approved and rejected leave will show here."
      />
    );
  return (
    <div className="tbl-wrap responsive">
      <table className="tbl">
        <thead>
          <tr>
            <th>Worker</th>
            <th>Dates</th>
            <th>Decision</th>
            <th>Decided</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {history.map((h) => (
            <tr key={h.id} onClick={() => onOpen(h)}>
              <td>
                <div className="row-name">
                  <Avatar name={h.name} size="sm" />
                  <span className="cell-primary">{h.name}</span>
                </div>
              </td>
              <td className="cell-mono">
                {fmtDateShort(h.fromDate)} – {fmtDateShort(h.toDate)}
              </td>
              <td>
                {h.state === 'APPROVED' ? (
                  <Chip tone="ok" sm>
                    Approved
                  </Chip>
                ) : h.state === 'CANCELLED' ? (
                  <Chip tone="neutral" sm>
                    Cancelled
                  </Chip>
                ) : (
                  <Chip tone="neutral" sm>
                    Rejected
                  </Chip>
                )}
              </td>
              <td className="cell-sub">
                {fmtDateTime(h.decidedAt)} · {h.decidedByYou ? 'You' : h.decidedByName}
              </td>
              <td className="chev-cell">
                <Icon name="chevR" size={16} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistorySheet({ lv, onClose }: { lv: LeaveHistory; onClose: () => void }) {
  const span = daySpan(lv.fromDate, lv.toDate);
  const approved = lv.state === 'APPROVED';
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label="Decided leave">
        <div className="sheet-head">
          <Avatar name={lv.name} size="lg" />
          <div className="sh-title">
            <h2>{lv.name}</h2>
            <div className="sh-phone">{lv.phone}</div>
            <div style={{ marginTop: 8 }}>
              {approved ? <Chip tone="ok">Approved</Chip> : <Chip tone="neutral">Rejected</Chip>}
            </div>
          </div>
          <button className="sheet-close" onClick={onClose} type="button">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="sheet-body">
          <div className="rec-block">
            <div className="rec-label">Leave dates</div>
            <div className="rec-dates">
              <div className="rd-col">
                <div className="d">{fmtDateShort(lv.fromDate)}</div>
                <div className="l">From</div>
              </div>
              <Icon name="arrowRight" size={16} className="rd-arrow" />
              <div className="rd-col">
                <div className="d">{fmtDateShort(lv.toDate)}</div>
                <div className="l">To</div>
              </div>
              <span className="rd-span">
                {span} day{span > 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <div className="rec-block">
            <div className="rec-label">Worker&apos;s reason</div>
            <div className="rec-reason">{lv.reason}</div>
          </div>
          <div className="rec-block">
            <div className="rec-label">Decision note</div>
            <div className="rec-reason">
              {lv.note || <span className="dim">No note added.</span>}
            </div>
          </div>
        </div>
        <div className="sheet-foot">
          <div
            className={`terminal-banner ${approved ? 'ok' : 'bad'}`}
            style={approved ? {} : { background: 'var(--paper-2)', color: 'var(--ink-2)' }}
          >
            <Icon name={approved ? 'checkCircle' : 'x'} size={20} />
            {approved ? 'Approved' : 'Rejected'}{' '}
            {lv.decidedByYou ? 'by you' : `by ${lv.decidedByName}`}
            {lv.decidedAt ? ` on ${fmtDate(lv.decidedAt.slice(0, 10))}` : ''}. Leave decisions are
            final.
          </div>
        </div>
      </div>
    </>
  );
}

function ReviewSheet({ lv, onClose }: { lv: LeavePending; onClose: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<'approve' | 'reject'>('approve');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const span = daySpan(lv.fromDate, lv.toDate);
  const rejectNeedsReason = mode === 'reject' && note.trim().length === 0;

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const submit = async () => {
    if (busy || rejectNeedsReason) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'approve') await approveLeave(lv.id, note);
      else await rejectLeave(lv.id, note);
      router.refresh();
      onClose();
    } catch {
      setBusy(false);
      setError(
        'Could not save this decision. It may already have been decided — refresh and check.',
      );
    }
  };

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label="Leave review">
        <div className="sheet-head">
          <Avatar name={lv.name} size="lg" />
          <div className="sh-title">
            <h2>{lv.name}</h2>
            <div className="sh-phone">{lv.phone}</div>
            <div style={{ marginTop: 8 }}>
              <Chip tone="warn">Waiting on you</Chip>
            </div>
          </div>
          <button className="sheet-close" onClick={onClose} type="button">
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="sheet-body">
          <div className="rec-block">
            <div className="rec-label">Leave dates</div>
            <div className="rec-dates">
              <div className="rd-col">
                <div className="d">{fmtDateShort(lv.fromDate)}</div>
                <div className="l">From</div>
              </div>
              <Icon name="arrowRight" size={16} className="rd-arrow" />
              <div className="rd-col">
                <div className="d">{fmtDateShort(lv.toDate)}</div>
                <div className="l">To</div>
              </div>
              <span className="rd-span">
                {span} day{span > 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <div className="rec-block">
            <div className="rec-label">Worker&apos;s reason</div>
            <div className="rec-reason">{lv.reason}</div>
          </div>

          <div className="rec-block">
            <div className="rec-label">Worker context</div>
            <div className="context-strip">
              <div className="ctx-item">
                <div className="v" style={{ color: 'var(--ok)' }}>
                  {lv.present30}
                  <span style={{ fontSize: 13, color: 'var(--ink-4)' }}>/30</span>
                </div>
                <div className="k">Present last 30 days</div>
              </div>
              <div className="ctx-item">
                <div className="v">
                  {lv.leave90}
                  <span style={{ fontSize: 13, color: 'var(--ink-4)' }}>×</span>
                </div>
                <div className="k">Leaves this quarter</div>
              </div>
              <div className="ctx-item">
                <div className="v" style={{ fontSize: 16 }}>
                  {fmtDate(lv.activeSince)}
                </div>
                <div className="k">Active since</div>
              </div>
            </div>
            {lv.overlap > 0 && (
              <div
                className="note-banner"
                style={{
                  marginTop: 10,
                  marginBottom: 0,
                  background: 'var(--warn-soft)',
                  color: '#6b5208',
                }}
              >
                <Icon name="alert" size={17} /> {lv.overlap} other{lv.overlap > 1 ? 's' : ''}{' '}
                already off at this site on these dates.
              </div>
            )}
            <div className="note-banner" style={{ marginTop: 10, marginBottom: 0 }}>
              <Icon name="mapPin" size={17} /> {lv.site}
            </div>
          </div>
        </div>

        <div className="sheet-foot">
          <div className="decision-tabs">
            <button
              className={`dec-tab approve ${mode === 'approve' ? 'on' : ''}`}
              onClick={() => setMode('approve')}
              type="button"
            >
              <Icon name="check" size={17} /> Approve
            </button>
            <button
              className={`dec-tab reject ${mode === 'reject' ? 'on' : ''}`}
              onClick={() => setMode('reject')}
              type="button"
            >
              <Icon name="x" size={17} /> Reject
            </button>
          </div>

          {mode === 'approve' && (
            <div className="approve-note">
              <Icon name="checkCircle" size={16} /> These {span} day{span > 1 ? 's' : ''} will be
              marked approved leave (no pay deduction) and payroll will be recalculated.
            </div>
          )}

          <textarea
            className="textarea"
            placeholder={
              mode === 'reject' ? 'Reason for rejecting (required)…' : 'Add a note (optional)…'
            }
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ marginBottom: 12, minHeight: 70 }}
          />

          <button
            className={`btn btn-block btn-lg ${mode === 'approve' ? 'btn-approve' : 'btn-reject'}`}
            disabled={busy || rejectNeedsReason}
            onClick={submit}
            type="button"
          >
            {busy ? (
              <span className="spin" />
            ) : (
              <Icon name={mode === 'approve' ? 'check' : 'x'} size={18} />
            )}
            {mode === 'approve' ? 'Approve leave' : 'Reject leave'}
          </button>
          {rejectNeedsReason && (
            <p className="field-err" style={{ justifyContent: 'center', marginTop: 10 }}>
              <Icon name="alert" size={13} /> A reason is required to reject.
            </p>
          )}
          {error && (
            <p className="field-err" style={{ justifyContent: 'center', marginTop: 10 }}>
              <Icon name="alert" size={13} /> {error}
            </p>
          )}
        </div>
      </div>
    </>
  );
}

function AllCaught() {
  return (
    <>
      <div className="allcaught">
        <Icon name="checkCircle" size={22} />
        <div>
          <b>All caught up.</b> No pending leave requests right now.
        </div>
      </div>
      <Empty
        icon="calendarOff"
        title="Queue is clear"
        body="New leave requests from workers on your sites will land here for you to decide."
      />
    </>
  );
}
