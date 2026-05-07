/**
 * VoiceMic — giant hold-to-speak button.
 *
 * Primary input across the whole supervisor home. Hold down → mock recording
 * (3 sec auto-stop). Release → fake transcript appears with proposed action.
 * Confirm to apply (mock), Cancel to dismiss.
 *
 * Real Claude/Whisper wiring lands when the backend voice route ships
 * (separate panel-debated work).
 *
 * @derives(master-plan §G)
 */

'use client';

import { useEffect, useRef, useState } from 'react';

const SAMPLE_PHRASES = [
  {
    heard: 'Sarita ki leave approve karo, kal nahi aayegi',
    action: "Approve Sarita's leave for tomorrow. She'll lose ₹500 from this week's pay.",
  },
  {
    heard: 'Phoenix Block C mein complaint aaya hai, wet floor',
    action: 'Log complaint at Phoenix Block C: wet floor. Mr. Rao notified.',
  },
  {
    heard: 'Mukesh ko absent mark karo, no call',
    action: 'Mark Mukesh absent (no-call). HR will be flagged for follow-up.',
  },
  {
    heard: 'Anil ko Apollo se Brigade bhej do',
    action: 'Move Anil from Apollo to Brigade. Apollo at 4/5 workers.',
  },
];

type Phase = 'idle' | 'recording' | 'heard';

/** @derives(master-plan §G) */
export function VoiceMic({ onResult }: { onResult: (heard: string) => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [sample, setSample] = useState<(typeof SAMPLE_PHRASES)[number] | null>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    };
  }, []);

  const startRecording = () => {
    if (phase !== 'idle') return;
    setPhase('recording');
    setSample(null);
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    stopTimerRef.current = setTimeout(() => {
      stopRecording();
    }, 3000);
  };

  const stopRecording = () => {
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    if (phase !== 'recording') return;
    const next = SAMPLE_PHRASES[Math.floor(Math.random() * SAMPLE_PHRASES.length)];
    if (next) {
      setSample(next);
      setPhase('heard');
      onResult(next.heard);
    } else {
      setPhase('idle');
    }
  };

  const dismiss = () => {
    setPhase('idle');
    setSample(null);
  };

  return (
    <>
      {phase === 'heard' && sample && (
        <div className="sup-voice-result">
          <div className="sup-voice-heard">Heard</div>
          <div className="sup-voice-text">&ldquo;{sample.heard}&rdquo;</div>
          <div className="sup-voice-proposed">
            <span className="sup-voice-proposed-label">Proposed action</span>
            <span className="sup-voice-proposed-action">{sample.action}</span>
          </div>
          <div className="sup-voice-actions">
            <button type="button" className="is-confirm" onClick={dismiss}>
              Confirm
            </button>
            <button type="button" className="is-cancel" onClick={dismiss}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        className={phase === 'recording' ? 'sup-mic is-recording' : 'sup-mic'}
        onMouseDown={startRecording}
        onMouseUp={stopRecording}
        onMouseLeave={stopRecording}
        onTouchStart={startRecording}
        onTouchEnd={stopRecording}
        aria-label="Hold to speak"
      >
        <MicIcon />
      </button>
      {phase === 'recording' && (
        <span className="sup-mic-hint is-recording">Listening… release to send</span>
      )}
    </>
  );
}

/** @derives(master-plan §G) */
function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3z" />
      <path
        d="M19 11a7 7 0 0 1-14 0M12 18v3M8 21h8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}
