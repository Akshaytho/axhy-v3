'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Icon } from '../../../components/ui/Icon';
import { Chip } from '../../../components/ui/Chip';
import { IdPill } from '../../../components/ui/IdPill';
import { Avatar, Empty, StatusChip } from '../../../components/ui/primitives';
import { rupees, fmtDate } from '../../../lib/format';
import type { TeamMember, TeamMemberDetail } from '../data';

import { inviteSupervisor, fetchTeamMember, deactivateMember } from './actions';

function roleChip(role: string) {
  if (role === 'SUPERVISOR')
    return (
      <Chip tone="neutral" dot={false}>
        Supervisor
      </Chip>
    );
  return (
    <Chip tone="accent" dot={false}>
      {role === 'OWNER' ? 'Owner' : 'HR'}
    </Chip>
  );
}

/**
 * Team screen — HR/supervisor/owner roster with an invite-supervisor flow.
 * @derives(master-plan §G)
 */
export function TeamScreen({ members }: { members: TeamMember[] }) {
  const [inviting, setInviting] = useState(false);
  const [sel, setSel] = useState<TeamMemberDetail | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState<TeamMember | null>(null);

  const open = async (userId: string) => {
    setMenuFor(null);
    setBusyId(userId);
    try {
      setSel(await fetchTeamMember(userId));
    } catch {
      /* stay on list */
    }
    setBusyId(null);
  };

  if (sel) return <MemberDetail detail={sel} onBack={() => setSel(null)} />;

  const roleCell = (role: string) =>
    role === 'HR' ? (
      <Chip tone="accent" sm dot={false}>
        HR
      </Chip>
    ) : role === 'OWNER' ? (
      <Chip tone="accent" sm dot={false}>
        Owner
      </Chip>
    ) : (
      <Chip tone="neutral" sm dot={false}>
        Supervisor
      </Chip>
    );

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <div className="eyebrow">Company</div>
          <h1 className="page-title">
            Team <span className="count-chip">{members.length} members</span>
          </h1>
          <p className="page-sub">
            HR and supervisors in your company. You can invite supervisors; owners invite HR.
          </p>
        </div>
        <div className="head-actions">
          <button className="btn btn-primary" onClick={() => setInviting(true)} type="button">
            <Icon name="userPlus" size={17} /> Invite supervisor
          </button>
        </div>
      </div>

      {members.length === 0 ? (
        <Empty
          icon="users"
          title="No team members yet"
          body="HR and supervisors connected to your sites appear here."
        />
      ) : (
        <>
          <div className="tbl-wrap responsive">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th className="tnum">Sites</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => open(m.userId)}
                    style={{ cursor: 'pointer', opacity: busyId === m.userId ? 0.5 : 1 }}
                  >
                    <td>
                      <div className="row-name">
                        <Avatar name={m.name} />
                        <div>
                          <div className="cell-primary">
                            {m.name}
                            {m.isMe && (
                              <span className="dim" style={{ fontWeight: 400 }}>
                                {' '}
                                · you
                              </span>
                            )}
                          </div>
                          <div className="cell-sub mono">{m.userId.slice(0, 8)}</div>
                        </div>
                      </div>
                    </td>
                    <td className="cell-mono">{m.phone}</td>
                    <td>{roleCell(m.role)}</td>
                    <td className="tnum cell-mono">{m.sites}</td>
                    <td>
                      <StatusChip status={m.status} sm />
                    </td>
                    <td
                      className="chev-cell"
                      style={{ position: 'relative' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {m.role === 'SUPERVISOR' && !m.isMe ? (
                        <>
                          <button
                            className="icon-btn"
                            style={{ width: 30, height: 30 }}
                            onClick={() => setMenuFor(menuFor === m.id ? null : m.id)}
                            type="button"
                            aria-label="Member actions"
                          >
                            <Icon name="more" size={16} />
                          </button>
                          {menuFor === m.id && (
                            <div className="menu" style={{ minWidth: 196 }}>
                              <button
                                className="menu-item"
                                onClick={() => open(m.userId)}
                                type="button"
                              >
                                <Icon name="eye" size={16} /> View detail
                              </button>
                              <div className="menu-sep" />
                              <button
                                className="menu-item"
                                disabled
                                type="button"
                                title="Coming soon"
                              >
                                <Icon name="refresh" size={16} /> Resend invite
                                <span className="count-chip" style={{ marginLeft: 'auto' }}>
                                  Soon
                                </span>
                              </button>
                              <button
                                className="menu-item danger"
                                type="button"
                                onClick={() => {
                                  setMenuFor(null);
                                  setConfirmOff(m);
                                }}
                              >
                                <Icon name="ban" size={16} /> Deactivate
                              </button>
                            </div>
                          )}
                        </>
                      ) : (
                        <Icon name="chevR" size={16} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mcard-list">
            {members.map((m) => (
              <div
                key={m.id}
                className="mcard"
                onClick={() => open(m.userId)}
                style={{ cursor: 'pointer' }}
              >
                <Avatar name={m.name} />
                <div className="mc-main">
                  <div className="mc-title">
                    {m.name}
                    {m.isMe && <span className="dim"> · you</span>}
                  </div>
                  <div className="mc-sub">
                    <span className="mono">{m.phone}</span>
                    {m.role === 'HR' ? (
                      <Chip tone="accent" sm dot={false}>
                        HR
                      </Chip>
                    ) : (
                      <Chip tone="neutral" sm dot={false}>
                        {m.role === 'OWNER' ? 'Owner' : 'Supervisor'}
                      </Chip>
                    )}
                  </div>
                </div>
                <Icon name="chevR" size={16} className="dim" />
              </div>
            ))}
          </div>
        </>
      )}

      {inviting && <InviteModal onClose={() => setInviting(false)} />}
      {confirmOff && <DeactivateModal member={confirmOff} onClose={() => setConfirmOff(null)} />}
    </div>
  );
}

function MemberDetail({ detail, onBack }: { detail: TeamMemberDetail; onBack: () => void }) {
  const isOwnerSide = detail.role === 'HR' || detail.role === 'OWNER';
  return (
    <div className="page page-wide">
      <div className="crumb" style={{ marginBottom: 18 }}>
        <a onClick={onBack} style={{ cursor: 'pointer' }}>
          Team
        </a>
        <span className="sep">/</span>
        <span className="cur">{detail.name}</span>
      </div>

      <div className="detail-head">
        <Avatar name={detail.name} size="lg" />
        <div className="dh-main">
          <h1>
            {detail.name} {roleChip(detail.role)}
          </h1>
          <div className="detail-meta">
            <span className="dm mono">
              <Icon name="phone" size={15} /> {detail.phone}
            </span>
            <span className="dm">
              <StatusChip status={detail.status} sm />
            </span>
          </div>
          <div className="id-list">
            <IdPill label="User" value={detail.userId} />
          </div>
        </div>
      </div>

      <div className="kv-grid" style={{ marginTop: 18, marginBottom: 20 }}>
        <div className="kv">
          <div className="k">Monthly salary</div>
          <div className="v money">
            {detail.salaryPaise != null ? rupees(detail.salaryPaise) : '—'}
          </div>
        </div>
        <div className="kv">
          <div className="k">Bank account</div>
          <div className="v mono">{detail.bankAcctLast4 ? '••••' + detail.bankAcctLast4 : '—'}</div>
        </div>
      </div>

      <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>
        {isOwnerSide ? 'Sites owned' : 'Site bindings'}
      </h3>
      {isOwnerSide ? (
        detail.owns && detail.owns.length > 0 ? (
          <div className="tbl-wrap responsive">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Site</th>
                </tr>
              </thead>
              <tbody>
                {detail.owns.map((s, i) => (
                  <tr key={i} style={{ cursor: 'default' }}>
                    <td className="cell-primary">{s}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="building" title="No sites yet" body="This member doesn't own any sites." />
        )
      ) : detail.bindings && detail.bindings.length > 0 ? (
        <div className="tbl-wrap responsive">
          <table className="tbl">
            <thead>
              <tr>
                <th>Site</th>
                <th>Type</th>
                <th>From</th>
                <th>Until</th>
              </tr>
            </thead>
            <tbody>
              {detail.bindings.map((b, i) => (
                <tr key={i} style={{ cursor: 'default' }}>
                  <td className="cell-primary">{b.site}</td>
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
                  <td className="cell-mono">{fmtDate(b.from)}</td>
                  <td className="cell-mono">
                    {b.until ? fmtDate(b.until) : <span className="dim">Open</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          icon="userCog"
          title="No bindings"
          body="This supervisor isn't bound to any site yet."
        />
      )}
    </div>
  );
}

function DeactivateModal({ member, onClose }: { member: TeamMember; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await deactivateMember(member.userId);
      router.refresh();
      onClose();
    } catch {
      setBusy(false);
      setError('Could not deactivate this member. Please try again.');
    }
  };

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Deactivate {member.name}?</h3>
          <p>
            They lose app access immediately and their current sessions end. Their record and
            history stay — you can&rsquo;t delete a member, only deactivate.
          </p>
        </div>
        {error && (
          <div className="modal-body">
            <p className="field-err">
              <Icon name="alert" size={13} /> {error}
            </p>
          </div>
        )}
        <div className="modal-foot">
          <button
            className="btn btn-ghost btn-sm"
            style={{ height: 44, padding: '0 18px' }}
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button className="btn btn-reject" onClick={submit} disabled={busy} type="button">
            {busy ? (
              <>
                <span className="spin" /> Deactivating…
              </>
            ) : (
              <>
                <Icon name="ban" size={16} /> Deactivate
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = name.trim().length > 1 && phone.replace(/\D/g, '').length >= 10;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await inviteSupervisor(name, '+91' + phone.replace(/\D/g, ''));
      router.refresh();
      onClose();
    } catch {
      setBusy(false);
      setError('Could not send the invite. Check the phone number isn’t already a member.');
    }
  };

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Invite a supervisor</h3>
          <p>
            They get an invite to join AXHY and verify their phone. Assign sites to them after they
            join.
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
                  placeholder="e.g. Vijay Anand"
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
                <span className="spin" /> Sending…
              </>
            ) : (
              'Send invite'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
