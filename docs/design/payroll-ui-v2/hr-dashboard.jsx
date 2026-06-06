// Axhy HR Payroll — screens (dashboard + run review) and modals.

const { useState: useStateS, useMemo: useMemoS } = React;

// Past runs (static, terminal) + current DRAFT.
const PAST_RUNS = [
  {
    id: 'apr',
    period: 'April 2026',
    range: '1 Apr – 30 Apr',
    status: 'PAID',
    workers: 8,
    net: 13186900,
    deduct: 313100,
    method: 'BANK',
    ref: 'NEFT-AXB-0419',
    paidOn: '2 May 2026',
  },
  {
    id: 'mar',
    period: 'March 2026',
    range: '1 Mar – 31 Mar',
    status: 'PAID',
    workers: 8,
    net: 13402600,
    deduct: 97400,
    method: 'UPI',
    ref: 'UPI-8842913201',
    paidOn: '2 Apr 2026',
  },
  {
    id: 'feb',
    period: 'February 2026',
    range: '1 Feb – 28 Feb',
    status: 'PAID',
    workers: 7,
    net: 11689000,
    deduct: 211000,
    method: 'CASH',
    ref: 'Cash · hand-paid',
    paidOn: '3 Mar 2026',
  },
];

// ── Header bar shared across HR screens ─────────────────────────────────────
function TopBar({ title, sub, right }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        padding: '22px 32px 18px',
        borderBottom: '1px solid var(--paper-3)',
      }}
    >
      <div>
        <div
          style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.4px', color: 'var(--ink)' }}
        >
          {title}
        </div>
        {sub && <div style={{ fontSize: 13, color: 'var(--ink-3)', marginTop: 3 }}>{sub}</div>}
      </div>
      {right}
    </div>
  );
}

function Btn({ children, kind = 'ghost', onClick, icon, disabled, size = 'md' }) {
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: size === 'sm' ? 32 : 40,
    padding: size === 'sm' ? '0 12px' : '0 18px',
    borderRadius: 9,
    fontFamily: 'inherit',
    fontWeight: 600,
    fontSize: size === 'sm' ? 13 : 14,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    whiteSpace: 'nowrap',
  };
  const kinds = {
    primary: { background: 'var(--ink)', color: 'var(--card)', border: 'none' },
    accent: { background: 'var(--accent)', color: 'var(--card)', border: 'none' },
    ghost: {
      background: 'var(--card)',
      color: 'var(--ink-2)',
      border: '1px solid var(--card-edge)',
    },
    danger: { background: 'transparent', color: 'var(--bad)', border: '1px solid var(--bad-soft)' },
  };
  return (
    <button onClick={disabled ? undefined : onClick} style={{ ...base, ...kinds[kind] }}>
      {icon}
      {children}
    </button>
  );
}

// ── Dashboard: list of pay runs ─────────────────────────────────────────────
function PayrollDashboard({ currentRun, onOpen }) {
  const rows = [
    {
      id: 'may',
      period: 'May 2026',
      range: '1 May – 31 May',
      status: currentRun.status,
      workers: currentRun.workers,
      net: currentRun.net,
      deduct: currentRun.deduct,
      method: currentRun.method,
      ref: currentRun.ref,
      paidOn: currentRun.paidOn,
    },
    ...PAST_RUNS,
  ];
  return (
    <div style={{ flex: 1, overflow: 'auto' }}>
      <TopBar
        title="Payroll"
        sub="Reddy Cleaning Services · monthly salary runs"
        right={
          <Btn kind="accent" icon={<Plus />}>
            New pay run
          </Btn>
        }
      />

      {/* Summary tiles */}
      <div
        style={{
          padding: '20px 32px 4px',
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 14,
        }}
      >
        <Tile
          label="This month — net"
          value={inr(currentRun.net)}
          sub={`${currentRun.workers} workers`}
          accent
        />
        <Tile
          label="Deductions (LOP)"
          value={inr(currentRun.deduct)}
          sub="editable · admin-reviewed"
        />
        <Tile
          label="Status"
          valueNode={<StatusPill status={currentRun.status} />}
          sub="May 2026 run"
        />
        <Tile
          label="Last paid"
          value={inr(PAST_RUNS[0].net)}
          sub={`${PAST_RUNS[0].period} · ${PAST_RUNS[0].method}`}
        />
      </div>

      {/* Table */}
      <div style={{ padding: '18px 32px 32px' }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
            marginBottom: 10,
          }}
        >
          Pay runs
        </div>
        <div
          style={{
            background: 'var(--card)',
            border: '1px solid var(--card-edge)',
            borderRadius: 14,
            overflow: 'hidden',
            boxShadow: 'var(--sh-1)',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.4fr 1fr 0.8fr 1fr 1.2fr 90px',
              columnGap: 18,
              padding: '11px 20px',
              borderBottom: '1px solid var(--paper-3)',
              background: 'var(--paper-2)',
            }}
          >
            {['Period', 'Status', 'Workers', 'Deductions', 'Net payable', ''].map((h, i) => (
              <div
                key={i}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-3)',
                  textAlign: i === 2 || i === 3 || i === 4 ? 'right' : 'left',
                }}
              >
                {h}
              </div>
            ))}
          </div>
          {rows.map((r, i) => (
            <div
              key={r.id}
              onClick={() => onOpen(r.id)}
              style={{
                display: 'grid',
                gridTemplateColumns: '1.4fr 1fr 0.8fr 1fr 1.2fr 90px',
                columnGap: 18,
                alignItems: 'center',
                padding: '15px 20px',
                borderBottom: i < rows.length - 1 ? '1px solid var(--paper-3)' : 'none',
                cursor: 'pointer',
              }}
            >
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{r.period}</div>
                <div
                  style={{ fontSize: 12, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}
                >
                  {r.range}
                </div>
              </div>
              <div>
                <StatusPill status={r.status} small />
              </div>
              <div
                style={{
                  textAlign: 'right',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 14,
                  color: 'var(--ink-2)',
                }}
              >
                {r.workers}
              </div>
              <div
                style={{
                  textAlign: 'right',
                  whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 14,
                  color: 'var(--ink-2)',
                }}
              >
                {inr(r.deduct)}
              </div>
              <div
                style={{
                  textAlign: 'right',
                  whiteSpace: 'nowrap',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 15,
                  fontWeight: 600,
                  color: 'var(--ink)',
                }}
              >
                {inr(r.net)}
              </div>
              <div style={{ textAlign: 'right', color: 'var(--ink-3)' }}>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, valueNode, sub, accent }) {
  return (
    <div
      style={{
        background: 'var(--card)',
        border: '1px solid var(--card-edge)',
        borderRadius: 14,
        padding: '16px 18px',
        boxShadow: 'var(--sh-1)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'var(--ink-3)',
        }}
      >
        {label}
      </div>
      <div style={{ marginTop: 8 }}>
        {valueNode || (
          <div
            style={{
              fontSize: 26,
              fontWeight: 700,
              letterSpacing: '-0.6px',
              color: accent ? 'var(--accent)' : 'var(--ink)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {value}
          </div>
        )}
      </div>
      {sub && <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function Plus() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

Object.assign(window, { PayrollDashboard, TopBar, Btn, Tile, Plus, PAST_RUNS });
