'use client';

import { useState } from 'react';

import { Icon } from '../../../components/ui/Icon';
import { Chip } from '../../../components/ui/Chip';
import type { MeSettings, NotificationPrefs } from '../data';

import { updateNotificationPrefs, updateLocale } from './actions';

type Channel = keyof NotificationPrefs;

const CHANNELS: { k: Channel; label: string; sub: string }[] = [
  { k: 'push', label: 'Push', sub: 'Alerts on this device' },
  { k: 'whatsapp', label: 'WhatsApp', sub: 'Urgent items via WhatsApp' },
  { k: 'email', label: 'Email', sub: 'Daily summary by email' },
];

/**
 * Settings — notification channel prefs and locale for the signed-in HR user.
 * @derives(master-plan §G)
 */
export function SettingsScreen({ me }: { me: MeSettings }) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(me.notificationPrefs);
  const [locale, setLocale] = useState(me.user.locale);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOut, setConfirmOut] = useState(false);

  const flash = (msg: string) => {
    setError(null);
    setSaved(msg);
    setTimeout(() => setSaved((s) => (s === msg ? null : s)), 2200);
  };

  const togglePref = async (k: Channel) => {
    const next = { ...prefs, [k]: !prefs[k] };
    setPrefs(next);
    try {
      await updateNotificationPrefs({ [k]: next[k] });
      flash('Notification preferences saved');
    } catch {
      setPrefs((p) => ({ ...p, [k]: !next[k] })); // revert
      setSaved(null);
      setError('Could not save that change. Please try again.');
    }
  };

  const changeLocale = async (value: string) => {
    const prev = locale;
    setLocale(value);
    try {
      await updateLocale(value as 'en' | 'hi' | 'te');
      flash('Language updated');
    } catch {
      setLocale(prev);
      setSaved(null);
      setError('Could not update language. Please try again.');
    }
  };

  const signOut = async () => {
    try {
      await fetch('/api/auth/session', { method: 'DELETE' });
    } finally {
      window.location.assign('/login');
    }
  };

  const roleLabel =
    me.activeRole === 'OWNER' ? 'Owner' : me.activeRole === 'HR' ? 'HR' : me.activeRole;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Account</div>
          <h1 className="page-title">Settings</h1>
          <p className="page-sub">Your profile and how AXHY reaches you.</p>
        </div>
      </div>

      <div className="kv-grid" style={{ marginBottom: 24 }}>
        <div className="kv">
          <div className="k">Name</div>
          <div className="v">{me.user.name ?? '—'}</div>
        </div>
        <div className="kv">
          <div className="k">Phone</div>
          <div className="v mono">{me.user.phone}</div>
        </div>
        <div className="kv">
          <div className="k">Role</div>
          <div className="v">
            <Chip tone="accent" dot={false}>
              {roleLabel}
            </Chip>
          </div>
        </div>
        <div className="kv">
          <div className="k">Company</div>
          <div className="v">{me.activeCompany?.name ?? '—'}</div>
        </div>
      </div>

      <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>Notifications</h3>
      <div className="form-grid" style={{ maxWidth: 560, marginBottom: 28 }}>
        {CHANNELS.map(({ k, label, sub }) => (
          <button
            key={k}
            type="button"
            className={`switch-row ${prefs[k] ? 'on' : ''}`}
            onClick={() => togglePref(k)}
            style={{ justifyContent: 'space-between' }}
          >
            <span>
              <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{label}</span>
              <br />
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{sub}</span>
            </span>
            <span className={`switch ${prefs[k] ? 'on' : ''}`}>
              <span className="knob" />
            </span>
          </button>
        ))}
      </div>

      <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 12px' }}>Language</h3>
      <div style={{ maxWidth: 560, marginBottom: 20 }}>
        <select className="input" value={locale} onChange={(e) => changeLocale(e.target.value)}>
          <option value="en">English</option>
          <option value="hi">हिन्दी — Hindi</option>
          <option value="te">తెలుగు — Telugu</option>
        </select>
        <p className="helper">
          Applies to the AXHY interface and the worker-facing text you write.
        </p>
      </div>

      <div style={{ minHeight: 22, marginBottom: 10 }}>
        {saved && (
          <p
            className="helper"
            style={{ color: 'var(--ok)', display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}
          >
            <Icon name="check" size={14} /> {saved}
          </p>
        )}
        {error && (
          <p className="field-err" style={{ margin: 0 }}>
            <Icon name="alert" size={13} /> {error}
          </p>
        )}
      </div>

      <button
        className="btn btn-ghost"
        style={{ color: 'var(--bad)', borderColor: 'var(--bad-soft)' }}
        onClick={() => setConfirmOut(true)}
        type="button"
      >
        <Icon name="logout" size={16} /> Sign out
      </button>

      {confirmOut && (
        <div className="modal-scrim" onClick={() => setConfirmOut(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Sign out of AXHY?</h3>
              <p>You&rsquo;ll need your phone and a code to sign back in.</p>
            </div>
            <div className="modal-foot">
              <button
                className="btn btn-ghost btn-sm"
                style={{ height: 44, padding: '0 18px' }}
                onClick={() => setConfirmOut(false)}
                type="button"
              >
                Cancel
              </button>
              <button className="btn btn-reject" onClick={signOut} type="button">
                <Icon name="logout" size={16} /> Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
