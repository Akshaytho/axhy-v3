// Axhy HR Payroll v2 — table, drawer, bulk bar, by-site, modals, main app.

const { useState: u2, useMemo: m2 } = React;

const COLS = '34px 2.3fr 1.7fr 1.5fr 0.9fr 1.1fr 30px';

// ── Employee table ──────────────────────────────────────────────────────────
function EmpTable({ rows, density, tab, selection, toggleSel, toggleAll, reviewed, onOpen }) {
  const rowH = density === 'compact' ? 42 : 54;
  const allSel = rows.length > 0 && rows.every((r) => selection.has(r.id));
  return (
    <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
      {/* sticky header */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 5,
          display: 'grid',
          gridTemplateColumns: COLS,
          columnGap: 14,
          alignItems: 'center',
          padding: '0 28px',
          height: 38,
          background: 'var(--paper-2)',
          borderBottom: '1px solid var(--paper-3)',
        }}
      >
        <Check checked={allSel} onClick={toggleAll} />
        {[
          'Employee',
          'Site',
          tab === 'review' ? 'Exceptions' : 'Status',
          'Payable',
          'Net pay',
          '',
        ].map((h, i) => (
          <div
            key={i}
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
              textAlign: i >= 3 && i <= 4 ? 'right' : 'left',
            }}
          >
            {h}
          </div>
        ))}
      </div>

      {rows.length === 0 && (
        <div
          style={{ padding: '60px 0', textAlign: 'center', color: 'var(--ink-3)', fontSize: 14 }}
        >
          No employees match.
        </div>
      )}

      {rows.map((e, i) => {
        const sel = selection.has(e.id);
        const isRev = reviewed.has(e.id);
        return (
          <div
            key={e.id}
            onClick={() => onOpen(e.id)}
            className="emp-row"
            style={{
              display: 'grid',
              gridTemplateColumns: COLS,
              columnGap: 14,
              alignItems: 'center',
              padding: '0 28px',
              height: rowH,
              cursor: 'pointer',
              background: sel ? 'var(--accent-soft)' : 'transparent',
              borderBottom: '1px solid var(--paper-3)',
            }}
          >
            <Check
              checked={sel}
              onClick={(ev) => {
                ev.stopPropagation();
                toggleSel(e.id);
              }}
            />
            {/* employee */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
              <Avatar2 initial={e.initial} size={density === 'compact' ? 26 : 32} />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'var(--ink)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {e.name}
                </div>
                {density !== 'compact' && (
                  <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                    {e.role} · {inr2(e.base, { dec: false })}
                  </div>
                )}
              </div>
            </div>
            {/* site */}
            <div
              style={{
                fontSize: 13,
                color: 'var(--ink-2)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {e.site}
            </div>
            {/* exceptions / status */}
            <div style={{ display: 'flex', gap: 5, flexWrap: 'nowrap', overflow: 'hidden' }}>
              {tab === 'review' ? (
                isRev ? (
                  <Pill2 tone="ok" small>
                    <Ico d={ICON.check} size={11} sw={2.6} /> Reviewed
                  </Pill2>
                ) : (
                  e.flags.slice(0, 2).map((f) => <FlagChip key={f} flag={f} />)
                )
              ) : e.needsReview ? (
                e.flags.slice(0, 1).map((f) => <FlagChip key={f} flag={f} />)
              ) : (
                <span style={{ fontSize: 12, color: 'var(--ink-4)' }}>Clean</span>
              )}
            </div>
            {/* payable */}
            <div
              style={{
                textAlign: 'right',
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                color: 'var(--ink-2)',
                whiteSpace: 'nowrap',
              }}
            >
              {e.calc.payableDays}
              <span style={{ color: 'var(--ink-4)' }}>/{e.calc.baseDays}</span>
            </div>
            {/* net */}
            <div
              style={{
                textAlign: 'right',
                fontFamily: 'var(--font-mono)',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--ink)',
                whiteSpace: 'nowrap',
              }}
            >
              {inr2(e.calc.net)}
            </div>
            <div style={{ textAlign: 'right', color: 'var(--ink-4)' }}>
              <Ico d={ICON.chevR} size={15} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Check({ checked, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        width: 18,
        height: 18,
        borderRadius: 5,
        cursor: 'pointer',
        border: checked ? 'none' : '1.5px solid var(--ink-4)',
        background: checked ? 'var(--accent)' : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {checked && <Ico d={ICON.check} size={13} color="var(--card)" sw={3} />}
    </div>
  );
}

// ── By-site rollup cards ────────────────────────────────────────────────────
function BySite({ roster, onPick }) {
  const sites = m2(() => {
    const map = {};
    roster.forEach((e) => {
      const s = map[e.site] || (map[e.site] = { name: e.site, count: 0, net: 0, needs: 0 });
      s.count++;
      s.net += e.calc.net;
      if (e.needsReview) s.needs++;
    });
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [roster]);
  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px 28px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {sites.map((s) => (
          <div
            key={s.name}
            onClick={() => onPick(s.name)}
            style={{
              background: 'var(--card)',
              border: '1px solid var(--card-edge)',
              borderRadius: 14,
              padding: '16px 18px',
              boxShadow: 'var(--sh-1)',
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 9,
                  background: 'var(--paper-2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--ink-3)',
                }}
              >
                <Ico d={ICON.site} size={17} />
              </div>
              <div
                style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)', lineHeight: 1.2 }}
              >
                {s.name}
              </div>
            </div>
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}
            >
              <div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: 'var(--ink)',
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '-0.5px',
                  }}
                >
                  {s.count}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>employees</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: 'var(--ink-2)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {inrShort(s.net)}
                </div>
                {s.needs > 0 ? (
                  <div style={{ marginTop: 4 }}>
                    <Pill2 tone="warn" small>
                      {s.needs} to review
                    </Pill2>
                  </div>
                ) : (
                  <div style={{ marginTop: 4 }}>
                    <Pill2 tone="ok" small>
                      All clean
                    </Pill2>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Bulk action bar ─────────────────────────────────────────────────────────
function BulkBar({ n, onReview, onClear }) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 22,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 40,
        background: 'var(--ink)',
        color: 'var(--card)',
        borderRadius: 12,
        boxShadow: 'var(--sh-3)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 8px 8px 18px',
      }}
    >
      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{n} selected</span>
      <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.2)', margin: '0 8px' }} />
      <button
        onClick={onReview}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          border: 'none',
          background: 'var(--accent)',
          color: 'var(--card)',
          borderRadius: 8,
          padding: '8px 14px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 13.5,
          fontWeight: 600,
        }}
      >
        <Ico d={ICON.check} size={15} sw={2.4} />
        Mark reviewed
      </button>
      <button
        onClick={onClear}
        style={{
          border: 'none',
          background: 'transparent',
          color: 'rgba(255,255,255,0.7)',
          borderRadius: 8,
          padding: '8px 12px',
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontSize: 13.5,
          fontWeight: 600,
        }}
      >
        Clear
      </button>
    </div>
  );
}

// ── Detail drawer ───────────────────────────────────────────────────────────
function Drawer({
  emp,
  status,
  reviewed,
  onClose,
  onWaive,
  onAddAdjust,
  onRemoveAdjust,
  onMarkReviewed,
}) {
  const [adding, setAdding] = u2(false);
  const [code, setCode] = u2(ADJ_TYPES[0].code);
  const [amt, setAmt] = u2('');
  if (!emp) return null;
  const c = emp.calc;
  const lines = [{ k: 'Base salary', tone: 'sys', amount: emp.base }];
  if (emp.lopDays > 0)
    lines.push({
      k: emp.waived ? `LOP — ${emp.lopDays}d waived` : `Loss of pay — ${emp.lopDays}d`,
      tone: 'lop',
      amount: emp.waived ? 0 : -c.lop,
      waivable: true,
      waived: emp.waived,
    });
  emp.adjustments.forEach((a) =>
    lines.push({
      k: a.label,
      tone: a.sign > 0 ? 'earn' : 'ded',
      amount: a.sign * a.amount,
      adjId: a.id,
    }),
  );
  const editable = status === 'DRAFT';
  const type = ADJ_TYPES.find((t) => t.code === code);

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(26,22,18,0.35)', zIndex: 60 }}
      />
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: 432,
          background: 'var(--paper)',
          zIndex: 61,
          boxShadow: '-12px 0 40px rgba(26,22,18,0.18)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* head */}
        <div
          style={{
            padding: '20px 22px 16px',
            borderBottom: '1px solid var(--paper-3)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <Avatar2 initial={emp.initial} size={44} tone="accent" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>{emp.name}</div>
            <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
              {emp.role} · {emp.site}
            </div>
            <div style={{ display: 'flex', gap: 5, marginTop: 8, flexWrap: 'wrap' }}>
              {emp.flags.length ? (
                emp.flags.map((f) => <FlagChip key={f} flag={f} />)
              ) : (
                <Pill2 tone="ok" small>
                  Clean
                </Pill2>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--ink-3)',
              padding: 4,
            }}
          >
            <Ico d={ICON.x} size={20} />
          </button>
        </div>

        {/* lines */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px 22px' }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--ink-3)',
              marginBottom: 10,
            }}
          >
            Payslip · May 2026
          </div>
          <div
            style={{
              background: 'var(--card)',
              border: '1px solid var(--card-edge)',
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            {lines.map((l, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '12px 14px',
                  borderBottom: '1px solid var(--paper-3)',
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    flexShrink: 0,
                    background:
                      l.tone === 'sys'
                        ? 'var(--ink-3)'
                        : l.tone === 'lop'
                          ? 'var(--bad)'
                          : l.tone === 'earn'
                            ? 'var(--ok)'
                            : 'var(--warn)',
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{l.k}</div>
                  <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 1 }}>
                    {l.tone === 'sys' || l.tone === 'lop' ? 'System' : 'Manual'}
                    {l.tone === 'lop' && !l.waived && ` · ${emp.lopDays}d ÷ ${c.baseDays}`}
                  </div>
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 14,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    color:
                      l.amount === 0 ? 'var(--ink-4)' : l.amount < 0 ? 'var(--bad)' : 'var(--ink)',
                  }}
                >
                  {inr2(l.amount)}
                </div>
                {editable && l.waivable && (
                  <button onClick={() => onWaive(emp)} style={miniBtn}>
                    {l.waived ? 'Restore' : 'Waive'}
                  </button>
                )}
                {editable && l.adjId && (
                  <button
                    onClick={() => onRemoveAdjust(emp, l.adjId)}
                    style={{ ...miniBtn, color: 'var(--bad)' }}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '13px 14px',
                background: 'var(--paper-2)',
              }}
            >
              <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>Net pay</span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 16,
                  fontWeight: 700,
                  color: 'var(--ink)',
                }}
              >
                {inr2(c.net)}
              </span>
            </div>
          </div>

          {/* add adjustment */}
          {editable &&
            (adding ? (
              <div
                style={{
                  marginTop: 12,
                  background: 'var(--card)',
                  border: '1px solid var(--card-edge)',
                  borderRadius: 12,
                  padding: 14,
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                  {ADJ_TYPES.map((t) => (
                    <button
                      key={t.code}
                      onClick={() => setCode(t.code)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        fontSize: 12.5,
                        fontWeight: 600,
                        border:
                          code === t.code
                            ? '1.5px solid var(--accent)'
                            : '1px solid var(--card-edge)',
                        background: code === t.code ? 'var(--accent-soft)' : 'transparent',
                        color: code === t.code ? 'var(--accent-ink)' : 'var(--ink-2)',
                      }}
                    >
                      {t.sign > 0 ? '+ ' : '\u2212 '}
                      {t.label}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={amt}
                    onChange={(e) => setAmt(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="Amount ₹"
                    style={{
                      flex: 1,
                      height: 38,
                      border: '1px solid var(--card-edge)',
                      borderRadius: 9,
                      padding: '0 12px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 14,
                      background: 'var(--paper)',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  <Btn2
                    kind="primary"
                    size="sm"
                    disabled={!amt || +amt === 0}
                    onClick={() => {
                      onAddAdjust(emp, code, type.label, +amt * 100, type.sign);
                      setAmt('');
                      setAdding(false);
                    }}
                  >
                    Add
                  </Btn2>
                  <Btn2
                    kind="ghost"
                    size="sm"
                    onClick={() => {
                      setAdding(false);
                      setAmt('');
                    }}
                  >
                    Cancel
                  </Btn2>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAdding(true)}
                style={{
                  marginTop: 12,
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 7,
                  border: '1px dashed var(--card-edge)',
                  background: 'transparent',
                  borderRadius: 10,
                  padding: '11px 0',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: 'var(--ink-2)',
                }}
              >
                <Ico d={ICON.plus} size={16} />
                Add adjustment
              </button>
            ))}
        </div>

        {/* footer */}
        <div
          style={{
            padding: '14px 22px',
            borderTop: '1px solid var(--paper-3)',
            display: 'flex',
            gap: 10,
          }}
        >
          {status === 'DRAFT' &&
            emp.needsReview &&
            (reviewed.has(emp.id) ? (
              <Btn2 kind="ghost" onClick={() => onMarkReviewed(emp, false)}>
                <Ico d={ICON.check} size={15} /> Reviewed — undo
              </Btn2>
            ) : (
              <Btn2 kind="primary" onClick={() => onMarkReviewed(emp, true)}>
                <Ico d={ICON.check} size={15} sw={2.4} /> Mark reviewed
              </Btn2>
            ))}
          <div style={{ flex: 1 }} />
          <Btn2 kind="ghost" onClick={onClose}>
            Close
          </Btn2>
        </div>
      </div>
    </>
  );
}
const miniBtn = {
  border: '1px solid var(--card-edge)',
  background: 'transparent',
  borderRadius: 7,
  padding: '5px 9px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--ink-2)',
  whiteSpace: 'nowrap',
};

// ── Modals ──────────────────────────────────────────────────────────────────
function Scrim2({ children, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(26,22,18,0.4)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 70,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--card)',
          borderRadius: 16,
          width: 460,
          boxShadow: 'var(--sh-3)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
function ApproveModal2({ onClose, onApprove, total, clean, pending, net }) {
  return (
    <Scrim2 onClose={onClose}>
      <div style={{ padding: '24px 24px 0' }}>
        <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--ink)' }}>
          Approve May 2026 run
        </div>
        <div style={{ fontSize: 14, color: 'var(--ink-2)', marginTop: 6, lineHeight: 1.5 }}>
          Locks <b style={{ color: 'var(--ink)' }}>{total.toLocaleString('en-IN')} payslips</b>{' '}
          totalling{' '}
          <b style={{ color: 'var(--ink)', fontFamily: 'var(--font-mono)' }}>{inrShort(net)}</b>.
        </div>
        {pending > 0 && (
          <div
            style={{
              marginTop: 14,
              background: 'var(--warn-soft)',
              color: '#7a5a08',
              borderRadius: 10,
              padding: '11px 14px',
              fontSize: 13,
              display: 'flex',
              gap: 9,
              alignItems: 'flex-start',
            }}
          >
            <Ico d={ICON.warn} size={16} color="#7a5a08" />
            <span>
              <b>{pending.toLocaleString('en-IN')} flagged employees</b> aren't marked reviewed yet.
              You can still approve — they'll be included as computed.
            </span>
          </div>
        )}
        <div
          style={{
            marginTop: 14,
            background: 'var(--paper-2)',
            border: '1px solid var(--paper-3)',
            borderRadius: 10,
            padding: '11px 14px',
            fontSize: 12.5,
            color: 'var(--ink-2)',
            display: 'flex',
            gap: 9,
            alignItems: 'flex-start',
            lineHeight: 1.4,
          }}
        >
          <Ico d={ICON.shield} size={16} color="var(--ink-3)" />
          <span>
            <b>Maker-checker:</b> created by Kavitha R. — approving as <b>Priya N. (owner)</b>.
            Attendance edits stop flowing in after approval.
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, padding: 24 }}>
        <Btn2 kind="ghost" onClick={onClose}>
          Cancel
        </Btn2>
        <div style={{ flex: 1 }} />
        <Btn2 kind="primary" onClick={onApprove}>
          Approve {clean.toLocaleString('en-IN')} clean + rest
        </Btn2>
      </div>
    </Scrim2>
  );
}
function PaidModal2({ onClose, onPaid, net }) {
  const [method, setMethod] = u2('BANK');
  const [ref, setRef] = u2('');
  const methods = ['CASH', 'UPI', 'BANK', 'CHEQUE'];
  const ph = {
    CASH: 'Cash · hand-paid',
    UPI: 'UPI txn id',
    BANK: 'NEFT / bank batch ref',
    CHEQUE: 'Cheque number',
  }[method];
  return (
    <Scrim2 onClose={onClose}>
      <div style={{ padding: '24px 24px 0' }}>
        <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--ink)' }}>Mark run paid</div>
        <div style={{ fontSize: 14, color: 'var(--ink-2)', marginTop: 6, lineHeight: 1.5 }}>
          Records a manual payment of{' '}
          <b style={{ color: 'var(--ink)', fontFamily: 'var(--font-mono)' }}>{inrShort(net)}</b>. No
          gateway — hand-recorded.
        </div>
        <div
          style={{
            marginTop: 18,
            marginBottom: 8,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
          }}
        >
          Method
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {methods.map((m) => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              style={{
                flex: 1,
                padding: '10px 0',
                borderRadius: 9,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: 600,
                border: method === m ? '1.5px solid var(--accent)' : '1px solid var(--card-edge)',
                background: method === m ? 'var(--accent-soft)' : 'var(--card)',
                color: method === m ? 'var(--accent-ink)' : 'var(--ink-2)',
              }}
            >
              {m}
            </button>
          ))}
        </div>
        <div
          style={{
            marginTop: 16,
            marginBottom: 8,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
          }}
        >
          Reference
        </div>
        <input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder={ph}
          style={{
            width: '100%',
            height: 44,
            border: '1px solid var(--card-edge)',
            borderRadius: 10,
            padding: '0 14px',
            fontFamily: 'var(--font-mono)',
            fontSize: 14,
            color: 'var(--ink)',
            background: 'var(--paper)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>
      <div style={{ display: 'flex', gap: 10, padding: 24 }}>
        <Btn2 kind="ghost" onClick={onClose}>
          Cancel
        </Btn2>
        <div style={{ flex: 1 }} />
        <Btn2
          kind="accent"
          disabled={method !== 'CASH' && !ref.trim()}
          onClick={() => onPaid(method, ref.trim() || 'Cash · hand-paid')}
        >
          Confirm payment
        </Btn2>
      </div>
    </Scrim2>
  );
}

Object.assign(window, { EmpTable, BySite, BulkBar, Drawer, ApproveModal2, PaidModal2 });
