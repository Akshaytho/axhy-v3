'use client';

import { useState } from 'react';

import { Icon } from '../../../components/ui/Icon';
import { Chip } from '../../../components/ui/Chip';
import { Avatar, Empty } from '../../../components/ui/primitives';
import { fmtDate, fmtDateTime } from '../../../lib/format';
import type { AuditData, AuditEvent } from '../data';

// kind → [label, tone] (matches v6 KIND_CHIP).
const KIND_CHIP: Record<string, [string, Parameters<typeof Chip>[0]['tone']]> = {
  WORKER_MARKED_ABSENT: ['Marked absent', 'warn'],
  LEAVE_APPROVED: ['Leave approved', 'ok'],
  LEAVE_REQUESTED: ['Leave requested', 'neutral'],
  LEAVE_REJECTED: ['Leave rejected', 'neutral'],
  ASSIGNMENT_CREATED: ['Assignment created', 'neutral'],
  SITE_COMPLAINT_LOGGED: ['Complaint logged', 'warn'],
  VISIT_RESOLVED: ['Visit cleared', 'ok'],
  VISIT_REJECTED: ['Visit rejected', 'warn'],
  WORKER_CREATED: ['Worker added', 'neutral'],
  WORKER_RESIGNED: ['Worker resigned', 'neutral'],
  BINDING_ADDED: ['Cover started', 'neutral'],
  SITE_CREATED: ['Site created', 'neutral'],
};
function kindChip(k: string): [string, Parameters<typeof Chip>[0]['tone']] {
  return (
    KIND_CHIP[k] ?? [
      k
        .toLowerCase()
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase()),
      'neutral',
    ]
  );
}

const DATE_FILTERS: [string, string][] = [
  ['today', 'Today'],
  ['yesterday', 'Yesterday'],
  ['week', 'This week'],
  ['all', 'All'],
];

const IST = 'Asia/Kolkata';
const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: IST });
function dayHeading(iso: string): string {
  const k = dayKey(iso);
  const today = dayKey(new Date().toISOString());
  const yest = dayKey(new Date(Date.now() - 86_400_000).toISOString());
  if (k === today) return 'Today';
  if (k === yest) return 'Yesterday';
  return fmtDate(iso.slice(0, 10));
}
function timeOf(iso: string): string {
  return new Date(iso)
    .toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: IST,
    })
    .toLowerCase();
}

function downloadCSV(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) =>
      r
        .map((c) => {
          const s = String(c ?? '');
          return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        })
        .join(','),
    )
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * HR record screen: shows the activity and flagged audit feeds with filters.
 * @derives(master-plan §G)
 */
export function RecordScreen({ data, initial }: { data: AuditData; initial?: string }) {
  const [view, setView] = useState<'activity' | 'flagged'>(
    initial === 'flagged' ? 'flagged' : 'activity',
  );
  const [dateF, setDateF] = useState('today');
  const [kindF, setKindF] = useState('all');

  const kinds = [...new Set(data.events.map((e) => e.kind))];
  const inDate = (e: AuditEvent) => {
    if (dateF === 'all') return true;
    const k = dayKey(e.createdAt);
    const today = dayKey(new Date().toISOString());
    if (dateF === 'today') return k === today;
    if (dateF === 'yesterday') return k === dayKey(new Date(Date.now() - 86_400_000).toISOString());
    if (dateF === 'week') return Date.now() - new Date(e.createdAt).getTime() < 7 * 86_400_000;
    return true;
  };
  const rows = data.events.filter((e) => inDate(e) && (kindF === 'all' || e.kind === kindF));

  const groups: { h: string; items: AuditEvent[] }[] = [];
  rows.forEach((e) => {
    const h = dayHeading(e.createdAt);
    let g = groups.find((x) => x.h === h);
    if (!g) {
      g = { h, items: [] };
      groups.push(g);
    }
    g.items.push(e);
  });

  const exportCSV = () =>
    downloadCSV(`axhy-record-${dayKey(new Date().toISOString())}.csv`, [
      ['When', 'Type', 'Actor', 'Details'],
      ...rows.map((e) => [fmtDateTime(e.createdAt), kindChip(e.kind)[0], e.actor ?? '—', e.text]),
    ]);

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <div className="eyebrow">Company · Record</div>
          <h1 className="page-title">Record</h1>
          <p className="page-sub">
            An append-only history of what happened across your sites. Nothing here can be edited or
            deleted — that&apos;s the point.
          </p>
        </div>
      </div>

      <div className="toolbar">
        <div className="seg">
          <button
            className={view === 'activity' ? 'on' : ''}
            onClick={() => setView('activity')}
            type="button"
          >
            Activity
          </button>
          <button
            className={view === 'flagged' ? 'on' : ''}
            onClick={() => setView('flagged')}
            type="button"
          >
            Flagged visits{' '}
            {data.flaggedVisits.length > 0 && (
              <span className="dim mono" style={{ marginLeft: 5 }}>
                {data.flaggedVisits.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {view === 'flagged' ? (
        <FlaggedVisits visits={data.flaggedVisits} />
      ) : (
        <>
          <div className="toolbar">
            <div className="seg">
              {DATE_FILTERS.map(([k, label]) => (
                <button
                  key={k}
                  className={dateF === k ? 'on' : ''}
                  onClick={() => setDateF(k)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            <select
              className="filter-pill"
              value={kindF}
              onChange={(e) => setKindF(e.target.value)}
              style={{ appearance: 'auto' }}
            >
              <option value="all">All types</option>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {kindChip(k)[0]}
                </option>
              ))}
            </select>
            <button
              className="filter-pill"
              onClick={exportCSV}
              disabled={rows.length === 0}
              title="Download the filtered rows as a CSV for a client report"
              style={{ marginLeft: 'auto' }}
              type="button"
            >
              <Icon name="download" size={15} /> Download for client
            </button>
          </div>

          {rows.length === 0 ? (
            <Empty
              icon="history"
              title="Nothing in this range"
              body="Try a wider date range or a different type."
            />
          ) : (
            groups.map((g) => (
              <div key={g.h}>
                <div className="ledger-day">{g.h}</div>
                <div className="panel" style={{ marginBottom: 18 }}>
                  {g.items.map((e) => {
                    const [label, tone] = kindChip(e.kind);
                    return (
                      <div
                        key={e.id}
                        className="activity-row record-row"
                        style={{ cursor: 'default' }}
                      >
                        <span
                          className={`act-icon ${tone === 'ok' ? 'ok' : ''}`}
                          style={
                            tone === 'warn'
                              ? { background: 'var(--warn-soft)', color: 'var(--warn)' }
                              : {}
                          }
                        >
                          <Icon name={e.icon} size={16} />
                        </span>
                        <div className="act-body">
                          <div className="act-text">{e.text}</div>
                          <div className="act-time" title={fmtDateTime(e.createdAt)}>
                            {timeOf(e.createdAt)} · {e.actor ?? 'System'}
                          </div>
                        </div>
                        <Chip tone={tone} sm>
                          {label}
                        </Chip>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}

          <p className="helper" style={{ marginTop: 8 }}>
            Read-only ledger, grouped by day. When a row has no recorded actor it shows as “System”.
          </p>
        </>
      )}
    </div>
  );
}

function FlaggedVisits({ visits }: { visits: AuditData['flaggedVisits'] }) {
  if (visits.length === 0)
    return (
      <div className="empty">
        <div className="ico" style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }}>
          <Icon name="checkCircle" size={30} />
        </div>
        <h3>Nothing needs review</h3>
        <p>
          Every check-in across your sites is verified. Flagged visits appear here for you to watch
          — supervisors decide them.
        </p>
      </div>
    );
  return (
    <>
      <div className="note-banner">
        <Icon name="eye" size={17} /> HR observes flagged visits. The supervisor decides them — you
        can&apos;t resolve or reject here.
      </div>
      <div className="tbl-wrap responsive">
        <table className="tbl">
          <thead>
            <tr>
              <th>Worker</th>
              <th>Site</th>
              <th>Scheduled</th>
              <th>Status</th>
              <th>AI concern</th>
            </tr>
          </thead>
          <tbody>
            {visits.map((v) => (
              <tr key={v.id} style={{ cursor: 'default' }}>
                <td>
                  <div className="row-name">
                    <Avatar name={v.worker} size="sm" />
                    <span className="cell-primary">{v.worker}</span>
                  </div>
                </td>
                <td className="cell-sub">{v.site}</td>
                <td className="cell-mono">{fmtDateTime(v.scheduledFor)}</td>
                <td>
                  <Chip tone="warn" sm>
                    {v.state === 'NO_SHOW' ? 'No show' : 'Needs review'}
                  </Chip>
                </td>
                <td className="cell-sub" style={{ maxWidth: '32ch' }}>
                  {v.verificationText ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
