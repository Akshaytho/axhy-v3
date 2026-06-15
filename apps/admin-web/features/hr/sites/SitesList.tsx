'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Icon } from '../../../components/ui/Icon';
import { Chip, StateChip } from '../../../components/ui/Chip';
import { Empty, DayMask } from '../../../components/ui/primitives';
import { fmtDate } from '../../../lib/format';
import type { SiteListItem } from '../data';

import { createSite } from './actions';

/**
 * Sites list — searchable roster of sites with an add-site flow.
 * @derives(master-plan §G)
 */
export function SitesList({ sites }: { sites: SiteListItem[] }) {
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const filtered = sites.filter(
    (s) =>
      !q ||
      s.name.toLowerCase().includes(q.toLowerCase()) ||
      (s.address ?? '').toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <div className="eyebrow">Operations</div>
          <h1 className="page-title">
            Sites <span className="count-chip">{sites.length} sites</span>
          </h1>
          <p className="page-sub">
            The cleaning sites you own. Open a site to manage its roster, supervisors and check-in
            QR.
          </p>
        </div>
        <div className="head-actions">
          <button className="btn btn-primary" onClick={() => setAdding(true)} type="button">
            <Icon name="plus" size={17} /> Add site
          </button>
        </div>
      </div>

      {adding && <AddSiteModal onClose={() => setAdding(false)} />}

      <div className="toolbar">
        <div className="field-search">
          <Icon name="search" size={17} />
          <input
            placeholder="Filter loaded sites by name or address…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Empty icon="search" title="No sites match" body="Try a different name or address." />
      ) : (
        <>
          <div className="tbl-wrap responsive">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>State</th>
                  <th>Location</th>
                  <th>Workdays</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} onClick={() => (window.location.href = `/hr/sites/${s.id}`)}>
                    <td>
                      <div className="row-name">
                        <span className="sc-icon" style={{ width: 34, height: 34 }}>
                          <Icon name="building" size={17} />
                        </span>
                        <div>
                          <div className="cell-primary">{s.name}</div>
                          <div className="cell-sub">{s.address || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <StateChip state={s.state} sm />
                    </td>
                    <td>
                      {s.latitude ? (
                        <Chip tone="ok" sm>
                          Geocoded
                        </Chip>
                      ) : (
                        <Chip tone="warn" sm>
                          No location
                        </Chip>
                      )}
                    </td>
                    <td>
                      <DayMask mask={s.workdays} />
                    </td>
                    <td className="cell-sub">{fmtDate(s.createdAt)}</td>
                    <td className="chev-cell">
                      <Icon name="chevR" size={16} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mcard-list">
            {filtered.map((s) => (
              <Link key={s.id} href={`/hr/sites/${s.id}`} className="mcard">
                <span className="sc-icon" style={{ width: 36, height: 36 }}>
                  <Icon name="building" size={18} />
                </span>
                <div className="mc-main">
                  <div className="mc-title">{s.name}</div>
                  <div className="mc-sub">
                    <StateChip state={s.state} sm /> <DayMask mask={s.workdays} />
                  </div>
                </div>
                <Icon name="chevR" size={16} className="dim" />
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// Site workday alphabet — Sunday is 'U' (per AdminCreateSiteInput regex).
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'U'];

function AddSiteModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [workdays, setWorkdays] = useState<string[]>('MTWTFS_'.split(''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleDay = (i: number) =>
    setWorkdays((w) =>
      w.map((d, idx) => (idx === i ? (d === '_' ? (DAY_LETTERS[i] ?? '_') : '_') : d)),
    );

  const valid = name.trim().length > 0;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const latNum = lat.trim() ? Number(lat) : undefined;
    const lngNum = lng.trim() ? Number(lng) : undefined;
    if ((lat.trim() && Number.isNaN(latNum!)) || (lng.trim() && Number.isNaN(lngNum!))) {
      setError('Latitude and longitude must be numbers.');
      setBusy(false);
      return;
    }
    try {
      await createSite({
        name: name.trim(),
        address: address.trim() || undefined,
        latitude: latNum,
        longitude: lngNum,
        workdays: workdays.join(''),
      });
      router.refresh();
      onClose();
    } catch {
      setBusy(false);
      setError('Could not create this site. Please check the details and try again.');
    }
  };

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Add a site</h3>
          <p>Create a new cleaning site. It starts as a draft until you activate it.</p>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div>
              <label className="field-label">Site name</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Apollo Hospital — Jubilee Hills"
                autoFocus
              />
            </div>
            <div>
              <label className="field-label">
                Address <span className="muted">(optional)</span>
              </label>
              <textarea
                className="textarea"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Street, area, city, PIN"
              />
            </div>
            <div className="form-row2">
              <div>
                <label className="field-label">
                  Latitude <span className="muted">(optional)</span>
                </label>
                <input
                  className="input mono"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  placeholder="17.431500"
                />
              </div>
              <div>
                <label className="field-label">
                  Longitude <span className="muted">(optional)</span>
                </label>
                <input
                  className="input mono"
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  placeholder="78.408900"
                />
              </div>
            </div>
            <div>
              <label className="field-label">Workdays</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {DAY_LABELS.map((l, i) => {
                  const on = workdays[i] !== '_';
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggleDay(i)}
                      className="filter-pill"
                      style={{
                        flexDirection: 'column',
                        height: 56,
                        width: 56,
                        gap: 2,
                        padding: 0,
                        background: on ? 'var(--ok-soft)' : 'var(--card)',
                        borderColor: on ? 'var(--ok)' : 'var(--card-edge-2)',
                        color: on ? '#2f5a3c' : 'var(--ink-3)',
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{l}</span>
                    </button>
                  );
                })}
              </div>
              <div className="helper mono">
                Pattern: {workdays.join('')}{' '}
                <span style={{ fontFamily: 'var(--font)' }}>(Sun = U)</span>
              </div>
            </div>
          </div>
          {error && (
            <p className="field-err" style={{ marginTop: 10 }}>
              <Icon name="alert" size={13} /> {error}
            </p>
          )}
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
                <span className="spin" /> Creating…
              </>
            ) : (
              'Create site'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
