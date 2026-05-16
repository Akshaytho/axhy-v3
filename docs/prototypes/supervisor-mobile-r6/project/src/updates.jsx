/* global React, I, AxhyShell, AxhyData */
// Updates tab — HR rule acks. Per spec §2: ack via 5+ words spoken/typed (NOT button).

const { CaptionEyebrow } = AxhyShell;

// Change D — expandable sub-list for compliance digest cards
function DigestRuleList({ rules }) {
  const [expandedRule, setExpandedRule] = React.useState(null);
  return (
    <div style={{ padding: '0 16px 12px' }}>
      <div className="t-caption" style={{ color: 'var(--ink-3)', margin: '12px 0 6px' }}>
        5 RULES IN THIS SWEEP
      </div>
      <div
        style={{
          borderRadius: 'var(--r-2)',
          overflow: 'hidden',
          border: '1px solid var(--card-edge)',
        }}
      >
        {rules.map((r, i) => (
          <div
            key={r.id}
            style={{
              borderBottom: i < rules.length - 1 ? '1px solid var(--card-edge)' : 'none',
              background: 'var(--paper-2)',
            }}
          >
            <button
              onClick={() => setExpandedRule(expandedRule === r.id ? null : r.id)}
              style={{
                width: '100%',
                padding: '10px 12px',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', minWidth: 14 }}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
                {r.title}
              </span>
              <I.ChevronDown
                size={14}
                color="var(--ink-3)"
                style={{
                  transform: expandedRule === r.id ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 200ms var(--ease)',
                }}
              />
            </button>
            {expandedRule === r.id && (
              <div
                style={{
                  padding: '0 12px 12px 34px',
                  fontSize: 13,
                  color: 'var(--ink-2)',
                  lineHeight: 1.4,
                }}
              >
                {r.body}
              </div>
            )}
          </div>
        ))}
      </div>
      <div
        className="t-mono-sm mono"
        style={{ color: 'var(--ink-3)', marginTop: 10, fontSize: 11 }}
      >
        Single ack below covers all 5 rules.
      </div>
    </div>
  );
}

function UpdateCard({ u, onAck, expanded, onToggle }) {
  const [draft, setDraft] = React.useState('');
  const wordCount = draft.trim().split(/\s+/).filter(Boolean).length;
  const ready = wordCount >= 5;

  return (
    <div
      className="card"
      style={{
        padding: 0,
        overflow: 'hidden',
        marginBottom: 12,
        borderLeft: u.ackd ? undefined : '3px solid var(--accent)',
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          padding: '14px 16px',
          textAlign: 'left',
          background: 'transparent',
          border: 'none',
          fontFamily: 'inherit',
          cursor: 'pointer',
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
          <span className="t-mono-sm mono" style={{ color: 'var(--ink-3)' }}>
            {u.from} · {u.when}
          </span>
          {!u.ackd ? (
            <span className="tier personnel" style={{ fontSize: 9 }}>
              UNREAD
            </span>
          ) : (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--ok)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              <I.Check size={10} /> ACK
            </span>
          )}
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3 }}>
          {u.title}
        </div>
        <div
          className="t-body-sm"
          style={{ color: 'var(--ink-2)', marginTop: 6, lineHeight: 1.45 }}
        >
          {u.body}
        </div>
      </button>

      {/* Change D — compliance digest: expandable rule list */}
      {u.digest && u.rules && expanded && <DigestRuleList rules={u.rules} />}

      {!u.ackd && expanded && (
        <div
          style={{
            padding: '0 16px 16px',
            borderTop: u.digest ? '1px solid var(--card-edge)' : '1px solid var(--card-edge)',
          }}
        >
          <div className="t-caption" style={{ color: 'var(--ink-3)', margin: '12px 0 8px' }}>
            In your own words — what will you do?
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="In your own words: what will you do…"
            rows={3}
            style={{
              width: '100%',
              padding: '10px 12px',
              background: 'var(--paper-2)',
              border: '1px solid var(--card-edge)',
              borderRadius: 'var(--r-2)',
              fontFamily: 'inherit',
              fontSize: 14,
              color: 'var(--ink)',
              outline: 'none',
              resize: 'none',
            }}
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 8,
            }}
          >
            <span
              className="t-mono-sm mono"
              style={{
                color: ready ? 'var(--ok)' : 'var(--ink-4)',
                fontWeight: 600,
              }}
            >
              {wordCount} / 5 WORDS {ready && '✓'}
            </span>
            <button
              onClick={() => ready && onAck(u.id, draft)}
              disabled={!ready}
              style={{
                padding: '8px 14px',
                background: ready ? 'var(--accent)' : 'var(--paper-3)',
                color: ready ? 'var(--card)' : 'var(--ink-4)',
                border: 'none',
                borderRadius: 'var(--r-2)',
                fontSize: 13,
                fontWeight: 700,
                fontFamily: 'inherit',
                cursor: ready ? 'pointer' : 'not-allowed',
              }}
            >
              Submit
            </button>
          </div>
        </div>
      )}

      {u.ackd && u.ackText && (
        <div
          style={{
            padding: '10px 16px 14px',
            borderTop: '1px solid var(--card-edge)',
            background: 'var(--ok-soft)',
          }}
        >
          <div className="t-caption" style={{ color: 'var(--ok)', marginBottom: 4 }}>
            YOUR ACK
          </div>
          <div
            className="t-body-sm"
            style={{ color: 'var(--ink-2)', fontStyle: 'italic', lineHeight: 1.45 }}
          >
            "{u.ackText}"
          </div>
        </div>
      )}
    </div>
  );
}

function UpdatesTab({ persona }) {
  const [updates, setUpdates] = React.useState(AxhyData.hrUpdates);
  const [openId, setOpenId] = React.useState(updates.find((u) => !u.ackd)?.id);
  const unread = updates.filter((u) => !u.ackd).length;

  const ack = (id, text) => {
    setUpdates((prev) => prev.map((u) => (u.id === id ? { ...u, ackd: true, ackText: text } : u)));
    setOpenId(null);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div
        style={{
          flexShrink: 0,
          padding: '14px 18px',
          borderBottom: '1px solid var(--card-edge)',
          background: 'var(--paper)',
        }}
      >
        <div className="t-caption" style={{ color: 'var(--accent)', marginBottom: 4 }}>
          HR · COMPANY-WIDE
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <div
            style={{ fontSize: 24, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.4px' }}
          >
            Updates
          </div>
          {unread > 0 && (
            <span
              style={{
                background: 'var(--bad)',
                color: 'var(--card)',
                padding: '2px 9px',
                borderRadius: 999,
                fontSize: 11,
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
              }}
            >
              {unread} new
            </span>
          )}
        </div>
      </div>

      <div className="qbar" style={{ flex: 1, overflow: 'auto', padding: '14px 14px 100px' }}>
        {updates.filter((u) => !u.ackd).length > 0 && (
          <CaptionEyebrow>NEEDS YOUR ACK</CaptionEyebrow>
        )}
        {updates
          .filter((u) => !u.ackd)
          .map((u) => (
            <UpdateCard
              key={u.id}
              u={u}
              expanded={openId === u.id}
              onToggle={() => setOpenId(openId === u.id ? null : u.id)}
              onAck={ack}
            />
          ))}

        {updates.filter((u) => u.ackd).length > 0 && (
          <div style={{ marginTop: 18 }}>
            <CaptionEyebrow>RECENT — ACKNOWLEDGED</CaptionEyebrow>
            {updates
              .filter((u) => u.ackd)
              .map((u) => (
                <UpdateCard
                  key={u.id}
                  u={u}
                  expanded={openId === u.id}
                  onToggle={() => setOpenId(openId === u.id ? null : u.id)}
                  onAck={ack}
                />
              ))}
          </div>
        )}

        {unread === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--ink-3)' }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
              You're all caught up.
            </div>
            <div className="t-body-sm">
              HR will push new rules here. You'll see a red dot on the tab.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

window.AxhyUpdatesTab = UpdatesTab;
