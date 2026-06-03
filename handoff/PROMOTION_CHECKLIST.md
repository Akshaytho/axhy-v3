# Promotion Checklist — Draft → Active

> **Use this every time** a Draft design spec is promoted to Active. Drift starts when promotion is half-done. Run end-to-end or do not promote.

## Steps (in strict order)

1. ☐ **Founder approval received.** Explicit text or commit message stating approval. Verbal-only approval without written record → wait.
2. ☐ **Frontmatter updated** in the spec file: `Status: Draft → Active` (or `Active but contract-incomplete` per doc-discipline protocol).
3. ☐ **canonical-truth entry added.** Row in `docs/index/canonical-truth.md` with: file path, status, brief summary, primary owner.
4. ☐ **Soft cross-refs added in older Active specs.** Each existing spec that has deferred items now answered by the new spec gets a brief paragraph pointing to it. Reference pattern: 2026-05-14 commit `e9c5ca1` (responsibility model promotion + cross-refs in D.1 + product framing).
5. ☐ **`NEXT_SESSION.md` updated** — reflect the new authority status, remove "Draft pending approval" qualifiers for this spec, and note any phase-level impact that used to live in `STATUS.md`.
6. ☐ **`ROADMAP.md` updated** if the promotion advances the build phase (e.g., Layer 1 unblocks Layer 2 planning).
7. ☐ **`done/<date>-<phase>.md` archive entry added** if this promotion closes a phase.
8. ☐ **Memory pointer wording updated** in `MEMORY_V3.md` if the previous wording said "Draft pending approval" for this spec. Remove that qualifier.
9. ☐ **Commit message documents the promotion** — include all checklist items in the commit body so the git history records the full state change.

## Verification after promotion

- Grep the repo for "Draft" references to the now-Active spec → update each one to "Active."
- Check `MEMORY_V3.md` no longer carries Draft wording for this spec.
- Check that the original Draft file path is reachable as Active (i.e., the file wasn't renamed during promotion; only frontmatter changed).

## When NOT to promote

- Founder approval is verbal-only without commit / written record → wait.
- The new spec contradicts a currently-Active spec without resolving the contradiction → resolve first; either pick one side or amend both in the same promotion.
- Cross-refs in older specs haven't been written → do steps 4 + 5 together as one commit.
- `NEXT_SESSION.md` would become misleading after a partial promotion → finish the full checklist before merging.

## Why this exists

The biggest drift risk in v3 is a Draft spec that _behaves_ like Active inside this codebase but never gets the cross-refs + canonical-truth entry that would make it actually binding. Half-promoted docs cause:

- Future sessions reading the older Active specs as primary because that's where canonical-truth still points.
- Implementation work proceeding against a spec that "looks Active" but isn't in canonical-truth.
- Inconsistent memory pointers (some say "Draft," some say "Active").
- Audit trail unable to reconstruct what was actually binding at any moment.

**The checklist is mandatory.** Skip it and the audit-driven design work loses durability across sessions.
