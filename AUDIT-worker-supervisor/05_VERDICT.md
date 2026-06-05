# 05 — Verdict: Is the HR foundation safe to build on?

**Short answer: YES — build HR, with eyes open.** The primitives the HR design leans on are real and working in code. The bugs found are almost all in _worker/supervisor surface_ code, not in the _foundation_ the HR docs assume — so they don't invalidate the HR design, but they are a fix-list to fold in. Below is the honest reasoning.

---

## 1. The three things I promised to check (and the answers)

### ✅ (a) The chat / rule-propagation pattern is REAL in code

Slice S3 (conf 0.92, 26 verified-implemented items). `living-doc.ts`, `living-doc-prompt.ts`, `living-doc-cap.ts`, `policy-rules-loader.ts`, `policy-service.ts`, `semantic-context.ts`, and **`reload-context-counter.ts` all exist and are wired** into the chat flow (`chat.ts`). Prompt composition layers company/HR/supervisor rules + living doc + semantic RAG; decision extraction creates proposed `SupervisorDecision` rows; the reload-context counter exists.
**→ Your "daily context + manual reload escape-hatch" design is not a plan — it's already in the codebase.** The HR site-anchored model can reuse this exact proven pattern. (One real bug: the semantic kill-switch stops _retrieval_ but not _embedding_, so embeddings keep getting written when ops disables the path — P1, cost issue, `chat.ts:1362`.)

### ✅ (b) `effective-responsibility.ts` + `same-day-freeze.ts` are REAL and working end-to-end

Slices S1 + S5. Supervisor Today derives "which sites/workers am I responsible for" through `SiteSupervisorBinding` via `effective-responsibility.ts` (acting-beats-permanent, point-in-time). `same-day-freeze.ts` gates responsibility changes to next tenant-midnight. Handoff packages are composed/written (`handoff-package-composer.ts`, `handoff-package-writer.ts`) and there are real expiry sweeps (`jobs/binding-expire-sweep.ts`).
**→ This is the single biggest green light for the site-anchored HR decision.** The derivation the HR model depends on already exists and runs in production code for supervisors. Building HR ownership on the _same_ substrate is reusing proven machinery, not inventing it — exactly what the design-panel concluded.

### ⚠️ (c) The `Worker.id` vs `User.id` identity drift is STILL live

Confirmed P1 in **two** slices: `worker-captures.ts:84` passes `auth.userId` (User.id) to the R2 presign, but `worker-submit-service.ts:88` reconstructs the key with `Worker.id` → **uploaded photos and the `VisitPhoto.r2Key` point at different paths → orphaned objects / 404'ing photos.** This is the same identity-contract hazard that already bit HR-A1 (`1edbbfd`).
**→ The HR build must centralize the worker-identity contract** (one `resolveWorkerFromAuth` helper used everywhere), because HR leave + anonymize + payroll all key on `Worker.id`. This is a fix to do _as part of_ the HR foundation work, not after.

---

## 2. Maturity, honestly, per persona

**Supervisor — the more built-out persona.** Chat/AI/living-doc (S3) and Today (S1, 23 impl) are substantial and real. Decisions (S2, 13 impl), Activity (S4), and coverage/people-ops (S5 — bindings, swaps, replacement invites, leave approval, calendar→assignment, handoff) all exist. **Thin spots:** Summary/Memory (S7 — 6 impl / 10 stubs: the Memory screen has _no backend endpoint_ yet, notification prefs are device-local only) and the HR-Updates _producer_ (S6 — supervisors can read+ack updates, but `POST /hr-updates` to _create_ them does not exist at all — **P0**, though that's the HR side we're about to build).

**Worker — solid core, thin edges.** Today (W2, conf 0.94) and Capture (W3, 19 impl: qr→photos→timer→review→submit, R2 upload, AI verify, visit machine, resume) are substantially built. Auth/identity (W1) is solid. **Thinnest area in the whole app: worker leave/notifications (W5 — 21 stubs)** — the drawer items (grievance, swap, notifications) are mostly placeholder.

**Cross-cutting — one real pattern problem.** State-machine discipline (a _locked_ rule: "transitions only via the machine") is **violated in several confirmed places**: `worker-submit-service.ts:94` writes `Visit.state='AWAITING_VERIFICATION'` directly; `visit-flagged-review-service.ts:176` and the AI handler `ai.ts:381` write `Visit.state` directly; `leave-requests.ts` and `swap-requests.ts` mutate state with raw enum updates and **have no state machine at all**. The connection/plumbing layer (X1) is solid but has gaps: refresh-token has no retry/backoff, Redis namespace can collide across envs, idempotency rows never get swept, and the ADR-0024 "Postgres fallback for rate-limit" is documented but not wired.

---

## 3. Are the implementation docs trustworthy enough to base the HR rewrite on?

**Mostly yes — ~85% trustworthy, with named exceptions.** `NEXT_SESSION.md` honestly flags its own deviations. But there are real overclaims the HR rewrite must not inherit:

- Design docs claim the supervisor Memory drawer shows "23 rules · 12 aliases · 8 site notes" — code shows **empty state only** (no backend endpoint).
- The uncommitted `worker-history.ts` change wrapped reads in `withTenantContext`, which **403s reads when a company is SUSPENDED** (a regression vs the `worker-today.ts` pattern) — P1.
- Several "wired" claims are "local-only this slice" in code (notification prefs).

**The key point for the HR rewrite:** the HR docs describe _new HR surfaces_ sitting on _kept primitives_ (bindings, effective-responsibility, same-day-freeze, outbox/dispatcher/notifications, audit-event, tenant-scoping, the daily-living-doc + reload pattern). **Every one of those primitives was verified to exist and work.** So the HR design's _assumptions_ are sound. The drift above is in worker/supervisor _surfaces_, which the HR docs don't depend on.

---

## 4. Fix-list to fold into the HR foundation work (prioritized)

**P0 — before/with the HR build (HR depends on these):**

1. **Centralize the `Worker.id` ↔ `User.id` contract** (one helper). HR leave/anonymize/payroll all key on `Worker.id`. Fix the R2 presign mismatch (`worker-captures.ts:84`) as the first instance.
2. **`POST /hr-updates` + outbox `hr_update.posted` + dispatcher handler** — this is the HR _producer_ side; it's a build item, not a regression. (S6)

**P1 — fix while in the code (state + data integrity):** 3. **Restore state-machine discipline** — route `Visit.state` writes (submit, flagged-review, AI) through `visitMachine`; give `LeaveRequest`/`SwapRequest` real machines (or formally bless the service-enforced lifecycle in the locked docs). The HR build adds more state-driven flows, so fix the pattern now. 4. **Revert the `worker-history` `withTenantContext` regression** (suspended-company reads should not 403) and align the transaction timeout. 5. **Worker OTP transition failure is silent** (`auth.ts:146`) — surface or block on failure. 6. **VisitPhoto bulk-insert idempotency** (dup submit → dup rows; add `@@unique`).

**P2/P3 — quality, batch later:** StateBadge unknown-state crash (defensive fallback), refresh-token retry/backoff, Redis namespace assertion, idempotency sweep job, history clock-in/out timestamps, profile "Verified" badge ignoring worker state, dead `captureMachine`/unused props. Full list in `02_BUG_LEDGER.md`.

---

## 5. Bottom line for your decision

- **The foundation the HR site-anchored model needs is real and working.** Site bindings + effective-responsibility + same-day-freeze + the daily-living-doc/reload pattern + outbox/notifications + audit/tenant primitives all verified present. **Build HR on it.**
- **Your two design instincts are confirmed by the code itself:** site-anchored responsibility derivation already exists (validating the pod→site decision), and the daily-batch + manual-reload pattern already exists (validating your rule-propagation philosophy).
- **Do the HR rewrite — and bundle the P0 identity-contract fix + the state-machine-discipline P1s into the HR foundation wave**, because HR's own surfaces (leave, anonymize, payroll, terminations) sit directly on those exact contracts.
- **The implementation docs are good enough to build from once these verified corrections are folded in.** Don't inherit the ~3 overclaims (Memory rules, suspended-company reads, local-only prefs) into the HR docs.

**Recommendation: proceed with the HR site-anchored rewrite + role clarification, and add a short "HR foundation fix wave" (items 1–6 above) as the first build step before the HR surfaces.**
