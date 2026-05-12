/* global React, I, AxhyShell, AxhyData */
// Activity / Proof — the trust moat. Chronological AuditEvent timeline with
// structured filters (date, worker, site, kind). Each row shows action +
// reason + source + [Share to WhatsApp] + [Reverse] (within 30-min window).
// Per operations-first reframing (2026-05-11): the surface owners can read
// to answer "what happened today?"
//
// NO natural-language search at launch — structured filters only.

const { CaptionEyebrow, TopAppBar } = AxhyShell;

// Icon names below MUST exist in icons.jsx. Available: Mic, MessageSquare, Calendar,
// BarChart, Bell, User, ChevronRight/Left/Down/Up, Edit, Logout, Building, Globe,
// Phone, Camera, Users, MapPin, Coins, Check, X, Plus, Star, UserPlus, AlertTriangle,
// AlertCircle, Clock, Pause, Search, RefreshCw, Sparkle, Send, Wifi, MoreVertical,
// HelpCircle.
const KIND_LABEL = {
  WORKER_MARKED_ABSENT: { label: 'marked absent', icon: 'X', color: 'var(--bad)' },
  WORKER_MARKED_LATE: { label: 'marked late', icon: 'Clock', color: 'var(--warn)' },
  WORKER_MARKED_PRESENT: { label: 'marked present', icon: 'Check', color: 'var(--ok)' },
  DECISION_PROPOSED: { label: 'proposed', icon: 'MessageSquare', color: 'var(--info-ink)' },
  DECISION_APPLIED: { label: 'applied', icon: 'Check', color: 'var(--ok)' },
  LIVING_DOC_RULE_ADDED: { label: 'rule added', icon: 'Star', color: 'var(--accent)' },
  LEAVE_APPROVED: { label: 'leave approved', icon: 'Calendar', color: 'var(--info-ink)' },
  SWAP_APPLIED: { label: 'swap applied', icon: 'ChevronRight', color: 'var(--info-ink)' },
  VISIT_COMPLETED: { label: 'visit completed', icon: 'Check', color: 'var(--ok)' },
  ATTENDANCE_REVERSED: { label: 'reversed', icon: 'RefreshCw', color: 'var(--warn)' },
};

function ActivityRow({ ev, onReverse, onShare, weakNetwork }) {
  const k = KIND_LABEL[ev.kind] || { label: ev.kind, icon: 'Circle', color: 'var(--ink-3)' };
  const Icon = I[k.icon] || I.Circle;
  const reverseDisabled = weakNetwork || !ev.reversible;
  // r3 design pass — actions hidden by default, tap row to reveal.
  // Friend's lock 2026-05-11: "Do not make Share to WhatsApp and Reverse
  // equally loud on every row. Use subtler row actions or reveal-on-tap/
  // swipe behavior."
  const [actionsOpen, setActionsOpen] = React.useState(false);

  return (
    <div
      className="card"
      style={{
        padding: 0,
        marginBottom: 8,
        overflow: 'hidden',
      }}
    >
      <div
        onClick={() => setActionsOpen(!actionsOpen)}
        style={{ padding: '12px 14px', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              background: 'var(--paper-2)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              color: k.color,
            }}
          >
            <Icon size={14} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                {ev.actorName} {k.label}
                {ev.workerName && <span style={{ fontWeight: 500 }}> {ev.workerName}</span>}
              </span>
              <span className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', flexShrink: 0 }}>
                {ev.time}
              </span>
            </div>
            {(ev.siteName || ev.reason || ev.payloadText) && (
              <div className="t-mono-sm mono" style={{ color: 'var(--ink-3)', marginTop: 4 }}>
                {ev.siteName && <span>SITE: {ev.siteName}</span>}
                {ev.siteName && ev.reason && <span> · </span>}
                {ev.reason && <span>REASON: {ev.reason}</span>}
                {ev.payloadText && <span>{ev.payloadText}</span>}
              </div>
            )}
          </div>
          <I.ChevronRight
            size={14}
            color="var(--ink-4)"
            style={{
              flexShrink: 0,
              marginTop: 2,
              transform: actionsOpen ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 180ms var(--ease)',
            }}
          />
        </div>
      </div>
      {actionsOpen && (
        <div
          style={{
            display: 'flex',
            borderTop: '1px solid var(--card-edge)',
            background: 'var(--paper-2)',
          }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onShare(ev);
            }}
            style={{
              flex: 1,
              padding: '8px 0',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--accent)',
              fontFamily: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <I.Send size={12} /> Share to WhatsApp
          </button>
          <div style={{ width: 1, background: 'var(--card-edge)' }} />
          <button
            onClick={(e) => {
              e.stopPropagation();
              !reverseDisabled && onReverse(ev);
            }}
            disabled={reverseDisabled}
            style={{
              flex: 1,
              padding: '8px 0',
              background: 'transparent',
              border: 'none',
              cursor: reverseDisabled ? 'not-allowed' : 'pointer',
              fontSize: 12,
              fontWeight: 600,
              color: reverseDisabled ? 'var(--ink-4)' : 'var(--warn)',
              fontFamily: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
            }}
          >
            <I.RefreshCw size={12} /> {reverseDisabled ? 'Reverse (>30 min)' : 'Reverse'}
          </button>
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px',
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
      {label}
    </button>
  );
}

function ShareSheet({ ev, weakNetwork, onClose, onConfirm }) {
  const text = `${ev.actorName} ${KIND_LABEL[ev.kind]?.label || ev.kind} ${ev.workerName || ''}${ev.siteName ? ' · ' + ev.siteName : ''}${ev.reason ? ' (reason: ' + ev.reason + ')' : ''} at ${ev.time}`;
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
        }}
      >
        <div className="t-caption" style={{ color: 'var(--accent)', marginBottom: 12 }}>
          SHARE TO WHATSAPP
        </div>
        {weakNetwork && (
          <div
            style={{
              padding: '10px 12px',
              marginBottom: 12,
              background: 'var(--warn-soft)',
              borderRadius: 'var(--r-2)',
              borderLeft: '3px solid var(--warn)',
            }}
          >
            <div className="t-mono-sm mono" style={{ color: 'var(--warn)', marginBottom: 4 }}>
              ⚠ STALE — LAST SYNCED 45 MIN AGO
            </div>
            <div className="t-body-sm" style={{ color: 'var(--ink-2)' }}>
              Actions in the last 45 minutes may not appear in this summary.
            </div>
          </div>
        )}
        <div
          style={{
            padding: 12,
            marginBottom: 16,
            background: 'var(--card)',
            borderRadius: 'var(--r-2)',
            border: '1px solid var(--card-edge)',
            fontSize: 14,
            color: 'var(--ink)',
            lineHeight: 1.4,
          }}
        >
          {text}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '12px 0',
              borderRadius: 'var(--r-2)',
              background: 'transparent',
              color: 'var(--ink-3)',
              border: '1px solid var(--card-edge)',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 2,
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
            Open WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}

function ActivityTab({ onMenu }) {
  const { activityEvents, weakNetwork } = AxhyData;
  const [dateFilter, setDateFilter] = React.useState('Today');
  const [siteFilter, setSiteFilter] = React.useState(null);
  const [kindFilter, setKindFilter] = React.useState(null);
  const [shareEv, setShareEv] = React.useState(null);
  const [toastMsg, setToastMsg] = React.useState(null);

  const events = activityEvents.filter((ev) => {
    if (dateFilter === 'Today' && ev.date !== 'Today') return false;
    if (dateFilter === 'Yesterday' && ev.date !== 'Yesterday') return false;
    if (
      dateFilter === 'This week' &&
      !(ev.date === 'Today' || ev.date === 'Yesterday' || ev.date.endsWith('days ago'))
    )
      return false;
    if (siteFilter && ev.siteId !== siteFilter) return false;
    if (kindFilter && ev.kind !== kindFilter) return false;
    return true;
  });

  const handleReverse = (ev) => {
    setToastMsg(`Reversed: ${ev.workerName || ev.kind}`);
    setTimeout(() => setToastMsg(null), 2500);
  };

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
        title={`${events.length} ${events.length === 1 ? 'event' : 'events'}`}
        subtitle="ACTIVITY · PROOF"
        onMenu={onMenu}
        actions={[{ icon: <I.Search size={18} />, label: 'Search activity', onClick: () => {} }]}
      />

      {/* Filter chips */}
      <div
        style={{
          flexShrink: 0,
          padding: '10px 14px',
          borderBottom: '1px solid var(--card-edge)',
          background: 'var(--paper)',
        }}
      >
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
          {['Today', 'Yesterday', 'This week'].map((d) => (
            <FilterChip
              key={d}
              active={dateFilter === d}
              label={d}
              onClick={() => setDateFilter(d)}
            />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6, overflowX: 'auto', paddingBottom: 4 }}>
          <FilterChip
            active={siteFilter === null}
            label="All sites"
            onClick={() => setSiteFilter(null)}
          />
          <FilterChip
            active={siteFilter === 's1'}
            label="Apollo"
            onClick={() => setSiteFilter('s1')}
          />
          <FilterChip
            active={siteFilter === 's2'}
            label="Hitech City"
            onClick={() => setSiteFilter('s2')}
          />
          <FilterChip
            active={siteFilter === 's3'}
            label="Westfield"
            onClick={() => setSiteFilter('s3')}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6, overflowX: 'auto', paddingBottom: 4 }}>
          <FilterChip
            active={kindFilter === null}
            label="All actions"
            onClick={() => setKindFilter(null)}
          />
          <FilterChip
            active={kindFilter === 'WORKER_MARKED_ABSENT'}
            label="Absences"
            onClick={() => setKindFilter('WORKER_MARKED_ABSENT')}
          />
          <FilterChip
            active={kindFilter === 'WORKER_MARKED_LATE'}
            label="Lates"
            onClick={() => setKindFilter('WORKER_MARKED_LATE')}
          />
          <FilterChip
            active={kindFilter === 'LEAVE_APPROVED'}
            label="Leaves"
            onClick={() => setKindFilter('LEAVE_APPROVED')}
          />
          <FilterChip
            active={kindFilter === 'SWAP_APPLIED'}
            label="Swaps"
            onClick={() => setKindFilter('SWAP_APPLIED')}
          />
        </div>
      </div>

      {/* Weak-network banner */}
      {weakNetwork.active && (
        <div
          style={{
            flexShrink: 0,
            padding: '8px 14px',
            background: 'var(--warn-soft)',
            borderBottom: '1px solid var(--warn)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <I.Wifi size={14} color="var(--warn)" />
          <span className="t-mono-sm mono" style={{ color: 'var(--warn)' }}>
            LAST SYNCED {weakNetwork.lastSyncedMinutesAgo} MIN AGO — REVERSE DISABLED
          </span>
        </div>
      )}

      {/* Timeline */}
      <div className="qbar" style={{ flex: 1, overflow: 'auto', padding: '14px 14px 100px' }}>
        {events.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink-2)' }}>
              No activity matches these filters.
            </div>
            <div className="t-body-sm" style={{ color: 'var(--ink-3)', marginTop: 4 }}>
              Try a wider date range or clear a filter.
            </div>
          </div>
        ) : (
          events.map((ev) => (
            <ActivityRow
              key={ev.id}
              ev={ev}
              onReverse={handleReverse}
              onShare={(e) => setShareEv(e)}
              weakNetwork={weakNetwork.active}
            />
          ))
        )}
      </div>

      {shareEv && (
        <ShareSheet
          ev={shareEv}
          weakNetwork={weakNetwork.active}
          onClose={() => setShareEv(null)}
          onConfirm={() => {
            setShareEv(null);
            setToastMsg('Opened WhatsApp share sheet');
            setTimeout(() => setToastMsg(null), 2000);
          }}
        />
      )}

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

window.AxhyActivityTab = ActivityTab;
