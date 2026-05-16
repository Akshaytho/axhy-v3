# Active Slice

> Exactly one slice in flight at any time. This file is the single source of truth for the dashboard's "Current slice focus" callout AND the page-header active-slice banner.
>
> **Format (locked 2026-05-16 by friend's directive):** Problem in simple English → Simplest business rule → Code only if still needed → Why that code is necessary.

## In simple English

**Problem:** F-007 (merged at `79e38aa`) writes `push` Notification rows with `deliveredAt=NULL`, but no mobile app is calling `OneSignal.login(external_id = User.id)` to register the device subscription that F-011's future delivery adapter will target. Without F-006a, F-011 has no real device to deliver to. F-006a is the smallest possible slice that adds the identity-lifecycle hook — minimum viable surface that F-011 can build against.

**Simplest business rule (v6 LOCKED):** when a SUPERVISOR-role user OTP-verifies, after the existing token storage step, call `OneSignal.login(external_id = User.id)` via a NEW `identity-lifecycle.ts` module that exposes ONE ordered sequence: `onIdentifiedLogin(authResult)` → JWT-role check (reject non-SUPERVISOR `memberships[0]` with typed error) → `setTokens()` → JWT decode → conditional `OneSignal.login(userId)`. `onAppLogout()` calls `OneSignal.logout()` BEFORE `clearTokens()` (3s timeout falls open) to prevent phantom subscription leak on User A → User B switch on same device. `onColdStartReady(tokens)` re-fires `OneSignal.login()` on app launch. **All OneSignal calls guarded by `shouldCallOneSignal()`** — return false on web OR when `EXPO_PUBLIC_ONESIGNAL_APP_ID` undefined → no-op with warning log; auth flow always succeeds. **Pre-prompt explainer modal** before OS native push permission prompt; navigation is exactly-once across all 5 prompt branches. **Supervisor-shell-only routing** — non-SUPERVISOR `memberships[0]` is rejected with "coming soon" rather than landed in broken supervisor UI. **F-006a does NOT** ship the backend delivery adapter (F-011), in-app panel UI (F-006b), token rotation / auth-switch (separate slice not yet scoped), or full E2E tests.

**Code (only after round-2 v6 scope-artifact approval — APPROVED 2026-05-17 00:56):** new `apps/mobile/lib/identity-lifecycle.ts` (~120 lines, ONE ordered sequence + `shouldCallOneSignal()` guard + `NonSupervisorRoleNotSupportedError` typed error) + new `apps/mobile/components/PushPermissionPrompt.tsx` (explainer modal + exactly-once nav contract) + migration `apps/mobile/app.json` → `apps/mobile/app.config.ts` (translate all fields + add `@onesignal/onesignal-expo-plugin` with `EXPO_PUBLIC_ONESIGNAL_APP_ID` env-var reference) + deps in `apps/mobile/package.json` (`react-native-onesignal` ^5.x + `@onesignal/onesignal-expo-plugin` ^2.x + `jwt-decode` ^4.x) + edits to `otp.tsx` / `profile.tsx` / `app/index.tsx` / `auth-store.ts` JSDoc warning + 15 unit tests across 2 files.

**Why this code is necessary:** F-011 (OneSignal push delivery adapter) needs a real user identity-link on the device to target push notifications. Without F-006a's `OneSignal.login(external_id)` call, F-011 ships into a vacuum. F-006a is the smallest possible slice (`OneSignal.login` + `OneSignal.logout` + cold-start re-link, ~15 lines of business logic plus tests) that gives F-011 a real consumer to build against. Friend's "vertical slices" rule: F-006a is the minimal mobile foundation F-011 must rest on.

## Current

| Field                  | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Slice name**         | `f-006a-onesignal-identity-lifecycle` (F-006a — first slice of the β-split: F-006a → supervisor UI draft → backend gap list → F-011/F-006b cleanly)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Status**             | `CODE_AWAITING_APPROVAL` 2026-05-17 03:00 (after friend's CODE-phase P1+P2 round-3 / CHANGES_REQUESTED). Friend caught two remaining gaps: (P1) `_resolveOneSignal()` still returned a live SDK handle on init failure → `login`/`logout`/`requestPermission` could hit an un-initialized SDK; (P2) the bare-boolean latch had a TOCTOU race → concurrent warm-up + chokepoint could both call `OneSignal.initialize`. Round-3 fix: `initializeOneSignal()` now returns `Promise<boolean>` (success-gate), `_resolveOneSignal()` short-circuits to null on failure, and the latch is a `Promise<boolean>` so concurrent callers await the same in-flight promise. 2 new unit cases prove the contract (16 = init-failure no-op; 17 = concurrent init = 1 invocation). 49/49 tests green. Awaiting friend's `CODE: APPROVED`. |
| **Branch**             | `feat/f-006a-onesignal-identity-lifecycle` — forked from main `ffce21b` 2026-05-17.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Last landed commit** | `ffce21b` — `docs(handoff): F-007 → DONE; merged to main at 79e38aa; next-slice picker surfaced (F-006+F-011 together recommended)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Dependencies**       | F-001 + F-002 + S-001 + F-003 + F-004 + F-007 — all DONE on main. F-006a does NOT depend on F-011 (the reverse: F-011 will consume the identity-link F-006a establishes). Owner must provision OneSignal account before EAS Build lands, but local dev + Playwright web tests work without it (no-op path).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Tests status**       | GREEN — 22 F-006a unit cases passing inside a 49/49 total via `pnpm --filter @axhy/mobile test`. Files: `apps/mobile/lib/identity-lifecycle.test.ts` (17 cases — 10 lifecycle + 3 init + 2 ordering + 2 init-failure/concurrency) + `apps/mobile/components/PushPermissionPrompt.test.ts` (5 cases on the pure `buildPromptOutcomeRunner` factory).                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Verification gate**  | Unit tests green + manual smoke documented (real device + OneSignal sandbox project — 4 smoke scenarios). Stop at AWAITING_APPROVAL.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## §0 Pre-decided product behavior (rule 27, locked in F-006a scope)

Full §0 lives in [handoff/feature-queue/scopes/F-006a.md §0](../feature-queue/scopes/F-006a.md). Summary:

- **OneSignal architecture rule (v8 — locked):** our DB owns truth + audit + unread/read + panel; OneSignal owns push subscription plumbing + delivery transport. F-006a installs the SDK + adds identity-lifecycle hooks for `external_id = User.id`.
- **Single mobile app at `apps/mobile/`** — Expo 54, Expo Router v6, RN 0.81. ONE explicit identity contract.
- **JWT-scoped role rule** — F-006a accepts login ONLY when `authResult.memberships[0].role === 'SUPERVISOR'`. Local `activeRole` always matches the JWT-scoped membership; no client-side role-switch in this slice.
- **Login/logout correctness MUST NOT depend on native SDK presence** — on web or when no App ID, OneSignal calls no-op cleanly.
- **Supervisor-shell-only routing** — non-SUPERVISOR `memberships[0]` is rejected with "coming soon" rather than landed in broken UI.
- **Exactly-once navigation** after the prompt, across all 5 branches.

## 8 picks in the round-2 v6 scope artifact

Full text + ONE ordered sequence + each pick's lock conditions live in [handoff/feature-queue/scopes/F-006a.md §2](../feature-queue/scopes/F-006a.md). Summary:

1. **OneSignal SDK choice** — `react-native-onesignal` ^5.x via `@onesignal/onesignal-expo-plugin` ^2.x (managed Expo plugin).
2. **Identity-lifecycle contract** — ONE ordered sequence (`onIdentifiedLogin` → JWT-role check → setTokens → JWT decode → conditional `OneSignal.login`; `onAppLogout` → conditional `OneSignal.logout` (3s timeout) → clearTokens; `onColdStartReady` → defensive role check → conditional re-link).
3. **`external_id` = `User.id`** (UUID, tenant-scoped via `User.companyId` FK; decoded from JWT payload via `jwt-decode`).
4. **Logout ordering** — `OneSignal.logout()` BEFORE `clearTokens()` (3s timeout, falls open).
5. **Permission prompt UX + exactly-once navigation** — pre-prompt explainer modal → OS native prompt; navigation fires exactly once across all 5 branches.
6. **App ID configuration via `app.config.ts`** — migration from `app.json` shipped in this PR.
7. **Cold-start identity re-link** — `onColdStartReady` called from `app/index.tsx` after `getTokens()` returns non-null.
8. **NO panel UX, NO `ackedAt` writes** — F-006b territory.

## Audit emits on F-006a run

- **ZERO new audit events from F-006a.** F-007 owns all `supervisor_change` Notification persistence + zero audit emits. F-011 will fire `WORKER_SUPERVISOR_CHANGE_NOTIFIED` at delivery time. F-006a is mobile-only client code; no backend write paths.

## What this slice does NOT do (explicit non-claims)

- Does NOT ship the backend OneSignal push delivery adapter — **F-011**.
- Does NOT render any in-app notification panel / banner / unread-count — **F-006b**.
- Does NOT solve push delivery for workers with `Worker.userId IS NULL` (no login → no identity-link; **F-012 SMS** is the future path).
- Does NOT change F-007 persistence behavior (merged at `79e38aa`).
- Does NOT implement token rotation / client-side auth-switch (rare mixed-role case requires a separate auth-switch / backend-ordering slice not yet scoped).
- Does NOT make login/logout depend on native SDK presence (web + no-App-ID paths no-op cleanly).
- Does NOT ship full mobile E2E tests (Maestro/Detox) — unit tests + manual smoke only.
- Does NOT fix the `User.deletedAt` vs `User.status` discrepancy in F-011's INDEX entry (flagged for F-011 scope phase).
- Does NOT touch any backend code.

## Post-F-006a roadmap (owner suggestion 2026-05-17 00:22 + friend endorsement)

Revised sequence after F-006a ships:

1. **F-006a (this slice — minimal mobile identity shell)** — ship first, stay minimal.
2. **Supervisor UI draft slice** — build supervisor UI aggressively against existing supervisor backend; use UI build as pressure test for backend gaps.
3. **Backend gap list** — output of step 2's UI work; whatever feels missing during UI work becomes the real backend change list.
4. **F-011** — OneSignal push delivery adapter once supervisor UI surfaces the actual delivery semantics needed.
5. **F-006b** — worker mobile panel + in-app banner UI, inherits learnings from supervisor UI draft.

## Decision needed (after code phase, at AWAITING_APPROVAL)

- `CODE: APPROVED` → merge to main; F-006a → DONE; surface next slice (supervisor UI draft).
- `CODE: CHANGES_REQUESTED on file/test N` → update + re-surface.
- `HOLD` → F-006a pauses pre-merge.

## Hash-truth convention

Hash columns above name ONLY landed commit hashes. After a commit lands, the NEXT edit to this file names that commit explicitly.

## F-001..F-007 closure summary (for cross-slice context)

| Slice                                  | Status                             | Approval at    | Friend's verbatim                                                         |
| -------------------------------------- | ---------------------------------- | -------------- | ------------------------------------------------------------------------- |
| F-001 (binding-effective-routing)      | DONE                               | —              | —                                                                         |
| F-002 (chat-writes-proposed-decisions) | DONE (merged `a29f9f6`)            | HEAD `12c1df6` | "P1 is really fixed · P2 is really fixed enough for approval · APPROVED." |
| S-001 (same-day-supervisor-freeze)     | DONE (merged `a29f9f6`)            | HEAD `2a0f27c` | "Decision: APPROVED."                                                     |
| F-003 (cron + binding-expire-sweep)    | DONE (merged `2bc815b`)            | HEAD `c4c335b` | "Decision: APPROVED."                                                     |
| F-004 (HandoffPackage composer)        | DONE (merged `b19e03c` 2026-05-16) | HEAD `ef0aadd` | "F-004 is approved for merge."                                            |
| F-007 (Notification persistence)       | DONE (merged `79e38aa` 2026-05-16) | HEAD `cbb7646` | "CODE: APPROVED. Owner can push this branch and merge to main."           |
