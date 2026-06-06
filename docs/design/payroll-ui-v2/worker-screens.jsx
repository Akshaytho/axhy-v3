// Axhy Worker app — paper-translation of the dark-OLED React Native screens.
// Each screen mirrors a real screen in mobile/src/plugs/* (capture, history, profile).
// Visual rules from the locked architect spec:
//   - paper background (#f6f1e8) instead of OLED black
//   - terracotta (#c0492a) replaces the yellow accent everywhere
//   - ink text, monospace metadata
//   - status colors only when semantically required (BEFORE=accent, AFTER=ok)
//   - no extra colors invented, no SaaS-blue

const W_NOW = '9:42';
const W_MOCK = {
  worker: {
    name: 'Mukesh K.',
    phone: '+91 98765 43210',
    initial: 'M',
    avgScore: 87,
    totalSites: 142,
    thisMonth: 11,
  },
  site: {
    name: 'Phoenix Mall — B1',
    address: 'Whitefield, Bangalore',
    distance: '180 m',
    gps: 'Whitefield',
  },
  // simulated capture session
  session: {
    photoCount: 3,
    minPhotos: 4,
    elapsed: '12:47', // mm:ss
    elapsedPct: 42,
    gpsPoints: 26,
    flash: 'OFF',
  },
  history: [
    { name: 'Phoenix Mall — B1', time: '6:42 AM', dur: '32m', score: 92 },
    { name: 'Brigade Tower 3', time: '8:10 AM', dur: '28m', score: 84 },
    { name: 'Lulu Mall — Tower A', time: '9:55 AM', dur: '34m', score: 78 },
    { name: 'Manyata Block 4', time: '11:30 AM', dur: '26m', score: 88 },
  ],
};

// Worker-app phone shell: reuse the supervisor Phone shell with custom screen styles.
function WPhone({ children, screenStyle }) {
  const Phone = window.Phone;
  return <Phone screenStyle={screenStyle}>{children}</Phone>;
}

// All icons are inline SVG paths (worker app has its own glyph set distinct from supervisor's).
function WGlyph({ d, size = 20, color = 'currentColor', strokeWidth = 1.7, fill = 'none' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d={d} />
    </svg>
  );
}

// ── Reusable bottom-tabs (Home / Capture / History / Profile) ───────────────
function WTabs({ active = 'capture' }) {
  const tabs = [
    {
      id: 'home',
      label: 'Today',
      d: 'M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V11z',
    },
    {
      id: 'capture',
      label: 'Capture',
      d: 'M3 7h4l2-3h6l2 3h4v12H3V7z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    },
    { id: 'history', label: 'History', d: 'M3 12a9 9 0 1 0 9-9 M3 4v5h5 M12 7v5l3 2' },
    {
      id: 'profile',
      label: 'You',
      d: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8',
    },
  ];
  return (
    <div
      style={{
        borderTop: '1px solid var(--paper-3)',
        background: 'var(--card)',
        padding: '6px 10px 4px',
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        flexShrink: 0,
      }}
    >
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <div
            key={t.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              padding: '6px 0',
              borderRadius: 8,
              color: isActive ? 'var(--accent)' : 'var(--ink-3)',
            }}
          >
            <WGlyph d={t.d} size={20} strokeWidth={isActive ? 2 : 1.6} />
            <div
              style={{
                fontSize: 10,
                fontWeight: isActive ? 700 : 500,
                letterSpacing: '0.04em',
              }}
            >
              {t.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Card primitive (reused on worker screens) ──────────────────────────────
function WCard({ children, style, padding = 14 }) {
  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--card-edge)',
        borderRadius: 14,
        padding,
        boxShadow: 'var(--sh-1)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 1. TODAY / HOME — what the worker sees first thing
// ──────────────────────────────────────────────────────────────────────────
function WorkerToday() {
  const next = { name: 'Phoenix Mall — B1', sched: '10:00 AM', distance: '180 m' };
  return (
    <WPhone>
      {/* Header — name + greeting + sync state */}
      <div style={{ padding: '14px 20px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>Wednesday, 6 May</div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: 'var(--ink)',
                letterSpacing: '-0.5px',
              }}
            >
              Good morning, Mukesh
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--ok-soft)',
              color: '#2e5037',
              padding: '5px 9px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            <span className="dot" style={{ background: '#2e5037' }} /> Synced
          </div>
        </div>
      </div>

      {/* Big "next site" card — the primary action */}
      <div style={{ padding: '10px 20px 0' }}>
        <div
          style={{
            background: 'var(--ink)',
            color: 'var(--card)',
            borderRadius: 18,
            padding: '18px 18px 16px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              right: -36,
              top: -36,
              width: 140,
              height: 140,
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '50%',
            }}
          />
          <div
            style={{
              position: 'absolute',
              right: -16,
              top: -16,
              width: 90,
              height: 90,
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '50%',
            }}
          />
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.1em',
              color: 'var(--accent)',
              marginBottom: 6,
            }}
          >
            NEXT SITE
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2, marginBottom: 4 }}>
            {next.name}
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 13,
              color: 'rgba(253,250,243,0.7)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <span>{next.sched}</span>
            <span>·</span>
            <span>{next.distance} away</span>
          </div>
          <button
            style={{
              marginTop: 16,
              width: '100%',
              height: 52,
              background: 'var(--accent)',
              color: 'var(--card)',
              border: 'none',
              borderRadius: 12,
              fontSize: 16,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              cursor: 'pointer',
            }}
          >
            <WGlyph
              d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3z M14 14h3v3h-3zM18 14h3v3h-3zM14 18h3v3h-3zM18 18h3v3h-3z"
              size={18}
              color="var(--card)"
            />
            Scan QR · check in
          </button>
        </div>
      </div>

      {/* Today's stats strip */}
      <div
        style={{
          padding: '20px 20px 0',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 8,
        }}
      >
        {[
          { n: '0', l: 'Done' },
          { n: '4', l: 'Planned' },
          { n: '—', l: 'Avg score' },
        ].map((s, i) => (
          <WCard key={i} padding={12} style={{ textAlign: 'center' }}>
            <div
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: 'var(--ink)',
                letterSpacing: '-0.5px',
              }}
            >
              {s.n}
            </div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--ink-3)',
                marginTop: 2,
              }}
            >
              {s.l}
            </div>
          </WCard>
        ))}
      </div>

      {/* Today's plan list */}
      <div style={{ padding: '20px 20px 12px' }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
            marginBottom: 8,
          }}
        >
          Today's plan · 4 sites
        </div>
        {[
          { t: '10:00 AM', n: 'Phoenix Mall — B1', state: 'next', dur: '30m' },
          { t: '11:30 AM', n: 'Embassy Tech · Wing C', state: 'queued', dur: '30m' },
          { t: '1:30 PM', n: 'Brigade Tower 3', state: 'queued', dur: '45m' },
          { t: '3:30 PM', n: 'Manyata Block 4', state: 'queued', dur: '30m' },
        ].map((s, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 0',
              borderBottom: i < 3 ? '1px solid var(--paper-3)' : 'none',
            }}
          >
            <div
              style={{
                width: 56,
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                fontWeight: 600,
                color: s.state === 'next' ? 'var(--accent)' : 'var(--ink-3)',
              }}
            >
              {s.t}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'var(--ink)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {s.n}
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
                {s.dur}
              </div>
            </div>
            {s.state === 'next' && (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  background: 'var(--accent-soft)',
                  color: 'var(--accent-ink)',
                  padding: '3px 7px',
                  borderRadius: 4,
                }}
              >
                NEXT
              </span>
            )}
          </div>
        ))}
      </div>

      <WTabs active="home" />
    </WPhone>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 2. QR SCAN — paper translation of QRScanScreen
// ──────────────────────────────────────────────────────────────────────────
function WorkerQRScan() {
  // Camera viewport gets a slightly recessed paper tone (camera-feed-as-paper).
  return (
    <WPhone screenStyle={{ background: '#1a1612' }}>
      {/* Top bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '14px 20px',
          color: 'var(--card)',
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            background: 'rgba(253,250,243,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <WGlyph d="M6 6l12 12M18 6L6 18" size={16} color="var(--card)" strokeWidth={2.5} />
        </div>
        <div
          style={{
            flex: 1,
            textAlign: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            letterSpacing: '0.1em',
            color: 'var(--card)',
          }}
        >
          SCAN QR
        </div>
        <div style={{ width: 36 }} />
      </div>

      {/* Site pill */}
      <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 14 }}>
        <div
          style={{
            border: '1px solid var(--accent)',
            background: 'rgba(0,0,0,0.4)',
            color: 'var(--accent)',
            padding: '4px 14px',
            borderRadius: 999,
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            letterSpacing: '0.08em',
          }}
        >
          PHOENIX MALL — B1
        </div>
      </div>

      {/* Frame area — fakes the dark overlay with a transparent square hole */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <div style={{ flex: 1, background: 'rgba(0,0,0,0.55)' }} />
        <div style={{ display: 'flex', height: 240 }}>
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.55)' }} />
          {/* Hole — paper "camera feed" background showing through */}
          <div
            style={{
              width: 240,
              height: 240,
              position: 'relative',
              background: '#2a221a',
            }}
          >
            {/* corner brackets */}
            {[
              { top: 0, left: 0 },
              { top: 0, right: 0 },
              { bottom: 0, left: 0 },
              { bottom: 0, right: 0 },
            ].map((p, i) => {
              const top = p.top === 0;
              const bottom = p.bottom === 0;
              const left = p.left === 0;
              const right = p.right === 0;
              return (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    ...p,
                    width: 32,
                    height: 32,
                    borderColor: 'var(--accent)',
                    borderTopWidth: top ? 3 : 0,
                    borderLeftWidth: left ? 3 : 0,
                    borderBottomWidth: bottom ? 3 : 0,
                    borderRightWidth: right ? 3 : 0,
                    borderStyle: 'solid',
                    borderTopLeftRadius: top && left ? 4 : 0,
                    borderTopRightRadius: top && right ? 4 : 0,
                    borderBottomLeftRadius: bottom && left ? 4 : 0,
                    borderBottomRightRadius: bottom && right ? 4 : 0,
                  }}
                />
              );
            })}
            {/* faint scan line */}
            <div
              style={{
                position: 'absolute',
                left: 14,
                right: 14,
                top: '52%',
                height: 1,
                background: 'var(--accent)',
                opacity: 0.5,
                boxShadow: '0 0 12px var(--accent)',
              }}
            />
          </div>
          <div style={{ flex: 1, background: 'rgba(0,0,0,0.55)' }} />
        </div>
        <div
          style={{
            background: 'rgba(0,0,0,0.6)',
            textAlign: 'center',
            paddingTop: 22,
            paddingBottom: 10,
            fontSize: 14,
            color: 'rgba(253,250,243,0.85)',
          }}
        >
          Point at the site QR code
        </div>
        <div style={{ flex: 1, background: 'rgba(0,0,0,0.55)' }} />

        {/* Skip QR */}
        <div
          style={{
            position: 'absolute',
            bottom: 36,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <button
            style={{
              background: 'rgba(253,250,243,0.1)',
              border: '1px solid rgba(253,250,243,0.18)',
              color: 'var(--card)',
              padding: '12px 36px',
              borderRadius: 12,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Skip QR
          </button>
        </div>
      </div>
    </WPhone>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 3. CAMERA BEFORE — viewfinder with reticle, BEFORE pill, GPS strip, shutter
// ──────────────────────────────────────────────────────────────────────────
function WorkerCamera({ mode = 'before' }) {
  const isAfter = mode === 'after';
  const accent = 'var(--accent)';
  const okColor = '#4a7c59';
  const modeColor = isAfter ? okColor : accent;
  const photoCount = isAfter ? 4 : W_MOCK.session.photoCount;
  const minPhotos = W_MOCK.session.minPhotos;
  const hasMin = photoCount >= minPhotos;
  const flashColor = 'var(--ink-3)';

  return (
    <WPhone screenStyle={{ background: '#1a1612' }}>
      {/* Viewfinder area — flex: 1 */}
      <div style={{ flex: 1, position: 'relative', background: '#2a221a', overflow: 'hidden' }}>
        {/* Faux camera feed: subtle gradient + grid lines */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(170deg, #3a322a 0%, #1a1612 100%)',
          }}
        >
          {/* mock site silhouette */}
          <div
            style={{
              position: 'absolute',
              left: 30,
              right: 30,
              bottom: 80,
              height: 140,
              borderRadius: 4,
              background: 'linear-gradient(180deg, rgba(40,30,20,0) 0%, rgba(0,0,0,0.5) 100%)',
              border: '1px solid rgba(253,250,243,0.04)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: 80,
              top: 220,
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: 'rgba(253,250,243,0.04)',
              filter: 'blur(8px)',
            }}
          />
        </div>

        {/* Rule-of-thirds grid */}
        {[33.3, 66.6].map((p) => (
          <React.Fragment key={'h' + p}>
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: `${p}%`,
                height: 1,
                background: 'rgba(253,250,243,0.07)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${p}%`,
                width: 1,
                background: 'rgba(253,250,243,0.07)',
              }}
            />
          </React.Fragment>
        ))}

        {/* Top bar */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            padding: '14px 20px',
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              background: 'rgba(253,250,243,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <WGlyph d="M6 6l12 12M18 6L6 18" size={16} color="var(--card)" strokeWidth={2.5} />
          </div>
          <div
            style={{
              flex: 1,
              textAlign: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              letterSpacing: '0.1em',
              color: 'var(--card)',
            }}
          >
            PHOTO <span style={{ color: accent }}>{photoCount + 1}</span> OF{' '}
            {Math.max(photoCount + 1, minPhotos)}
          </div>
          <div
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 44 }}
          >
            <WGlyph d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" size={18} color={flashColor} />
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                letterSpacing: '0.08em',
                color: flashColor,
                marginTop: 1,
              }}
            >
              OFF
            </div>
          </div>
        </div>

        {/* Site strip */}
        <div
          style={{
            position: 'absolute',
            top: 64,
            left: 0,
            right: 0,
            background: 'rgba(0,0,0,0.45)',
            borderTop: '1px solid rgba(253,250,243,0.08)',
            borderBottom: '1px solid rgba(253,250,243,0.08)',
            padding: '8px 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.1em',
              color: accent,
            }}
          >
            SITE
          </span>
          <span style={{ fontSize: 13, color: 'var(--card)' }}>Phoenix Mall — B1</span>
        </div>

        {/* Mode badge */}
        <div
          style={{
            position: 'absolute',
            top: 110,
            left: '50%',
            transform: 'translateX(-50%)',
            background: modeColor,
            color: 'var(--card)',
            padding: '5px 14px',
            borderRadius: 999,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: '0.1em',
            fontWeight: 700,
          }}
        >
          {isAfter ? 'AFTER' : 'BEFORE'}
        </div>

        {/* Corner reticle (15% inset) */}
        <div style={{ position: 'absolute', top: '20%', left: '15%', right: '15%', bottom: '22%' }}>
          {[
            { top: 0, left: 0 },
            { top: 0, right: 0 },
            { bottom: 0, left: 0 },
            { bottom: 0, right: 0 },
          ].map((p, i) => {
            const top = p.top === 0,
              left = p.left === 0;
            const right = p.right === 0,
              bottom = p.bottom === 0;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  ...p,
                  width: 26,
                  height: 26,
                  borderColor: accent,
                  borderStyle: 'solid',
                  borderTopWidth: top ? 3 : 0,
                  borderLeftWidth: left ? 3 : 0,
                  borderBottomWidth: bottom ? 3 : 0,
                  borderRightWidth: right ? 3 : 0,
                }}
              />
            );
          })}
        </div>

        {/* GPS badge */}
        <div
          style={{
            position: 'absolute',
            bottom: 14,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(74,124,89,0.18)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 10px',
            borderRadius: 6,
          }}
        >
          <span className="dot" style={{ background: okColor }} />
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              letterSpacing: '0.08em',
              color: okColor,
            }}
          >
            GPS LOCKED · WHITEFIELD
          </span>
        </div>
      </div>

      {/* Controls strip — paper background */}
      <div style={{ padding: '16px 24px 18px', background: 'var(--paper)' }}>
        {/* Dot row */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 6 }}>
          {Array.from({ length: Math.max(minPhotos, photoCount) }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                background: i < photoCount ? accent : 'var(--paper-3)',
              }}
            />
          ))}
        </div>
        <div
          style={{
            textAlign: 'center',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: '0.08em',
            color: 'var(--ink-3)',
            marginBottom: 14,
          }}
        >
          <span style={{ color: accent }}>{photoCount}</span>
          <span>/{minPhotos} MINIMUM</span>
        </div>

        {/* Shutter row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 28,
            marginBottom: hasMin ? 14 : 0,
          }}
        >
          {/* Gallery thumb */}
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 8,
              background: 'var(--paper-3)',
              border: '1px solid var(--card-edge)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: accent,
              fontWeight: 700,
              fontSize: 18,
            }}
          >
            {photoCount > 0 ? photoCount : ''}
          </div>

          {/* Shutter — 78px outer ring, 60px inner circle */}
          <div
            style={{
              width: 78,
              height: 78,
              borderRadius: '50%',
              border: `3px solid ${accent}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            <div
              style={{
                position: 'absolute',
                inset: -8,
                border: '1px solid rgba(192,73,42,0.25)',
                borderRadius: '50%',
              }}
            />
            <div
              style={{
                width: 58,
                height: 58,
                borderRadius: '50%',
                background: accent,
              }}
            />
          </div>

          {/* Flip */}
          <div
            style={{
              width: 46,
              height: 46,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <WGlyph
              d="M21 12a9 9 0 0 1-15 6.7L3 16M3 12a9 9 0 0 1 15-6.7L21 8"
              size={20}
              color="var(--ink-2)"
            />
          </div>
        </div>

        {hasMin && (
          <button
            style={{
              width: '100%',
              height: 52,
              background: 'var(--ink)',
              color: 'var(--card)',
              border: 'none',
              borderRadius: 12,
              fontWeight: 700,
              fontSize: 16,
              cursor: 'pointer',
            }}
          >
            {isAfter ? 'Review & submit' : 'Review photos'}
          </button>
        )}
      </div>
    </WPhone>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 4. GALLERY (BEFORE) — 2-column grid with border-left accent
// ──────────────────────────────────────────────────────────────────────────
function WorkerGallery({ mode = 'before' }) {
  const isAfter = mode === 'after';
  const accent = 'var(--accent)';
  const okColor = '#4a7c59';
  const borderAccent = isAfter ? okColor : accent;
  const photos = isAfter ? [1, 2, 3, 4] : [1, 2, 3];
  return (
    <WPhone>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 20px',
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <WGlyph d="M19 12H5M11 5l-7 7 7 7" size={20} color="var(--ink)" />
        </div>
        <div
          style={{
            flex: 1,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: '-0.4px',
            color: 'var(--ink)',
          }}
        >
          {isAfter ? 'After photos' : 'Before photos'}
        </div>
        <div
          style={{
            background: accent,
            color: 'var(--card)',
            padding: '3px 10px',
            borderRadius: 999,
            fontWeight: 700,
            fontSize: 12,
            minWidth: 28,
            textAlign: 'center',
          }}
        >
          {photos.length}
        </div>
      </div>

      {/* Grid */}
      <div style={{ padding: '4px 16px 100px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {photos.map((i) => (
          <div
            key={i}
            style={{
              width: 'calc(50% - 4px)',
              aspectRatio: '1 / 1',
              background: 'linear-gradient(140deg, #d8c8a8 0%, #b8a888 100%)',
              borderRadius: 12,
              position: 'relative',
              overflow: 'hidden',
              borderLeft: `3px solid ${borderAccent}`,
              borderTop: '1px solid var(--card-edge)',
              borderRight: '1px solid var(--card-edge)',
              borderBottom: '1px solid var(--card-edge)',
            }}
          >
            {/* Number badge */}
            <div
              style={{
                position: 'absolute',
                top: 8,
                left: 8,
                background: accent,
                color: 'var(--card)',
                padding: '2px 6px',
                borderRadius: 4,
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                fontSize: 10,
                letterSpacing: '0.06em',
              }}
            >
              {i}
            </div>
            {/* Delete */}
            <div
              style={{
                position: 'absolute',
                top: 6,
                right: 6,
                width: 26,
                height: 26,
                borderRadius: 13,
                border: '1.5px solid var(--bad)',
                background: 'rgba(168,52,29,0.14)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <WGlyph d="M6 6l12 12M18 6L6 18" size={11} color="var(--bad)" strokeWidth={2.5} />
            </div>
            {/* Faux content */}
            <div
              style={{
                position: 'absolute',
                bottom: 12,
                left: 12,
                right: 12,
                height: 32,
                background: 'rgba(255,255,255,0.18)',
                borderRadius: 4,
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: 50,
                left: 12,
                width: '40%',
                height: 8,
                background: 'rgba(255,255,255,0.14)',
                borderRadius: 2,
              }}
            />
          </div>
        ))}
        {/* Take more */}
        <div
          style={{
            width: 'calc(50% - 4px)',
            aspectRatio: '1 / 1',
            border: `1.5px dashed ${accent}`,
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <WGlyph d="M12 5v14M5 12h14" size={26} color={accent} strokeWidth={2} />
        </div>
      </div>

      {/* CTA bar */}
      <div
        style={{
          padding: '12px 20px 16px',
          borderTop: '1px solid var(--paper-3)',
          background: 'var(--paper)',
        }}
      >
        <button
          style={{
            width: '100%',
            height: 52,
            background: photos.length >= 4 ? 'var(--ink)' : 'var(--paper-3)',
            color: photos.length >= 4 ? 'var(--card)' : 'var(--ink-3)',
            border: 'none',
            borderRadius: 12,
            fontWeight: 700,
            fontSize: 16,
            cursor: 'pointer',
          }}
        >
          {isAfter ? 'Review & submit' : 'Confirm — start cleaning'}
        </button>
      </div>
    </WPhone>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 5. CLEANING TIMER — giant ring, GPS, ONE big CTA
// ──────────────────────────────────────────────────────────────────────────
function TimerRing({
  size = 240,
  stroke = 10,
  pct = 42,
  accent = 'var(--accent)',
  track = 'var(--paper-3)',
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - pct / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={accent}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

function WorkerTimer() {
  const accent = 'var(--accent)';
  return (
    <WPhone>
      {/* Top bar: home / status / spacer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '14px 16px',
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <WGlyph
            d="M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V11z"
            size={20}
            color="var(--ink-3)"
          />
        </div>
        <div
          style={{
            flex: 1,
            marginLeft: 8,
            marginRight: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            background: 'var(--accent-soft)',
            border: '1px solid rgba(192,73,42,0.18)',
            padding: '8px 14px',
            borderRadius: 999,
          }}
        >
          <span className="dot" style={{ background: accent }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: accent }}>Cleaning in progress</span>
        </div>
        <div style={{ width: 40 }} />
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 24px',
          gap: 28,
        }}
      >
        {/* Ring + time */}
        <div
          style={{
            position: 'relative',
            width: 240,
            height: 240,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <TimerRing pct={42} />
          <div style={{ position: 'absolute', textAlign: 'center' }}>
            <div
              style={{
                fontWeight: 800,
                fontSize: 56,
                lineHeight: 1,
                letterSpacing: '-1.5px',
                color: 'var(--ink)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {W_MOCK.session.elapsed}
            </div>
          </div>
        </div>

        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: '0.08em',
            color: 'var(--ink-3)',
          }}
        >
          ELAPSED <span style={{ color: accent }}>·</span> 42% OF SLOT
        </div>

        {/* GPS card */}
        <WCard padding={14} style={{ width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span className="dot" style={{ background: '#4a7c59' }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
              GPS tracking active
            </span>
          </div>
          <div
            style={{
              paddingLeft: 14,
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '0.08em',
              color: 'var(--ink-3)',
            }}
          >
            {W_MOCK.session.gpsPoints} POINTS COLLECTED
          </div>
        </WCard>

        {/* Site info */}
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '0.08em',
              color: 'var(--ink-3)',
              marginBottom: 4,
            }}
          >
            CLEANING AT
          </div>
          <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)' }}>
            {W_MOCK.site.name}
          </div>
        </div>
      </div>

      {/* ONE big CTA */}
      <div style={{ padding: '16px 20px 20px' }}>
        <button
          style={{
            width: '100%',
            height: 56,
            background: 'var(--accent)',
            color: 'var(--card)',
            border: 'none',
            borderRadius: 14,
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: '0.01em',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            cursor: 'pointer',
          }}
        >
          <WGlyph
            d="M3 7h4l2-3h6l2 3h4v12H3V7z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"
            size={18}
            color="var(--card)"
          />
          Done — take AFTER photos
        </button>
      </div>
    </WPhone>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 6. FINAL REVIEW — paired BEFORE/AFTER + stats
// ──────────────────────────────────────────────────────────────────────────
function WorkerFinalReview() {
  const accent = 'var(--accent)';
  const ok = '#4a7c59';
  const pairs = [1, 2, 3, 4];
  return (
    <WPhone>
      <div style={{ display: 'flex', alignItems: 'center', padding: '14px 20px' }}>
        <div
          style={{
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <WGlyph d="M19 12H5M11 5l-7 7 7 7" size={20} color="var(--ink)" />
        </div>
        <div
          style={{
            flex: 1,
            textAlign: 'center',
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: '-0.4px',
            color: 'var(--ink)',
          }}
        >
          Review &amp; submit
        </div>
        <div style={{ width: 36 }} />
      </div>

      <div style={{ padding: '4px 16px 130px', overflowY: 'auto' }}>
        {/* Stats card */}
        <WCard padding={16} style={{ marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[
              { n: '8', l: 'Photos' },
              { n: '28m', l: 'Duration' },
              { n: 'OK', l: 'GPS' },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: 22,
                    color: 'var(--ink)',
                    letterSpacing: '-0.5px',
                  }}
                >
                  {s.n}
                </div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--ink-3)',
                    marginTop: 2,
                  }}
                >
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        </WCard>

        {/* Labels row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div
            style={{
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
              padding: '6px 0',
              borderRadius: 6,
              textAlign: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.1em',
            }}
          >
            BEFORE
          </div>
          <div
            style={{
              background: 'var(--ok-soft)',
              color: '#2e5037',
              padding: '6px 0',
              borderRadius: 6,
              textAlign: 'center',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.1em',
            }}
          >
            AFTER
          </div>
        </div>

        {/* Pairs */}
        {pairs.map((i) => (
          <div
            key={i}
            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 4 }}
          >
            {[
              {
                tone: 'before',
                color: accent,
                bg: 'linear-gradient(140deg, #d8c8a8 0%, #b8a888 100%)',
              },
              { tone: 'after', color: ok, bg: 'linear-gradient(140deg, #c5d6c0 0%, #a0b89c 100%)' },
            ].map((p, j) => (
              <div
                key={j}
                style={{
                  aspectRatio: '1 / 1',
                  borderRadius: 10,
                  position: 'relative',
                  background: p.bg,
                  borderLeft: `3px solid ${p.color}`,
                  borderTop: '1px solid var(--card-edge)',
                  borderRight: '1px solid var(--card-edge)',
                  borderBottom: '1px solid var(--card-edge)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    bottom: 8,
                    left: 8,
                    right: 8,
                    height: 24,
                    background: 'rgba(255,255,255,0.18)',
                    borderRadius: 4,
                  }}
                />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* CTA + hint */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          padding: '14px 20px 18px',
          background: 'linear-gradient(180deg, transparent, var(--paper) 30%)',
        }}
      >
        <button
          style={{
            width: '100%',
            height: 52,
            background: accent,
            color: 'var(--card)',
            border: 'none',
            borderRadius: 12,
            fontWeight: 700,
            fontSize: 16,
            cursor: 'pointer',
          }}
        >
          Submit for verification
        </button>
        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--ink-3)', marginTop: 8 }}>
          AI will verify within 30 seconds
        </div>
      </div>
    </WPhone>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 7. SUCCESS — concentric rings burst + score card + completed strip
// ──────────────────────────────────────────────────────────────────────────
function WorkerSuccess() {
  const accent = 'var(--accent)';
  const score = 92;
  return (
    <WPhone>
      <div style={{ padding: '40px 24px 0', textAlign: 'center' }}>
        {/* Concentric rings */}
        <div
          style={{
            width: 104,
            height: 104,
            margin: '0 auto 28px',
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              position: 'absolute',
              width: 104,
              height: 104,
              borderRadius: 52,
              border: '1px solid var(--accent-soft)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              width: 80,
              height: 80,
              borderRadius: 40,
              border: '1px solid rgba(192,73,42,0.4)',
            }}
          />
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: 30,
              background: accent,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <WGlyph d="M5 12l5 5L20 7" size={28} color="var(--card)" strokeWidth={3} />
          </div>
        </div>

        <div
          style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.6px', color: 'var(--ink)' }}
        >
          Site verified
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 4, marginBottom: 28 }}>
          Phoenix Mall — B1 · Whitefield, Bangalore
        </div>

        {/* Score card */}
        <WCard padding={20} style={{ marginBottom: 14 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '0.1em',
              color: 'var(--ink-3)',
              marginBottom: 8,
            }}
          >
            AI VERIFICATION SCORE
          </div>
          <div
            style={{
              fontWeight: 800,
              fontSize: 64,
              lineHeight: 1,
              letterSpacing: '-2px',
              color: accent,
              marginBottom: 4,
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            {score}
            <span style={{ fontSize: 22, color: 'var(--ink-3)', fontWeight: 600 }}>/100</span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#2e5037', marginBottom: 16 }}>
            Excellent work
          </div>
          <div
            style={{
              paddingTop: 14,
              borderTop: '1px solid var(--paper-3)',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: 8,
            }}
          >
            {[
              { n: '8', l: 'Photos' },
              { n: '28m', l: 'Duration' },
              { n: 'OK', l: 'GPS' },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--ink)' }}>{s.n}</div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'var(--ink-3)',
                    marginTop: 2,
                  }}
                >
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        </WCard>

        {/* Completed strip */}
        <div
          style={{
            width: '100%',
            background: accent,
            color: 'var(--card)',
            borderRadius: 12,
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.1em',
            }}
          >
            SITE COMPLETED
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px' }}>WORK LOGGED</div>
        </div>
      </div>

      <div style={{ marginTop: 'auto', padding: '14px 20px 18px' }}>
        <button
          style={{
            width: '100%',
            height: 52,
            background: 'var(--card)',
            color: 'var(--ink)',
            border: '1px solid var(--card-edge)',
            borderRadius: 12,
            fontWeight: 700,
            fontSize: 16,
            cursor: 'pointer',
          }}
        >
          Back to home
        </button>
      </div>
    </WPhone>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 8. HISTORY — week selector + summary + timeline
// ──────────────────────────────────────────────────────────────────────────
function WorkerHistory() {
  const accent = 'var(--accent)';
  const days = [
    { label: 'Su', date: 3 },
    { label: 'Mo', date: 4 },
    { label: 'Tu', date: 5 },
    { label: 'We', date: 6, today: true, selected: true },
    { label: 'Th', date: 7 },
    { label: 'Fr', date: 8 },
    { label: 'Sa', date: 9 },
  ];
  return (
    <WPhone>
      {/* Header */}
      <div
        style={{
          background: 'var(--card)',
          padding: '14px 20px 14px',
          borderBottom: '1px solid var(--paper-3)',
        }}
      >
        <div
          style={{
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: '-0.6px',
            color: 'var(--ink)',
            lineHeight: 1.1,
          }}
        >
          History
        </div>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
            marginTop: 4,
          }}
        >
          May 2026
        </div>
      </div>

      {/* Week selector */}
      <div
        style={{
          background: 'var(--card)',
          padding: '12px 8px',
          borderBottom: '1px solid var(--paper-3)',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <WGlyph d="M15 6l-6 6 6 6" size={18} color="var(--ink-3)" />
        </div>
        <div
          style={{
            flex: 1,
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 2,
            background: 'var(--paper-2)',
            padding: 4,
            borderRadius: 12,
          }}
        >
          {days.map((d) => (
            <div
              key={d.date}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 1,
                padding: '8px 0',
                borderRadius: 8,
                background: d.selected ? accent : 'transparent',
                border: d.today && !d.selected ? `1px solid ${accent}` : 'none',
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: d.selected ? 'var(--card)' : 'var(--ink-3)',
                }}
              >
                {d.label}
              </div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: d.selected ? 'var(--card)' : d.today ? accent : 'var(--ink-2)',
                }}
              >
                {d.date}
              </div>
            </div>
          ))}
        </div>
        <div
          style={{
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <WGlyph d="M9 6l6 6-6 6" size={18} color="var(--ink-3)" />
        </div>
      </div>

      {/* Summary card */}
      <div style={{ padding: '14px 16px 0' }}>
        <WCard padding={20}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 36,
                  fontWeight: 800,
                  lineHeight: 1,
                  letterSpacing: '-1px',
                  color: 'var(--ink)',
                }}
              >
                4
              </div>
              <div style={{ fontSize: 14, color: 'var(--ink-2)', marginTop: 4 }}>
                sites completed
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  letterSpacing: '0.08em',
                  color: 'var(--ink-3)',
                  marginTop: 8,
                }}
              >
                2H 0M TOTAL
              </div>
            </div>
            <div style={{ width: 1, height: 56, background: 'var(--paper-3)', margin: '0 18px' }} />
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  letterSpacing: '0.1em',
                  color: 'var(--ink-3)',
                  marginBottom: 4,
                }}
              >
                AVG SCORE
              </div>
              <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1, color: accent }}>86</div>
            </div>
          </div>
        </WCard>
      </div>

      {/* Timeline */}
      <div style={{ padding: '16px 16px 24px' }}>
        {W_MOCK.history.map((v, i) => (
          <div key={i} style={{ display: 'flex', minHeight: 76 }}>
            {/* Left rail */}
            <div
              style={{ width: 28, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            >
              {i > 0 && <div style={{ width: 2, flex: 1, background: accent, opacity: 0.5 }} />}
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 7,
                  background: accent,
                  margin: '4px 0',
                }}
              />
              {i < W_MOCK.history.length - 1 && (
                <div style={{ width: 2, flex: 1, background: accent, opacity: 0.5 }} />
              )}
            </div>
            {/* Card */}
            <WCard padding={14} style={{ flex: 1, marginLeft: 8, marginBottom: 8 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: 'var(--ink)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {v.name}
                </div>
                <span
                  style={{
                    background: v.score >= 80 ? 'var(--accent-soft)' : 'var(--warn-soft)',
                    color: v.score >= 80 ? 'var(--accent-ink)' : '#7a5a08',
                    padding: '3px 8px',
                    borderRadius: 4,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {v.score}
                </span>
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                  color: 'var(--ink-2)',
                  marginTop: 4,
                }}
              >
                {v.time}
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--ink-3)',
                  marginTop: 1,
                }}
              >
                {v.dur}
              </div>
            </WCard>
          </div>
        ))}
      </div>
      <WTabs active="history" />
    </WPhone>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 9. PROFILE — header card, performance, stats, sync, theme presets, logout
// ──────────────────────────────────────────────────────────────────────────
function WorkerProfile() {
  const accent = 'var(--accent)';
  const score = W_MOCK.worker.avgScore;
  const presets = ['Dim', 'Default', 'Warm', 'Bright', 'Custom'];
  return (
    <WPhone>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Header card — NO horizontal margin (full-bleed) */}
        <div
          style={{
            background: 'var(--card)',
            padding: '32px 20px 24px',
            textAlign: 'center',
            borderBottom: '1px solid var(--paper-3)',
          }}
        >
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              margin: '0 auto 14px',
              background: 'var(--accent-soft)',
              border: '2px solid rgba(192,73,42,0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 30,
              fontWeight: 700,
              color: 'var(--accent-ink)',
            }}
          >
            {W_MOCK.worker.initial}
          </div>
          <div
            style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.5px', color: 'var(--ink)' }}
          >
            {W_MOCK.worker.name}
          </div>
          <div style={{ fontSize: 14, color: 'var(--ink-2)', marginTop: 4 }}>
            {W_MOCK.worker.phone}
          </div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              background: 'var(--ok-soft)',
              color: '#2e5037',
              padding: '4px 10px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              marginTop: 10,
            }}
          >
            <WGlyph
              d="M12 2L4 6v6c0 5 3.5 9.5 8 10 4.5-.5 8-5 8-10V6l-8-4z"
              size={12}
              color="#2e5037"
              fill="#2e5037"
            />
            Verified
          </div>
        </div>

        {/* Performance card */}
        <div style={{ padding: '12px 16px 0' }}>
          <WCard padding={16}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  border: `3px solid ${accent}`,
                  background: 'var(--paper-2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: 22,
                  color: accent,
                }}
              >
                {score}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink)' }}>
                  Quality score
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: accent, marginTop: 2 }}>
                  Great
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 4 }}>
                  Based on AI review of last 100 sites
                </div>
              </div>
            </div>
          </WCard>
        </div>

        {/* Stats row */}
        <div
          style={{
            padding: '8px 16px 0',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 8,
          }}
        >
          <WCard padding={14} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>
              {W_MOCK.worker.totalSites}
            </div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--ink-3)',
                marginTop: 2,
              }}
            >
              Total sites
            </div>
          </WCard>
          <WCard padding={14} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>
              {W_MOCK.worker.thisMonth}
            </div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--ink-3)',
                marginTop: 2,
              }}
            >
              This month
            </div>
          </WCard>
          <WCard padding={14} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: accent }}>{score}</div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--ink-3)',
                marginTop: 2,
              }}
            >
              Avg score
            </div>
          </WCard>
        </div>

        {/* Sync card */}
        <div style={{ padding: '8px 16px 0' }}>
          <WCard padding={14}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>Synced</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
                  All data is up to date
                </div>
              </div>
              <span
                style={{
                  background: 'var(--ok-soft)',
                  color: '#2e5037',
                  padding: '4px 10px',
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                All synced
              </span>
            </div>
          </WCard>
        </div>

        {/* Theme presets — locked spec only allows accent variant terracotta vs vermilion */}
        <div style={{ padding: '8px 16px 0' }}>
          <WCard padding={14}>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--ink-3)',
                marginBottom: 10,
              }}
            >
              APPEARANCE
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {presets.map((p, i) => {
                const active = i === 1; // Default
                return (
                  <div
                    key={p}
                    style={{
                      padding: '8px 14px',
                      borderRadius: 999,
                      border: '1px solid var(--card-edge)',
                      background: active ? accent : 'transparent',
                      color: active ? 'var(--card)' : 'var(--ink)',
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    {p}
                  </div>
                );
              })}
            </div>
          </WCard>
        </div>

        {/* Footer */}
        <div
          style={{
            textAlign: 'center',
            fontSize: 11,
            color: 'var(--ink-3)',
            marginTop: 18,
            paddingBottom: 12,
          }}
        >
          Member since January 2024
          <br />
          Axhy v1.0.0
        </div>
      </div>
      <WTabs active="profile" />
    </WPhone>
  );
}

Object.assign(window, {
  WorkerToday,
  WorkerQRScan,
  WorkerCamera,
  WorkerGallery,
  WorkerTimer,
  WorkerFinalReview,
  WorkerSuccess,
  WorkerHistory,
  WorkerProfile,
});
