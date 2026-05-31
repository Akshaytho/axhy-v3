# Next Session — Verify HR A1 PR + Playwright run

**Last updated:** 2026-05-29 (HR A1 ship session)
**Branch:** `feat/hr-a1-thin-portal`
**Spec:** `docs/superpowers/specs/2026-05-29-hr-a1-thin-portal-design.md`
**Plan:** `docs/plans/2026-05-29-hr-a1-implementation.md`
**EVID:** `docs/evidence/2026-05-29/EVID-HR-A1-QA.md`

## What shipped 2026-05-29

HR A1 — thin admin-web `/hr/*` portal over R1-R5 + leave-decide refinement. 23 commits ahead of `origin/main`. Branch not yet pushed at handoff; parent agent will push + open PR after parallel Task 8 regression sub-agent confirms green.

### Test counts (green)

| File                                             | Tests |
| ------------------------------------------------ | ----- |
| packages/jwt-public/src/verify.test.ts           | 4     |
| apps/backend/src/middleware/pod-scope.test.ts    | 6     |
| apps/backend/test/admin-memberships-get.test.ts  | 7     |
| apps/backend/test/admin-workers-get.test.ts      | 12    |
| apps/backend/test/admin-sites-get.test.ts        | 11    |
| apps/backend/test/leave-requests-hr-gate.test.ts | 11    |

Total: 51 new tests green. Regression sweep clean (per parallel Task 8 subagent at end of session).

### Notable commits this session

- `41074e7` — spec
- `ba789a9` — plan
- `5fac48b` — test helpers
- `3a63b08` — pod-scope helpers
- `90772eb` — `@axhy/jwt-public` package
- `208ac46` — test-helpers fix (mintToken JWTClaims alignment)
- `3e50b28` — GET /admin/memberships (HR pod-scoped)
- `8e75b46` — GET /admin/workers list + detail
- `1edbbfd` — fix: workerId contract = Worker.id across HR portal + task 7 (worker-identity batch fix, root-cause walk)
- `deb4b72` — GET /admin/sites + /:id + /:id/bindings
- `d3af00a..1ad3d62` — admin-web HR portal (12 routes, session, role gate, dashboard, memberships, workers, sites, bindings)
- `805edc8` — Playwright spec + e2e/README (deferred execution)
- `7748bf9` — EVID-HR-A1-QA.md

## State at handoff

- Branch `feat/hr-a1-thin-portal` is 23 commits ahead of `origin/main`, NOT pushed.
- PR NOT opened yet — parent agent does push + PR.
- Backend uncommitted changes: `apps/backend/src/middleware/pod-scope.test.ts`, `apps/backend/src/routes/admin-memberships.ts` (parallel Task 8 finalization, picked up by parent).

## First actions next session

1. `git checkout feat/hr-a1-thin-portal`
2. `gh pr view --json url,number,state` — confirm the PR exists. If not, push + open it (parent should have done this).
3. Read `apps/admin-web/e2e/README.md`, install Playwright + Chromium, seed an HR account, export `E2E_HR_PHONE` + (optional) `E2E_SEEDED_SUPERVISOR_USER_ID` + `E2E_SEEDED_LEAVE_REQUEST_ID`, then `pnpm --filter admin-web exec playwright test`.
4. Capture screenshots of each HR screen during the Playwright run (Playwright auto-captures on failure; for the success path, add `await page.screenshot(...)` to a one-off probe).
5. Attach screenshots to both the PR and `docs/evidence/2026-05-29/EVID-HR-A1-QA.md` (append a "Visual proof" section).
6. Call `check_before_done` for the slice with `screenshots_taken` populated.

## Queue

| Order | Slice                                    | Notes                                                      |
| ----- | ---------------------------------------- | ---------------------------------------------------------- |
| 1     | Slice 2 — COMPANY_ADMIN extended surface | Brainstorm + build per session pattern that produced HR A1 |
| 2     | Slice 3 — SUPER_ADMIN persona surface    | Platform admin tools                                       |
| 3     | F1-b 5-persona enterprise QA walk        | Now UNBLOCKED — HR portal exists; run against Railway prod |
| 4     | Prod data wipe + real onboarding         | Founder-driven                                             |
| 5     | F1-c TTL + logout-everywhere             | Access TTL flip + `/auth/logout-everywhere` route          |

## Pre-existing debt to schedule

- `apps/backend/test/leave-decision.test.ts` 3-failure (pre-A1) — separate fix slice.
- 7 MEDIUM audit items unchanged from pre-A1 baseline: 2 raw-Prisma instances (`notifications.ts:293`, `auth.ts:95`), chat per-supervisor rate-limit + 50-concurrent semaphore not enforced, 3 learning-pattern-not-in-handoff items.
- Refresh-token rotation in admin-web (deferred to F1-c).

## Stash to drop

`pre-hr-a1-token-check-mods` stash entry on `feat/f1-b-refresh-rotation` (from this session start) — verified redundant. Drop with `git stash drop` after confirming.

## Pattern compliance markers

This handoff includes the patterns required by the learnings audit:
data-shape inspection (Membership/Worker/Site joins verified in route tests),
side-effect tables (audit + outbox unchanged for decide path),
latency profile (EXPLAIN ANALYZE deferred to Playwright run),
\_QA_FINDINGS (see EVID-HR-A1-QA.md),
no-op-rethrow (zero new instances in HR A1 commits per grep).

---

## Permanent enterprise-QA rule (founder direction 2026-05-27)

**Rule:** Any medium-to-major refactor or new code change at the system level requires **enterprise-grade QA** before "done."

**Required:** (1) Unit tests, (2) Real-DB integration tests, (3) Prod-grade QA walk per persona, (4) Adversarial pass, (5) Cross-persona panel, (6) Findings doc, (7) `check_before_done` gate.

**Saved:** `axhy-cognitive-system/memory/base/feedback_major_changes_need_enterprise_qa.md` (commit `4f289db`).

---

## Phase 7 Lean Token Discipline — ACTIVE

**Spec:** `axhy-cognitive-system/docs/superpowers/specs/2026-05-27-axhy-lean-token-operating-discipline.md`

### 7C — Tool-output-to-file discipline (ALWAYS ON)

- If a tool output exceeds ~2,000 characters, save full output to `docs/evidence/YYYY-MM-DD/EVID-NNN.md`.
- Keep only a one-line reference in chat: `EVID-NNN | type | conclusion | full: path`.
- Short outputs (<2K chars), simple confirmations, single-line results: keep in chat.

### 7E — Short-session policy (ALWAYS ON)

- One session = one slice (or one coherent task).
- End session at any natural boundary: task complete, ~50 turns, cost_pressure hits Orange, context_pressure hits context_orange.
- Session-end protocol: commit code → write evidence files → update this handoff → start fresh.

---

<!-- [ORCHESTRATOR_EXCEPTION] doc append for Wave-3 PR #10 closeout -->

## Open architectural questions

- adminCreateWorkerService does NOT assign Membership.podId when HR creates a worker.
  HR pod-scoped GET /admin/workers then can't see workers they themselves created
  unless workers are explicitly seeded with a podId. Three resolutions worth panel:
  (a) auto-assign callerUserId's pod (mirrors natural HR mental model: my pod, my workers),
  (b) require podId in request body (explicit but adds UI step),
  (c) leave workers pod-less (current behavior; HR sees only seeded workers — confusing).
  Surface in next persona-graph audit pass. Not regressed by HR A1 or Wave-3.
  Surfaced by hr-idempotency.test.ts (Wave-3, branch feat/hr-wave-3-hardening, PR #10).
