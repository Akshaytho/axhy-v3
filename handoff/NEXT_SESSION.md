# Next Session

**Last updated:** 2026-06-02 IST (late evening)
**Branch:** `chore/handoff-late-2026-05-31`
**HEAD:** `50b79ac`
**Rule:** single rolling handoff file. Do not create dated `NEXT_SESSION*.md`, `STATUS.md`, or `handoff/README.md`.

---

## What was completed this session (3 pushed batches + brain update)

### Batch 1 — `bd17fbb` (panel-verified worker scope)

- Backend role gates: `/chat/reload-context` and `/supervisor/decisions` reject WORKER role at preHandler (403, no tenant data touched). Multi-tenant `companyId` filter verified on every Prisma query.
- `POST /auth/sign-out` best-effort refresh-token revoke (defensive, never throws).
- Identity lifecycle: OneSignal.logout ordering before clearTokens, refresh-once mutex, 15s API timeout, role-guard rejects non-WORKER/SUPERVISOR.
- Worker shell: `_layout` WorkerDrawerProvider, history, profile, capture review, PhotoGridReview, top-level Drawer.

### Batch 2 — `e061d6c` (unblocked the held capture flow)

- `@derives(master-plan §G)` JSDoc added on 9 lint-failing exports across `worker-today-helpers`, `auth-pending-phone`, `capture-launcher` (`WorkerCaptureLauncher`), `CameraView` (`CapturedPhoto`).
- `WorkerDrawer.tsx` logout failure surfaces inline error banner (was silent in `__DEV__` console.warn; worker stranded "signed in" on revoke timeout). Drawer stays open on failure; auto-clears after 5s.
- Auth screens (`otp`, `phone`) + capture flow (`submit`, `qr-scan`, `PhasePhotoCapture`) shipped as transitives.

### Batch 3 — `50b79ac` (strict-QA fixes + honesty audit)

BLOCKER fixes:

- `submit.tsx` no longer lies. Outcome-specific UI: VERIFIED / FLAGGED ("Needs supervisor review", amber) / closed (CANCELLED/NO_SHOW/ARCHIVED — neutral) / timeout ("Still processing", blue). Poll timeout is its own honest state, not a silent flip to "done".
- Back-nav LOCKED on submit non-idle states. Android `BackHandler` + iOS `gestureEnabled: false` via `<Stack.Screen>`. Worker cannot re-enter `/review` or re-fire submit after AI has answered.

HIGH fixes:

- `capture-launcher.tsx` routes by visit.state: PHOTOS_PENDING -> review, AWAITING_VERIFICATION -> submit, IN_PROGRESS -> timer, terminal -> detail. Was always blindly to qr-scan, forcing re-shoot.
- `(worker)/index.tsx` FLAGGED separated into "Needs attention" group above "In progress". Was silently bucketed into "Completed".
- `timer.tsx` GPS lat/lng stripped from production logs (dev-gated). Privacy.

Storage test fix:

- `reinstall-rehydration.test.ts` + `photo-sweep.test.ts` mocks provide `Directory`/`File` class mocks matching SDK 54 production API (was still mocking legacy `getInfoAsync`/`readDirectoryAsync` from before commit `19505c5`). 4 failing tests now pass.

Honesty audit cleanup:

- 41 stale `[ORCHESTRATOR_EXCEPTION]` markers removed across 17 worker-scope files. 2 NextSiteCard `@derives` lines had embedded markers stripped while preserving the annotation.

Gates at push time (verified by orchestrator, not subagent claims):

- `pnpm --filter mobile run typecheck` — green
- `pnpm --filter backend run typecheck` — green
- `pnpm --filter mobile exec vitest run` — 99/99 pass (0 fail, 0 skip)
- `pnpm exec eslint <staged>` — clean
- Pre-commit audit + 15 learnings checks + gaming-pattern scan — all pass

### Brain (memory) updates

- New: `~/.claude/projects/-Users-thotaakshay-eclean-workspace/memory/feedback_qa_strict_production_standard.md` — 10-section strict-QA checklist; founder-mandated 2026-06-02 standard for every persona QA walk. MEMORY.md index updated.
- Updated: `axhy-cognitive-system/memory/base/sop_qa_enterprise_walk.md` — appended `2026-06-02 EXPANSION — STRICT PRODUCTION STANDARD` section.

---

## Cognitive-system layer-1 hooks neutered this session (uncommitted)

Founder directive 2026-06-02: reduce token churn from session-blocking hooks. Three layer-1 hooks early-exit; backups preserved next to each.

| Hook                         | Status   | Restore command                                                                    |
| ---------------------------- | -------- | ---------------------------------------------------------------------------------- |
| `orchestrator-counter.mjs`   | DISABLED | `mv orchestrator-counter.mjs.disabled-2026-06-02-bak orchestrator-counter.mjs`     |
| `sub-agent-commit-guard.mjs` | DISABLED | `mv sub-agent-commit-guard.mjs.disabled-2026-06-02-bak sub-agent-commit-guard.mjs` |
| `bash-guard.mjs`             | DISABLED | `mv bash-guard.mjs.disabled-2026-06-02-bak bash-guard.mjs`                         |

KEPT ACTIVE (real safety): `pre-edit-guard.mjs`, `pre-ask-guard.mjs`, `read-tracker.mjs`, `memory-firewall/storage-hook.mjs`, all post-commit/post-push audit hooks.

Decision needed next session: keep disabled, restore, or commit the disable as the new baseline.

---

## What is still incomplete (priority order)

### BLOCKER (red, not fixed this session)

- B-04 R2 CORS preflight 403 — web photo uploads fail; 0 `VisitPhoto` rows created in capture walk. Needs Cloudflare R2 bucket CORS policy update + verification.
- B-01 follow-up — `/profile` URL collision. Supervisor `profile.tsx -> me.tsx` rename was staged but unstaged this session. Rename + `(supervisor)/_layout.tsx` + `(supervisor)/me.tsx` mods are still on disk uncommitted. Cold-nav to `/profile` for a worker may still render supervisor route until rename is committed.

### HIGH (not fixed this session)

- `/worker/history` backend route missing — history screen shows today-only because no multi-day endpoint exists. Worker at month 6 sees no history.
- `timer.tsx` confirm-before-abandon — Home icon does `router.replace(workerHome)` with NO confirmation. One mis-tap mid-clean loses the timer + partial GPS.
- `use-worker-today.ts` refetch tuning — no `refetchOnWindowFocus` / `refetchOnMount` / `refetchInterval`. After tab-switch mid-flow, Today shows stale state until pull-to-refresh.
- `profile.tsx` counter math — "Remaining" silently drops FLAGGED + AWAITING_VERIFICATION + CANCELLED + NO_SHOW + ARCHIVED. Sites != Verified + Remaining when any of those exist.
- `history.tsx` FLAGGED drop — only filters VERIFIED; flagged visits disappear from worker's view.
- `qr-scan.tsx` close-X does `router.back()` which can pop out of `(worker)` layout entirely.
- H-05 — Refresh token in `localStorage` on web (mobile uses SecureStore correctly). Blocker if web ships.

### MEDIUM

- WorkerDrawer logout error banner is text-only; consider audible/haptic for accessibility.
- `submit.tsx` poll timeout banner says "still running" but does not auto-resume polling on app foreground.
- PhotoGridReview `r2UploadQueue.onChange` cleanup contract still unverified (subscription leak risk over 1y).

### LOW

- `(worker)/_layout.tsx` lines 31-32 + 159-160 commented-out DEV import for `SendToClaudeButton`. Dead code.
- `profile.tsx` `sanitizeDisplayName` strips `(real-phone)` suffix — signal that test fixtures leak into JWT name claims. Audit JWT issue path.

### Strict-QA standard tasks needing infrastructure (cannot do without DB/device)

- Real-data multi-tenant QA walk — strict standard forbids seeding shortcuts. Need DATABASE_URL + admin API access to create at least 2 companies x 2 HR x 2 supervisors x 5 workers x 10 visits/worker spanning all 12 states x 30 days history.
- Real-device forward/back walk — Expo Go on physical Android + iOS. Verify back-nav locks (Android BackHandler, iOS Stack.Screen gestureEnabled) actually fire on real hardware.
- State-machine walk — walk every persona UI in EACH of 12 Visit states (SCHEDULED, NOTIFIED, EN_ROUTE, ON_SITE, IN_PROGRESS, PHOTOS_PENDING, AWAITING_VERIFICATION, VERIFIED, FLAGGED, CANCELLED, NO_SHOW, ARCHIVED). Walk every legal + every illegal-transition attempt.
- Negative + edge + special + network + device + timing + concurrency + role cases — full matrix per `feedback_qa_strict_production_standard.md`.

---

## Out-of-scope uncommitted leftovers in working tree

Not touched (not worker scope or not verified):

- `.gitignore`, `handoff/*` (NEXT_SESSION updated; others not), `docs/learnings/*`, `packages/ai-tools/src/session-audit.ts`, `handoff/scripts/build-handoff-artifacts.mjs`
- Supervisor: `_layout.tsx` mod, `me.tsx` mod, `profile.tsx -> me.tsx` rename
- Untracked: `docs/audits/qa-2026-06-02/`, `done-memo-2026-06-02-axhy-boot-cleanup.md`, `scripts/claude-codex-collab.sh`
- 3 disabled hook `.mjs` + their `.disabled-*-bak` backups

---

## First action next session

1. Decide hook layer: keep disabled, restore, or commit the disable. Backups at `axhy-cognitive-system/src/layer-1-hook/*.disabled-2026-06-02-bak`.
2. Run `pnpm --filter @axhy/ai-tools run audit` from repo root.
3. Read this file only for handoff context (do NOT load other docs).
4. If continuing strict-QA: set up DATABASE_URL + real test data via admin API, then walk every state per `feedback_qa_strict_production_standard.md`.
5. If continuing BLOCKER list: start with R2 CORS (B-04 — actually blocks photo upload end-to-end), then `/worker/history` backend route, then supervisor rename (B-01 follow-up).
