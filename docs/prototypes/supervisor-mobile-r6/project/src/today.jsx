/* global React, I, AxhyShell, AxhyData */
// Today's Plan tab — read-only roster. Per spec §2: NO AI, direct DB query.

const { CaptionEyebrow, DecisionRef, TopAppBar } = AxhyShell;

const STATE_DOT = {
  on_site: { color: 'var(--ok)', label: 'On site' },
  late: { color: 'var(--warn)', label: 'Late' },
  no_show: { color: 'var(--bad)', label: 'No-show' },
  on_leave: { color: 'var(--ink-3)', label: 'On leave' },
};

function StateBadge({ state }) {
  const s = STATE_DOT[state];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 11,
        fontWeight: 600,
        color: s.color,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        fontFamily: 'var(--font-mono)',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 3, background: s.color }} />
      {s.label}
    </span>
  );
}

function WorkerRow({ w, onAmend }) {
  const inner = (
    <div
      style={{
        padding: '12px 16px',
        minHeight: 56,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderBottom: '1px solid var(--card-edge)',
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          background: 'var(--paper-3)',
          color: 'var(--ink-2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: 13,
          flexShrink: 0,
        }}
      >
        {w.name
          .split(' ')
          .map((p) => p[0])
          .slice(0, 2)
          .join('')}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--ink)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {w.name}
        </div>
        {w.note && (
          <div className="t-mono-sm mono" style={{ color: 'var(--ink-3)', marginTop: 2 }}>
            {w.note}
          </div>
        )}
      </div>
      <div style={{ textAlign: 'right' }}>
        <StateBadge state={w.state} />
        {w.clockIn && (
          <div className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2 }}>
            in {w.clockIn}
          </div>
        )}
        {onAmend && (
          <div
            style={{
              fontSize: 10,
              color: 'var(--accent)',
              marginTop: 3,
              fontWeight: 600,
              fontFamily: 'var(--font-mono)',
            }}
          >
            TAP TO AMEND
          </div>
        )}
      </div>
    </div>
  );
  if (onAmend) {
    // Use synthetic id linking to the latest personnel/operational decision for this worker
    const workerDecisionId = `worker:${w.id}`;
    return (
      <DecisionRef decisionId={workerDecisionId} onAmend={onAmend}>
        {inner}
      </DecisionRef>
    );
  }
  return inner;
}

// Change C — shift-aware worker list for sites that have multiple shifts
function ShiftWorkerList({ site, workers, onAmend }) {
  const [activeShift, setActiveShift] = React.useState(site.shifts[0].id);
  const shiftWorkers = workers.filter((w) => !w.shift || w.shift === activeShift);
  const activeShiftDef = site.shifts.find((s) => s.id === activeShift);
  return (
    <>
      <div
        style={{
          padding: '10px 16px 8px',
          display: 'flex',
          gap: 6,
          borderBottom: '1px solid var(--card-edge)',
        }}
      >
        {site.shifts.map((s) => {
          const active = activeShift === s.id;
          return (
            <button
              key={s.id}
              onClick={() => setActiveShift(s.id)}
              style={{
                padding: '5px 10px',
                borderRadius: 999,
                background: active ? 'var(--accent)' : 'var(--paper-2)',
                color: active ? 'var(--card)' : 'var(--ink-2)',
                border: '1px solid ' + (active ? 'var(--accent)' : 'var(--card-edge)'),
                fontSize: 11,
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              {s.label} · {s.startTime}–{s.endTime}
            </button>
          );
        })}
      </div>
      <div
        style={{
          padding: '6px 16px',
          fontSize: 11,
          color: 'var(--ink-3)',
          fontFamily: 'var(--font-mono)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          borderBottom: '1px solid var(--card-edge)',
        }}
      >
        SHIFT SUP: {activeShiftDef ? activeShiftDef.supervisor : '—'}
      </div>
      {shiftWorkers.map((w) => (
        <WorkerRow key={w.id} w={w} onAmend={onAmend} />
      ))}
    </>
  );
}

function SiteCard({ site, workers, onAmend }) {
  // r3 design pass — SCAN layer: site cards DEFAULT COLLAPSED.
  // Worker grid is layer-2 detail, shown only on tap. Matches friend's lock:
  // "Today should be a fast scan screen first. Open site detail for the full
  // worker grid." 2026-05-11
  const [open, setOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);

  // r3 — compressed status pill on the layer-1 collapsed view.
  // Color reflects coverage urgency at a glance.
  const onSite = site.workersOn;
  const due = site.workersDue;
  const gap = Math.max(0, due - onSite);
  const coverPct = due > 0 ? onSite / due : 1;
  const coverColor = gap === 0 ? 'var(--ok)' : coverPct >= 0.75 ? 'var(--warn)' : 'var(--bad)';
  const coverLabel = gap === 0 ? 'FULL' : gap === 1 ? '1 SHORT' : `${gap} SHORT`;

  const flaggedDecisionId = `site-flagged:${site.id}`;

  return (
    <div
      className="card"
      style={{ padding: 0, overflow: 'hidden', marginBottom: 14, position: 'relative' }}
    >
      {/* Header row — not a button so we can nest the 3-dot button inside */}
      <div
        style={{
          width: '100%',
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          textAlign: 'left',
        }}
        onClick={() => setOpen(!open)}
      >
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>{site.name}</div>
            {site.flagged && (
              /* Change A — flagged badge tappable → amend */
              <DecisionRef decisionId={flaggedDecisionId} onAmend={onAmend}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    background: 'var(--warn-soft)',
                    color: 'var(--warn)',
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                  }}
                >
                  <I.AlertTriangle size={10} /> Flag
                </span>
              </DecisionRef>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            {/* r3 — compact coverage pill replaces verbose "X/Y ON SITE · Z ASSIGNED" */}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 8px',
                borderRadius: 999,
                background:
                  gap === 0
                    ? 'var(--ok-soft, rgba(74,124,89,0.12))'
                    : gap === 1
                      ? 'var(--warn-soft)'
                      : 'var(--bad-soft)',
                color: coverColor,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {coverLabel}
            </span>
            <span className="t-mono-sm mono" style={{ color: 'var(--ink-3)' }}>
              {onSite}/{due}
            </span>
            {!open && (
              <span
                className="t-mono-sm mono"
                style={{
                  color: 'var(--ink-4)',
                  marginLeft: 'auto',
                }}
              >
                TAP TO VIEW WORKERS →
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
            }}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 8,
              color: 'var(--ink-3)',
              display: 'inline-flex',
            }}
          >
            <I.MoreVertical size={18} />
          </button>
          <I.ChevronDown
            size={18}
            color="var(--ink-3)"
            style={{
              transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
              transition: 'transform 200ms var(--ease)',
            }}
          />
        </div>
      </div>
      {menuOpen && (
        <div
          style={{
            position: 'absolute',
            top: 54,
            right: 8,
            marginTop: 4,
            background: 'var(--card)',
            borderRadius: 'var(--r-2)',
            border: '1px solid var(--card-edge)',
            boxShadow: 'var(--sh-2)',
            minWidth: 180,
            padding: 4,
            zIndex: 10,
          }}
        >
          {['Mark as priority', 'Add site rule', 'Send replacement', 'Open in maps'].map((item) => (
            <button
              key={item}
              onClick={() => setMenuOpen(false)}
              style={{
                display: 'block',
                width: '100%',
                padding: '10px 12px',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: 13,
                color: 'var(--ink)',
                fontFamily: 'inherit',
              }}
            >
              {item}
            </button>
          ))}
        </div>
      )}
      {open && (
        <div>
          {/* Change C — shift selector for multi-shift sites */}
          {site.shifts && site.shifts.length > 1 ? (
            <ShiftWorkerList site={site} workers={workers} onAmend={onAmend} />
          ) : (
            workers.map((w) => <WorkerRow key={w.id} w={w} onAmend={onAmend} />)
          )}
          {site.rules.length > 0 && (
            <div
              style={{
                padding: '12px 16px',
                background: 'var(--paper-2)',
                borderTop: '1px solid var(--card-edge)',
              }}
            >
              <div className="t-caption" style={{ color: 'var(--ink-3)', marginBottom: 6 }}>
                SITE RULES
              </div>
              {site.rules.map((r, i) => (
                <div
                  key={i}
                  style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.4, marginTop: 2 }}
                >
                  · {r}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FlaggedReviewSheet({ visits, onClose }) {
  const [idx, setIdx] = React.useState(0);
  const visit = visits[idx];
  if (!visit) return null;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 100,
        background: 'rgba(29,26,18,0.55)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--paper)',
          borderRadius: '20px 20px 0 0',
          padding: '20px 18px 36px',
          boxShadow: 'var(--sh-3)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <div className="t-caption" style={{ color: 'var(--accent)' }}>
            FLAGGED REVIEW · {idx + 1} of {visits.length}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--ink-3)',
              padding: 4,
              display: 'inline-flex',
            }}
          >
            <I.X size={18} />
          </button>
        </div>

        <div className="card" style={{ padding: 16, marginBottom: 14 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              marginBottom: 8,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>{visit.worker}</div>
            <span className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
              {visit.when}
            </span>
          </div>
          <div className="t-mono-sm mono" style={{ color: 'var(--ink-3)', marginBottom: 10 }}>
            {visit.site}
          </div>
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginBottom: 12,
            }}
          >
            {Array.from({ length: Math.min(visit.photoCount, 3) }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 'var(--r-2)',
                  background: 'var(--paper-3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <I.Camera size={22} color="var(--ink-4)" />
              </div>
            ))}
            {visit.photoCount > 3 && (
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 'var(--r-2)',
                  background: 'var(--paper-3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--ink-3)',
                }}
              >
                +{visit.photoCount - 3}
              </div>
            )}
          </div>
          <div
            style={{
              padding: '10px 12px',
              background: 'var(--warn-soft)',
              borderRadius: 'var(--r-2)',
              borderLeft: '3px solid var(--warn)',
            }}
          >
            <div className="t-caption" style={{ color: 'var(--warn)', marginBottom: 4 }}>
              AI FLAG REASON
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.45 }}>
              {visit.reason}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => {
              if (idx < visits.length - 1) setIdx(idx + 1);
              else onClose();
            }}
            style={{
              flex: 1,
              padding: '12px 0',
              borderRadius: 'var(--r-2)',
              background: 'var(--ok)',
              color: 'var(--card)',
              border: 'none',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            Resolve OK
          </button>
          <button
            onClick={() => {
              if (idx < visits.length - 1) setIdx(idx + 1);
              else onClose();
            }}
            style={{
              flex: 1,
              padding: '12px 0',
              borderRadius: 'var(--r-2)',
              background: 'transparent',
              color: 'var(--bad)',
              border: '1px solid var(--bad)',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

function TodayTab({ persona, onAmend, onMenu }) {
  const { sites, workers, pulse, flaggedVisits } = AxhyData;
  const [showFlaggedReview, setShowFlaggedReview] = React.useState(false);
  const [showReplacement, setShowReplacement] = React.useState(false);

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
      <TopAppBar
        title="Today's plan"
        subtitle="TUESDAY · 9:41"
        onMenu={onMenu}
        actions={[
          { icon: <I.Search size={18} />, label: 'Search workers', onClick: () => {} },
          { icon: <I.Bell size={18} />, label: 'Notifications', onClick: () => {} },
        ]}
      />

      <div className="qbar" style={{ flex: 1, overflow: 'auto', padding: '14px 14px 100px' }}>
        {/* r4 — urgency banner at TOP when anything needs attention.
            Replaces buried "flagged" metric inside pulse. Friend's lock:
            "the top summary block plus banner plus site stack still needs
            even sharper priority." */}
        {(() => {
          const totalShort = pulse.late + pulse.noShow;
          const sitesShort = sites.filter((s) => s.workersDue - s.workersOn > 0).length;
          if (totalShort === 0 && pulse.flagged === 0) return null;
          const urgencyLines = [];
          if (totalShort > 0) {
            urgencyLines.push(
              `${totalShort} short across ${sitesShort} ${sitesShort === 1 ? 'site' : 'sites'}`,
            );
          }
          if (pulse.flagged > 0) {
            urgencyLines.push(
              `${pulse.flagged} flagged ${pulse.flagged === 1 ? 'visit' : 'visits'}`,
            );
          }
          return (
            <div
              onClick={pulse.flagged > 0 ? () => setShowFlaggedReview(true) : undefined}
              style={{
                padding: '12px 14px',
                marginBottom: 12,
                background: 'var(--bad-soft)',
                borderRadius: 'var(--r-2)',
                borderLeft: '4px solid var(--bad)',
                cursor: pulse.flagged > 0 ? 'pointer' : 'default',
              }}
            >
              <div className="t-caption" style={{ color: 'var(--bad)', marginBottom: 2 }}>
                ⚠ NEEDS YOU NOW
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                {urgencyLines.join(' · ')}
              </div>
            </div>
          );
        })()}

        {/* r4 — compressed floor pulse: 3 metrics (ON / SHORT / PENDING).
            Friend's lock: "Today should answer in 3 seconds — what is fine,
            what is risky, what needs action now." 5-metric version mixed
            site coverage (LATE/NO-SHOW) with action items (FLAGGED/PENDING)
            into one grid. Now: SHORT = late+no-show (coverage gap),
            PENDING = decisions awaiting (action queue), ON SITE = healthy. */}
        <div className="card" style={{ padding: 16, marginBottom: 14 }}>
          <CaptionEyebrow>FLOOR PULSE</CaptionEyebrow>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              gap: 10,
            }}
          >
            {[
              { v: pulse.onSite, l: 'ON SITE', c: 'var(--ok)' },
              { v: pulse.late + pulse.noShow, l: 'SHORT', c: 'var(--bad)' },
              { v: pulse.pending, l: 'PENDING', c: 'var(--ink)' },
            ].map((s) => (
              <div key={s.l} style={{ flex: 1 }}>
                <div
                  className="mono"
                  style={{
                    fontSize: 28,
                    fontWeight: 600,
                    color: s.c,
                    lineHeight: 1,
                  }}
                >
                  {s.v}
                </div>
                <div
                  className="t-mono-sm mono"
                  style={{
                    color: 'var(--ink-3)',
                    marginTop: 4,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sites */}
        {sites.map((s) => (
          <SiteCard
            key={s.id}
            site={s}
            workers={workers.filter((w) => w.site === s.name)}
            onAmend={onAmend}
          />
        ))}

        <div
          className="t-mono-sm mono"
          style={{
            textAlign: 'center',
            color: 'var(--ink-4)',
            marginTop: 12,
          }}
        >
          Pull to refresh · Updates live
        </div>
      </div>

      {showFlaggedReview && (
        <FlaggedReviewSheet
          visits={flaggedVisits || []}
          onClose={() => setShowFlaggedReview(false)}
        />
      )}
      {showReplacement && (
        <window.AxhyReplacementPicker onClose={() => setShowReplacement(false)} />
      )}
    </div>
  );
}

window.AxhyTodayTab = TodayTab;
