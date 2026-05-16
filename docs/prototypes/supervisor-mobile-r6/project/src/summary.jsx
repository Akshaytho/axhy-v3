/* global React, I, AxhyShell, AxhyData */

const { CaptionEyebrow, DecisionRef } = AxhyShell;

function DecisionsTodaySheet({ onClose, decisions, onAmend }) {
  const [filter, setFilter] = React.useState('all');
  const filtered = filter === 'all' ? decisions : decisions.filter((d) => d.tier === filter);

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
      {/* Header with back button */}
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
            TUESDAY
          </div>
          <div
            style={{ fontSize: 22, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.4px' }}
          >
            Decisions today
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
        {[
          { key: 'all', label: `All · ${decisions.length}` },
          { key: 'note', label: 'Note' },
          { key: 'operational', label: 'Operational' },
          { key: 'personnel', label: 'Personnel' },
          { key: 'employment', label: 'Employment' },
        ].map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: '6px 14px',
                borderRadius: 999,
                background: active ? 'var(--accent)' : 'var(--paper-2)',
                color: active ? 'var(--card)' : 'var(--ink-2)',
                border: '1px solid ' + (active ? 'var(--accent)' : 'var(--card-edge)'),
                fontSize: 12,
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* List */}
      <div className="qbar" style={{ flex: 1, overflow: 'auto', padding: '14px 14px 24px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--ink-3)' }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>None yet.</div>
            <div className="t-body-sm">No {filter} decisions today.</div>
          </div>
        ) : (
          /* Change A — each decision row wrapped in DecisionRef → tap → amend in chat */
          filtered.map((d) => (
            <DecisionRef
              key={d.id}
              decisionId={d.id}
              onAmend={(id) => {
                onAmend && onAmend(id);
                onClose();
              }}
            >
              <div
                style={{
                  padding: '14px',
                  marginBottom: 10,
                  background: 'var(--card)',
                  border: '1px solid var(--card-edge)',
                  borderRadius: 'var(--r-3)',
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
                  <span className={`tier ${d.tier}`}>
                    {d.tier === 'note'
                      ? 'Note'
                      : d.tier === 'operational'
                        ? 'Operational'
                        : d.tier === 'personnel'
                          ? 'Personnel'
                          : 'Employment'}
                  </span>
                  <span className="t-mono-sm mono" style={{ color: 'var(--ink-3)' }}>
                    {d.when}
                  </span>
                </div>
                <div
                  style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3 }}
                >
                  {d.title}
                </div>
                <div
                  className="t-body-sm"
                  style={{ color: 'var(--ink-2)', marginTop: 4, lineHeight: 1.4 }}
                >
                  {d.body}
                </div>
                <div
                  style={{
                    marginTop: 10,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    color: 'var(--accent)',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  <I.Edit size={11} /> Tap to amend
                </div>
              </div>
            </DecisionRef>
          ))
        )}
      </div>
    </div>
  );
}

function MetricTile({ label, value, unit, tone, sub }) {
  const colors = {
    accent: 'var(--accent)',
    ok: 'var(--ok)',
    warn: 'var(--warn)',
    bad: 'var(--bad)',
    ink: 'var(--ink)',
  };
  return (
    <button
      className="card"
      style={{
        padding: 16,
        textAlign: 'left',
        cursor: 'pointer',
        fontFamily: 'inherit',
        minHeight: 96,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <div className="t-caption" style={{ color: 'var(--ink-3)' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span
          className="mono"
          style={{
            fontSize: 32,
            fontWeight: 600,
            color: colors[tone] || 'var(--ink)',
            letterSpacing: '-0.04em',
            lineHeight: 1,
          }}
        >
          {value}
        </span>
        {unit && (
          <span className="mono" style={{ fontSize: 13, color: 'var(--ink-3)' }}>
            {unit}
          </span>
        )}
      </div>
      {sub && (
        <div className="t-mono-sm mono" style={{ color: 'var(--ink-4)', marginTop: 4 }}>
          {sub}
        </div>
      )}
    </button>
  );
}

function SummaryTab({ persona, onAmend }) {
  const { summary, decisions } = AxhyData;
  const [showDecisions, setShowDecisions] = React.useState(false);

  // Filter out ambiguous decisions for the decisions-today view
  const todayDecisions = decisions.filter((d) => d.tier !== 'ambiguous');

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        position: 'relative',
      }}
    >
      <div
        style={{
          flexShrink: 0,
          padding: '14px 18px',
          borderBottom: '1px solid var(--card-edge)',
          background: 'var(--paper)',
        }}
      >
        <div className="t-caption" style={{ color: 'var(--accent)', marginBottom: 4 }}>
          TUESDAY · END OF DAY
        </div>
        <div
          style={{ fontSize: 24, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.4px' }}
        >
          Today's summary
        </div>
      </div>

      <div className="qbar" style={{ flex: 1, overflow: 'auto', padding: '14px 14px 100px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <MetricTile
            label="CHANGES TODAY"
            value={summary.changesCount}
            tone="accent"
            sub="atomic batches"
          />
          <MetricTile label="FLAGGED" value={summary.flaggedCount} tone="warn" sub="needs review" />
          <MetricTile
            label="LEAVE PENDING"
            value={summary.leaveRequestsPending}
            tone="ink"
            sub="approvals"
          />
          <MetricTile
            label="TOMORROW · ROST"
            value={summary.nextDay.workers}
            unit="of 16"
            tone="ok"
            sub={`${summary.nextDay.replacements} replace`}
          />
        </div>

        <button
          onClick={() => setShowDecisions(true)}
          style={{
            width: '100%',
            textAlign: 'left',
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontFamily: 'inherit',
            marginBottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <CaptionEyebrow>TIMELINE</CaptionEyebrow>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--accent)',
              fontFamily: 'var(--font-mono)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              marginBottom: 10,
            }}
          >
            View all →
          </span>
        </button>
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 18 }}>
          {/* Change A — timeline rows are decision refs; tap → open decisions sheet */}
          {summary.timeline.map((e, i) => (
            <DecisionRef
              key={i}
              decisionId={`timeline:${i}`}
              onAmend={() => setShowDecisions(true)}
            >
              <div
                style={{
                  display: 'flex',
                  gap: 14,
                  padding: '12px 16px',
                  borderBottom:
                    i < summary.timeline.length - 1 ? '1px solid var(--card-edge)' : 'none',
                }}
              >
                <span
                  className="mono"
                  style={{
                    fontSize: 12,
                    color: 'var(--ink-3)',
                    fontWeight: 600,
                    width: 44,
                    flexShrink: 0,
                    paddingTop: 1,
                  }}
                >
                  {e.time}
                </span>
                <span style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.45 }}>
                  {e.text}
                </span>
              </div>
            </DecisionRef>
          ))}
        </div>

        <CaptionEyebrow>WAGES THIS WEEK</CaptionEyebrow>
        <div className="card" style={{ padding: 18, marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--ink-3)', fontWeight: 600 }}>₹</span>
            <span
              className="mono"
              style={{
                fontSize: 40,
                fontWeight: 600,
                color: 'var(--ink)',
                letterSpacing: '-0.04em',
                lineHeight: 1,
              }}
            >
              1,24,300
            </span>
          </div>
          <div className="t-body-sm" style={{ color: 'var(--ink-3)', marginTop: 6 }}>
            14 active · 1 termination pending · ₹6,400 final
          </div>
          <div
            style={{
              display: 'flex',
              height: 8,
              marginTop: 14,
              borderRadius: 4,
              overflow: 'hidden',
              gap: 2,
            }}
          >
            <span style={{ flex: 76, background: 'var(--accent)' }} />
            <span style={{ flex: 16, background: 'var(--warn)' }} />
            <span style={{ flex: 8, background: 'var(--bad)' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            <span className="t-mono-sm mono" style={{ color: 'var(--ink-3)' }}>
              WORKED 76%
            </span>
            <span className="t-mono-sm mono" style={{ color: 'var(--ink-3)' }}>
              OT 16%
            </span>
            <span className="t-mono-sm mono" style={{ color: 'var(--ink-3)' }}>
              FINAL 8%
            </span>
          </div>
        </div>

        <button
          style={{
            width: '100%',
            padding: '14px 0',
            background: 'transparent',
            color: 'var(--accent)',
            border: '1px solid var(--accent)',
            borderRadius: 'var(--r-3)',
            fontSize: 14,
            fontWeight: 600,
            fontFamily: 'inherit',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <I.RefreshCw size={14} /> Refresh from server
        </button>

        <div style={{ height: 24 }} />
        <button
          onClick={() => alert('Wrap-up sheet: "You worked 3h 14m today. Wrap up?"')}
          style={{
            width: '100%',
            padding: '16px 0',
            background: 'var(--accent)',
            color: 'var(--card)',
            border: 'none',
            borderRadius: 'var(--r-3)',
            fontSize: 15,
            fontWeight: 700,
            fontFamily: 'inherit',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            height: 56,
            boxShadow: '0 6px 18px rgba(192,73,42,0.3)',
          }}
        >
          <I.MoonStar size={18} /> I'm done for today
        </button>
      </div>

      {showDecisions && (
        <DecisionsTodaySheet
          onClose={() => setShowDecisions(false)}
          decisions={todayDecisions}
          onAmend={onAmend}
        />
      )}
    </div>
  );
}

window.AxhySummaryTab = SummaryTab;
