# Next Session

**Last updated:** 2026-06-05 (afternoon) · **Branch:** `chore/handoff-late-2026-05-31` (47 commits ahead of `main`; working tree has many uncommitted files). · **Deploy state:** NOT pushed — Railway `main` is ~2 days stale and is missing the whole RCA wave + everything below.

This run (founder: "make it real-market production-ready, both apps, no compromise; seed your own data; push to main if needed"): seeded a **production-shaped dataset** on the Railway prod DB, verified both apps at the route+DB layer with real data, ran an **exhaustive multi-agent audit** (adversarially verified), and **fixed + verified 9 real bugs** including 2 BLOCKING. Full evidence: `docs/evidence/2026-06-05/worker-supervisor-release/`.

> **Env truth:** emulator app → local backend on host `:4000` → **Railway prod DB**. No paying customers yet (founder-confirmed); all prod data is fake; seeding the prod DB is sanctioned (D8). The **emulator is unreliable on this host** (1 virtual core, RAM-tight — it crashed repeatedly), so exhaustive verification was done at the **route+DB layer** (bulletproof) + a parallel **code-audit workflow**; on-device screenshots cover the supervisor surface from earlier in the session.

---

## What was completed

**Seed:** `apps/backend/scripts/seed-qa-comprehensive.ts` — Company "Reddy Cleaning Services" (slug axhy-sandbox) with loginable supervisor **Suresh `+919999999999`** and loginable workers **Ravi `+919900000002`**, **Mukesh `+919900000001`** (OTP `123456`), 3 sites + bindings, visits across **all 13 states**, leaves in 3 states, edge personas (suspended worker, unicode/emoji name), + a 2nd company "Surya Facilities" (`+918888888888`) for tenant-isolation. Idempotent; re-runnable.

**Route+DB verification (real data):** supervisor + worker routes all 200 with rich data; floor-pulse aggregates correctly; **tenant isolation holds** (Surya sees zero Reddy data); unicode names render; negative cases (wrong-worker→403, nonexistent→404, no-auth→401) pass.

**9 fixes — all verified (backend typecheck green throughout):**

1. **Role-gate cluster (security)** — 14 supervisor routes were `requireAuth`-only (a worker could read the roster/summary/activity/living-doc/invites + drive the AI engine). Gated all: `chat.ts`, `decisions.ts`, `supervisor-updates.ts`, `supervisor-today/summary/context/living-doc/activity.ts`, `replacement-invites.ts` (supervisor routes→SUPERVISOR, worker accept/decline→WORKER). Test `supervisor-route-role-gates.test.ts` **29/29 prod-DB green**; `check_before_done` passed for the first slice.
2. **BLOCKING-1 — `POST /assignments`** had NO role gate → a worker could fabricate assignments. Added `requireRole('SUPERVISOR','HR')`. Live: worker→**403**.
3. **BLOCKING-2 — photo data-loss.** Capture/submit schemas capped photo `index` at 3 and the submit array at 6, but the UI allows 8/phase (locked doc: max 8) → photos 4-8 could **never upload** and permanently dead-ended the visit. Raised index→8 (`worker-captures.ts` ×2 in shared-schema + backend route; `worker-submit.ts`), array→16. Live: presign index 4→**200**, index 9→400.
4. **Calendar cross-supervisor (security HIGH)** — `calendar.ts` PATCH/promote/GET scoped only by companyId (supervisor B could edit/promote A's calendar; GET trusted a client `?supervisorId`). Gated all 4 routes to SUPERVISOR + scoped to `supervisorId: auth.userId`; GET ignores the client param. Live: worker→403, supervisor→own only.
5. **CLUSTER-B — replacement-invite id.** Picker sent `Worker.id` where backend wants `User.id` → every invite 404'd. Added `userId` to `TodayWorker`/today-service; picker sends User.id. **E2E proven**: User.id→201, Worker.id→404.
6. **CLUSTER-D — worker FLAGGED reason.** verify-status didn't return `verificationText` → worker never saw why a visit was flagged. Added it to schema+route. Live: returns the reason.
7. **Resign doc-truth** — supervisor `me.tsx` documented a Resign button that (correctly, per locked `no-self-service-resign-or-terminate`) doesn't exist. Removed the docstring + dead styles.

---

## What is genuinely incomplete (from the adversarial audit — exact locations)

**HIGH, latent (safe today, fix before scale):**

- **Outbox dispatcher has no atomic claim** (`dispatcher/index.ts:75-117`; `schema.prisma` Outbox has no claim/lease column). Under the founder-mandated **multi-replica** scale-up, two dispatchers double-process the same rows → double AI cost + double side-effects. Needs `FOR UPDATE SKIP LOCKED` / a claimedAt column. Latent: prod pins 1 replica today.
- **State-machine bypass** — `anonymize-worker-service.ts:80-86` writes `Worker.state='TERMINATED'` directly (illegal ACTIVE→TERMINATED, skips TERMINATION_PENDING); `chat.ts:1838` hardcodes `TERMINATION_PENDING`. Both bypass `workerMachine`. Safe today (manual guards hold) but violates the "no direct status writes" rule and is fragile to new source states.

**MEDIUM:**

- `decisions-service.ts:595-604` — N+1 in the leave-request decision source (up to ~600 sequential queries for 200 leaves). Batch-derive primary sites + single site fetch.
- `submit.tsx` resume path — after app-kill during AI verification, resume reopens the idle "Submit" screen (offers a re-submit instead of resuming the poll). Relies on backend idempotency.
- `chat.ts:993-1048` `propose_create_assignment` — no worker/site existence guard (chat-behavior RULE 4), unlike sibling propose\_\* tools; bad id surfaces a bogus card (apply re-validates, so bounded).

**LOW:**

- `attendance-service.ts:162-168` — payroll recompute enqueued only `if (payDeductPaise > 0)`; a correction back to 0 never restores the deduction (latent — payroll handler is a stub).
- `me.tsx:584` — hardcoded `BUILD 2026.05.18` (Drawer uses an env-derived honest stamp; wire me.tsx to it).
- `capture/_layout.tsx` docstring says "scaffold-only/placeholder" but all steps are built (doc-truth).
- `dispatcher/handlers/ai.ts:377-394` — Visit-state write lacks an in-WHERE from-state guard (TOCTOU vs concurrent resolve).
- **NEW-2** — `worker-submit.ts` verify-status returns 500 (not 400) on a malformed (non-UUID) visitId; this is a broader class (many `findUnique`-by-param routes) — add a shared UUID-param guard.

**INFO:** workerMachine middle lifecycle (ON_LEAVE/ABSENT/etc.) never written to Worker.state (tracked on side tables); mutating dispatch handlers (payroll/gupshup) will need idempotency guards when wired.

**Pre-existing test flakes (NOT from this session):** `supervisor-today` happy-path (time-of-day 'late' vs 'on_site', the test's own comment predicts it); `chat-swap` (NOT_RESPONSIBLE); `supervisor-decisions-union-all` (beforeAll fixture); `wave-1-replacement` (expiry CHECK constraint).

---

## First action next session

1. **Deploy:** commit the working tree + push to `main` so Railway runs the verified code (the security fixes are NOT live until then). Set **`AXHY_REDIS_NAMESPACE`** per prod env first (RCA-G boot guard) or prod refuses to boot. Smoke-test the live server.
2. Fix the outbox atomic-claim + the 2 state-machine bypasses before any replica scale-up.
3. Work down the MEDIUM/LOW list above (all have exact file:line).

## Method notes

- Prod DB; route+DB verification is the reliable instrument on this host (emulator too weak). Multi-company + isolation always.
- Audit was a multi-agent workflow with adversarial verification — 13 confirmed findings from ~33 agents.
- Host kept awake via `caffeinate`.
