'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Icon } from '../../../components/ui/Icon';
import { Chip, SeverityChip, ComplaintStateChip } from '../../../components/ui/Chip';
import { Empty } from '../../../components/ui/primitives';
import { fmtDate, fmtDateTime } from '../../../lib/format';
import type { ComplaintRow, ComplaintMessage } from '../data';

import { loadThread, replyComplaint, resolveComplaint, logComplaint } from './actions';

const KIND_ICON: Record<string, [string, string]> = {
  photo_mismatch: ['eye', 'Photo mismatch'],
  missed_area: ['mapPinOff', 'Missed area'],
  attitude: ['alert', 'Attitude'],
  theft_accusation: ['shield', 'Theft reported'],
  hygiene: ['alert', 'Hygiene'],
  damage: ['alert', 'Damage'],
  noise: ['alert', 'Noise'],
  gate_pass: ['lock', 'Gate pass'],
  other: ['complaint', 'Other'],
};
const kindOf = (k: string): [string, string] =>
  KIND_ICON[k] ?? (['complaint', 'Other'] as [string, string]);
const ageHours = (iso: string) => (Date.now() - new Date(iso).getTime()) / 3_600_000;
const isStale = (c: ComplaintRow) =>
  c.state === 'OPEN' && !c.lastReplyAt && ageHours(c.createdAt) > 6;
function ago(iso: string): string {
  const h = ageHours(iso);
  if (h < 1) return 'just now';
  if (h < 24) return `${Math.round(h)}h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d !== 1 ? 's' : ''} ago`;
}

type SiteOpt = { id: string; name: string };

/**
 * HR complaints screen: lists, filters and resolves site complaints.
 * @derives(master-plan §G)
 */
export function ComplaintsScreen({
  complaints,
  sites,
}: {
  complaints: ComplaintRow[];
  sites: SiteOpt[];
}) {
  const [filter, setFilter] = useState<'open' | 'resolved' | 'all'>('open');
  const [siteF, setSiteF] = useState('all');
  const [sevF, setSevF] = useState<'all' | 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW'>('all');
  const [sel, setSel] = useState<ComplaintRow | null>(null);
  const [logging, setLogging] = useState(false);

  const open = complaints.filter((c) => c.state === 'OPEN' || c.state === 'IN_HR');
  let shown =
    filter === 'open'
      ? open
      : filter === 'resolved'
        ? complaints.filter((c) => c.state === 'RESOLVED' || c.state === 'DISMISSED')
        : complaints;
  if (siteF !== 'all') shown = shown.filter((c) => c.siteId === siteF);
  if (sevF !== 'all') shown = shown.filter((c) => c.severity === sevF);
  shown = [...shown].sort((a, b) => (isStale(b) ? 1 : 0) - (isStale(a) ? 1 : 0));

  const siteOpts = [...new Map(complaints.map((c) => [c.siteId, c.siteName])).entries()];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Operations · Complaints</div>
          <h1 className="page-title">
            Complaints {open.length > 0 && <span className="count-chip">{open.length} open</span>}
          </h1>
          <p className="page-sub">
            Issues your supervisors raised from their sites. Reply, act, or resolve.
          </p>
        </div>
        <div className="head-actions">
          <button className="btn btn-primary" onClick={() => setLogging(true)} type="button">
            <Icon name="plus" size={17} /> Log complaint
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="seg">
          <button
            className={filter === 'open' ? 'on' : ''}
            onClick={() => setFilter('open')}
            type="button"
          >
            Open
          </button>
          <button
            className={filter === 'resolved' ? 'on' : ''}
            onClick={() => setFilter('resolved')}
            type="button"
          >
            Closed
          </button>
          <button
            className={filter === 'all' ? 'on' : ''}
            onClick={() => setFilter('all')}
            type="button"
          >
            All
          </button>
        </div>
        <select
          className="filter-pill"
          value={siteF}
          onChange={(e) => setSiteF(e.target.value)}
          style={{ appearance: 'auto' }}
        >
          <option value="all">All sites</option>
          {siteOpts.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <div className="seg">
          {(['all', 'URGENT', 'HIGH', 'MEDIUM', 'LOW'] as const).map((s) => (
            <button
              key={s}
              className={sevF === s ? 'on' : ''}
              onClick={() => setSevF(s)}
              type="button"
            >
              {s === 'all' ? 'Any' : s[0] + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        filter === 'open' ? (
          <>
            <div className="allcaught">
              <Icon name="checkCircle" size={22} />
              <div>
                <b>Nothing open.</b> No complaints need your attention right now.
              </div>
            </div>
            <Empty
              icon="complaint"
              title="No open complaints"
              body="When a supervisor raises an issue from one of your sites, it lands here."
            />
          </>
        ) : (
          <Empty icon="inbox" title="Nothing here" body="No complaints in this view." />
        )
      ) : (
        <div className="leave-layout">
          {shown.map((c) => (
            <ComplaintCard key={c.id} c={c} onClick={() => setSel(c)} />
          ))}
        </div>
      )}

      {sel && <ComplaintThread c={sel} onClose={() => setSel(null)} />}
      {logging && <LogComplaintModal sites={sites} onClose={() => setLogging(false)} />}
    </div>
  );
}

function ComplaintCard({ c, onClick }: { c: ComplaintRow; onClick: () => void }) {
  const [kicon, klabel] = kindOf(c.kind);
  const stale = isStale(c);
  const warn = c.severity === 'HIGH' || c.severity === 'MEDIUM';
  return (
    <div className="lv-card" onClick={onClick}>
      <span
        className="sc-icon"
        style={{
          width: 44,
          height: 44,
          background: warn ? 'var(--warn-soft)' : 'var(--paper-2)',
          color: warn ? 'var(--warn)' : 'var(--ink-3)',
        }}
      >
        <Icon name={kicon} size={20} />
      </span>
      <div className="lv-main">
        <div className="lv-name">
          {c.siteName}
          <SeverityChip severity={c.severity} sm />
          <ComplaintStateChip state={c.state} sm />
          {stale && (
            <Chip tone="warn" sm>
              {Math.round(ageHours(c.createdAt))}h, no reply
            </Chip>
          )}
        </div>
        <div className="lv-dates">
          <Icon name={kicon} size={14} /> {klabel} · <Icon name="userCog" size={14} />{' '}
          {c.supervisorName} · raised {ago(c.createdAt)}
        </div>
        <div className="lv-reason">{c.text}</div>
      </div>
      <div className="lv-right">
        {c.unreadHrRepliesCount > 0 && (
          <Chip tone="accent" sm dot={false}>
            {c.unreadHrRepliesCount} unread by supervisor
          </Chip>
        )}
        <Icon name="chevR" size={18} className="dim" />
      </div>
    </div>
  );
}

function ComplaintThread({ c, onClose }: { c: ComplaintRow; onClose: () => void }) {
  const router = useRouter();
  const [msgs, setMsgs] = useState<ComplaintMessage[] | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [state, setState] = useState(c.state);
  const closed = state === 'RESOLVED' || state === 'DISMISSED';
  const [kicon, klabel] = kindOf(c.kind);

  useEffect(() => {
    let live = true;
    loadThread(c.id)
      .then((d) => {
        if (live) setMsgs(d.messages);
      })
      .catch(() => {
        if (live) setMsgs([]);
      });
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onEsc);
    return () => {
      live = false;
      window.removeEventListener('keydown', onEsc);
    };
  }, [c.id, onClose]);

  const send = async () => {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      await replyComplaint(c.id, body);
      setMsgs((m) => [
        ...(m ?? []),
        {
          id: `local-${Date.now()}`,
          authorUserId: 'me',
          authorRole: 'HR',
          authorName: 'You',
          body,
          createdAt: new Date().toISOString(),
        },
      ]);
      setDraft('');
      if (state === 'OPEN') setState('IN_HR');
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const doResolve = async () => {
    setResolving(true);
    setConfirm(false);
    try {
      await resolveComplaint(c.id);
      router.refresh();
      onClose();
    } catch {
      setResolving(false);
    }
  };

  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label="Complaint thread">
        <div className="sheet-head">
          <span
            className="sc-icon"
            style={{
              width: 48,
              height: 48,
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
            }}
          >
            <Icon name={kicon} size={22} />
          </span>
          <div className="sh-title">
            <h2 style={{ fontSize: 17 }}>{c.siteName}</h2>
            <div className="sh-phone" style={{ fontFamily: 'var(--font)' }}>
              {klabel} · {c.supervisorName}
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
              <SeverityChip severity={c.severity} sm />
              <ComplaintStateChip state={state} sm />
            </div>
          </div>
          <button className="sheet-close" onClick={onClose} type="button">
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="sheet-body">
          <div className="thread">
            {msgs === null ? (
              <div className="helper" style={{ padding: 16, textAlign: 'center' }}>
                <span className="spin" /> Loading thread…
              </div>
            ) : (
              msgs.map((m, i) => {
                const showDay =
                  i === 0 || m.createdAt.slice(0, 10) !== msgs[i - 1]?.createdAt.slice(0, 10);
                const hr = m.authorRole === 'HR' || m.authorRole === 'ADMIN';
                return (
                  <div key={m.id}>
                    {showDay && (
                      <div className="thread-day">{fmtDate(m.createdAt.slice(0, 10))}</div>
                    )}
                    <div className={`bubble-row ${hr ? 'hr' : 'sup'}`}>
                      <div>
                        <div className="bubble">{m.body}</div>
                        <div className="bubble-meta">
                          {m.authorName} · {fmtDateTime(m.createdAt)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="sheet-foot">
          {closed ? (
            <div className="terminal-banner ok">
              <Icon name="checkCircle" size={20} />{' '}
              {state === 'DISMISSED' ? 'Dismissed' : 'Resolved'}
              {c.resolvedAt ? ` on ${fmtDate(c.resolvedAt.slice(0, 10))}` : ''}.
            </div>
          ) : (
            <>
              <div className="reply-bar" style={{ paddingTop: 0, marginBottom: 12 }}>
                <textarea
                  className="textarea"
                  placeholder="Type a reply… (sending moves this to “With HR”)"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  style={{ minHeight: 46 }}
                />
                <button
                  className="btn btn-primary"
                  style={{ height: 46, padding: '0 16px' }}
                  disabled={!draft.trim() || busy}
                  onClick={send}
                  type="button"
                >
                  {busy ? <span className="spin" /> : <Icon name="send" size={16} />}
                </button>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  className="btn btn-approve"
                  style={{ flex: 1 }}
                  disabled={resolving}
                  onClick={() => setConfirm(true)}
                  type="button"
                >
                  {resolving ? <span className="spin" /> : <Icon name="check" size={17} />} Mark
                  resolved
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {confirm && (
        <div className="modal-scrim" onClick={() => setConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Resolve this complaint?</h3>
              <p>This closes the thread for {c.supervisorName}. This can&apos;t be undone.</p>
            </div>
            <div className="modal-foot">
              <button
                className="btn btn-ghost btn-sm"
                style={{ height: 44, padding: '0 18px' }}
                onClick={() => setConfirm(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                className="btn btn-approve"
                disabled={resolving}
                onClick={doResolve}
                type="button"
              >
                {resolving ? <span className="spin" /> : <Icon name="check" size={17} />} Resolve
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function LogComplaintModal({ sites, onClose }: { sites: SiteOpt[]; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ siteId: sites[0]?.id ?? '', severity: 'LOW', text: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: 'siteId' | 'severity' | 'text', v: string) => setF((s) => ({ ...s, [k]: v }));
  const valid = f.siteId && f.text.trim().length > 2;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await logComplaint({ siteId: f.siteId, severity: f.severity, text: f.text.trim() });
      router.refresh();
      onClose();
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Log a complaint</h3>
          <p>Record an issue at one of your sites. It opens a thread you can track.</p>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div>
              <label className="field-label">Site</label>
              <select
                className="input"
                value={f.siteId}
                onChange={(e) => set('siteId', e.target.value)}
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Severity</label>
              <div className="seg" style={{ width: '100%' }}>
                {(['LOW', 'MEDIUM', 'HIGH'] as const).map((s) => (
                  <button
                    key={s}
                    className={f.severity === s ? 'on' : ''}
                    style={{ flex: 1 }}
                    onClick={() => set('severity', s)}
                    type="button"
                  >
                    {s[0] + s.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="field-label">What happened</label>
              <textarea
                className="textarea"
                value={f.text}
                onChange={(e) => set('text', e.target.value)}
                maxLength={2000}
                placeholder="Describe the issue…"
                autoFocus
              />
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button
            className="btn btn-ghost btn-sm"
            style={{ height: 44, padding: '0 18px' }}
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!valid || busy}
            onClick={submit}
            type="button"
          >
            {busy ? (
              <>
                <span className="spin" /> Logging…
              </>
            ) : (
              'Log complaint'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
