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

## 🔴 FOUNDER ACTIONS (new + carried from 06-09)

1. **Deploy backend + admin-web** (your normal flow) — activates the two code-complete fixes: profile "My leave" (`/worker/leave-requests`) and the `/help` page. Until then the app shows a graceful fallback for leave, and help still hits /login.
2. **Rotate `JWT_SECRET`** (carried — prod still has the dev placeholder; jwt.ts:20 requires ≥32 chars).
3. **Apply migrations 023-030 to prod** (carried; runbook preserved in this file's git history + findings doc).
4. **RLS activation DECISION before any `DATABASE_URL` flip:** the 06-09 claim "app is axhy_app-ready" is NOT true for the read paths + in-process dispatcher — see `docs/findings/2026-06-10-full-codebase-deep-review-and-recommendations.md` §1 (Option A: GUC-wrap reads + separate dispatcher service; Option B: stay on postgres role). **Do not flip without choosing.** (New `worker-leave.ts` is already written RLS-correct either way.)
5. `/mcp` reconnect for the brain Pool fix (carried from 06-09).

## Standing grants you gave overnight (recorded verbatim in docs/walks/README.md — re-confirm at customer #1)

Prod fully open (data is fake/QA) · UI-first seeding (scripts only where no UI exists) · FIX AUTONOMY (sessions decide fixes: brain → proven internet research; never ask you to pick).

## Open work (carried forward, honestly scoped)

- **Ledger #20** (leave/swap/complaint state machines) + **#23 safe-half** (default-deny CI check) — unchanged from 06-09.
- Findings-doc launch items: OTA updates (expo-updates) + `/v1` API prefix before APKs ship; Sentry wiring; `healthcheckPath` in railway.json; restore drill; OTP per-phone attempt cap (S1); UTC "today" default in chat mark-absent (C1); photo compression (M2).
- Next walks (scoreboard: `docs/walks/README.md`): supervisor surface; then capture bad-days (kill-mid-capture, two-visits-same-time, QR-wrong-site) with a fresh visit.
- O7: soften the worker-facing AI-flag wording ("may be staged" reads accusatory to the worker; supervisor keeps full reasoning).
- Walk brain-ingest via `pnpm --filter @axhy/ai-tools brain:build` after `4aaca49` (walk .md → axhy_brain.chunks). Supersede rule: the next passing worker-screens walk deletes this one from the brain (folder stays in git).

## Test-infra notes (carried + new emulator facts)

- RLS suite + H6 commands unchanged from the 06-09 edition (see this file's git history).
- Emulator (also in worker-screens MAP §8): cold boot (`-no-snapshot-load`) is the reliable fix for dead network; stale AVD locks → `rm ~/.android/avd/eclean_test.avd/*.lock`; keep several GB disk free (gradle caches are safe purges when no build needed); prod backend needs NO LAN-IP trick (that's local-backend-only); Metro reachable via 10.0.2.2 on cold boot; `adb emu screenrecord screenshot` when screencap reads black.
