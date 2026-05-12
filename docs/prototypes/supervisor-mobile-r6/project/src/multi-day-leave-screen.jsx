/* global React, I, AxhyData */
function MultiDayLeaveScreen({ onClose, decision }) {
  const [picked, setPicked] = React.useState({});
  const allPicked = decision.multiDay.days.every((d) => picked[d.day]);

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
      {/* Header */}
      <div
        style={{
          flexShrink: 0,
          padding: '14px 18px',
          borderBottom: '1px solid var(--card-edge)',
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
            color: 'var(--ink-2)',
            flexShrink: 0,
          }}
        >
          <I.ChevronLeft size={20} />
        </button>
        <div>
          <div className="t-caption" style={{ color: 'var(--accent)', marginBottom: 2 }}>
            PERSONNEL · LEAVE
          </div>
          <div
            style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.3px' }}
          >
            {decision.title}
          </div>
          <div className="t-body-sm" style={{ color: 'var(--ink-3)', marginTop: 4 }}>
            {decision.body}
          </div>
        </div>
      </div>

      {/* Body — list of days */}
      <div className="qbar" style={{ flex: 1, overflow: 'auto', padding: '14px 14px 24px' }}>
        <div className="t-caption" style={{ color: 'var(--ink-3)', marginBottom: 10 }}>
          DAILY COVER · {decision.multiDay.days.length} DAYS · {decision.multiDay.startDate}–
          {decision.multiDay.endDate}
        </div>
        {decision.multiDay.days.map((slot) => (
          <div
            key={slot.day}
            className="card"
            style={{
              padding: 14,
              marginBottom: 10,
              border: picked[slot.day] ? '1px solid var(--accent)' : undefined,
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
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{slot.day}</div>
              <span className="t-mono-sm mono" style={{ color: 'var(--ink-3)' }}>
                {slot.shift}
              </span>
            </div>
            <div className="t-body-sm" style={{ color: 'var(--ink-3)', marginBottom: 8 }}>
              {slot.site}
            </div>
            {picked[slot.day] ? (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 10px',
                  borderRadius: 'var(--r-2)',
                  background: 'var(--ok-soft)',
                  color: 'var(--ok)',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                <I.Check size={12} /> {picked[slot.day]} picked
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {slot.candidates.map((c) => (
                  <button
                    key={c}
                    onClick={() => setPicked({ ...picked, [slot.day]: c })}
                    style={{
                      padding: '6px 10px',
                      borderRadius: 999,
                      background: 'var(--paper-2)',
                      color: 'var(--ink-2)',
                      border: '1px solid var(--card-edge)',
                      fontSize: 11,
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {decision.money && (
          <div
            style={{
              marginTop: 14,
              padding: '12px 14px',
              background: 'var(--paper-2)',
              borderRadius: 'var(--r-2)',
              border: '1px solid var(--card-edge)',
            }}
          >
            <span className="t-caption" style={{ color: 'var(--ink-3)' }}>
              WAGES IMPACT
            </span>
            <div
              className="mono"
              style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', marginTop: 4 }}
            >
              {decision.money}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          flexShrink: 0,
          padding: '12px 14px',
          borderTop: '1px solid var(--card-edge)',
          background: 'var(--paper)',
        }}
      >
        <button
          disabled={!allPicked}
          onClick={onClose}
          style={{
            width: '100%',
            padding: '14px 0',
            background: allPicked ? 'var(--accent)' : 'var(--paper-3)',
            color: allPicked ? 'var(--card)' : 'var(--ink-4)',
            border: 'none',
            borderRadius: 'var(--r-3)',
            fontSize: 15,
            fontWeight: 700,
            fontFamily: 'inherit',
            cursor: allPicked ? 'pointer' : 'not-allowed',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <I.Check size={18} />
          {allPicked
            ? 'Approve leave + send invites'
            : `Pick covers for ${decision.multiDay.days.length - Object.keys(picked).length} more day${decision.multiDay.days.length - Object.keys(picked).length === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}
window.AxhyMultiDayLeaveScreen = MultiDayLeaveScreen;
