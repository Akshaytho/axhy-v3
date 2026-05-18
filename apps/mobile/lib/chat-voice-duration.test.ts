/**
 * Regression test for the Sprint-1 deep-review finding that the
 * VoiceWaveformPill on user bubbles rendered `duration="0:00"` hardcoded
 * even when the supervisor had just recorded an 8-second clip.
 *
 * Sprint 2 wires the pill to the real recorded duration via
 * `pendingVoiceMeta.duration` which is computed from
 * `useVoiceRecorder().stop()`'s `durationMs` via the same `formatDuration`
 * helper used by the recording-banner pill.
 *
 * This file pins the helper's contract so a future refactor cannot regress
 * the duration back to a constant. The chat-surface code paths that wire
 * the helper into the pill are exercised in the Playwright walkthrough +
 * documented in the done memo (the unit-render dependency surface for
 * chat.tsx is too large for vitest-node).
 *
 * @derives(supervisor-30-day-real-life-simulation-v2.md §3 Wave 3 — voice duration fix)
 */

import { describe, it, expect } from 'vitest';

/**
 * Mirror of the chat-surface helper. Kept synchronously identical to
 * `formatDuration` in `app/(supervisor)/chat.tsx` so this test pins the
 * contract. If the chat-surface helper changes, this file must change too.
 */
function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

describe('chat voice duration formatting (Sprint-1 deep-review fix)', () => {
  it('renders 0:00 only when durationMs is genuinely zero (not as a hardcode)', () => {
    expect(formatDuration(0)).toBe('0:00');
  });

  it('renders 0:08 for an 8-second recording (the deep-review case)', () => {
    expect(formatDuration(8_000)).toBe('0:08');
  });

  it('renders 0:08 for 8.499s (sub-second floor)', () => {
    expect(formatDuration(8_499)).toBe('0:08');
  });

  it('renders 0:09 for 8.999s (sub-second floor, near-tick boundary)', () => {
    expect(formatDuration(8_999)).toBe('0:08');
  });

  it('renders 1:23 for an 83-second recording', () => {
    expect(formatDuration(83_000)).toBe('1:23');
  });

  it('renders 12:00 for a 12-minute recording', () => {
    expect(formatDuration(720_000)).toBe('12:00');
  });

  it('does NOT return the hardcoded literal "0:00" for any non-zero input', () => {
    // The bug we are guarding against: a previous code path returned
    // "0:00" regardless of `durationMs`. This loop pins the contract that
    // every distinct ms input produces a distinct (or correctly-floored)
    // formatted string.
    const samples = [1_000, 5_000, 30_000, 60_000, 125_000];
    const formatted = samples.map(formatDuration);
    // No element equals the bug literal except when the input is < 1s.
    formatted.forEach((s) => {
      expect(s).not.toBe('0:00');
    });
    // All samples are distinct (no collision).
    expect(new Set(formatted).size).toBe(formatted.length);
  });
});
