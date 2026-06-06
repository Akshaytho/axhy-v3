// Axhy HR Payroll v2 — the scalable run-management surface (2,000 employees).
// Exception-first: review the ~150 flagged, bulk-clear the rest, approve, pay.

const { useState: uS, useMemo: uM, useRef: uR } = React;

// ── Sidebar ─────────────────────────────────────────────────────────────────
function Side2({ nav, setNav }) {
  const items = [
    ['overview', 'Overview', 'M3 13h8V3H3v10zM13 21h8V11h-8v10zM13 3v6h8V3h-8zM3 21h8v-6H3v6z'],
    ['payroll', 'Payroll', 'M3 6h18v12H3zM3 10h18M7 15h4'],
    [
      'people',
      'People',
      'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3.3 3.1-6 7-6s7 2.7 7 6M17 11a3 3 0 0 0 0-6M22 20c0-2.5-1.7-4.6-4-5.5',
    ],
    ['sites', 'Sites', 'M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5'],
    [
      'settings',
      'Settings',
      'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13a7.5 7.5 0 0 0 0-2l2-1.5-2-3.5-2.3 1a7.5 7.5 0 0 0-1.7-1l-.3-2.5h-4l-.3 2.5a7.5 7.5 0 0 0-1.7 1l-2.3-1-2 3.5L4.6 11a7.5 7.5 0 0 0 0 2l-2 1.5 2 3.5 2.3-1a7.5 7.5 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7.5 7.5 0 0 0 1.7-1l2.3 1 2-3.5-2-1.5z',
    ],
  ];
  return (
    <div
      style={{
        width: 220,
        background: 'var(--card)',
        borderRight: '1px solid var(--paper-3)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          padding: '20px 20px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 11,
          borderBottom: '1px solid var(--paper-3)',
        }}
      >
        <div
          style={{
            fontWeight: 800,
            fontSize: 22,
            letterSpacing: '-1px',
            color: 'var(--ink)',
            display: 'flex',
            alignItems: 'baseline',
          }}
        >
          A<span style={{ color: 'var(--accent)' }}>·</span>
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>AXHY</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>HR Console</div>
        </div>
      </div>
      <div style={{ padding: '14px 12px', flex: 1 }}>
        {items.map(([id, label, d]) => {
          const a = nav === id;
          return (
            <button
              key={id}
              onClick={() => setNav(id)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 12px',
                marginBottom: 2,
                borderRadius: 9,
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                background: a ? 'var(--accent-soft)' : 'transparent',
                color: a ? 'var(--accent-ink)' : 'var(--ink-2)',
                fontFamily: 'inherit',
                fontSize: 14,
                fontWeight: a ? 700 : 500,
              }}
            >
              <Ico d={d} size={18} color={a ? 'var(--accent)' : 'var(--ink-3)'} />
              {label}
            </button>
          );
        })}
      </div>
      <div
        style={{
          padding: '14px 16px',
          borderTop: '1px solid var(--paper-3)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Avatar2 initial="K" tone="ink" size={32} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Kavitha R.</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>HR · Reddy Cleaning</div>
        </div>
      </div>
    </div>
  );
}

// ── Run hero: completion progress band ──────────────────────────────────────
function RunHero({ total, clean, needs, reviewed, netTotal, lopTotal, status }) {
  const pending = needs - reviewed;
  const pct = (n) => `${(n / total) * 100}%`;
  return (
    <div
      style={{
        padding: '16px 28px 18px',
        borderBottom: '1px solid var(--paper-3)',
        display: 'flex',
        gap: 28,
        alignItems: 'center',
      }}
    >
      {/* progress */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: 9,
          }}
        >
          <div style={{ fontSize: 14, color: 'var(--ink-2)' }}>
            {status === 'PAID' ? (
              <b style={{ color: 'var(--ink)' }}>Run paid &amp; closed</b>
            ) : pending === 0 ? (
              <span>
                <b style={{ color: 'var(--ink)' }}>All exceptions reviewed.</b> Ready to approve.
              </span>
            ) : (
              <span>
                <b style={{ color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                  {pending.toLocaleString('en-IN')}
                </b>{' '}
                of {total.toLocaleString('en-IN')} need a look · {clean.toLocaleString('en-IN')}{' '}
                clean
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
            {Math.round(((clean + reviewed) / total) * 100)}% cleared
          </div>
        </div>
        <div
          style={{
            height: 12,
            borderRadius: 7,
            background: 'var(--paper-3)',
            overflow: 'hidden',
            display: 'flex',
          }}
        >
          <div style={{ width: pct(clean), background: '#7fae8c' }} title="Clean" />
          <div style={{ width: pct(reviewed), background: 'var(--accent)' }} title="Reviewed" />
          <div
            style={{ width: pct(pending), background: 'var(--warn-soft)' }}
            title="Pending review"
          />
        </div>
        <div style={{ display: 'flex', gap: 18, marginTop: 9 }}>
          <Legend c="#7fae8c" label="Clean" n={clean} />
          <Legend c="var(--accent)" label="Reviewed" n={reviewed} />
          <Legend c="var(--warn-soft)" ring label="Needs review" n={pending} />
        </div>
      </div>
      {/* stat divider + tiles */}
      <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--paper-3)' }} />
      <div style={{ display: 'flex', gap: 26 }}>
        <HeroStat label="Net payable" value={inrShort(netTotal)} accent />
        <HeroStat label="Total LOP" value={inrShort(lopTotal)} />
        <HeroStat label="Headcount" value={total.toLocaleString('en-IN')} />
      </div>
    </div>
  );
}
function Legend({ c, label, n, ring }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 3,
          background: ring ? 'transparent' : c,
          border: ring ? '1.5px solid var(--warn)' : 'none',
        }}
      />
      <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>{label}</span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: 'var(--ink)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {n.toLocaleString('en-IN')}
      </span>
    </div>
  );
}
function HeroStat({ label, value, accent }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: '-0.5px',
          marginTop: 4,
          color: accent ? 'var(--accent)' : 'var(--ink)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ── Toolbar: tabs + search + density ────────────────────────────────────────
function Toolbar({
  tab,
  setTab,
  counts,
  search,
  setSearch,
  density,
  setDensity,
  siteFilter,
  clearSite,
}) {
  const tabs = [
    ['review', 'Needs review', counts.needs],
    ['all', 'All employees', counts.total],
    ['sites', 'By site', counts.sites],
  ];
  return (
    <div
      style={{
        padding: '12px 28px',
        borderBottom: '1px solid var(--paper-3)',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <div
        style={{
          display: 'flex',
          background: 'var(--paper-2)',
          borderRadius: 10,
          padding: 3,
          gap: 2,
        }}
      >
        {tabs.map(([id, label, n]) => {
          const a = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '7px 14px',
                borderRadius: 8,
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 13.5,
                fontWeight: a ? 700 : 500,
                background: a ? 'var(--card)' : 'transparent',
                color: a ? 'var(--ink)' : 'var(--ink-3)',
                boxShadow: a ? 'var(--sh-1)' : 'none',
              }}
            >
              {label}
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  color: a ? (id === 'review' ? 'var(--accent)' : 'var(--ink-3)') : 'var(--ink-4)',
                  background: a && id === 'review' ? 'var(--accent-soft)' : 'var(--paper-3)',
                  padding: '1px 7px',
                  borderRadius: 999,
                }}
              >
                {n.toLocaleString('en-IN')}
              </span>
            </button>
          );
        })}
      </div>

      {siteFilter && (
        <Pill2 tone="info" small>
          {siteFilter}
          <span
            onClick={clearSite}
            style={{ cursor: 'pointer', marginLeft: 2, display: 'inline-flex' }}
          >
            <Ico d={ICON.x} size={11} sw={2.4} />
          </span>
        </Pill2>
      )}

      <div style={{ flex: 1 }} />

      <div style={{ position: 'relative', width: 240 }}>
        <span
          style={{
            position: 'absolute',
            left: 11,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--ink-3)',
          }}
        >
          <Ico d={ICON.search} size={16} />
        </span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or site…"
          style={{
            width: '100%',
            height: 36,
            border: '1px solid var(--card-edge)',
            borderRadius: 9,
            background: 'var(--card)',
            padding: '0 12px 0 34px',
            fontFamily: 'inherit',
            fontSize: 13.5,
            color: 'var(--ink)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          background: 'var(--card)',
          border: '1px solid var(--card-edge)',
          borderRadius: 9,
          overflow: 'hidden',
        }}
      >
        {[
          ['default', 'M3 5h18M3 12h18M3 19h18'],
          ['compact', 'M3 4h18M3 9h18M3 14h18M3 19h18'],
        ].map(([d, path]) => (
          <button
            key={d}
            onClick={() => setDensity(d)}
            title={d}
            style={{
              width: 36,
              height: 36,
              border: 'none',
              cursor: 'pointer',
              background: density === d ? 'var(--paper-2)' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: density === d ? 'var(--ink)' : 'var(--ink-3)',
            }}
          >
            <Ico d={path} size={16} />
          </button>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { Side2, RunHero, Toolbar });
