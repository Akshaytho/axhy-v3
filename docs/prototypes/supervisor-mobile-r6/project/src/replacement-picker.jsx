/* global React, I, AxhyData */
function ReplacementPicker({ onClose }) {
  const { replacementPicker: rp } = AxhyData;
  const [activeFilter, setActiveFilter] = React.useState(null);
  const [picked, setPicked] = React.useState(null);

  const filtered = activeFilter
    ? rp.candidates.filter((c) => c.flags.includes(activeFilter))
    : rp.candidates;

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
          }}
        >
          <I.ChevronLeft size={20} />
        </button>
        <div>
          <div className="t-caption" style={{ color: 'var(--accent)', marginBottom: 2 }}>
            REPLACEMENT
          </div>
          <div
            style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.3px' }}
          >
            {rp.forSite}
          </div>
          <div
            className="t-mono-sm mono"
            style={{ color: 'var(--ink-3)', marginTop: 2, fontSize: 10 }}
          >
            {rp.shift}
          </div>
        </div>
      </div>

      {/* Filter chips */}
      <div
        style={{
          flexShrink: 0,
          padding: '12px 14px',
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          borderBottom: '1px solid var(--card-edge)',
        }}
      >
        {[{ id: null, label: `All · ${rp.candidates.length}`, tier: null }, ...rp.filters].map(
          (f) => {
            const active = activeFilter === f.id;
            return (
              <button
                key={f.id || 'all'}
                onClick={() => setActiveFilter(f.id)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 999,
                  background: active ? 'var(--accent)' : 'var(--paper-2)',
                  color: active ? 'var(--card)' : 'var(--ink-2)',
                  border: '1px solid ' + (active ? 'var(--accent)' : 'var(--card-edge)'),
                  fontSize: 11,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                {f.tier === 'preferred' && <I.Star size={10} />}
                {f.label}
                {f.count !== undefined ? ` · ${f.count}` : ''}
              </button>
            );
          },
        )}
      </div>

      {/* Candidate list */}
      <div className="qbar" style={{ flex: 1, overflow: 'auto', padding: '12px 14px 24px' }}>
        {filtered.map((c) => {
          const onShift = c.currentlyAt !== null;
          const flags = c.flags
            .map((fid) => rp.filters.find((f) => f.id === fid)?.label)
            .filter(Boolean);
          return (
            <button
              key={c.id}
              onClick={() => setPicked(c.id)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: 12,
                marginBottom: 8,
                background: picked === c.id ? 'var(--accent-soft)' : 'var(--card)',
                border: '1px solid ' + (picked === c.id ? 'var(--accent)' : 'var(--card-edge)'),
                borderRadius: 'var(--r-3)',
                cursor: 'pointer',
                fontFamily: 'inherit',
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
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{c.name}</span>
                {onShift && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: 'var(--bad-soft)',
                      color: 'var(--bad)',
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    <I.AlertTriangle size={9} /> ON SHIFT
                  </span>
                )}
              </div>
              {/* Travel + current site */}
              <div
                className="t-mono-sm mono"
                style={{ color: 'var(--ink-3)', marginBottom: 4, fontSize: 10 }}
              >
                {c.travel} away{c.currentlyAt ? ` · at ${c.currentlyAt}` : ''} · {c.lastShift}
              </div>
              {/* Flag tags */}
              {flags.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                  {c.flags.map((fid) => {
                    const f = rp.filters.find((x) => x.id === fid);
                    if (!f) return null;
                    return (
                      <span
                        key={fid}
                        style={{
                          padding: '2px 6px',
                          borderRadius: 999,
                          background:
                            f.tier === 'preferred' ? 'var(--accent-soft)' : 'var(--paper-2)',
                          color: f.tier === 'preferred' ? 'var(--accent-ink)' : 'var(--ink-3)',
                          fontSize: 9,
                          fontWeight: 600,
                          fontFamily: 'var(--font-mono)',
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {f.tier === 'preferred' ? '★ ' : ''}
                        {f.label}
                      </span>
                    );
                  })}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Send invite button */}
      {picked && (
        <div
          style={{
            flexShrink: 0,
            padding: '12px 14px',
            borderTop: '1px solid var(--card-edge)',
            background: 'var(--paper)',
          }}
        >
          <button
            style={{
              width: '100%',
              padding: '14px 0',
              background: 'var(--accent)',
              color: 'var(--card)',
              border: 'none',
              borderRadius: 'var(--r-3)',
              fontSize: 14,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            <I.Send size={16} /> Send invite — 2 min timer
          </button>
        </div>
      )}
    </div>
  );
}

window.AxhyReplacementPicker = ReplacementPicker;
