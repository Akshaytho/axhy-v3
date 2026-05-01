/**
 * ChatTab — supervisor preview Chat tab.
 * Active chat list, open-thread view, decision-card demo flow.
 *
 * @derives(master-plan §G)
 */
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

import {
  TODAYS_CHATS,
  type Chat,
  type ChatMessage,
  type Decision,
  type TimeOfDay,
} from '../_lib/mock';

// ── types ──────────────────────────────────────────────────────────────────

/** @derives(master-plan §G) */
type DemoPhase = 'idle' | 'note' | 'operational' | 'personnel' | 'employment';

/** @derives(master-plan §G) */
type DemoState = { phase: DemoPhase; countdown?: number; confirmInput?: string };

// ── constants ──────────────────────────────────────────────────────────────

/** @derives(master-plan §G) */
const DEMO = [
  { tier: 'NOTE', summary: 'Block C complaint at Phoenix logged', consequence: undefined },
  {
    tier: 'OPERATIONAL',
    summary: 'Move Vinod from Phoenix to Apollo',
    consequence: 'Apollo +1 worker, Phoenix at 2/3.',
  },
  {
    tier: 'PERSONNEL',
    summary: "Approve Sarita's leave for tomorrow",
    consequence: "She'll lose ₹500 from this week's pay.",
  },
  {
    tier: 'EMPLOYMENT',
    summary: 'Terminate Ravi — 3rd no-call no-show',
    consequence: 'Final pay settled this week.',
  },
] as const;

/** Honest-AI showcase message appended to chat_morning. @derives(master-plan §G) */
const HONEST_MSG: ChatMessage = {
  id: 'honest_ai',
  role: 'ai',
  text: "I don't see today's attendance for Block A yet. Log it when you check, and I'll update Apollo's count automatically.",
  language: 'en',
  timestamp: '09:20',
};

// ── icons ──────────────────────────────────────────────────────────────────

/** @derives(master-plan §G) */
function DotsIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <circle cx="8" cy="3" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="8" cy="13" r="1.5" />
    </svg>
  );
}

/** @derives(master-plan §G) */
function SendIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
    </svg>
  );
}

// ── HistoricalDecisionCard ─────────────────────────────────────────────────

/** Shows a decision that is already applied (in-thread, read-only). @derives(master-plan §G) */
function HistoricalDecisionCard({ d }: { d: Decision }): JSX.Element {
  return (
    <div className="sup-decision-card">
      <div className="sup-decision-card-tier">{d.tier}</div>
      <div className="sup-decision-card-title">{d.summary}</div>
      {d.consequence && <div className="sup-decision-card-cons">{d.consequence}</div>}
      <div className="sup-decision-card-actions">
        <span style={{ opacity: 0.55, fontSize: '0.75rem' }}>Already applied at {d.createdAt}</span>
      </div>
    </div>
  );
}

// ── ThreadView ─────────────────────────────────────────────────────────────

/** @derives(master-plan §G) */
function ThreadView({ chat, onBack }: { chat: Chat; onBack: () => void }): JSX.Element {
  const msgs = chat.id === 'chat_morning' ? [...chat.messages, HONEST_MSG] : chat.messages;
  return (
    <div className="sup-thread">
      <div className="sup-screen-header">
        <button className="sup-secondary" onClick={onBack} style={{ marginRight: '0.5rem' }}>
          ← Back to chats
        </button>
        <span className="sup-h2">{chat.title}</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '1rem' }}>
        {msgs.map((msg) => (
          <div key={msg.id}>
            <div className={`sup-msg ${msg.role === 'ai' ? 'sup-msg-ai' : 'sup-msg-sup'}`}>
              {msg.text}
              <div className="sup-msg-time">{msg.timestamp}</div>
            </div>
            {msg.decision && <HistoricalDecisionCard d={msg.decision} />}
          </div>
        ))}
      </div>
      <div className="sup-input-row">
        <input className="sup-input" type="text" placeholder="Type or speak…" disabled readOnly />
        <button className="sup-send" disabled>
          <SendIcon />
        </button>
      </div>
    </div>
  );
}

// ── ChatRowPopover ─────────────────────────────────────────────────────────

/** @derives(master-plan §G) */
function ChatRowPopover({
  onWrap,
  onDelete,
  onClose,
}: {
  onWrap: () => void;
  onDelete: () => void;
  onClose: () => void;
}): JSX.Element {
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holding, setHolding] = useState(false);

  const startHold = () => {
    setHolding(true);
    holdRef.current = setTimeout(() => {
      setHolding(false);
      onDelete();
      onClose();
    }, 800);
  };
  const cancelHold = () => {
    if (holdRef.current) clearTimeout(holdRef.current);
    setHolding(false);
  };

  return (
    <div
      style={{
        position: 'absolute',
        right: '2rem',
        top: '0.5rem',
        background: 'var(--sup-surface,#1a1a1a)',
        border: '1px solid var(--sup-border,#333)',
        borderRadius: '0.5rem',
        padding: '0.25rem 0',
        zIndex: 20,
        minWidth: '9rem',
      }}
    >
      <button
        className="sup-secondary"
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'left',
          border: 'none',
          borderRadius: 0,
        }}
        onClick={() => {
          onWrap();
          onClose();
        }}
      >
        Wrap up
      </button>
      <button
        className="sup-danger-text"
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'left',
          background: holding ? 'rgba(220,38,38,0.15)' : 'transparent',
          border: 'none',
          padding: '0.5rem 1rem',
          cursor: 'pointer',
        }}
        onMouseDown={startHold}
        onMouseUp={cancelHold}
        onMouseLeave={cancelHold}
        onTouchStart={startHold}
        onTouchEnd={cancelHold}
      >
        {holding ? 'Hold to delete…' : 'Delete'}
      </button>
    </div>
  );
}

// ── DemoOverlay ────────────────────────────────────────────────────────────

/** @derives(master-plan §G) */
function DemoOverlay({
  state,
  onConfirm,
  onCancel,
  onInput,
}: {
  state: DemoState;
  onConfirm: () => void;
  onCancel: () => void;
  onInput: (v: string) => void;
}): JSX.Element | null {
  if (state.phase === 'idle') return null;

  const phaseIdx: Record<DemoPhase, number> = {
    idle: -1,
    note: 0,
    operational: 1,
    personnel: 2,
    employment: 3,
  };
  const step = DEMO[phaseIdx[state.phase]];
  if (!step) return null;

  if (state.phase === 'note') {
    const pct = ((state.countdown ?? 5) / 5) * 100;
    return (
      <div className="sup-undo">
        <div className="sup-decision-card" style={{ marginBottom: '0.5rem' }}>
          <div className="sup-decision-card-tier">{step.tier}</div>
          <div className="sup-decision-card-title">{step.summary}</div>
        </div>
        <div className="sup-undo-text">Auto-stored · undo in {state.countdown ?? 5}s</div>
        <button className="sup-undo-btn" onClick={onCancel}>
          Undo
        </button>
        <div className="sup-undo-timer" style={{ width: `${pct}%` }} />
      </div>
    );
  }

  if (state.phase === 'operational') {
    return (
      <div className="sup-decision-card">
        <div className="sup-decision-card-tier">{step.tier}</div>
        <div className="sup-decision-card-title">{step.summary}</div>
        {step.consequence && <div className="sup-decision-card-cons">{step.consequence}</div>}
        <div className="sup-decision-card-actions">
          <button className="sup-decision-confirm" onClick={onConfirm}>
            Confirm
          </button>
          <button className="sup-decision-cancel" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // PERSONNEL and EMPLOYMENT both use consequence overlay
  const ready = state.phase === 'employment' && state.confirmInput === 'fire ravi';
  return (
    <div className="sup-consequence-overlay">
      <div className="sup-consequence-card">
        <div className="sup-consequence-tier">{step.tier}</div>
        <div className="sup-consequence-title">{step.summary}</div>
        {step.consequence && <div className="sup-consequence-fact">{step.consequence}</div>}
        {state.phase === 'employment' && (
          <>
            <div style={{ marginBottom: '0.5rem', fontSize: '0.8rem', opacity: 0.7 }}>
              Type <code style={{ fontFamily: 'monospace' }}>fire ravi</code> to confirm
            </div>
            <input
              className="sup-input"
              type="text"
              value={state.confirmInput ?? ''}
              onChange={(e) => onInput(e.target.value)}
              placeholder="fire ravi"
              style={{ marginBottom: '0.5rem' }}
            />
          </>
        )}
        <div className="sup-consequence-actions">
          <button
            className="sup-decision-confirm"
            onClick={onConfirm}
            disabled={state.phase === 'employment' && !ready}
            style={
              state.phase === 'employment'
                ? { opacity: ready ? 1 : 0.4, cursor: ready ? 'pointer' : 'not-allowed' }
                : undefined
            }
          >
            Confirm
          </button>
          <button className="sup-decision-cancel" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ChatTab (main export) ──────────────────────────────────────────────────

/**
 * Chat tab for the supervisor preview app.
 *
 * @derives(master-plan §G)
 */
export function ChatTab({ timeOfDay }: { timeOfDay: TimeOfDay }): JSX.Element {
  void timeOfDay; // consumed by parent for conditional tab rendering

  const [chats, setChats] = useState<Chat[]>(TODAYS_CHATS);
  const [openId, setOpenId] = useState<string | null>(null);
  const [popoverId, setPopoverId] = useState<string | null>(null);
  const [demo, setDemo] = useState<DemoState>({ phase: 'idle' });

  const idleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = useCallback(() => {
    if (idleRef.current) clearTimeout(idleRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
  }, []);

  useEffect(() => () => clearTimers(), [clearTimers]);

  /** @derives(master-plan §G) */
  const startDemo = useCallback(() => {
    clearTimers();
    setDemo({ phase: 'note', countdown: 5 });
    let n = 5;
    tickRef.current = setInterval(() => {
      n -= 1;
      if (n <= 0) {
        clearInterval(tickRef.current!);
        setDemo({ phase: 'operational' });
        idleRef.current = setTimeout(() => setDemo({ phase: 'personnel' }), 6000);
      } else {
        setDemo({ phase: 'note', countdown: n });
      }
    }, 1000);
  }, [clearTimers]);

  /** @derives(master-plan §G) */
  const handleConfirm = useCallback(() => {
    clearTimers();
    setDemo((prev) => {
      if (prev.phase === 'operational') {
        idleRef.current = setTimeout(
          () => setDemo({ phase: 'employment', confirmInput: '' }),
          6000,
        );
        return { phase: 'personnel' };
      }
      if (prev.phase === 'personnel') return { phase: 'employment', confirmInput: '' };
      return { phase: 'idle' };
    });
  }, [clearTimers]);

  /** @derives(master-plan §G) */
  const handleCancel = useCallback(() => {
    clearTimers();
    setDemo({ phase: 'idle' });
  }, [clearTimers]);

  /** @derives(master-plan §G) */
  const handleInput = useCallback(
    (v: string) => setDemo({ phase: 'employment', confirmInput: v }),
    [],
  );

  /** @derives(master-plan §G) */
  const wrapChat = useCallback(
    (id: string) =>
      setChats((prev) => prev.map((c) => (c.id === id ? { ...c, state: 'wrapped' as const } : c))),
    [],
  );

  /** @derives(master-plan §G) */
  const deleteChat = useCallback(
    (id: string) =>
      setChats((prev) => prev.map((c) => (c.id === id ? { ...c, state: 'deleted' as const } : c))),
    [],
  );

  const activeChats = chats.filter((c) => c.state === 'active');
  const openChat = openId ? (chats.find((c) => c.id === openId) ?? null) : null;

  if (openChat) {
    return <ThreadView chat={openChat} onBack={() => setOpenId(null)} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {/* Banner */}
      <div className="sup-chat-banner">
        <span>Today&apos;s context loaded · 3:30 AM IST</span>
        <span className="sup-chat-cap">2 of 3</span>
      </div>

      {/* Demo trigger */}
      <div style={{ padding: '0.5rem 1rem 0' }}>
        <button className="sup-secondary" onClick={startDemo} style={{ fontSize: '0.75rem' }}>
          Show decision-tier demo
        </button>
      </div>

      {/* Active chats */}
      <div className="sup-chat-list">
        {activeChats.map((chat) => {
          const preview = chat.messages.find((m) => m.role === 'supervisor')?.text ?? '';
          return (
            <div key={chat.id} className="sup-chat-row" style={{ position: 'relative' }}>
              <div
                className="sup-chat-row-info"
                onClick={() => {
                  setPopoverId(null);
                  setOpenId(chat.id);
                }}
                style={{ cursor: 'pointer', flex: 1 }}
              >
                <div className="sup-chat-row-title">{chat.title}</div>
                <div className="sup-chat-row-preview">
                  {preview.length > 60 ? preview.slice(0, 57) + '…' : preview}
                </div>
                <div className="sup-chat-row-meta">{chat.startedAt}</div>
              </div>
              <button
                className="sup-chat-dots"
                onClick={(e) => {
                  e.stopPropagation();
                  setPopoverId((p) => (p === chat.id ? null : chat.id));
                }}
                aria-label="Chat options"
              >
                <DotsIcon />
              </button>
              {popoverId === chat.id && (
                <ChatRowPopover
                  onWrap={() => wrapChat(chat.id)}
                  onDelete={() => deleteChat(chat.id)}
                  onClose={() => setPopoverId(null)}
                />
              )}
            </div>
          );
        })}
        {activeChats.length === 0 && (
          <div style={{ padding: '1.5rem 1rem', opacity: 0.5, fontSize: '0.85rem' }}>
            No active chats today.
          </div>
        )}
      </div>

      {/* Yesterday section */}
      <div className="sup-yesterday-section">
        <div className="sup-yesterday-label">YESTERDAY</div>
        <div className="sup-yesterday-row">Site walks · 6:42 AM</div>
        <div className="sup-yesterday-row">Mukesh follow-up · 4:18 PM</div>
      </div>

      {/* Demo overlay */}
      <DemoOverlay
        state={demo}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        onInput={handleInput}
      />

      {/* Popover backdrop */}
      {popoverId && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 10 }}
          onClick={() => setPopoverId(null)}
        />
      )}
    </div>
  );
}
