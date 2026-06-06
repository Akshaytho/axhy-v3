// Axhy — shared phone atoms, role-switcher state, mock data
// Loaded after React; exports to window.

const NOW = '9:18';
const TODAY_STR = 'Wed, 6 May';

// Mock data drawn from doc §6 (Suresh / Mukesh / Reddy Cleaning)
const MOCK = {
  supervisor: { name: 'Suresh', role: 'SUPERVISOR', company: 'Reddy Cleaning Services' },
  pulse: {
    sitesCovered: 11,
    sitesShort: 1,
    visitsInProgress: 7,
    visitsDone: 14,
    workersExpected: 23,
    workersPresent: 21,
    absent: 1,
    pendingDecisions: 3,
  },
  workers: [
    {
      id: 'mukesh',
      name: 'Mukesh K.',
      site: 'Phoenix Mall — B1',
      state: 'NO_CALL',
      shift: '6:30 AM',
      initial: 'M',
      phone: '+91 98765 43210',
    },
    {
      id: 'ravi',
      name: 'Ravi S.',
      site: 'Lulu Mall — Tower A',
      state: 'ON_VISIT',
      shift: '6:00 AM',
      initial: 'R',
    },
    {
      id: 'priya',
      name: 'Priya M.',
      site: 'Brigade Tower 3',
      state: 'ON_VISIT',
      shift: '7:00 AM',
      initial: 'P',
    },
    {
      id: 'asha',
      name: 'Asha B.',
      site: 'Manyata Block 4',
      state: 'BREAK',
      shift: '6:30 AM',
      initial: 'A',
    },
    {
      id: 'vikram',
      name: 'Vikram T.',
      site: 'Embassy Tech — Wing C',
      state: 'ASSIGNED',
      shift: '8:00 AM',
      initial: 'V',
    },
    {
      id: 'lakshmi',
      name: 'Lakshmi P.',
      site: 'Prestige Falcon',
      state: 'ON_VISIT',
      shift: '6:00 AM',
      initial: 'L',
    },
  ],
  leaves: [
    {
      id: 'lr_1',
      worker: 'Geetha R.',
      dates: 'Fri 8 May',
      reason: 'Daughter\u2019s school event',
      initial: 'G',
      submitted: '7:42 AM',
    },
    {
      id: 'lr_2',
      worker: 'Naveen H.',
      dates: 'Mon 11 May \u2192 Wed 13 May',
      reason: 'Travel home (Tumkur)',
      initial: 'N',
      submitted: 'Yesterday',
    },
  ],
  complaints: [
    {
      id: 'c_1',
      site: 'Phoenix Mall — B1',
      age: '2nd day',
      issue: 'Restrooms not deep-cleaned per checklist',
    },
  ],
  decisions: [
    {
      id: 'd1',
      kind: 'MARK_ABSENT',
      label: 'Mark Mukesh absent',
      meta: '\u20b9500 deduct \u00b7 HR notified',
      tier: 'PERSONNEL',
    },
    {
      id: 'd2',
      kind: 'APPROVE_LEAVE',
      label: 'Approve Geetha\u2019s leave (Fri)',
      meta: 'Reassign Phoenix Mall',
      tier: 'PERSONNEL',
    },
    {
      id: 'd3',
      kind: 'SWAP',
      label: 'Move Vikram \u2192 Phoenix B1',
      meta: 'Cover Mukesh\u2019s shift',
      tier: 'OPERATIONAL',
    },
  ],
  chat: [
    {
      from: 'ai',
      text: 'Good morning, Suresh. Loaded your day at 3:30 AM \u2014 23 workers across 11 sites.',
      time: '6:42 AM',
    },
    {
      from: 'ai',
      text: 'Three things waiting on you:',
      time: '6:42 AM',
      list: [
        '\u2022 Mukesh hasn\u2019t shown at Phoenix Mall (no call, 47 min late)',
        '\u2022 Geetha requested leave for Fri',
        '\u2022 Day 2 of restroom complaint at Phoenix \u2014 may need to escalate',
      ],
    },
    {
      from: 'me',
      text: 'mukesh ko absent mark karo, aur Vikram ko Phoenix bhejo',
      time: '9:17 AM',
      voice: true,
      dur: '4s',
    },
    { from: 'ai', text: 'Got it \u2014 two decisions:', time: '9:17 AM', decisions: ['d1', 'd3'] },
  ],
};

// Inline icons — single-line strokes, currentColor
function Icon({ name, size = 20, color = 'currentColor', strokeWidth = 1.7 }) {
  const paths = {
    absent:
      'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4.4 3.6-8 8-8s8 3.6 8 8 M16 7l4 4M20 7l-4 4',
    leave:
      'M3 8h18M5 8V5a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3M3 8v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8 M8 4v4M16 4v4 M9 14l2 2 4-4',
    complaint: 'M12 9v4M12 17h0 M3 12a9 9 0 1 1 18 0 9 9 0 0 1-18 0z',
    swap: 'M7 7h13l-3-3M17 17H4l3 3',
    visit: 'M9 11l3 3 7-7 M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0',
    mic: 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v4 M8 23h8',
    chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z',
    chevron: 'M9 6l6 6-6 6',
    chevronD: 'M6 9l6 6 6-6',
    bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.7 21a2 2 0 0 1-3.4 0',
    plus: 'M12 5v14M5 12h14',
    settings:
      'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
    check: 'M5 12l5 5L20 7',
    x: 'M6 6l12 12M18 6L6 18',
    arrow: 'M5 12h14M13 5l7 7-7 7',
    arrowL: 'M19 12H5M11 5l-7 7 7 7',
    send: 'M5 12l16-7-7 16-2-7-7-2z',
    menu: 'M3 6h18M3 12h18M3 18h18',
    flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
    sparkle:
      'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z M19 17l.6 1.8L21 19.5l-1.4.7L19 22l-.6-1.8L17 19.5l1.4-.7z',
    site: 'M3 21h18 M5 21V8l7-5 7 5v13 M9 21v-6h6v6',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8',
    clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
    pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
    stop: 'M6 6h12v12H6z',
    refresh: 'M3 12a9 9 0 0 1 15-6.7L21 8 M21 3v5h-5 M21 12a9 9 0 0 1-15 6.7L3 16 M3 21v-5h5',
    filter: 'M3 5h18l-7 9v6l-4-2v-4L3 5z',
    pin: 'M12 2v8a4 4 0 0 1 0 8v4 M8 14l-4 4',
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d={paths[name] || paths.chat} />
    </svg>
  );
}

function StatusBar() {
  return (
    <div className="status-bar">
      <span>{NOW}</span>
      <div className="status-icons">
        <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor">
          <path d="M0 9h2v3H0zM4 6h2v6H4zM8 3h2v9H8zM12 0h2v12h-2z" />
        </svg>
        <svg width="14" height="12" viewBox="0 0 14 12" fill="currentColor">
          <path d="M7 12L0 5a10 10 0 0 1 14 0z" />
        </svg>
        <svg
          width="22"
          height="12"
          viewBox="0 0 22 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        >
          <rect x="1" y="2" width="18" height="8" rx="1.5" />
          <rect x="3" y="4" width="13" height="4" fill="currentColor" />
          <rect x="20" y="4.5" width="1.5" height="3" rx="0.5" fill="currentColor" />
        </svg>
      </div>
    </div>
  );
}

function NavPill() {
  return <div className="nav-pill" />;
}

function Phone({ children, screenStyle }) {
  return (
    <div className="phone">
      <div className="phone-screen" style={screenStyle}>
        <StatusBar />
        <div className="screen-body">{children}</div>
        <NavPill />
      </div>
    </div>
  );
}

// Avatar circle with initials
function Avatar({ initial, size = 36, tone = 'paper', dot }) {
  const tones = {
    paper: { bg: '#e6dcc8', fg: '#4a3f33' },
    accent: { bg: '#f5dac9', fg: '#6e2410' },
    ok: { bg: '#d6e5d0', fg: '#2e5037' },
    bad: { bg: '#f0c8bd', fg: '#6e2410' },
    ink: { bg: '#1a1612', fg: '#fdfaf3' },
  };
  const t = tones[tone] || tones.paper;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: t.bg,
        color: t.fg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 600,
        fontSize: size * 0.42,
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {initial}
      {dot && (
        <span
          style={{
            position: 'absolute',
            right: -1,
            bottom: -1,
            width: size * 0.32,
            height: size * 0.32,
            borderRadius: '50%',
            background: dot,
            boxShadow: '0 0 0 2px var(--card)',
          }}
        />
      )}
    </div>
  );
}

// Section heading inside a screen
function Section({ title, action, children, pad = '16px 20px 8px' }) {
  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          padding: pad,
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
          {title}
        </div>
        {action}
      </div>
      {children}
    </>
  );
}

// Decision card — Suresh's tappable proposed action
function DecisionCard({ d, onAccept, onReject, accepted }) {
  const tierColor = {
    PERSONNEL: 'var(--accent-soft)',
    OPERATIONAL: 'var(--info-soft)',
    NOTE: 'var(--paper-3)',
  }[d.tier];
  const tierInk = {
    PERSONNEL: 'var(--accent-ink)',
    OPERATIONAL: 'var(--info-ink)',
    NOTE: 'var(--ink-2)',
  }[d.tier];
  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--card-edge)',
        borderRadius: 14,
        padding: '14px 16px',
        boxShadow: 'var(--sh-1)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        opacity: accepted === 'rejected' ? 0.5 : 1,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: tierColor,
            color: tierInk,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon
            name={
              d.kind === 'MARK_ABSENT' ? 'absent' : d.kind === 'APPROVE_LEAVE' ? 'leave' : 'swap'
            }
            size={16}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span
              style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: tierInk }}
            >
              {d.tier}
            </span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3 }}>
            {d.label}
          </div>
          <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 2 }}>{d.meta}</div>
        </div>
      </div>
      {accepted === 'accepted' ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--ok)',
          }}
        >
          <Icon name="check" size={16} /> Applied · audit logged
        </div>
      ) : accepted === 'rejected' ? (
        <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>Dismissed</div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onReject}
            style={{
              flex: 1,
              height: 38,
              border: '1px solid var(--card-edge)',
              background: 'transparent',
              borderRadius: 10,
              fontWeight: 600,
              fontSize: 14,
              color: 'var(--ink-2)',
              cursor: 'pointer',
            }}
          >
            Not now
          </button>
          <button
            onClick={onAccept}
            style={{
              flex: 2,
              height: 38,
              border: 'none',
              background: 'var(--ink)',
              color: 'var(--card)',
              borderRadius: 10,
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { Phone, Icon, Avatar, Section, DecisionCard, MOCK, NOW, TODAY_STR });
