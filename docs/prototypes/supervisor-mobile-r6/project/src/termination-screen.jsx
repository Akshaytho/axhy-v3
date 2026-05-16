/* global React, I, AxhyData */
function TerminationScreen({ onClose, decision }) {
  const [confirmText, setConfirmText] = React.useState('');
  const canConfirm = confirmText === 'TERMINATE';

  const workerHistory = [
    { date: 'Today', event: 'No-show — Hitech City', tone: 'bad' },
    { date: 'Yesterday', event: 'No-show — Hitech City', tone: 'bad' },
    { date: '3 days ago', event: 'No-show — Apollo Hospital', tone: 'bad' },
    { date: '5 days ago', event: 'Late 47 min — Hitech City', tone: 'warn' },
    { date: '1 week ago', event: 'Visit verified', tone: 'ok' },
    { date: '10 days ago', event: 'Visit verified', tone: 'ok' },
  ];

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'var(--paper)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 50,
      }}
    >
      {/* Header — bad-tier accent */}
      <div
        style={{
          flexShrink: 0,
          padding: '14px 18px',
          background: 'var(--bad-soft)',
          color: 'var(--bad)',
          borderBottom: '1px solid var(--bad)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
            color: 'var(--bad)',
            flexShrink: 0,
          }}
        >
          <I.ChevronLeft size={20} />
        </button>
        <div>
          <div
            className="t-caption"
            style={{ color: 'var(--bad)', marginBottom: 2, opacity: 0.85 }}
          >
            EMPLOYMENT · TERMINATION
          </div>
          <div
            style={{ fontSize: 18, fontWeight: 700, color: 'var(--bad)', letterSpacing: '-0.3px' }}
          >
            {decision.title}
          </div>
        </div>
      </div>

      <div className="qbar" style={{ flex: 1, overflow: 'auto', padding: '14px 14px 24px' }}>
        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div className="t-caption" style={{ color: 'var(--ink-3)', marginBottom: 6 }}>
            WHY THIS
          </div>
          <div style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.45 }}>
            {decision.body}
          </div>
          {decision.money && (
            <div
              className="mono"
              style={{
                marginTop: 10,
                fontSize: 14,
                fontWeight: 700,
                color: 'var(--bad)',
              }}
            >
              {decision.money}
            </div>
          )}
        </div>

        {/* Recent history */}
        <div className="t-caption" style={{ color: 'var(--ink-3)', marginBottom: 10 }}>
          RECENT 10 DAYS
        </div>
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 14 }}>
          {workerHistory.map((h, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 10,
                padding: '10px 14px',
                borderBottom: i < workerHistory.length - 1 ? '1px solid var(--card-edge)' : 'none',
                background: h.tone === 'bad' ? 'var(--bad-soft)' : 'transparent',
                opacity: h.tone === 'bad' ? 1 : 0.85,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  marginTop: 5,
                  flexShrink: 0,
                  background:
                    h.tone === 'bad'
                      ? 'var(--bad)'
                      : h.tone === 'warn'
                        ? 'var(--warn)'
                        : 'var(--ok)',
                }}
              />
              <span className="t-mono-sm mono" style={{ color: 'var(--ink-3)', minWidth: 80 }}>
                {h.date}
              </span>
              <span style={{ flex: 1, fontSize: 12, color: 'var(--ink-2)' }}>{h.event}</span>
            </div>
          ))}
        </div>

        {/* TERMINATE typing field */}
        <div className="card" style={{ padding: 14 }}>
          <div className="t-caption" style={{ color: 'var(--ink-3)', marginBottom: 8 }}>
            TYPE 'TERMINATE' TO CONFIRM
          </div>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
            placeholder="TERMINATE"
            style={{
              width: '100%',
              padding: '14px 16px',
              background: 'var(--paper-2)',
              border: '1px solid var(--card-edge)',
              borderRadius: 'var(--r-2)',
              fontFamily: 'var(--font-mono)',
              fontSize: 16,
              color: 'var(--ink)',
              outline: 'none',
              letterSpacing: '0.1em',
              textAlign: 'center',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          flexShrink: 0,
          padding: '12px 14px',
          borderTop: '1px solid var(--card-edge)',
          background: 'var(--paper)',
          display: 'flex',
          gap: 8,
        }}
      >
        <button
          onClick={onClose}
          style={{
            flex: 1,
            padding: '14px 0',
            background: 'transparent',
            color: 'var(--ink-2)',
            border: '1px solid var(--card-edge)',
            borderRadius: 'var(--r-3)',
            fontSize: 14,
            fontWeight: 500,
            fontFamily: 'inherit',
            cursor: 'pointer',
          }}
        >
          Not now
        </button>
        <button
          disabled={!canConfirm}
          onClick={onClose}
          style={{
            flex: 2,
            padding: '14px 0',
            background: canConfirm ? 'var(--bad)' : 'var(--paper-3)',
            color: canConfirm ? 'var(--card)' : 'var(--ink-4)',
            border: 'none',
            borderRadius: 'var(--r-3)',
            fontSize: 14,
            fontWeight: 700,
            fontFamily: 'inherit',
            cursor: canConfirm ? 'pointer' : 'not-allowed',
          }}
        >
          Confirm termination
        </button>
      </div>
    </div>
  );
}
window.AxhyTerminationScreen = TerminationScreen;
