// Variation C — AI chat IS the home
// Supervisor opens straight into a conversation that already knows their day.
// Voice is primary input; decisions inline as cards with tier classification.
// Doc references: §5 supervisor.chat / supervisor.context_load, §8 AI integration.

function VariationC({ onOpenScreen }) {
  const [accepted, setAccepted] = React.useState({});

  return (
    <Phone screenStyle={{ background: 'var(--paper-2)' }}>
      {/* Header */}
      <div
        style={{
          padding: '10px 16px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: 'var(--paper)',
          borderBottom: '1px solid var(--paper-3)',
        }}
      >
        <button style={iconBtnC}>
          <Icon name="menu" size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="dot" style={{ background: 'var(--ok)', width: 7, height: 7 }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Today</span>
            <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>· loaded 3:30 AM</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 1 }}>
            23 workers · 11 sites · 3 pending
          </div>
        </div>
        <button style={iconBtnC}>
          <Icon name="refresh" size={16} />
        </button>
      </div>

      {/* Chat stream */}
      <div style={{ padding: '16px 0 200px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ContextBanner />

        <Bubble from="ai" time="6:42 AM">
          <div>Good morning, Suresh. Loaded your day — 23 workers across 11 sites.</div>
        </Bubble>

        <Bubble from="ai" time="6:42 AM">
          <div style={{ marginBottom: 8 }}>Three things waiting on you:</div>
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <Listy icon="absent" tone="bad">
              Mukesh hasn't shown at <b>Phoenix Mall</b> · no call · 47 min late
            </Listy>
            <Listy icon="leave" tone="warn">
              Geetha requested leave for Fri
            </Listy>
            <Listy icon="complaint" tone="bad">
              Day 2 of restroom complaint at Phoenix · escalation due ~3 PM
            </Listy>
          </ul>
        </Bubble>

        <SuggestedChips
          chips={['Mark Mukesh absent', 'Approve Geetha\u2019s leave', 'Show Phoenix complaint']}
        />

        {/* Voice message from supervisor */}
        <Bubble from="me" time="9:17 AM">
          <VoiceMessage
            transcript="mukesh ko absent mark karo, aur Vikram ko Phoenix bhejo"
            dur="0:04"
          />
        </Bubble>

        <Bubble from="ai" time="9:17 AM">
          <div style={{ marginBottom: 10 }}>Got it — two decisions, ready to confirm:</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {MOCK.decisions
              .filter((d) => d.id !== 'd2')
              .map((d) => (
                <DecisionCard
                  key={d.id}
                  d={d}
                  accepted={accepted[d.id]}
                  onAccept={() => setAccepted((s) => ({ ...s, [d.id]: 'accepted' }))}
                  onReject={() => setAccepted((s) => ({ ...s, [d.id]: 'rejected' }))}
                />
              ))}
          </div>
          <div
            style={{
              marginTop: 12,
              padding: '10px 12px',
              background: 'var(--paper-2)',
              borderRadius: 10,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
            }}
          >
            <Icon name="sparkle" size={14} color="var(--ink-3)" />
            <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.4 }}>
              Both decisions tagged <b style={{ color: 'var(--ink-2)' }}>PERSONNEL/OPERATIONAL</b> —
              within your authority. HR notified automatically.
            </div>
          </div>
        </Bubble>
      </div>

      {/* Composer */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 22,
          padding: '12px 14px',
          background: 'linear-gradient(to top, var(--paper) 60%, rgba(246,241,232,0))',
        }}
      >
        <div
          style={{
            background: 'var(--card)',
            border: '1px solid var(--card-edge)',
            borderRadius: 24,
            padding: '8px 8px 8px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: 'var(--sh-2)',
          }}
        >
          <input
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 14,
              color: 'var(--ink)',
              fontFamily: 'inherit',
            }}
            placeholder="Ask anything · or hold mic to speak"
          />
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
            <Icon name="plus" size={18} />
          </button>
          <button
            onClick={() => onOpenScreen?.('voice')}
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="mic" size={18} />
          </button>
        </div>
      </div>
    </Phone>
  );
}

const iconBtnC = {
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
};

function ContextBanner() {
  return (
    <div
      style={{
        margin: '0 16px',
        padding: '10px 12px',
        background: 'var(--paper-3)',
        borderRadius: 10,
        fontSize: 12,
        color: 'var(--ink-2)',
        textAlign: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}
    >
      <Icon name="sparkle" size={13} color="var(--ink-3)" />
      <span>Living-doc cached · 247 of your rules in context</span>
    </div>
  );
}

function Bubble({ from, time, children }) {
  const isMe = from === 'me';
  return (
    <div
      style={{
        padding: isMe ? '0 16px 0 56px' : '0 56px 0 16px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: isMe ? 'flex-end' : 'flex-start',
      }}
    >
      {!isMe && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: 10,
              background: 'var(--ink)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="sparkle" size={11} color="var(--card)" />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-2)' }}>Axhy</span>
          <span className="tabular" style={{ fontSize: 11, color: 'var(--ink-4)' }}>
            {time}
          </span>
        </div>
      )}
      <div
        style={{
          background: isMe ? 'var(--ink)' : 'var(--card)',
          color: isMe ? 'var(--card)' : 'var(--ink)',
          border: isMe ? 'none' : '1px solid var(--card-edge)',
          borderRadius: 16,
          borderTopLeftRadius: isMe ? 16 : 4,
          borderTopRightRadius: isMe ? 4 : 16,
          padding: '12px 14px',
          fontSize: 14,
          lineHeight: 1.45,
          boxShadow: isMe ? 'none' : 'var(--sh-1)',
          maxWidth: '100%',
        }}
      >
        {children}
      </div>
      {isMe && (
        <span className="tabular" style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 4 }}>
          {time}
        </span>
      )}
    </div>
  );
}

function Listy({ icon, tone, children }) {
  const tones = {
    bad: 'var(--bad)',
    warn: '#7a5a08',
    ok: 'var(--ok)',
  };
  return (
    <li style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 14 }}>
      <div style={{ paddingTop: 2 }}>
        <Icon name={icon} size={14} color={tones[tone]} />
      </div>
      <span style={{ flex: 1 }}>{children}</span>
    </li>
  );
}

function SuggestedChips({ chips }) {
  return (
    <div style={{ padding: '0 16px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {chips.map((c) => (
        <button
          key={c}
          style={{
            height: 30,
            padding: '0 12px',
            borderRadius: 15,
            border: '1px solid var(--card-edge)',
            background: 'var(--card)',
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--ink-2)',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

function VoiceMessage({ transcript, dur }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            background: 'rgba(253,250,243,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="mic" size={14} color="var(--card)" />
        </div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2, height: 18 }}>
          {[6, 12, 8, 16, 10, 14, 8, 11, 5, 9, 13, 7, 4].map((h, i) => (
            <div
              key={i}
              style={{
                width: 2,
                height: h,
                background: 'var(--card)',
                borderRadius: 1,
                opacity: 0.7,
              }}
            />
          ))}
        </div>
        <span className="tabular" style={{ fontSize: 11, color: 'var(--card)', opacity: 0.7 }}>
          {dur}
        </span>
      </div>
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.4,
          opacity: 0.85,
          fontStyle: 'italic',
        }}
      >
        "{transcript}"
      </div>
    </div>
  );
}

Object.assign(window, { VariationC });
