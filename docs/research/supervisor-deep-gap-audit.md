# Supervisor Mobile — Deep Feature-Gap Audit

**Date:** 2026-05-18 01:15 IST
**Scope:** `/apps/mobile/app/(supervisor)/`, `/apps/mobile/components/`, `/apps/backend/src/routes/`, R6 prototype, master plan §G, 70 chaos scenarios, web research on FM-software peers.
**Method:** Cross-referenced every R6 prototype screen + every chaos scenario + every master-plan §G lock against current code. Flagged anything that requires WhatsApp/phone/manual workaround.

> **Auditor stance:** The prior feature-matrix (`supervisor-feature-matrix.md`) was too generous. It rated 28/34 surfaces "WORKS" by counting honest "coming-soon" placeholders as functional. This audit counts a feature WORKING only if a real Hyderabad supervisor can complete the scenario without leaving the app. By that bar, the app covers roughly **12 of the 70 chaos scenarios end-to-end (≈17%)**. Most failures share a small number of root causes (see Cluster Themes at bottom).

---

## 1. Headline counts

| Severity                    | Count  | Feature areas                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0 — blocks daily flow**  | **18** | Decisions tier coverage, replacement picker, flagged-resolve, leave/swap approval, complaint logging, photo attach in chat, voice waveform truth, reverse action, soft-flag, offline queue, multi-day cover, termination screen, summary "I'm done" mutation, push wakeup, GPS-spoof handling, geofence punch, ack of swap invite, intent classifier in chat                                                                                        |
| **P1 — blocks weekly flow** | **17** | Memory & rules editor, site rules CRUD, site-priority action, send-replacement direct from site card, language non-sync, notification-prefs non-sync, calendar/roster surface, mid-month performance compile, billing certification compile, festival mass-leave planner, gate-pass list, do-not-deploy list, skill-mismatch one-button, sites-from-drawer tap, share-to-WhatsApp export of activity batch, ESIC/PF info card, advance request flow |
| **P2 — nice-to-have**       | **12** | Worker birthday reminder, voice live-transcription overlay, AI-paused banner consumer, dim-older-pairs spec, ambiguous-decision radio card, AI-confidence chip, festival calendar surface, weather/monsoon banner, owner 11-PM digest export, Telugu/Hindi worker-side strings, photo-CDN inline thumbnails, biometric-machine-offline fallback                                                                                                     |
| **TOTAL**                   | **47** | —                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

**Compared to prior audit:** prior found 3 MISSING + 1 EMPTY = 4. This audit finds 47, mostly because the prior counted "honest placeholder modals" as working surfaces and didn't walk through the 70 chaos scenarios.

---

## 2. Gap table (sortable)

| #   | Gap                                                   | Sev | Cx  | Owner   | Where it bites                                            | Code state                                                                                                                                                                                                                          |
| --- | ----------------------------------------------------- | --- | --- | ------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Replacement Picker screen (PUBG-invite, 2-min timer)  | P0  | L   | both    | Sc 1,3,9,16,20,39–46 (every swap/no-show)                 | absent. R6 has full `replacement-picker.jsx` (235 LOC) + `multi-day-leave-screen.jsx` (190 LOC). Master plan line 976 locks it. Zero implementation in mobile.                                                                      |
| 2   | Multi-day leave-cover screen                          | P0  | L   | both    | Sc 16–18, 21–22, 24 (every multi-day leave)               | absent. `multi-day-leave-screen.jsx` exists in R6. No mobile screen, no `useLeaveQuery`, no `/leave-requests` mobile consumer.                                                                                                      |
| 3   | Termination screen (typed "TERMINATE", history strip) | P0  | M   | mobile  | Sc 7, 22 (no-show termination), 18                        | partial. `DecisionCard.tsx` has typed-phrase confirm for EMPLOYMENT tier but no dedicated screen with 10-day history strip. R6 has `termination-screen.jsx` (207 LOC).                                                              |
| 4   | Leave-request approve/reject UI                       | P0  | M   | mobile  | Sc 16, 20, 21, 22, 23, 24, 25, 47                         | orphaned. `/leave-requests/:id/approve` exists in backend; **no mobile hook, no UI**.                                                                                                                                               |
| 5   | Swap-request decision UI                              | P0  | M   | mobile  | Sc 39–46, 71                                              | orphaned. `/swap-requests/:id/decide` exists; **no mobile hook, no UI**.                                                                                                                                                            |
| 6   | Complaint logging via chat → HR routing               | P0  | L   | both    | Sc 26–38 (all 13 client-complaint scenarios)              | partial. `POST /sites/:id/complaints` exists in backend; **no mobile UI calls it**. No chat intent classifier exists (grep returned 0 hits for `intent`/`classify` in backend chat code). No "Complaints" drawer entry.             |
| 7   | Flagged-visit Resolve/Reject buttons                  | P0  | S   | both    | Sc 4, 26, 27, 30, 32, 33 (photo evidence flow)            | broken-by-design. `FlaggedReviewSheet.tsx` has buttons disabled (opacity 0.6) with "coming with P1 routing" comment.                                                                                                                |
| 8   | Activity Reverse-action (within 30 min)               | P0  | M   | both    | Sc 11, 15 (double-marked, fever-then-came)                | broken-by-design. Modal explicitly says "coming with routing slice".                                                                                                                                                                |
| 9   | Soft-flag past 30-min window                          | P0  | S   | both    | Sc 11, 25 (late reversal asks)                            | unwired. Greyed button, onPress does nothing.                                                                                                                                                                                       |
| 10  | SiteActionSheet — 4 no-op buttons                     | P0  | M   | both    | Sc 26–38, 56, 59, 60 (site-level events)                  | stubbed. All 4 onPress = onClose. "Send replacement" should jump to Replacement Picker; "Add site rule" should go through chat→living-doc; "Mark as priority" needs a Site state machine flag; "Open in maps" is one-liner Linking. |
| 11  | Photo attach in chat                                  | P0  | M   | both    | Sc 26–34 (photo proof + WhatsApp screenshot forwarding)   | absent. ChatInput.tsx has no camera/attach button. R6 chat shows voice + text only — but the chaos doc shows photo forwarding is **half the supervisor's day**.                                                                     |
| 12  | Voice waveform truthfulness                           | P0  | S   | mobile  | Sc walkthrough trust                                      | hardcoded `duration="0:00"`. Confusing UX.                                                                                                                                                                                          |
| 13  | Offline photo + action queue                          | P0  | L   | both    | Sc 6, 72, 73, 75 (network down, photo failures)           | absent. No queue lib, no retry. Photo upload is fire-and-forget.                                                                                                                                                                    |
| 14  | Memory & rules editor                                 | P0  | L   | both    | Sc 28, 31, 32, 35, 59, 61 (per-site rules)                | empty. `memory.tsx` is a placeholder card. Master plan §G.6 locks a 5-section rule editor. No `GET /supervisor/living-doc` mobile call.                                                                                             |
| 15  | Geofence + GPS-spoof handling at punch                | P0  | M   | backend | Sc 4, 6, 76                                               | unwired in mobile surface. Master plan §F mentions velocity check; no mobile geofence indicator.                                                                                                                                    |
| 16  | Push wakeup of recipient on swap invite               | P0  | M   | both    | Sc 39–46, 77 (delivered-vs-read problem)                  | partial. OneSignal wired for login; no swap-invite push payload. `notification-payload.ts` exists but no invite-flow caller.                                                                                                        |
| 17  | Chat intent classifier                                | P0  | L   | backend | Sc 26–38, 47 (complaint/advance vs roster change)         | absent. Zero `intent`/`classify` strings in chat code. Today every utterance becomes a generic decision card. Master plan line 932 implies intent-based routing exists.                                                             |
| 18  | Summary "I'm done for today" — actual mutation        | P0  | S   | both    | Sc 78–84 (rhythm anchor)                                  | UI-only. Button navigates to Today; no state change, no end-of-day-locked event written.                                                                                                                                            |
| 19  | Memory & rules — site-rules CRUD                      | P1  | L   | both    | Sc 28, 31, 32, 59, 61                                     | absent (see #14).                                                                                                                                                                                                                   |
| 20  | "Mark as priority" → Site state machine               | P1  | M   | both    | Sc 26, 37                                                 | stubbed in SiteActionSheet.                                                                                                                                                                                                         |
| 21  | Send-replacement from SiteActionSheet (direct path)   | P1  | M   | mobile  | Sc 39–46 (vs going via chat)                              | stubbed. Would invoke Replacement Picker if it existed.                                                                                                                                                                             |
| 22  | Language preference — backend sync                    | P1  | S   | both    | walkaround sanity                                         | local-only. `membership.notificationPrefs` exists but not wired.                                                                                                                                                                    |
| 23  | Notification prefs — backend sync                     | P1  | S   | both    | Sc 70 (phone broken, re-login from new device)            | local-only.                                                                                                                                                                                                                         |
| 24  | Calendar / roster surface                             | P1  | L   | both    | Sc 17, 22, 24 (festival mass-leave planning)              | orphaned. `/calendar` backend exists; no mobile UI. R6 doesn't show calendar tab either — but chaos requires forward planning.                                                                                                      |
| 25  | Mid-month performance compile (auto)                  | P1  | M   | backend | Sc 80 (Mr. Reddy asks for site-by-site stats on the 15th) | absent. Supervisor compiles manually.                                                                                                                                                                                               |
| 26  | Billing certification compile                         | P1  | M   | both    | Sc 81                                                     | absent. End-of-month worker-days per site is manual.                                                                                                                                                                                |
| 27  | Festival mass-leave planner                           | P1  | L   | both    | Sc 17, 24, 58                                             | absent. No leave-curve forecast.                                                                                                                                                                                                    |
| 28  | Gate-pass / do-not-deploy list per site               | P1  | M   | both    | Sc 13, 35, 45, 46                                         | absent. No `siteBindings.bannedWorkers` or `gatePassList` in code.                                                                                                                                                                  |
| 29  | Skill-mismatch one-button "Assign anyway"             | P1  | S   | mobile  | Sc 44 (master plan locks: one button, no textarea)        | absent. Locked spec in v1/v2 memory; not implemented in v3.                                                                                                                                                                         |
| 30  | Drawer → Sites → tap-to-expand back to Today          | P1  | S   | mobile  | walkaround flow                                           | comment in `sites.tsx`: "tap action deferred".                                                                                                                                                                                      |
| 31  | Activity batch-share to WhatsApp                      | P1  | S   | mobile  | Sc 36, 81, 83 (owner/client snapshots)                    | single-row share only. No batch/digest export.                                                                                                                                                                                      |
| 32  | ESIC / PF info card per worker                        | P1  | M   | both    | Sc 50, 51 (worker asks why PF cut)                        | absent. No worker-financial summary surface.                                                                                                                                                                                        |
| 33  | Advance-request flow                                  | P1  | M   | both    | Sc 47, 52, 55 (5–8 advances/month)                        | absent. Worker asks via WhatsApp; supervisor screenshots back.                                                                                                                                                                      |
| 34  | NOTE-tier "save as site rule vs working note" radio   | P1  | S   | mobile  | Sc 28, 31, 32 (per-site rules)                            | absent. R6 shell.jsx has this radio in DecisionCard for `tier === 'note'`; not in current `DecisionCard.tsx`.                                                                                                                       |
| 35  | Decisions — Amend mode banner                         | P1  | M   | both    | walkaround chat-edit                                      | absent. R6 chat.jsx shows AMEND banner; current chat has none.                                                                                                                                                                      |
| 36  | Ambiguous-decision radio card                         | P1  | S   | mobile  | Sc 12 (two workers same name)                             | absent. R6 has `AmbiguousDecisionCard`; mobile uses generic DecisionCard.                                                                                                                                                           |
| 37  | Worker birthday reminder                              | P2  | S   | both    | Sc 84                                                     | absent. Mentioned in chaos doc; no reminder surface.                                                                                                                                                                                |
| 38  | Voice live-transcription overlay (while listening)    | P2  | M   | mobile  | UX quality                                                | absent. R6 has "LISTENING · TE → EN" overlay; current ChatInput doesn't render it.                                                                                                                                                  |
| 39  | AI-paused-until banner consumer                       | P2  | S   | mobile  | Drawer Temporary mode → chat                              | unwired. `Drawer.tsx` writes `axhy_ai_paused_until` to localStorage but no consumer.                                                                                                                                                |
| 40  | Dim-older-pairs (opacity 0.55)                        | P2  | S   | mobile  | UX quality                                                | partial — comment says implemented but VoiceWaveformPill placeholder breaks the illusion.                                                                                                                                           |
| 41  | AI-confidence chip on transcription                   | P2  | S   | mobile  | trust signal                                              | hardcoded "HIGH".                                                                                                                                                                                                                   |
| 42  | Festival calendar surface                             | P2  | S   | both    | Sc 17, 24, 58                                             | absent. Static Bonalu/Diwali/Sankranti calendar would unblock mass-leave planning.                                                                                                                                                  |
| 43  | Weather/monsoon banner                                | P2  | S   | both    | Sc 26, 67, 68 (monsoon disrupts)                          | absent.                                                                                                                                                                                                                             |
| 44  | Owner 11-PM digest export                             | P2  | S   | both    | Sc 83                                                     | absent.                                                                                                                                                                                                                             |
| 45  | Telugu/Hindi worker-side strings — propagation        | P2  | M   | mobile  | Sc 79 (worker WhatsApp screenshot)                        | partial. `useLocaleStrings()` exists but coverage incomplete.                                                                                                                                                                       |
| 46  | Photo-CDN inline thumbnails                           | P2  | M   | backend | Sc 26–34 (proof workflow)                                 | comment: "ship with photo CDN slice".                                                                                                                                                                                               |
| 47  | Biometric-machine-offline fallback                    | P2  | M   | both    | Sc 75 (Cyber Towers biometric unplugged)                  | absent.                                                                                                                                                                                                                             |

---

## 3. P0 detail sections

### P0-1: Replacement Picker (PUBG-style invite)

- **Confidence: 99% own** — verified via grep + R6 prototype + master plan §G line 976.
- **Bites:** Every no-show / swap / leave scenario (≈25 of 70). Today: founder presses "Send replacement" on SiteActionSheet → sheet closes silently.
- **What's missing in code:** No screen file. No `/replacements/invite` route. No `useReplacementInvite` hook. No invite-card on receiving worker's side. No 2-min countdown UI. No `WorkerInvite` table in shared-schema (grep confirms).
- **What R6 specs:** `replacement-picker.jsx` shows filter chips (Preferred · Bound-to-site · Free now · On-shift), candidate rows with travel-time + ON SHIFT badge, "Send invite — 2 min timer" CTA. Multi-day variant routes from `multi-day-leave-screen.jsx`.
- **Master plan locks:** `Replacement search UI | Separate dedicated screen (NOT inline cards in chat). PUBG-style invite system: supervisor selects candidates → sends invites → workers see invite with 2-min countdown → accept/decline → status flows back to supervisor.` (line 976) + `Invite expiry timer | 2 minutes default` (line 977).
- **Complexity:** L. New schema (WorkerInvite, InviteState machine), new backend routes (POST /invites, POST /invites/:id/accept|decline, GET /invites/active), new screen + worker-side receive UI, push payload. ~1500 LOC across mobile + backend + schema.

### P0-2: Multi-day leave cover screen

- **Confidence: 95% own** — verified by absent screen + R6 file presence.
- **Bites:** Sc 16–25 (every leave > 1 day, including festival mass-leave Sc 17, 24).
- **What's missing:** Screen file, daily cover-slot picker, per-day candidate chips, "Approve leave + send invites" button which fans out to N concurrent Replacement Pickers.
- **R6:** `multi-day-leave-screen.jsx` (190 LOC). Iterates over `decision.multiDay.days[]`, lets supervisor pick a candidate per day, gates approval until all picks made.
- **Complexity:** L. Depends on P0-1.

### P0-3: Termination screen with history strip

- **Confidence: 90% own** — current DecisionCard partial; R6 has dedicated screen.
- **Bites:** Sc 7, 18, 22 (silent no-show patterns → termination).
- **What's there now:** Typed "TERMINATE" input inline in DecisionCard.
- **What's missing:** Dedicated screen with 10-day worker history strip (4 ❌ no-show + 1 ⚠ late + 2 ✓ verified visits as visual evidence). Bad-tier red header. "Not now / Confirm termination" two-button footer.
- **Complexity:** M. ~250 LOC + a `GET /workers/:id/recent-history` endpoint.

### P0-4: Leave-request approve/reject UI

- **Confidence: 100% own** — grep confirms `/leave-requests/*` routes exist; mobile has zero consumers.
- **Bites:** Sc 16, 20, 21, 22, 23, 24, 25, 47, 55 (≈12 of 70).
- **Master plan locks:** Decisions tier system labels these as PERSONNEL tier with multi-day-cover sub-flow. Today: leave requests are orphaned.
- **Complexity:** M. Wire via Decisions queue, NOT a new tab. ~400 LOC mobile + leverage existing routes.

### P0-5: Swap-request decision UI

- **Confidence: 100% own.**
- **Bites:** Sc 39–46, 71.
- **What's missing:** Mobile screen calling `/swap-requests/:id/decide`. Should also live INSIDE Decisions queue, not as separate route — matches founder's "all decisions go to Decisions box only" hint.
- **Complexity:** M. ~300 LOC.

### P0-6: Complaint logging via chat → HR routing

- **Confidence: 92% own + research.** Backend route exists; no mobile UI; no chat intent classifier.
- **Bites:** Sc 26–38 (13/70 — biggest category).
- **What's spec'd by founder:** chat intent extraction routes "Apollo lobby complaint" to HR via `hr.site_complaint` outbox topic, then thread visible in a Complaints drawer entry showing HR replies.
- **What's there now:** `/sites/:id/complaints` exists, writes Outbox row. **No mobile UI, no Complaints drawer entry, no chat intent classifier (0 grep hits), no HR-reply read surface.**
- **Complexity:** L. Intent classifier in backend chat extractor (LLM prompt change + a router map), Complaints drawer screen, HR-reply ingestion, push on reply.

### P0-7: Flagged-visit Resolve/Reject

- **Confidence: 100% own.** Buttons literally `disabled` in code.
- **Bites:** Every photo-proof scenario (Sc 4, 26–34).
- **Fix is small:** Wire to `POST /supervisor/decisions/:id/resolve|reject` with photo evidence ID.
- **Complexity:** S. ~80 LOC.

### P0-8: Activity Reverse-action

- **Confidence: 100% own.** Modal explicitly says "coming soon".
- **Bites:** Sc 11, 15.
- **Complexity:** M. Requires reversal endpoint, audit event, optimistic UI.

### P0-9: Soft-flag past 30-min window

- **Confidence: 100% own.** Disabled button silently fails.
- **Complexity:** S. ~50 LOC.

### P0-10: SiteActionSheet — 4 no-op buttons

- **Confidence: 100% own.** All onPress=onClose.
- **Bites:** Sc 26–38, 56, 59, 60.
- **Complexity:** M. 4 separate wires: site-priority (Site state machine), site-rule (route to chat-with-amend banner), send-replacement (P0-1), open-in-maps (Linking one-liner).

### P0-11: Photo attach in chat

- **Confidence: 95% own + research.** Founder rule: "WhatsApp is the OS, the app is the wedge — every event today goes through WhatsApp". Photo-share IN chat is the #1 thing peers (BVG/SIS/Connecteam/Jibble) do that we don't.
- **Bites:** Sc 26–34 (every photo-proof scenario).
- **What's missing:** Camera + gallery button in ChatInput.tsx. Multipart upload. Inline thumbnail in user bubble. Server-side photo CDN.
- **Complexity:** M. ~500 LOC mobile + backend signed-upload URL.

### P0-12: Voice waveform truthfulness

- **Confidence: 100% own.** Comment in chat.tsx: "hardcoded duration".
- **Complexity:** S. Hook into useVoiceRecorder's duration + amplitude.

### P0-13: Offline photo + action queue

- **Confidence: 88% own + research.** GeoSafe, ConnectMyWorld, Truein all advertise offline-first as their #1 India differentiator.
- **Bites:** Sc 6, 72, 73, 75.
- **What's missing:** No queue lib (no RNAsyncStorage queue, no SQLite buffer, no retry exponent). Photo uploads fire-and-forget.
- **Complexity:** L.

### P0-14: Memory & rules editor

- **Confidence: 100% own.** Screen exists but renders empty card.
- **Bites:** Sc 28, 31, 32, 35, 59, 61 (every site-specific rule scenario).
- **What's missing:** `GET /supervisor/living-doc`, rule cards, NOTE-tier "save as site rule" flow from chat.
- **Master plan locks:** §G.6 — 5 pre-defined sections (site rules, worker notes, client preferences, recurring tasks, free notes).
- **Complexity:** L.

### P0-15: Geofence + GPS-spoof handling

- **Confidence: 70% own — verified by grep on geofence/velocity, did not find a mobile surface; backend may have it; needs founder check.** Status uncertain.
- **Bites:** Sc 4, 6, 76.
- **Complexity:** M.

### P0-16: Push wakeup of swap invite

- **Confidence: 85% own.** OneSignal wired for login; no invite payload caller.
- **Bites:** Sc 77 (delivered ≠ read; supervisor anxious for ack).
- **Complexity:** M. Depends on P0-1.

### P0-17: Chat intent classifier

- **Confidence: 95% own — grep returned 0 `intent`/`classify` hits in `apps/backend/src/routes/chat.ts`.**
- **Bites:** Every chat utterance that isn't a roster change (complaints, advances, notes, questions).
- **What's missing:** LLM-side intent enum (`roster_change | complaint | advance_request | site_rule | question | note`) + dispatcher that maps to the correct outbox topic or Decision tier.
- **Complexity:** L. Backend-only; ~600 LOC including prompt template + tests.

### P0-18: Summary "I'm done for today" mutation

- **Confidence: 100% own.** Code reads `router.navigate('/today')` — no mutation.
- **Bites:** Sc 78–84 (rhythm anchor). Without a written EOD-locked event, no streaks, no owner-digest auto-fire, no "you missed yesterday" nudge.
- **Complexity:** S. ~80 LOC.

---

## 4. Cluster themes (5 shared root causes)

### Cluster A — "No replacement picker means 8 features have no home"

The PUBG-invite Replacement Picker (P0-1) is the spine that:

- SiteActionSheet "Send replacement" depends on (P0-10)
- Multi-day leave cover depends on (P0-2)
- Swap-request decision UI invokes (P0-5)
- Push-invite wakeup feeds (P0-16)
- Festival mass-leave planner needs (P1-27)
- Skill-mismatch one-button piggybacks on (P1-29)
- Chat-amend "send replacements for Mukundan, Mukesh, and Sarita" routes to (P0-6 + P0-17)
- Decisions tier PERSONNEL multi-day card opens (decisions.tsx update).

**Why missing:** Locked in master plan line 976 but never built. It's the highest-leverage L-complexity item. Single-handedly fixes ~20 chaos scenarios.

### Cluster B — "Decisions queue is a stub of its locked spec"

The 4-tier model (NOTE / OPERATIONAL / PERSONNEL / EMPLOYMENT) is fully defined in `packages/shared-schema/dist/zod/decisions.js`. But the mobile `DecisionCard` only renders:

- Tier chip ✓
- Dismiss button ✓
- EMPLOYMENT typed-phrase confirm ✓

It is missing:

- NOTE-tier "save as site rule vs working note" radio (P1-34)
- PERSONNEL-tier multi-day cover sub-card (P0-2)
- AmbiguousDecisionCard radio variant (P1-36)
- Amend-mode in-chat banner with parent decision ref (P1-35)
- HeavySummaryCard pattern with "Open to decide" CTA (R6 shell.jsx:616)

**Implication:** Leave-approve, swap-decide, complaint-log, advance-approve, termination-with-history all SHOULD live inside Decisions queue (matches founder's "all decisions go to Decisions box only") but the queue's UI cards don't support those shapes yet.

### Cluster C — "Chat is voice-text-only; missing intent + photo + amend"

The current chat.tsx is 90% an LLM passthrough. Missing:

- Intent classifier (P0-17): every utterance becomes a generic decision card. No complaint→HR routing, no advance→approval card, no note→living-doc routing.
- Photo attach (P0-11): cleaning supervision IS photo-based.
- Amend mode (P1-35): R6 prototype shows it; no implementation.
- Live-transcription overlay (P2-38).
- AI-paused-until consumer (P2-39): Drawer writes flag; chat doesn't read it.

**Implication:** Sc 26–38 (13 client complaints) all currently fall through chat with no specialized handling.

### Cluster D — "Compliance / proof flow is half-built (photos + reverse + flagged + soft-flag)"

- Photo CDN deferred (#46).
- FlaggedReview buttons disabled (#7).
- Reverse-action modal placeholder (#8).
- Soft-flag silent (#9).
- Activity batch-share single-row only (#31).
- No offline queue (#13).

Result: Sc 4, 26–34 (≈10 scenarios) are entirely WhatsApp-mediated today. The app can RECEIVE flags but cannot CLOSE them.

### Cluster E — "Static surfaces wired; dynamic editors absent"

Read-only screens (Today, Activity feed, Summary, Updates) are polished. Editor surfaces are all empty/stubbed:

- Memory & rules editor (P0-14) — empty card.
- Calendar/roster forward-edit (P1-24) — orphaned backend route.
- Site rules CRUD (P1-19) — no UI.
- Gate-pass / ban list (P1-28) — not in schema yet.
- Advance request approval (P1-33) — no UI.

**Implication:** Supervisor can OBSERVE the day but cannot CONFIGURE the world. This is why founder's instinct says "most features are unusable" — the read surfaces are real, but every CHANGE flow either disappears into a stub modal or routes through chat with no specialised handling.

---

## 5. Confidence summary

- **≥95% confident (verified by grep + R6 + master plan triangulation):** gaps 1, 2, 4, 5, 7, 8, 9, 10, 12, 18, 30, 39, 40, 41. (14 gaps)
- **90–94% confident:** 3, 6, 11, 13, 14, 17, 21, 22, 23, 24, 26, 29, 31, 34, 35, 36, 38, 42, 43, 44, 45, 46. (22 gaps)
- **70–89% confident (needs human verify):** 15 (geofence — may exist in backend, not surfaced in mobile), 16 (push payload — partial wiring), 19 (memory editor — overlaps with 14), 20 (Site state machine — may exist in v3 shared-schema), 25 (mid-month compile — may be admin-web), 27 (festival planner — may be deferred-by-design), 28 (gate-pass/ban-list — may be in admin), 32 (ESIC/PF — may be admin-only), 33 (advance — may be by design WhatsApp-mediated), 37 (birthday — may be deferred), 47 (biometric fallback — may be by design).

**Net:** 36 gaps at ≥90% confidence. 11 gaps need founder verification on whether they're deferred-by-design or genuine misses.

---

## 6. What was NOT audited (out-of-scope flags)

- Worker mobile app (`/apps/mobile/app/(worker)/` does not appear to exist yet; this audit only covers supervisor surfaces).
- Admin web (`/apps/admin-web/`) — separate scope.
- Backend correctness (only checked route existence, not invariants).
- Performance / accessibility.
- Telugu/Hindi string completeness.

---

## 7. Recommended next moves

1. **Build P0-1 Replacement Picker first.** It unblocks 8 downstream gaps. L-complexity but highest leverage.
2. **Wire Decisions queue to absorb leave / swap / complaint / advance / termination.** Matches founder's "all decisions go to Decisions box only" lock.
3. **Add chat intent classifier (P0-17) before any more chat features.** Without it, chat is permanently an LLM passthrough.
4. **Activate the 4 SiteActionSheet buttons.** Cheapest visible-completeness win (M-complexity total).
5. **Then tackle photo-attach + offline queue (Cluster D).** This is where peers (Connecteam, Jobber, Housecall Pro, Jibble, Truein) all measurably beat us on G2 reviews.

---

## 8. Sources

- Master plan: `/Users/thotaakshay/.claude/plans/now-i-think-it-functional-kernighan.md` §G, line 976 (PUBG-style invite lock), line 977 (2-min timer), §G.6 (5-section memory rules), §G.8 (Iteration 5 open questions).
- R6 prototype: `/Users/thotaakshay/eclean_workspace/axhy-v3/docs/prototypes/supervisor-mobile-r6/project/src/` — files `replacement-picker.jsx`, `multi-day-leave-screen.jsx`, `termination-screen.jsx`, `shell.jsx` (Drawer + DecisionCard + AmbiguousDecisionCard + HeavySummaryCard), `chat.jsx` (AMEND banner + live-transcription overlay).
- Chaos scenarios: `/Users/thotaakshay/eclean_workspace/axhy-v3/docs/research/supervisor-30day-scenarios.md` — 70 scenarios cross-referenced.
- Prior audit (too generous): `/Users/thotaakshay/eclean_workspace/axhy-v3/docs/research/supervisor-feature-matrix.md`.
- Web research:
  - [BVG India Facility Management](https://www.bvgindia.com/facility-management-services/)
  - [SIS India FM Solutions](https://sisindia.com/facility-management-solutions/)
  - [Housecall Pro vs Jobber 2026](https://www.housecallpro.com/compare/housecall-pro-jobber/)
  - [Connecteam — Best Time-Tracking Apps for Cleaning](https://connecteam.com/best-time-tracking-cleaning-companies/)
  - [Truein Geofencing Attendance](https://truein.com/geofencing-attendance-system)
  - [GeoSafe Field Tracking (India-built, offline-first)](https://geosafepro.com/blog-detail/field-employee-tracking-app--employee-monitoring-software)
  - [Clappia — GPS + photo attendance](https://www.clappia.com/blog/employee-attendance-system-gps-photo)
- Schema check: `packages/shared-schema/dist/zod/decisions.js` (4-tier enum: NOTE / OPERATIONAL / PERSONNEL / EMPLOYMENT).
- Code-state grep targets: `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/mobile/components/today/SiteActionSheet.tsx`, `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/mobile/components/today/FlaggedReviewSheet.tsx`, `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/mobile/app/(supervisor)/activity.tsx`, `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/mobile/app/(supervisor)/chat.tsx`, `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/mobile/app/(supervisor)/decisions.tsx`, `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/mobile/app/(supervisor)/memory.tsx`, `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/mobile/components/Drawer.tsx`, `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/routes/sites.ts`, `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/routes/leave-requests.ts`, `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/routes/swap-requests.ts`, `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/routes/calendar.ts`, `/Users/thotaakshay/eclean_workspace/axhy-v3/apps/backend/src/routes/chat.ts`.
