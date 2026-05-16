/* global React, I, AxhyShell, AxhyData */
// Decision Workspace — persistent queue of pending SupervisorDecisions.
// Per operations-first reframing (2026-05-11): DecisionCards do NOT render
// inline in chat. They land here. Sources: AI Chat extractions, HR Updates,
// worker leave/swap requests, REVIEW_REQUIRED conflicts.
//
// Lifecycle: PROPOSED → APPLIED | DISMISSED | FAILED | EXPIRED
// Tier drives visual styling and ack requirements:
//   note         — small chip, single Apply tap
//   operational  — info-tinted, single Apply tap
//   personnel    — accent-tinted, single Apply tap (HR ack uses typed-words)
//   employment   — bad-tinted, typed-words ack required
//   review_required — warn-tinted, option picker (one of N choices)

const { CaptionEyebrow, TopAppBar } = AxhyShell;

const TIER_STYLES = {
  note: { bg: 'var(--paper-3)', text: 'var(--ink-3)', border: 'transparent' },
  operational: { bg: 'var(--info-soft)', text: 'var(--info-ink)', border: 'transparent' },
  personnel: { bg: 'var(--accent-soft)', text: 'var(--accent-ink)', border: 'var(--accent)' },
  employment: { bg: 'var(--bad-soft)', text: 'var(--bad)', border: 'var(--bad)' },
  review_required: { bg: 'var(--warn-soft)', text: 'var(--warn)', border: 'var(--warn)' },
};

const STATUS_LABEL = {
  proposed: 'PENDING',
  applied: '✓ APPLIED',
  dismissed: 'DISMISSED',
  failed: '⚠ FAILED',
  expired: '⏰ EXPIRED',
};

// Plain-English failure reason copy (Suresh-day-365 panel: "OVERLAP_CONFLICT means nothing to me").
const FAILURE_REASON_COPY = {
  OVERLAP_CONFLICT: 'Worker is already assigned elsewhere this shift.',
  WORKER_ON_LEAVE: 'Worker is on approved leave for this date.',
  WORKER_NOT_FOUND: 'Could not find that worker.',
  SITE_NOT_FOUND: 'Could not find that site.',
  STATE_ALREADY_CHANGED: 'Someone else changed this in the meantime.',
  BACKEND_VALIDATION_FAILED: 'Request failed validation — try again.',
  PERMISSION_DENIED: 'You do not have permission for this action.',
  TENANT_CONTEXT_MISMATCH: 'Account mismatch — please re-login.',
  IDEMPOTENCY_REPLAY_CONFLICT: 'This action was already submitted.',
  UNKNOWN: 'Something went wrong — try again.',
};

function TierChip({ tier }) {
  const s = TIER_STYLES[tier] || TIER_STYLES.note;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 999,
        background: s.bg,
        color: s.text,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        fontFamily: 'var(--font-mono)',
      }}
    >
      {tier === 'review_required' ? 'REVIEW' : tier}
    </span>
  );
}

function StatusBadge({ status }) {
  const color =
    status === 'applied'
      ? 'var(--ok)'
      : status === 'failed'
        ? 'var(--bad)'
        : status === 'expired'
          ? 'var(--ink-4)'
          : status === 'dismissed'
            ? 'var(--ink-3)'
            : 'var(--accent)';
  return (
    <span
      className="mono"
      style={{
        fontSize: 10,
        fontWeight: 700,
        color,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}
    >
      {STATUS_LABEL[status] || status}
    </span>
  );
}

function DecisionRow({ d, onApply, onDismiss, onPickOption, applyingId }) {
  const s = TIER_STYLES[d.tier] || TIER_STYLES.note;
  const isApplying = applyingId === d.id;
  const isPending = d.status === 'proposed';
  const isReview = d.tier === 'review_required';
  const isEmployment = d.tier === 'employment';
  // r6 — body even tighter for urgent cards. Friend's lock 2026-05-12:
  // "shorten visible text inside Needs you now cards one more level."
  // 60 chars → 40 chars. Worker/Site meta line dropped entirely (it's
  // already in the title typically).
  const [expanded, setExpanded] = React.useState(false);
  const hasLongBody = d.body && d.body.length > 40;
  const shortBody = hasLongBody ? d.body.slice(0, 40).trim() + '…' : d.body;
  // Employment auto-requires typed-words ack; HR ack is also typed-words but neutral-tinted.
  const isAck = d.ackRequired || isEmployment;
  const ackPhrase = isEmployment
    ? d.payload?.acknowledgmentPhrase || 'TERMINATE'
    : d.payload?.acknowledgmentPhrase || 'I understand';
  const ackBtnColor = isEmployment ? 'var(--bad)' : 'var(--ok)';

  return (
    <div
      className="card"
      style={{
        padding: 0,
        marginBottom: 10,
        overflow: 'hidden',
        borderLeft: `3px solid ${s.border === 'transparent' ? 'var(--card-edge)' : s.border}`,
      }}
    >
      <div style={{ padding: 14 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TierChip tier={d.tier} />
            {d.batchId && (
              <span
                className="mono"
                style={{
                  fontSize: 10,
                  color: 'var(--ink-4)',
                  letterSpacing: '0.04em',
                }}
              >
                BATCH
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <StatusBadge status={d.status} />
            <span className="t-mono-sm mono" style={{ color: 'var(--ink-4)' }}>
              {d.when}
            </span>
          </div>
        </div>

        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3 }}>
          {d.title}
        </div>
        {d.body && (
          <div
            className="t-body-sm"
            style={{ color: 'var(--ink-2)', marginTop: 6, lineHeight: 1.4 }}
          >
            {expanded ? d.body : shortBody}
            {hasLongBody && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(!expanded);
                }}
                style={{
                  marginLeft: 6,
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--accent)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                {expanded ? 'less' : 'more'}
              </button>
            )}
          </div>
        )}
        {/* r6 — meta line (WORKER / SITE) DROPPED from urgent cards.
            Friend's lock 2026-05-12. Worker/Site appears in title already
            for actionable cards. If supervisor needs detail, they tap. */}
      </div>

      {/* Action row — only on pending decisions */}
      {isPending && (
        <div
          style={{
            padding: '10px 14px',
            borderTop: '1px solid var(--card-edge)',
            background: 'var(--paper-2)',
          }}
        >
          {isReview ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {d.payload.options.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => onPickOption(d, opt)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    textAlign: 'left',
                    background: 'var(--card)',
                    color: 'var(--ink)',
                    border: '1px solid var(--card-edge)',
                    borderRadius: 'var(--r-2)',
                    fontSize: 13,
                    fontWeight: 500,
                    fontFamily: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  {opt.label}
                </button>
              ))}
              <button
                onClick={() => onDismiss(d)}
                style={{
                  marginTop: 4,
                  padding: '8px 12px',
                  background: 'transparent',
                  color: 'var(--ink-3)',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 12,
                  fontWeight: 500,
                  fontFamily: 'inherit',
                  textAlign: 'left',
                }}
              >
                Cancel — handle later
              </button>
            </div>
          ) : isAck ? (
            <div>
              <div
                className="t-mono-sm mono"
                style={{ color: isEmployment ? 'var(--bad)' : 'var(--ink-3)', marginBottom: 8 }}
              >
                {isEmployment ? '⚠ EMPLOYMENT — ' : ''}TYPE "{ackPhrase}" TO CONFIRM
              </div>
              <input
                type="text"
                placeholder="Type confirmation phrase..."
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--card-edge)',
                  borderRadius: 'var(--r-2)',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  background: 'var(--card)',
                  color: 'var(--ink)',
                  marginBottom: 8,
                }}
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => onApply(d)}
                  disabled={isApplying}
                  style={{
                    flex: 1,
                    padding: '10px 0',
                    borderRadius: 'var(--r-2)',
                    background: ackBtnColor,
                    color: 'var(--card)',
                    border: 'none',
                    fontSize: 14,
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    cursor: isApplying ? 'wait' : 'pointer',
                  }}
                >
                  {isApplying ? 'Confirming…' : 'Confirm'}
                </button>
                <button
                  onClick={() => onDismiss(d)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 'var(--r-2)',
                    background: 'transparent',
                    color: 'var(--ink-3)',
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
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => onApply(d)}
                disabled={isApplying}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  borderRadius: 'var(--r-2)',
                  background: 'var(--ok)',
                  color: 'var(--card)',
                  border: 'none',
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  cursor: isApplying ? 'wait' : 'pointer',
                }}
              >
                {isApplying ? 'Applying…' : 'Apply'}
              </button>
              <button
                onClick={() => onDismiss(d)}
                style={{
                  padding: '10px 14px',
                  borderRadius: 'var(--r-2)',
                  background: 'transparent',
                  color: 'var(--ink-3)',
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
          )}
        </div>
      )}

      {d.status === 'failed' && d.failureReason && (
        <div
          style={{
            padding: '8px 14px',
            borderTop: '1px solid var(--card-edge)',
            background: 'var(--bad-soft)',
          }}
        >
          <div style={{ fontSize: 13, color: 'var(--ink-2)', fontWeight: 500, lineHeight: 1.4 }}>
            {FAILURE_REASON_COPY[d.failureReason] || d.failureReason}
          </div>
          <div className="t-mono-sm mono" style={{ color: 'var(--bad)', marginTop: 2 }}>
            {d.failureReason}
          </div>
        </div>
      )}
    </div>
  );
}

// r5 — ULTRA-compact row. Friend's lock 2026-05-12: "compress cards harder,
// reduce visible metadata, strengthen hierarchy between urgent/normal/failed."
// No worker/site, no Apply pill. Just: tier dot · 1-line title · ▸.
// Tap row → expand to full card for inspect/apply.
function DecisionRowUltra({
  d,
  onExpand,
  expanded,
  onApply,
  onDismiss,
  onPickOption,
  applyingId,
  faded,
}) {
  if (expanded) {
    return (
      <DecisionRow
        d={d}
        onApply={onApply}
        onDismiss={onDismiss}
        onPickOption={onPickOption}
        applyingId={applyingId}
      />
    );
  }
  const tierColor = (TIER_STYLES[d.tier] || TIER_STYLES.note).border;
  const dotColor = tierColor === 'transparent' ? 'var(--ink-4)' : tierColor;
  return (
    <div
      onClick={onExpand}
      className="card"
      style={{
        padding: '8px 12px',
        marginBottom: 4,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        opacity: faded ? 0.55 : 1,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          background: faded ? 'var(--ink-4)' : dotColor,
          flexShrink: 0,
        }}
      />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--ink)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          lineHeight: 1.3,
        }}
      >
        {d.title}
      </div>
      <I.ChevronRight size={14} color="var(--ink-4)" style={{ flexShrink: 0 }} />
    </div>
  );
}

// Section header for tier-grouped decisions list.
// Friend's lock 2026-05-12: "strengthen hierarchy between urgent, normal,
// and failed/review items." Sections give the eye instant priority sorting.
function DecisionSection({ label, count, color, children }) {
  if (count === 0) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 4px 6px',
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            background: color,
            flexShrink: 0,
          }}
        />
        <span
          className="t-mono-sm mono"
          style={{
            color,
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
        <span
          className="t-mono-sm mono"
          style={{
            color: 'var(--ink-4)',
            marginLeft: 'auto',
            flexShrink: 0,
          }}
        >
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

// r4 — compact row mode (kept for backward compat / single-card cases).
function DecisionRowCompact({
  d,
  onApply,
  onDismiss,
  onPickOption,
  applyingId,
  onExpand,
  expanded,
}) {
  if (expanded) {
    // Re-use the full card when expanded
    return (
      <DecisionRow
        d={d}
        onApply={onApply}
        onDismiss={onDismiss}
        onPickOption={onPickOption}
        applyingId={applyingId}
      />
    );
  }
  const tierColor = (TIER_STYLES[d.tier] || TIER_STYLES.note).border;
  const dotColor = tierColor === 'transparent' ? 'var(--ink-4)' : tierColor;
  const isPending = d.status === 'proposed';
  // Short summary line: prefer worker · site fragments over body
  const summary = [d.worker, d.site].filter(Boolean).join(' · ');
  return (
    <div
      onClick={onExpand}
      className="card"
      style={{
        padding: '10px 12px',
        marginBottom: 6,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          background: dotColor,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--ink)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            lineHeight: 1.25,
          }}
        >
          {d.title}
        </div>
        {summary && (
          <div
            className="t-mono-sm mono"
            style={{
              color: 'var(--ink-3)',
              marginTop: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {summary}
          </div>
        )}
      </div>
      {isPending && d.tier !== 'review_required' && d.tier !== 'employment' && !d.ackRequired && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onApply(d);
          }}
          style={{
            padding: '4px 10px',
            borderRadius: 999,
            background: 'var(--ok)',
            color: 'var(--card)',
            border: 'none',
            fontSize: 11,
            fontWeight: 700,
            fontFamily: 'inherit',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          Apply
        </button>
      )}
      <I.ChevronRight size={14} color="var(--ink-4)" style={{ flexShrink: 0 }} />
    </div>
  );
}

function BatchHeader({ batchId, decisions }) {
  const total = decisions.length;
  const applied = decisions.filter((d) => d.status === 'applied').length;
  const failed = decisions.filter((d) => d.status === 'failed').length;
  const expired = decisions.filter((d) => d.status === 'expired').length;
  const pending = decisions.filter((d) => d.status === 'proposed').length;
  return (
    <div
      style={{
        padding: '8px 12px',
        marginBottom: 10,
        background: 'var(--paper-2)',
        borderRadius: 'var(--r-2)',
        borderLeft: '3px solid var(--ink-4)',
      }}
    >
      <div className="t-mono-sm mono" style={{ color: 'var(--ink-3)' }}>
        BATCH FROM CHAT · {total} items
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 2 }}>
        {applied > 0 && <span>{applied} applied</span>}
        {pending > 0 && (
          <span>
            {applied > 0 ? ' · ' : ''}
            {pending} pending
          </span>
        )}
        {failed > 0 && (
          <span style={{ color: 'var(--bad)' }}>
            {' · '}
            {failed} failed
          </span>
        )}
        {expired > 0 && (
          <span style={{ color: 'var(--ink-4)' }}>
            {' · '}
            {expired} expired
          </span>
        )}
      </div>
    </div>
  );
}

function DecisionsTab({ onMenu }) {
  const { supervisorDecisions } = AxhyData;
  const [applyingId, setApplyingId] = React.useState(null);
  const [dismissedIds, setDismissedIds] = React.useState([]);
  const [appliedIds, setAppliedIds] = React.useState([]);
  const [toastMsg, setToastMsg] = React.useState(null);
  // r4 — which row is currently expanded into card mode (for "row mode at count ≥ 3")
  const [expandedId, setExpandedId] = React.useState(null);

  const handleApply = (d) => {
    setApplyingId(d.id);
    setTimeout(() => {
      setApplyingId(null);
      setAppliedIds((ids) => [...ids, d.id]);
      setToastMsg(`✓ Applied: ${d.title}`);
      setTimeout(() => setToastMsg(null), 2500);
    }, 600);
  };
  const handleDismiss = (d) => {
    setDismissedIds((ids) => [...ids, d.id]);
    setToastMsg(`Dismissed`);
    setTimeout(() => setToastMsg(null), 2000);
  };
  const handlePickOption = (d, opt) => {
    setApplyingId(d.id);
    setTimeout(() => {
      setApplyingId(null);
      setAppliedIds((ids) => [...ids, d.id]);
      setToastMsg(`✓ Resolved: ${opt.label}`);
      setTimeout(() => setToastMsg(null), 2500);
    }, 600);
  };

  // Merge optimistic state into the data
  const allDecisions = supervisorDecisions.map((d) => {
    if (appliedIds.includes(d.id)) return { ...d, status: 'applied' };
    if (dismissedIds.includes(d.id)) return { ...d, status: 'dismissed' };
    return d;
  });

  // Group by batch (no batch = standalone)
  const batchGroups = {};
  const standalone = [];
  allDecisions.forEach((d) => {
    if (d.batchId) {
      if (!batchGroups[d.batchId]) batchGroups[d.batchId] = [];
      batchGroups[d.batchId].push(d);
    } else {
      standalone.push(d);
    }
  });

  const pendingCount = allDecisions.filter((d) => d.status === 'proposed').length;
  const expiredCount = allDecisions.filter((d) => d.status === 'expired').length;

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
      {/* Header */}
      <TopAppBar
        title={pendingCount > 0 ? `${pendingCount} pending` : 'All clear'}
        subtitle="DECISIONS WORKSPACE"
        onMenu={onMenu}
        actions={[{ icon: <I.Search size={18} />, label: 'Search decisions', onClick: () => {} }]}
      />

      {/* Scrollable list */}
      <div className="qbar" style={{ flex: 1, overflow: 'auto', padding: '14px 14px 100px' }}>
        {/* r5 — tier-grouped sections, NOT a flat list. Friend's lock
            2026-05-12: "strengthen hierarchy between urgent, normal, and
            failed/review items." Three buckets visible at-a-glance:
              · NEEDS YOU NOW  — employment + review_required (full card)
              · ROUTINE        — operational + personnel + note (ultra row)
              · FAILED         — status=failed (faded ultra row)
            Batch grouping de-prioritized — priority eats batching. */}
        {(() => {
          const urgent = [];
          const routine = [];
          const failed = [];
          allDecisions.forEach((d) => {
            if (d.status === 'failed') {
              failed.push(d);
            } else if (d.tier === 'employment' || d.tier === 'review_required') {
              urgent.push(d);
            } else if (d.status === 'proposed') {
              routine.push(d);
            }
          });
          const renderExpandable = (d, faded) => (
            <DecisionRowUltra
              key={d.id}
              d={d}
              faded={faded}
              expanded={expandedId === d.id}
              onExpand={() => setExpandedId(expandedId === d.id ? null : d.id)}
              onApply={handleApply}
              onDismiss={handleDismiss}
              onPickOption={handlePickOption}
              applyingId={applyingId}
            />
          );
          return (
            <>
              {/* URGENT — always rendered as full card so it dominates the eye */}
              <DecisionSection label="Needs you now" count={urgent.length} color="var(--bad)">
                {urgent.map((d) => (
                  <DecisionRow
                    key={d.id}
                    d={d}
                    onApply={handleApply}
                    onDismiss={handleDismiss}
                    onPickOption={handlePickOption}
                    applyingId={applyingId}
                  />
                ))}
              </DecisionSection>

              {/* ROUTINE — ultra-compact rows */}
              <DecisionSection label="Routine" count={routine.length} color="var(--ink-3)">
                {routine.map((d) => renderExpandable(d, false))}
              </DecisionSection>

              {/* FAILED — faded ultra-compact rows */}
              <DecisionSection label="Failed · review" count={failed.length} color="var(--ink-4)">
                {failed.map((d) => renderExpandable(d, true))}
              </DecisionSection>

              {routine.length + failed.length > 0 && (
                <div
                  className="t-mono-sm mono"
                  style={{
                    textAlign: 'center',
                    color: 'var(--ink-4)',
                    marginTop: 10,
                  }}
                >
                  TAP A ROW TO INSPECT · APPLY
                </div>
              )}
            </>
          );
        })()}

        {/* Expired collapse — shown at bottom */}
        {expiredCount > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="t-caption" style={{ color: 'var(--ink-4)' }}>
              {expiredCount} EXPIRED — see Activity for full record
            </div>
          </div>
        )}

        {allDecisions.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✓</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-2)' }}>All clear</div>
            <div className="t-body-sm" style={{ color: 'var(--ink-3)', marginTop: 4 }}>
              No pending decisions right now.
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toastMsg && (
        <div
          style={{
            position: 'absolute',
            bottom: 90,
            left: 14,
            right: 14,
            background: 'var(--ink)',
            color: 'var(--card)',
            padding: '10px 14px',
            borderRadius: 'var(--r-2)',
            fontSize: 13,
            fontWeight: 500,
            textAlign: 'center',
            boxShadow: 'var(--sh-2)',
            zIndex: 50,
          }}
        >
          {toastMsg}
        </div>
      )}
    </div>
  );
}

window.AxhyDecisionsTab = DecisionsTab;
