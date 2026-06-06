// Axhy — Flow screens (used as additional artboards on the canvas)
// Mark-absent confirm · Voice capture · Approve leave · Swap worker
// · Today's plan · Wrap up summary

// ─────────────────────────────────────────────────────────────
// Mark Mukesh absent — confirm sheet
// ─────────────────────────────────────────────────────────────
function ScreenMarkAbsent() {
  return (
    <Phone>
      <NavTop title="Mark absent" back />
      <div style={{ padding: '12px 20px 24px' }}>
        <div
          style={{
            background: 'var(--card)',
            border: '1px solid var(--card-edge)',
            borderRadius: 14,
            padding: 16,
            boxShadow: 'var(--sh-1)',
            marginBottom: 14,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
              marginBottom: 10,
            }}
          >
            Worker
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar initial="M" size={44} tone="bad" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 600 }}>Mukesh K.</div>
              <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                Phoenix Mall — B1 · 6:30 AM shift
              </div>
            </div>
          </div>
        </div>

        <FieldGroup>
          <Field label="Date" value="Today, Wed 6 May" mono />
          <FieldDivider />
          <Field label="Reason" value="No-call no-show" select />
          <FieldDivider />
          <Field label="Pay impact" value="\u20b9500 deduct" mono badge="auto" />
          <FieldDivider />
          <Field label="Notify" value="HR (Kavitha) via WhatsApp" wrap />
        </FieldGroup>

        <div
          style={{
            marginTop: 14,
            padding: '12px 14px',
            background: 'var(--accent-soft)',
            borderRadius: 10,
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <Icon name="bell" size={16} color="var(--accent-ink)" />
          <div style={{ fontSize: 12, color: 'var(--accent-ink)', lineHeight: 1.4 }}>
            <b>PERSONNEL decision</b> — logged to audit. If Mukesh shows in next 90 min you can edit
            to "late" instead.
          </div>
        </div>
      </div>

      <BottomBar>
        <button style={btnGhost}>Cancel</button>
        <button style={btnPrimary}>Mark absent</button>
      </BottomBar>
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────
// Voice capture — supervisor holds mic, code-switched Hindi/English
// ─────────────────────────────────────────────────────────────
function ScreenVoice() {
  return (
    <Phone screenStyle={{ background: '#1a1612' }}>
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          color: 'var(--paper)',
          padding: '20px 20px 40px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: '#fdfaf3',
          }}
        >
          <button style={{ ...iconBtnDark, color: '#fdfaf3' }}>
            <Icon name="x" size={18} />
          </button>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontWeight: 600,
              background: 'rgba(253,250,243,0.08)',
              padding: '5px 10px',
              borderRadius: 12,
            }}
          >
            <span className="dot" style={{ background: '#e87158' }} />
            <span>Listening</span>
          </div>
          <div style={{ width: 34 }} />
        </div>

        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 24,
            padding: '0 4px',
          }}
        >
          {/* Live waveform */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 64 }}>
            {[
              8, 16, 28, 12, 40, 22, 52, 14, 36, 48, 18, 30, 44, 20, 32, 10, 26, 38, 14, 42, 16, 28,
              8,
            ].map((h, i) => (
              <div
                key={i}
                style={{
                  width: 3,
                  height: h,
                  borderRadius: 2,
                  background: i % 3 === 0 ? '#e87158' : 'rgba(253,250,243,0.5)',
                }}
              />
            ))}
          </div>

          {/* Live transcript */}
          <div
            style={{
              background: 'rgba(253,250,243,0.06)',
              border: '1px solid rgba(253,250,243,0.1)',
              borderRadius: 14,
              padding: '16px 18px',
              textAlign: 'center',
              fontSize: 18,
              lineHeight: 1.4,
              fontWeight: 500,
            }}
          >
            <div>"mukesh ko absent mark karo,</div>
            <div>
              aur Vikram ko Phoenix bhejo<span style={{ opacity: 0.5 }}>…</span>"
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: 'rgba(253,250,243,0.6)',
            }}
          >
            <Icon name="sparkle" size={13} color="#e87158" />
            <span>
              Detected: <b style={{ color: '#fdfaf3' }}>Hindi + English</b> · routed to Anthropic
            </span>
          </div>
        </div>

        {/* Detected actions preview */}
        <div
          style={{
            background: 'rgba(253,250,243,0.06)',
            border: '1px solid rgba(253,250,243,0.1)',
            borderRadius: 14,
            padding: 14,
            marginBottom: 20,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'rgba(253,250,243,0.6)',
              marginBottom: 10,
            }}
          >
            2 actions detected
          </div>
          <DarkActionRow icon="absent" title="Mark Mukesh absent" sub="confidence 0.94" />
          <div style={{ height: 1, background: 'rgba(253,250,243,0.08)', margin: '8px 0' }} />
          <DarkActionRow icon="swap" title="Swap Vikram → Phoenix B1" sub="confidence 0.91" />
        </div>

        {/* Mic button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
          <button style={{ ...iconBtnDark, width: 48, height: 48, borderRadius: 24 }}>
            <Icon name="x" size={20} />
          </button>
          <button
            style={{
              width: 80,
              height: 80,
              borderRadius: 40,
              border: 'none',
              background: '#e87158',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 0 8px rgba(232,113,88,0.18), 0 0 0 16px rgba(232,113,88,0.08)',
            }}
          >
            <Icon name="stop" size={24} />
          </button>
          <button style={{ ...iconBtnDark, width: 48, height: 48, borderRadius: 24 }}>
            <Icon name="check" size={20} />
          </button>
        </div>
      </div>
    </Phone>
  );
}

const iconBtnDark = {
  width: 34,
  height: 34,
  borderRadius: 10,
  border: '1px solid rgba(253,250,243,0.12)',
  background: 'rgba(253,250,243,0.04)',
  color: 'rgba(253,250,243,0.7)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

function DarkActionRow({ icon, title, sub }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: 'rgba(253,250,243,0.06)',
          color: '#fdfaf3',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon} size={16} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#fdfaf3' }}>{title}</div>
        <div
          style={{ fontSize: 11, color: 'rgba(253,250,243,0.5)', marginTop: 1 }}
          className="tabular"
        >
          {sub}
        </div>
      </div>
      <Icon name="check" size={18} color="#7fb069" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Approve leave
// ─────────────────────────────────────────────────────────────
function ScreenApproveLeave() {
  return (
    <Phone>
      <NavTop title="Leave request" back />
      <div style={{ padding: '12px 20px 24px' }}>
        <div
          style={{
            background: 'var(--card)',
            border: '1px solid var(--card-edge)',
            borderRadius: 14,
            padding: 16,
            boxShadow: 'var(--sh-1)',
            marginBottom: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <Avatar initial="G" size={44} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 600 }}>Geetha R.</div>
              <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                Phoenix Mall — A1 · 5 yr tenure
              </div>
            </div>
            <span className="tag warn">PENDING</span>
          </div>
          <div style={{ padding: '10px 12px', background: 'var(--paper-2)', borderRadius: 10 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--ink-3)',
                marginBottom: 6,
              }}
            >
              Reason
            </div>
            <div style={{ fontSize: 14, color: 'var(--ink)' }}>
              "Daughter's school annual day. I'll send Asha to cover."
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 8, fontWeight: 500 }}>
              Submitted 7:42 AM today · via voice note
            </div>
          </div>
        </div>

        <FieldGroup label="DETAILS">
          <Field label="Dates" value="Fri 8 May" mono />
          <FieldDivider />
          <Field label="Days" value="1" mono badge="LWP" />
          <FieldDivider />
          <Field label="Coverage" value="Asha B. (proposed)" tone="ok" />
          <FieldDivider />
          <Field label="Pay impact" value="\u20b9500 deduct" mono />
        </FieldGroup>

        <div
          style={{
            marginTop: 14,
            padding: '12px 14px',
            background: 'var(--ok-soft)',
            borderRadius: 10,
            display: 'flex',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <Icon name="sparkle" size={16} color="#2e5037" />
          <div style={{ fontSize: 12, color: '#2e5037', lineHeight: 1.45 }}>
            <b>Axhy suggests approve.</b> Geetha has 14 LWP days remaining, no pattern flags. Asha's
            coverage works — she's at Phoenix A2 (adjacent).
          </div>
        </div>
      </div>

      <BottomBar>
        <button style={{ ...btnGhost, color: 'var(--bad)' }}>Reject</button>
        <button style={btnPrimary}>Approve · LWP</button>
      </BottomBar>
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────
// Swap worker
// ─────────────────────────────────────────────────────────────
function ScreenSwap() {
  const candidates = [
    {
      name: 'Vikram T.',
      initial: 'V',
      site: 'Embassy Tech — Wing C',
      state: 'On break · 9:08 AM',
      tone: 'ok',
      eta: '18 min',
      best: true,
    },
    {
      name: 'Asha B.',
      initial: 'A',
      site: 'Manyata Block 4',
      state: 'On visit · ends 10:30',
      tone: 'warn',
      eta: '42 min',
    },
    {
      name: 'Lakshmi P.',
      initial: 'L',
      site: 'Prestige Falcon',
      state: 'On visit · ends 11:00',
      tone: 'warn',
      eta: '58 min',
    },
  ];
  return (
    <Phone>
      <NavTop title="Swap worker" back />
      <div style={{ padding: '12px 20px 0' }}>
        <div
          style={{
            background: 'var(--card)',
            border: '1px solid var(--card-edge)',
            borderRadius: 14,
            padding: 14,
            boxShadow: 'var(--sh-1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="site" size={16} color="var(--ink-3)" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Phoenix Mall — B1</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                needs cover for Mukesh's shift (6:30 AM → 2:30 PM)
              </div>
            </div>
          </div>
        </div>
      </div>

      <Section title="Available within 60 min" pad="20px 20px 8px" />
      <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {candidates.map((c) => (
          <div
            key={c.name}
            style={{
              background: 'var(--card)',
              border: '1px solid',
              borderColor: c.best ? 'var(--accent)' : 'var(--card-edge)',
              borderRadius: 12,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              boxShadow: 'var(--sh-1)',
              position: 'relative',
            }}
          >
            {c.best && (
              <span
                className="tag accent"
                style={{
                  position: 'absolute',
                  top: -9,
                  right: 12,
                  fontSize: 9,
                  padding: '2px 7px',
                  background: 'var(--accent)',
                  color: '#fff',
                }}
              >
                BEST FIT
              </span>
            )}
            <Avatar initial={c.initial} size={36} tone={c.best ? 'accent' : 'paper'} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 1 }}>{c.site}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <span className={`tag ${c.tone}`} style={{ fontSize: 9 }}>
                  {c.state}
                </span>
                <span style={{ fontSize: 11, color: 'var(--ink-3)' }} className="tabular">
                  ETA {c.eta}
                </span>
              </div>
            </div>
            <button
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                border: c.best ? 'none' : '1px solid var(--card-edge)',
                background: c.best ? 'var(--ink)' : 'transparent',
                color: c.best ? 'var(--card)' : 'var(--ink-2)',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Pick
            </button>
          </div>
        ))}
      </div>
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────
// Today's plan — read-only list of sites & visits
// ─────────────────────────────────────────────────────────────
function ScreenTodayPlan() {
  const sites = [
    {
      name: 'Phoenix Mall — B1',
      workers: '4 of 5',
      status: 'short',
      detail: 'Mukesh missing',
      tone: 'bad',
    },
    {
      name: 'Phoenix Mall — A1',
      workers: '3 of 3',
      status: 'covered',
      detail: 'on track',
      tone: 'ok',
    },
    {
      name: 'Lulu Mall — Tower A',
      workers: '2 of 2',
      status: 'covered',
      detail: 'on track',
      tone: 'ok',
    },
    {
      name: 'Brigade Tower 3',
      workers: '2 of 2',
      status: 'covered',
      detail: 'on track',
      tone: 'ok',
    },
    {
      name: 'Manyata Block 4',
      workers: '3 of 3',
      status: 'covered',
      detail: 'on track',
      tone: 'ok',
    },
    {
      name: 'Embassy Tech — Wing C',
      workers: '2 of 2',
      status: 'covered',
      detail: 'on track',
      tone: 'ok',
    },
    {
      name: 'Prestige Falcon',
      workers: '1 of 2',
      status: 'flagged',
      detail: 'pending arrival',
      tone: 'warn',
    },
  ];
  return (
    <Phone>
      <NavTop title="Today's plan" back />
      <div
        style={{
          padding: '8px 20px 6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>Wed, 6 May · 11 sites</div>
        <button style={pillBtnSmall}>Map</button>
      </div>
      <div style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sites.map((s, i) => (
          <div
            key={i}
            style={{
              background: 'var(--card)',
              border: '1px solid var(--card-edge)',
              borderRadius: 10,
              padding: '12px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <span
              className="dot"
              style={{
                width: 8,
                height: 8,
                background:
                  s.tone === 'bad' ? 'var(--bad)' : s.tone === 'warn' ? 'var(--warn)' : 'var(--ok)',
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{s.name}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 1 }}>{s.detail}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div
                className="tabular"
                style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}
              >
                {s.workers}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: 'var(--ink-3)',
                  marginTop: 1,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {s.status}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Phone>
  );
}

// ─────────────────────────────────────────────────────────────
// Wrap-up — end of day summary
// ─────────────────────────────────────────────────────────────
function ScreenWrapUp() {
  return (
    <Phone>
      <NavTop title="Wrap up" back />
      <div style={{ padding: '12px 20px 0' }}>
        <div style={{ fontSize: 24, fontWeight: 600, letterSpacing: -0.4 }}>Day done.</div>
        <div style={{ fontSize: 14, color: 'var(--ink-3)', marginTop: 4 }}>
          7:14 PM · last visit ended 7 min ago
        </div>
      </div>

      <div
        style={{ padding: '18px 20px 0', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}
      >
        <SummaryStat n="44" l="visits done" sub="₹352 billable" tone="ok" />
        <SummaryStat n="3" l="flagged" sub="AI verify" tone="warn" />
        <SummaryStat n="4" l="decisions" sub="audited" tone="paper" />
        <SummaryStat n="1" l="absent" sub="Mukesh" tone="bad" />
      </div>

      <Section title="Today's decisions" pad="20px 20px 8px" />
      <div style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <DecisionLine time="9:18" label="Mukesh marked absent" tier="PERSONNEL" />
        <DecisionLine time="9:21" label="Vikram swapped to Phoenix B1" tier="OPERATIONAL" />
        <DecisionLine time="11:04" label="Geetha leave approved (Fri)" tier="PERSONNEL" />
        <DecisionLine time="3:12" label="Phoenix complaint escalated to HR" tier="NOTE" />
      </div>

      <div style={{ padding: '20px', marginTop: 8 }}>
        <div
          style={{
            padding: '14px 16px',
            background: 'var(--paper-2)',
            borderRadius: 12,
            fontSize: 13,
            color: 'var(--ink-2)',
            lineHeight: 1.5,
          }}
        >
          <div
            style={{
              fontWeight: 600,
              color: 'var(--ink)',
              marginBottom: 6,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Icon name="sparkle" size={14} /> One thing for tomorrow
          </div>
          Mukesh hasn't called yet. If still no contact by 9 AM, that's day-2 — auto-flags toward
          ABSCONDED at day-7. Want me to draft a check-in WhatsApp now?
        </div>
      </div>

      <BottomBar>
        <button style={btnGhost}>Edit</button>
        <button style={btnPrimary}>Wrap up day</button>
      </BottomBar>
    </Phone>
  );
}

function DecisionLine({ time, label, tier }) {
  const c = {
    PERSONNEL: 'var(--accent-soft)',
    OPERATIONAL: 'var(--info-soft)',
    NOTE: 'var(--paper-3)',
  }[tier];
  const ck = {
    PERSONNEL: 'var(--accent-ink)',
    OPERATIONAL: 'var(--info-ink)',
    NOTE: 'var(--ink-2)',
  }[tier];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        background: 'var(--card)',
        border: '1px solid var(--card-edge)',
        borderRadius: 10,
      }}
    >
      <span
        className="tabular"
        style={{ fontSize: 12, color: 'var(--ink-3)', fontWeight: 600, width: 36 }}
      >
        {time}
      </span>
      <div style={{ flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>{label}</div>
      <span
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.06em',
          padding: '3px 6px',
          borderRadius: 4,
          background: c,
          color: ck,
        }}
      >
        {tier}
      </span>
    </div>
  );
}

function SummaryStat({ n, l, sub, tone }) {
  const fg = { bad: 'var(--bad)', ok: 'var(--ok)', warn: '#7a5a08', paper: 'var(--ink)' }[tone];
  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--card-edge)',
        borderRadius: 12,
        padding: '14px 14px',
      }}
    >
      <div
        className="tabular"
        style={{ fontSize: 32, fontWeight: 600, letterSpacing: -0.8, color: fg, lineHeight: 1 }}
      >
        {n}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 6, fontWeight: 600 }}>{l}</div>
      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared bits
// ─────────────────────────────────────────────────────────────
function NavTop({ title, back, action }) {
  return (
    <div
      style={{
        padding: '4px 16px 0',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        height: 48,
      }}
    >
      {back && (
        <button
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            border: '1px solid var(--card-edge)',
            background: 'var(--card)',
            color: 'var(--ink-2)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="arrowL" size={18} />
        </button>
      )}
      <div style={{ flex: 1, fontSize: 16, fontWeight: 600 }}>{title}</div>
      {action}
    </div>
  );
}

function FieldGroup({ label, children }) {
  return (
    <>
      {label && (
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
            margin: '8px 4px',
          }}
        >
          {label}
        </div>
      )}
      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--card-edge)',
          borderRadius: 14,
          boxShadow: 'var(--sh-1)',
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </>
  );
}
function FieldDivider() {
  return <div style={{ height: 1, background: 'var(--paper-3)', marginLeft: 14 }} />;
}
function Field({ label, value, mono, select, badge, wrap, tone }) {
  return (
    <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ fontSize: 13, color: 'var(--ink-3)', width: 96, flexShrink: 0 }}>{label}</div>
      <div
        style={{
          flex: 1,
          fontSize: 14,
          fontWeight: 500,
          color: tone === 'ok' ? 'var(--ok)' : 'var(--ink)',
          textAlign: 'right',
          whiteSpace: wrap ? 'normal' : 'nowrap',
        }}
        className={mono ? 'tabular' : ''}
      >
        {value}
        {badge && (
          <span
            style={{
              marginLeft: 6,
              fontSize: 9,
              fontWeight: 700,
              padding: '2px 5px',
              background: 'var(--paper-3)',
              color: 'var(--ink-3)',
              borderRadius: 3,
              letterSpacing: '0.04em',
            }}
          >
            {badge}
          </span>
        )}
      </div>
      {select && <Icon name="chevronD" size={14} color="var(--ink-3)" />}
    </div>
  );
}

function BottomBar({ children }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 22,
        padding: '14px 16px 18px',
        background: 'var(--paper)',
        borderTop: '1px solid var(--paper-3)',
        display: 'flex',
        gap: 10,
      }}
    >
      {children}
    </div>
  );
}
const btnGhost = {
  flex: 1,
  height: 48,
  border: '1px solid var(--card-edge)',
  background: 'transparent',
  borderRadius: 12,
  fontWeight: 600,
  fontSize: 15,
  color: 'var(--ink-2)',
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const btnPrimary = {
  flex: 2,
  height: 48,
  border: 'none',
  background: 'var(--ink)',
  color: 'var(--card)',
  borderRadius: 12,
  fontWeight: 600,
  fontSize: 15,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const pillBtnSmall = {
  height: 28,
  padding: '0 12px',
  borderRadius: 14,
  border: '1px solid var(--card-edge)',
  background: 'var(--card)',
  fontWeight: 600,
  fontSize: 12,
  color: 'var(--ink-2)',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

Object.assign(window, {
  ScreenMarkAbsent,
  ScreenVoice,
  ScreenApproveLeave,
  ScreenSwap,
  ScreenTodayPlan,
  ScreenWrapUp,
});
