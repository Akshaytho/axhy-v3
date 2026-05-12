---
Status: Draft
Last validated against code: 2026-05-12
Validated branch: feat/phase-c-wave-4b-chat-completion
Validated commit: 63c1dbe
Primary owner: founder (Akshay Thota)
Replaces: nothing yet — R3 currently still Active pending review of this Draft
Replaced by: nothing — current Draft
---

> **DRAFT.** This spec was grounded from a full read of the R6 prototype JSX bundle in `docs/prototypes/supervisor-mobile-r6/` on 2026-05-12. R3 remains the Active spec until this Draft is reviewed. Supersession of R3 follows in a separate commit after founder + advisor approval. The 15 contradictions in §4 are NOT resolved by this spec — they are catalogued for the next planning cycle.

# Phase C — Supervisor Mobile R6 Design (Draft, canonical-pending-review)

## 1. Provenance

- Iterated R3 (2026-05-11) → R4 → R5 → R6 (2026-05-12) in `claude.ai/design`
- Final export 2026-05-12 as a handoff bundle
- Bundle copied verbatim into [`docs/prototypes/supervisor-mobile-r6/`](../prototypes/supervisor-mobile-r6/) (excluding the redacted `chats/chat1.md` transcript)
- This spec was authored by Claude Code from a full JSX read of the bundle, not from the transcript

## 2. Surface inventory

### 5 main tabs (tab order locked 2026-05-11 per `shell.jsx:57-58`)

| Tab           | Prototype file            | Highlights                                                                                                                                                                                                                                                                                                                                              |
| ------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Today**     | `today.jsx` (418 LOC)     | Top urgency banner (NEEDS YOU NOW); 3-metric floor pulse (ON SITE / SHORT / PENDING); site cards default collapsed → tap for worker grid; `ShiftWorkerList` for multi-shift sites; worker rows wrapped in `DecisionRef` → amend flow; `FlaggedReviewSheet` modal (photos + AI flag reason + Resolve OK / Reject)                                        |
| **Decisions** | `decisions.jsx` (530 LOC) | Tab badge shows pending count; tier-grouped sections (NEEDS YOU NOW / ROUTINE / FAILED · REVIEW); 5 tiers (note/operational/personnel/employment/review_required); FAILURE_REASON_COPY map translates typed enum to plain English; EMPLOYMENT typed-phrase ack; REVIEW_REQUIRED option picker; batch indicator                                          |
| **Activity**  | `activity.jsx` (300 LOC)  | "{N} events · ACTIVITY · PROOF"; structured filter chips ONLY (date / site / kind), no NL search; actions hidden until row tap (Share to WhatsApp + Reverse); **30-min reverse window**; `ShareSheet` with WhatsApp text preview; weak-network banner ("LAST SYNCED {N} MIN AGO — REVERSE DISABLED")                                                    |
| **Chat**      | `chat.jsx` (297 LOC)      | "Chat · VOICE · MESSY INPUT"; older bubbles dimmed 55% opacity (r5); voice bubble waveform + duration + lang/confidence chips; **NO inline DecisionCards** (r4) — replaced by thin "N decisions added — review in Decisions" link; capture-surface footer (mic-primary, total-pending link to Decisions); live transcription overlay; amend mode banner |
| **Profile**   | `profile.jsx` (113 LOC)   | iOS variant only (Android/Expressive dropped per ADR-0021); avatar + name + role pill; PROFILE section (Name/Phone/Language/Company/Role/Joined); SETTINGS section (Notification prefs/Switch company/Sign out)                                                                                                                                         |

### 2 secondary surfaces

| Surface     | Prototype file          | Highlights                                                                                                                                                                                                                                                                                                                              |
| ----------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Summary** | `summary.jsx` (231 LOC) | "Tuesday · End of day"; 2×2 metric tiles (CHANGES TODAY [atomic batches] / FLAGGED / LEAVE PENDING / TOMORROW · ROST); TIMELINE list → `DecisionsTodaySheet` (filter by tier); WAGES THIS WEEK card (₹1,24,300 etc. with stacked bar — worked/OT/final percentages); "Refresh from server" button; **"I'm done for today"** wrap-up CTA |
| **Updates** | `updates.jsx` (197 LOC) | "HR · COMPANY-WIDE"; "{N} new" badge; NEEDS YOUR ACK / RECENT — ACKNOWLEDGED sections; **ack requires 5+ words in own voice** (NOT a button); **compliance digest pattern** — expandable per-rule sub-list, single ack covers all 5 rules; word counter "{N}/5 WORDS"; acknowledged updates show user's text quoted back                |

### 5 sub-screens (modal overlays, not full tabs)

| Sub-screen              | Prototype file                         | When triggered                                                                                                                                                                                                                          |
| ----------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TerminationScreen**   | `termination-screen.jsx` (116 LOC)     | EMPLOYMENT-tier decision opened from Decisions tab. Bad-tinted header, "Why this" + money implication, RECENT 10 DAYS history, typed-phrase 'TERMINATE' ack.                                                                            |
| **MultiDayLeaveScreen** | `multi-day-leave-screen.jsx` (109 LOC) | PERSONNEL multi-day leave. Per-day cover picker (pills); WAGES IMPACT card; "Approve leave + send invites" (disabled until all days picked).                                                                                            |
| **ReplacementPicker**   | `replacement-picker.jsx` (140 LOC)     | Triggered from Today site card menu or Decisions row. Filter chips by trait (preferred/known/etc.); candidate list with ON SHIFT badge if currently working; travel + last shift meta; **"Send invite — 2 min timer"** ephemeral state. |
| **FlaggedReviewSheet**  | inside `today.jsx`                     | AI-flagged visits from Today urgency banner. Photos + AI flag reason + Resolve OK / Reject.                                                                                                                                             |
| **DecisionsTodaySheet** | inside `summary.jsx`                   | Decisions-of-the-day filtered view from Summary timeline. Filter chips by tier; rows tappable for amend.                                                                                                                                |

### Shared chrome (`shell.jsx`, 614 LOC — single biggest file)

`window.AxhyShell` exports 14 components:

- `StatusBar`, `PhoneFrame`, `TabBar` (5-tab nav with badge), `TopAppBar` (menu + title + actions), `Drawer` (slide-in left panel, 8 items)
- `Greeting` ("Namaste, {firstName}." + sites/workers count)
- `TierChip` (note/operational/personnel/employment — 4 tiers at chip level; `review_required` lives only in `decisions.jsx`)
- `DecisionCard` (inline-card component — now only used in `MediumSheet` for ambiguous decisions, NOT inline in chat per r4 demotion)
- `AmbiguousDecisionCard` (radio-button picker for AI-ambiguous suggestions)
- `HeavySummaryCard` (heavy decision summary with "→ Open to decide" CTA)
- `MediumSheet` (bottom sheet, drag handle, title, close)
- `MicFAB` (floating mic button, red+pulse when listening)
- `CaptionEyebrow`, `DecisionRef` (universal tappable wrapper routing `onAmend(decisionId)` to chat amend mode)

### Drawer items (`shell.jsx:513-522`)

1. My profile · Stats · streaks · prefs
2. Memory & rules · 23 rules · 12 aliases · 8 site notes
3. My sites · 8 sites · 3 with active rules
4. Language · English · हिन्दी · తెలుగు
5. Notifications · Push · WhatsApp · Email
6. How to use Axhy · 60-sec video · examples
7. **Temporary mode · Pause AI for the day**
8. Sign out

## 3. r3 → r6 iteration trail (extracted from JSX comments)

- **r4:** Today urgency banner; Today floor pulse 5 → 3 metrics; Decisions ultra-compact row mode; Chat capture-surface footer; Chat inline DecisionCards removed (replaced by Decisions-link); Activity actions hidden until row tap
- **r5:** Decisions tier-grouped sections (URGENT / ROUTINE / FAILED); Chat older bubbles dimmed 55% opacity
- **r6:** Decisions body text 60 → 40 chars; Decisions worker/site meta line dropped from urgent cards

## 4. Contradictions with Decision entity lock spec (Draft)

The Decision entity lock spec at [`docs/specs/2026-05-12-decision-entity-lock.md`](2026-05-12-decision-entity-lock.md) is itself currently Draft. The 15 items below are gaps surfaced by reading the R6 prototype against that Draft. **None are resolved by this spec.** They are inputs for the next D.1 revision plan.

| #   | R6 design says                                                                                                                                                                                                       | Lock spec says                                                                                                                               | Severity                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Reverse window: **30 min** ([`activity.jsx:103`](../prototypes/supervisor-mobile-r6/project/src/activity.jsx))                                                                                                       | 5 min                                                                                                                                        | Hard contradiction — pick one                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2   | `REVIEW_REQUIRED` is a **tier** with option-picker UX ([`decisions.jsx:22`](../prototypes/supervisor-mobile-r6/project/src/decisions.jsx))                                                                           | Tier enum is `NOTE/OPERATIONAL/PERSONNEL/EMPLOYMENT` only                                                                                    | Tier enum needs `review_required` added OR design needs different framing                                                                                                                                                                                                                                                                                                                                                         |
| 3   | `UNDONE` status NOT rendered in Decisions tab                                                                                                                                                                        | Status enum includes UNDONE                                                                                                                  | Likely OK (UNDONE shown in Activity, not Decisions) but spec should explicitly say so                                                                                                                                                                                                                                                                                                                                             |
| 4   | `ATTENDANCE_REVERSED` is an AuditEvent kind ([`activity.jsx:27`](../prototypes/supervisor-mobile-r6/project/src/activity.jsx))                                                                                       | Not in spec's enum list                                                                                                                      | Add to spec                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 5   | `DecisionRef` uses synthetic IDs like `worker:${w.id}` and `site-flagged:${site.id}` ([`today.jsx:63,122`](../prototypes/supervisor-mobile-r6/project/src/today.jsx))                                                | No "latest decision for worker/site" lookup defined; tenant-scoping of synthetic IDs not specified                                           | **Resolved 2026-05-12 (Option A) per Phase B revision.** Synthetic IDs are UI intent tokens — NOT persisted decision identifiers. Backend parses `<kind>:<uuid>`, validates `companyId`-scope, threads validated subject + read-only recent-decisions context into AI prompt. Amend flow creates a fresh `PROPOSED` decision row, never mutates past ones. Launch token set: `worker`, `site`, `site-flagged`. See D.1 spec §2.7. |
| 6   | HR ack uses **typed-words** ([`decisions.jsx:91-95`](../prototypes/supervisor-mobile-r6/project/src/decisions.jsx))                                                                                                  | HR is "Direct APPLIED, no PROPOSED step"                                                                                                     | Direct contradiction — HR ack implies HR has a PROPOSED step                                                                                                                                                                                                                                                                                                                                                                      |
| 7   | **No in-app delegation / account handoff** in R6 (`shell.jsx:443-445`: backup-supervisor mode removed founder-locked 2026-05-08; "if a supervisor goes on leave, they share their account with someone trustworthy") | Phase D lock #6: `Membership.delegated` listed as an independent spec to write                                                               | **R6 surfaces a strong case to cut lock #6, but the cut is not yet a settled decision — requires explicit founder approval.**                                                                                                                                                                                                                                                                                                     |
| 8   | "Temporary mode" in Drawer = **Pause AI for the day** ([`shell.jsx:520`](../prototypes/supervisor-mobile-r6/project/src/shell.jsx))                                                                                  | Earlier "temporary mode scoped per Membership" memory entry was about delegation, not pause-AI                                               | Resolve ambiguity: if R6's pause-AI is the locked intent, it's a new feature with a different schema shape than what Membership.delegated implied                                                                                                                                                                                                                                                                                 |
| 9   | Note-tier decisions have **WHERE TO SAVE** sub-flow (site_rule vs working_note) with privacy semantics ([`shell.jsx:226-251`](../prototypes/supervisor-mobile-r6/project/src/shell.jsx))                             | No `noteKind`/visibility field on `DecisionWorkspaceItem`                                                                                    | Schema gap — note-tier needs visibility scoping                                                                                                                                                                                                                                                                                                                                                                                   |
| 10  | Summary tile says "CHANGES TODAY · atomic batches" ([`summary.jsx:136`](../prototypes/supervisor-mobile-r6/project/src/summary.jsx))                                                                                 | `batchId` groups but doesn't enforce atomicity — apply can succeed/fail per row                                                              | Drop "atomic" framing OR upgrade to true batch lifecycle                                                                                                                                                                                                                                                                                                                                                                          |
| 11  | HR Updates ack flow: **5+ words in own voice** ([`updates.jsx:51`](../prototypes/supervisor-mobile-r6/project/src/updates.jsx))                                                                                      | Lock models EMPLOYMENT typed-phrase ack only                                                                                                 | Add `ackKind: 'PHRASE' \| 'PROSE'` to spec OR HR Updates live outside `DecisionWorkspaceItem`                                                                                                                                                                                                                                                                                                                                     |
| 12  | **Compliance digest** pattern — 5 rules acked together ([`updates.jsx:42-44`](../prototypes/supervisor-mobile-r6/project/src/updates.jsx))                                                                           | One DecisionWorkspaceItem per decision                                                                                                       | Schema gap — needs a digest-parent or rules-bundle concept                                                                                                                                                                                                                                                                                                                                                                        |
| 13  | Replacement picker has **"2 min invite timer"** ephemeral state ([`replacement-picker.jsx:132`](../prototypes/supervisor-mobile-r6/project/src/replacement-picker.jsx))                                              | No invite/acceptance lifecycle modelled                                                                                                      | New schema concept needed (replacement-invite with TTL)                                                                                                                                                                                                                                                                                                                                                                           |
| 14  | `DecisionCard` component still exists in `shell.jsx` but only renders inside `MediumSheet` for ambiguous decisions                                                                                                   | Spec §2.6 says "chat surface shows backlink, NOT inline cards" — consistent intent, but inline component is preserved for medium-sheet usage | Minor — clarify in spec that DecisionCard is medium-sheet-only                                                                                                                                                                                                                                                                                                                                                                    |
| 15  | "I'm done for today" wrap-up CTA ([`summary.jsx:206-216`](../prototypes/supervisor-mobile-r6/project/src/summary.jsx)) opens a wrap-up sheet                                                                         | No end-of-day flow modelled                                                                                                                  | Either drop from launch or add to spec                                                                                                                                                                                                                                                                                                                                                                                            |

### Severity breakdown

- **Hard contradictions** (must resolve before P1 implementation): #1 (reverse window), #6 (HR ack), #7 (delegation lock)
- **Schema gaps** (new fields/concepts needed): #4 (audit kind), #5 (synthetic IDs + tenant scoping), #9 (noteKind visibility), #11 (ackKind), #12 (digest parent), #13 (invite TTL)
- **Framing clarifications** (spec wording, no schema change): #2, #3, #10, #14, #15
- **Candidate lock-list reduction** (8 → 7, pending founder decision): #7 — R6 surfaces a strong case to cut lock #6 (`Membership.delegated`), but the cut is not yet a settled decision

### Most consequential finding

R6 design surfaces a **strong case to CUT Phase D lock #6** (`Membership.delegated`): the backup-supervisor mode is removed in the prototype per a 2026-05-08 founder-lock, with the comment "if a supervisor goes on leave, they share their account with someone trustworthy. No in-app delegation feature." The 8-lock list is therefore a **candidate** for reduction to 7. This cut is **not yet a settled decision** and requires explicit founder approval before any lock-list document is updated.

## 5. What this spec is NOT

- **Not a backend contract** — see the Decision entity lock spec and downstream Phase D locks for those.
- **Not an implementation guide** — implementation matches the prototype's visual output. Coding agents should NOT copy the JSX structure; recreate visually in whatever stack fits the target codebase.
- **Not yet Active** — R3 holds Active until this Draft is reviewed.
- **Not a resolution of the 15 contradictions** — only a catalogue. Resolution is the next plan's job.

## 6. Founder-locked decisions visible in r6 (cross-reference)

- **Tab order locked 2026-05-11** (`shell.jsx:57-58`): Today / Decisions / Activity / Chat / Profile
- **Backup-supervisor mode removed, founder-locked 2026-05-08** (`shell.jsx:443-445`): no in-app delegation feature; account-sharing is the workaround. Contradiction #7 surfaces from this lock.
- **Android/Expressive variant dropped per ADR-0021** (`profile.jsx:2`)
- **R3 design pass locks 2026-05-11:**
  - Today site cards default collapsed (`today.jsx:106-109`)
  - Activity actions hidden until row tap (`activity.jsx:34-37`)
  - Decisions Workspace replaces inline chat cards (per chat.jsx r4 comment)
- **R6 locks 2026-05-12:**
  - Decisions body text 40-char limit (`decisions.jsx:83-86`)
  - Worker/Site meta dropped from urgent cards (`decisions.jsx:135-137`)

## 7. Cross-references

- Doc discipline protocol: [`docs/protocols/doc-discipline.md`](../protocols/doc-discipline.md)
- Canonical truth index: [`docs/index/canonical-truth.md`](../index/canonical-truth.md)
- Decision entity lock (Draft, needs revision per §4 contradictions): [`docs/specs/2026-05-12-decision-entity-lock.md`](2026-05-12-decision-entity-lock.md)
- Prototype bundle: [`docs/prototypes/supervisor-mobile-r6/`](../prototypes/supervisor-mobile-r6/)
- R3 (still Active pending review of this Draft): [`docs/specs/2026-05-11-supervisor-mobile-r3-design.md`](2026-05-11-supervisor-mobile-r3-design.md)
- ADR-0006 (XState v5): governs Decision entity lifecycle machine
- ADR-0021 (single mobile app): basis for Android variant drop
- 2026-05-08 founder-lock: backup-supervisor mode removed (no formal ADR yet — should be written if lock #6 is cut)

## 8. Approval gate

This spec flips Status: Draft → Active only after:

1. External advisor pressure-test review (forwarded by founder)
2. Founder explicit approval
3. The 15 contradictions in §4 are explicitly: (a) assigned for resolution (which side moves — design or lock spec), or (b) accepted as known launch gaps with a flag in the Decision entity lock spec
4. Decision entity lock spec is revised to reflect resolutions
5. Founder explicitly approves OR rejects the candidate cut of Phase D lock #6 (`Membership.delegated`)

Until all 5 conditions hold, R3 remains Active and this Draft cannot guide implementation.
