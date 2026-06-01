// Variation B — Pulse Stream home
// Today's facts surfaced as a vertical, scrollable timeline of cards.
// Each card is a tappable fact that becomes an action. The day reads
// like a feed of things-that-happened/things-needing-attention.
// Doc references: §4 audit_event stream, §5 actions, §7 supervisor today/pulse.

function VariationB({ onOpenScreen }) {
  return (
    <Phone>
      {/* Compact header */}
      <div
        style={{
          padding: '12px 20px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid var(--paper-3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar initial="S" size={36} tone="ink" />
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.1 }}>Today, Wed 6 May</div>
            <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 2 }}>
              Reddy Cleaning · 11 sites
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button style={pillBtn}>Day</button>
          <button style={iconBtnB}>
            <Icon name="filter" size={16} />
          </button>
        </div>
      </div>

      {/* Pulse strip */}
      <div
        style={{
          padding: '14px 20px',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 8,
          borderBottom: '1px solid var(--paper-3)',
          background: 'var(--paper-2)',
        }}
      >
        <PulseChip n="21" l="in" tone="ok" />
        <PulseChip n="1" l="absent" tone="bad" />
        <PulseChip n="2" l="leaves" tone="warn" />
        <PulseChip n="3" l="todo" tone="accent" />
      </div>

      {/* Stream */}
      <div style={{ padding: '4px 0 24px' }}>
        <DayMarker time="9:18 AM" label="Now" />

        <FactCard
          tone="bad"
          icon="absent"
          time="9:18 AM"
          headline="Mukesh hasn't shown at Phoenix Mall"
          body="No call. 47 min late. Site B1 is short one worker."
          who={{ name: 'Mukesh K.', initial: 'M', site: 'Phoenix Mall — B1' }}
          actions={[
            { label: 'Mark absent', primary: true },
            { label: 'Call Mukesh' },
            { label: 'Swap in Vikram' },
          ]}
        />

        <FactCard
          tone="warn"
          icon="leave"
          time="7:42 AM"
          headline="Geetha requested leave for Friday"
          body={
            <>
              Daughter's school event · <span className="tabular">8 May</span>
            </>
          }
          who={{ name: 'Geetha R.', initial: 'G', site: 'Phoenix Mall — A1' }}
          actions={[{ label: 'Approve', primary: true }, { label: 'Reject' }, { label: 'Discuss' }]}
        />

        <FactCard
          tone="bad"
          icon="complaint"
          time="2nd day"
          headline="Phoenix Mall — restroom complaint persists"
          body="HR will be notified at 24h mark unless resolved."
          who={{ name: 'Phoenix Mall — B1', initial: 'P', site: 'Site' }}
          tag="ESCALATING"
          actions={[{ label: 'Note progress', primary: true }, { label: 'Escalate now' }]}
        />

        <DayMarker time="6:42 AM" label="Day loaded" />

        <FactCard
          tone="ok"
          icon="visit"
          time="6:42 AM"
          headline="14 visits started cleanly"
          body="6:00 — 7:00 AM dispatch wave. All clock-ins on time."
          quiet
        />

        <FactCard
          tone="paper"
          icon="sparkle"
          time="6:42 AM"
          headline="AI loaded your living-doc"
          body="247 personal rules · 18 site quirks · ready when you call."
          quiet
        />

        <DayMarker time="3:30 AM" label="Day prepared" />
      </div>

      {/* Floating ask bar — voice + text */}
      <div
        style={{
          position: 'absolute',
          bottom: 30,
          left: 16,
          right: 16,
          background: 'var(--card)',
          border: '1px solid var(--card-edge)',
          borderRadius: 24,
          padding: '8px 8px 8px 18px',
          boxShadow: 'var(--sh-3)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div style={{ flex: 1, fontSize: 14, color: 'var(--ink-4)' }}>Ask or do something…</div>
        <button
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            border: 'none',
            background: 'var(--paper-3)',
            color: 'var(--ink-2)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="chat" size={16} />
        </button>
        <button
          onClick={() => onOpenScreen?.('voice')}
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            border: 'none',
            background: 'var(--ink)',
            color: 'var(--card)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="mic" size={16} />
        </button>
      </div>
    </Phone>
  );
}

const pillBtn = {
  height: 30,
  padding: '0 12px',
  borderRadius: 15,
  border: '1px solid var(--card-edge)',
  background: 'var(--card)',
  fontWeight: 600,
  fontSize: 13,
  color: 'var(--ink-2)',
  cursor: 'pointer',
};
const iconBtnB = {
  width: 30,
  height: 30,
  borderRadius: 15,
  border: '1px solid var(--card-edge)',
  background: 'var(--card)',
  color: 'var(--ink-2)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

function PulseChip({ n, l, tone }) {
  const tones = {
    ok: { fg: 'var(--ok)' },
    bad: { fg: 'var(--bad)' },
    warn: { fg: '#7a5a08' },
    accent: { fg: 'var(--accent)' },
  };
  const t = tones[tone];
  return (
    <div
      style={{
        background: 'var(--card)',
        borderRadius: 10,
        padding: '8px 6px',
        textAlign: 'center',
        border: '1px solid var(--card-edge)',
      }}
    >
      <div
        className="tabular"
        style={{ fontSize: 20, fontWeight: 700, color: t.fg, lineHeight: 1, letterSpacing: -0.5 }}
      >
        {n}
      </div>
      <div
        style={{
          fontSize: 10,
          color: 'var(--ink-3)',
          marginTop: 3,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {l}
      </div>
    </div>
  );
}

function DayMarker({ time, label }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '14px 20px 6px',
        fontSize: 11,
        fontWeight: 700,
        color: 'var(--ink-3)',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
      }}
    >
      <span className="tabular">{time}</span>
      <span style={{ color: 'var(--ink-4)', fontWeight: 500 }}>·</span>
      <span>{label}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--paper-3)' }} />
    </div>
  );
}

function FactCard({ tone, icon, time, headline, body, who, actions, tag, quiet }) {
  const tones = {
    bad: { bar: 'var(--bad)', ic: 'var(--bad)', icBg: '#fdf2ee' },
    warn: { bar: 'var(--warn)', ic: '#7a5a08', icBg: '#faf2da' },
    ok: { bar: 'var(--ok)', ic: 'var(--ok)', icBg: '#eff5ec' },
    accent: { bar: 'var(--accent)', ic: 'var(--accent)', icBg: 'var(--accent-soft)' },
    paper: { bar: 'var(--paper-3)', ic: 'var(--ink-3)', icBg: 'var(--paper-2)' },
  };
  const t = tones[tone];
  return (
    <div style={{ padding: '6px 16px' }}>
      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--card-edge)',
          borderRadius: 12,
          padding: '14px 14px 14px 16px',
          boxShadow: quiet ? 'none' : 'var(--sh-1)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {!quiet && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 3,
              background: t.bar,
            }}
          />
        )}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: t.icBg,
              color: t.ic,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Icon name={icon} size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 2,
                flexWrap: 'wrap',
              }}
            >
              <span
                className="tabular"
                style={{ fontSize: 11, color: 'var(--ink-3)', fontWeight: 600 }}
              >
                {time}
              </span>
              {tag && (
                <span className="tag bad" style={{ fontSize: 9 }}>
                  {tag}
                </span>
              )}
            </div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: 'var(--ink)',
                lineHeight: 1.3,
                textWrap: 'pretty',
              }}
            >
              {headline}
            </div>
            {body && (
              <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 4, lineHeight: 1.4 }}>
                {body}
              </div>
            )}
            {who && (
              <div
                style={{
                  marginTop: 10,
                  padding: '8px 10px',
                  background: 'var(--paper-2)',
                  borderRadius: 8,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Avatar initial={who.initial} size={24} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                    {who.name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{who.site}</div>
                </div>
              </div>
            )}
            {actions && (
              <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                {actions.map((a, i) => (
                  <button
                    key={i}
                    style={{
                      height: 32,
                      padding: '0 12px',
                      borderRadius: 8,
                      border: a.primary ? 'none' : '1px solid var(--card-edge)',
                      background: a.primary ? 'var(--ink)' : 'transparent',
                      color: a.primary ? 'var(--card)' : 'var(--ink-2)',
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { VariationB });
