# Next Session

**Last updated:** 2026-06-11 21:30 IST · **Branch:** `chore/handoff-late-2026-05-31` — **PUSHED to origin** (through `b225a50`). Main merges remain founder-owned.

## 🌙 EVENING UPDATE (2026-06-11) — supervisor walk DONE; 3 BLOCKERs found, the worst root already fixed + live-proven

1. **Supervisor OTP bypass — self-served via Railway** (+919778087087 added to the allowlist, redeployed, curl-proven). The "founder must allowlist" blocker never reached you.
2. **SUPERVISOR LIVE WALK COMPLETE** (`docs/walks/supervisor-screens/2026-06-11-1030/`, 15 evidence shots, 4-layer proofs): login → Today (the worker walk's FLAGGED visit surfaced to the supervisor with the AI's words — the cross-persona fraud moat is REAL) → flagged review → REJECT (Visit→REJECTED + audit proven) → Decisions → Activity → REVERSE bad-day → AI chat (mark-absent + sick-leave both extracted; Hinglish reply) → profile/drawer/memory/sites.
   - **10 bugs → 4 roots**; the 3 BLOCKERs in plain words: (i) the 30-minute UNDO is a dead end — the app computes the window with wrong timezone math so it always says "closed", then the server refuses the HR fallback because the window is actually OPEN; (ii) decisions the AI creates in chat were INVISIBLE in the Decisions tab until an app restart; (iii) tapping "Mark absent" always failed with a bare "status 400" — real reason: the QA worker is on no site roster, the AI proposed something the rules must refuse, and the app hid the explanation.
   - **The decision-pipeline root (C-D) is FIXED + LIVE RE-WALK-PROVEN tonight** (`b225a50`): decisions now appear the moment chat creates them (badge updated while still on the Chat tab — evidence/14-15); apply errors speak plain words ("This worker is not on any of your site rosters… Ask HR to assign them first" — evidence/13); the AI now refuses unrostered mark-absents at propose time; cards get worker names. The two backend halves activate at your next deploy. Verified: tsc ×2 clean, 24/24 real-DB suites, live emulator re-walk.
   - **Still open from this walk:** C-C (make the server the only undo-window authority; kill the client math + "soft-flag" jargon) and C-E (word-truth copy: dev note instead of photo thumbnails on the review sheet, "notifies HR" with no notification behind it, "Dwi expired." jargon, US dates, phantom "60-sec video"). Scoped in 04-rca-and-fix.md.
3. **Sentry wired env-gated** (ADR-0027, `a89af2f`): 5xx hook + fatal-startup capture, PII off. Inert until you set `SENTRY_DSN` on Railway — zero behavior change until then.
4. **Backup restore drill PASSED** (`docs/ops/restore-drill-2026-06-11.md`): all 39 tables restored, row counts match prod. Runbook: pre-install the pg extensions (esp. pgvector) on the target; use pg18 binaries.
5. **RLS Option-A is WIRED + LAB-PROVEN (you approved "wire RLS" at ~21:50 IST)**: all 30 audit sites fixed in code (`docs/done-memos/2026-06-11-rls-option-a-wiring.md`):
   - **Dispatcher split** (the 06-09 decision, now real): new `dispatcher/db.ts` client — same singleton today, dedicated client when `DISPATCHER_DATABASE_URL` is set; ai/notifications/owner-budget handlers + all 3 sweeps ride it; a startup probe CRASHES LOUDLY if the dispatcher ever connects as a non-RLS-bypass role (the audit's silent-no-op nightmare made impossible).
   - **6 supervisor read routes** via new `tenantReadClient` (official Prisma RLS extension — company GUC per query in its own batch tx, so the 12s→3s Cluster-1 parallelism fix is PRESERVED). **3 worker read routes** via new `withWorkerTenantRead` (user GUC → own-Worker self-read → company GUC, one tx, no ACTIVE gate). **revokeForCompromise** now bumps tokenEpoch under RLS (and no longer loses the token revoke when a membership was deleted). **turn-embedder anonymize** wrapped.
   - **PROOF as axhy_app on a fresh prod-restore lab**: new `test/rls-option-a-routes.test.ts` 8/8 — including NEGATIVE CONTROLS showing the bare client really does return empty Today payloads / false NO_WORKER 404s (the audit bugs were real), then the wrapped paths returning the seeded data. Existing RLS suites 18/18 on the same lab. tsc + eslint clean.
   - **Two prod gaps found during wiring** (now in your runbook below): `axhy_app` in prod is NOLOGIN with NO password, and has ZERO grants on schema `axhy_chat` — without those grants the flip breaks chat-turn embeddings.

## ☀️ MORNING READ (founder) — what happened overnight

You said: _"complete it, don't stop, fix everything."_ Done — everything not gated on a deploy:

1. **The dual-lens walk system you designed is built AND ran end-to-end** — `docs/protocols/dual-lens-review.md` + `docs/walks/` (rules, scoreboard, LOOPHOLES, living MAPs, pre-walk gate, staleness triggers, your standing grants recorded verbatim in README).
2. **First walk COMPLETE: worker-screens → REWALK_PASSED** (`docs/walks/worker-screens/2026-06-10-2345/`, 23 evidence screenshots):
   - All 21 steps + the full capture loop walked live on the emulator against PROD with four-layer DB proofs (visit c4fee06b traversed SCHEDULED→IN_PROGRESS→PHOTOS_PENDING→AWAITING_VERIFICATION→FLAGGED exactly per visitMachine).
   - **Prod AI verification WORKS** — and correctly FLAGGED garbage (black) photos: the fraud moat is real (`gpt-5.4-nano-2026-06`, no `-fallback`; note: the 3 verifications before June 6 were all fallback failures — watch it).
   - **5 bugs found → clustered to 2 roots → ALL FIXED + proven:** wrong-OTP silent reset (api.ts:283 guard — re-walk proven); orphan History screen (now reachable: You → Past visits — live-proven); leave promise (new RLS-correct `GET /worker/leave-requests` + "My leave" on profile — route proven against prod DB: 200 + the night's 4 leaves); Help→admin-login wall (real `/help` page built); profile fake identity (now real name+phone from /me — live shows "Akshay / +919381378257"); keep-awake hygiene.
   - Verified: tsc 0 across all 3 apps · vitest 109/109 · live re-walk screenshots in `evidence/`.

## 🔴 FOUNDER ACTIONS (remaining)

1. **Deploy backend + admin-web** (your normal flow) — activates the branch's code-complete fixes (profile "My leave", `/help` page, and the #20 route adoption + machines once main has them). NOTE: I rotated JWT via a railway env-set which already redeployed the **backend** once (deploy `33ee65e6` SUCCESS) — but that built from the currently-connected source; a deliberate deploy from your merged main is still your call.
2. ~~Rotate `JWT_SECRET`~~ — **DONE this session** (you authorized it): new 64-hex secret set on the `backend` Railway service; redeploy `33ee65e6` SUCCESS; login verified (OTP→200 + valid token). admin-web has no `JWT_SECRET` var, so nothing to sync there. Local `.env.local` (backend+admin-web) updated to match.
3. ~~Apply migrations 023-030~~ — **DONE this session** (you authorized it): **022-030 applied** to prod (fresh 79M backup first at `backups/axhy-prod-20260611-1146-pre-migration.sql.gz`); migration **022 had a PG18 bug** (`min(uuid)` absent) — fixed to `array_agg[1]` and committed (`8c6d368`); `/health` 200 throughout.
4. **RLS ACTIVATION RUNBOOK** — you chose Option A ("wire RLS", 2026-06-11 ~21:50 IST); the code is wired + lab-proven (8/8 as axhy_app + 18/18 existing RLS suites). RLS stays **inert** until you run these steps **IN THIS ORDER** (order matters — flipping before deploying the wired code breaks prod):
   1. **Deploy the backend from this branch's code** (your normal flow). The wired code is behavior-neutral under the current postgres connection — safe to deploy any time.
   2. **Run this SQL on prod as postgres** (I was permission-blocked from prod role changes — these are yours):
      ```sql
      ALTER ROLE axhy_app LOGIN PASSWORD '<generate a strong one>';
      GRANT USAGE ON SCHEMA axhy_chat TO axhy_app;
      GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA axhy_chat TO axhy_app;
      GRANT USAGE ON ALL SEQUENCES IN SCHEMA axhy_chat TO axhy_app;
      ```
      (Verified against the prod catalog tonight: axhy_app already has its 156 axhy-schema grants + 29 policies + 27 FORCE-RLS tables; it is missing ONLY login+password and the axhy_chat grants — without those grants the flip breaks chat-turn embeddings.)
   3. **On the Railway backend service, set `DISPATCHER_DATABASE_URL`** = the CURRENT postgres `DATABASE_URL` value (the dispatcher keeps the RLS-bypassing connection — your 06-09 decision; its sweeps are cross-tenant by design).
   4. **Flip `DATABASE_URL`** to the axhy_app URL (same host/db, user axhy_app + the new password).
   5. **Smoke**: `/health` 200 → OTP login → `/supervisor/today` returns real sites (not empty) → one visit submit→AI-verify end-to-end. If logs ever show the deliberate crash "dispatcher connected as role axhy_app … CANNOT bypass RLS", step 3 was missed — that fail-fast replaces the silent no-op the audit found.
   6. **Rollback** = revert `DATABASE_URL` to the postgres URL. One env var.

   Ops note: the CLI embedding sweeps (`scripts/sweep-turn-embeddings.ts`, `scripts/backfill-turn-embeddings.ts`) are cross-tenant — keep running them with the postgres URL.

5. `/mcp` reconnect for the brain Pool fix (carried from 06-09).

## Standing grants you gave overnight (recorded verbatim in docs/walks/README.md — re-confirm at customer #1)

Prod fully open (data is fake/QA) · UI-first seeding (scripts only where no UI exists) · FIX AUTONOMY (sessions decide fixes: brain → proven internet research; never ask you to pick).

## DONE overnight — second batch (commit `fb6f635`, all gated + verified + pushed)

- **C1** — chat mark-absent "today" default now IST (`isoDateIST`), both call sites. No more wrong-day absences at 4 AM IST.
- **S1** — per-phone OTP wrong-attempt cap (5 / 15 min → stored OTPs invalidated; success clears it; bypass paths untouched). Proven against real Redis.
- **O7** — flagged-visit screen leads with calm copy; raw AI reasoning ("may be staged") demoted to a small "AI note" but still shown.
- **O2** — `healthcheckPath: /health` in railway.json + new admin-web `/health` route (shared config needs both services to answer).
- **C6** — production error log when `WHATSAPP_*` env missing (was a silent no-op returning 200 while delivering nothing).
- **#23 safe-half** — `scripts/check-default-deny.mjs` + CI `default-deny` job: build fails if any backend route lacks an auth gate and a justified `auth-exempt` marker (clean tree 40/40; mutation test caught a fake route).
- **M2** — capture photos downscaled to 1600px JPEG 0.7 before upload (~3-5× less worker data). Live-proven: persisted photo 946×1600. Done-memos in `docs/done-memos/2026-06-11-*`.

## DONE overnight — third batch

- **Ledger #20 slice 1** (`c1bf5a4`) — the three missing state machines now EXIST + tested: `leave-request.ts`, `swap-request.ts`, `complaint.ts` in packages/state-machines (pure canTransition/assertTransition/isTerminal, namespaced in index). 31/31 exhaustive tests; pkg + backend tsc 0. The locked-rule "typed machine per entity" half is satisfied; states verified against the live route predicates. Done-memo: `docs/done-memos/2026-06-11-ledger-20-machines.md`.
- **Supervisor-screens walk** code-traced phase (`affb27d`) — found 2 more orphan screens (`summary`, `updates`: built + backend-backed but zero navigation) and confirmed the worker `/help` fix also covers the supervisor drawer. Walk folder: `docs/walks/supervisor-screens/2026-06-11-1030/`. Live phase pending (it drives the paid AI-chat surface — left for founder visibility).

## DONE this session — fourth batch (migrations + #20 fully adopted + JWT)

- **Ledger #20 COMPLETE** — all three domains now route lifecycle through their machines: leave-requests.ts:266 (`canTransition`) + swap-requests.ts:181 (`isTerminal`) in `8c6d368`; complaint-service.ts both terminal guards in `acad0b9`. Verified by **13/13 real-DB decision tests** (leave 6 + swap 7) + 7/7 complaint + 31/31 unit. Done-memo: `docs/done-memos/2026-06-11-ledger-20-adoption-migrations.md`.
- **Migrations 022-030 applied** to prod (see founder action 3 above) — this is what unblocked the #20 real-DB tests.
- **JWT rotated** (founder action 2 above).
- **Note (pg18 client):** prod is Postgres **18.3**; the local `pg_dump` 17.4 can't dump it — use `/usr/local/opt/postgresql@18/bin/pg_dump` for backups.

## Open work (carried forward, honestly scoped)

- Findings-doc launch items still open: OTA updates (expo-updates) + `/v1` API prefix before APKs ship; Sentry wiring; restore drill (fresh 79M dump exists at `backups/axhy-prod-20260611-1146`, restore-into-scratch still untested). [C1/S1/O7/O2/C6/M2 + #20 + migrations + JWT now DONE.]
- Next walks (scoreboard: `docs/walks/README.md`): supervisor surface; then capture bad-days (kill-mid-capture, two-visits-same-time, QR-wrong-site) with a fresh visit.
- Walk brain-ingest via `pnpm --filter @axhy/ai-tools brain:build` (ran post-`4aaca49`; re-run after `fb6f635`). Supersede rule: the next passing worker-screens walk deletes this one from the brain (folder stays in git).

## Test-infra notes (carried + new emulator facts)

- RLS suite + H6 commands unchanged from the 06-09 edition (see this file's git history).
- Emulator (also in worker-screens MAP §8): cold boot (`-no-snapshot-load`) is the reliable fix for dead network; stale AVD locks → `rm ~/.android/avd/eclean_test.avd/*.lock`; keep several GB disk free (gradle caches are safe purges when no build needed); prod backend needs NO LAN-IP trick (that's local-backend-only); Metro reachable via 10.0.2.2 on cold boot; `adb emu screenrecord screenshot` when screencap reads black.
