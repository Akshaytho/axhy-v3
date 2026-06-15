'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Icon } from '../../../components/ui/Icon';
import { Chip, StateChip } from '../../../components/ui/Chip';
import { Avatar, StatusChip, NewTag, DayMask, Empty } from '../../../components/ui/primitives';
import { IdPill, SoonPanel } from '../../../components/ui/IdPill';
import { fmtDate, fmtDateShort, fmtDateTime, fmtTime12, rupees } from '../../../lib/format';
import type { WorkerDetailItem, WorkerLeaveRow, WorkerAuditRow } from '../data';

const NOT_ON_APP = ['PENDING_ACTIVATION', 'INVITED'];
const TABS: [string, string][] = [
  ['profile', 'Profile'],
  ['sites', 'Sites & shifts'],
  ['attendance', 'Attendance'],
  ['visits', 'Visits'],
  ['leave', 'Leave'],
  ['record', 'Record'],
];
const LANG_NAME: Record<string, string> = {
  hi: 'हिन्दी — Hindi',
  te: 'తెలుగు — Telugu',
  en: 'English',
  bn: 'বাংলা — Bengali',
  ta: 'தமிழ் — Tamil',
};

/**
 * Worker detail — profile, sites, attendance, visits, leave and record tabs.
 * @derives(master-plan §G)
 */
export function WorkerDetail({ w }: { w: WorkerDetailItem }) {
  const [tab, setTab] = useState('profile');
  const [menu, setMenu] = useState(false);
  const [action, setAction] = useState<string | null>(null);
  const resigned = w.anonymizedPhone || w.state === 'TERMINATED';

  return (
    <div className="page page-wide">
      <div className="crumb" style={{ marginBottom: 20 }}>
        <Link href="/hr/workers">Workers</Link>
        <span className="sep">/</span>
        <span className="cur">{w.name}</span>
      </div>

      <div className="detail-head">
        <Avatar name={w.name ?? '?'} size="lg" neutral={resigned} />
        <div className="dh-main">
          <h1>
            {w.name}{' '}
            {resigned ? <Chip tone="neutral">Terminated</Chip> : <StateChip state={w.state} />}
          </h1>
          <div className="detail-meta">
            {!resigned && (
              <span className="dm mono">
                <Icon name="phone" size={15} /> {w.phone}
              </span>
            )}
            <span className="dm">
              <Icon name="mapPin" size={15} /> {w.primarySite?.name ?? 'No site'}
            </span>
            <span className="dm">
              <Icon name="calendar" size={15} /> Joined {fmtDate(w.joinedAt)}
            </span>
          </div>
          <div className="id-list">
            <IdPill label="Worker" value={w.workerId} />
            {w.userId && <IdPill label="User" value={w.userId} />}
            {w.membershipId && <IdPill label="Membership" value={w.membershipId} />}
          </div>
        </div>
        <div style={{ position: 'relative' }}>
          <button
            className="icon-btn"
            style={{ border: '1px solid var(--card-edge-2)' }}
            onClick={() => setMenu((m) => !m)}
            type="button"
          >
            <Icon name="more" size={18} />
          </button>
          {menu && (
            <ActionsMenu
              state={w.state}
              resigned={resigned}
              onClose={() => setMenu(false)}
              onAction={(k) => {
                setMenu(false);
                setAction(k);
              }}
            />
          )}
        </div>
      </div>

      <ActionModals
        name={w.name ?? 'this worker'}
        action={action}
        onClose={() => setAction(null)}
      />

      <div className="tabbar">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            className={`tab ${tab === key ? 'on' : ''}`}
            onClick={() => setTab(key)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="tab-pane">
        {tab === 'profile' && <ProfileTab w={w} resigned={resigned} />}
        {tab === 'sites' && <ShiftsTab w={w} />}
        {tab === 'attendance' && <AttendanceTab w={w} />}
        {tab === 'visits' && (
          <SoonPanel
            title="Visits — coming soon"
            body="The worker's visit history appears here once the per-worker visits read endpoint ships."
          />
        )}
        {tab === 'leave' && <LeaveTab rows={w.leave} />}
        {tab === 'record' && <RecordTab rows={w.audit} />}
      </div>
    </div>
  );
}

function ProfileTab({ w, resigned }: { w: WorkerDetailItem; resigned: boolean }) {
  const mask = (a: string | null) => (a ? '••••' + a.slice(-4) : 'Not set');
  return (
    <>
      <div className="note-banner">
        <Icon name="lock" size={17} /> Editing profiles is coming soon — fields are read-only for
        now.
      </div>
      <div className="kv-grid">
        <div className="kv">
          <div className="k">Name</div>
          <div className="v">{w.name}</div>
        </div>
        <div className="kv">
          <div className="k">Phone</div>
          <div className="v mono">{resigned ? 'Hidden' : w.phone}</div>
        </div>
        <div className="kv">
          <div className="k">Worker state</div>
          <div className="v">
            {resigned ? <Chip tone="neutral">Terminated</Chip> : <StateChip state={w.state} />}
          </div>
        </div>
        <div className="kv">
          <div className="k">Membership status</div>
          <div className="v">
            {w.status ? <StatusChip status={w.status} /> : <span className="dim">—</span>}
          </div>
        </div>
        <div className="kv">
          <div className="k">Preferred language</div>
          <div className="v">{LANG_NAME[w.preferredLanguage] ?? w.preferredLanguage}</div>
        </div>
        <div className="kv">
          <div className="k">Monthly salary</div>
          <div className="v money">{resigned ? '—' : rupees(w.salaryPaise)}</div>
        </div>
        <div className="kv">
          <div className="k">Bank IFSC</div>
          <div className="v mono">{resigned ? 'Hidden' : (w.bankIfsc ?? 'Not set')}</div>
        </div>
        <div className="kv">
          <div className="k">Bank account</div>
          <div className="v mono">{resigned ? 'Hidden' : mask(w.bankAcct)}</div>
        </div>
      </div>
    </>
  );
}

function ShiftsTab({ w }: { w: WorkerDetailItem }) {
  const rows = w.assignments ?? [];
  if (rows.length === 0)
    return (
      <SoonPanel
        title="No assignments yet"
        body="This worker is not on any site roster yet. Assign them to a site to set their shift pattern."
      />
    );
  const stateChip = (s: string) =>
    s === 'ACTIVE' ? (
      <Chip tone="ok" sm>
        Active
      </Chip>
    ) : s === 'DRAFT' ? (
      <Chip tone="warn" sm>
        Draft
      </Chip>
    ) : (
      <Chip tone="neutral" sm>
        Ended
      </Chip>
    );
  return (
    <>
      <div className="tbl-wrap responsive">
        <table className="tbl">
          <thead>
            <tr>
              <th>Site</th>
              <th>Shift</th>
              <th>Days</th>
              <th>Valid</th>
              <th>State</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a, i) => (
              <tr key={i} style={{ cursor: 'default' }}>
                <td className="cell-primary">{a.siteName}</td>
                <td className="cell-mono">
                  {fmtTime12(a.shiftStart)} – {fmtTime12(a.shiftEnd)}
                </td>
                <td>
                  <DayMask mask={a.dayMask} />
                </td>
                <td className="cell-sub">
                  From {fmtDateShort(a.validFrom)} ·{' '}
                  {a.validUntil ? fmtDate(a.validUntil) : 'Open-ended'}
                </td>
                <td>{stateChip(a.state)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="helper" style={{ marginTop: 12 }}>
        Roster changes (ending an assignment, transfers) turn on when the assignment write endpoints
        ship.
      </p>
    </>
  );
}

function AttendanceTab({ w }: { w: WorkerDetailItem }) {
  const att = w.attendance;
  const total = att ? Object.keys(att.days).length : 0;
  if (!att || total === 0)
    return (
      <SoonPanel
        title="No attendance this month"
        body="A month calendar of attendance appears here once supervisors record this worker's days on site."
      />
    );
  const STT: Record<string, [string, string]> = {
    PRESENT: ['P', 'ok'],
    ABSENT_NO_CALL: ['A', 'bad'],
    ABSENT_APPROVED_LEAVE: ['L', 'neutral'],
    HALF_DAY: ['½', 'warn'],
    ON_BREAK: ['B', 'neutral'],
  };
  const [y, m] = att.month.split('-').map(Number) as [number, number];
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthName = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return (
    <>
      <div className="note-banner">
        <Icon name="shield" size={17} /> Recorded by supervisors on site. View-only here ·{' '}
        {monthName}.
      </div>
      <div
        className="context-strip"
        style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 18 }}
      >
        <div className="ctx-item">
          <div className="v mono" style={{ color: 'var(--ok)' }}>
            {att.summary.present}
          </div>
          <div className="k">Present</div>
        </div>
        <div className="ctx-item">
          <div className="v mono" style={{ color: 'var(--bad)' }}>
            {att.summary.absent}
          </div>
          <div className="k">Absent</div>
        </div>
        <div className="ctx-item">
          <div className="v mono">{att.summary.leave}</div>
          <div className="k">Approved leave</div>
        </div>
        <div className="ctx-item">
          <div className="v mono" style={{ color: 'var(--warn)' }}>
            {att.summary.half}
          </div>
          <div className="k">Half day</div>
        </div>
      </div>
      <div className="att-grid">
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const d = i + 1;
          const st = att.days[String(d)];
          const [ch, tone] = st ? (STT[st] ?? ['', '']) : ['', ''];
          return (
            <div
              key={d}
              className={`att-cell ${tone}`}
              title={
                st
                  ? `${d} ${monthName} · ${st.replace(/_/g, ' ').toLowerCase()}`
                  : `${d} ${monthName}`
              }
            >
              <span className="ad-n">{d}</span>
              {ch && <span className="ad-m">{ch}</span>}
            </div>
          );
        })}
      </div>
    </>
  );
}

function LeaveTab({ rows }: { rows: WorkerLeaveRow[] }) {
  if (!rows || rows.length === 0)
    return (
      <Empty
        icon="calendarOff"
        title="No leave requests"
        body="This worker hasn't requested any leave yet."
      />
    );
  const chip = (s: string) =>
    s === 'APPROVED' ? (
      <Chip tone="ok" sm>
        Approved
      </Chip>
    ) : s === 'REJECTED' ? (
      <Chip tone="neutral" sm>
        Rejected
      </Chip>
    ) : (
      <Chip tone="warn" sm>
        Waiting
      </Chip>
    );
  return (
    <div className="tbl-wrap responsive">
      <table className="tbl">
        <thead>
          <tr>
            <th>Dates</th>
            <th>Reason</th>
            <th>Decision</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} style={{ cursor: 'default' }}>
              <td className="cell-mono">
                {fmtDateShort(r.fromDate)} – {fmtDateShort(r.toDate)}
              </td>
              <td className="cell-sub">{r.reason}</td>
              <td>{chip(r.state)}</td>
              <td className="cell-sub">{r.decisionNote || <span className="dim">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Worker audit kind → icon (mirrors v6's per-worker record icons).
const AUDIT_ICON: Record<string, string> = {
  LEAVE_REQUESTED: 'calendarOff',
  LEAVE_APPROVED: 'calCheck',
  LEAVE_REJECTED: 'calX',
  WORKER_MARKED_ABSENT: 'userX',
  WORKER_CREATED: 'userPlus',
  WORKER_FLAGGED: 'alert',
  ASSIGNMENT_CREATED: 'briefcase',
  VISIT_REJECTED: 'calX',
  VISIT_RESOLVED: 'checkCircle',
  BINDING_ADDED: 'shield',
};
function auditText(e: WorkerAuditRow): string {
  const p = e.payload ?? {};
  const site = typeof p.siteName === 'string' ? p.siteName : null;
  const range = typeof p.dateRange === 'string' ? p.dateRange : null;
  switch (e.kind) {
    case 'LEAVE_REQUESTED':
      return `Requested leave${range ? `, ${range}` : ''}.`;
    case 'LEAVE_APPROVED':
      return `Leave approved${range ? `, ${range}` : ''}.`;
    case 'LEAVE_REJECTED':
      return `Leave rejected${range ? `, ${range}` : ''}.`;
    case 'WORKER_MARKED_ABSENT':
      return `Marked absent (no call)${site ? ` at ${site}` : ''}.`;
    case 'WORKER_CREATED':
      return `Added${site ? ` to ${site}` : ''}.`;
    case 'WORKER_FLAGGED':
      return 'Flagged at-risk.';
    case 'ASSIGNMENT_CREATED':
      return `New assignment${site ? ` at ${site}` : ''}.`;
    default:
      return e.kind.toLowerCase().replace(/_/g, ' ');
  }
}

function RecordTab({ rows }: { rows: WorkerAuditRow[] }) {
  if (!rows || rows.length === 0)
    return (
      <Empty
        icon="history"
        title="No record yet"
        body="Changes to this worker will appear here as they happen."
      />
    );
  return (
    <>
      <div className="panel">
        {rows.map((e) => (
          <div key={e.id} className="activity-row" style={{ cursor: 'default' }}>
            <span className="act-icon">
              <Icon name={AUDIT_ICON[e.kind] ?? 'check'} size={16} />
            </span>
            <div className="act-body">
              <div className="act-text">{auditText(e)}</div>
              <div className="act-time">{fmtDateTime(e.createdAt)}</div>
            </div>
          </div>
        ))}
      </div>
      <p className="helper" style={{ marginTop: 12 }}>
        Read-only. This ledger can&apos;t be edited or deleted — that&apos;s the point.
      </p>
    </>
  );
}

function ActionsMenu({
  state,
  resigned,
  onClose,
  onAction,
}: {
  state: string;
  resigned: boolean;
  onClose: () => void;
  onAction: (k: string) => void;
}) {
  const isActiveish = state === 'ACTIVE' || state === 'AT_RISK';
  const canAnonymise = state === 'TERMINATION_PENDING';
  const terminating = state === 'TERMINATION_PENDING' || state === 'TERMINATED' || resigned;

  useEffect(() => {
    const h = () => onClose();
    const t = setTimeout(() => window.addEventListener('click', h), 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener('click', h);
    };
  }, [onClose]);

  return (
    <div className="menu" onClick={(e) => e.stopPropagation()}>
      {NOT_ON_APP.includes(state) && (
        <button className="menu-item" onClick={() => onAction('invite')} type="button">
          <Icon name="userPlus" size={16} /> Invite again
        </button>
      )}
      {state === 'ON_SUSPENSION' ? (
        <button className="menu-item" onClick={() => onAction('lift')} type="button">
          <Icon name="check" size={16} /> Lift suspension
        </button>
      ) : (
        isActiveish && (
          <button className="menu-item" onClick={() => onAction('suspend')} type="button">
            <Icon name="pause" size={16} /> Suspend
          </button>
        )
      )}
      {isActiveish &&
        (state === 'AT_RISK' ? (
          <button className="menu-item" onClick={() => onAction('clearrisk')} type="button">
            <Icon name="checkCircle" size={16} /> Clear at-risk
          </button>
        ) : (
          <button className="menu-item" onClick={() => onAction('flagrisk')} type="button">
            <Icon name="alert" size={16} /> Flag at-risk
          </button>
        ))}
      <button className="menu-item" disabled type="button">
        <Icon name="edit" size={16} /> Edit profile <NewTag />
      </button>
      <div className="menu-sep" />
      {!terminating && (
        <button className="menu-item danger" onClick={() => onAction('terminate')} type="button">
          <Icon name="userX" size={16} /> Terminate
        </button>
      )}
      <button
        className="menu-item danger"
        disabled={!canAnonymise}
        onClick={() => onAction('anonymise')}
        type="button"
      >
        <Icon name="archive" size={16} /> Anonymise
        {!canAnonymise && !resigned && (
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--ink-4)' }}>
            Terminate first
          </span>
        )}
      </button>
    </div>
  );
}

const ACTION_COPY: Record<
  string,
  {
    title: (n: string) => string;
    body: string;
    reason?: boolean;
    danger?: boolean;
    cta: string;
    icon: string;
  }
> = {
  invite: {
    title: (n) => `Resend the app invite to ${n}?`,
    body: 'Sends a fresh join SMS to their phone.',
    cta: 'Resend invite',
    icon: 'userPlus',
  },
  suspend: {
    title: (n) => `Suspend ${n}?`,
    body: 'They stop appearing on rosters from tomorrow. Reason required.',
    reason: true,
    danger: true,
    cta: 'Suspend',
    icon: 'pause',
  },
  lift: {
    title: (n) => `Bring ${n} back to active?`,
    body: "They'll appear on rosters again from tomorrow.",
    cta: 'Lift suspension',
    icon: 'check',
  },
  flagrisk: {
    title: (n) => `Flag ${n} as at-risk?`,
    body: "A private HR note. It doesn't notify the worker.",
    cta: 'Flag at-risk',
    icon: 'alert',
  },
  clearrisk: {
    title: (n) => `Clear at-risk for ${n}?`,
    body: 'Removes the private at-risk note.',
    cta: 'Clear',
    icon: 'checkCircle',
  },
  terminate: {
    title: (n) => `Start termination for ${n}?`,
    body: 'Reason required. After this you can anonymise their record to finish.',
    reason: true,
    danger: true,
    cta: 'Start termination',
    icon: 'userX',
  },
  anonymise: {
    title: (n) => `Anonymise ${n}?`,
    body: 'Finalises termination and removes personal details. This cannot be undone.',
    reason: true,
    danger: true,
    cta: 'Anonymise worker',
    icon: 'archive',
  },
};

function ActionModals({
  name,
  action,
  onClose,
}: {
  name: string;
  action: string | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  if (!action) return null;
  const cfg = ACTION_COPY[action];
  if (!cfg) return null;
  const ok = !cfg.reason || reason.trim().length >= 3;
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{cfg.title(name)}</h3>
          <p>{cfg.body}</p>
        </div>
        {cfg.reason && (
          <div className="modal-body">
            <label className="field-label">Reason (required)</label>
            <textarea
              className="textarea"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
          </div>
        )}
        <div style={{ padding: '0 24px 4px' }}>
          <p
            className="helper"
            style={{ display: 'flex', gap: 6, alignItems: 'center', margin: 0 }}
          >
            <Icon name="clock" size={13} /> Demo action — turns on when the transition endpoint
            ships.
          </p>
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
            className={`btn ${cfg.danger ? 'btn-reject' : 'btn-primary'}`}
            disabled={!ok || busy}
            type="button"
            onClick={() => {
              setBusy(true);
              setTimeout(() => {
                setBusy(false);
                setReason('');
                onClose();
              }, 600);
            }}
          >
            {busy ? <span className="spin" /> : <Icon name={cfg.icon} size={17} />} {cfg.cta}
          </button>
        </div>
      </div>
    </div>
  );
}
