// Axhy HR Payroll portal — web (desktop) admin surface.
// Implements the researched blueprint: PayRun → Payslip → PayslipLine,
// DRAFT→APPROVED→PAID lifecycle, frozen configSnapshot, editable LOP lines,
// manual mark-paid (method + reference, NO gateway). Paper + terracotta system.

const { useState, useMemo } = React;

// ── Money helpers (paise ints, India grouping) ─────────────────────────────
function inr(paise, { decimals = 'auto' } = {}) {
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const p = abs % 100;
  // Indian digit grouping (last 3, then pairs)
  const s = String(rupees);
  let grouped;
  if (s.length <= 3) grouped = s;
  else {
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3);
    grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  }
  const showP = decimals === true || (decimals === 'auto' && p !== 0);
  return (
    (neg ? '\u2212\u20b9' : '\u20b9') + grouped + (showP ? '.' + String(p).padStart(2, '0') : '')
  );
}

const roundNearest = (x) => Math.round(x);

// ── Frozen config snapshot for the current run (resolved Policy → JSON) ─────
const CONFIG_SNAPSHOT = {
  deductionsEnabled: true,
  baseDaysBasis: 'calendar_days',
  baseDays: 31, // May 2026
  payPeriod: 'calendar_month',
  rounding: 'nearest',
  approvalRequired: true,
  lopStatuses: ['ABSENT_NO_CALL'],
  halfDayFactor: 0.5,
  adjustmentTypes: [
    { code: 'ADVANCE', label: 'Advance recovery', sign: -1 },
    { code: 'UNIFORM', label: 'Uniform cost', sign: -1 },
    { code: 'DAMAGE', label: 'Damage recovery', sign: -1 },
    { code: 'BONUS', label: 'Performance bonus', sign: 1 },
    { code: 'ARREAR', label: 'Arrear', sign: 1 },
  ],
  paymentMethods: ['CASH', 'UPI', 'BANK', 'CHEQUE'],
};

// ── Seed worker data for the May 2026 DRAFT run ─────────────────────────────
// baseSalaryPaise is FROZEN onto the payslip at run creation.
const SEED_WORKERS = [
  {
    id: 'mukesh',
    name: 'Mukesh K.',
    initial: 'M',
    role: 'Worker',
    base: 1800000,
    lopDays: 2.0,
    adjustments: [],
  },
  {
    id: 'ravi',
    name: 'Ravi S.',
    initial: 'R',
    role: 'Worker',
    base: 1650000,
    lopDays: 0,
    adjustments: [],
  },
  {
    id: 'priya',
    name: 'Priya M.',
    initial: 'P',
    role: 'Worker',
    base: 1700000,
    lopDays: 1.0,
    adjustments: [],
  },
  {
    id: 'asha',
    name: 'Asha B.',
    initial: 'A',
    role: 'Worker',
    base: 1600000,
    lopDays: 0.5,
    adjustments: [],
  },
  {
    id: 'vikram',
    name: 'Vikram T.',
    initial: 'V',
    role: 'Supervisor',
    base: 1900000,
    lopDays: 0,
    adjustments: [{ id: 'a1', code: 'BONUS', label: 'Performance bonus', amount: 50000, sign: 1 }],
  },
  {
    id: 'lakshmi',
    name: 'Lakshmi P.',
    initial: 'L',
    role: 'Worker',
    base: 1650000,
    lopDays: 1.0,
    adjustments: [
      { id: 'a2', code: 'ADVANCE', label: 'Advance recovery', amount: 200000, sign: -1 },
    ],
  },
  {
    id: 'geetha',
    name: 'Geetha R.',
    initial: 'G',
    role: 'Worker',
    base: 1750000,
    lopDays: 1.0,
    lopWaived: true,
    adjustments: [],
  },
  {
    id: 'naveen',
    name: 'Naveen H.',
    initial: 'N',
    role: 'Worker',
    base: 1600000,
    lopDays: 0,
    adjustments: [],
  },
];

// Compute a payslip's lines + rollups from frozen base + attendance + overrides.
function computePayslip(w, cfg) {
  const lines = [];
  // SALARY_BASE (system, earning)
  lines.push({ kind: 'SALARY_BASE', label: 'Base salary', amount: w.base, system: true });

  // LOP_DEDUCTION (system, derived — unless waived/edited or deductions off)
  let lopPaise = 0;
  if (cfg.deductionsEnabled && w.lopDays > 0) {
    const dailyRate = roundNearest(w.base / cfg.baseDays);
    lopPaise = roundNearest(dailyRate * w.lopDays);
    if (w.lopWaived) {
      lines.push({
        kind: 'LOP_DEDUCTION',
        label: `Loss of pay \u2014 ${w.lopDays} day waived`,
        amount: 0,
        system: false,
        edited: true,
        note: 'Waived \u00b7 covered by teammate',
        sourceRef: { lopDays: w.lopDays, baseDays: cfg.baseDays },
      });
    } else {
      lines.push({
        kind: 'LOP_DEDUCTION',
        label: `Loss of pay \u2014 ${w.lopDays % 1 ? w.lopDays : w.lopDays} ${w.lopDays === 1 ? 'day' : 'days'}`,
        amount: -lopPaise,
        system: true,
        sourceRef: { lopDays: w.lopDays, baseDays: cfg.baseDays },
      });
    }
  }

  // Manual adjustment lines (HR-owned, never machine-touched)
  w.adjustments.forEach((a) => {
    lines.push({
      kind: a.sign > 0 ? 'ADJUST_EARNING' : 'ADJUST_DEDUCTION',
      label: a.label,
      amount: a.sign * a.amount,
      system: false,
      manual: true,
      id: a.id,
    });
  });

  const gross = lines.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0);
  const totalDeduct = -lines.filter((l) => l.amount < 0).reduce((s, l) => s + l.amount, 0);
  const net = lines.reduce((s, l) => s + l.amount, 0);
  const payableDays = w.lopWaived ? cfg.baseDays : cfg.baseDays - w.lopDays;

  return { lines, gross, totalDeduct, net, payableDays, baseDays: cfg.baseDays };
}

// ── Status pill ─────────────────────────────────────────────────────────────
function StatusPill({ status, small }) {
  const map = {
    DRAFT: { bg: 'var(--paper-3)', fg: 'var(--ink-2)', label: 'Draft' },
    APPROVED: { bg: 'var(--info-soft)', fg: 'var(--info-ink)', label: 'Approved' },
    PAID: { bg: 'var(--ok-soft)', fg: '#2e5037', label: 'Paid' },
    VOID: { bg: 'var(--bad-soft)', fg: '#6e2410', label: 'Void' },
  };
  const s = map[status] || map.DRAFT;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: s.bg,
        color: s.fg,
        padding: small ? '3px 9px' : '5px 12px',
        borderRadius: 999,
        fontSize: small ? 11 : 12,
        fontWeight: 700,
        letterSpacing: '0.02em',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.fg }} />
      {s.label}
    </span>
  );
}

// ── Sidebar ─────────────────────────────────────────────────────────────────
function Sidebar({ nav, setNav }) {
  const items = [
    {
      id: 'overview',
      label: 'Overview',
      d: 'M3 13h8V3H3v10zM13 21h8V11h-8v10zM13 3v6h8V3h-8zM3 21h8v-6H3v6z',
    },
    { id: 'payroll', label: 'Payroll', d: 'M3 6h18v12H3zM3 10h18M7 15h4' },
    {
      id: 'workers',
      label: 'Workers',
      d: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3.3 3.1-6 7-6s7 2.7 7 6M17 11a3 3 0 0 0 0-6M22 20c0-2.5-1.7-4.6-4-5.5',
    },
    { id: 'sites', label: 'Sites', d: 'M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5' },
    {
      id: 'settings',
      label: 'Settings',
      d: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13a7.5 7.5 0 0 0 0-2l2-1.5-2-3.5-2.3 1a7.5 7.5 0 0 0-1.7-1l-.3-2.5h-4l-.3 2.5a7.5 7.5 0 0 0-1.7 1l-2.3-1-2 3.5L4.6 11a7.5 7.5 0 0 0 0 2l-2 1.5 2 3.5 2.3-1a7.5 7.5 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7.5 7.5 0 0 0 1.7-1l2.3 1 2-3.5-2-1.5z',
    },
  ];
  return (
    <div
      style={{
        width: 232,
        background: 'var(--card)',
        borderRight: '1px solid var(--paper-3)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}
    >
      {/* Brand */}
      <div
        style={{
          padding: '20px 20px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 11,
          borderBottom: '1px solid var(--paper-3)',
        }}
      >
        <div
          style={{
            fontWeight: 800,
            fontSize: 22,
            letterSpacing: '-1px',
            color: 'var(--ink)',
            display: 'flex',
            alignItems: 'baseline',
          }}
        >
          A<span style={{ color: 'var(--accent)' }}>·</span>
        </div>
        <div>
          <div
            style={{ fontWeight: 700, fontSize: 14, color: 'var(--ink)', letterSpacing: '0.02em' }}
          >
            AXHY
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>HR Console</div>
        </div>
      </div>

      <div style={{ padding: '14px 12px', flex: 1 }}>
        {items.map((it) => {
          const active = nav === it.id;
          return (
            <button
              key={it.id}
              onClick={() => setNav(it.id)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 12px',
                marginBottom: 2,
                borderRadius: 9,
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                background: active ? 'var(--accent-soft)' : 'transparent',
                color: active ? 'var(--accent-ink)' : 'var(--ink-2)',
                fontFamily: 'inherit',
                fontSize: 14,
                fontWeight: active ? 700 : 500,
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke={active ? 'var(--accent)' : 'var(--ink-3)'}
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d={it.d} />
              </svg>
              {it.label}
            </button>
          );
        })}
      </div>

      {/* Current user */}
      <div
        style={{
          padding: '14px 16px',
          borderTop: '1px solid var(--paper-3)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'var(--ink)',
            color: 'var(--card)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 13,
          }}
        >
          K
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Kavitha R.</div>
          <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>HR · Reddy Cleaning</div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  inr,
  roundNearest,
  CONFIG_SNAPSHOT,
  SEED_WORKERS,
  computePayslip,
  StatusPill,
  Sidebar,
});
