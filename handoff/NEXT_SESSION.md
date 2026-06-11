# Next Session

**Last updated:** 2026-06-11 03:50 IST · **Branch:** `chore/handoff-late-2026-05-31` — **PUSHED to origin** (through `4aaca49`). Main merges remain founder-owned (branch is 78 ahead / 0 behind main).

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
4. **RLS activation DECISION before any `DATABASE_URL` flip** — THE ONE REMAINING GATE. Migrations 023/024 put the RLS infra in place but it is **inert** because the app connects as the `postgres` superuser (bypasses RLS). Flipping to `axhy_app` needs your Option A/B choice — see `docs/findings/2026-06-10-...md` §1 (Option A: GUC-wrap the read paths + split the dispatcher; Option B: stay on postgres). **Do not flip without choosing.**
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
