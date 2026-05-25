---
broken_rule: 'feedback_never_assume_check_entire_codebase_and_docs.md — Never assume — scan codebase'
persona: all
date: 2026-05-25
session: 'admin-hr-backend-wave-2-prep slice — spec referenced services and column constraints that did not match code reality'
check_pattern: 'wraps existing'
check_paths: 'apps/backend/src,packages'
check_expect: 'pattern matches the comment marker left in code when an aspirational spec claim is caught and corrected (1 marker per catch, anchored in the from-scratch service file)'
---

# Learning: "wraps existing" in a spec must be grep-verified before planning

## What happened

The wave-2-prep design spec (`docs/plans/2026-05-25-admin-hr-backend-wave-2-prep.md`) said R3 anonymize "wraps existing identity-lifecycle service." During implementation-plan writing, a grep of `apps/backend/src/lib/services/` returned zero `anonymize*` or `identity-lifecycle*` files. The service was **aspirational** — described as if it existed, but it did not.

Additionally during R3 implementation: I wrote `hashPhone()` returning `anon:<32 hex>` = 37 chars. User.phone is `String @unique @db.VarChar(16)` in the schema. The first integration test exposed this with PrismaClientKnownRequestError code P2000 ("value for the column is too long"). I had not read the User.phone column type before deciding the hash length.

Both errors share one root: writing or planning code from memory of what the schema or services "should" look like, rather than from grep + Read.

## Founder reminder (2026-05-25)

> "No assumptions of code is allowed, if code is not there then its not there.
> Lies are great until they are caught, truth is painful in present but it
> makes our future beautiful if we accept our mistakes and try to learn and
> improve ourselves. No lies or wrong doing can last."

This learning exists to make sure that pattern is detectable and blocked next time.

## Root cause

Two failures braided:

1. **Spec written from a mental model, not from code.** Past sessions described an "identity-lifecycle" service in abstract terms; the term carried forward into the spec; nobody grep'd before writing it down. The spec sounded confident, so the implementation plan accepted it.

2. **Implementation written without verifying column constraints.** User.phone is `VarChar(16)` per the existing schema. I assumed a generic `String` because it conceptually holds an E.164 number (~13 chars) — never checked. The migration history (`20260507_phase_a_baseline_day3`) would have shown the constraint immediately if I had read it.

## Prevention rule

Before any plan step or doc paragraph that names an "existing X" — whether service, helper, column, route, type, or migration — the author MUST:

1. `grep -rn "<exact-name>" apps packages` — if 0 hits, the thing doesn't exist; remove the claim or replace with "to be built in this slice."
2. If the claim is about a column or table, `grep -A 3 "model <Name>" packages/shared-schema/prisma/schema.prisma` — read the actual type and constraints.
3. If the claim is about a migration's effect, find the migration file and read the SQL.

Specs and plans live or die by accuracy. An aspirational claim is functionally a lie and will surface as a runtime error during execution — best case it costs a debug round-trip, worst case it silently passes production until customer data is corrupted.

## Detection

- **Pre-commit `check_pattern`**: `wraps existing|existing\s+[a-zA-Z_-]+\s+service|leverages the existing` in `docs/plans/` + `docs/personas/`. Any match prints a warning + the grep verification step the author must complete in the same diff.
- **Manual gate**: when reading a spec that says "wraps existing X", the implementer MUST grep for X before continuing. If 0 hits, the implementer either treats it as "build from scratch" and revises the estimate, or asks the founder.
- **Column-truth gate**: any service that writes to a column with a length-bounded type (VarChar, Text-with-CHECK) MUST cite the type in a code comment near the write site, and the test MUST exercise the boundary.

## Concrete artefacts from this catch

- `apps/backend/src/lib/services/anonymize-worker-service.ts` (built from scratch, NOT a wrapper)
- `hashPhone()` produces `anon:<11 hex>` = 16 chars exactly = User.phone VarChar(16) limit (verified via `\d "axhy"."User"` after migration).
- Integration test `admin-workers.test.ts > anonymizes Worker` asserts the actual phone column write succeeds, confirming the length contract.

## Related

- `docs/learnings/2026-05-25-all-qa-pass-is-a-slice-needs-preflight.md` — same family: claims unverified against code
- `feedback_never_assume_check_entire_codebase_and_docs.md` — the original rule
- founder direction 2026-05-25: "truth is painful in present but it makes our future beautiful"
