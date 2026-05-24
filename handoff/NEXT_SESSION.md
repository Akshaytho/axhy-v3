# Next Session — Worker code-review CLUSTER + FIX work

> **Read time: 5 minutes. Highest-priority file for the next session.**
>
> **Resume command:** "Read `axhy-v3/handoff/NEXT_SESSION.md` first, then `axhy-v3/handoff/WORKER_CODE_REVIEW_FINDINGS_2026-05-24.md`, then proceed."

## CLUSTER A — DONE (2026-05-24, commit `7ed1e80`)

Cluster A — anti-gaming + state-machine discipline — landed. 8 no-op `catch (err) { throw err; }` wrappers deleted across 5 files. CHEAT 3 in `docs/locked/development-anti-cheating.md` tightened. `session-audit.ts` CHECK 4 extended to flag the bare-throw form. Learning written: `docs/learnings/2026-05-24-all-no-op-rethrow-is-gaming.md`. X1 resolved.

**Sites fixed:** worker-today-service.ts (2), worker-submit-service.ts (1), worker-otp-verified-service.ts (1), api-submit.ts (2), identity-lifecycle.ts (2).
**Sites preserved (legitimate context-adding catches mis-classified by findings doc):** per-user-partition.ts:122-138, complaint-service.ts:318-327, chat-api.ts:142-150, photo-upload.ts:181-186.

### Known gaps / next-session debt from Cluster A

1. **Audit CHECK 4 comment-padded variant** — current regex catches `catch (err) { throw err; }` but NOT `catch (err) { // comment\n throw err; }`. Cluster A removed all comment-padded sites, but the audit can't prevent regressions of that form. Fix: add a comment-skip group to the regex (deferred this session because cognitive-system edit budget was exhausted mid-iteration).
2. **Audit Phase 3 false-positive** — the new learning's `check_pattern: 'no-op-rethrow'` returns 0 matches via Phase 3's grep helper, but manual `grep -rn 'no-op-rethrow' packages/ --include=*.ts` finds it at `packages/ai-tools/src/session-audit.ts:405`. Subtle bug in `session-audit.ts grep()` helper or Phase 3 path resolution. MEDIUM severity, not blocking.
3. **🐛 MCP guardrail bug — `check_before_edit` state freeze** — when calling `check_before_edit` with `answered_question` set, the MCP server updates `evidence` and `edits_remaining` but does NOT update `approved_files` or `intent`. The pre-edit-guard hook then blocks edits to the requested file because it's not in the (stale) approved_files. Workaround: call `check_before_edit` WITHOUT `answered_question` first to reset state, then re-call with the answer.
4. **🐛 Pre-commit challenge-response race** — `pre-commit.mjs:50-87` regenerates the challenge token every time the hook runs. Lint-staged + chat round-trip latency consistently pushed elapsed > 120 sec, so the founder-echoed token expired before the next retry could use it. Founder unblocked by running the commit directly from terminal. Long-term fix: extend `CHALLENGE_EXPIRY_MS` to 5+ min OR add a "carry approval across retries within session" mechanism.

### Remaining clusters (B/C/D/E) — founder sequencing still needed

- **Cluster B — Worker route consistency:** X2 (no rate limit), X5 (role gating), X6 (tenant-context), X7 (citing debt). Likely one shared Fastify plugin handles 3 of 4. 🚨 X2 remains non-deferrable per E3.
- **Cluster C — Submit + verify trust gaps:** X12 (polling success on timeout), X13 (setInterval async), X14 (silent catch), P4.1 (queue-empty-after-rehydration), P4.7 (no submit idempotency), P5.5 (uploading→idle on restore = duplicate uploads). 🚨 X12 remains non-deferrable.
- **Cluster D — Timezone correctness:** P2.1, P2.2, P1.6, P1.7. Needs `date-fns-tz` + `Company.tz` migration.
- **Cluster E — Test coverage:** X9 across all 5 worker test files. Single shared auth/role/ownership test utility.

Sub-slice 2c-1 (`leaveRequestMachine` + `swapRequestMachine`) still paused pending B-E sequencing decision.

---

## TOP PRIORITY — Worker code review findings (2026-05-24)

The 2026-05-24 session did a full read-only audit of the worker stack (43 files: mobile screens, mobile libs, backend routes, services, shared schemas, state machines). **No code was changed.** The findings live in `axhy-v3/handoff/WORKER_CODE_REVIEW_FINDINGS_2026-05-24.md`.

**Counts:** 14 cross-cutting findings (X1-X14) + 50+ pipeline-specific findings + 4 state-machine findings. 3 🚨 non-deferrable items: X1 (audit-gaming try/catch in ~12 files), X2 (no per-user rate limit on any `/worker/*` route), X12 (polling-success-on-timeout trust violation in submit.tsx).

**Founder's plan for next session:** cluster the findings by root cause, decide per-cluster which to fix-now / defer / discard, then implement in batches. Each cluster fix runs through `impactCheck` + `check_before_edit` + TDD.

**Suggested cluster groups** (next session refines):

- **Cluster A — Anti-gaming + state-machine discipline:** X1, X3, X4, X8. Root cause: audit rules that incentivize gaming + missing parse-at-boundary pattern. Fix template lives in `worker-otp-verified-service.ts:88-117`.
- **Cluster B — Worker route consistency:** X2 (rate limit), X5 (role gating), X6 (tenant-context), X7 (citing debt). Likely one shared Fastify plugin handles 3 of 4.
- **Cluster C — Submit + verify trust gaps:** X12 (polling success on timeout), X13 (setInterval async), X14 (silent catch), P4.1 (queue-empty-after-rehydration), P4.7 (no submit idempotency), P5.5 (uploading→idle on restore = duplicate uploads). All interact.
- **Cluster D — Timezone correctness:** P2.1, P2.2 (visit/[id].tsx device-tz bug), P1.6, P1.7 (DEFAULT_TZ hardcoded). Likely needs `date-fns-tz` and a `Company.tz` migration.
- **Cluster E — Test coverage:** X9 across all 5 worker test files. Single shared "auth/role/ownership" test utility.

**Open before sub-slice 2c-1:** founder may want some/all of these fixed before adding `leaveRequestMachine` + `swapRequestMachine`. Confirm sequencing at session start.

---

## Previous baseline (sub-slice 2b-4 complete, commit `08c65a5` — 2026-05-23)

> The original 2b-4 handoff content remains below for reference. Sub-slice 2c-1 (leaveRequestMachine + swapRequestMachine) is paused pending the code-review cluster work above.

# Next Session — Worker MVP Sub-slice 2b-4 (30-day sweep + reinstall rehydration)

> **Read time: 3 minutes. Highest-priority file for the next session.**
>
> **Resume command:** "Read `axhy-v3/handoff/NEXT_SESSION.md` and `MEMORY_V3.md` first, then proceed."

## Current commit baseline

Sub-slices `worker-d1-s2b-3-timer-submit` and `worker-d1-s2b-4-photo-sweep-queue-persistence` both shipped 2026-05-23 (commit `08c65a5`). The full cold-start durability layer is now in place: upload queue persists across app kills, orphaned photos from reinstalls auto-re-enqueue, and local photos older than 30 days are swept nightly.

## What's shipped in 2b-3

- **Backend:**
  - `apps/backend/src/lib/r2-presign.ts` — `buildObjectKey` parameter widened from `UploadUrlFile` to `Pick<UploadUrlFile, 'phase' | 'index' | 'contentType'>` so the submit service can reconstruct keys without `fileSize`. Resolves deferred item #3 from 2b-2 (server-side key reconstruction).
  - `apps/backend/src/lib/services/worker-submit-service.ts` — validates worker ownership + PHOTOS_PENDING guard, creates `VisitPhoto` rows (translating Zod lowercase `'before'/'after'` → Prisma `'BEFORE'/'AFTER'`), updates visit to `AWAITING_VERIFICATION`. Returns discriminated union `{ kind: 'OK' | 'NOT_FOUND' | 'WRONG_WORKER' | 'WRONG_STATE' }`. Resolves deferred item #5 from 2b-2 (phase case mismatch).
  - `apps/backend/src/routes/worker-submit.ts` — `POST /worker/visits/:visitId/submit` (WORKER-only, `withTenantContext` wrapper, maps result kinds to 200/403/404/409/400) + `GET /worker/visits/:visitId/verify-status` (WORKER-only, returns visitState + photos array with aiVerifyStatus).
  - `apps/backend/src/server.ts` — registered `registerWorkerSubmitRoutes(app)`.
  - `apps/backend/test/worker-submit.test.ts` — 7 real-DB integration tests (unauthenticated/wrong-role/wrong-worker/wrong-state/empty-photos/happy-path/verify-status). Requires `AXHY_DB_URL` / `DATABASE_PUBLIC_URL` / `DATABASE_URL` — run via `railway run -- pnpm --filter @axhy/backend test:integration`.
- **Mobile:**
  - `apps/mobile/lib/api-routes.ts` — added `workerSubmit` + `workerVerifyStatus` entries to `API_ROUTES`.
  - `apps/mobile/lib/api-submit.ts` — `submitVisit()` + `fetchVerifyStatus()` typed against shared Zod schemas.
  - `apps/mobile/app/(worker)/capture/[visitId]/timer.tsx` — real count-up MM:SS timer (setInterval, 1 s tick). `KeepAwake` inner component conditionally mounts on native (expo-keep-awake, tag `'axhy-timer'`). GPS sampled at mount and on "Done cleaning" tap via expo-location (Platform.OS guard, console.log only — no backend column yet, deferred to 2b-4+).
  - `apps/mobile/app/(worker)/capture/[visitId]/submit.tsx` — state machine `idle → submitting → polling → done | error`. Reads `r2UploadQueue.snapshot()` filtered to visitId + status='done'. Polls `fetchVerifyStatus` every 3 s (max 40 polls). `mountedRef` guards state updates on unmount.
- **Shared:**
  - `packages/shared-schema/src/zod/worker-submit.ts` — `WorkerSubmitPhotoSchema`, `WorkerSubmitRequestSchema`, `WorkerSubmitResponseSchema`, `VerifyStatusPhotoSchema`, `VerifyStatusResponseSchema`.
  - `packages/shared-schema/src/index.ts` — re-exports `./zod/worker-submit.js`.
- **QA:** `apps/mobile/scripts/qa-worker-d1-s2b-3-timer-submit.ts` — Playwright script (gitignored). SPA-nav fix: navigates between capture steps via button clicks (`page.getByRole('button', { name: ... }).click()`) instead of `page.goto()`, keeping the in-memory `r2UploadQueue` alive. Intercepts: `upload-urls` → fake presign, `mock-r2.dev PUT` → 200 OK, `submit` → fake AWAITING_VERIFICATION, `verify-status` → AWAITING_VERIFICATION on first call / VERIFIED on second. 10 screenshots.

## Deferred — carry forward to 2c and beyond

1. **Batch presigns** — carried from 2b-2. Mobile still sends single-file requests; backend supports up to 20/batch.
2. **`FileSystem.uploadAsync` streaming PUT** — carried from 2b-2. Current path loads full file into JS heap.
3. **GPS persist + motion guard** — timer.tsx logs GPS at start/end, no backend column yet. Motion check (accelerometer) deferred.
4. **`MAX_PHOTO_BYTES` collision** — shared-schema exports 20MB; mobile 8MB. No consumer imports both today.
5. **Upload-queue `emit()` churn on retry path** — cosmetic, deferred.
6. **No debounce on onChange** — queue persistence fires on every mutation; acceptable for MVP queue sizes (~40 photos/visit max).

## What's shipped in 2b-4

- **`apps/mobile/lib/storage/local-kv.ts`** — file-backed KV store using `Paths.document.uri`; no AsyncStorage dependency
- **`apps/mobile/lib/storage/photo-sweep.ts`** — `maybeSweepOldPhotos(workerId)` sweeps dirs >30 days old, throttled once/24 h via `axhy-sweep-lastRun` KV key
- **`apps/mobile/lib/storage/queue-persistence.ts`** — `saveQueueState`/`loadQueueState`; excludes done items; resets uploading→idle on restore; key `axhy-queue-v1`
- **`apps/mobile/lib/storage/reinstall-rehydration.ts`** — `rehydrateFromPartition(workerId)` scans partition for orphaned photos not in queue and re-enqueues
- **`apps/mobile/lib/r2-upload-queue.ts`** — added `hydrate(items)`: merges persisted items without overwriting live state, then triggers pump
- **`apps/mobile/lib/storage/per-user-partition.ts`** — added `listVisitDirs(workerId)`; `writePhoto` gained try/catch+rethrow
- **`apps/mobile/app/(worker)/_layout.tsx`** — useEffect wires cold-start init + onChange queue persistence + AppState foreground sweep (no JSX changes)
- **16 unit tests** across photo-sweep.test.ts, queue-persistence.test.ts, reinstall-rehydration.test.ts

## Decisions still in force (don't re-debate)

| Decision                                                                                                      | Source                                                          |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 3-tab canonical (Home / History / Profile); capture surfaces as Home banner                                   | `DELTA.html` divergence #1 resolved 2026-05-21                  |
| Theme picker cut at MVP                                                                                       | `DO_NOT_BUILD_MVP.md` M14                                       |
| Photo storage: app-internal only, no gallery, per-user partition, R2 incremental upload, 30-day local cleanup | Founder direction 2026-05-21 — pipeline landed 2b-2, sweep 2b-4 |
| Location permission asked upfront on (auth)/permissions screen alongside Camera                               | Founder lock 2026-05-22 (Option B)                              |
| Sprint mode ON — no per-rev friend review, batch panel review at end of sprint                                | `feedback_supervisor_sprint_mode.md` (carried)                  |
| All commits sign with `Co-Authored-By: Claude Opus 4.7 (1M context)`                                          | Convention from existing log                                    |

## Discipline gates active

- `check_before_edit` on every code Write/Edit (Layer 1 pre-commit hook enforces).
- `check_before_plan` on every plan/persona/handoff Write/Edit (architecture evidence + source hierarchy required).
- `check_before_done` on every done-memo write (quality gate L3+ required to pass).
- Pre-commit eslint rule `axhy/require-derives` blocks exports without `@derives(ADR-NNNN)` or `@derives(master-plan §X.Y)` JSDoc.
- Pre-commit `docs/personas/` changes need `AXHY_FOUNDER_APPROVED=1`.

## Known caveats carried forward

- **Brain build works locally via `.env.local`.** `axhy-v3/.env.local` (gitignored, repo root) holds `DATABASE_PUBLIC_URL` + `OPENAI_API_KEY`. Run: `set -a && source .env.local && set +a && pnpm --filter @axhy/ai-tools brain:build`. Confirmed working 2026-05-23.
- **Expo Web duplicate-tab quirk:** the Tabs navigator renders a faint duplicate tab row in the body area of step screens. Not present on real device; ignore for scaffold work.
- **Backend integration tests require Railway DB.** Run via `railway run -- pnpm --filter @axhy/backend test:integration` or with `.env.local` exported.

## What starts next: sub-slice 2c-1 (leaveRequestMachine + swapRequestMachine)

**Scope:**

1. `leaveRequestMachine` in `packages/state-machines/src/` — IDLE → PENDING → APPROVED / REJECTED / CANCELLED
2. `swapRequestMachine` in `packages/state-machines/src/` — IDLE → PENDING → CONFIRMED / REJECTED / CANCELLED
3. Unit tests for both machines (XState, no DB)
4. Backend: `POST /worker/leave-requests`, `POST /worker/swap-requests` + mobile Leave sheet + Swap sheet screens

## First thing to do in next session

1. **Run `pnpm --filter @axhy/ai-tools run audit`** to confirm clean baseline.
2. **Run brain:build** to load semantic memory: `set -a && source .env.local && set +a && pnpm --filter @axhy/ai-tools brain:build`.
3. **Read this file's "Deferred — carry forward"** list so carry-forward items don't get re-discovered.
4. **Check existing machines** in `packages/state-machines/src/` — leaveRequestMachine or swapRequestMachine may already be stubbed.
5. **Start 2c-1** per `WORKER_MVP_SLICE_2A_PLAN.md`.
