# Axhy v3 supervisor app — QA walk findings (2026-05-18)

**Walker:** First-human-user pass as Suresh Kumar @ Reddy Cleaning Services
(`+919999999999`, magic OTP `123456`).
**Web URL:** `http://172.20.10.6:8081` (Expo web build)
**API URL:** `http://172.20.10.6:4000` (Fastify backend, Railway-DB-connected)
**Throttle:** iPhone 13 Mini viewport (390×844), 4× CPU + 200 kbps + 200 ms RTT on walkthrough run; un-throttled on diagnostic run.
**Tools:** Playwright + CDP; screenshots + console events + per-request latency + DOM-text snapshots.
**Mandate:** Find bugs only. **No source code modified.** Fixes happen in a separate session.

## Evidence locations

- Walkthrough screenshots: `apps/mobile/screenshots-sprint-2/qa-walkthrough/<step>/<name>.png`
- Network log: `apps/mobile/screenshots-sprint-2/qa-walkthrough/network.jsonl` + `network.har`
- Console log: `apps/mobile/screenshots-sprint-2/qa-walkthrough/console.jsonl`
- Un-throttled diagnostic (6s wait per route): `apps/mobile/screenshots-sprint-2/qa-walkthrough/diagnose/`
- Walkthrough script: `apps/mobile/scripts/qa-walkthrough-supervisor.ts`
- Diagnostic script: `apps/mobile/scripts/qa-diagnose-rendering.ts`

## Headline

The supervisor app does mount and render — but **every data-dependent screen is gated on slow API calls (5–12 s) and most stick on "Loading…" indefinitely.** Two screens (Decisions, Profile) have UI-state contradictions: Decisions shows "All caught up" in the header WHILE rendering "Loading decisions…" body; Profile renders only a centred spinner with no header, no form, no content.

The **founder is right**: every screen shows something wrong on first look. None of these are cosmetic — they all fail the "5-minute normal-use" test.

## Network reality check (probed directly with valid SUPERVISOR JWT)

| Endpoint                    | Status | Latency    | Note                                                                                |
| --------------------------- | ------ | ---------- | ----------------------------------------------------------------------------------- |
| `GET /supervisor/today`     | 200    | **12.0 s** | Returns 4 sites for Reddy. 12 s is unusable.                                        |
| `GET /supervisor/decisions` | 200    | **6.9 s**  | Returns 1 swap-request decision in NEEDS_YOU_NOW. Slow but works.                   |
| `GET /supervisor/activity`  | 200    | **4.7 s**  | `{ rows: [] }` — no events for Reddy.                                               |
| `GET /supervisor/summary`   | 200    | **10.5 s** | Returns counts.                                                                     |
| `GET /supervisor/updates`   | 200    | **1.6 s**  | OK.                                                                                 |
| `GET /me`                   | 200    | **7.5 s**  | Returns user + activeCompany. 7.5 s for a single-row lookup.                        |
| `GET /supervisor/sites`     | 404    | 5 ms       | **Mobile does NOT call this.** It hits `/supervisor/today` for sites. (Probe only.) |
| `GET /supervisor/memory`    | 404    | 4 ms       | Mobile does not call this either; Memory screen renders rule list locally.          |
| `GET /supervisor/profile`   | 404    | 3 ms       | Mobile uses `/me`. (Probe only.)                                                    |

Cold-start P50 across the 5 supervisor endpoints = **6.7 s.** P95 = **12 s.** This is the dominant UX failure.

## Clusters (root-cause-first)

### Cluster 1 — API cold-start is 5–12 s (root cause: unknown — Railway Postgres pool? cold lambda? unindexed query?). Every Loading… screen below traces back here.

### Cluster 2 — Loading-state UX is naïve (no skeleton, no retry, no timeout, no contradiction-guard). The screens trust the API to resolve, so when it takes 12 s they look broken. Several screens render BOTH the empty-state header ("All caught up") AND the loading body simultaneously, because the title is derived from a different state slice than the body.

### Cluster 3 — Screens that genuinely have NO chrome until data arrives (Profile, Memory, Sites). Even header + back button are gated on the same query. Should always render the static frame first.

### Cluster 4 — Auth flow on web does work end-to-end via direct backend, but the Playwright text-search for "Get OTP" failed in the throttled run (the button wasn't found in time). Suggests the phone screen renders late and any user clicking at <2 s on real 3G might miss it.

### Cluster 5 — Console hygiene: every screen reload spams 5 warnings:

- `"shadow*" style props are deprecated. Use "boxShadow"` (RN-web migration)
- `props.pointerEvents is deprecated. Use style.pointerEvents`
- `useNativeDriver is not supported because native animated module is missing` (RN-web platform mismatch)
- `OneSignal initialize skipped` (expected, but logged at WARN not INFO)
- Every navigation re-emits `"Running application main"` — Metro dev web target re-executes the bundle per route, obscuring real perf signals during QA.

## Bugs

### B-01 — Today tab: "Loading today…" never resolves within reasonable time

- **Screen**: `/(supervisor)/today`
- **Steps**: 1. Sign in as Suresh. 2. Land on Today.
- **Expected**: Site cards (4 sites for Reddy) render within 2 s.
- **Actual**: Spinner + "Loading today…" still visible at 6 s. Direct probe shows the API takes **12 s**. Once-warm follow-up calls are still 2 s.
- **Evidence**: `qa-walkthrough/diagnose/__supervisor__today.png` (spinner only); `network.jsonl` shows `/supervisor/today` aborted on every nav transition.
- **Severity**: P0
- **Confidence**: 95%

### B-02 — Decisions tab shows contradictory state: title "All caught up" but body "Loading decisions…"

- **Screen**: `/(supervisor)/decisions`
- **Steps**: 1. Tap Decisions tab. 2. Wait 6 s.
- **Expected**: Title reflects loading state (e.g. "Decisions" or "Checking…"), or title is hidden until data arrives.
- **Actual**: Header shows `DECISIONS · All caught up` while body shows spinner + "Loading decisions…". This is a fully visible logic contradiction — empty-state title is rendered against a not-yet-empty state.
- **Evidence**: `qa-walkthrough/diagnose/__supervisor__decisions.png`.
- **Severity**: P0 (founder explicitly cited "what I see in UI all of them are bugs")
- **Confidence**: 98%

### B-03 — Profile tab renders only a centred spinner; no header, no form, no menu

- **Screen**: `/(supervisor)/profile`
- **Steps**: 1. Tap Profile. 2. Wait 6 s.
- **Expected**: Title "Profile", user name, phone, language picker, sign-out — at minimum the static frame.
- **Actual**: Just the tab bar and a spinner. `document.body.innerText` slice is literally only the 5 tab labels.
- **Evidence**: `qa-walkthrough/diagnose/__supervisor__profile.png`; DOM text snapshot.
- **Severity**: P0
- **Confidence**: 98%

### B-04 — Chat tab shows "0 sites · 0 workers active" despite tenant having 4 sites

- **Screen**: `/(supervisor)/chat`
- **Steps**: 1. Tap Chat.
- **Expected**: Site/worker counts reflect `/supervisor/today` data (4 sites).
- **Actual**: "Namaste, there. 0 sites · 0 workers active" rendered as the header. The Chat header reads its own counts from a query that hasn't resolved yet — empty-state shown as truth.
- **Evidence**: `qa-walkthrough/diagnose/__supervisor__chat.png`.
- **Severity**: P0 (the founder will read this as "the app thinks I have no business").
- **Confidence**: 95%

### B-05 — Supervisor APIs P50 = 6.7 s, P95 = 12 s on warm Railway DB

- **Screen**: all data-fetching screens
- **Steps**: 1. Hit each `/supervisor/*` endpoint with `curl` + valid JWT (warm DB).
- **Expected**: <500 ms.
- **Actual**: today 12 s, summary 10.5 s, /me 7.5 s, decisions 6.9 s, activity 4.7 s. updates 1.6 s is the only "fine" one.
- **Evidence**: see "Network reality check" table above.
- **Severity**: P0 (cluster 1 root cause for every Loading… screen).
- **Confidence**: 99%

### B-06 — Site/worker counts shown in Chat header are read BEFORE the supervisor-context query resolves

- **Screen**: `/(supervisor)/chat`
- **Steps**: see B-04.
- **Expected**: Header should be hidden, skeletoned, or show "—" / "loading" until data arrives.
- **Actual**: Shows definite "0 sites · 0 workers active" — looks like a confirmed fact.
- **Evidence**: same as B-04.
- **Severity**: P1 (subset of B-04 root cause)
- **Confidence**: 90%

### B-07 — Activity tab shows "0 events" before fetch resolves; chips are tappable but list state doesn't reflect filter activity

- **Screen**: `/(supervisor)/activity`
- **Steps**: 1. Tap Activity. 2. Tap "Yesterday" chip.
- **Expected**: Skeleton during fetch; chip state visible (selected pill).
- **Actual**: Counter says "0 events" immediately even though API hasn't returned yet.
- **Evidence**: DOM text snapshot: `ACTIVITY · PROOF 0 events Today Yesterday This week All sites All actions`.
- **Severity**: P1
- **Confidence**: 80%

### B-08 — Sites tab renders ONLY a header "MY SITES Sites" then nothing

- **Screen**: `/(supervisor)/sites`
- **Steps**: 1. Open Sites from drawer.
- **Expected**: List of 4 Reddy sites (Apollo, etc. — confirmed via `/supervisor/today`).
- **Actual**: Just the header. No skeleton, no empty-state copy, no list.
- **Evidence**: DOM text: `MY SITES Sites     Today Decisions ...`.
- **Severity**: P0
- **Confidence**: 90%

### B-09 — Memory & Rules screen empty-state copy renders BEFORE data fetch (no skeleton)

- **Screen**: `/(supervisor)/memory`
- **Steps**: 1. Open Memory.
- **Expected**: Loading state, then real rules OR empty state.
- **Actual**: "MEMORY & RULES — Site rules — No rules yet — They appear here as you and your…" rendered immediately, indistinguishable from a truthful empty state.
- **Evidence**: DOM text.
- **Severity**: P1
- **Confidence**: 80%

### B-10 — Updates screen shows duplicate "All caught up" copy ("You're all caught up" + "✓ All caught up")

- **Screen**: `/(supervisor)/updates`
- **Steps**: 1. Open Updates.
- **Expected**: One empty-state line.
- **Actual**: DOM text: `HR · COMPANY-WIDE You're all caught up ✓ All caught up HR will push policy…`. Two stacked empty states.
- **Evidence**: DOM text snapshot.
- **Severity**: P2
- **Confidence**: 85%

### B-11 — Summary screen sticks on "Loading summary…"

- **Screen**: `/(supervisor)/summary`
- **Steps**: 1. Open Summary.
- **Expected**: Render summary inside 2 s.
- **Actual**: Header "END OF DAY · Today's summary" then "Loading summary…". API takes 10.5 s.
- **Evidence**: DOM text.
- **Severity**: P0
- **Confidence**: 95%

### B-12 — Replacement-picker has no entry-state UX; lands with an input field and 2 buttons but no instructions

- **Screen**: `/(supervisor)/replacement-picker`
- **Steps**: 1. Navigate to `/(supervisor)/replacement-picker` directly (no source-of-call params).
- **Expected**: Error/empty state — "Open this from a worker or site action" — because the 4-stage state machine requires context.
- **Actual**: "REPLACEMENT Pick someone to cover" + an input + 2 buttons. A supervisor opening from the drawer would see a half-working form with no context.
- **Evidence**: DOM text.
- **Severity**: P1
- **Confidence**: 80%

### B-13 — On the throttled walkthrough, the "Get OTP" button was not findable by the test runner within 5 s — implies the phone screen paints late

- **Screen**: `/(auth)/phone`
- **Steps**: 1. Open root URL on 4× CPU + Slow 3G. 2. Try to click the Get OTP CTA within 5 s.
- **Expected**: Button rendered + tappable by ≤2 s on a "low-end Android, 3G" simulation.
- **Actual**: Bot couldn't find the input or button under throttle (it found 1 input in the un-throttled run only). Likely TTI > 3 s on first paint.
- **Evidence**: `console.jsonl` — no `[BUG]` log for un-throttled `/(auth)/phone` (input + Get OTP visible). Throttled run failed to find input.
- **Severity**: P1 (workers/supervisors on real Indian 3G will see this)
- **Confidence**: 75%

### B-14 — Bundle re-executes on every route navigation (Metro web, dev mode)

- **Screen**: every route
- **Steps**: 1. Watch console while navigating between tabs.
- **Expected**: Single bundle execution; subsequent route changes are client-side only.
- **Actual**: Every nav emits a fresh `Running application "main" with appParams: {rootTag: #root, hydrate: undefined}` log line + re-runs all 5 startup warnings. This is the Metro dev server behavior (full reload on each route) — fine for dev, but it makes the QA walk feel like every screen is a cold start.
- **Evidence**: `console.jsonl`. 11 distinct screens × 5 warnings = 55 console events.
- **Severity**: P2 (dev-only artifact; will not happen on the production iOS app — but obscures real perf issues during QA)
- **Confidence**: 85%

### B-15 — Console: deprecated `shadow*` style props emitted on every render

- **Screen**: every screen using shadows (cards, sheets)
- **Steps**: see B-14.
- **Expected**: Use `boxShadow` for RN-web compatibility.
- **Actual**: `"shadow*" style props are deprecated. Use "boxShadow"` warning on every render.
- **Evidence**: console.jsonl.
- **Severity**: P2
- **Confidence**: 100%

### B-16 — Console: deprecated `props.pointerEvents` emitted on every render

- **Screen**: same
- **Expected**: Use `style.pointerEvents`.
- **Actual**: Warning fires on every render.
- **Severity**: P2
- **Confidence**: 100%

### B-17 — Console: `useNativeDriver` warning on every animated component

- **Screen**: every animated screen
- **Steps**: 1. Navigate to any screen with the spinner or transitions.
- **Expected**: web target should set `useNativeDriver: false` OR conditional.
- **Actual**: `Animated: useNativeDriver is not supported because the native animated module is missing` warning. Animations fall back to JS-thread — explains some jank.
- **Severity**: P1 (jank impacts perceived quality)
- **Confidence**: 90%

### B-18 — Console: `[identity-lifecycle] OneSignal initialize skipped` logged at WARN level on every nav

- **Screen**: every screen
- **Expected**: Logged at INFO or DEBUG; OneSignal-skip on web is the design.
- **Actual**: emitted as warning.
- **Severity**: P2
- **Confidence**: 100%

### B-19 — Long-press / sheet interactions (MarkAbsentSheet, WorkerActionSheet, SiteActionSheet) cannot be reached because Today never resolves

- **Screen**: `/(supervisor)/today`
- **Steps**: 1. Wait for Today to load. 2. Long-press a worker row.
- **Expected**: Sheet opens.
- **Actual**: Step 1 never completes. **The entire site-card → worker-row → sheet flow is blocked by B-01/B-05.** This was the supervisor's primary action surface per the spec. Cannot QA it.
- **Evidence**: derived.
- **Severity**: P0 (blocks the spec's primary user flow)
- **Confidence**: 90%

### B-20 — Decisions card footer interactions (Approve/Reject/typed-phrase OVERRIDE, "Send to someone else", 5-word ACK) cannot be reached because Decisions never resolves visibly within 6 s

- **Screen**: `/(supervisor)/decisions`
- **Steps**: 1. Wait for Decisions. 2. Tap a card. 3. Use footer button.
- **Expected**: Footer is interactive.
- **Actual**: Same as B-19 — backend confirms 1 swap-request decision exists but the UI doesn't surface it in usable time. Cannot QA.
- **Severity**: P0
- **Confidence**: 85%

### B-21 — Chat send → no visible AI response within 3 s after typing "mark Suresh absent"

- **Screen**: `/(supervisor)/chat`
- **Steps**: 1. Type "mark Suresh absent". 2. Press Enter / tap Send.
- **Expected**: Loading bubble appears immediately; AI response within ~5 s.
- **Actual**: walkthrough run captured no visible new message bubble after 3 s wait. (Could be the Send button wasn't found OR the AI endpoint also has the same 5–12 s latency cluster.)
- **Evidence**: `qa-walkthrough/07-chat/typed.png` and `after-send.png`.
- **Severity**: P1 (cannot disambiguate from B-05 without more time)
- **Confidence**: 60%

### B-22 — `/me` takes 7.5 s — single-row user lookup on a small tenant

- **Screen**: every screen that calls `/me` (Profile, Chat)
- **Steps**: 1. `curl /me` with JWT.
- **Expected**: <300 ms.
- **Actual**: 7.5 s on warm DB.
- **Evidence**: direct probe.
- **Severity**: P0 (root cause for B-03 and B-04)
- **Confidence**: 99%

### B-23 — `/supervisor/today` takes 12 s — site list + worker counts query

- **Screen**: Today, Chat header (sites/workers counts)
- **Steps**: 1. `curl /supervisor/today` with JWT.
- **Expected**: <500 ms.
- **Actual**: 12 s.
- **Severity**: P0 (root cause for B-01, B-04, B-08, B-19)
- **Confidence**: 99%

### B-24 — `/supervisor/summary` takes 10.5 s

- **Screen**: Summary
- **Severity**: P0
- **Confidence**: 99%

### B-25 — `/supervisor/decisions` takes 6.9 s

- **Screen**: Decisions
- **Severity**: P0 (root cause for B-02, B-20)
- **Confidence**: 99%

### B-26 — `/supervisor/activity` takes 4.7 s

- **Screen**: Activity
- **Severity**: P1
- **Confidence**: 99%

### B-27 — Tabs render but each tab change appears to re-execute the full app bundle (Expo web dev artifact); on production iOS the SAME UX issues will appear if route-level data fetching has no cache hydration

- **Screen**: all
- **Steps**: 1. Switch tabs.
- **Expected**: Cached data shown immediately, then revalidated.
- **Actual**: Each tab shows "Loading…" again every visit — implies React Query staleTime is too short OR cache is being cleared on navigation.
- **Severity**: P1
- **Confidence**: 70% (could not isolate cache behaviour with the time available)

### B-28 — No `pageerror` events anywhere — the app does not crash, it just hangs on loading

- **Screen**: all
- **Steps**: 1. Walk every screen.
- **Expected**: Errors trigger fallback UI.
- **Actual**: 0 page errors, 0 console errors, but multiple screens visibly broken — the failure mode is silent. There is no telemetry signal a real user could send the founder.
- **Severity**: P1 (Sentry won't catch any of these)
- **Confidence**: 100%

## Bugs the walkthrough could not reach (gated by B-01/B-05)

The following interactions were in scope but unreachable because the primary screens never finish loading inside the test window:

- UrgencyBanner taps on Today
- Site card expansion → worker rows
- WorkerRow tap → MarkAbsentSheet → reason chips → cancel
- Long-press WorkerRow → WorkerActionSheet → every option
- SiteActionSheet → Mark priority / Add rule / Send replacement / Open in maps
- FlaggedReviewSheet → Resolve + Reject
- DecisionCard footer kinds: LEAVE_APPROVAL_PENDING, SWAP_REQUEST_PENDING (incl. typed-phrase OVERRIDE), REPLACEMENT_INVITE_OUTCOME, COMPLAINT_HR_REPLY, EMPLOYMENT-tier typed-phrase
- Decisions deep-link `?focus=<id>` → scroll + flash highlight (visited but card never appeared)
- ActionDrawer in Activity → Share to WhatsApp / Reverse (30 min) / Reverse (>30 min soft-flag)
- Chat voice button → hold-to-record → release → waveform + transcript
- Chat photo attach → upload + send
- Chat `?amendDecisionId=<id>` banner (visited but main chat hadn't rendered enough to evaluate amend banner state)
- Profile language picker en/hi/te (Profile never rendered)
- Profile notification prefs 3 toggles
- Profile sign-out → return to `/(auth)/phone`
- Drawer left-edge swipe + every drawer entry (Sites visible as empty header; rest unverified)
- Replacement-picker 4-stage state machine end-to-end (only stage 1 visible, and even that has no entry-state UX — see B-12)

**Estimated unblock time:** Cluster 1 (API latency) is the gate. Once `/supervisor/*` and `/me` are sub-second, every sheet/footer/interaction above becomes QA-able in a follow-up run.

## Recommended fix order

1. **Cluster 1 (API latency)** — investigate WHY `/supervisor/today` is 12 s and `/me` is 7.5 s. Likely candidates:
   - Railway Postgres cold-pool reconnect on every request (no PgBouncer / pool sizing wrong)
   - Unindexed query in `supervisor-today.ts` (joins across Assignment + Worker + Visit + Site)
   - Backend cold-start (Railway service idle-spin-down)
   - Run `EXPLAIN ANALYZE` on the today/decisions/summary queries
2. **Cluster 2 (Loading-state UX)** — fix the three contradiction bugs (B-02, B-10) by gating empty-state title on `data !== undefined`, not on `data?.rows?.length === 0`.
3. **Cluster 3 (Frame-then-data)** — Profile + Memory + Sites should render header + chrome BEFORE the data query fires.
4. **Cluster 4 (Chat header truth)** — show "—" or skeleton for sites/workers count until `/supervisor/context` resolves. Fixes B-04 + B-06.
5. **Cluster 5 (Console hygiene)** — migrate `shadow*` → `boxShadow`, `props.pointerEvents` → `style.pointerEvents`, conditional `useNativeDriver` on web. Quick wins; clears the noise so real warnings surface.
6. **Replacement-picker entry guard** — block direct nav without context params (B-12).

## Confidence on findings

- API latency findings (B-05, B-22, B-23, B-24, B-25, B-26): **99%** — directly probed.
- UI contradictions (B-02, B-10): **95%** — visible in screenshots.
- "Profile is empty" (B-03): **98%** — DOM text snapshot confirms.
- Chat header lies (B-04): **95%** — DOM text + tenant data confirms.
- Throttled phone screen issue (B-13): **75%** — could be test-script race rather than real bug.
- Bundle re-execute on web (B-14): **85%** — dev-only artifact, may not affect prod.
- Cluster 4 cache theory (B-27): **70%** — not isolated.
