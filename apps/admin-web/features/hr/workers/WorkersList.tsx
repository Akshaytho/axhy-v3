'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Icon } from '../../../components/ui/Icon';
import { Chip, StateChip } from '../../../components/ui/Chip';
import { Avatar, Empty } from '../../../components/ui/primitives';
import { fmtDate } from '../../../lib/format';
import type { WorkerListItem } from '../data';

import { createWorker } from './actions';

// The 15-state worker lifecycle drives the filter chips + STATE column (real,
// from GET /admin/workers). Order matches v6.
const STATE_FILTERS: [string, string][] = [
  ['ACTIVE', 'Active'],
  ['AT_RISK', 'At risk'],
  ['ON_LEAVE', 'On leave'],
  ['DOC_PENDING', 'Doc pending'],
  ['PENDING_ACTIVATION', 'Activating'],
  ['ON_SUSPENSION', 'Suspended'],
  ['TERMINATION_PENDING', 'Terminating'],
  ['TERMINATED', 'Terminated'],
];
const NOT_ON_APP = ['PENDING_ACTIVATION', 'INVITED'];
/** Resigned/anonymised workers render "Terminated" + hide PII (anon: phone prefix or terminal state). */
const isResigned = (w: WorkerListItem) => w.anonymizedPhone || w.state === 'TERMINATED';

/**
 * Workers list — searchable, state-filtered worker roster with add-worker flow.
 * @derives(master-plan §G)
 */
export function WorkersList({ workers }: { workers: WorkerListItem[] }) {
  const [q, setQ] = useState('');
  const [states, setStates] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);

  const toggle = (s: string) =>
    setStates((arr) => (arr.includes(s) ? arr.filter((x) => x !== s) : [...arr, s]));

  const filtered = workers.filter(
    (w) =>
      (!q ||
        (w.name ?? '').toLowerCase().includes(q.toLowerCase()) ||
        (w.phone ?? '').includes(q)) &&
      (states.length === 0 || states.includes(w.state)),
  );

  // Subtitle counts, computed over the loaded page (v6 parity).
  const counts = {
    total: workers.length,
    suspended: workers.filter((w) => w.state === 'ON_SUSPENSION').length,
    leave: workers.filter((w) => w.state === 'ON_LEAVE').length,
    notActivated: workers.filter((w) => NOT_ON_APP.includes(w.state)).length,
  };

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <div className="eyebrow">People</div>
          <h1 className="page-title">
            Workers <span className="count-chip">{counts.total} workers</span>
          </h1>
          <p className="page-sub">
            {counts.total} workers · {counts.suspended} suspended · {counts.leave} on leave ·{' '}
            {counts.notActivated} not activated
          </p>
        </div>
        <div className="head-actions">
          <button className="btn btn-primary" onClick={() => setAdding(true)} type="button">
            <Icon name="userPlus" size={17} /> Add worker
          </button>
        </div>
      </div>

      {adding && <AddWorkerModal onClose={() => setAdding(false)} />}

      <div className="toolbar">
        <div className="field-search">
          <Icon name="search" size={17} />
          <input
            placeholder="Search by name or phone…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>
      <div className="filter-chips">
        {STATE_FILTERS.map(([s, label]) => (
          <button
            key={s}
            className={`fchip ${states.includes(s) ? 'on' : ''}`}
            onClick={() => toggle(s)}
          >
            {label}
          </button>
        ))}
        {states.length > 0 && (
          <button className="fchip clear" onClick={() => setStates([])}>
            Clear
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <Empty
          icon="search"
          title="No workers match"
          body="Try a different name, phone, or state filter."
        />
      ) : (
        <>
          <div className="tbl-wrap responsive">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Worker</th>
                  <th>Phone</th>
                  <th>State</th>
                  <th>Site</th>
                  <th>Added</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((w) => {
                  const resigned = isResigned(w);
                  return (
                    <tr
                      key={w.workerId}
                      onClick={() => (window.location.href = `/hr/workers/${w.workerId}`)}
                    >
                      <td>
                        <div className="row-name">
                          <Avatar name={w.name ?? '?'} size="sm" neutral={resigned} />
                          <div>
                            <div
                              className="cell-primary"
                              style={{ display: 'flex', alignItems: 'center', gap: 7 }}
                            >
                              {w.name ?? '—'}
                              {NOT_ON_APP.includes(w.state) && (
                                <span className="app-dot" title="Not on the app yet" />
                              )}
                            </div>
                            <div className="cell-sub mono">{w.workerId.slice(0, 8)}</div>
                          </div>
                        </div>
                      </td>
                      <td className="cell-mono">
                        {resigned ? <span className="dim">Hidden</span> : w.phone}
                      </td>
                      <td>
                        {resigned ? (
                          <Chip tone="neutral" sm>
                            Terminated
                          </Chip>
                        ) : (
                          <StateChip state={w.state} sm />
                        )}
                      </td>
                      <td className="cell-sub">{w.primarySite?.name ?? '—'}</td>
                      <td className="cell-sub">{fmtDate(w.createdAt)}</td>
                      <td className="chev-cell">
                        <Icon name="chevR" size={16} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mcard-list">
            {filtered.map((w) => {
              const resigned = isResigned(w);
              return (
                <Link key={w.workerId} href={`/hr/workers/${w.workerId}`} className="mcard">
                  <Avatar name={w.name ?? '?'} size="sm" neutral={resigned} />
                  <div className="mc-main">
                    <div
                      className="mc-title"
                      style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      {w.name ?? '—'}
                      {NOT_ON_APP.includes(w.state) && <span className="app-dot" />}
                    </div>
                    <div className="mc-sub">
                      <span className="mono">{resigned ? 'Hidden' : w.phone}</span>
                      {resigned ? (
                        <Chip tone="neutral" sm>
                          Terminated
                        </Chip>
                      ) : (
                        <StateChip state={w.state} sm />
                      )}
                    </div>
                  </div>
                  <Icon name="chevR" size={16} className="dim" />
                </Link>
              );
            })}
          </div>
          <p className="helper" style={{ marginTop: 12 }}>
            Filtering the loaded page. A grey dot marks workers not on the app yet.
          </p>
        </>
      )}
    </div>
  );
}

function AddWorkerModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [salary, setSalary] = useState('18000');
  const [lang, setLang] = useState('hi');
  const [ifsc, setIfsc] = useState('');
  const [acct, setAcct] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid =
    name.trim().length > 1 && phone.replace(/\D/g, '').length >= 10 && Number(salary) > 0;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await createWorker({
        name: name.trim(),
        phone: '+91' + phone.replace(/\D/g, ''),
        baseSalaryPaise: Math.round(Number(salary) * 100),
        preferredLanguage: lang,
        bankIfsc: ifsc.trim() || undefined,
        bankAcct: acct.trim() || undefined,
      });
      router.refresh();
      onClose();
    } catch {
      setBusy(false);
      setError('Could not add this worker. Check the phone isn’t already registered.');
    }
  };

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Add worker</h3>
          <p>
            Creates the worker as a draft. They verify their phone to finish joining; assign them to
            a site from the site page after that.
          </p>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="form-row2">
              <div>
                <label className="field-label">Full name</label>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Asha Devi"
                  autoFocus
                />
              </div>
              <div>
                <label className="field-label">Phone</label>
                <div className="input-prefix">
                  <span className="pfx">+91</span>
                  <input
                    className="mono"
                    inputMode="numeric"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="98765 43210"
                  />
                </div>
              </div>
            </div>
            <div className="form-row2">
              <div>
                <label className="field-label">Base salary / month</label>
                <div className="input-prefix">
                  <span className="pfx">Rs</span>
                  <input
                    className="mono"
                    inputMode="numeric"
                    value={salary}
                    onChange={(e) => setSalary(e.target.value)}
                  />
                </div>
                <div className="helper">Stored as paise (×100) on submit.</div>
              </div>
              <div>
                <label className="field-label">Preferred language</label>
                <select className="input" value={lang} onChange={(e) => setLang(e.target.value)}>
                  <option value="hi">हिन्दी — Hindi</option>
                  <option value="te">తెలుగు — Telugu</option>
                  <option value="en">English</option>
                </select>
              </div>
            </div>
            <div className="form-row2">
              <div>
                <label className="field-label">
                  Bank IFSC <span className="muted">(optional)</span>
                </label>
                <input
                  className="input mono"
                  value={ifsc}
                  onChange={(e) => setIfsc(e.target.value.toUpperCase())}
                  placeholder="HDFC0001234"
                />
              </div>
              <div>
                <label className="field-label">
                  Bank account <span className="muted">(optional)</span>
                </label>
                <input
                  className="input mono"
                  value={acct}
                  onChange={(e) => setAcct(e.target.value)}
                  placeholder="50100…"
                />
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
                <span className="spin" /> Adding…
              </>
            ) : (
              'Add worker'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
