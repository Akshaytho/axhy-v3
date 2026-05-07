/**
 * ChatTab — supervisor preview Chat tab.
 * Landing: greeting + last AI message + 2 actions. Chat list hidden behind drill-down.
 *
 * @derives(master-plan §G)
 */
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

import {
  TODAYS_CHATS,
  SUPERVISOR,
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

// ── helpers ────────────────────────────────────────────────────────────────

/** @derives(master-plan §G) */
function getGreetingCopy(t: TimeOfDay): { greet: string; sub: string } {
  const n = SUPERVISOR.name;
  const count = TODAYS_CHATS.length;
  if (t === '7am')
    return {
      greet: `Good morning, ${n}.`,
      sub: "Today's context loaded at 3:30 AM. Ready when you are.",
    };
  if (t === '11am')
    return {
      greet: 'Mid-morning check-in.',
      sub: `Day in progress. ${count} chats running. Tap to continue or start new.`,
    };
  if (t === '3pm')
    return { greet: `Afternoon, ${n}.`, sub: 'Phoenix flagged this morning. Want to handle?' };
  return {
    greet: 'Wrapping up?',
    sub: 'Day done. Wrap up your chats and the AI will fold today into your context.',
  };
}

/** @derives(master-plan §G) */
function getLastAiMessage(): string {
  const active = TODAYS_CHATS.filter((c) => c.state === 'active');
  const first = active[0];
  if (!first) return 'No messages yet today. Tap below to start.';
  const latest = active.reduce<Chat>((b, c) => (c.startedAt > b.startedAt ? c : b), first);
  const aiMsgs = latest.messages.filter((m) => m.role === 'ai');
  const last = aiMsgs[aiMsgs.length - 1];
  if (!last) return 'No messages yet today. Tap below to start.';
  const t = last.text;
  return t.length > 120 ? t.slice(0, 117) + '...' : t;
}

// ── icons ──────────────────────────────────────────────────────────────────

/** @derives(master-plan §G) */
const DotsIcon = (): JSX.Element => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <circle cx="8" cy="3" r="1.5" />
    <circle cx="8" cy="8" r="1.5" />
    <circle cx="8" cy="13" r="1.5" />
  </svg>
);

/** @derives(master-plan §G) */
const SendIcon = (): JSX.Element => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
    <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
  </svg>
);

// ── HistoricalDecisionCard ─────────────────────────────────────────────────

/** @derives(master-plan §G) */
const HistoricalDecisionCard = ({ d }: { d: Decision }): JSX.Element => (
  <div className="sup-decision-card">
    <div className="sup-decision-card-tier">{d.tier}</div>
    <div className="sup-decision-card-title">{d.summary}</div>
    {d.consequence && <div className="sup-decision-card-cons">{d.consequence}</div>}
    <div className="sup-decision-card-actions">
      <span style={{ opacity: 0.55, fontSize: '0.75rem' }}>Already applied at {d.createdAt}</span>
    </div>
  </div>
);

// ── ThreadView ─────────────────────────────────────────────────────────────

/** @derives(master-plan §G) */
function ThreadView({ chat, onBack }: { chat: Chat; onBack: () => void }): JSX.Element {
  return (
    <div className="sup-thread">
      <div className="sup-sheet-head">
        <button className="sup-secondary" onClick={onBack} style={{ marginRight: '0.5rem' }}>
          ← Back
        </button>
        <span className="sup-sheet-title">{chat.title}</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '1rem' }}>
        {chat.messages.map((msg: ChatMessage) => (
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
        background: 'var(--card)',
        border: '1px solid var(--card-edge)',
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
        {holding ? 'Hold to delete...' : 'Delete'}
      </button>
    </div>
  );
}

// ── PastChatsSheet ─────────────────────────────────────────────────────────

/** @derives(master-plan §G) */
function PastChatsSheet({
  chats,
  onClose,
  onWrap,
  onDelete,
}: {
  chats: Chat[];
  onClose: () => void;
  onWrap: (id: string) => void;
  onDelete: (id: string) => void;
}): JSX.Element {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [popoverId, setPopoverId] = useState<string | null>(null);
  const activeChats = chats.filter((c) => c.state === 'active');
  const openChat = threadId ? (chats.find((c) => c.id === threadId) ?? null) : null;

  if (openChat) {
    return (
      <div className="sup-sheet">
        <ThreadView chat={openChat} onBack={() => setThreadId(null)} />
      </div>
    );
  }

  return (
    <div className="sup-sheet">
      <div className="sup-sheet-head">
        <button className="sup-secondary" onClick={onClose} style={{ marginRight: '0.5rem' }}>
          ← Close
        </button>
        <span className="sup-sheet-title">Today's chats</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {activeChats.map((chat) => {
          const raw = chat.messages.find((m) => m.role === 'supervisor')?.text ?? '';
          const preview = raw.length > 60 ? raw.slice(0, 57) + '...' : raw;
          return (
            <div key={chat.id} className="sup-chat-row" style={{ position: 'relative' }}>
              <div
                style={{ flex: 1, cursor: 'pointer' }}
                onClick={() => {
                  setPopoverId(null);
                  setThreadId(chat.id);
                }}
              >
                <div className="sup-chat-row-title">{chat.title}</div>
                {preview ? <div className="sup-chat-row-preview">{preview}</div> : null}
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
                  onWrap={() => onWrap(chat.id)}
                  onDelete={() => onDelete(chat.id)}
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
        <div className="sup-yesterday-section">
          <div className="sup-yesterday-label">YESTERDAY</div>
          <div className="sup-yesterday-row">Site walks · 6:42 AM</div>
          <div className="sup-yesterday-row">Mukesh follow-up · 4:18 PM</div>
        </div>
      </div>
      {popoverId && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 10 }}
          onClick={() => setPopoverId(null)}
        />
      )}
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
  if (state.phase === 'note') {
    const pct = ((state.countdown ?? 5) / 5) * 100;
    return (
      <div className="sup-undo" style={{ position: 'relative', overflow: 'hidden' }}>
        <span>Block C complaint at Phoenix logged</span>
        <button className="sup-undo-btn" onClick={onCancel}>
          Undo
        </button>
        <span className="sup-undo-timer">{state.countdown ?? 5}s</span>
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            height: '2px',
            background: 'var(--accent)',
            width: `${pct}%`,
            transition: 'width 0.9s linear',
          }}
        />
      </div>
    );
  }
  if (state.phase === 'operational') {
    return (
      <div className="sup-consequence-overlay">
        <div className="sup-decision-card">
          <div className="sup-decision-card-tier">OPERATIONAL</div>
          <div className="sup-decision-card-title">Move Vinod from Phoenix to Apollo</div>
          <div className="sup-decision-card-cons">Apollo +1 worker. Phoenix at 2/3.</div>
          <div className="sup-decision-card-actions">
            <button className="sup-decision-confirm" onClick={onConfirm}>
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
  if (state.phase === 'personnel') {
    return (
      <div className="sup-consequence-overlay">
        <div className="sup-consequence-card">
          <div className="sup-consequence-tier">PERSONNEL</div>
          <div className="sup-consequence-title">Approve Sarita's leave for tomorrow</div>
          <div className="sup-consequence-fact">She'll lose ₹500 from this week's pay.</div>
          <div className="sup-consequence-actions">
            <button className="sup-primary" onClick={onConfirm}>
              Confirm
            </button>
            <button className="sup-secondary" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }
  // employment
  const val = state.confirmInput ?? '';
  const ready = val.toLowerCase() === 'fire ravi';
  return (
    <div className="sup-consequence-overlay">
      <div className="sup-consequence-card">
        <div className="sup-consequence-tier">EMPLOYMENT</div>
        <div className="sup-consequence-title">Mark Ravi as terminated</div>
        <div className="sup-consequence-fact">
          Worker history retained. Pay stops today. HR notified.
        </div>
        <input
          className="sup-ack-input"
          type="text"
          value={val}
          onChange={(e) => onInput(e.target.value)}
          placeholder="Type 'fire ravi' to confirm"
          style={{ marginBottom: '0.5rem' }}
        />
        <div className="sup-ack-hint">
          Type <strong>fire ravi</strong> to enable confirm.
        </div>
        <div className="sup-consequence-actions">
          <button
            className="sup-primary"
            onClick={onConfirm}
            disabled={!ready}
            style={{ opacity: ready ? 1 : 0.4, cursor: ready ? 'pointer' : 'not-allowed' }}
          >
            Confirm
          </button>
          <button className="sup-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ChatTab (main export) ──────────────────────────────────────────────────

/**
 * Chat tab — ONE QUESTION ONE BIG ANSWER landing.
 * Greeting hero + last AI message card + drill-down + 2 bottom actions.
 *
 * @derives(master-plan §G)
 */
export function ChatTab({ timeOfDay }: { timeOfDay: TimeOfDay }): JSX.Element {
  const [chats, setChats] = useState<Chat[]>(TODAYS_CHATS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [demo, setDemo] = useState<DemoState>({ phase: 'idle' });
  const [newChatToast, setNewChatToast] = useState(false);

  const idleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (idleRef.current) clearTimeout(idleRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
  }, []);

  useEffect(
    () => () => {
      clearTimers();
      if (toastRef.current) clearTimeout(toastRef.current);
    },
    [clearTimers],
  );

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
      } else setDemo({ phase: 'note', countdown: n });
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

  /** @derives(master-plan §G) */
  const handleNewChat = useCallback(() => {
    setNewChatToast(true);
    if (toastRef.current) clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setNewChatToast(false), 2000);
  }, []);

  const { greet, sub } = getGreetingCopy(timeOfDay);
  const lastAiText = getLastAiMessage();
  const chatCount = chats.filter((c) => c.state !== 'deleted').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {/* 1. Greeting hero */}
      <div className="sup-chat-hero">
        <div className="sup-chat-greet">{greet}</div>
        <div className="sup-chat-sub">{sub}</div>
      </div>

      {/* 2. Big-card — last AI message */}
      <div className="sup-chat-bigcard">
        <div className="sup-chat-bigcard-from">FROM AI · LAST MESSAGE</div>
        <div className="sup-chat-bigcard-text">{lastAiText}</div>
      </div>

      {/* 3. Drill-down row */}
      <button
        className="sup-drill"
        onClick={() => setSheetOpen(true)}
        style={{
          width: '100%',
          textAlign: 'left',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        <span>{chatCount} chats today</span>
        <span style={{ opacity: 0.55, fontSize: '0.75rem', marginLeft: '0.5rem' }}>
          Tap to see all
        </span>
        <span className="sup-drill-chev" style={{ marginLeft: 'auto' }}>
          ›
        </span>
      </button>

      <div style={{ flex: 1 }} />

      {/* 4. Bottom actions */}
      <div
        style={{ padding: '0 1rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
      >
        <button className="sup-primary" onClick={handleNewChat} style={{ width: '100%' }}>
          Start new chat
        </button>
        <button
          className="sup-rule-edit"
          onClick={startDemo}
          style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'center' }}
        >
          See decision-tier showcase ›
        </button>
      </div>

      {/* Past-chats sheet */}
      {sheetOpen && (
        <PastChatsSheet
          chats={chats}
          onClose={() => setSheetOpen(false)}
          onWrap={wrapChat}
          onDelete={deleteChat}
        />
      )}

      {/* Decision demo overlay */}
      <DemoOverlay
        state={demo}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        onInput={handleInput}
      />

      {/* New-chat toast */}
      {newChatToast && (
        <div className="sup-undo" style={{ pointerEvents: 'none' }}>
          Demo: would open new chat thread
        </div>
      )}
    </div>
  );
}
