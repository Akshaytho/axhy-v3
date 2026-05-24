---
Status: LOCKED
Locked by: Founder (Akshay Thota)
Locked at: 2026-05-19
Category: architecture_lock
---

# Development Anti-Cheating Measures

How the Development AI (Claude Code) cuts corners, and how to catch each one.

## CHEAT 1: "TODO: implement later"

**What happens:** The AI writes a TODO comment and moves on.
**Why it's wrong:** TODOs never get implemented. They accumulate.
**Prevention:** No TODO comments in committed code. If something can't be done now, it's either a separate task (tracked) or it's not done at all.
**Detection:** `grep -r "TODO\|FIXME\|HACK\|XXX"` in pre-commit hook.

## CHEAT 2: `any` type

**What happens:** The AI uses TypeScript `any` to avoid type errors.
**Why it's wrong:** `any` disables the type system. Bugs hide in `any`.
**Prevention:** tsconfig strict mode. No `any` in committed code. If a type is genuinely unknown, use `unknown` and narrow.
**Detection:** `grep -r ": any"` + `tsc --noEmit` with strict.

## CHEAT 3: Silent error swallowing (and its mirror: no-op rethrow gaming)

**What happens:** Two forms.

1. `try { ... } catch { }` with empty catch block — bugs vanish silently.
2. `try { ... } catch (err) { throw err; }` — a no-op rethrow wrapper that adds zero behavior but makes the function _look_ like it has error handling. Past sessions used this to satisfy auditors that pattern-matched on `try` blocks. Functionally dead code.

**Why it's wrong:** Form 1 hides bugs. Form 2 is gaming — it lies to the auditor and to future readers about whether the function actually handles errors. Both erode trust in the codebase.
**Prevention:** Every catch must do _real_ work: re-throw _with added context_ (wrap, log, transform), return a specific error code/result kind, or log at ERROR level with the original error. **No-op rethrow wrappers (`catch (err) { throw err; }` and equivalents) are FORBIDDEN.** If the catch adds no value, do not write `try`/`catch` at all — let the error propagate naturally.
**Detection:** Code review. `grep` for empty catch blocks (`catch.*{[[:space:]]*}`) AND for no-op rethrows (`catch \([^)]+\)[[:space:]]*{[[:space:]]*throw [^;}]+;?[[:space:]]*}`). Enforced by session-audit CHECK 4.

## CHEAT 4: Optimistic frontend

**What happens:** The UI updates before the server confirms.
**Why it's wrong:** If the server rejects, the UI shows stale state.
**Prevention:** All decision cards show PROPOSED state until Apply succeeds. The Apply button shows a spinner. On success -> update. On failure -> revert + show error.
**Detection:** Search for state updates before `await` completes.

## CHEAT 5: Missing edge cases in Zod schemas

**What happens:** Zod schema validates the happy path but allows garbage.
**Why it's wrong:** Invalid data enters the DB and corrupts downstream logic.
**Prevention:** Every Zod schema must handle: empty string (min 1 or trim + reject), null vs undefined, extremely long strings (max length), invalid UUID format, negative numbers where only positive allowed, array with 0 items vs 1000 items.
**Detection:** Write tests for each edge case.

## CHEAT 6: Hardcoded values instead of Policy/config

**What happens:** The AI hardcodes "200" as the message limit.
**Why it's wrong:** Can't be configured per company. Changing requires deploy.
**Prevention:** Configurable values go in Policy table or environment variables. Hardcoded values only for TRUE constants (UUID format, HTTP status codes).
**Detection:** `grep` for magic numbers in business logic.

## CHEAT 7: Raw SQL without parameterization

**What happens:** Template literal SQL: `WHERE name = '${input}'`
**Why it's wrong:** SQL injection.
**Prevention:** All SQL uses parameterized queries ($1, $2). Never string interpolation for user input.
**Detection:** `grep` for template literals in `.query()` calls.

## CHEAT 8: Testing only the happy path

**What happens:** Tests cover "mark absent succeeds" but not "mark absent when worker already absent" or "mark absent when company is suspended."
**Why it's wrong:** Edge cases are where bugs hide.
**Prevention:** Every test file must cover: happy path, already-done (idempotency), invalid input (Zod rejection), unauthorized (wrong role), not found (missing worker/site), race condition (concurrent requests).
**Detection:** Code review. Coverage reports. Mutation testing.

## CHEAT 9: Premature abstraction

**What happens:** The AI creates BaseService, AbstractHandler, FactoryPattern for something with exactly one implementation.
**Why it's wrong:** Premature abstraction is harder to change than duplication.
**Prevention:** If there's only one implementation, write the concrete thing. Extract an abstraction only when the THIRD copy appears and the pattern is proven. Three similar lines > one premature abstraction.
**Detection:** Count implementations. If AbstractX has only ConcreteX, remove.

## CHEAT 10: "Works on my machine" verification

**What happens:** The AI runs tsc and says "typechecks clean" without actually testing the feature.
**Why it's wrong:** Type correctness is not feature correctness.
**Prevention:** For UI changes: open in browser/emulator, test golden path + 2 edge cases, take screenshots. For API changes: run integration test suite. For schema changes: run full migration + seed + test cycle.
**Detection:** Require screenshot evidence for UI changes.

## CHEAT 11: Ignoring rule hierarchy in prompt composition

**What happens:** The AI loads LivingDoc rules but forgets to load Company/HR rules from Policy, or loads them in wrong order.
**Why it's wrong:** Supervisor's rules override company rules — the #1 way the AI produces wrong decisions.
**Prevention:** Prompt composition function has explicit layer ordering. Unit test: inject conflicting Layer 1 and Layer 3 rules, verify Layer 1 wins.
**Detection:** Specific test for rule hierarchy conflicts.

## CHEAT 12: Skipping impactCheck before code changes

**What happens:** The AI starts writing code without checking locked constraints.
**Why it's wrong:** The AI undoes correct code to match its own (wrong) understanding, or contradicts a founder-locked decision.
**Prevention:** Self-reasoning protocol Phase 2 is mandatory. impactCheck("description of what I'm about to do") must run. If hardBlocks returned, STOP and show to founder.
**Detection:** CLAUDE.md enforces this. Vector DB surfaces conflicts.
