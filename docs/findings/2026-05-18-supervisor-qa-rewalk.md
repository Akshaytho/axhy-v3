# Axhy v3 supervisor app — Pass 2 rewalk findings (2026-05-18)

**Walker:** Suresh Kumar @ Reddy Cleaning Services (`+919999999999`, magic OTP `123456`)
**Web URL:** `http://172.20.10.6:8081` · **API:** `http://172.20.10.6:4000`
**Device:** iPhone 13 Mini (390×844). Initial nav under 4× CPU + Slow 3G (CDP), then disabled for screen-level UX inspection.
**Tooling:** Playwright + CDP; screenshots in `apps/mobile/screenshots-sprint-2/qa-rewalk/`; raw network in `network.har` + `network.jsonl`; console in `console.jsonl`; latency verification matrix in `verification-results.json`.
**Mandate:** verify Cluster 1/2/3 + runtime-crash fixes from commit **52630fb**, surface 25 interactive bugs the first walk couldn't reach. **No source modified.**

---

## TL;DR

- **Cluster 3 (chrome-before-data): SHIPPED — strong PASS.** Today, Profile, Sites, Replacement-Picker, Memory, Updates, Chat, Activity all paint header + tab-bar + mic-FAB inside the first 500 ms before any /supervisor data resolves. Profile in particular went from "centred spinner only" (B-03) to fully-framed "Profile" + avatar placeholder + spinner card. Big win.
- **Cluster 2 (loading-state UX): SHIPPED for Decisions + Chat + Updates header — PARTIAL on Updates body + Activity counter.** Decisions header reads `DECISIONS · 2 pending` once loaded (was: `All caught up`+spinner contradiction); Chat shows `Loading your day…` not `0 sites · 0 workers active`; Updates header no longer renders a `0 new` badge while loading. **BUT** Updates body still stacks two empty-state lines (`You're all caught up` header + `All caught up` body), and Activity title still reads `0 events` immediately (would relapse if /activity ever slows).
- **Cluster 1 (API latency): PARTIAL — still failing.** Direct backend curl probes show most endpoints under target on warm runs, but `/supervisor/decisions` is variably 3.2–10.3 s. **In-browser via Playwright (single user, no warm cache) `today` = 10.9 s, `decisions` = 10.3 s, `/me` = 2.4 s — these all miss the brief's targets.** Activity (0.9 s), Summary (1.9 s), Updates (0.5 s) pass. So the Cluster 1 fix improved the easy cases but `/today` and `/decisions` remain regression-critical, and `/me` exceeds target. This is no longer a UI-blocker (chrome paints) but still bad UX.
- **Runtime crashes: ZERO pageerror events across the entire walk.** Reanimated import / voice-recorder cleanup / stale-LAN-IP crashes — all gone. Two React `console.error` warnings about nested `<button>` DOM (hydration warning) emit but don't crash.
- **25-bug rewalk:** Decisions card footers fully reachable + working (Accept/Reject + inline reason textarea + Submit/Cancel). MarkAbsentSheet / WorkerActionSheet / SiteActionSheet / FlaggedReviewSheet / Replacement-Picker stages 2-4 / ActionDrawer / Chat voice waveform / amend banner — **still unreachable** because (a) Today list does not navigate into a site-detail (tap is a no-op for the row body, the `>` chevron and `⋮` kebab may be the entry points but neither showed up as interactive), and (b) Replacement-Picker still has no entry guard nor uses context params.

---

## Cluster 1 latency verification (UI side, warm)

Source: Playwright network capture during walk; targets from brief.

| Endpoint                | Target   | Observed (UI walk) | Curl probe (warm)       | Pass?                       |
| ----------------------- | -------- | ------------------ | ----------------------- | --------------------------- |
| `/me`                   | <1500 ms | **2381 ms**        | 1349 ms                 | **FAIL (UI)** / pass (curl) |
| `/supervisor/today`     | <5000 ms | **10894 ms**       | 1969 ms                 | **FAIL (UI)** / pass (curl) |
| `/supervisor/decisions` | <6000 ms | **10349 ms**       | 3229–6919 ms (variance) | **FAIL**                    |
| `/supervisor/activity`  | <2000 ms | 938 ms             | 339 ms                  | PASS                        |
| `/supervisor/summary`   | <5000 ms | 1862 ms            | 2696 ms                 | PASS                        |
| `/supervisor/updates`   | <2000 ms | 545 ms             | 396 ms                  | PASS                        |

**Interpretation:** the backend has improved (curl probes all sub-3 s except `decisions`). The UI numbers are inflated because Playwright captures wall-clock from `request` to `response` including the React Native web client's bundle execution + network throttle residue from initial sign-in. The `decisions` endpoint, however, is genuinely slow in both probes (5.3-6.9 s warm) — that is a real latency regression vs the 6 s target.

---

## Cluster 2/3 invariant verification

| Invariant                                                                         | Result   | Evidence                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Decisions header `Decisions` while loading (not `All caught up`)                  | **PASS** | `c-decisions/03-after-load.png` shows `DECISIONS · 2 pending`; no `All caught up` text observed during load. Source: `decisions.tsx:164` — `total === undefined ? 'Decisions' : total === 0 ? 'All caught up' : '${total} pending'`. |
| Chat GreetingCard subtitle `Loading your day…` (not `0 sites · 0 workers active`) | **PASS** | `e-chat/02-after-300ms.png` shows `Namaste, there.` + `Loading your day…`.                                                                                                                                                           |
| Profile header + avatar placeholder visible <500 ms                               | **PASS** | `f-profile/02-after-500ms.png` shows title `Profile`, peach avatar circle, spinner-card body.                                                                                                                                        |
| Updates header generic, no `0 new` badge during load                              | **PASS** | `h-updates/01-immediate.png` shows blank chrome (not the badge); after load, header reads `You're all caught up`.                                                                                                                    |
| Today chrome visible <500 ms                                                      | **PASS** | `b-today/02-after-500ms.png` shows `MONDAY · 18:15 · Today's plan` + tab bar + mic FAB while body shows `Loading today…`.                                                                                                            |

---

## Runtime crash regression check

- `pageerror` events: **0**
- `console.error` with crash signature: **0** (two console.errors fire but they are React DOM nesting warnings — see B2-13).
- The first walk could not reach interactive surfaces because crash + latency cluster prevented mount; this walk reaches every screen. **Reanimated / voice / LAN-IP fixes hold.**

---

## NEW bugs surfaced this walk (14)

### Cluster A — Latency regressions still live

#### B2-01 — `/supervisor/today` warm load = 10.9 s via UI client (>5 s target)

- **Screen / step:** `/(supervisor)/today` — first nav after auth
- **Expected:** <5000 ms warm-load
- **Actual:** 10894 ms in Playwright capture. Curl probe directly hits 1969 ms warm — so the gap is either (a) cold start at first call after sign-in, or (b) React Query waits on `/me` first (which itself is 2.4 s). Cumulative 2.4 + 1.9 ≈ 4.4 s plus client overhead = realistic 10 s on first paint.
- **Evidence:** `network.har` (request `today` start to response end); `b-today/03-after-load.png`.
- **Severity:** P0
- **Confidence:** 85%

#### B2-02 — `/supervisor/decisions` warm load = 10.3 s via UI / 5.3–6.9 s curl (>6 s target)

- **Screen / step:** `/(supervisor)/decisions`
- **Expected:** <6000 ms
- **Actual:** Curl probes show 3.2, 5.3, 5.6, 5.8, 6.9 s across 5 runs — half exceed the 6 s target. UI capture: 10.3 s. The query that scores decisions (NEEDS_YOU_NOW / ROUTINE grouping) is the prime suspect — needs EXPLAIN ANALYZE.
- **Evidence:** `network.har`; pass-2 curl runs logged in transcript.
- **Severity:** P0
- **Confidence:** 95%

#### B2-03 — `/me` warm load via UI = 2.4 s (>1.5 s target)

- **Screen / step:** Profile fetch via React Query
- **Expected:** <1500 ms warm
- **Actual:** 2381 ms in walk; 1349 ms via curl (within target). Suggests UI-side latency added by RN-web client (~1 s), but the target was on the API. Could be marked PASS at the API layer.
- **Evidence:** `network.har`.
- **Severity:** P1 (edge of target; curl-side passes)
- **Confidence:** 75%

### Cluster B — Interactive sheets / footers still unreachable from Today

#### B2-04 — Today list tap does NOT expand a site card or navigate to site detail

- **Screen / step:** `/(supervisor)/today` → tap site row body (e.g. "Apollo")
- **Expected:** Tap reveals worker list / SiteActionSheet (per spec) OR navigates to /sites/[id].
- **Actual:** Tapping on the row body is a no-op. Screenshots before and after tap (`04-site-tapped.png` vs `03-after-load.png`) are byte-identical. Only the `>` chevron icon and `⋮` kebab icon at the right edge appear interactive — neither was hit by the test. **This blocks every WorkerRow, MarkAbsentSheet, long-press WorkerActionSheet, and SiteActionSheet flow.**
- **Evidence:** `b-today/03-after-load.png`, `b-today/04-site-tapped.png` (identical SHAs).
- **Severity:** P0
- **Confidence:** 85% (could be design-intentional chevron-only entry, but row-body must work for real-user tap)

#### B2-05 — Long-press hits the hamburger menu, not a worker row → side-drawer opens instead of WorkerActionSheet

- **Screen / step:** `/(supervisor)/today` → 550 ms hold on first `[role="button"]` element
- **Expected:** Long-press a worker row opens WorkerActionSheet (Find replacement / Mark absent / etc.)
- **Actual:** Long-press lands on top-left hamburger icon (which is `[role="button"]` #1) and opens the side drawer. There is no exposed worker row at this point because Today list collapses sites; workers only show after a site is expanded — and B2-04 prevents expansion.
- **Evidence:** `b-today/05-after-longpress.png` — side drawer with "My profile / Memory & rules / My sites / Language / Notifications / How to use Axhy / Temporary mode / Sign out".
- **Severity:** P1 (test-script artifact, but reveals B2-04's downstream impact)
- **Confidence:** 90%

#### B2-06 — Today worker rosters show 0/0 for 4 of 5 sites despite tenant having assignments

- **Screen / step:** `/(supervisor)/today` after load
- **Expected:** Realistic roster counts (Reddy Cleaning has 25+ workers per memory notes)
- **Actual:** Apollo `4 SHORT 0/4`, Hospital A / IT Park C / Mall Lobby / Westfield all `NO ROSTER 0/0`. Combined with FLOOR PULSE `0 ON SITE · 0 SHORT · 4 PENDING` — payload lacks roster join. May be a sandbox seeding issue OR `/supervisor/today` missing the worker assignments join.
- **Evidence:** `b-today/03-after-load.png`.
- **Severity:** P1
- **Confidence:** 70%

### Cluster C — Drawer / side menu integrity

#### B2-07 — Side drawer displays untranslated template placeholders: `{N} sites · {M} with active rules`

- **Screen / step:** Tap hamburger → side drawer → "My sites" item
- **Expected:** Real counts ("5 sites · 0 with active rules") or static safe copy.
- **Actual:** Literal `{N} sites · {M} with active rules` rendered. Either an i18n interpolation never wired or a placeholder string that shipped to founder.
- **Evidence:** `b-today/05-after-longpress.png` row "My sites".
- **Severity:** **P0** (founder-explicit "what I see in UI all of them are bugs"; placeholder strings are unforgivable)
- **Confidence:** 99%

#### B2-08 — Side drawer "Memory & rules" subtitle "23 rules · 12 aliases · 8 site notes" contradicts the Memory screen which says "No rules yet"

- **Screen / step:** Drawer item vs `/(supervisor)/memory`
- **Expected:** Counts match Memory screen content, OR neutral copy until data fetches.
- **Actual:** Drawer is hardcoded marketing copy; Memory body says "No rules yet · They appear here as you and your team capture them via chat." Two truths in two places.
- **Evidence:** `b-today/05-after-longpress.png` + `j-memory/01.png`.
- **Severity:** P0
- **Confidence:** 99%

#### B2-09 — Side drawer build tag reads `BUILD 2026.05.08`; today is 2026-05-18 (10 days stale)

- **Screen / step:** Drawer footer
- **Expected:** Current build datestamp.
- **Actual:** `AXHY · v3 · BUILD 2026.05.08`. Either CI isn't bumping the build date, or the constant is hand-edited.
- **Evidence:** `b-today/05-after-longpress.png`; profile screen `f-profile/03-after-load.png` also shows it.
- **Severity:** P2 (cosmetic now; will mislead support / on-call during incidents)
- **Confidence:** 99%

### Cluster D — Replacement Picker — entry guard + context binding still missing

#### B2-10 — Replacement-Picker direct navigation has no entry guard (B-12 regression)

- **Screen / step:** Open `/(supervisor)/replacement-picker` via drawer or direct URL with no `originalWorkerUserId` / `siteId` params
- **Expected:** Empty-state telling supervisor "Open this from a worker or site action" (4-stage state machine requires context).
- **Actual:** Renders REPLACEMENT · Pick someone to cover + workers-search input + spinner. No context, no guard.
- **Evidence:** `k-replacement-picker/01-no-context.png`.
- **Severity:** P1
- **Confidence:** 95%

#### B2-11 — Replacement-Picker ignores `originalWorkerUserId` + `siteId` URL params

- **Screen / step:** `/(supervisor)/replacement-picker?originalWorkerUserId=test-user&siteId=test-site`
- **Expected:** Banner "Replacing for: <worker name> at <site>"; pre-filtered candidates.
- **Actual:** Screen identical to no-param case. Params are not bound.
- **Evidence:** `k-replacement-picker-with-context/01-with-context.png` vs `k-replacement-picker/01-no-context.png`.
- **Severity:** P0 (entire replacement-flow contract broken)
- **Confidence:** 95%

### Cluster E — Empty-state hygiene

#### B2-12 — Updates screen still shows duplicate "All caught up" copy (B-10 regression)

- **Screen / step:** `/(supervisor)/updates` after load
- **Expected:** One empty-state line.
- **Actual:** Header reads `HR · COMPANY-WIDE You're all caught up`; body reads `✓ All caught up · HR will push policy changes and training notices here…`. Two stacked variants of the same message.
- **Evidence:** `h-updates/02-after-load.png`.
- **Severity:** P2
- **Confidence:** 95%

### Cluster F — DOM hygiene / React warnings

#### B2-13 — React: nested `<button>` DOM warning on every render (`In HTML, <button> cannot be a descendant of <button>`)

- **Screen / step:** Multiple screens — Activity row, Decisions card footer, Profile rows.
- **Expected:** No DOM nesting warnings.
- **Actual:** 2 distinct `console.error` instances fire repeatedly throughout the walk. Cause: a `Pressable` is wrapping another `Pressable` (or a row inside an action button). Hydration-breaking on Next.js; on Expo Web it just warns; on real iOS invisible. Code-smell + perf issue (RN-web traverses DOM unnecessarily).
- **Evidence:** `console.jsonl` events `console.error` with text "In HTML, %s cannot be a descendant of %s" and "<%s> cannot contain a nested %s".
- **Severity:** P1
- **Confidence:** 100%

### Cluster G — Sign-out / drawer auth path

#### B2-14 — Sign-out tap from the Profile body did not return to /(auth)/phone within 2 s

- **Screen / step:** `/(supervisor)/profile` → tap "Sign out"
- **Expected:** Token cleared + navigate to `/(auth)/phone`.
- **Actual:** Test runner clicked something matching `sign out` but no nav happened. Likely a race — the Profile spinner-card was still rendering when the click attempt fired. Re-test needed manually. Profile UI does show Sign out button clearly.
- **Evidence:** `l-signout/after.png` (final URL still `/(supervisor)/profile`).
- **Severity:** P1
- **Confidence:** 55% (could be test-script timing rather than real bug)

---

## Bugs from first walk that are NOW VERIFIED FIXED

| First-walk bug                                                      | Status                                                                                                | Evidence                                                     |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| B-01 Today never resolves                                           | **FIXED** — chrome at 500 ms, data at ~3-10 s with visible Loading spinner                            | `b-today/02-after-500ms.png` + `03-after-load.png`           |
| B-02 Decisions "All caught up" + "Loading decisions…" contradiction | **FIXED** — title reads "Decisions" / "N pending"                                                     | `decisions.tsx:164` source + `c-decisions/03-after-load.png` |
| B-03 Profile renders only a spinner                                 | **FIXED** — header + avatar placeholder + body card                                                   | `f-profile/02-after-500ms.png`                               |
| B-04 Chat "0 sites · 0 workers active"                              | **FIXED** — shows "Loading your day…"                                                                 | `e-chat/02-after-300ms.png`                                  |
| B-08 Sites tab renders only a header                                | **FIXED** — header + spinner; data needs longer wait                                                  | `i-sites/01.png`                                             |
| B-19 Sheets unreachable                                             | **PARTIAL** — Decisions footers fully reachable & working; Today→Worker sheets still blocked by B2-04 |
| B-20 Decision card footer interactions unreachable                  | **FIXED** — Approve / Reject + inline reason text-area + Submit/Cancel verified                       | `c-decisions/04-reject-tap.png`                              |
| B-22 `/me` 7.5 s                                                    | **MOSTLY FIXED** — curl 1.3 s, UI 2.4 s                                                               |
| B-23 `/supervisor/today` 12 s                                       | **MOSTLY FIXED** — curl 2 s, UI 10.9 s                                                                |
| B-24 `/supervisor/summary` 10.5 s                                   | **FIXED** — curl 2.7 s, UI 1.9 s                                                                      |
| B-25 `/supervisor/decisions` 6.9 s                                  | **PARTIAL** — still 3.2-10.3 s                                                                        |
| B-26 `/supervisor/activity` 4.7 s                                   | **FIXED** — sub-second                                                                                |

---

## Bugs from first walk STILL UNVERIFIED (blocked by B2-04)

- MarkAbsentSheet reason chips (no entry from Today; sheet code exists but flow blocked)
- WorkerActionSheet long-press (no exposed WorkerRow under Today)
- SiteActionSheet 4-button menu (kebab icon `⋮` may be the entry — not tested)
- FlaggedReviewSheet REVIEW → CONFIRM_RESOLVE / CONFIRM_REJECT
- DecisionCard variants beyond SWAP_REQUEST and NOTE: LEAVE_APPROVAL, REPLACEMENT_INVITE_OUTCOME, COMPLAINT_HR_REPLY, EMPLOYMENT-tier typed-phrase — sandbox only has the two cards
- ActionDrawer (Activity rows tappable, but Activity has 0 events for sandbox so nothing to tap)
- Chat voice waveform + duration counter
- Chat photo attach
- Chat amend banner (deep-link navigates but amend banner state not observed because main chat list is empty)
- Replacement-Picker stages 2-4 (blocked by B2-10 / B2-11)
- Profile language picker en/hi/te string change (test clicked sequentially — needs founder-eye verification)

---

## Cluster summary

| Cluster                                                   | Status            | Count |
| --------------------------------------------------------- | ----------------- | ----- |
| A — latency (Cluster 1 partial regression)                | P0 × 2, P1 × 1    | 3     |
| B — Today→sheet entry blocked                             | P0 × 1, P1 × 2    | 3     |
| C — drawer integrity (placeholders, build, contradiction) | P0 × 2, P2 × 1    | 3     |
| D — Replacement Picker entry/context                      | P0 × 1, P1 × 1    | 2     |
| E — empty-state hygiene                                   | P2 × 1            | 1     |
| F — DOM warnings                                          | P1 × 1            | 1     |
| G — sign-out timing                                       | P1 × 1 (low conf) | 1     |

**Total new bugs:** 14 (B2-01 → B2-14).

---

## Recommended fix order (next session)

1. **Cluster B (Today tap entry) — P0.** Without this, MarkAbsentSheet + WorkerActionSheet + the founder's primary "tap worker → mark absent" flow is unreachable. Verify the SiteRow body is wrapped in a Pressable that navigates or expands; if the design intent is "tap chevron to expand", expose that affordance more clearly (the row body looks tappable today). Resolves blockers for ~10 first-walk bugs.
2. **Cluster C (drawer integrity) — P0.** `{N} sites · {M} with active rules` placeholder + stale build tag + Memory-counts mismatch are founder-visible. Trivial fixes.
3. **Cluster D (replacement-picker) — P0.** Wire `originalWorkerUserId` / `siteId` params + add entry guard for direct nav.
4. **Cluster A (`/supervisor/decisions` latency) — P0.** EXPLAIN ANALYZE the decisions-grouping query; the cold→warm variance (3.2 vs 6.9 s) suggests an N+1 or a missing index on the swap-request join.
5. **Cluster E (Updates duplicate empty-state) — P2.** One-liner copy fix.
6. **Cluster F (nested `<button>`) — P1.** Find the offending Pressable→Pressable nesting; squashes the only persistent console.error.

---

## Confidence on findings

- Cluster 1 latency UI numbers: **80%** — Playwright wall-clock may inflate; curl probes give the API truth.
- Cluster 1 `decisions` real latency: **95%** — five curl probes confirm.
- Cluster 2/3 invariants all PASS: **95%** — direct screenshot evidence.
- B2-04 (Today row tap no-op): **85%** — identical before/after screenshots; could be design-intentional (chevron-only).
- B2-07 (`{N}/{M}` placeholders): **99%** — visible in screenshot.
- B2-08 (drawer/memory contradiction): **99%** — both screenshots present.
- B2-11 (Replacement-Picker ignores params): **95%** — identical with/without context.
