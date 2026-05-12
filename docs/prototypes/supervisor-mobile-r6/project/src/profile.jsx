/* global React, I, AxhyShell */
// Profile tab — single iOS variant (Safe). Android/Expressive variant dropped per ADR-0021.

const { CaptionEyebrow } = AxhyShell;

function StatRow({ label, value, mono, accent, divider = true, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        textAlign: 'left',
        cursor: onClick ? 'pointer' : 'default',
        background: 'transparent',
        border: 'none',
        fontFamily: 'inherit',
        padding: '14px 16px',
        minHeight: 48,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: divider ? '1px solid var(--card-edge)' : 'none',
      }}
    >
      <span style={{ fontSize: 14, color: 'var(--ink-2)', fontWeight: 500 }}>{label}</span>
      <span
        className={mono ? 'mono' : ''}
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: accent ? 'var(--accent)' : 'var(--ink)',
        }}
      >
        {value}
      </span>
    </button>
  );
}

function Section({ title, children, action }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          padding: '0 4px',
          marginBottom: 8,
        }}
      >
        <CaptionEyebrow>{title}</CaptionEyebrow>
        {action}
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

// ─── Profile — iOS, list-row style, paper card per section ──────────────────
function Profile({ persona, onSignOut, onSwitchCompany, onEditName, onLocale, onNotifs }) {
  return (
    <div style={{ padding: '12px 16px 24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '4px 4px 22px' }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'var(--accent-soft)',
            color: 'var(--accent-ink)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 28,
            fontWeight: 700,
            border: '1px solid var(--accent)',
          }}
        >
          {persona.initial}
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{ fontSize: 22, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.3px' }}
          >
            {persona.name}
          </div>
          {persona.availableRoles && persona.availableRoles.length > 1 ? (
            <button
              onClick={() => alert('Role-switcher sheet (mock)')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '4px 10px',
                marginTop: 2,
                background: 'var(--accent-soft)',
                color: 'var(--accent-ink)',
                border: '1px solid var(--accent)',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              Supervisor · {persona.companyShort}
              <I.ChevronDown size={11} />
            </button>
          ) : (
            <div className="t-body-sm" style={{ color: 'var(--ink-3)', marginTop: 2 }}>
              Supervisor · {persona.companyShort}
            </div>
          )}
        </div>
      </div>

      {/* Profile section */}
      <Section
        title="PROFILE"
        action={
          <button
            onClick={onEditName}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--accent)',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <I.Edit size={12} /> Edit
          </button>
        }
      >
        <StatRow label="Name" value={persona.name} onClick={onEditName} />
        <StatRow label="Phone" value={persona.phone} mono />
        <StatRow
          label="Language"
          value={persona.locale === 'te' ? 'Telugu' : persona.locale === 'hi' ? 'Hindi' : 'English'}
          onClick={onLocale}
        />
        <StatRow label="Company" value={persona.company} />
        <StatRow label="Role" value="Supervisor" />
        <StatRow label="Joined" value={persona.memberSince} divider={false} />
      </Section>

      {/* Settings */}
      <Section title="SETTINGS">
        <StatRow
          label="Notification preferences"
          value={<I.ChevronRight size={16} color="var(--ink-3)" />}
          onClick={onNotifs}
        />
        <StatRow
          label="Switch company"
          value={<I.ChevronRight size={16} color="var(--ink-3)" />}
          onClick={onSwitchCompany}
        />
        <StatRow
          label="Sign out"
          value={<I.Logout size={16} color="var(--bad)" />}
          onClick={onSignOut}
          divider={false}
        />
      </Section>

      <div
        className="t-mono-sm mono"
        style={{
          textAlign: 'center',
          color: 'var(--ink-4)',
          marginTop: 8,
        }}
      >
        AXHY · v3 · BUILD 2026.05.08
      </div>
    </div>
  );
}

window.AxhyProfile = { Profile };
