'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Icon } from '../../../components/ui/Icon';
import { Chip } from '../../../components/ui/Chip';
import { Avatar, Empty } from '../../../components/ui/primitives';
import { fmtDate, fmtDateTime } from '../../../lib/format';
import type { UpdateRow } from '../data';

import {
  UPDATE_KINDS,
  updateKindLabel,
  DEFAULT_UPDATE_TEMPLATES,
  type UpdateTemplate,
} from './catalog';
import { createUpdate } from './actions';

type Supervisor = { userId: string; name: string };

/**
 * Updates screen — compose updates to supervisors and review sent ones.
 * @derives(master-plan §G)
 */
export function UpdatesScreen({
  updates,
  supervisors,
}: {
  updates: UpdateRow[];
  supervisors: Supervisor[];
}) {
  const [tab, setTab] = useState<'compose' | 'mine'>('compose');
  const [ackOf, setAckOf] = useState<UpdateRow | null>(null);

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <div className="eyebrow">Company · Updates</div>
          <h1 className="page-title">Updates</h1>
          <p className="page-sub">
            Short broadcasts to your supervisors — policy reminders, schedule notes, announcements.
          </p>
        </div>
      </div>

      <div className="toolbar">
        <div className="seg">
          <button
            className={tab === 'compose' ? 'on' : ''}
            onClick={() => {
              setTab('compose');
              setAckOf(null);
            }}
            type="button"
          >
            Compose
          </button>
          <button
            className={tab === 'mine' ? 'on' : ''}
            onClick={() => {
              setTab('mine');
              setAckOf(null);
            }}
            type="button"
          >
            My updates {updates.length > 0 && <span className="count-chip">{updates.length}</span>}
          </button>
        </div>
      </div>

      {tab === 'compose' ? (
        <ComposeUpdate supervisors={supervisors} />
      ) : ackOf ? (
        <AckReport u={ackOf} supervisors={supervisors} onBack={() => setAckOf(null)} />
      ) : (
        <MyUpdates updates={updates} onOpen={setAckOf} />
      )}
    </div>
  );
}

function ComposeUpdate({ supervisors }: { supervisors: Supervisor[] }) {
  const router = useRouter();
  const hasSites = supervisors.length > 0;
  const [kind, setKind] = useState('GENERAL');
  const [content, setContent] = useState('');
  const [audience, setAudience] = useState<'all' | 'one'>('all');
  const [target, setTarget] = useState(supervisors[0]?.userId ?? '');
  const [ackReq, setAckReq] = useState(false);
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // Templates persist in localStorage (client convenience). SSR-safe: start
  // from defaults, then hydrate from storage after mount.
  const [templates, setTemplates] = useState<UpdateTemplate[]>(DEFAULT_UPDATE_TEMPLATES);
  useEffect(() => {
    try {
      const s = localStorage.getItem('axhy_update_templates');
      if (s) setTemplates(JSON.parse(s));
    } catch {
      /* ignore */
    }
  }, []);
  const saveTemplates = (next: UpdateTemplate[]) => {
    setTemplates(next);
    try {
      localStorage.setItem('axhy_update_templates', JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  const insertTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (t) {
      setKind(t.kind);
      setContent(t.content);
    }
  };
  const saveAsTemplate = () => {
    if (!content.trim()) return;
    saveTemplates([
      ...templates,
      { id: 'tpl_' + content.length + '_' + templates.length, kind, content: content.trim() },
    ]);
    setOkMsg('Saved as template.');
  };

  const valid = content.trim().length > 0 && (audience === 'all' || !!target);

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    setOkMsg(null);
    try {
      await createUpdate({
        kind,
        content: content.trim(),
        audience,
        targetSupervisorId: audience === 'one' ? target : null,
        acknowledgmentRequired: ackReq,
        acknowledgmentPhrase: ackReq && hint.trim() ? hint.trim() : null,
      });
      setContent('');
      setAckReq(false);
      setHint('');
      setOkMsg('Published to supervisors.');
      router.refresh();
    } catch {
      setError('Could not publish this update. Please try again.');
    }
    setBusy(false);
  };

  return (
    <div className="compose-layout">
      <div className="compose-main">
        <div className="form-grid" style={{ maxWidth: 'none' }}>
          <div>
            <label className="field-label">Type</label>
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
              {UPDATE_KINDS.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <p className="helper">
              This is what supervisors see as the title — there&rsquo;s no separate title field.
            </p>
          </div>

          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <label className="field-label" style={{ marginBottom: 0 }}>
                Message
              </label>
              <select
                className="filter-pill"
                style={{ appearance: 'auto', height: 30, fontSize: 12 }}
                value=""
                onChange={(e) => {
                  insertTemplate(e.target.value);
                  e.target.value = '';
                }}
              >
                <option value="">Insert template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {updateKindLabel(t.kind)}: {t.content.slice(0, 32)}…
                  </option>
                ))}
              </select>
            </div>
            <textarea
              className="textarea"
              style={{ minHeight: 120, marginTop: 7 }}
              maxLength={2000}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your update to supervisors…"
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p className="helper" style={{ margin: 0 }}>
                {content.length} / 2000
              </p>
              <button
                className="btn btn-ghost btn-sm"
                style={{ height: 30 }}
                disabled={!content.trim()}
                onClick={saveAsTemplate}
                type="button"
              >
                <Icon name="copy" size={13} /> Save as template
              </button>
            </div>
          </div>

          <div>
            <label className="field-label">Audience</label>
            <div className="audience-opts">
              <button
                type="button"
                className={`aud-opt ${audience === 'all' ? 'on' : ''}`}
                onClick={() => setAudience('all')}
              >
                <Icon name="users" size={18} />
                <div>
                  <div className="ao-t">Company-wide</div>
                  <div className="ao-s">All supervisors</div>
                </div>
              </button>
              <button
                type="button"
                className={`aud-opt ${audience === 'one' ? 'on' : ''}`}
                disabled={!hasSites}
                onClick={() => hasSites && setAudience('one')}
              >
                <Icon name="userCog" size={18} />
                <div>
                  <div className="ao-t">One supervisor</div>
                  <div className="ao-s">{hasSites ? 'Pick a person' : 'No supervisors yet'}</div>
                </div>
              </button>
            </div>
            {audience === 'one' && hasSites && (
              <select
                className="input"
                style={{ marginTop: 10 }}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                {supervisors.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name}
                  </option>
                ))}
              </select>
            )}
            {!hasSites && (
              <p className="helper">
                No supervisors on your sites yet — company-wide is still allowed.
              </p>
            )}
          </div>

          <div>
            <label className="field-label">Require acknowledgement</label>
            <button
              type="button"
              className={`switch-row ${ackReq ? 'on' : ''}`}
              onClick={() => setAckReq((v) => !v)}
            >
              <span className={`switch ${ackReq ? 'on' : ''}`}>
                <span className="knob" />
              </span>
              <span>
                {ackReq
                  ? 'Supervisors must reply in their own words (≥ 5 words) before this clears.'
                  : 'Off — supervisors can read without replying.'}
              </span>
            </button>
            {ackReq && (
              <div style={{ marginTop: 12 }}>
                <label className="field-label">
                  Prompt hint <span className="muted">(optional)</span>
                </label>
                <input
                  className="input"
                  value={hint}
                  onChange={(e) => setHint(e.target.value)}
                  placeholder="e.g. Confirm you'll brief your morning shift"
                />
                <p className="helper">
                  Just context — supervisors write their own words. It&rsquo;s not a phrase they
                  have to match.
                </p>
              </div>
            )}
          </div>

          {error && (
            <p className="field-err">
              <Icon name="alert" size={13} /> {error}
            </p>
          )}
          {okMsg && (
            <p
              className="helper"
              style={{ color: 'var(--ok)', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Icon name="check" size={14} /> {okMsg}
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 4 }}>
            <button
              className="btn btn-primary"
              disabled={!valid || busy}
              onClick={submit}
              type="button"
            >
              {busy ? (
                <>
                  <span className="spin" /> Publishing…
                </>
              ) : (
                <>
                  <Icon name="send" size={16} /> Publish
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <aside className="compose-rail">
        <div className="rail-label">Supervisor preview</div>
        <div className="update-preview">
          <div className="up-kind">
            <Icon name="megaphone" size={14} /> {updateKindLabel(kind)}
          </div>
          <div className="up-body">
            {content || <span className="dim">Your message will appear here…</span>}
          </div>
          {ackReq && (
            <div className="up-ack">
              <Icon name="check" size={13} /> Acknowledgement required
            </div>
          )}
          <div className="up-foot">
            {audience === 'all'
              ? 'To all supervisors'
              : 'To ' + (supervisors.find((s) => s.userId === target)?.name ?? 'one supervisor')}
          </div>
        </div>
      </aside>
    </div>
  );
}

function ackChip(u: UpdateRow) {
  if (!u.acknowledgmentRequired)
    return (
      <Chip tone="neutral" sm dot={false}>
        No ack needed
      </Chip>
    );
  if (u.targetSupervisorId)
    return u.acknowledgedBy ? (
      <Chip tone="ok" sm>
        Acknowledged
      </Chip>
    ) : (
      <Chip tone="warn" sm>
        Awaiting ack
      </Chip>
    );
  return u.acknowledgedBy ? (
    <Chip tone="neutral" sm dot={false}>
      Last acked by 1
    </Chip>
  ) : (
    <Chip tone="neutral" sm dot={false}>
      No acks yet
    </Chip>
  );
}

function MyUpdates({ updates, onOpen }: { updates: UpdateRow[]; onOpen: (u: UpdateRow) => void }) {
  if (updates.length === 0)
    return (
      <Empty
        icon="megaphone"
        title="You haven't published any updates"
        body="Updates you send to supervisors will list here."
      />
    );
  return (
    <>
      <div className="tbl-wrap responsive">
        <table className="tbl">
          <thead>
            <tr>
              <th>Type</th>
              <th>Message</th>
              <th>Audience</th>
              <th>Ack</th>
              <th>Published</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {updates.map((u) => (
              <tr key={u.id} onClick={() => onOpen(u)}>
                <td>
                  <span className="cell-primary">{updateKindLabel(u.kind)}</span>
                  <div className="cell-sub mono">{u.kind}</div>
                </td>
                <td className="cell-sub" style={{ maxWidth: '34ch' }}>
                  {u.content}
                </td>
                <td className="cell-sub">
                  {u.targetSupervisorId ? (
                    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      <Icon name="userCog" size={14} /> {u.targetSupervisorName ?? 'One supervisor'}
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                      <Icon name="users" size={14} /> Company-wide
                    </span>
                  )}
                </td>
                <td>{ackChip(u)}</td>
                <td className="cell-mono">{fmtDate(u.createdAt)}</td>
                <td className="chev-cell">
                  <Icon name="chevR" size={16} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mcard-list">
        {updates.map((u) => (
          <div key={u.id} className="mcard" onClick={() => onOpen(u)} style={{ cursor: 'pointer' }}>
            <span className="act-icon">
              <Icon name="megaphone" size={16} />
            </span>
            <div className="mc-main">
              <div className="mc-title">{updateKindLabel(u.kind)}</div>
              <div className="mc-sub">
                <span>{u.content.slice(0, 40)}…</span>
                {ackChip(u)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function AckReport({
  u,
  supervisors,
  onBack,
}: {
  u: UpdateRow;
  supervisors: Supervisor[];
  onBack: () => void;
}) {
  const targeted = !!u.targetSupervisorId;
  return (
    <div style={{ maxWidth: 720 }}>
      <button
        className="btn btn-ghost btn-sm"
        onClick={onBack}
        style={{ marginBottom: 16 }}
        type="button"
      >
        <Icon name="arrowLeft" size={15} /> Back to updates
      </button>

      <div className="panel" style={{ padding: 20, marginBottom: 18 }}>
        <div className="up-kind" style={{ marginBottom: 10 }}>
          <Icon name="megaphone" size={14} /> {updateKindLabel(u.kind)}
        </div>
        <div style={{ fontSize: 15, lineHeight: 1.55 }}>{u.content}</div>
        <div className="detail-meta" style={{ marginTop: 14 }}>
          <span className="dm">
            {targeted ? (
              <>
                <Icon name="userCog" size={15} /> {u.targetSupervisorName ?? 'One supervisor'}
              </>
            ) : (
              <>
                <Icon name="users" size={15} /> Company-wide
              </>
            )}
          </span>
          <span className="dm">
            <Icon name="calendar" size={15} /> {fmtDateTime(u.createdAt)}
          </span>
        </div>
      </div>

      {!u.acknowledgmentRequired ? (
        <div className="note-banner">
          <Icon name="info" size={17} /> This update didn&rsquo;t require acknowledgement.
        </div>
      ) : targeted ? (
        <div className="panel" style={{ padding: 20 }}>
          <div className="rec-label" style={{ marginBottom: 12 }}>
            Acknowledged (1 of 1)
          </div>
          {u.acknowledgedBy ? (
            <div style={{ display: 'flex', gap: 12 }}>
              <Avatar name={u.acknowledgedByName ?? '—'} />
              <div style={{ flex: 1 }}>
                <div className="cell-primary">{u.acknowledgedByName ?? u.targetSupervisorName}</div>
                {u.acknowledgmentPhrase && (
                  <div className="ack-quote">“{u.acknowledgmentPhrase}”</div>
                )}
                <div className="cell-sub mono" style={{ marginTop: 6 }}>
                  {u.acknowledgedAt ? fmtDateTime(u.acknowledgedAt) : ''}
                </div>
              </div>
            </div>
          ) : (
            <p className="dim">Not acknowledged yet.</p>
          )}
        </div>
      ) : (
        <>
          <div className="effect-note" style={{ alignItems: 'flex-start' }}>
            <Icon name="info" size={17} style={{ marginTop: 1 }} />
            <div>
              A full who-acknowledged report needs a per-supervisor ack table that isn&rsquo;t built
              yet. Today the system stores the most recent acknowledgement for a company-wide
              update, so the list below is the <b>design preview</b> of what ships when that table
              lands. <b>Targeted updates show correctly today.</b>
            </div>
          </div>
          <AckMatrixPreview u={u} supervisors={supervisors} />
        </>
      )}
    </div>
  );
}

function AckMatrixPreview({ u, supervisors }: { u: UpdateRow; supervisors: Supervisor[] }) {
  // Design preview: the one stored acknowledger (if any) shows acked; the rest pending.
  const ackedName = u.acknowledgedByName;
  const acked = ackedName
    ? [
        {
          name: ackedName,
          phrase: u.acknowledgmentPhrase ?? 'Understood, will brief my team',
          at: u.acknowledgedAt ?? u.createdAt,
        },
      ]
    : [];
  const pending = supervisors.filter((s) => s.name !== ackedName);
  return (
    <div style={{ marginTop: 18, opacity: 0.92 }}>
      <div className="rec-label" style={{ marginBottom: 10 }}>
        {acked.length} of {supervisors.length} acknowledged{' '}
        <span className="dim" style={{ fontWeight: 400 }}>
          · design preview
        </span>
      </div>
      {acked.length > 0 && (
        <div className="panel" style={{ marginBottom: 14 }}>
          {acked.map((a, i) => (
            <div key={i} className="activity-row" style={{ cursor: 'default' }}>
              <Avatar name={a.name} size="sm" />
              <div className="act-body">
                <div className="act-text" style={{ fontWeight: 600 }}>
                  {a.name}
                </div>
                <div className="ack-quote" style={{ marginTop: 4 }}>
                  “{a.phrase}”
                </div>
              </div>
              <span className="act-time">{fmtDateTime(a.at)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="rec-label" style={{ marginBottom: 10 }}>
        Not yet acknowledged
      </div>
      <div className="panel">
        {pending.map((p, i) => (
          <div key={i} className="activity-row" style={{ cursor: 'default' }}>
            <Avatar name={p.name} size="sm" neutral />
            <div className="act-body">
              <div className="act-text">{p.name}</div>
              <div className="act-time">waiting since {fmtDateTime(u.createdAt)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
