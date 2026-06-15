'use client';

import { useEffect, useState } from 'react';

import { Icon } from '../../../components/ui/Icon';
import { Chip } from '../../../components/ui/Chip';
import { Avatar } from '../../../components/ui/primitives';
import { fmtDate, rupees } from '../../../lib/format';
import type { PayrollData, PayrollRow } from '../data';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  return `${MONTHS[m - 1] ?? ''} ${y}`;
};

function downloadCSV(filename: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) =>
      r
        .map((c) => {
          const s = String(c ?? '');
          return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        })
        .join(','),
    )
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * HR payroll screen: shows per-site payroll rows with export and detail view.
 * @derives(master-plan §G)
 */
export function PayrollScreen({ data }: { data: PayrollData }) {
  const [siteF, setSiteF] = useState('all');
  const [sel, setSel] = useState<PayrollRow | null>(null);

  const sites = [...new Set(data.rows.map((r) => r.site))];
  const rows = siteF === 'all' ? data.rows : data.rows.filter((r) => r.site === siteF);
  const sum = rows.reduce(
    (a, r) => ({
      base: a.base + r.basePaise,
      deduct: a.deduct + r.deductPaise,
      net: a.net + r.netPaise,
    }),
    { base: 0, deduct: 0, net: 0 },
  );

  const exportCSV = () =>
    downloadCSV(`axhy-payroll-${data.month}.csv`, [
      ['Worker', 'Site', 'Base (Rs)', 'Present days', 'Deductions (Rs)', 'Net (Rs)'],
      ...rows.map((r) => [
        r.worker,
        r.site,
        Math.round(r.basePaise / 100),
        r.presentDays,
        Math.round(r.deductPaise / 100),
        Math.round(r.netPaise / 100),
      ]),
    ]);

  return (
    <div className="page page-wide">
      <div className="page-head">
        <div>
          <div className="eyebrow">Company · Payroll</div>
          <h1 className="page-title">Payroll</h1>
          <p className="page-sub">
            The month&apos;s salary per worker — base pay minus unpaid-absence deductions. Verify
            the numbers and hand off.
          </p>
        </div>
        <div className="head-actions">
          <div className="month-stepper">
            <button className="icon-btn" disabled title="Earlier months — Soon" type="button">
              <Icon name="chevL" size={16} />
            </button>
            <span className="mono">{monthLabel(data.month)}</span>
            <button className="icon-btn" disabled title="Later months — Soon" type="button">
              <Icon name="chevR" size={16} />
            </button>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            style={{ height: 40 }}
            onClick={exportCSV}
            type="button"
          >
            <Icon name="download" size={15} /> Download CSV
          </button>
        </div>
      </div>

      <div
        className="context-strip"
        style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 18 }}
      >
        <div className="ctx-item">
          <div className="v mono">{rows.length}</div>
          <div className="k">Workers</div>
        </div>
        <div className="ctx-item">
          <div className="v mono">{rupees(sum.base)}</div>
          <div className="k">Total base</div>
        </div>
        <div className="ctx-item">
          <div className="v mono" style={sum.deduct > 0 ? { color: 'var(--warn)' } : {}}>
            {rupees(sum.deduct)}
          </div>
          <div className="k">Total deductions</div>
        </div>
        <div className="ctx-item">
          <div className="v mono" style={{ color: 'var(--accent)' }}>
            {rupees(sum.net)}
          </div>
          <div className="k">Net to pay</div>
        </div>
      </div>

      <div className="toolbar">
        <select
          className="filter-pill"
          value={siteF}
          onChange={(e) => setSiteF(e.target.value)}
          style={{ appearance: 'auto' }}
        >
          <option value="all">All sites</option>
          {sites.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="tbl-wrap responsive">
        <table className="tbl">
          <thead>
            <tr>
              <th>Worker</th>
              <th>Site</th>
              <th className="tnum">Base</th>
              <th className="tnum">Present</th>
              <th className="tnum">Deductions</th>
              <th className="tnum">Net</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.workerId}
                onClick={() => r.deductPaise > 0 && setSel(r)}
                style={r.deductPaise > 0 ? {} : { cursor: 'default' }}
              >
                <td>
                  <div className="row-name">
                    <Avatar name={r.worker} size="sm" />
                    <div>
                      <div className="cell-primary">{r.worker}</div>
                      {r.notReady && (
                        <div>
                          <Chip tone="warn" sm>
                            Not payroll-ready
                          </Chip>
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="cell-sub">{r.site}</td>
                <td className="tnum cell-mono">{rupees(r.basePaise)}</td>
                <td className="tnum cell-mono">
                  {r.notReady ? <span className="dim">—</span> : r.presentDays}
                </td>
                <td
                  className="tnum cell-mono"
                  style={
                    r.deductPaise > 0
                      ? { color: 'var(--warn)', fontWeight: 600 }
                      : { color: 'var(--ink-4)' }
                  }
                >
                  {r.deductPaise > 0 ? '−' + rupees(r.deductPaise) : '—'}
                </td>
                <td className="tnum cell-mono" style={{ fontWeight: 700 }}>
                  {rupees(r.netPaise)}
                </td>
                <td className="chev-cell">
                  {r.deductPaise > 0 ? <Icon name="chevR" size={16} /> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="helper" style={{ marginTop: 12 }}>
        Tap a worker with a deduction to see the days behind it. Workers still onboarding show “Not
        payroll-ready”. Paying salaries stays manual.
      </p>

      {sel && <DeductionSheet r={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

function DeductionSheet({ r, onClose }: { r: PayrollRow; onClose: () => void }) {
  const statusLabel: Record<string, string> = {
    ABSENT_NO_CALL: 'Absent (no call)',
    HALF_DAY: 'Half day',
    ABSENT_APPROVED_LEAVE: 'Unpaid leave',
  };
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label="Deduction breakdown">
        <div className="sheet-head">
          <Avatar name={r.worker} size="lg" />
          <div className="sh-title">
            <h2>{r.worker}</h2>
            <div className="sh-phone">{r.site}</div>
          </div>
          <button className="sheet-close" onClick={onClose} type="button">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="sheet-body">
          <div className="context-strip" style={{ marginBottom: 18 }}>
            <div className="ctx-item">
              <div className="v mono">{rupees(r.basePaise)}</div>
              <div className="k">Base salary</div>
            </div>
            <div className="ctx-item">
              <div className="v mono" style={{ color: 'var(--accent)' }}>
                {rupees(r.netPaise)}
              </div>
              <div className="k">Net to pay</div>
            </div>
          </div>
          <div className="rec-block">
            <div className="rec-label">Why pay is short {rupees(r.deductPaise)}</div>
            <div className="tbl-wrap" style={{ boxShadow: 'none' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Recorded as</th>
                    <th className="tnum">Deducted</th>
                  </tr>
                </thead>
                <tbody>
                  {r.deductionDays.map((d, i) => (
                    <tr key={i} style={{ cursor: 'default' }}>
                      <td className="cell-mono">{fmtDate(d.date)}</td>
                      <td>
                        <Chip tone="warn" sm>
                          {statusLabel[d.status] ?? d.status}
                        </Chip>
                      </td>
                      <td
                        className="tnum cell-mono"
                        style={{ color: 'var(--warn)', fontWeight: 600 }}
                      >
                        −{rupees(d.deductPaise)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="note-banner">
            <Icon name="info" size={17} /> Attendance is recorded by supervisors on site. View-only
            here.
          </div>
        </div>
      </div>
    </>
  );
}
