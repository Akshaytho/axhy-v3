# Next Session

**Last updated:** 2026-06-12 14:50 IST · **Branch:** `chore/handoff-late-2026-05-31`. Main merges remain founder-owned.

## What was completed

**Afternoon autonomous session (founder away, Telegram protocol active):**

1. **Both pre-APK launch blockers CLOSED (ADR-0028, `docs/decisions/0028-v1-api-prefix-and-ota.md`):**
   - **/v1 API versioning** — backend aliases `/v1/X`→`/X` via Fastify `rewriteUrl` (pre-routing; the only correct point — onRequest hooks run after the router). Bare paths stay accepted (compat window), so the installed QA dev-client + deployed admin-web never break. Mobile pins `API_BASE+'/v1'` (api.ts:22); admin-web pins once in `lib/env.ts` (and `lib/api.ts` now consumes the validated env, fixing a fail-loud-rule violation). **Proven:** new `test/v1-prefix.test.ts` 4/4 TDD (parity, handler depth, no `/v1abc` bleed, querystrings) + live curl chain: /v1 OTP login → admin session cookie 200 → `/hr` with WORKER cookie → `/forbidden` (role gate intact over /v1).
   - **OTA updates** — `expo-updates@~29.0.18` installed, `runtimeVersion {policy:'appVersion'}` in app.config.ts (native change ⇒ bump version), `channel: production/preview` in eas.json. **One founder step remains** (EAS is logged out on this Mac): `cd apps/mobile && npx eas-cli login && npx eas-cli update:configure`, then commit the injected updates.url/projectId.
2. **admin-web typecheck 38→0** (@types/react/-dom ^18→^19 to match react 19) — all THREE apps now `tsc --noEmit` clean + `next build` passes.
3. **Supervisor walk CLOSED to ROOTS_FIXED** (00-scope, 06-verdict, scoreboard README updated): all 4 roots fixed (C-D `b225a50`, C-C+C-E `242eb6b`, dedup `2dbbd33`); verdict READY-PENDING-DEPLOY; path to REWALK_PASSED = deploy → seed flagged visit + rostered worker → 30-min re-walk of the 2 deferred paths.
4. **Morning session (same day):** C-C server-authority reverse window + C-E word-truth copy + post-commit adversarial review (6 findings → 1 real → soft-flag dedup guard). See `docs/done-memos/2026-06-12-cc-ce-supervisor-walk-fixes.md`.

## Late-afternoon additions (same session, after founder returned)

1. **HR screenshots DELIVERED** — founder authorized via Telegram ("Yes seed") + in-chat channel designation; QA HR login seeded (`QA HR (screenshots)`, +911000000071, HR role in the QA company — delete anytime); 12 screens shot through the REAL login flow and sent to Telegram, plus the 8 public pages.
   - **Finding (root-caused, NOT a bug):** HR worker/leave lists render empty for a site-less HR user — `GET /admin/workers` is site-anchored by design (admin-workers.ts:87-97: HR sees only workers with live assignments to sites that HR owns). UX improvement for later: empty-state hint "You don't manage any sites yet."
2. **Migration 031 authored — YOUR APPLY (normal flow, fresh backup first):** `20260612_031_restrict_legal_trail_cascade` flips Company→{AuditEvent, Attendance, Visit} from CASCADE to RESTRICT, making locked INVARIANT 9 (audit immutable) + 11 (history forever) DB-enforced. App-behavior-neutral (zero company/worker/site delete paths exist — grep-proven). Rollback = re-add CASCADE (documented in the migration header).
3. **Standing Telegram protocol (founder-mandated, saved to memory):** all pings in simple 10th-class English; a background watcher polls his replies and auto-wakes the session — his Telegram replies are commands.
4. **Founder re-scoped the session mid-stream (command channel):** MOBILE (worker+supervisor) is the priority; web-portal UI is HANDS-OFF (he redesigns it himself). Mobile status sent to him honestly: all known bugs fixed in code; 2 verifications deploy-gated; re-walk QA data seeded (seed-qa-comprehensive: Reddy sandbox now has 2 FLAGGED visits + rostered workers + loginable supervisor +919999999999) so the post-deploy re-walk is a 30-min job. He was shown LIVE screenshots (deep-linked) of the two orphan screens (summary, updates) and is deciding placement (A drawer / B profile / C hidden).
5. **GAP 7 second half done:** membership-add now notifies ACTIVE owners in-tx (kind `membership_created`, mirrors the pre-existing policy-write emission in policy-service.ts; actor-skip + cross-tenant isolation real-DB proven in `test/owner-admin-action-alert.test.ts` 1/1). Honest scope: reload-context is supervisor-initiated (not an admin action — no owner alert); membership-REMOVE + company-settings emissions await those routes existing.

## What is genuinely incomplete

1. **HR-portal screenshots → Telegram (founder request) — ✅ DONE (see late-afternoon additions).** The May-30 QA HR account (Anita +919900001111) no longer exists (login says NO_MEMBERSHIPS); the security layer correctly requires your explicit OK to seed a new QA HR membership. **Reply `YES SEED` on Telegram** → screenshots in ~3 min (local admin-web on :3300 → local backend on :4000 with bypass are both running; Playwright spec `apps/admin-web/e2e/hr-screenshots.spec.ts` is the proven probe). Alternative: reply `HR <phone>` with a real HR-role phone.
2. **Emulator in-app /v1 smoke** — blocked by a QA-env quirk, not a product bug: the installed Jun-6 dev-client blocks cleartext http at APP level (proof: guest BROWSER reaches `http://10.0.2.2:4000/health` — backend log counts it; the app's fetch never arrives). Prod path is https and unaffected. Fix for next QA: build the next dev-client with `expo-build-properties` `usesCleartextTraffic: true`, or just smoke against prod https after your deploy (1 minute).
3. **Full local vitest vs prod DB: 105 pre-existing failures (43 files)** — NOT from today's diff (baseline-proven: worker-captures fails identically with today's changes stashed). CI's fresh-Postgres container is the real full-suite gate. Worth a dedicated triage session if you want laptop-full-suite green; the repo's verification practice (targeted real-DB suites) is unaffected.
4. Supervisor walk REWALK_PASSED + C-A2 placement; HR-portal/owner walks; cascade-delete decision (C2); swap-apply gap — all unchanged from the readiness assessment.

## First action next session

1. Check Telegram for the founder's `YES SEED` / `HR <phone>` reply → if present, run the staged HR screenshots and send them (everything is staged; see incomplete #1).
2. Then continue the founder deploy-runbook below (unchanged) — note it now includes the `/v1` deploy-ordering: **backend first, then admin-web**, then `eas update:configure`, then APK build last.

## ☀️ 2026-06-12 — supervisor walk's last two roots CLOSED (C-C + C-E)

The supervisor walk had three roots left open after the evening of 06-11: C-D was already fixed (`b225a50`); **C-C and C-E are now done this session.** Details in `docs/done-memos/2026-06-12-cc-ce-supervisor-walk-fixes.md` and the RESOLUTION section of `docs/walks/supervisor-screens/2026-06-11-1030/04-rca-and-fix.md`.

1. **C-C — the server is the sole authority on the 30-min reverse window** (the worst remaining BLOCKER, #6/#7). The client used timezone-naive math that false-closed the window on IST devices, then offered a path the server refused — a dead-end loop; scouting found it was worse (a non-reversible kind in-window had NO path: both `/reverse` and `/soft-flag` returned 422).
   - **Backend** (`activity-reverse-service.ts` + route `activity.ts`): `softFlagActivity` rejects `WINDOW_OPEN` only for reversible kinds; a non-reversible kind reaches HR anytime (its only path). De-jargoned the reverse/soft-flag copy; fixed the lying doc-comment. **Proven: real-DB regression `activity-reverse-regression.test.ts` 1/1** (new non-reversible-in-window→200 case + the reversible-in-window→422 no-regression check) against `DATABASE_PUBLIC_URL`.
   - **Mobile** (`app/(supervisor)/activity.tsx`): deleted the client window math; Reverse routes on KIND only and falls back to the HR sheet on a server `WINDOW_CLOSED`; HR-sheet copy parameterized by reason so it never says "window closed" for a kind that has no window. **Live re-walked** (`evidence/rewalk-2026-06-12/`): Reverse always-active + the honest "can't be undone directly" HR sheet.
2. **C-E — word-truth pass:** FlaggedReviewSheet (dev-note photo hint → honest; false "notifies HR" → "records it in the audit trail", grep-verified; US date → en-IN); `audit-summary.ts` DWI_EXPIRED → "A proposed decision expired unanswered after 48 hours." (was "Dwi expired."); Drawer "60-sec video" → "Quick guide" (live-proven).
3. **Honest boundaries:** the backend halves activate on your next deploy (proven by the regression test, not yet a prod walk). FlaggedReviewSheet copy + the reversible-in-window ReverseConfirmModal path are code-complete + tsc-clean but NOT live-screenshotted this session — no flagged visit and no rostered worker in current QA data (data boundary, not a defect). `tsc --noEmit` EXIT 0 both apps.
4. **Only C-A2 remains** from this walk: the orphan `summary` + `updates` supervisor screens (built + backend-backed, zero navigation) — a founder placement decision, recorded in 06-verdict. Not wired silently.

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
