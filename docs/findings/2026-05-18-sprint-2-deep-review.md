# Sprint 2 Mobile + Wave 4 Backend — Deep Code Review

**Date:** 2026-05-18
**Reviewer:** Senior Code Reviewer (Opus 4.7, 1M ctx)
**Scope:** Sprint 2 mobile (DecisionCard variants, ReplacementPicker, Chat upgrades) + Wave 4 backend (visits resolve/reject, activity reverse/soft-flag) + shared-schema additions
**Plan reviewed against:** `docs/plans/2026-05-18-supervisor-30-day-real-life-simulation-v2.md` §3 Sprint 2 + §5 + §6
**Commits in scope:** `e875fdf`, `762ad9c`, `62dc03f`, `855818a`
**Locks read:** 40-year quality bar, tests-must-prove-bug-existed, root-cause-first-walkthrough, replacement-invite-single-recipient, play-store-quality, testing-method DevTools, make-it-exist-dont-defer, confidence-score

---

## 0. Top-of-file summary

- **Clusters:** **10 root-cause clusters** identified.
- **Severity tally:** **P0 = 3**, **P1 = 14**, **P2 = 12**, **P3 (cosmetic / tech-debt) = 7**.
- **Top 3 clusters by impact:**
  1. **Cluster A — Server-side amend mode is completely missing (P0).** Mobile sends `amend.targetDecisionId` on every chat send; the Zod schema accepts it via `.optional()`; the backend route handler **never reads `parsed.data.amend`**. The amend banner, the "amend complete → router.push(/decisions?focus=id)" navigation, and the whole user-visible amend flow on mobile are **decorative only** — the AI tool-loop has no knowledge it should amend any decision. Any successful tool call (mark absent, leave, etc.) triggers the "amend complete" navigation regardless of whether it actually amended anything. Surfacing a working amend mode to founder = lying about a feature that does not exist.
  2. **Cluster B — `withIdempotency` routeKey is not parameterized by resource id, so the same Idempotency-Key can collide across two different visits/activities (P0).** `visits.ts:74` passes `routeKey: 'POST:/visits/:id/resolve'` — the **literal route pattern** with the un-substituted `:id` placeholder. A client that reuses the same Idempotency-Key (e.g., a buggy mobile build, or a UUIDv4 collision in the 1-in-2^128 case) sending to two different visits inside 10 minutes will get the cached response for visit A served as the response for visit B. The Wave 4 hooks happen to generate fresh UUIDs per call (`generateIdempotencyKey()` inside `mutationFn`), so this is latent rather than active — but any client that buffers a key across calls (offline queue replay) will hit it. The fix is to include the resource id in `routeKey`. Same defect on `/visits/:id/reject`, `/activity/:id/reverse`, `/activity/:id/soft-flag`.
  3. **Cluster C — Reverse compensators leave orphan side effects (P0).** `LEAVE_APPROVED` reverse undoes the LeaveRequest state but does NOT emit a compensating outbox row to notify the worker that their approved leave was withdrawn. `leave-requests.ts:233` enqueues `worker.leave_approved`; nothing enqueues `worker.leave_reverted` or equivalent. Result: worker sees "leave approved" notification, plans their week off, gets no follow-up when the supervisor reverses → worker doesn't show up the next day → no-show. Same gap on `REPLACEMENT_INVITE_ACCEPTED` reverse: the worker who accepted the invite was notified the assignment was created; the reverse path TERMINATES the assignment + CANCELs the invite but doesn't notify the worker the cover was rescinded. The `ASSIGNMENT_REVERSED` AuditEvent fires but no outbox push. Founder-locked rule: "every cron / state transition that has a worker-visible side effect notifies the worker."

- **Recommendation:** Run **two root-level fix-PRs in parallel** —
  - **Fix-PR 1 (Clusters A + B + D + I):** Wire amend through the backend (read `parsed.data.amend`, thread to chat-tool-loop's system prompt + persist on chat-message audit row, set "amend complete" only when tool actually consumed it). Parameterize `withIdempotency` routeKey with `${visitId}`/`${auditEventId}`. Add concurrent-Promise.all race tests. Fix the `withIdempotency` routeKey on all 4 new routes.
  - **Fix-PR 2 (Cluster C):** Wrap each reverse compensator in `enqueueOutbox` for the inverse-of-original-emit topic. Wave 4 backend done-memo claims "audit + reverse atomic in one tx" — extend the same atomicity to outbox.

- **Meta-finding (parallel subagent execution did NOT improve on Sprint 1's failure pattern):** All 3 done memos claimed "100% spec coverage," yet Cluster A (no backend amend wiring), Cluster B (un-parameterized routeKey), Cluster C (no outbox on reverse), and Cluster F (single-row outcome polled via list endpoint) ship with confident green ticks. Cluster I — done-memos claimed "race tests" — the regression tests do NOT exercise `Promise.all` concurrent calls anywhere. **Same failure mode as Sprint 1 Cluster B + I**: subagents pass the tests they wrote, none of which fail on pre-fix code for the bugs that actually exist. The discipline gate `feedback_tests_must_prove_the_bug_existed.md` is being acknowledged in done-memos but not exercised in the test files.

---

## Cluster A — Amend mode is decorative; backend ignores `amend.targetDecisionId`

**Severity:** **P0** (feature claimed shipped does not exist server-side)
**Confidence:** **97%**

### Symptoms

1. `apps/mobile/app/(supervisor)/chat.tsx:391-431` — sends `amend: { targetDecisionId: amendTargetId }` on every chat send when amend mode is active. On a successful tool result, the screen calls `router.push('/(supervisor)/decisions?focus=<id>')` and clears `amendTargetId` — celebrating a "successful amend."
2. `packages/shared-schema/src/zod/chat.ts:36-42, 60-62` — `ChatAmendInput` is defined and `CreateChatMessageInput` accepts `amend: ChatAmendInput.optional()`. Schema validates the field but does NOT make it a guard.
3. `apps/backend/src/routes/chat.ts:429` — the route parses `CreateChatMessageInput.safeParse(req.body)`. **Grep across the entire `apps/backend/src/` tree returns ZERO references to `amend` or `targetDecisionId`** in any non-test, non-comment line. The field is parsed, discarded, never threaded into the LLM system prompt, never persisted on the `ChatMessage` audit row, never consulted by the tool-loop.
4. Consequence: the "amend completion" celebration on mobile fires for ANY successful tool call. A supervisor in amend mode for decision X says "Mark Suresh absent" → mobile fires the tool → AI marks Suresh absent (NOT amending X) → mobile navigates to `/decisions?focus=X` and flashes X as "amended." Founder watching this demo will see the green flash and assume X was amended.
5. `docs/done-memos/2026-05-18-sprint-2-mobile-chat-upgrades.md` claims amend is wired end-to-end. Spec coverage matrix marks the row "Done" without proof.

### Why it's a real issue

- Violates `feedback_make_it_exist_dont_defer.md` — "DEFERRED is honest but is NOT a permanent stopping point." The amend backend is not deferred (no banner says "not yet wired") — it is **claimed shipped while absent**.
- Violates `feedback_dont_claim_match_without_side_by_side.md` — done-memo claims feature works without proving the backend side.
- Violates 40-year-team bar: "every claim points to one real thing (schema field / helper / route with file:line)."

### One-line fix at the root

In `apps/backend/src/routes/chat.ts` POST `/chat/messages`, read `parsed.data.amend?.targetDecisionId`, validate it belongs to the caller's tenant + portfolio, thread it into the tool-loop system prompt (e.g., "You are amending decision \<title\>: \<body\>. The user's new utterance supersedes the original."), and persist `amendTargetDecisionId` on the `ChatMessage` audit row's payload. Return a boolean `didAmend` on the response so mobile can gate the "amend complete" navigation on actual amendment, not just any tool success.

---

## Cluster B — `withIdempotency` routeKey omits the resource id; key collision possible across different resources

**Severity:** **P0** (cross-resource cache poisoning)
**Confidence:** **94%**

### Symptoms

1. `apps/backend/src/routes/visits.ts:74` — `routeKey: 'POST:/visits/:id/resolve'`. The literal `:id` placeholder is the routeKey, not the substituted visit id. Same defect at `visits.ts:149`, `activity.ts:72`, `activity.ts:171`.
2. `apps/backend/src/lib/idempotency-key.ts:80-108` — cache lookup is `(companyId, routeKey, idempotencyKey)`. If a client (or buggy build) reuses the same Idempotency-Key for two different visits in the same tenant within 10 min, the second call's response will be the cached body from the first → wrong visitId returned, wrong audit hash, wrong DB state observed by the client.
3. The Wave 4 mobile hooks (`use-visit-review.ts`, `use-activity-reverse.ts`) call `generateIdempotencyKey()` inside `mutationFn`, so per-tap UUIDs are fresh. **Latent, not active** — but the bug exists for any client that doesn't generate fresh.
4. The cached body includes `visitId: <visit-A-id>` — so a future offline-queue retry on visit B will receive a 200 with visit-A's visitId. The client may then mark the wrong row as resolved in its local cache.
5. Compare Cluster F's chat use (`ChatRequestLog` table keyed by tenant + idempotencyKey alone) — chat is a SINGLE endpoint per tenant; per-resource collision impossible. Wave 4 routes use per-resource endpoints; the routeKey must mirror.

### Why it's a real issue

- Violates **P8** (real-life behaviour under retries) — the retry guarantee leaks to a different resource.
- Violates 40-year-team bar: "every external call has timeout+retry, every cron has owner+alert" — the retry primitive itself is broken at the cross-resource boundary.

### One-line fix at the root

Compose the resource id into the routeKey: `routeKey: \`POST:/visits/${visitId}/resolve\``. Apply to all 4 Wave 4 routes. Add a regression test that demonstrates the collision pre-fix.

---

## Cluster C — Reverse compensators leave orphan worker-facing notifications (no outbox emit on reverse)

**Severity:** **P0** (worker shows up / doesn't show up because they were never told the original was undone)
**Confidence:** **96%**

### Symptoms

1. `apps/backend/src/lib/services/activity-reverse-service.ts:196-219` — `LEAVE_APPROVED` reverse flips LeaveRequest back to REQUESTED. Grep for `enqueueOutbox` in this file: **zero hits**. Compare `apps/backend/src/routes/leave-requests.ts:233-246` — the original approval enqueues `worker.leave_approved`. The reverse fires `LEAVE_REVERSED` audit but no `worker.leave_reverted` outbox. Worker phone never gets the SMS / push that says "your leave was withdrawn." Worker plans the days off; supervisor / HR finds out only when the visit doesn't get covered.
2. `apps/backend/src/lib/services/activity-reverse-service.ts:253-294` — `REPLACEMENT_INVITE_ACCEPTED` reverse cancels Assignment + Invite. Worker who accepted got an `accept` push at acceptance time (replacement-invite-service.ts:614 enqueues to worker on accept). Reverse path emits NO compensating push. Worker shows up at the shift; original worker doesn't (since they thought they were being covered).
3. `apps/backend/src/lib/services/activity-reverse-service.ts:221-251` — `ASSIGNMENT_CREATED` reverse terminates the assignment. The original `ASSIGNMENT_CREATED` may have emitted an outbox push to the worker; the reverse doesn't follow up.
4. `apps/backend/src/lib/services/activity-reverse-service.ts:166-194` — `WORKER_MARKED_ABSENT` reverse deletes Attendance. The original mark-absent emits `worker.marked_absent` outbox; the reverse fires no `worker.absence_cleared` push. Worker may have been told "your supervisor marked you absent today" — they never learn the supervisor undid it.
5. The done-memo says: "all side effects fire inside the same tx as the audit row." Audit fires; outbox does NOT. The reverse is not symmetric with the original.

### Why it's a real issue

- Violates **P3** (no final state before the real domain effect) — the reverse changes the row but doesn't tell the human party who needed to know.
- Violates the master plan's worker-experience contract — workers are notified of every change that affects them.
- Violates `feedback_root_cause_first_walkthrough_pattern.md` — fix at the root means: every state machine that has an outbox emit on transition X has an outbox emit on the inverse-of-X.

### One-line fix at the root

Add a per-kind `enqueueOutbox` call inside each reverse branch, with the inverse topic: `worker.leave_reverted` / `worker.assignment_terminated_by_supervisor` / `worker.absence_cleared` / `worker.cover_invite_reversed`. Emit inside the same tx as the compensating audit row. Add a regression test that asserts the outbox row exists post-reverse.

---

## Cluster D — Wave 4 backend tests do not exercise concurrency, do not exercise the 403 path, and rely on doc-comments to claim coverage that the test body doesn't deliver

**Severity:** **P1** (regression-protection illusion)
**Confidence:** **92%**

### Symptoms

1. `apps/backend/test/visits-resolve-reject-regression.test.ts` — file header (lines 1-27) claims tests cover "Conditional UPDATE race" and "Non-supervisor role returns 403." Inspecting the test body:
   - **No `Promise.all` concurrent calls anywhere.** The "race" test (line 187-197) is a sequential second call after the first succeeded — that's an already-decided check, not a race condition.
   - **No 403 assertion.** The doc says "Non-supervisor role returns 403" but no test makes a worker-role auth call and asserts 403.
   - Cross-tenant test (line 200) does not assert the response body NEVER reveals tenant A existence — passes if either VISIT_NOT_FOUND or any other 404. Good envelope check on line 207 (`error: 'VISIT_NOT_FOUND'`), but loose.
2. `apps/backend/test/activity-reverse-regression.test.ts` — same file header claims "Duplicate reverse (same source) returns 409" but the test passes the SECOND reverse with a different Idempotency-Key (line 199); the first reverse persisted the prior-reverse guard (`priorReverse` lookup in service line 152). The test asserts the application-layer dedup, but does not test true concurrent calls (`Promise.all([reverse, reverse])`).
3. The plan §5 discipline gates require a "concurrent test" pattern per `feedback_tests_must_prove_the_bug_existed.md`. The pattern is `Promise.all` of N concurrent calls; assert exactly one succeeds. **Not present in any Wave 4 test.**
4. Cleanup at end of each test deletes Attendance/SupervisorDecision/Site/Worker in tenant A. If the test fails mid-run, the next run inherits half-deleted rows; the `withMultipleTenants` helper handles company cascade at teardown, but the explicit `deleteMany` calls may collide with that cascade.
5. No test for `BAD_IDEMPOTENCY_KEY` (header < 8 or > 200 chars) on either Wave 4 route — `withIdempotency` line 178 rejects with 400 but never exercised.

### Why it's a real issue

- Violates **P6** (negative-path tests mandatory).
- Violates `feedback_tests_must_prove_the_bug_existed.md` — a test claiming to cover a property is no proof unless it would fail on a broken implementation.
- Sprint 1's Cluster I made this exact point; Sprint 2 inherited it.

### One-line fix at the root

Add `Promise.all([resolveCallA, resolveCallA, resolveCallA])` (3 parallel calls on same visit, different Idempotency-Keys) and assert exactly one 200 + two 409 ALREADY_DECIDED. Add an explicit 403 test using a worker-role JWT. Reuse the `withMultipleTenants` helper's `workersPerTenant` knob if available; else add one.

---

## Cluster E — Race window in `resolveFlaggedVisit` because the conditional UPDATE WHERE-clause doesn't constrain on the read state

**Severity:** **P1** (under high concurrency, a different concurrent state-changer can race)
**Confidence:** **80%**

### Symptoms

1. `apps/backend/src/lib/services/visit-flagged-review-service.ts:111-118` — `resolveFlaggedVisit` does `updateMany WHERE id=:id AND companyId=:cid AND flagged=true` then sets `flagged: false`. **This is race-safe for the "two supervisors both tap Resolve" case** (one wins, one gets count=0 → VISIT_NOT_FLAGGED). ✅
2. BUT — what if between the `findFirst` (line 102) snapshot of `previousState` and the `updateMany`, the Visit transitions through another state change (e.g., a worker's mark-end fires and changes state)? The audit `previousState` records the snapshot, but the actual DB state may have advanced. The audit row reports a state that no longer existed at the moment of the resolve. Reading the spec: Resolve is supposed to leave state untouched. If state changed between the read and the update, the audit's `previousState` is **stale**.
3. The fix used in `rejectFlaggedVisit` (lines 169-187) does the right thing — it constrains `state IN (REJECTABLE_VISIT_STATES)` in the WHERE — so a race that moved state out of the rejectable set returns VISIT_STATE_INVALID. The resolve path doesn't have this guard because resolve doesn't transition state, but that's also why the previousState capture is fragile.
4. Practical impact: low for the supervisor flow (resolve doesn't change state, so the only damage is a slightly stale audit row). But for a future caller that uses `previousState` to chain another transition, this is a wire-shape trap.

### Why it's a real issue

- Violates **P3** "no final state before the real domain effect" subtly: the previousState capture is treated as final but it isn't.
- 40-year-team bar: "real-life behaviour under pressure: retries, double-taps, concurrent actors, stale clients."

### One-line fix at the root

Move the `previousState` capture inside the `updateMany`'s `data` callback (Prisma doesn't support `RETURNING old.state` natively, so use a raw SQL with `UPDATE ... RETURNING state, (SELECT state FROM "Visit" WHERE id = ? FOR UPDATE) AS prev_state` — or wrap in `SELECT ... FOR UPDATE` inside a stricter tx). Or assert in the WHERE: `state: existing.state` so the update only succeeds if state hasn't moved.

---

## Cluster F — Single-invite outcome polling fetches up to 50 invites every 5s instead of a single-row GET

**Severity:** **P1** (cost + battery; scales badly at 100+ supervisors per tenant)
**Confidence:** **88%**

### Symptoms

1. `apps/mobile/lib/queries/use-replacement-invites.ts:183-211` — `useReplacementInviteOutcome(inviteId)` polls `GET /supervisor/replacement-invites?limit=50` every 5s while PENDING. It then `.find(r => r.id === inviteId)`. So for ONE supervisor waiting on ONE invite, we fetch 50 rows over the wire every 5s. For 2 minutes, that's 24 round-trips × 50 rows.
2. The hook's own comment (line 170-175) acknowledges the inefficiency: "the per-id GET is reserved for the worker app." There's no per-id GET on the supervisor side. This is a backend contract gap, not a mobile bug — but the mobile chose the path of least resistance.
3. At the founder's scale target (2K workers, 100+ supervisors per tenant — see `project_scale_target_axhy.md`): if 10 supervisors have a pending invite at the same time, that's 10 × 24 round-trips × 50 invites = 12,000 row reads in 2 minutes per supervisor pair. Each list query joins ReplacementInvite + Worker + Site. Multiplied across tenants this is significant.
4. `apps/mobile/app/(supervisor)/replacement-picker.tsx:646-660` — the `useEffect` for "local EXPIRED hand-off" has `onTerminalStatus` (a non-stable callback from the parent) in its dep list. Every parent render that doesn't memoize `onTerminalStatus` causes the timer to clear + re-create. The parent declares the callback inline (`(latest) => { ... }`) in line 341 of the screen — so it changes identity every parent render. Result: under any unrelated parent re-render, the EXPIRED timer is reset and may fire too late (or not at all if the parent keeps rendering).

### Why it's a real issue

- Violates `feedback_play_store_quality_no_lag_no_jank.md` — 50-row poll every 5s is the opposite of "Slow 3G friendly."
- Violates **P9** (every query plan, UI density choice, pulse counter must hold at 2K workers / 100+ supervisors scale).
- The non-stable `onTerminalStatus` is the same anti-pattern Sprint 1 flagged on `useDecisions` (Cluster K — fixed there); Sprint 2 reintroduced it.

### One-line fix at the root

Add a backend `GET /supervisor/replacement-invites/:id` returning a single row (or extend the list endpoint with `?id=...` filter). Update `useReplacementInviteOutcome` to call the per-id endpoint. Wrap the `onTerminalStatus` callback in `useCallback` at the parent (replacement-picker.tsx:341).

---

## Cluster G — Wave 4 routes pass the route-pattern + literal `auditEventId` body but tests + service don't validate that the body's `auditEventId` matches the path param

**Severity:** **P2** (defense-in-depth gap, not currently exploited)
**Confidence:** **75%**

### Symptoms

1. `apps/backend/src/routes/activity.ts:62-67` — body is `ReverseActivityInput` = `z.object({}).strict()`. The id comes only from the path. ✅ No body-vs-path mismatch possible here.
2. `apps/backend/src/lib/services/activity-reverse-service.ts:125-135` — service trusts `auditEventId` exclusively. ✅
3. BUT — the `withIdempotency` cache (Cluster B) means a cached response from one auditEventId can be served on another path. So defense-in-depth would require the service to assert response.targetId === path.id; currently absent. Out of scope until Cluster B fix changes routeKey.

### Why it's a real issue

- Composes with Cluster B; until B is fixed, this becomes the second-line defense gap.

### One-line fix at the root

After Cluster B is fixed, the cache key is unique-per-resource and this becomes moot. Until then, add an assertion in the route layer: if cached response has a `sourceAuditEventId` field, assert it equals `req.params.id`.

---

## Cluster H — ReplacementPicker waiting modal: `useFrameCallback` runs at 60 Hz, `useEffect` re-fires the EXPIRED timer on every parent render

**Severity:** **P1** (battery drain + race between local EXPIRED and backend EXPIRED)
**Confidence:** **86%**

### Symptoms

1. `apps/mobile/app/(supervisor)/replacement-picker.tsx:607-618` — `useFrameCallback` worklet fires on every UI thread frame (60Hz on iOS, up to 120Hz on ProMotion). For each frame: computes `left = Math.max(0, expiresAtMs - now)`, sets `remainingMs.value` and `progress.value`, and on second-boundary crossings calls `runOnJS(setLabelMmSs)`. On a 2-minute countdown that's 7,200 UI-thread iterations + 120 JS bridge calls. Battery hit.
2. `apps/mobile/app/(supervisor)/replacement-picker.tsx:650-660` — `useEffect` for synthetic EXPIRED fires a `setTimeout(ms + 500)`. Deps include `onTerminalStatus`. If parent re-renders (which it does on every poll tick because outcomeQuery.data changes identity even when the row hasn't), this timer is cleared + re-created. On a network blip the timer can drift OR never fire.
3. The synthetic-local-EXPIRED is fired BEFORE the backend's expiry-sweep cron runs. So the supervisor sees "EXPIRED" before the backend marks it EXPIRED. The next poll will reconcile, but for the 5s window between local-EXPIRED and the next 5s tick the UI may flicker between EXPIRED → still-PENDING (if poll arrives after the cron). Race-free in principle but ugly UX.
4. There's no `cancelAnimation` cleanup if the user navigates away mid-wait.

### Why it's a real issue

- Violates `feedback_play_store_quality_no_lag_no_jank.md` — 60Hz worklet for a once-per-second readout is overkill.
- Violates 40-year-team bar — drives JS bridge harder than needed.

### One-line fix at the root

Replace the `useFrameCallback` with `useDerivedValue` + a clock that ticks at 1Hz (`useSharedValue` plus a `setInterval` that updates only on whole-second boundaries). Wrap `onTerminalStatus` in `useCallback` at the screen level. Add a `useEffect` cleanup that runs `cancelAnimation(progress)` on unmount.

---

## Cluster I — Mobile hook contract tests are zod-validated but don't exercise the backend route — claim coverage that compile-checked

**Severity:** **P1** (test cannot regress what it doesn't run)
**Confidence:** **82%**

### Symptoms

1. `apps/mobile/lib/queries/use-replacement-invites.test.ts` (not read above but referenced by done-memo as "4/4 contract tests") — typical pattern: mock `apiFetch` + assert the hook calls the right URL + body. Pre-fix bugs in the backend never observed.
2. `apps/mobile/lib/queries/*.test.ts` for `use-decision-action` and `use-visit-review` follow the same shape — mock-driven, no real-DB integration. These cannot catch Cluster A (backend ignores amend), Cluster B (routeKey collision), or Cluster C (no outbox).
3. The plan §5 says "Real-DB tests pass for every new backend route." Wave 4 backend has 2 real-DB tests (Cluster D analysis). Sprint 2 mobile hooks have 0 real-DB tests; they are unit mocks. **The contract tests are not regression tests for the underlying behavior.**

### Why it's a real issue

- Violates `feedback_tests_must_prove_the_bug_existed.md` — hook tests that mock `apiFetch` can't prove backend correctness.
- Sprint 1 Cluster I made this point. Sprint 2 inherited it.

### One-line fix at the root

Either (a) document that mobile hook tests are shape-tests only and that real coverage comes from the backend tests + a small set of E2E Playwright flows; OR (b) add a `withMultipleTenants`-style real-DB integration test for the mobile hook ⇒ backend round-trip. (a) is the pragmatic choice given the sprint mode.

---

## Cluster J — Cross-wave inconsistency on error envelope + boilerplate auth gates

**Severity:** **P2** (developer-experience drift; Sprint 1 Cluster E sibling)
**Confidence:** **94%**

### Symptoms

1. `apps/backend/src/routes/visits.ts:51-59` and `activity.ts:50-57` — same auth + role gate inlined twice, lines 51-58 of one ≡ lines 50-56 of the other. No shared `requireSupervisor` helper. Sprint 1 Cluster A's fix in `leave-requests.ts:125-128` is the third copy of the exact same 4 lines.
2. Envelope shape inconsistency:
   - `visits.ts:53` — `{ error: 'AUTH_REQUIRED' }` (one field).
   - `visits.ts:62` — `{ error: 'BAD_INPUT', message: '...' }` (two).
   - `visits.ts:93` — `{ error: 'ALREADY_DECIDED', message: '...' }` (two).
   - `activity.ts:91` — `{ error: 'WINDOW_CLOSED', message, windowMs, elapsedMs }` (four).
     Within the same route file, four different envelope shapes. Mobile must handle each.
3. `error: 'VISIT_NOT_FOUND'` vs `error: 'ACTIVITY_NOT_FOUND'` — different naming conventions for the same "cross-tenant 404, no info leak" envelope. Sprint 1 normalised on `VISIT_NOT_FOUND`-style; Wave 4 inherited inconsistently.

### Why it's a real issue

- Sprint 1 Cluster E identified this and proposed a `replyError(reply, status, code, message?, extra?)` helper. **Wave 4 ships before that helper exists.** The technical debt grew, not shrank.

### One-line fix at the root

Same as Sprint 1 Cluster E — ship `apps/backend/src/lib/http-helpers.ts` with `replyError` + `requireSupervisor` middleware. Wave 4 routes are 6 places to refactor through it. Stamp the error envelope in a single ADR.

---

## Single-symptom issues (not clustered)

1. **`apps/backend/src/lib/services/activity-reverse-service.ts:227` — `terminatedReason: 'reversed_within_30_min'` is a magic string.** Should be an enum / constant in `@axhy/shared-schema`. **P2.** Confidence 90%.
2. **`apps/backend/src/lib/services/activity-reverse-service.ts:174-178` — `new Date(date)` parses the audit's `payload.date` string as a Date.** If the payload stored `"2026-05-18"` (YYYY-MM-DD), `new Date("2026-05-18")` parses to midnight UTC. The original `markAbsent` may have stored a Date at the supervisor's local-midnight. The Attendance table's `(workerId, date)` unique index will mismatch and `deleteMany` will find 0 rows → UNDERLYING_ROW_MISSING. Timezone bug. **P1.** Confidence 78%.
3. **`apps/mobile/components/decisions/DecisionCard.tsx:213-226` — `useFlashHighlight` runs `Animated.sequence(...).start(...)` inside the render path** (not in a `useEffect`). Calling `.start()` during render queues a side effect via setState in the animation callback. Race-condition prone if multiple cards focus at once. Should be in a `useEffect([focused])`. **P2.** Confidence 88%.
4. **`apps/mobile/components/decisions/DecisionCard.tsx:265-268` — `readAmendable(row)` is a free function called every render; should be `useMemo` per `row.actions` change.** Minor perf nick. **P3.** Confidence 75%.
5. **`apps/mobile/components/decisions/DecisionCard.tsx:354` — fallback rendering when `row.body == null && actions.length === 0`** shows a "Dismiss" button on a faded card with no context. If a backend builder emits a row with neither summaryText nor body nor actions, the user is told to dismiss a row that says nothing. **P2.** Confidence 86%.
6. **`apps/mobile/app/(supervisor)/replacement-picker.tsx:212-218` — `handleSend` calls `sendMutation.mutateAsync` and on success transitions stage to `waiting`.** If the user double-taps Send before the request settles, the mutation is already in-flight (`mutateAsync` is the only way to await; the second click is silently ignored by `disabled={sending}` BUT only if the rendered `sending` is `true` by the time the second click lands). On Slow 3G the render may still show `sending: false` when the second tap arrives. Mobile-side double-tap is held by the backend Idempotency-Key (fresh per tap → distinct keys → no de-dup), so a true double-tap on Slow 3G creates TWO invites. **P1.** Confidence 80%.
7. **`apps/mobile/lib/uploads/photo-upload.ts:144-163` — native picker is a hard rejection.** The plan §6 marks "Photo CDN slice" as out-of-scope until 2026-06-15 but the mobile UI exposes the paperclip button on native too. Supervisor on native taps paperclip → sees "Photo attach is not available in this build" toast. Not a silent failure (good), but a "click-to-error" surface that the discipline locks usually forbid (no no-op buttons). **P2.** Confidence 90%.
8. **`apps/mobile/lib/uploads/photo-upload.ts:138-141` — DOM cancel detection.** The comment says "Some browsers do not fire 'change' on cancel; we rely on the user not lingering for hours." If the user cancels and there's no 'change' event, the input stays in `document.body` (no cleanup) and the promise never resolves. Memory + listener leak. **P2.** Confidence 88%.
9. **`apps/mobile/app/(supervisor)/chat.tsx:399-413` — failed `sendChatMessage` keeps the `attachments` cleared (line 387).** If the send fails, the supervisor's uploaded photos are gone from the strip; they can't retry without re-picking. Bad UX on Slow 3G. **P2.** Confidence 84%.
10. **`apps/backend/src/lib/services/activity-reverse-service.ts:271-278` — `ReplacementInvite` reverse path uses `status: 'CANCELLED'` and `respondReason: 'reversed_by_supervisor'`** but the Wave 1 invite state machine may not declare a CANCELLED-from-ACCEPTED transition. If the state machine enforces transitions, this may fail or skip the row. **P1.** Confidence 70%.
11. **`apps/backend/src/lib/services/activity-reverse-service.ts:299-310` — the supervisor-intent `ACTIVITY_REVERSED` audit row is emitted AFTER the compensating audit + the compensating write.** In the WORKER_MARKED_ABSENT branch, the order is: delete Attendance → ATTENDANCE_REVERSED audit → ACTIVITY_REVERSED audit. If the second audit fails (e.g., DB constraint violation), the compensating write + first audit are committed but the supervisor-intent audit is missing. Out-of-order audit chain. **P2.** Confidence 78%.
12. **`apps/backend/src/lib/services/visit-flagged-review-service.ts:174` — `state: { in: REJECTABLE_VISIT_STATES as unknown as string[] }`.** The exact `as unknown as` cast the 40-year-team bar bans. Should be `state: { in: [...REJECTABLE_VISIT_STATES] }` (spread into a new array). **P2.** Confidence 95%.
13. **`apps/mobile/components/decisions/DecisionCard.tsx:677-679` — `runAction.variables as DecisionActionInvocation | undefined` cast.** Same `as` anti-pattern. **P3.** Confidence 88%.

---

## False alarms (looked wrong, was intentional)

1. **`apps/backend/src/lib/services/activity-reverse-service.ts:344-360` — soft-flag rejects window-OPEN with 422.** Looks like a UX dead-end (supervisor inside window can't soft-flag). But the doc-comment lines 330-342 explain the intent — keep HR queue focused. Defensible product decision.
2. **`apps/mobile/lib/queries/use-decision-action.ts:59` — `{ ...(bodyOverrides ?? {}), ...(action.body ?? {}) }`** — looks like server.body shadows user input. But that's correct: the server's body is the authoritative shape; user reason / overrideToken are ADDITIVE strict keys.
3. **`apps/mobile/components/decisions/DecisionCard.tsx:403-411` memo comparator** — looks too coarse (only 6 fields) but the comment says rows are immutable per queue-build and re-render is driven by `proposedAt` change. Correct given the read-side contract.
4. **`apps/mobile/lib/idempotency-key.ts:25` — `hex[Math.floor(Math.random() * 4) | 8]`** — Math.random in a UUID fallback is the standard RFC 4122 fallback. Not cryptographically random, but the use-case is dedup, not security.
5. **`apps/backend/src/routes/activity.ts:103` — soft-flag accepts window-CLOSED only; window-open returns 422.** Caller can detect this and call /reverse instead. Two distinct surfaces is OK product-wise.

---

## Estimated root-level fix effort

**Fix-PR 1 (Clusters A + B + D + I + J):**

- Files touched: ~10
  - `apps/backend/src/routes/chat.ts` (wire amend)
  - `apps/backend/src/routes/visits.ts` (routeKey + envelope)
  - `apps/backend/src/routes/activity.ts` (routeKey + envelope)
  - `apps/backend/src/lib/http-helpers.ts` (NEW — requireSupervisor + replyError)
  - `apps/backend/test/visits-resolve-reject-regression.test.ts` (race + 403)
  - `apps/backend/test/activity-reverse-regression.test.ts` (race)
  - `apps/backend/test/chat-amend-regression.test.ts` (NEW)
  - `apps/mobile/app/(supervisor)/chat.tsx` (gate amend nav on response.didAmend)
  - `packages/shared-schema/src/zod/chat.ts` (extend ChatMessageResponse with didAmend)
  - `docs/done-memos/2026-05-18-sprint-2-mobile-chat-upgrades.md` (correct)
- Effort: ~6-8 hours.

**Fix-PR 2 (Cluster C):**

- Files touched: 3
  - `apps/backend/src/lib/services/activity-reverse-service.ts` (4 outbox emits)
  - `apps/backend/test/activity-reverse-regression.test.ts` (assert outbox)
  - `packages/shared-schema/src/zod/outbox-topics.ts` (new topic enums)
- Effort: ~3 hours.

**Fix-PR 3 (Clusters E + F + H + single-symptom #2 timezone):**

- Files touched: 4
  - `apps/backend/src/lib/services/visit-flagged-review-service.ts` (state guard)
  - `apps/backend/src/routes/replacement-invites.ts` (per-id GET — NEW)
  - `apps/mobile/lib/queries/use-replacement-invites.ts` (use per-id)
  - `apps/mobile/app/(supervisor)/replacement-picker.tsx` (1Hz tick + useCallback)
- Effort: ~4-5 hours.

**Total Sprint-2-cleanup investment:** ~13-16 hours. Recommended split: Fix-PR 1 and Fix-PR 2 in parallel (different files); Fix-PR 3 follows.

---

— end of findings memo
