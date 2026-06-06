// Axhy HR Payroll v2 — data engine + helpers + UI atoms.
// Scales to a 2,000-employee company: exception-first review, dense table.

// ── Money (paise ints, India grouping) ──────────────────────────────────────
function inr2(paise, { dec = 'auto' } = {}) {
  const neg = paise < 0,
    abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100),
    p = abs % 100;
  const s = String(rupees);
  let g;
  if (s.length <= 3) g = s;
  else {
    const l3 = s.slice(-3),
      rest = s.slice(0, -3);
    g = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + l3;
  }
  const showP = dec === true || (dec === 'auto' && p !== 0);
  return (neg ? '\u2212\u20b9' : '\u20b9') + g + (showP ? '.' + String(p).padStart(2, '0') : '');
}
// Compact ₹ for big totals: ₹3.21Cr / ₹4.6L
function inrShort(paise) {
  const r = paise / 100;
  if (r >= 1e7) return '\u20b9' + (r / 1e7).toFixed(2) + ' Cr';
  if (r >= 1e5) return '\u20b9' + (r / 1e5).toFixed(2) + ' L';
  return inr2(paise, { dec: false });
}

// ── Seeded RNG (stable across reloads) ──────────────────────────────────────
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  'Mukesh',
  'Ravi',
  'Priya',
  'Asha',
  'Vikram',
  'Lakshmi',
  'Geetha',
  'Naveen',
  'Suresh',
  'Anita',
  'Rajesh',
  'Deepa',
  'Kiran',
  'Manju',
  'Prakash',
  'Sunita',
  'Ramesh',
  'Kavya',
  'Arjun',
  'Divya',
  'Sanjay',
  'Pooja',
  'Vijay',
  'Rekha',
  'Mohan',
  'Shanti',
  'Ganesh',
  'Latha',
  'Harish',
  'Meena',
  'Vinod',
  'Usha',
  'Babu',
  'Roopa',
  'Srinivas',
  'Jaya',
  'Krishna',
  'Nirmala',
  'Raju',
  'Padma',
  'Mahesh',
  'Bhavya',
  'Gopal',
  'Sarita',
  'Yusuf',
  'Fatima',
  'Imran',
  'Zoya',
];
const LAST = [
  'K.',
  'S.',
  'M.',
  'B.',
  'T.',
  'P.',
  'R.',
  'H.',
  'N.',
  'G.',
  'D.',
  'V.',
  'L.',
  'A.',
  'J.',
  'C.',
];
const SITES = [
  'Phoenix Mall',
  'Lulu Mall',
  'Brigade Tower 3',
  'Manyata Block 4',
  'Embassy Tech · Wing C',
  'Prestige Falcon',
  'Bagmane Tech Park',
  'RMZ Ecospace',
  'Cessna Business Park',
  'UB City',
  'Mantri Square',
  'Forum Mall',
  'Orion Mall',
  'Garuda Mall',
  'World Trade Center',
  'Vaishnavi Tech Park',
  'Salarpuria Aura',
  'Karle Town',
  'Bhartiya City',
  'Purva Riviera',
  'Sobha Dream',
  'Prestige Shantiniketan',
  'Brigade Gateway',
  'Divyasree Tech',
];
const BASES = [
  1400000, 1500000, 1500000, 1600000, 1600000, 1650000, 1700000, 1700000, 1800000, 1900000, 2000000,
  2200000, 2400000,
];
const ADJ_TYPES = [
  { code: 'ADVANCE', label: 'Advance recovery', sign: -1 },
  { code: 'UNIFORM', label: 'Uniform cost', sign: -1 },
  { code: 'DAMAGE', label: 'Damage recovery', sign: -1 },
  { code: 'BONUS', label: 'Performance bonus', sign: 1 },
  { code: 'ARREAR', label: 'Arrear', sign: 1 },
];
const BASE_DAYS = 31; // May 2026, calendar_days basis

// Build the 2,000-employee roster once (memoized, deterministic).
function buildRoster() {
  if (window.__AXHY_ROSTER) return window.__AXHY_ROSTER;
  const rnd = mulberry32(20260601);
  const N = 2000;
  const emps = [];
  for (let i = 0; i < N; i++) {
    const first = FIRST[Math.floor(rnd() * FIRST.length)];
    const last = LAST[Math.floor(rnd() * LAST.length)];
    const site = SITES[Math.floor(rnd() * SITES.length)];
    const base = BASES[Math.floor(rnd() * BASES.length)];
    const role = rnd() < 0.08 ? 'Supervisor' : 'Worker';

    // LOP distribution — most are clean
    let lopDays = 0;
    const r = rnd();
    if (r > 0.985) lopDays = 3;
    else if (r > 0.965) lopDays = 2;
    else if (r > 0.94) lopDays = 1.5;
    else if (r > 0.9) lopDays = 1;
    else if (r > 0.86) lopDays = 0.5;

    let waived = false;
    if (lopDays > 0 && rnd() < 0.12) waived = true;

    const adjustments = [];
    if (rnd() < 0.025) {
      const t = ADJ_TYPES[Math.floor(rnd() * ADJ_TYPES.length)];
      const amt = (Math.floor(rnd() * 8) + 1) * 25000; // ₹250–₹2000
      adjustments.push({ id: 'a' + i, code: t.code, label: t.label, amount: amt, sign: t.sign });
    }
    const newJoiner = rnd() < 0.02;
    const salaryChanged = rnd() < 0.012;

    const emp = {
      id: 'e' + i,
      name: `${first} ${last}`,
      initial: first[0],
      site,
      role,
      base,
      lopDays,
      waived,
      adjustments,
      newJoiner,
      salaryChanged,
    };
    emp.calc = computeNet(emp);
    emp.flags = exceptionFlags(emp);
    emp.needsReview = emp.flags.length > 0;
    emps.push(emp);
  }
  window.__AXHY_ROSTER = emps;
  return emps;
}

function computeNet(e) {
  const dailyRate = Math.round(e.base / BASE_DAYS);
  const lop = e.waived ? 0 : Math.round(dailyRate * e.lopDays);
  let earn = 0,
    ded = 0;
  e.adjustments.forEach((a) => {
    if (a.sign > 0) earn += a.amount;
    else ded += a.amount;
  });
  const gross = e.base + earn;
  const totalDeduct = lop + ded;
  const net = gross - totalDeduct;
  const payableDays = e.waived ? BASE_DAYS : BASE_DAYS - e.lopDays;
  return { dailyRate, lop, earn, ded, gross, totalDeduct, net, payableDays, baseDays: BASE_DAYS };
}

function exceptionFlags(e) {
  const f = [];
  if (e.lopDays > 0 && !e.waived) f.push('LOP');
  if (e.waived) f.push('WAIVED');
  if (e.adjustments.length) f.push(e.adjustments[0].sign > 0 ? 'EARNING' : 'DEDUCTION');
  if (e.newJoiner) f.push('NEW');
  if (e.salaryChanged) f.push('SALARY↑');
  return f;
}

// Rebuild a single employee's calc/flags after an edit.
function recalc(e) {
  e.calc = computeNet(e);
  e.flags = exceptionFlags(e);
  e.needsReview = e.flags.length > 0;
  return e;
}

// ── UI atoms ────────────────────────────────────────────────────────────────
function Pill2({ children, tone = 'paper', small }) {
  const map = {
    paper: ['var(--paper-3)', 'var(--ink-2)'],
    accent: ['var(--accent-soft)', 'var(--accent-ink)'],
    ok: ['var(--ok-soft)', '#2e5037'],
    bad: ['var(--bad-soft)', '#6e2410'],
    warn: ['var(--warn-soft)', '#7a5a08'],
    info: ['var(--info-soft)', 'var(--info-ink)'],
  };
  const [bg, fg] = map[tone] || map.paper;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        background: bg,
        color: fg,
        padding: small ? '2px 7px' : '4px 10px',
        borderRadius: 999,
        fontSize: small ? 10.5 : 12,
        fontWeight: 700,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

function FlagChip({ flag }) {
  const map = {
    LOP: ['bad', 'LOP'],
    WAIVED: ['info', 'Waived'],
    DEDUCTION: ['warn', 'Deduction'],
    EARNING: ['ok', 'Bonus'],
    NEW: ['accent', 'New joiner'],
    'SALARY↑': ['info', 'Salary changed'],
  };
  const [tone, label] = map[flag] || ['paper', flag];
  return (
    <Pill2 tone={tone} small>
      {label}
    </Pill2>
  );
}

function Btn2({ children, kind = 'ghost', onClick, icon, disabled, size = 'md' }) {
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: size === 'sm' ? 32 : 38,
    padding: size === 'sm' ? '0 12px' : '0 16px',
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
    soft: { background: 'var(--paper-2)', color: 'var(--ink-2)', border: '1px solid transparent' },
    danger: { background: 'transparent', color: 'var(--bad)', border: '1px solid var(--bad-soft)' },
  };
  return (
    <button onClick={disabled ? undefined : onClick} style={{ ...base, ...kinds[kind] }}>
      {icon}
      {children}
    </button>
  );
}

function Avatar2({ initial, size = 30, tone = 'paper' }) {
  const tones = {
    paper: ['var(--paper-3)', 'var(--ink-2)'],
    accent: ['var(--accent-soft)', 'var(--accent-ink)'],
    ink: ['var(--ink)', 'var(--card)'],
  };
  const [bg, fg] = tones[tone] || tones.paper;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        color: fg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 600,
        fontSize: size * 0.42,
        flexShrink: 0,
      }}
    >
      {initial}
    </div>
  );
}

function Ico({ d, size = 18, color = 'currentColor', sw = 1.8, fill = 'none' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke={color}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <path d={d} />
    </svg>
  );
}
const ICON = {
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  chevR: 'M9 6l6 6-6 6',
  chevL: 'M15 6l-6 6 6 6',
  chevD: 'M6 9l6 6 6-6',
  check: 'M5 12l5 5L20 7',
  x: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  refresh: 'M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  shield: 'M12 2l7 4v6c0 4-3 7-7 8-4-1-7-4-7-8V6l7-4z',
  rupee: 'M7 5h10M7 9h10M14 5c0 4-3 5-7 5l6 9',
  filter: 'M3 5h18l-7 9v6l-4-2v-4L3 5z',
  density: 'M3 5h18M3 10h18M3 15h18M3 20h18',
  site: 'M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5',
  warn: 'M12 9v4M12 17h0M3 12a9 9 0 1 1 18 0 9 9 0 0 1-18 0z',
};

Object.assign(window, {
  inr2,
  inrShort,
  buildRoster,
  computeNet,
  recalc,
  exceptionFlags,
  Pill2,
  FlagChip,
  Btn2,
  Avatar2,
  Ico,
  ICON,
  ADJ_TYPES,
  BASE_DAYS,
  SITES,
});
