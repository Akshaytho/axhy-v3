'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Icon } from '../../../components/ui/Icon';
import { Chip, StateChip } from '../../../components/ui/Chip';
import {
  Avatar,
  StatusChip,
  Empty,
  DayMask,
  NewTag,
  SoonData,
} from '../../../components/ui/primitives';
import { SoonPanel } from '../../../components/ui/IdPill';
import { fmtDate, fmtDateShort } from '../../../lib/format';
import type { SiteDetailData, SiteBinding } from '../data';

const TABS: [string, string][] = [
  ['roster', 'Roster'],
  ['supervisors', 'Supervisors'],
  ['qr', 'QR code'],
  ['visits', 'Visits'],
];

/**
 * Site detail — roster, supervisors, QR and visits tabs for a single site.
 * @derives(master-plan §G)
 */
export function SiteDetail({ data }: { data: SiteDetailData }) {
  const { site, today, roster, bindings } = data;
  const [tab, setTab] = useState('roster');
  const [form, setForm] = useState<null | 'assign' | 'bind' | 'pin'>(null);

  return (
    <div className="page page-wide">
      <div className="crumb" style={{ marginBottom: 20 }}>
        <Link href="/hr/sites">Sites</Link>
        <span className="sep">/</span>
        <span className="cur">{site.name}</span>
      </div>

      <div className="panel" style={{ padding: 24, marginBottom: 4 }}>
        <div className="detail-head" style={{ marginBottom: 0 }}>
          <span
            className="sc-icon"
            style={{
              width: 52,
              height: 52,
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
            }}
          >
            <Icon name="building" size={26} />
          </span>
          <div className="dh-main">
            <h1 style={{ fontSize: 23 }}>
              {site.name} <StateChip state={site.state} />
            </h1>
            <div className="detail-meta">
              <span className="dm">
                <Icon name="mapPin" size={15} /> {site.address || 'No address on file'}
              </span>
              {site.latitude ? (
                <>
                  <span className="dm mono">
                    <Icon name="mapPin" size={15} /> {site.latitude}, {site.longitude}
                  </span>
                  <span className="dm">
                    <Icon name="shield" size={15} /> Check-in radius: 120 m
                  </span>
                </>
              ) : (
                <button
                  className="chip chip-warn"
                  onClick={() => setForm('pin')}
                  style={{ cursor: 'pointer', border: 'none' }}
                >
                  <span className="dot" /> No location set — fix
                </button>
              )}
            </div>
            <div className="detail-meta" style={{ marginTop: 8 }}>
              <span className="dm">
                Workdays <DayMask mask={site.workdays} />
              </span>
              <span className="dm">
                <Icon name="calendar" size={15} /> Created {fmtDate(site.createdAt.slice(0, 10))}
              </span>
            </div>
          </div>
          <div className="head-actions">
            <button
              className="btn btn-ghost btn-sm"
              style={{ height: 40 }}
              onClick={() => setForm('pin')}
              type="button"
            >
              <Icon name="edit" size={15} /> Edit
            </button>
          </div>
        </div>
      </div>

      {site.state === 'DRAFT' ? (
        <div className="note-banner" style={{ marginTop: 14 }}>
          <Icon name="info" size={17} /> Draft — add a supervisor and assign workers to start
          operations.
        </div>
      ) : (
        <div className="site-today">
          <span className="st-label">
            <Icon name="shield" size={15} /> Today
          </span>
          <span className="st-fig">
            <b style={{ color: 'var(--ink-2)' }}>{today.assigned}</b> assigned
          </span>
          <span className="st-fig">
            <b style={{ color: 'var(--ok)' }}>{today.present}</b> in
          </span>
          <span className="st-fig">
            <b style={{ color: today.absentNoCall > 0 ? 'var(--warn)' : 'var(--ink-4)' }}>
              {today.absentNoCall}
            </b>{' '}
            absent
          </span>
          <span className="st-fig">
            <b style={{ color: today.uncovered > 0 ? 'var(--warn)' : 'var(--ink-4)' }}>
              {today.uncovered}
            </b>{' '}
            uncovered
          </span>
        </div>
      )}

      <div className="tabbar">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            className={`tab ${tab === k ? 'on' : ''}`}
            onClick={() => setTab(k)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>

      <div className="tab-pane">
        {tab === 'roster' && <RosterTab roster={roster} onAssign={() => setForm('assign')} />}
        {tab === 'supervisors' && <SupervisorsTab binds={bindings} onAdd={() => setForm('bind')} />}
        {tab === 'qr' && <QrTab site={site} />}
        {tab === 'visits' && (
          <SoonPanel
            title="Recent visits — coming soon"
            body="The latest visits at this site list here once the site-scoped visits read endpoint ships."
          />
        )}
      </div>

      {form && <DemoForm kind={form} onClose={() => setForm(null)} />}
    </div>
  );
}

function RosterTab({
  roster,
  onAssign,
}: {
  roster: SiteDetailData['roster'];
  onAssign: () => void;
}) {
  return (
    <>
      <div className="toolbar" style={{ marginBottom: 14 }}>
        <span className="page-sub" style={{ margin: 0 }}>
          Workers assigned to this site.
        </span>
        <div style={{ flex: 1 }} />
        <button
          className="btn btn-primary btn-sm"
          style={{ height: 38 }}
          onClick={onAssign}
          type="button"
        >
          <Icon name="userPlus" size={15} /> Assign worker
        </button>
      </div>
      {roster.length === 0 ? (
        <Empty
          icon="users"
          title="No workers assigned yet"
          body="Assign your first worker to start building this site's roster."
        />
      ) : (
        <div className="tbl-wrap responsive">
          <table className="tbl">
            <thead>
              <tr>
                <th>Worker</th>
                <th>Phone</th>
                <th>State</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((w) => (
                <tr
                  key={w.workerId}
                  onClick={() => (window.location.href = `/hr/workers/${w.workerId}`)}
                >
                  <td>
                    <div className="row-name">
                      <Avatar name={w.name} size="sm" />
                      <span className="cell-primary">{w.name}</span>
                    </div>
                  </td>
                  <td className="cell-mono">{w.phone}</td>
                  <td>
                    <StateChip state={w.state} sm />
                  </td>
                  <td>
                    <StatusChip status={w.status} sm />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function SupervisorsTab({ binds, onAdd }: { binds: SiteBinding[]; onAdd: () => void }) {
  return (
    <>
      <div className="toolbar" style={{ marginBottom: 14 }}>
        <span className="page-sub" style={{ margin: 0 }}>
          Who supervises this site, including temporary cover.
        </span>
        <div style={{ flex: 1 }} />
        <button
          className="btn btn-primary btn-sm"
          style={{ height: 38 }}
          onClick={onAdd}
          type="button"
        >
          <Icon name="plus" size={15} /> Add binding
        </button>
      </div>
      {binds.length === 0 ? (
        <Empty
          icon="shield"
          title="No supervisors bound yet"
          body="Bind a supervisor so they can manage check-ins and attendance here."
        />
      ) : (
        <div className="tbl-wrap responsive">
          <table className="tbl">
            <thead>
              <tr>
                <th>Supervisor</th>
                <th>Phone</th>
                <th>Type</th>
                <th>Effective</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {binds.map((b) => (
                <tr key={b.id} style={{ cursor: 'default' }}>
                  <td>
                    <div className="row-name">
                      <Avatar name={b.name} size="sm" />
                      <span className="cell-primary">{b.name}</span>
                    </div>
                  </td>
                  <td className="cell-mono">{b.phone}</td>
                  <td>
                    {b.type === 'Acting' ? (
                      <Chip tone="warn" sm>
                        Acting
                      </Chip>
                    ) : (
                      <Chip tone="neutral" sm dot={false}>
                        Permanent
                      </Chip>
                    )}
                  </td>
                  <td className="cell-sub">
                    {fmtDateShort(b.from.slice(0, 10))}
                    {b.until ? ` – ${fmtDateShort(b.until.slice(0, 10))}` : ' – open'}
                  </td>
                  <td>
                    {b.ended ? (
                      <Chip tone="neutral" sm>
                        Ended {fmtDateShort(b.ended.slice(0, 10))}
                      </Chip>
                    ) : (
                      <Chip tone="ok" sm>
                        Active
                      </Chip>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function QrTab({ site }: { site: SiteDetailData['site'] }) {
  return (
    <div className="qr-card">
      <div className="qr-frame">
        <Icon name="qr" size={96} />
      </div>
      <div style={{ fontWeight: 700, fontSize: 16 }}>{site.name}</div>
      <div className="cell-mono dim" style={{ marginTop: 4 }}>
        {site.id}
      </div>
      <p className="page-sub" style={{ margin: '12px auto 18px', maxWidth: '32ch' }}>
        Workers scan this to check in on site.
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button className="btn btn-ghost btn-sm" style={{ height: 42 }} disabled type="button">
          <Icon name="qr" size={15} /> Download <NewTag />
        </button>
        <button className="btn btn-ghost btn-sm" style={{ height: 42 }} disabled type="button">
          Print sheet <NewTag />
        </button>
      </div>
    </div>
  );
}

const DEMO_COPY: Record<string, { title: string; body: string }> = {
  assign: {
    title: 'Assign a worker',
    body: 'Add a worker to this site’s roster with a shift pattern.',
  },
  bind: {
    title: 'Add a supervisor binding',
    body: 'Give a supervisor authority over check-ins and attendance here.',
  },
  pin: {
    title: 'Site location',
    body: 'Set the check-in pin + radius. A wrong pin silently blocks check-ins.',
  },
};
function DemoForm({ kind, onClose }: { kind: 'assign' | 'bind' | 'pin'; onClose: () => void }) {
  const c = DEMO_COPY[kind]!;
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{c.title}</h3>
          <p>{c.body}</p>
        </div>
        <div className="modal-body">
          <div className="note-banner" style={{ margin: 0 }}>
            <Icon name="clock" size={17} />{' '}
            <SoonData>
              This write endpoint isn’t live yet — it turns on in the roster/binding write slice.
            </SoonData>
          </div>
        </div>
        <div className="modal-foot">
          <button
            className="btn btn-ghost btn-sm"
            style={{ height: 44, padding: '0 18px' }}
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
