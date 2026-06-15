/**
 * HR-portal presentation formatters — pure functions, no I/O, no React.
 *
 * Single source of truth for money (paise→₹), dates (en-IN), and initials so
 * every screen renders identically and locale rules live in one place.
 */

const INR = new Intl.NumberFormat('en-IN');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * paise → `Rs 18,500` (salary/pay are stored in paise per ADR-0025).
 * @derives(master-plan §G)
 */
export function rupees(paise: number | null | undefined): string {
  if (paise == null) return '—';
  return `Rs ${INR.format(Math.round(paise / 100))}`;
}

/**
 * `2026-06-16` (or ISO) → `16 Jun 2026`.
 * @derives(master-plan §G)
 */
export function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '—';
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/**
 * ISO → `16 Jun, 2:15 pm` in Asia/Kolkata.
 * @derives(master-plan §G)
 */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '—';
  const date = dt.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
  const time = dt
    .toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    })
    .toLowerCase();
  return `${date}, ${time}`;
}

/**
 * `2026-06-16` → `16 Jun` (no year).
 * @derives(master-plan §G)
 */
export function fmtDateShort(value: string | null | undefined): string {
  if (!value) return '—';
  const [, m, d] = value.slice(0, 10).split('-').map(Number);
  if (!m || !d) return '—';
  return `${d} ${MONTHS[m - 1]}`;
}

/**
 * `06:00` → `6:00 am`.
 * @derives(master-plan §G)
 */
export function fmtTime12(hhmm: string | null | undefined): string {
  if (!hhmm) return '—';
  let [h, m] = hhmm.split(':').map(Number) as [number, number];
  const ap = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return `${h}:${String(m ?? 0).padStart(2, '0')} ${ap}`;
}

/**
 * Up to two uppercase initials for avatars/logos.
 * @derives(master-plan §G)
 */
export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?'
  );
}
