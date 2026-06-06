// Axhy HR Payroll — run review screen + lifecycle modals.
// The heart of the system: gross → editable LOP/adjustments → net per worker,
// frozen configSnapshot on display, DRAFT→APPROVED→PAID transitions.

const { useState: useStateR } = React;

function RunReview({ run, setRun, workers, setWorkers, onBack, onToast }) {
  const cfg = window.CONFIG_SNAPSHOT;
  const [expanded, setExpanded] = useStateR('mukesh');
  const [modal, setModal] = useStateR(null); // 'approve' | 'paid' | {type:'adjust', workerId}
  const isDraft = run.status === 'DRAFT';
  const isApproved = run.status === 'APPROVED';
  const isPaid = run.status === 'PAID';

  const slips = workers.map((w) => ({ w, ...window.computePayslip(w, cfg) }));
  const totalNet = slips.reduce((s, x) => s + x.net, 0);
  const totalDeduct = slips.reduce((s, x) => s + x.totalDeduct, 0);
  const totalGross = slips.reduce((s, x) => s + x.gross, 0);

  // ── line actions (DRAFT only) ──
  const waiveLop = (id) => {
    setWorkers((ws) => ws.map((w) => (w.id === id ? { ...w, lopWaived: !w.lopWaived } : w)));
    onToast(
      'LOP line ' +
        (workers.find((w) => w.id === id).lopWaived ? 'restored' : 'waived') +
        ' · audit logged',
    );
  };
  const removeAdjust = (wid, aid) => {
    setWorkers((ws) =>
      ws.map((w) =>
        w.id === wid ? { ...w, adjustments: w.adjustments.filter((a) => a.id !== aid) } : w,
      ),
    );
    onToast('Adjustment removed · audit logged');
  };
  const addAdjust = (wid, code, label, amount) => {
    const type = cfg.adjustmentTypes.find((t) => t.code === code);
    setWorkers((ws) =>
      ws.map((w) =>
        w.id === wid
          ? {
              ...w,
              adjustments: [
                ...w.adjustments,
                { id: 'a' + Date.now(), code, label, amount, sign: type.sign },
              ],
            }
          : w,
      ),
    );
    setModal(null);
    onToast('Adjustment added · audit logged');
  };

  const recompute = () => onToast('Recomputed from attendance · manual edits preserved');
  const approve = () => {
    setRun((r) => ({ ...r, status: 'APPROVED' }));
    setModal(null);
    onToast('Run approved · locked for payment');
  };
  const markPaid = (method, ref) => {
    setRun((r) => ({ ...r, status: 'PAID', method, ref, paidOn: '6 Jun 2026' }));
    setModal(null);
    onToast('Marked paid · ' + method + ' · ' + ref);
  };

  return (
    <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
      {/* Header */}
      <div style={{ padding: '18px 32px 16px', borderBottom: '1px solid var(--paper-3)' }}>
        <button
          onClick={onBack}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            border: 'none',
            background: 'transparent',
            color: 'var(--ink-3)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 13,
            padding: 0,
            marginBottom: 10,
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 6l-6 6 6 6" />
          </svg>
          All pay runs
        </button>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: '-0.5px',
                color: 'var(--ink)',
              }}
            >
              May 2026
            </div>
            <window.StatusPill status={run.status} />
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            {isDraft && (
              <window.Btn kind="ghost" icon={<RefreshIcon />} onClick={recompute}>
                Recompute
              </window.Btn>
            )}
            {isDraft && (
              <window.Btn kind="primary" onClick={() => setModal('approve')}>
                Approve run
              </window.Btn>
            )}
            {isApproved && (
              <window.Btn
                kind="ghost"
                onClick={() => {
                  setRun((r) => ({ ...r, status: 'DRAFT' }));
                  onToast('Reopened to draft');
                }}
              >
                Reopen
              </window.Btn>
            )}
            {isApproved && (
              <window.Btn kind="accent" icon={<RupeeIcon />} onClick={() => setModal('paid')}>
                Mark paid
              </window.Btn>
            )}
            {isPaid && (
              <window.Btn kind="ghost" icon={<DownloadIcon />}>
                Export
              </window.Btn>
            )}
          </div>
        </div>
      </div>

      {/* Config snapshot bar — frozen at creation */}
      <div
        style={{
          margin: '18px 32px 0',
          background: 'var(--paper-2)',
          border: '1px solid var(--paper-3)',
          borderRadius: 12,
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 22,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--ink-3)' }}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2l7 4v6c0 4-3 7-7 8-4-1-7-4-7-8V6l7-4z" />
          </svg>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            Config snapshot
          </span>
        </div>
        {[
          ['Basis', 'calendar_days · 31'],
          ['LOP rate', '₹salary ÷ 31 × days'],
          ['Rounding', 'nearest paisa'],
          ['Deductions', cfg.deductionsEnabled ? 'on' : 'off'],
          ['Approval', 'maker ≠ checker'],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>{k}</span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--ink-2)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {v}
            </span>
          </div>
        ))}
        <div
          style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--ink-4)', fontStyle: 'italic' }}
        >
          frozen 1 Jun · changes won't rewrite this run
        </div>
      </div>

      {isApproved && (
        <Banner
          tone="info"
          text="Run approved by Priya N. (owner) · frozen. Attendance edits no longer flow in — corrections go to a new off-cycle run."
        />
      )}
      {isPaid && (
        <Banner
          tone="ok"
          text={`Paid ${run.paidOn} · ${run.method} · ref ${run.ref}. This run is terminal and immutable.`}
        />
      )}

      {/* Payslip table */}
      <div style={{ padding: '18px 32px 120px' }}>
        <div
          style={{
            background: 'var(--card)',
            border: '1px solid var(--card-edge)',
            borderRadius: 14,
            overflow: 'hidden',
            boxShadow: 'var(--sh-1)',
          }}
        >
          {/* head */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1.1fr 1.1fr 1.1fr 36px',
              columnGap: 16,
              padding: '12px 20px',
              background: 'var(--paper-2)',
              borderBottom: '1px solid var(--paper-3)',
            }}
          >
            {['Worker', 'Payable', 'Gross', 'Deductions', 'Net pay', ''].map((h, i) => (
              <div
                key={i}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--ink-3)',
                  textAlign: i >= 1 && i <= 4 ? 'right' : 'left',
                }}
              >
                {h}
              </div>
            ))}
          </div>
          {slips.map(({ w, lines, gross, totalDeduct, net, payableDays, baseDays }, idx) => {
            const isOpen = expanded === w.id;
            return (
              <div
                key={w.id}
                style={{
                  borderBottom: idx < slips.length - 1 ? '1px solid var(--paper-3)' : 'none',
                }}
              >
                {/* row */}
                <div
                  onClick={() => setExpanded(isOpen ? null : w.id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 1.1fr 1.1fr 1.1fr 36px',
                    columnGap: 16,
                    alignItems: 'center',
                    padding: '14px 20px',
                    cursor: 'pointer',
                    background: isOpen ? 'var(--paper-2)' : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: '50%',
                        background: 'var(--paper-3)',
                        color: 'var(--ink-2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 600,
                        fontSize: 14,
                        flexShrink: 0,
                      }}
                    >
                      {w.initial}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
                        {w.name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--ink-3)' }}>
                        {w.role} · base {inr(w.base)}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 13,
                      color: 'var(--ink-2)',
                    }}
                  >
                    {payableDays}
                    <span style={{ color: 'var(--ink-4)' }}>/{baseDays}</span>
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
                    {inr(gross)}
                  </div>
                  <div
                    style={{
                      textAlign: 'right',
                      whiteSpace: 'nowrap',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 14,
                      color: totalDeduct > 0 ? 'var(--bad)' : 'var(--ink-4)',
                    }}
                  >
                    {totalDeduct > 0 ? inr(-totalDeduct) : '—'}
                  </div>
                  <div
                    style={{
                      textAlign: 'right',
                      whiteSpace: 'nowrap',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 15,
                      fontWeight: 700,
                      color: 'var(--ink)',
                    }}
                  >
                    {inr(net)}
                  </div>
                  <div
                    style={{
                      textAlign: 'right',
                      color: 'var(--ink-3)',
                      transform: isOpen ? 'rotate(90deg)' : 'none',
                      transition: 'transform .15s',
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
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

                {/* expanded lines */}
                {isOpen && (
                  <div style={{ padding: '4px 20px 18px 66px', background: 'var(--paper-2)' }}>
                    <div
                      style={{
                        background: 'var(--card)',
                        border: '1px solid var(--card-edge)',
                        borderRadius: 10,
                        overflow: 'hidden',
                      }}
                    >
                      {lines.map((l, li) => (
                        <LineRow
                          key={li}
                          line={l}
                          editable={isDraft}
                          onWaive={() => waiveLop(w.id)}
                          onRemove={l.manual ? () => removeAdjust(w.id, l.id) : null}
                        />
                      ))}
                      {/* net subtotal */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '11px 16px',
                          background: 'var(--paper-2)',
                          borderTop: '1px solid var(--paper-3)',
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                          Net pay
                        </span>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono)',
                            fontSize: 15,
                            fontWeight: 700,
                            color: 'var(--ink)',
                          }}
                        >
                          {inr(net)}
                        </span>
                      </div>
                    </div>
                    {isDraft && (
                      <button
                        onClick={() => setModal({ type: 'adjust', workerId: w.id })}
                        style={{
                          marginTop: 10,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          border: '1px dashed var(--card-edge)',
                          background: 'transparent',
                          borderRadius: 8,
                          padding: '7px 12px',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                          fontSize: 13,
                          fontWeight: 600,
                          color: 'var(--ink-2)',
                        }}
                      >
                        <Plus /> Add adjustment
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* footer totals */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1.1fr 1.1fr 1.1fr 36px',
              columnGap: 16,
              alignItems: 'center',
              padding: '14px 20px',
              background: 'var(--ink)',
              color: 'var(--card)',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700 }}>{slips.length} workers</div>
            <div />
            <div
              style={{
                textAlign: 'right',
                whiteSpace: 'nowrap',
                fontFamily: 'var(--font-mono)',
                fontSize: 14,
                opacity: 0.85,
              }}
            >
              {inr(totalGross)}
            </div>
            <div
              style={{
                textAlign: 'right',
                whiteSpace: 'nowrap',
                fontFamily: 'var(--font-mono)',
                fontSize: 14,
                color: '#f0b8a8',
              }}
            >
              {totalDeduct > 0 ? inr(-totalDeduct) : '—'}
            </div>
            <div
              style={{
                textAlign: 'right',
                whiteSpace: 'nowrap',
                fontFamily: 'var(--font-mono)',
                fontSize: 16,
                fontWeight: 700,
              }}
            >
              {inr(totalNet)}
            </div>
            <div />
          </div>
        </div>
      </div>

      {/* modals */}
      {modal === 'approve' && (
        <ApproveModal
          onClose={() => setModal(null)}
          onApprove={approve}
          totalNet={totalNet}
          count={slips.length}
        />
      )}
      {modal === 'paid' && (
        <MarkPaidModal
          onClose={() => setModal(null)}
          onPaid={markPaid}
          totalNet={totalNet}
          methods={cfg.paymentMethods}
        />
      )}
      {modal && modal.type === 'adjust' && (
        <AdjustModal
          onClose={() => setModal(null)}
          onAdd={addAdjust}
          workerId={modal.workerId}
          types={cfg.adjustmentTypes}
          workerName={workers.find((w) => w.id === modal.workerId).name}
        />
      )}
    </div>
  );
}

// ── Single payslip line ─────────────────────────────────────────────────────
function LineRow({ line, editable, onWaive, onRemove }) {
  const isPos = line.amount > 0;
  const kindLabel = {
    SALARY_BASE: 'System',
    LOP_DEDUCTION: 'System · attendance',
    ADJUST_EARNING: 'Manual',
    ADJUST_DEDUCTION: 'Manual',
  }[line.kind];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '11px 16px',
        borderBottom: '1px solid var(--paper-3)',
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: 2,
          flexShrink: 0,
          background:
            line.kind === 'SALARY_BASE'
              ? 'var(--ink-3)'
              : line.kind === 'LOP_DEDUCTION'
                ? 'var(--bad)'
                : isPos
                  ? 'var(--ok)'
                  : 'var(--warn)',
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{line.label}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: line.system ? 'var(--ink-3)' : 'var(--accent-ink)',
              background: line.system ? 'var(--paper-3)' : 'var(--accent-soft)',
              padding: '2px 6px',
              borderRadius: 3,
            }}
          >
            {kindLabel}
          </span>
          {line.edited && (
            <span style={{ fontSize: 11, color: 'var(--ink-3)', fontStyle: 'italic' }}>
              {line.note}
            </span>
          )}
          {line.sourceRef && !line.edited && (
            <span style={{ fontSize: 11, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>
              {line.sourceRef.lopDays}d ÷ {line.sourceRef.baseDays}
            </span>
          )}
        </div>
      </div>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 14,
          fontWeight: 600,
          color: line.amount === 0 ? 'var(--ink-4)' : isPos ? 'var(--ink)' : 'var(--bad)',
        }}
      >
        {line.amount === 0 ? inr(0) : inr(line.amount)}
      </div>
      {editable && line.kind === 'LOP_DEDUCTION' && (
        <button onClick={onWaive} style={lineBtn}>
          {line.edited ? 'Restore' : 'Waive'}
        </button>
      )}
      {editable && onRemove && (
        <button onClick={onRemove} style={{ ...lineBtn, color: 'var(--bad)' }}>
          Remove
        </button>
      )}
    </div>
  );
}
const lineBtn = {
  border: '1px solid var(--card-edge)',
  background: 'transparent',
  borderRadius: 7,
  padding: '5px 10px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--ink-2)',
};

function Banner({ tone, text }) {
  const t =
    tone === 'ok'
      ? { bg: 'var(--ok-soft)', fg: '#2e5037' }
      : { bg: 'var(--info-soft)', fg: 'var(--info-ink)' };
  return (
    <div
      style={{
        margin: '14px 32px 0',
        background: t.bg,
        color: t.fg,
        borderRadius: 10,
        padding: '11px 16px',
        fontSize: 13,
        fontWeight: 500,
        lineHeight: 1.4,
      }}
    >
      {text}
    </div>
  );
}

// ── Modals ──────────────────────────────────────────────────────────────────
function Scrim({ children, onClose }) {
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
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--card)',
          borderRadius: 16,
          width: 440,
          boxShadow: 'var(--sh-3)',
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ApproveModal({ onClose, onApprove, totalNet, count }) {
  return (
    <Scrim onClose={onClose}>
      <div style={{ padding: '24px 24px 0' }}>
        <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--ink)' }}>
          Approve May 2026 run
        </div>
        <div style={{ fontSize: 14, color: 'var(--ink-2)', marginTop: 6, lineHeight: 1.5 }}>
          Locks {count} payslips totalling{' '}
          <b style={{ color: 'var(--ink)', fontFamily: 'var(--font-mono)' }}>{inr(totalNet)}</b>.
          Attendance edits stop flowing in after this.
        </div>
        <div
          style={{
            marginTop: 16,
            background: 'var(--paper-2)',
            border: '1px solid var(--paper-3)',
            borderRadius: 10,
            padding: '12px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: 'var(--info-soft)',
              color: 'var(--info-ink)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3.3 3.1-6 7-6s7 2.7 7 6M17 11a3 3 0 0 0 0-6" />
            </svg>
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.4 }}>
            <b>Maker-checker:</b> created by Kavitha R. — approver must be a different user.
            Approving as <b>Priya N. (owner)</b>.
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, padding: 24 }}>
        <window.Btn kind="ghost" onClick={onClose}>
          Cancel
        </window.Btn>
        <div style={{ flex: 1 }} />
        <window.Btn kind="primary" onClick={onApprove}>
          Approve as Priya N.
        </window.Btn>
      </div>
    </Scrim>
  );
}

function MarkPaidModal({ onClose, onPaid, totalNet, methods }) {
  const [method, setMethod] = useStateR('BANK');
  const [ref, setRef] = useStateR('');
  const placeholder = {
    CASH: 'Cash · hand-paid',
    UPI: 'UPI txn id',
    BANK: 'NEFT / bank reference',
    CHEQUE: 'Cheque number',
  }[method];
  return (
    <Scrim onClose={onClose}>
      <div style={{ padding: '24px 24px 0' }}>
        <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--ink)' }}>Mark run paid</div>
        <div style={{ fontSize: 14, color: 'var(--ink-2)', marginTop: 6, lineHeight: 1.5 }}>
          Records a manual payment of{' '}
          <b style={{ color: 'var(--ink)', fontFamily: 'var(--font-mono)' }}>{inr(totalNet)}</b>. No
          gateway — you hand-record the method and reference.
        </div>
        <div
          style={{
            marginTop: 18,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
            marginBottom: 8,
          }}
        >
          Payment method
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
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
            marginBottom: 8,
          }}
        >
          Reference
        </div>
        <input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          placeholder={placeholder}
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
        <window.Btn kind="ghost" onClick={onClose}>
          Cancel
        </window.Btn>
        <div style={{ flex: 1 }} />
        <window.Btn
          kind="accent"
          disabled={method !== 'CASH' && !ref.trim()}
          onClick={() => onPaid(method, ref.trim() || 'Cash · hand-paid')}
        >
          Confirm payment
        </window.Btn>
      </div>
    </Scrim>
  );
}

function AdjustModal({ onClose, onAdd, workerId, types, workerName }) {
  const [code, setCode] = useStateR(types[0].code);
  const [amount, setAmount] = useStateR('');
  const type = types.find((t) => t.code === code);
  return (
    <Scrim onClose={onClose}>
      <div style={{ padding: '24px 24px 0' }}>
        <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--ink)' }}>Add adjustment</div>
        <div style={{ fontSize: 14, color: 'var(--ink-2)', marginTop: 6 }}>
          Manual line for <b style={{ color: 'var(--ink)' }}>{workerName}</b> — survives every
          recompute.
        </div>
        <div
          style={{
            marginTop: 18,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
            marginBottom: 8,
          }}
        >
          Type
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {types.map((t) => (
            <button
              key={t.code}
              onClick={() => setCode(t.code)}
              style={{
                padding: '8px 12px',
                borderRadius: 9,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 13,
                fontWeight: 600,
                border:
                  code === t.code ? '1.5px solid var(--accent)' : '1px solid var(--card-edge)',
                background: code === t.code ? 'var(--accent-soft)' : 'var(--card)',
                color: code === t.code ? 'var(--accent-ink)' : 'var(--ink-2)',
              }}
            >
              {t.sign > 0 ? '+ ' : '− '}
              {t.label}
            </button>
          ))}
        </div>
        <div
          style={{
            marginTop: 16,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
            color: 'var(--ink-3)',
            marginBottom: 8,
          }}
        >
          Amount (₹)
        </div>
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="0"
          style={{
            width: '100%',
            height: 44,
            border: '1px solid var(--card-edge)',
            borderRadius: 10,
            padding: '0 14px',
            fontFamily: 'var(--font-mono)',
            fontSize: 16,
            color: 'var(--ink)',
            background: 'var(--paper)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>
      <div style={{ display: 'flex', gap: 10, padding: 24 }}>
        <window.Btn kind="ghost" onClick={onClose}>
          Cancel
        </window.Btn>
        <div style={{ flex: 1 }} />
        <window.Btn
          kind="primary"
          disabled={!amount || +amount === 0}
          onClick={() => onAdd(workerId, code, type.label, +amount * 100)}
        >
          Add {type.sign > 0 ? 'earning' : 'deduction'}
        </window.Btn>
      </div>
    </Scrim>
  );
}

function RefreshIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5" />
    </svg>
  );
}
function RupeeIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 5h10M7 9h10M14 5c0 4-3 5-7 5l6 9" />
    </svg>
  );
}
function DownloadIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
    </svg>
  );
}

Object.assign(window, { RunReview });
