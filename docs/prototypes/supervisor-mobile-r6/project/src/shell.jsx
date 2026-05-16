/* global React, I */
// Phone frames + tab bar + shared chrome. iOS-only (ADR-0021 + ADR-0016).

const StatusBar = ({ textColor = 'var(--ink)' }) => {
  return (
    <div
      style={{
        height: 44,
        padding: '14px 28px 0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'relative',
        flexShrink: 0,
        color: textColor,
      }}
    >
      <span className="mono" style={{ fontSize: 13, fontWeight: 700 }}>
        9:41
      </span>
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 110,
          height: 28,
          background: '#000',
          borderRadius: 20,
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <I.SignalDot />
        <I.Wifi size={14} />
        <span
          style={{
            display: 'inline-block',
            width: 22,
            height: 11,
            border: `1px solid ${textColor === 'var(--ink)' ? 'var(--ink)' : textColor}`,
            borderRadius: 3,
            position: 'relative',
            padding: 1,
          }}
        >
          <span
            style={{
              display: 'block',
              width: '78%',
              height: '100%',
              background: 'currentColor',
              borderRadius: 1,
            }}
          />
        </span>
      </div>
    </div>
  );
};

function PhoneFrame({ children, label, sublabel }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      {label && (
        <div style={{ textAlign: 'center' }}>
          <div className="t-caption" style={{ color: 'var(--accent)' }}>
            {label}
          </div>
          {sublabel && (
            <div className="t-body-sm" style={{ color: 'var(--ink-3)', marginTop: 2 }}>
              {sublabel}
            </div>
          )}
        </div>
      )}
      <div
        style={{
          width: 390,
          height: 844,
          background: '#1a1612',
          borderRadius: 56,
          padding: 10,
          boxShadow: 'var(--sh-3)',
          position: 'relative',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 46,
            overflow: 'hidden',
            background: 'var(--paper)',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

function TabBar({ active, onChange }) {
  // Tab order locked 2026-05-11 per operations-first reframing:
  // Today (daily home) → Decisions (proposal queue) → Activity (proof) → Chat (messy-input) → Profile.
  const pendingDecisions = (window.AxhyData?.supervisorDecisions || []).filter(
    (d) => d.status === 'proposed',
  ).length;
  const tabs = [
    { key: 'today', label: 'Today', Icon: I.Calendar },
    {
      key: 'decisions',
      label: 'Decisions',
      Icon: I.Bell,
      badge: pendingDecisions > 0 ? pendingDecisions : undefined,
    },
    { key: 'activity', label: 'Activity', Icon: I.BarChart },
    { key: 'chat', label: 'Chat', Icon: I.MessageSquare },
    { key: 'profile', label: 'Profile', Icon: I.User },
  ];
  return (
    <div
      style={{
        flexShrink: 0,
        borderTop: '1px solid var(--card-edge)',
        background: 'var(--card)',
        paddingBottom: 18,
        paddingTop: 8,
        display: 'flex',
      }}
    >
      {tabs.map((t) => {
        const isActive = active === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: '6px 0',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: isActive ? 'var(--accent)' : 'var(--ink-3)',
              fontFamily: 'inherit',
              position: 'relative',
            }}
          >
            <div style={{ position: 'relative' }}>
              <t.Icon size={22} />
              {t.badge && (
                <span
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -8,
                    minWidth: 16,
                    height: 16,
                    padding: '0 4px',
                    borderRadius: 999,
                    background: 'var(--bad)',
                    color: 'var(--card)',
                    fontSize: 10,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {t.badge}
                </span>
              )}
            </div>
            <span style={{ fontSize: 11, fontWeight: 600 }}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function Greeting({ persona, hideName }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <div className="t-caption" style={{ color: 'var(--accent)', marginBottom: 4 }}>
          TUESDAY · 9:41 AM
        </div>
        {!hideName && (
          <>
            <div
              style={{
                fontSize: 24,
                fontWeight: 600,
                color: 'var(--ink)',
                letterSpacing: '-0.4px',
                lineHeight: 1.1,
              }}
            >
              Namaste, {persona.name.split(' ')[0]}.
            </div>
            <div className="t-body-sm" style={{ color: 'var(--ink-3)', marginTop: 4 }}>
              {persona.sitesActive} sites · {persona.workersActive} workers active
            </div>
          </>
        )}
      </div>
      <button
        style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          background: 'var(--paper-3)',
          color: 'var(--ink)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          border: 'none',
          fontFamily: 'inherit',
          cursor: 'pointer',
          fontSize: 15,
        }}
      >
        {persona.initial}
      </button>
    </div>
  );
}

function TierChip({ tier }) {
  const labels = {
    note: 'Note',
    operational: 'Operational',
    personnel: 'Personnel',
    employment: 'Employment',
  };
  return <span className={`tier ${tier}`}>{labels[tier]}</span>;
}

function DecisionCard({ d, onConfirm, onDismiss }) {
  const [confirmText, setConfirmText] = React.useState('');
  const [noteKind, setNoteKind] = React.useState(d.noteKind || 'site_rule');
  const needsTermType = d.tier === 'employment';
  const canConfirm = !needsTermType || confirmText === 'TERMINATE';
  return (
    <div className="card" style={{ padding: 14 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <TierChip tier={d.tier} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="t-mono-sm mono" style={{ color: 'var(--ink-3)' }}>
            {d.when}
          </span>
          <button
            onClick={() => alert('Edit sheet (mock)')}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              color: 'var(--ink-3)',
              display: 'inline-flex',
            }}
          >
            <I.Edit size={14} />
          </button>
        </div>
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3 }}>
        {d.title}
      </div>
      <div className="t-body-sm" style={{ color: 'var(--ink-2)', marginTop: 4, lineHeight: 1.45 }}>
        {d.body}
      </div>
      {d.multiDay && (
        <div
          style={{
            marginTop: 12,
            background: 'var(--paper-2)',
            border: '1px solid var(--card-edge)',
            borderRadius: 'var(--r-2)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '8px 12px',
              borderBottom: '1px solid var(--card-edge)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span className="t-caption" style={{ color: 'var(--ink-3)' }}>
              DAILY COVER
            </span>
            <span className="t-mono-sm mono" style={{ color: 'var(--ink-4)' }}>
              {d.multiDay.days.length} DAYS · {d.multiDay.startDate}–{d.multiDay.endDate}
            </span>
          </div>
          {d.multiDay.days.map((slot, i) => (
            <div
              key={i}
              style={{
                padding: '10px 12px',
                borderBottom:
                  i < d.multiDay.days.length - 1 ? '1px solid var(--card-edge)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>{slot.day}</div>
                <div
                  className="t-mono-sm mono"
                  style={{ color: 'var(--ink-3)', marginTop: 2, fontSize: 10 }}
                >
                  {slot.site} · {slot.shift}
                </div>
              </div>
              <button
                onClick={() => alert('Replacement picker for ' + slot.day)}
                style={{
                  padding: '6px 10px',
                  background: 'var(--card)',
                  border: '1px solid var(--accent)',
                  color: 'var(--accent)',
                  borderRadius: 'var(--r-2)',
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Pick from {slot.candidates.length}
              </button>
            </div>
          ))}
        </div>
      )}
      {d.money && (
        <div
          className="mono"
          style={{
            marginTop: 8,
            fontSize: 13,
            fontWeight: 600,
            color: d.tier === 'employment' ? 'var(--bad)' : 'var(--ink)',
          }}
        >
          {d.money}
        </div>
      )}
      {needsTermType && (
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
          placeholder="Type TERMINATE to confirm"
          style={{
            marginTop: 10,
            width: '100%',
            padding: '8px 10px',
            background: 'var(--paper-2)',
            border: '1px solid var(--card-edge)',
            borderRadius: 'var(--r-2)',
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            color: 'var(--ink)',
            outline: 'none',
            letterSpacing: '0.05em',
          }}
        />
      )}
      {d.tier === 'note' && (
        <div style={{ marginTop: 10 }}>
          <div
            className="t-caption"
            style={{ color: 'var(--ink-3)', marginBottom: 6, padding: '0 2px' }}
          >
            WHERE TO SAVE
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { v: 'site_rule', l: 'Site rule', sub: 'Visible to client if asked' },
              { v: 'working_note', l: 'My working note', sub: 'Private; auto-scrub' },
            ].map((opt) => {
              const active = noteKind === opt.v;
              return (
                <button
                  key={opt.v}
                  onClick={() => setNoteKind(opt.v)}
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    textAlign: 'left',
                    background: active ? 'var(--accent-soft)' : 'var(--paper-2)',
                    border: '1px solid ' + (active ? 'var(--accent)' : 'var(--card-edge)'),
                    borderRadius: 'var(--r-2)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: active ? 'var(--accent-ink)' : 'var(--ink)',
                    }}
                  >
                    {opt.l}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: 'var(--ink-3)',
                      marginTop: 2,
                      fontFamily: 'var(--font-mono)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {opt.sub}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          onClick={() => canConfirm && onConfirm && onConfirm(d.id)}
          disabled={!canConfirm}
          style={{
            flex: 1,
            padding: '10px 0',
            borderRadius: 'var(--r-2)',
            background:
              d.tier === 'employment'
                ? 'var(--bad)'
                : d.tier === 'personnel'
                  ? 'var(--accent)'
                  : 'var(--ink)',
            color: 'var(--card)',
            border: 'none',
            fontSize: 14,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: canConfirm ? 'pointer' : 'not-allowed',
            opacity: canConfirm ? 1 : 0.4,
          }}
        >
          {d.tier === 'employment' ? 'Confirm termination' : 'Confirm'}
        </button>
        <button
          onClick={() => onDismiss && onDismiss(d.id)}
          style={{
            flex: 1,
            padding: '10px 0',
            borderRadius: 'var(--r-2)',
            background: 'transparent',
            color: 'var(--ink-2)',
            border: '1px solid var(--card-edge)',
            fontSize: 14,
            fontWeight: 500,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}

function AmbiguousDecisionCard({ d }) {
  const [pick, setPick] = React.useState(null);
  return (
    <div
      className="card"
      style={{
        padding: 14,
        borderLeft: `3px solid var(--info-ink)`,
        background: 'var(--info-soft)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            borderRadius: 999,
            background: 'var(--card)',
            color: 'var(--info-ink)',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <I.HelpCircle size={10} /> {d.trigger || 'AMBIGUOUS'}
        </span>
        <span className="t-mono-sm mono" style={{ color: 'var(--ink-3)' }}>
          {d.when}
        </span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3 }}>
        {d.title}
      </div>
      <div className="t-body-sm" style={{ color: 'var(--ink-2)', marginTop: 4, lineHeight: 1.45 }}>
        {d.body}
      </div>
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {d.options.map((opt) => (
          <label
            key={opt.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: 10,
              borderRadius: 'var(--r-2)',
              background: pick === opt.id ? 'var(--accent-soft)' : 'var(--card)',
              border: `1px solid ${pick === opt.id ? 'var(--accent)' : 'var(--card-edge)'}`,
              cursor: 'pointer',
            }}
          >
            <input
              type="radio"
              name="ambig"
              checked={pick === opt.id}
              onChange={() => setPick(opt.id)}
              style={{ margin: 0 }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{opt.name}</div>
              <div className="t-body-sm" style={{ color: 'var(--ink-3)', marginTop: 2 }}>
                {opt.context}
              </div>
              {opt.sub && (
                <div className="t-mono-sm mono" style={{ color: 'var(--ink-4)', marginTop: 2 }}>
                  {opt.sub}
                </div>
              )}
            </div>
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          disabled={!pick}
          style={{
            flex: 1,
            padding: '10px 0',
            borderRadius: 'var(--r-2)',
            background: pick ? 'var(--accent)' : 'var(--paper-3)',
            color: pick ? 'var(--card)' : 'var(--ink-4)',
            border: 'none',
            fontSize: 14,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: pick ? 'pointer' : 'not-allowed',
          }}
        >
          Pick
        </button>
        <button
          style={{
            flex: 1,
            padding: '10px 0',
            borderRadius: 'var(--r-2)',
            background: 'transparent',
            color: 'var(--ink-2)',
            border: '1px solid var(--card-edge)',
            fontSize: 14,
            fontWeight: 500,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          Re-record
        </button>
      </div>
    </div>
  );
}

function HeavySummaryCard({ d, onOpen }) {
  const tierColor = d.tier === 'employment' ? 'bad' : d.tier === 'personnel' ? 'accent' : 'ink';
  return (
    <div
      className="card"
      style={{
        padding: 14,
        borderLeft: `3px solid var(--${tierColor})`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <TierChip tier={d.tier} />
        <span className="t-mono-sm mono" style={{ color: 'var(--ink-3)' }}>
          {d.when}
        </span>
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3 }}>
        {d.title}
      </div>
      <div className="t-body-sm" style={{ color: 'var(--ink-2)', marginTop: 4, lineHeight: 1.45 }}>
        {d.body}
      </div>
      {d.money && (
        <div
          className="mono"
          style={{
            marginTop: 8,
            fontSize: 13,
            fontWeight: 600,
            color: d.tier === 'employment' ? 'var(--bad)' : 'var(--ink)',
          }}
        >
          {d.money}
        </div>
      )}
      <button
        onClick={() => onOpen && onOpen(d)}
        style={{
          marginTop: 12,
          width: '100%',
          padding: '12px 0',
          background: 'transparent',
          color: 'var(--accent)',
          border: '1px solid var(--accent)',
          borderRadius: 'var(--r-2)',
          fontSize: 14,
          fontWeight: 600,
          fontFamily: 'inherit',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        → Open to decide
      </button>
    </div>
  );
}

function MediumSheet({ children, onClose, title }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(26, 22, 18, 0.4)',
      }}
      onClick={onClose}
    >
      <div style={{ flex: 1 }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--card)',
          borderTopLeftRadius: 'var(--r-4)',
          borderTopRightRadius: 'var(--r-4)',
          padding: '14px 16px 24px',
          boxShadow: 'var(--sh-3)',
          maxHeight: '75%',
          overflow: 'auto',
        }}
      >
        {/* drag handle */}
        <div
          style={{
            width: 36,
            height: 4,
            background: 'var(--ink-4)',
            borderRadius: 2,
            margin: '0 auto 14px',
            opacity: 0.4,
          }}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 14,
          }}
        >
          <span className="t-caption" style={{ color: 'var(--accent)' }}>
            {title}
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 4,
              color: 'var(--ink-3)',
            }}
          >
            <I.X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function MicFAB({ listening, onPress }) {
  return (
    <button
      onClick={onPress}
      style={{
        position: 'absolute',
        bottom: 100,
        right: 18,
        width: 64,
        height: 64,
        borderRadius: '50%',
        background: listening ? 'var(--bad)' : 'var(--accent)',
        color: 'var(--card)',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 1px 0 rgba(0,0,0,0.1), 0 12px 28px rgba(192,73,42,0.45)',
        transition: 'transform 200ms var(--ease)',
        transform: listening ? 'scale(1.05)' : 'scale(1)',
      }}
    >
      {listening ? (
        <I.Pause size={26} color="currentColor" />
      ) : (
        <I.MicSolid size={28} color="currentColor" />
      )}
      {listening && (
        <span
          style={{
            position: 'absolute',
            inset: -6,
            borderRadius: '50%',
            border: '2px solid var(--bad)',
            opacity: 0.4,
            animation: 'micpulse 1.6s ease-out infinite',
          }}
        />
      )}
    </button>
  );
}

function CaptionEyebrow({ children, accent }) {
  return (
    <div
      className="t-caption"
      style={{
        color: accent ? 'var(--accent)' : 'var(--ink-3)',
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

// Change A — universal tappable wrapper for any rendered decision
function DecisionRef({ decisionId, children, onAmend }) {
  return (
    <button
      onClick={() => onAmend && onAmend(decisionId)}
      style={{
        width: '100%',
        textAlign: 'left',
        cursor: 'pointer',
        background: 'transparent',
        border: 'none',
        padding: 0,
        fontFamily: 'inherit',
        display: 'block',
      }}
    >
      {children}
    </button>
  );
}

// Backup-supervisor mode removed (founder-locked 2026-05-08).
// If a supervisor goes on leave, they share their account with someone trustworthy.
// No in-app delegation feature. Audit log records the account holder.

/**
 * r3 — TopAppBar.
 * Sits between StatusBar and tab content. Hamburger left → opens Drawer.
 * Optional contextual actions on the right (search/filter/bell).
 * Follows Zomato/Rapido/PhonePe pattern per friend's lock 2026-05-11.
 *
 * Props:
 *   title: required string
 *   subtitle?: optional small caption above title (e.g. "TUESDAY · 9:41")
 *   onMenu: required () => void  — opens drawer
 *   actions?: array of { icon: ReactNode, label: string, onClick: () => void }
 */
function TopAppBar({ title, subtitle, onMenu, actions }) {
  return (
    <div
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '10px 8px 12px 6px',
        borderBottom: '1px solid var(--card-edge)',
        background: 'var(--paper)',
      }}
    >
      <button
        onClick={onMenu}
        aria-label="Open menu"
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: 8,
          color: 'var(--ink)',
          display: 'inline-flex',
        }}
      >
        <I.Menu size={20} />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        {subtitle && (
          <div className="t-caption" style={{ color: 'var(--accent)', marginBottom: 2 }}>
            {subtitle}
          </div>
        )}
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: 'var(--ink)',
            letterSpacing: '-0.2px',
            lineHeight: 1.2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 2 }}>
        {(actions || []).map((a, i) => (
          <button
            key={i}
            onClick={a.onClick}
            aria-label={a.label}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 8,
              color: 'var(--ink-2)',
              display: 'inline-flex',
            }}
          >
            {a.icon}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * r3 — Drawer.
 * Slide-in left panel for rarely-used surfaces:
 *   profile, memory rules, site rules, language, help, sign out, temp mode.
 * Pattern matches Zomato side drawer.
 *
 * Props:
 *   open: bool
 *   onClose: () => void
 *   persona: { name, role, company }
 */
function Drawer({ open, onClose, persona }) {
  if (!open) return null;
  const items = [
    { icon: I.User, label: 'My profile', sub: 'Stats · streaks · prefs' },
    { icon: I.Sparkle, label: 'Memory & rules', sub: '23 rules · 12 aliases · 8 site notes' },
    { icon: I.Building, label: 'My sites', sub: '8 sites · 3 with active rules' },
    { icon: I.Globe, label: 'Language', sub: 'English · हिन्दी · తెలుగు' },
    { icon: I.Bell, label: 'Notifications', sub: 'Push · WhatsApp · Email' },
    { icon: I.HelpCircle, label: 'How to use Axhy', sub: '60-sec video · examples' },
    { icon: I.Pause, label: 'Temporary mode', sub: 'Pause AI for the day' },
    { icon: I.Logout, label: 'Sign out', sub: null },
  ];
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 200,
        background: 'rgba(29,26,18,0.45)',
        display: 'flex',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '78%',
          height: '100%',
          background: 'var(--paper)',
          boxShadow: 'var(--sh-3)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Drawer header — persona snippet */}
        <div
          style={{
            padding: '18px 18px 14px',
            borderBottom: '1px solid var(--card-edge)',
            background: 'var(--paper-2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                background: 'var(--accent)',
                color: 'var(--card)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 16,
                fontFamily: 'var(--font-sans)',
              }}
            >
              {persona.name
                .split(' ')
                .map((p) => p[0])
                .slice(0, 2)
                .join('')}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: 'var(--ink)',
                  lineHeight: 1.2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {persona.name}
              </div>
              <div className="t-mono-sm mono" style={{ color: 'var(--ink-3)', marginTop: 2 }}>
                SUPERVISOR · {persona.company || 'Surya Facility Services'}
              </div>
            </div>
          </div>
        </div>
        {/* Menu list */}
        <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
          {items.map((it, i) => {
            const Icon = it.icon;
            const isSignOut = it.label === 'Sign out';
            return (
              <button
                key={i}
                onClick={onClose}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '12px 18px',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  borderTop: isSignOut ? '1px solid var(--card-edge)' : 'none',
                  marginTop: isSignOut ? 6 : 0,
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    background: 'var(--paper-2)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: isSignOut ? 'var(--bad)' : 'var(--ink-2)',
                    flexShrink: 0,
                  }}
                >
                  <Icon size={14} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: isSignOut ? 'var(--bad)' : 'var(--ink)',
                    }}
                  >
                    {it.label}
                  </div>
                  {it.sub && (
                    <div className="t-mono-sm mono" style={{ color: 'var(--ink-3)', marginTop: 2 }}>
                      {it.sub}
                    </div>
                  )}
                </div>
                {!isSignOut && <I.ChevronRight size={14} color="var(--ink-4)" />}
              </button>
            );
          })}
        </div>
        {/* Drawer footer */}
        <div
          style={{
            padding: '12px 18px',
            borderTop: '1px solid var(--card-edge)',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            color: 'var(--ink-4)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Axhy v3 · build 2026.05.11
        </div>
      </div>
    </div>
  );
}

window.AxhyShell = {
  StatusBar,
  PhoneFrame,
  TabBar,
  TopAppBar,
  Drawer,
  Greeting,
  TierChip,
  DecisionCard,
  AmbiguousDecisionCard,
  HeavySummaryCard,
  MediumSheet,
  MicFAB,
  CaptionEyebrow,
  DecisionRef,
};
