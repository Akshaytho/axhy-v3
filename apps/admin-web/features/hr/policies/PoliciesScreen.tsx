'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Icon } from '../../../components/ui/Icon';
import { Chip } from '../../../components/ui/Chip';
import { Empty } from '../../../components/ui/primitives';
import type { PolicyRow, PolicyHistoryRow } from '../data';

import { POLICY_CATALOG, fmtPolicyVal, fmtHistVal, type PolicyMeta } from './catalog';
import { setPolicyValue, fetchPolicyHistory } from './actions';

type Merged = { meta: PolicyMeta; row: PolicyRow };

const LANG_OPTION_LABEL: Record<string, string> = {
  hi: 'हिन्दी — Hindi',
  te: 'తెలుగు — Telugu',
  en: 'English',
};

/**
 * HR policies screen: lists policy values from the catalog and edits them.
 * @derives(master-plan §G)
 */
export function PoliciesScreen({ policies }: { policies: PolicyRow[] }) {
  const byKey = new Map(policies.map((p) => [p.key, p]));
  // Catalog order, only rows the backend actually returned.
  const rows: Merged[] = POLICY_CATALOG.filter((m) => byKey.has(m.key)).map((meta) => ({
    meta,
    row: byKey.get(meta.key)!,
  }));

  const [editing, setEditing] = useState<Merged | null>(null);
  const [history, setHistory] = useState<Merged | null>(null);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Company</div>
          <h1 className="page-title">Policies</h1>
          <p className="page-sub">
            Company rules for queues, workers, AI and notifications. Changes are append-only and
            never deleted.
          </p>
        </div>
      </div>

      <div className="effect-note" style={{ marginBottom: 18 }}>
        <Icon name="clock" size={16} /> Policy changes take effect <b>&nbsp;tomorrow</b>, not
        immediately.
      </div>

      {rows.length === 0 ? (
        <Empty
          icon="bookOpen"
          title="No policies set yet"
          body="Company rules appear here once they're configured."
        />
      ) : (
        <div className="panel">
          {rows.map(({ meta, row }) => (
            <div key={meta.key} className="policy-row">
              <div>
                <div className="pr-name">
                  {meta.label} <span className="policy-cat">{meta.category}</span>
                  {!row.editable && (
                    <Chip tone="neutral" sm dot={false}>
                      Owner-only
                    </Chip>
                  )}
                </div>
                <div className="pr-hint">{meta.hint}</div>
                <div
                  className="mono"
                  style={{ fontSize: 10.5, color: 'var(--ink-4)', marginTop: 6 }}
                >
                  {meta.key}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="pr-val">{fmtPolicyVal(meta, row.value)}</span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setHistory({ meta, row })}
                  title="History"
                  type="button"
                >
                  <Icon name="history" size={14} />
                </button>
                {row.editable ? (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setEditing({ meta, row })}
                    type="button"
                  >
                    <Icon name="edit" size={14} /> Edit
                  </button>
                ) : (
                  <button
                    className="btn btn-ghost btn-sm"
                    disabled
                    title="Owner-only"
                    type="button"
                  >
                    <Icon name="lock" size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && <PolicyEditModal item={editing} onClose={() => setEditing(null)} />}
      {history && <PolicyHistoryModal item={history} onClose={() => setHistory(null)} />}
    </div>
  );
}

function PolicyEditModal({ item, onClose }: { item: Merged; onClose: () => void }) {
  const { meta, row } = item;
  const router = useRouter();
  const [val, setVal] = useState<unknown>(row.value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await setPolicyValue(meta.key, val, row.category);
      router.refresh();
      onClose();
    } catch {
      setBusy(false);
      setError('Could not save this change. You may not have permission for this rule.');
    }
  };

  let control: React.ReactNode;
  if (meta.type === 'boolean') {
    const on = Boolean(val);
    control = (
      <button type="button" className={`switch-row ${on ? 'on' : ''}`} onClick={() => setVal(!on)}>
        <span className={`switch ${on ? 'on' : ''}`}>
          <span className="knob" />
        </span>
        <span>{on ? 'On' : 'Off'}</span>
      </button>
    );
  } else if (meta.type === 'select') {
    control = (
      <select
        className="input"
        value={String(val)}
        onChange={(e) => setVal(e.target.value)}
        autoFocus
      >
        {(meta.options ?? []).map((o) => (
          <option key={o} value={o}>
            {LANG_OPTION_LABEL[o] ?? o}
          </option>
        ))}
      </select>
    );
  } else if (meta.type === 'list') {
    const text = Array.isArray(val) ? val.join(', ') : String(val ?? '');
    control = (
      <input
        className="input mono"
        value={text}
        onChange={(e) =>
          setVal(
            e.target.value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
        autoFocus
      />
    );
  } else if (meta.type === 'bytes') {
    control = (
      <div className="input-prefix">
        <input
          className="mono"
          inputMode="numeric"
          value={Math.round((Number(val) || 0) / 1048576)}
          onChange={(e) => setVal((Number(e.target.value) || 0) * 1048576)}
          autoFocus
        />
        <span
          className="pfx"
          style={{ borderLeft: '1px solid var(--card-edge)', borderRight: 'none' }}
        >
          MB
        </span>
      </div>
    );
  } else if (meta.type === 'number') {
    control = (
      <div className="input-prefix">
        <input
          className="mono"
          inputMode="numeric"
          value={String(val ?? '')}
          onChange={(e) => setVal(Number(e.target.value))}
          autoFocus
        />
        {meta.unit && (
          <span
            className="pfx"
            style={{ borderLeft: '1px solid var(--card-edge)', borderRight: 'none' }}
          >
            {meta.unit}
          </span>
        )}
      </div>
    );
  } else {
    control = (
      <input
        className="input mono"
        value={String(val ?? '')}
        onChange={(e) => setVal(e.target.value)}
        autoFocus
      />
    );
  }

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{meta.label}</h3>
          <p>{meta.hint}</p>
        </div>
        <div className="modal-body">
          <label className="field-label">New value</label>
          {control}
          <div className="effect-note" style={{ marginTop: 14 }}>
            <Icon name="clock" size={16} /> Takes effect <b>&nbsp;tomorrow</b>. The current value
            stays in effect today.
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
          <button className="btn btn-primary" disabled={busy} onClick={submit} type="button">
            {busy ? (
              <>
                <span className="spin" /> Saving…
              </>
            ) : (
              'Save change'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function PolicyHistoryModal({ item, onClose }: { item: Merged; onClose: () => void }) {
  const { meta, row } = item;
  const [rows, setRows] = useState<PolicyHistoryRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetchPolicyHistory(meta.key)
      .then((h) => live && setRows(h))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [meta.key]);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{meta.label} — history</h3>
          <p>Append-only. Setting a new value adds a row; nothing is ever deleted.</p>
        </div>
        <div className="modal-body">
          {failed ? (
            <div className="note-banner">
              <Icon name="info" size={17} /> Couldn’t load history. Current value:{' '}
              <b>&nbsp;{fmtPolicyVal(meta, row.value)}</b>.
            </div>
          ) : rows === null ? (
            <div className="note-banner">
              <span className="spin" /> &nbsp;Loading history…
            </div>
          ) : rows.length === 0 ? (
            <div className="note-banner">
              <Icon name="info" size={17} /> No changes recorded yet. Current value:{' '}
              <b>&nbsp;{fmtPolicyVal(meta, row.value)}</b>.
            </div>
          ) : (
            <div className="policy-hist">
              {rows.map((r, i) => (
                <div key={i} className="ph-row">
                  <div className="ph-dot" />
                  <div className="ph-body">
                    <div className="ph-val">
                      {fmtHistVal(meta, r.value)}{' '}
                      {i === 0 && (
                        <Chip tone="ok" sm>
                          Current
                        </Chip>
                      )}
                    </div>
                    <div className="ph-meta">
                      {r.previousValueSnapshot != null
                        ? `was ${fmtHistVal(meta, r.previousValueSnapshot)} · `
                        : 'initial · '}
                      {r.setByName} · {fmtDate(r.setAt)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
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
