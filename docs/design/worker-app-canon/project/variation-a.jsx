// Variation A — Action-first home
// Buttons are the primary surface. AI lives in the corner as a voice mic FAB.
// Mirrors doc §5 supervisor action catalog 1:1, with a pulse banner up top
// (doc §7) and a "today's pending" rail beneath the action grid.

const A_ACTIONS = [
  { kind: 'absent', label: 'Mark absent', hint: 'No-call no-show', tone: 'bad' },
  { kind: 'leave', label: 'Approve leave', hint: '2 pending', tone: 'warn', badge: 2 },
  { kind: 'swap', label: 'Swap worker', hint: 'Reassign mid-shift', tone: 'info' },
  { kind: 'visit', label: 'Mark visit done', hint: '7 in progress', tone: 'ok' },
  { kind: 'complaint', label: 'Log complaint', hint: 'Site-level note', tone: 'paper' },
  { kind: 'flag', label: 'HR update', hint: '1 needs ack', tone: 'accent', badge: 1 },
];

function VariationA({ onOpenScreen }) {
  const p = MOCK.pulse;

  return (
    <Phone>
      {/* Header */}
      <div
        style={{
          padding: '12px 20px 8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 500 }}>
            {TODAY_STR} · 9:18 AM
          </div>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: -0.3, marginTop: 1 }}>
            Suresh
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <IconButton>
            <Icon name="bell" size={20} />
          </IconButton>
          <IconButton>
            <Icon name="settings" size={20} />
          </IconButton>
        </div>
      </div>

      {/* Pulse banner — derives from §6 & §7 supervisor today/pulse */}
      <div style={{ padding: '4px 20px 0' }}>
        <div
          style={{
            background: 'var(--card)',
            border: '1px solid var(--card-edge)',
            borderRadius: 14,
            padding: '14px 16px',
            boxShadow: 'var(--sh-1)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 10,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--ink-3)',
              }}
            >
              Today's pulse
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11,
                color: 'var(--ink-3)',
              }}
            >
              <span className="dot" style={{ background: 'var(--ok)' }} /> Live
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            <Stat n={`${p.workersPresent}/${p.workersExpected}`} l="workers in" />
            <Stat
              n={p.sitesCovered}
              l="sites covered"
              sub={`${p.sitesShort} short`}
              subTone="bad"
            />
            <Stat
              n={p.visitsInProgress}
              l="in progress"
              sub={`${p.visitsDone} done`}
              subTone="ok"
            />
          </div>
          <div
            style={{
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px solid var(--paper-3)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              color: 'var(--ink-2)',
            }}
          >
            <Icon name="absent" size={14} color="var(--bad)" />
            <span>
              <b style={{ color: 'var(--ink)' }}>Mukesh</b> hasn't shown at Phoenix Mall ·{' '}
              <span className="tabular">47 min</span> late
            </span>
          </div>
        </div>
      </div>

      {/* Action grid */}
      <Section title="Quick actions" pad="20px 20px 12px" />
      <div style={{ padding: '0 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {A_ACTIONS.map((a) => (
          <ActionTile key={a.kind} {...a} onClick={() => onOpenScreen?.(a.kind)} />
        ))}
      </div>

      {/* Pending rail */}
      <Section
        title="Pending decisions"
        pad="20px 20px 8px"
        action={<span style={{ fontSize: 13, color: 'var(--ink-3)' }}>3</span>}
      />
      <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {MOCK.decisions.slice(0, 2).map((d) => (
          <PendingRow key={d.id} d={d} />
        ))}
      </div>

      {/* Voice FAB */}
      <button
        onClick={() => onOpenScreen?.('voice')}
        style={{
          position: 'absolute',
          bottom: 36,
          right: 20,
          width: 60,
          height: 60,
          borderRadius: 30,
          background: 'var(--ink)',
          color: 'var(--card)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(40,30,20,0.32)',
        }}
      >
        <Icon name="mic" size={26} />
      </button>

      {/* Bottom tab indicator (faux) */}
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          left: 20,
          right: 96,
          display: 'flex',
          justifyContent: 'space-around',
          fontSize: 10,
          color: 'var(--ink-3)',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        <TabPill active>Today</TabPill>
        <TabPill>Workers</TabPill>
        <TabPill>Sites</TabPill>
        <TabPill>Chat</TabPill>
      </div>
    </Phone>
  );
}

function TabPill({ children, active }) {
  return (
    <div
      style={{
        padding: '6px 10px',
        borderRadius: 8,
        color: active ? 'var(--ink)' : 'var(--ink-3)',
        fontWeight: active ? 700 : 500,
        background: active ? 'var(--paper-3)' : 'transparent',
      }}
    >
      {children}
    </div>
  );
}

function IconButton({ children }) {
  return (
    <button
      style={{
        width: 36,
        height: 36,
        border: '1px solid var(--card-edge)',
        borderRadius: 10,
        background: 'var(--card)',
        color: 'var(--ink-2)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </button>
  );
}

function Stat({ n, l, sub, subTone }) {
  const tones = { bad: 'var(--bad)', ok: 'var(--ok)', warn: 'var(--warn)' };
  return (
    <div>
      <div
        className="tabular"
        style={{
          fontSize: 24,
          fontWeight: 600,
          letterSpacing: -0.6,
          color: 'var(--ink)',
          lineHeight: 1,
        }}
      >
        {n}
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4, fontWeight: 500 }}>{l}</div>
      {sub && (
        <div
          style={{
            fontSize: 10,
            color: tones[subTone] || 'var(--ink-3)',
            marginTop: 2,
            fontWeight: 600,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function ActionTile({ kind, label, hint, tone, badge, onClick }) {
  const tones = {
    bad: { bg: '#fdf2ee', ic: 'var(--bad)' },
    ok: { bg: '#eff5ec', ic: 'var(--ok)' },
    warn: { bg: '#faf2da', ic: '#7a5a08' },
    info: { bg: '#eef2f7', ic: 'var(--info-ink)' },
    accent: { bg: 'var(--accent-soft)', ic: 'var(--accent)' },
    paper: { bg: 'var(--paper-2)', ic: 'var(--ink-2)' },
  };
  const t = tones[tone] || tones.paper;
  return (
    <button
      onClick={onClick}
      style={{
        background: 'var(--card)',
        border: '1px solid var(--card-edge)',
        borderRadius: 14,
        padding: '14px 14px 16px',
        cursor: 'pointer',
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        boxShadow: 'var(--sh-1)',
        position: 'relative',
        fontFamily: 'inherit',
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: t.bg,
          color: t.ic,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={kind === 'flag' ? 'flag' : kind} size={20} />
      </div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.2 }}>
          {label}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 3 }}>{hint}</div>
      </div>
      {badge && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            minWidth: 20,
            height: 20,
            padding: '0 6px',
            background: 'var(--accent)',
            color: '#fff',
            borderRadius: 10,
            fontSize: 11,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {badge}
        </div>
      )}
    </button>
  );
}

function PendingRow({ d }) {
  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--card-edge)',
        borderRadius: 12,
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: 'var(--sh-1)',
      }}
    >
      <Icon
        name={d.kind === 'MARK_ABSENT' ? 'absent' : d.kind === 'APPROVE_LEAVE' ? 'leave' : 'swap'}
        size={18}
        color="var(--ink-2)"
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{d.label}</div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 1 }}>{d.meta}</div>
      </div>
      <Icon name="chevron" size={16} color="var(--ink-3)" />
    </div>
  );
}

Object.assign(window, { VariationA });
