/* global React, I, AxhyShell, AxhyData */
// Chat tab — capture surface. Voice messages parsed into decision cards;
// Apply All atomic batch (per Q2-C lock). Bubble + parsed-card pattern (Q1-B).

const {
  DecisionCard,
  AmbiguousDecisionCard,
  HeavySummaryCard,
  MediumSheet,
  MicFAB,
  Greeting,
  TopAppBar,
} = AxhyShell;

function MediumDecisionTrigger({ d, onTap }) {
  return (
    <button
      onClick={onTap}
      className="card"
      style={{
        width: '100%',
        padding: 14,
        textAlign: 'left',
        cursor: 'pointer',
        fontFamily: 'inherit',
        display: 'block',
        borderLeft: '3px solid var(--info-ink)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 8px',
            borderRadius: 999,
            background: 'var(--info-soft)',
            color: 'var(--info-ink)',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <I.HelpCircle size={10} /> {d.trigger}
        </span>
        <span className="t-mono-sm mono" style={{ color: 'var(--ink-3)' }}>
          {d.when}
        </span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{d.title}</div>
      <div className="t-body-sm" style={{ color: 'var(--ink-2)', marginTop: 4 }}>
        {d.body}
      </div>
      <div
        style={{
          marginTop: 10,
          color: 'var(--accent)',
          fontSize: 12,
          fontWeight: 600,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <I.ChevronUp size={12} /> Tap to pick
      </div>
    </button>
  );
}

function ChatBubble({ from = 'user', kind = 'text', text, dur, lang, confidence, parsed, dim }) {
  const isUser = from === 'user';
  // r5 — dim older bubbles so the newest exchange dominates. Friend's lock
  // 2026-05-12: "Chat should feel even more like a capture surface, not a
  // review surface." Dimming history reduces operational visual weight.
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 14,
        opacity: dim ? 0.55 : 1,
      }}
    >
      <div
        style={{
          maxWidth: '78%',
          background: isUser ? 'var(--ink)' : 'var(--card)',
          color: isUser ? 'var(--card)' : 'var(--ink)',
          border: isUser ? 'none' : '1px solid var(--card-edge)',
          borderRadius: 18,
          borderBottomRightRadius: isUser ? 4 : 18,
          borderBottomLeftRadius: isUser ? 18 : 4,
          padding: '10px 14px',
          fontSize: 14,
          lineHeight: 1.4,
        }}
      >
        {kind === 'voice' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 160 }}>
            <I.MicSolid size={16} color={isUser ? 'var(--card)' : 'var(--accent)'} />
            <span style={{ display: 'flex', alignItems: 'center', gap: 2, height: 22 }}>
              {[5, 8, 12, 16, 10, 14, 8, 18, 12, 9, 14, 16, 10, 7, 12, 9, 5].map((h, i) => (
                <span
                  key={i}
                  style={{
                    width: 2,
                    height: h,
                    background: isUser ? 'rgba(253,250,243,0.8)' : 'var(--accent)',
                    borderRadius: 1,
                  }}
                />
              ))}
            </span>
            <span className="mono" style={{ fontSize: 11, opacity: 0.85 }}>
              0:{dur}
            </span>
          </div>
        ) : (
          <span style={{ fontWeight: 500 }}>{text}</span>
        )}
      </div>
      {lang && (
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, padding: '0 6px' }}
        >
          <span className="t-mono-sm mono" style={{ color: 'var(--ink-4)' }}>
            {lang} · transcribed
          </span>
          {confidence && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 6px',
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                background:
                  confidence === 'high'
                    ? 'var(--ok-soft)'
                    : confidence === 'medium'
                      ? 'var(--warn-soft)'
                      : 'var(--bad-soft)',
                color:
                  confidence === 'high'
                    ? 'var(--ok)'
                    : confidence === 'medium'
                      ? 'var(--warn)'
                      : 'var(--bad)',
              }}
            >
              {confidence === 'high' ? (
                <I.Check size={9} />
              ) : confidence === 'medium' ? (
                <I.AlertTriangle size={9} />
              ) : (
                <I.AlertCircle size={9} />
              )}
              {confidence}
            </span>
          )}
          {confidence !== 'high' && (
            <button
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--accent)',
                fontSize: 10,
                fontWeight: 600,
                padding: 0,
                fontFamily: 'inherit',
              }}
            >
              Re-record
            </button>
          )}
        </div>
      )}
      {/* r4 — chat is a CAPTURE surface now, NOT an operational card wall.
          Inline DecisionCards removed per friend's lock 2026-05-11:
          "Chat should visually feel even more like a capture surface and
          less like another operational card wall." Instead, render a
          single thin link that taps INTO the Decisions tab. */}
      {parsed && parsed.length > 0 && (
        <div style={{ marginTop: 8, width: '100%' }}>
          <button
            onClick={() => {}}
            style={{
              width: '100%',
              padding: '8px 12px',
              background: 'var(--accent-soft)',
              color: 'var(--accent-ink)',
              border: 'none',
              borderRadius: 'var(--r-2)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
              fontFamily: 'inherit',
              textAlign: 'left',
            }}
          >
            <I.Sparkle size={12} />
            <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>
              {parsed.length === 1
                ? `1 decision added — review in Decisions`
                : `${parsed.length} decisions added — review in Decisions`}
            </span>
            <I.ChevronRight size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

function ChatTab({
  persona,
  listening,
  onMicToggle,
  pendingAmendId,
  onClearAmend,
  onOpenHeavy,
  onMenu,
}) {
  const { decisions } = AxhyData;
  const [draft, setDraft] = React.useState('');
  const [activeSheet, setActiveSheet] = React.useState(null);

  // Count by surface for Apply All button
  const lightCount = decisions.filter((d) => d.surface === 'light').length;
  const totalCount = decisions.length;
  const heavyMediumCount = totalCount - lightCount;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <TopAppBar title="Chat" subtitle="VOICE · MESSY INPUT" onMenu={onMenu} />
      {/* Warm greeting strip — kept as a personalized welcome on chat, NOT a heavy header */}
      <div
        style={{
          flexShrink: 0,
          padding: '10px 18px 12px',
          borderBottom: '1px solid var(--card-edge)',
          background: 'var(--paper)',
        }}
      >
        <Greeting persona={persona} />
      </div>

      {/* Messages */}
      <div
        className="qbar"
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '18px 14px 12px',
          background: 'var(--paper-2)',
          position: 'relative',
        }}
      >
        {/* Change A — Amend mode banner */}
        {pendingAmendId &&
          (() => {
            const d = AxhyData.decisions.find((x) => x.id === pendingAmendId);
            if (!d) return null;
            return (
              <div
                style={{
                  background: 'var(--accent-soft)',
                  color: 'var(--accent-ink)',
                  border: '1px solid var(--accent)',
                  borderRadius: 'var(--r-3)',
                  padding: '12px 14px',
                  marginBottom: 14,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 6,
                  }}
                >
                  <span className="t-caption" style={{ color: 'var(--accent-ink)' }}>
                    ↻ AMEND THIS DECISION
                  </span>
                  <button
                    onClick={onClearAmend}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                      color: 'var(--accent-ink)',
                    }}
                  >
                    <I.X size={14} />
                  </button>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{d.title}</div>
                <div className="t-body-sm" style={{ color: 'var(--ink-2)', marginTop: 2 }}>
                  {d.body}
                </div>
                <div className="t-mono-sm mono" style={{ color: 'var(--ink-3)', marginTop: 8 }}>
                  Speak or type your change below — AI will parse the amendment.
                </div>
              </div>
            );
          })()}

        <div
          style={{
            textAlign: 'center',
            fontSize: 11,
            color: 'var(--ink-4)',
            fontFamily: 'var(--font-mono)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            margin: '0 0 18px',
          }}
        >
          TODAY · 6:14 AM &nbsp;·&nbsp; CONTEXT LOADED
        </div>

        {/* r5 — older message pairs DIMMED to 55% so the most recent
            exchange dominates. Only the last 2 (one user + one AI bubble)
            stay at full visual weight. */}

        <ChatBubble dim from="user" kind="voice" dur="08" lang="te → en" confidence="medium" />
        <ChatBubble
          dim
          from="ai"
          text="Got it. Sarita off, Vinod takes Apollo. Leave needs daily cover picks."
          parsed={[decisions[0], decisions[1]]}
        />

        <ChatBubble
          dim
          from="user"
          kind="text"
          text="Apollo client said no chemicals near kitchen — note this please"
        />
        <ChatBubble dim from="ai" text="Logged against Apollo Hospital." parsed={[decisions[2]]} />

        <ChatBubble
          dim
          from="user"
          kind="text"
          text="Kavitha at Apollo HR — prefers WhatsApp, note for me"
        />
        <ChatBubble
          dim
          from="ai"
          text="Saved as your working note. Only you can see this."
          parsed={[decisions[3]]}
        />

        <ChatBubble dim from="user" kind="voice" dur="04" lang="hi" confidence="high" />
        <ChatBubble
          dim
          from="ai"
          text="Mukundan didn't show again. Third time this week — that's an employment decision."
          parsed={[decisions[4]]}
        />

        <ChatBubble dim from="user" kind="text" text="Mukesh absent today" />
        <ChatBubble
          dim
          from="ai"
          text="Two Mukeshes on your team. Pick the right one in Decisions."
          parsed={[decisions[5]]}
        />

        {/* Most recent exchange — full visual weight */}
        <ChatBubble
          from="user"
          kind="text"
          text="Send replacements for Mukundan, Mukesh, and Sarita today"
        />
        <ChatBubble
          from="ai"
          text="3 absences, 2 candidates available. Need your call."
          parsed={[decisions[6]]}
        />

        {/* Live transcription overlay — shown while listening */}
        {listening && (
          <div
            style={{
              position: 'absolute',
              bottom: 16,
              left: 14,
              right: 14,
              background: 'var(--ink)',
              color: 'var(--card)',
              padding: '12px 14px',
              borderRadius: 'var(--r-3)',
              boxShadow: 'var(--sh-2)',
              pointerEvents: 'none',
              zIndex: 10,
            }}
          >
            <div className="t-caption" style={{ color: 'var(--accent-soft)', marginBottom: 4 }}>
              LISTENING · TE → EN
            </div>
            <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.4 }}>
              Sarita today off, Vinod will go Apollo<span style={{ opacity: 0.5 }}>...</span>
            </div>
          </div>
        )}
      </div>

      {/* r4 — capture-surface footer. The bright "Apply N of M" CTA was
          operational and made chat feel like a card wall. Demoted to a
          thin link row that taps INTO the Decisions tab. Voice/text input
          is now the visual primary affordance. */}
      <div
        style={{
          flexShrink: 0,
          padding: '8px 14px 12px',
          background: 'var(--paper)',
          borderTop: '1px solid var(--card-edge)',
        }}
      >
        {totalCount > 0 && (
          <button
            onClick={() => {}}
            style={{
              width: '100%',
              padding: '8px 12px',
              marginBottom: 8,
              background: 'transparent',
              color: 'var(--accent)',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            <I.Sparkle size={12} />
            {totalCount} pending in decisions
            <I.ChevronRight size={12} />
          </button>
        )}
        <div style={{ display: 'flex', gap: 8, paddingRight: 76 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type or hold the mic to speak…"
            style={{
              flex: 1,
              padding: '12px 16px',
              minHeight: 48,
              background: 'var(--paper-2)',
              border: '1px solid var(--card-edge)',
              borderRadius: 24,
              fontFamily: 'inherit',
              fontSize: 14,
              color: 'var(--ink)',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Medium bottom sheet — position absolute, anchors to phone inner container */}
      {activeSheet &&
        (() => {
          const d = AxhyData.decisions.find((x) => x.id === activeSheet);
          if (!d) return null;
          return (
            <MediumSheet title={d.trigger || 'Decide'} onClose={() => setActiveSheet(null)}>
              <AmbiguousDecisionCard d={d} />
            </MediumSheet>
          );
        })()}
    </div>
  );
}

window.AxhyChatTab = ChatTab;
window.AxhyChatBubble = ChatBubble;
