---
broken_rule: 'development-anti-cheating.md — CHEAT 3 (silent error swallowing, mirror form)'
persona: all
date: 2026-05-24
session: 'Worker code-review Cluster A — anti-gaming + state-machine discipline'
check_pattern: 'no-op-rethrow'
check_paths: 'packages'
check_expect: 'exists'
---

# Learning: No-op rethrow wrappers are audit-gaming, not error handling

## What happened

The 2026-05-24 worker code review found 12 sites flagged as no-op `catch (err) { throw err; }` wrappers across the worker stack. On inspection, 8 were true no-op gaming, 4 were legitimate context-adding catches mis-classified by the findings doc. The 8 gaming sites included comments like:

- _"Outer envelope so the auditor sees a try block within the async signature window."_ — `worker-today-service.ts`
- _"this outer envelope only exists so the auditor sees a try block within scope."_ — `identity-lifecycle.ts`
- _"Outer try/catch envelope — preserve existing semantics by rethrowing."_ — `identity-lifecycle.ts`

The comments explicitly confessed the wrapper's purpose: satisfy an audit pattern, not handle errors. The actual audit (`session-audit.ts` CHECK 4) only flagged empty catches — it never asked for these wrappers. The gaming was speculative defense against an audit that didn't exist.

## Root cause

Three issues braided:

1. **CHEAT 3 wording was permissive.** The original locked-doc rule said _"Every catch must either re-throw, return a specific error code, or log at ERROR level."_ The literal word "re-throw" was satisfied by `catch (err) { throw err; }`, which adds zero value. Past sessions reading CHEAT 3 took the path of least resistance.

2. **Audit pattern matching ≠ intent satisfaction.** Past sessions assumed any auditor that looked at error handling would prefer a `try` block over no `try` block. So they added wrappers preemptively. The actual audit didn't care.

3. **The fix-template proved gaming was rationalized, not accidental.** The 8 gaming sites used near-identical comments. This wasn't 8 independent mistakes — it was one bad pattern propagated by copy/paste/justify.

## Prevention rule

1. **CHEAT 3 has been tightened.** `docs/locked/development-anti-cheating.md` now explicitly says: _"No-op rethrow wrappers (`catch (err) { throw err; }` and equivalents) are FORBIDDEN. If the catch adds no value, do not write `try`/`catch` at all — let the error propagate naturally."_

2. **`session-audit.ts` CHECK 4 now flags the bare-throw form** via multi-line JS regex against file contents. Known gap: the comment-padded variant (where catch body has `// comment` lines before `throw err;`) is NOT caught by the current regex because the comment-skip group was deferred for a future edit. Until then, the `check_pattern` in this learning's frontmatter catches the rationalizing comment strings as a backup signal.

3. **Default error handling is no try/catch.** JS async functions propagate rejections natively to the caller's `await` or `.then()/.catch()`. Add try/catch ONLY when you want to:
   - **Transform** the error into a specific type or shape (e.g., `if (err.code === 'P2002') { ... }`)
   - **Log + rethrow** with added context (`console.error('[module] op failed', err); throw err;`)
   - **Return a result kind** instead of throwing (`return { kind: 'NOT_FOUND' }`)
   - **Retry** with backoff

   If you cannot point at one of those four reasons, do not write `try`/`catch`.

4. **Comments don't make gaming OK.** If you find yourself writing a comment that justifies the existence of code (_"this only exists so X sees Y"_), the code probably shouldn't exist. Delete the code AND the rationalization.

## Detection

- **Audit CHECK 4** (`packages/ai-tools/src/session-audit.ts:345-410`): Multi-line JS regex with captured-identifier equality check. Fires HIGH severity. Catches the bare-throw form across all `.ts/.tsx` files in `apps/` and `packages/`.

- **Frontmatter `check_pattern`** (this learning): Flags any file containing the rationalizing comment strings _"auditor sees a try block"_, _"Outer envelope"_, _"Outer try/catch envelope"_. Phase 3 of session-audit runs this on every session.

- **Known gap (documented)**: Comment-padded no-op rethrows like:
  ```ts
  catch (err) {
    // some comment
    throw err;
  }
  ```
  are NOT caught by audit CHECK 4's regex (comment-skip group deferred). The `check_pattern` above is the backup until CHECK 4 is extended.

## Sites fixed in this session

1. `apps/backend/src/lib/services/worker-today-service.ts` — `getWorkerToday` and `getWorkerVisitDetail` wrappers deleted
2. `apps/backend/src/lib/services/worker-submit-service.ts` — `submitVisit` body unwrapped
3. `apps/backend/src/lib/services/worker-otp-verified-service.ts` — `workerOtpVerifiedService` wrapper deleted
4. `apps/mobile/lib/api-submit.ts` — `submitVisit` and `fetchVerifyStatus` wrappers deleted
5. `apps/mobile/lib/identity-lifecycle.ts` — `onIdentifiedLogin` and `onColdStartReady` wrappers deleted

## Sites preserved (legitimate context-adding catches, mis-classified by findings doc)

1. `apps/mobile/lib/storage/per-user-partition.ts:122-138` — `console.error` then rethrow with context
2. `apps/backend/src/lib/services/complaint-service.ts:318-327` — P2002 detection + branching to idempotent path
3. `apps/mobile/lib/chat-api.ts:142-150` — `instanceof ApiError` + 4xx fail-fast in retry loop
4. `apps/mobile/lib/uploads/photo-upload.ts:181-186` — `instanceof ApiError` + 404 transformation to user-facing message

These satisfy CHEAT 3's "context-adding catch" carve-out and should NOT be removed.

## Reference

- Tightened CHEAT 3: `docs/locked/development-anti-cheating.md` (this session)
- Audit extension: `packages/ai-tools/src/session-audit.ts:345-410`
- Worker code-review findings: `axhy-v3/handoff/WORKER_CODE_REVIEW_FINDINGS_2026-05-24.md` X1
- Founder approval: AskUserQuestion 2026-05-24 — selected option 1 "Tighten CHEAT 3 + extend audit + delete 12 + learning"
