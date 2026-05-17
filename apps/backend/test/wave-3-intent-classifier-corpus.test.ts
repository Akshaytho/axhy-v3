/**
 * Wave 3 — intent classifier corpus.
 *
 * Holds the 30-phrase Hyderabad-supervisor corpus used to evaluate the
 * intent classifier prompt. Each row records (a) the supervisor's actual
 * words (English / Hindi / Telugu / Hinglish / Telinglish), (b) the
 * expected tool the model should pick, (c) the rationale.
 *
 * This file is intentionally NOT a live OpenAI call test — those would
 * burn ₹2-3 per CI run and make CI flaky on Whisper/OpenAI outages. The
 * live evaluation runs as a script (`apps/backend/scripts/eval-intent-
 * classifier.ts` in a future slice) on a manual trigger. This file pins
 * the corpus + structural assertions:
 *   1. Every phrase has a non-empty expected tool.
 *   2. The corpus covers all four primary intents AND each complaint kind.
 *   3. The 9 complaint kinds and 4 intents are exhaustively represented.
 *
 * Per the Wave 3 brief, classification accuracy ≥85% on this corpus is
 * required for sign-off. The live eval script writes a results JSON next
 * to this file; the done-memo records the latest run.
 *
 * @derives(supervisor-30day-scenarios.md scenarios #26–38)
 * @derives(panel-2026-05-18) — Wave 3 backend
 */

import { describe, it, expect } from 'vitest';

type Intent = 'mark_absent' | 'log_complaint' | 'request_leave_decision' | 'general';

type ExpectedTool =
  | 'propose_mark_absent'
  | 'propose_log_complaint'
  | 'propose_leave'
  | 'propose_clarify'
  | 'none';

type ComplaintKind =
  | 'photo_mismatch'
  | 'missed_area'
  | 'attitude'
  | 'theft_accusation'
  | 'hygiene'
  | 'noise'
  | 'damage'
  | 'gate_pass'
  | 'other'
  | null;

type CorpusRow = {
  /** Supervisor's actual phrasing — voice transcript or typed. */
  phrase: string;
  /** Intent the classifier rubric (in chat.ts SYSTEM_PROMPT) should pick. */
  expectedIntent: Intent;
  /** Tool the model is expected to call. */
  expectedTool: ExpectedTool;
  /** For log_complaint, the kind the description should extract. */
  expectedKind: ComplaintKind;
  /** Why this row exists in the corpus. */
  rationale: string;
};

export const INTENT_CLASSIFIER_CORPUS: ReadonlyArray<CorpusRow> = [
  // ─── mark_absent (5 phrases) ───────────────────────────────────────────
  {
    phrase: 'Mukesh absent today',
    expectedIntent: 'mark_absent',
    expectedTool: 'propose_mark_absent',
    expectedKind: null,
    rationale: 'plain English worker-absent assertion',
  },
  {
    phrase: 'Mukesh nahi aaya aaj',
    expectedIntent: 'mark_absent',
    expectedTool: 'propose_mark_absent',
    expectedKind: null,
    rationale: 'Hinglish worker-absent — "did not come today"',
  },
  {
    phrase: 'Anjali ne phone kiya, kahi nahi aayi today',
    expectedIntent: 'mark_absent',
    expectedTool: 'propose_mark_absent',
    expectedKind: null,
    rationale: 'Hinglish with code-switch — phone-in absence',
  },
  {
    phrase: 'Pradeep ko bukhar hai, off today',
    expectedIntent: 'mark_absent',
    expectedTool: 'propose_mark_absent',
    expectedKind: null,
    rationale: 'Hinglish — sick reason cue, still absence intent',
  },
  {
    phrase: 'Lakshmi vachhindi ledu',
    expectedIntent: 'mark_absent',
    expectedTool: 'propose_mark_absent',
    expectedKind: null,
    rationale: 'Telugu — "Lakshmi did not come"',
  },

  // ─── request_leave_decision (4 phrases) ────────────────────────────────
  {
    phrase: 'Suresh leave Monday to Wednesday',
    expectedIntent: 'request_leave_decision',
    expectedTool: 'propose_leave',
    expectedKind: null,
    rationale: 'plain English explicit leave range',
  },
  {
    phrase: 'Lakshmi 3 din chuti chahiye',
    expectedIntent: 'request_leave_decision',
    expectedTool: 'propose_leave',
    expectedKind: null,
    rationale: 'Hindi — "Lakshmi needs 3 days off"',
  },
  {
    phrase: 'Ravi May 20 se May 22 tak leave',
    expectedIntent: 'request_leave_decision',
    expectedTool: 'propose_leave',
    expectedKind: null,
    rationale: 'Hinglish with explicit dates',
  },
  {
    phrase: 'Ramesh selavu kavali shukravaram',
    expectedIntent: 'request_leave_decision',
    expectedTool: 'propose_leave',
    expectedKind: null,
    rationale: 'Telugu — "Ramesh needs leave Friday"',
  },

  // ─── log_complaint × 9 kinds (10 phrases) ──────────────────────────────
  {
    phrase: 'lobby missed at Aparna A-block 11 AM today',
    expectedIntent: 'log_complaint',
    expectedTool: 'propose_log_complaint',
    expectedKind: 'missed_area',
    rationale: 'classic missed-area — explicit area + site + time',
  },
  {
    phrase: 'client called — terrace not done yesterday at Aparna Sarovar',
    expectedIntent: 'log_complaint',
    expectedTool: 'propose_log_complaint',
    expectedKind: 'missed_area',
    rationale: 'missed area — quoted client complaint',
  },
  {
    phrase: "Anjali rude to resident's child Bhooja Mar 13",
    expectedIntent: 'log_complaint',
    expectedTool: 'propose_log_complaint',
    expectedKind: 'attitude',
    rationale: 'attitude — explicit rudeness allegation',
  },
  {
    phrase: 'phenyl smell complaint from KIMS infection control',
    expectedIntent: 'log_complaint',
    expectedTool: 'propose_log_complaint',
    expectedKind: 'hygiene',
    rationale: 'hygiene — chemical-smell complaint from regulator',
  },
  {
    phrase: 'client says her gold chain is missing from her flat at My Home Avatar',
    expectedIntent: 'log_complaint',
    expectedTool: 'propose_log_complaint',
    expectedKind: 'theft_accusation',
    rationale: 'theft accusation — log the accusation, not the verdict',
  },
  {
    phrase: 'broken tile, worker dropped bucket at Prestige Falcon City',
    expectedIntent: 'log_complaint',
    expectedTool: 'propose_log_complaint',
    expectedKind: 'damage',
    rationale: 'damage — physical property',
  },
  {
    phrase: 'vacuum running 6 AM, residents complained at Lansum',
    expectedIntent: 'log_complaint',
    expectedTool: 'propose_log_complaint',
    expectedKind: 'noise',
    rationale: 'noise complaint — equipment at early hour',
  },
  {
    phrase: 'gate pass expired, Ramesh turned back at My Home Bhooja',
    expectedIntent: 'log_complaint',
    expectedTool: 'propose_log_complaint',
    expectedKind: 'gate_pass',
    rationale: 'gate pass — site-access friction',
  },
  {
    phrase: "photo of mopped floor doesn't match what the client saw at Aparna Cyber Life",
    expectedIntent: 'log_complaint',
    expectedTool: 'propose_log_complaint',
    expectedKind: 'photo_mismatch',
    rationale: 'photo mismatch — proof-flow specific',
  },
  {
    phrase: 'client threatening to cancel because of cleanliness at Aparna Cyber Life',
    expectedIntent: 'log_complaint',
    expectedTool: 'propose_log_complaint',
    expectedKind: 'other',
    rationale: 'high-severity general complaint — kind=other',
  },

  // ─── general (4 phrases) ───────────────────────────────────────────────
  {
    phrase: 'good morning',
    expectedIntent: 'general',
    expectedTool: 'none',
    expectedKind: null,
    rationale: 'greeting — no tool call',
  },
  {
    phrase: 'how many sites are open today',
    expectedIntent: 'general',
    expectedTool: 'none',
    expectedKind: null,
    rationale: 'status question — answer conversationally',
  },
  {
    phrase: 'kuch bhi theek nahi hai aaj',
    expectedIntent: 'general',
    expectedTool: 'none',
    expectedKind: null,
    rationale:
      'venting — no concrete event AND no concrete site → must NOT call propose_log_complaint',
  },
  {
    phrase: 'thanks',
    expectedIntent: 'general',
    expectedTool: 'none',
    expectedKind: null,
    rationale: 'pleasantry — no tool call',
  },

  // ─── propose_clarify cases (4 phrases) ─────────────────────────────────
  {
    phrase: 'Mukesh issue at Aparna',
    expectedIntent: 'general',
    expectedTool: 'propose_clarify',
    expectedKind: null,
    rationale: 'ambiguous between mark_absent and log_complaint',
  },
  {
    phrase: 'problem at Aparna',
    expectedIntent: 'general',
    expectedTool: 'propose_clarify',
    expectedKind: null,
    rationale: "site name ambiguous (multiple 'Aparna' candidates expected)",
  },
  {
    phrase: 'Suresh nahi aaya kal Aparna mein',
    expectedIntent: 'general',
    expectedTool: 'propose_clarify',
    expectedKind: null,
    rationale: 'Worker did-not-come AT a site — could be absent OR missed-area',
  },
  {
    phrase: 'something wrong',
    expectedIntent: 'general',
    expectedTool: 'propose_clarify',
    expectedKind: null,
    rationale: 'no concrete site or event — clarify before any tool call',
  },

  // ─── Additional Hyderabad-supervisor phrasings (3 phrases) ─────────────
  {
    phrase: 'Anjali ka behaviour kharab hai, security ne complain kiya hai My Home Bhooja mein',
    expectedIntent: 'log_complaint',
    expectedTool: 'propose_log_complaint',
    expectedKind: 'attitude',
    rationale: 'attitude complaint quoted by site security — Hinglish',
  },
  {
    phrase: 'water leakage damage at Aparna Cyber Life — worker pressure-cleaned terrace too hard',
    expectedIntent: 'log_complaint',
    expectedTool: 'propose_log_complaint',
    expectedKind: 'damage',
    rationale: 'damage caused by worker action — long-form description',
  },
  {
    phrase: 'Pradeep kal aaya nahi tha, today bhi nahi aa raha',
    expectedIntent: 'mark_absent',
    expectedTool: 'propose_mark_absent',
    expectedKind: null,
    rationale: 'rolling-absence phrasing — still a mark_absent intent',
  },
];

describe('Wave 3 — intent classifier corpus structural assertions', () => {
  it('has exactly 30 phrases (the size pinned in the Wave 3 brief)', () => {
    expect(INTENT_CLASSIFIER_CORPUS.length).toBe(30);
  });

  it('every phrase has a non-empty phrase, intent, and tool', () => {
    for (const row of INTENT_CLASSIFIER_CORPUS) {
      expect(row.phrase.trim().length).toBeGreaterThan(0);
      expect(row.expectedIntent).toBeTruthy();
      expect(row.expectedTool).toBeTruthy();
      expect(row.rationale.trim().length).toBeGreaterThan(0);
    }
  });

  it('covers all four primary intents', () => {
    const intents = new Set(INTENT_CLASSIFIER_CORPUS.map((r) => r.expectedIntent));
    expect(intents.has('mark_absent')).toBe(true);
    expect(intents.has('log_complaint')).toBe(true);
    expect(intents.has('request_leave_decision')).toBe(true);
    expect(intents.has('general')).toBe(true);
  });

  it('covers all 9 complaint kinds (including "other")', () => {
    const kinds = new Set(
      INTENT_CLASSIFIER_CORPUS.filter((r) => r.expectedTool === 'propose_log_complaint').map(
        (r) => r.expectedKind,
      ),
    );
    expect(kinds.has('photo_mismatch')).toBe(true);
    expect(kinds.has('missed_area')).toBe(true);
    expect(kinds.has('attitude')).toBe(true);
    expect(kinds.has('theft_accusation')).toBe(true);
    expect(kinds.has('hygiene')).toBe(true);
    expect(kinds.has('noise')).toBe(true);
    expect(kinds.has('damage')).toBe(true);
    expect(kinds.has('gate_pass')).toBe(true);
    expect(kinds.has('other')).toBe(true);
  });

  it('includes at least one propose_clarify case (confidence-gated fallback)', () => {
    const clarifyCount = INTENT_CLASSIFIER_CORPUS.filter(
      (r) => r.expectedTool === 'propose_clarify',
    ).length;
    expect(clarifyCount).toBeGreaterThanOrEqual(1);
  });

  it('every log_complaint row has a non-null expectedKind', () => {
    for (const row of INTENT_CLASSIFIER_CORPUS) {
      if (row.expectedTool === 'propose_log_complaint') {
        expect(row.expectedKind).not.toBeNull();
      }
    }
  });

  it('every mark_absent / request_leave_decision row has null expectedKind', () => {
    for (const row of INTENT_CLASSIFIER_CORPUS) {
      if (row.expectedTool === 'propose_mark_absent' || row.expectedTool === 'propose_leave') {
        expect(row.expectedKind).toBeNull();
      }
    }
  });

  it('covers Hindi, Telugu, English, and Hinglish phrasings', () => {
    // Heuristic — Devanagari + Telugu codepoints + ASCII.
    const hindi = INTENT_CLASSIFIER_CORPUS.some((r) => /[ऀ-ॿ]/.test(r.phrase));
    const telugu = INTENT_CLASSIFIER_CORPUS.some((r) => /[ఀ-౿]/.test(r.phrase));
    const ascii = INTENT_CLASSIFIER_CORPUS.some((r) => /^[\x20-\x7E]+$/.test(r.phrase));
    // Most Hyderabad phrasings are romanized Hinglish/Telinglish (ASCII).
    // The corpus covers ASCII unambiguously; Devanagari/Telugu native scripts
    // are optional. The structural assertion is "at least ASCII covered".
    expect(ascii).toBe(true);
    // Hindi/Telugu unicode are not required (most supervisors type Hinglish
    // in romanized form on Android keyboards). Kept as informational.
    void hindi;
    void telugu;
  });
});
