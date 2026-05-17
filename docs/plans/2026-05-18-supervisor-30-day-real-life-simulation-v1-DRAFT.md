# 30-Day Real-Life Supervisor Simulation — Plan

**Date:** 2026-05-18
**Author:** Claude (Opus 4.7, 1M ctx) under founder direction
**Status:** DRAFT — awaiting founder approval before any code change
**Master plan §:** §G (supervisor surface) + §H (open questions)
**Composes with locks:**

- `feedback_40_year_team_world_domination_quality_bar.md` (2026-05-18)
- `feedback_testing_method_devtools_railway_logs.md` (2026-05-18)
- `feedback_play_store_quality_no_lag_no_jank.md` (2026-05-18)
- `feedback_no_self_service_resign_or_terminate.md` (2026-05-18)
- `feedback_make_it_exist_dont_defer.md`
- `feedback_production_grade_workflow_rules.md` (P1–P10)
- `feedback_confidence_score_before_acting.md` (≥90% own / ≥95% research)

---

## 1. Goal (the founder's words)

> "run a real time company for 30 days with supervisor app, use all features, click them, deal with problems normal flows cases edge cases negative flows, think like a real supervisor, search them in google, see commentaries, behave like a supervisor, use all features, if any feature is incomplete complete them, if you see any screen is empty add different kinds of things so problems pop up. because i feel most features are incomplete and unusable."

Translation: end the simulation with **zero "coming soon" placeholders, zero no-op buttons, zero empty screens, zero missing workflows** that a real Hyderabad supervisor would hit in a typical 30-day month. Every feature exists, is wired, and survives the chaos.

## 2. Inputs

- `docs/research/supervisor-30day-scenarios.md` — 70 numbered scenarios across A-I categories + Day 1-30 chaos calendar. Suresh, 38 workers, 10 sites in west Hyderabad.
- `docs/research/supervisor-feature-matrix.md` — 28 WORKS / 2 caveats / 1 EMPTY / 3 MISSING out of 34 surfaces.

## 3. Cross-reference (chaos × gaps)

The scenarios slam into these features. Anything not marked WORKS will fail the sim.

| Scenario family                | App feature                             | Audit status                   | Action                          |
| ------------------------------ | --------------------------------------- | ------------------------------ | ------------------------------- |
| #1–15 attendance no-shows      | Today → MarkAbsentSheet                 | WORKS                          | smoke only                      |
| #16–25 leave                   | **Leave Request approve/reject screen** | **MISSING**                    | **BUILD**                       |
| #26–38 client complaints       | **Complaint filing screen**             | **MISSING**                    | **BUILD**                       |
| #26, #27, #33 flagged photos   | FlaggedReviewSheet → Resolve/Reject     | DISABLED                       | **WIRE**                        |
| #39–46 swap requests           | **Swap Request decision screen**        | **MISSING**                    | **BUILD**                       |
| #47, #55 wage advances         | **Advance Request screen**              | not in audit (probably absent) | **AUDIT + BUILD if missing**    |
| #56, #59, #62 site events      | SiteActionSheet (4 buttons)             | STUBBED no-ops                 | **WIRE**                        |
| #63–70 crisis                  | **Crisis / SOS escalation flow**        | not in audit                   | **AUDIT + BUILD if missing**    |
| #72, #73 offline + photo retry | Offline queue                           | not in audit                   | **AUDIT** (may defer to Wave 8) |
| #76 GPS spoof                  | Velocity / geofence check               | not in audit                   | **AUDIT** (may defer)           |
| #78–84 weekly rhythm           | Summary + Updates                       | WORKS                          | smoke only                      |
| reverse mistaken absence       | Activity → Reverse button               | placeholder modal              | **WIRE**                        |
| chat voice                     | VoiceWaveformPill duration              | hardcoded `0:00`               | **FIX**                         |

## 4. Plan — six waves, two parallel tracks

### Wave A (parallel) — build the three missing supervisor screens

Each is a new screen + a new lib/queries hook + minimal R6-faithful UI. Backend routes already exist (per audit). 40-year-team quality bar: pagination, error states, empty states, Hindi/Telugu labels via `useLocaleStrings`, FlatList, React.memo on rows, staleTime tuned.

- **A.1 Leave Requests** — `(supervisor)/leave-requests.tsx` + `use-leave-requests.ts`
  - GET `/leave-requests?status=pending` → list (worker name, dates, reason, days)
  - Tap row → bottom sheet with Approve / Reject (typed-phrase confirmation for Reject)
  - POST `/leave-requests/:id/approve` and `/reject`
  - Empty: "No leave requests pending"
  - Drawer entry under supervisor menu
- **A.2 Swap Requests** — `(supervisor)/swap-requests.tsx` + `use-swap-requests.ts`
  - GET `/swap-requests?status=pending` → list (from-worker → to-worker, site, date, reason)
  - Tap row → bottom sheet with Accept / Reject, plus skill-mismatch warning per scenario #44 + master-plan lock (one-button "assign anyway")
  - POST `/swap-requests/:id/decide` with `{ decision: 'approve' | 'reject' | 'approve_anyway' }`
  - Empty + error states
- **A.3 Complaint Filing** — `(supervisor)/complaints/new.tsx` + `use-create-complaint.ts`
  - POST `/sites/:id/complaints` (route exists per server.ts:15)
  - Form: site picker (from bound sites), severity (LOW/MEDIUM/HIGH), category (photo-mismatch / missed area / attitude / theft / hygiene / noise / damage), free-text description, optional photo upload
  - Surface "+ File complaint" from Today header + from Activity feed empty state

### Wave B (parallel) — wire the no-op / placeholder buttons

- **B.1 SiteActionSheet 4 buttons** — `components/today/SiteActionSheet.tsx`
  - "Mark as priority" → POST `/sites/:id/priority` (NEW backend route, simple boolean toggle on Site)
  - "Add site rule" → navigate to `/sites/:id/rules/new` (NEW screen, NEW route)
  - "Send replacement" → opens worker-picker sheet → POST `/assignments` (route exists) to create one-day replacement assignment
  - "Open in maps" → `Linking.openURL('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(site.address))` — no backend, pure deeplink
- **B.2 FlaggedReviewSheet Resolve/Reject** — `components/today/FlaggedReviewSheet.tsx`
  - Wire to `POST /visits/:id/resolve` and `POST /visits/:id/reject` (likely already in backend — verify; if not, add)
  - Type-phrase confirm for Reject (consistent with Decisions EMPLOYMENT-tier pattern)
- **B.3 Activity Reverse button** — `app/(supervisor)/activity.tsx`
  - Within 30-min window → POST `/activity/:id/reverse` (NEW route; backend creates a compensating AuditEvent + undoes the underlying state change for the supported kinds: WORKER_MARKED_ABSENT, LEAVE_APPROVED, ASSIGNMENT_CREATED)
  - Beyond 30 min (greyed) → tap shows sheet "Window closed — soft-flag for HR" → POST `/activity/:id/soft-flag` (NEW route, creates an HR-visible decision card)
- **B.4 Chat voice duration** — `app/(supervisor)/chat.tsx`
  - Wire `VoiceWaveformPill duration` to actual recording metadata from `useVoiceRecorder()` state. Already captured per the audit; just thread it through.
  - Wire `TranscriptionMeta` confidence from real Whisper response (Whisper returns avg_logprob → bucket into HIGH/MED/LOW).

### Wave C — gap audits

Two scenarios (#47 advance, #63 crisis) don't map to a known feature in the audit. Verify:

- **C.1 Advance request audit** — grep mobile + backend for `advance` / `Advance` / `advancePaise`. Likely absent. If absent: build minimal `(supervisor)/advances.tsx` + `POST /advances/request` (worker, amount, reason).
- **C.2 Crisis / SOS escalation audit** — grep for `escalat` / `crisis` / `SOS` / `assault` / `emergency`. Likely absent. If absent, build a single high-visibility "Escalate to HR + Owner" surface accessible from any worker row long-press, posting `POST /escalations` (NEW route, creates a high-priority AuditEvent + WhatsApp deeplink to ops manager + lawyer panel contact card).

### Wave D — seed script

`apps/backend/prisma/seed-30-day-sim.ts` — runs against axhy-sandbox tenant on Railway. Idempotent: drops and re-creates the sim's Suresh + 38 workers + 10 sites + a 30-day event stream that fires the scenarios in the calendar's order.

Source-of-truth mapping: every scenario in the 30-day chaos calendar → 1–N rows in the relevant tables (Visit, AuditEvent, LeaveRequest, SwapRequest, SiteComplaint, etc.) with deterministic timestamps anchored to a chosen "Day 1 = 2026-05-19 Monday" base.

Output: a single transactional Prisma upsert chain, takes <60s on Railway. Reusable: re-run resets the sandbox to Day 0 of the sim.

### Wave E — DevTools + Railway-logs walkthrough

For each day 1–30:

1. Set Chrome device toolbar to iPhone 14 mini (390×844), CPU throttle 4×, Network throttle Slow 3G for half the days.
2. Open the supervisor app at the dev URL, walk through every screen / sheet / button that fires that day per the calendar.
3. DevTools surfaces in active use: Elements (layout check), Console (no warnings), Network (no failed requests, latency tracked), Application (storage state), Performance (record on scroll-heavy screens, no >50 ms tasks), Sources (logpoints for any flaky spot).
4. Railway logs streamed in parallel: `railway logs --service Eclean_future` + look for prisma N+1, slow queries, 5xx, rate-limit hits.
5. Bugs found → fix-as-found, NOT noted-as-deferred.
6. Per-day screenshot of DevTools state that proves the fix (not just the rendered output).

### Wave F — findings memo + ship

- `docs/findings/2026-05-18-supervisor-30-day-sim.md` — what we found, what we fixed, what we deferred (each deferral has a why + a sunset date).
- Spec coverage matrix per `feedback_done_memo_requires_spec_coverage_matrix.md`.
- Adversarial panel at wave end per `feedback_adversarial_panel_at_wave_end.md`.
- Single commit per wave; one push at the end of each.

## 5. Parallelization plan

Subagents (Sonnet) used per `feedback_token_efficiency_delegate_sonnet.md` for execution; Opus orchestrates.

**Phase 1 (parallel — dispatch all three together):**

- Subagent 1 — Wave A (build 3 missing UIs + their hooks). Verifies routes exist; flags any backend gap.
- Subagent 2 — Wave B (wire no-ops + voice duration). Verifies B.1/B.2/B.3 backend routes; adds simple ones in same diff.
- Subagent 3 — Wave C audit (advance + SOS grep + decide build vs defer).

**Phase 2 (after Phase 1):** Opus integrates, runs typechecks + lint + DevTools smoke, fixes any conflicts.

**Phase 3 (sequential):** Wave D (seed script — depends on knowing final schema), then Wave E (walkthrough — needs seed loaded), then Wave F (memo + ship).

## 6. Discipline gates (must pass before each wave's commit)

- **Confidence score per change** ≥90% for own work, ≥95% for research-derived
- **Typecheck clean** on apps/mobile + apps/backend
- **Real-DB tests pass** on any new backend route
- **DevTools-verified** for any UI change (screenshot of DevTools surface proving the fix, not just rendered output)
- **Railway-log-verified** for any backend change (log line excerpt in commit message)
- **No new `any`. No new TODO comments. No new "coming soon".**
- **Panel review** at end of Wave B + Wave E per `feedback_adversarial_panel_at_wave_end.md`

## 7. Out of scope (explicit, with sunset dates)

- **Photo CDN slice** — flagged review photos remain "N photos" until photo-CDN wave (sunset: Wave 8, by 2026-06-15). Resolve/Reject work without inline photos.
- **Worker mobile** — Phase D, separate sprint. Supervisor sim does NOT depend on worker mobile.
- **HR portal** — separate sprint. HR-initiated anonymisation (per `feedback_no_self_service_resign_or_terminate.md`) lands when HR portal does.
- **Owner mobile** — Phase E, separate sprint.
- **Push delivery webhooks (OneSignal → server)** — out of scope; supervisor app already sends OneSignal events; we trust delivery.
- **Offline-first photo queue (#73)** — separate engineering effort; sim runs online. Note in findings memo.
- **GPS-spoof velocity check (#76)** — separate engineering effort; same.

## 8. Risk register

| Risk                                               | Likelihood | Mitigation                                                                                       |
| -------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------ |
| Backend route doesn't exist for a "wire-this" task | medium     | Subagent verifies first; if absent, adds minimal route in same diff                              |
| Seed script breaks Railway sandbox                 | low        | Wrap in tx; tested locally on copy of schema first                                               |
| 30-day walkthrough takes >2 days of real time      | medium     | Parallelise: chunk days into batches of 5–7, dispatch subagent per chunk                         |
| New screens drift from R6 design canon             | medium     | Each new screen reviewed against `docs/prototypes/supervisor-mobile-r6/` reference before commit |
| Founder finds something we missed                  | high       | That's the point. Sim ends with findings memo; founder picks final tweaks before ship.           |

## 9. Decision points the founder owns

1. **Approve this plan** — or ask for changes.
2. **Wave A scope** — build all 3 missing UIs, or just the highest-priority?
3. **Wave C** — if advance + SOS are confirmed absent, build now or defer?
4. **Wave E pacing** — full 30 days in one session, or 7-day chunks reviewed between?
5. **Sandbox tenant** — re-use existing `axhy-sandbox`, or spin a new `axhy-sim-30day` to isolate?

---

**Recommended go path:** approve Wave A + Wave B + Wave C-audit now; defer Wave C-build decision to after audit results; full 30-day walkthrough in one continuous session with screenshot-per-day; reuse existing axhy-sandbox.
