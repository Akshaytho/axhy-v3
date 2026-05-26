---
broken_rule: 'Book Architecture spec Section 6 — boot summary must report external state from fresh artifact, never from prior-session memory'
persona: all
date: 2026-05-26
session: 'Book Architecture post-completion boot — stale-memory citation failure'
check_pattern: 'per S[0-9]{2,4}\b.*\b(baseline|established|tests pass|brain has|gaps documented)\b'
check_paths: 'apps,packages,handoff'
check_expect: 'none'
---

# Learning: Boot summaries may not cite prior-session memory as current external state

## What happened

The first session to use the new Book Architecture boot produced a summary containing two evidence-substitution errors:

1. **Skipped a needed `brain:build`.** The model checked the latest doc commit time and concluded "no new docs since 9dd6e3d" — but it didn't check what had been committed _since_ the last brain rebuild. 13 doc commits had landed (including `BOOK_ARCHITECTURE_COMPLETE.md`, the Phase 5 validation retro, and the Phase 1 digest). The brain was three sessions behind.

2. **Cited a stale session memory as current truth.** The boot summary claimed "previous session established baseline (11/15 retrieval tests pass, 4 cross-repo content gaps documented in S339)". That observation was from before the `OPENAI_API_KEY` fix landed. After the fix, all retrieval categories returned `_embedding_mode: real` with scores 0.42-0.59 — i.e., the brain was healthy, not degraded. The summary asserted a degraded state that no longer existed.

The founder caught both errors immediately. The relevant transcript exchange is the load-bearing evidence for this learning.

## Root cause

Two distinct mechanisms, same class of failure:

**Mechanism 1 — soft conditional in a structural protocol.** The boot's Step 2 said "Run brain:build if needed — only if new docs/learnings exist since last build." The phrase "if needed" delegates a tool-decidable check to the model's judgment. Models facing soft conditionals will rationalize the cheaper branch. The right design: the tool decides, not the model. `brain-builder.ts` already hashes every scanned file and short-circuits unchanged ones — running it unconditionally costs ~3 seconds and zero OpenAI calls when nothing has changed. Removing the conditional removes the failure mode.

**Mechanism 2 — past observations treated as evidence for present claims.** Memory recalls _what was true at a point in time_. The model must verify the recalled fact against current reality before citing it as evidence for a present-state claim. Today's failure happened because the boot's Step 3 ("Book health check") described _verification_ but did not require a _fresh artifact_. With no artifact requirement, the cheaper substitution (recall a memory) won out over the more expensive verification (run a query). The right design: the boot summary must quote a verbatim summary line from a script that ran in this session. If the script can't run, the boot states that explicitly and uses an MCP `impact_search` snapshot as fallback. Memory citations for external state are prohibited regardless of whether the recalled fact happens to still be accurate.

## Prevention rule

**Boot summaries may never cite prior-session observations about external state as current truth.** External state includes (but is not limited to): brain content, retrieval test pass/fail counts, DB row counts, deploy status, Railway env presence, MCP tool availability, third-party API health, recently-committed file state.

Permitted citations of past state:

- _"As of 2026-05-26 18:30 (S339), 4/15 retrieval tests failed because of missing OpenAI key — verifying that fix today: ..."_ — past observation explicitly framed as starting-point context, with a fresh check performed.
- _"This session at 19:33 ran brain:build: inserted 2, unchanged 179."_ — present-session fresh fact.

Forbidden citations:

- _"Previous session established baseline (11/15 retrieval tests pass)."_ — past observation asserted as current truth.
- _"Per S339, brain has content gaps for E1/E6/E13."_ — past observation asserted as current truth.
- _"Skipping brain:build — no new docs since last build."_ — heuristic substituting for the tool's own freshness check.

The rule applies regardless of whether the recalled fact happens to remain accurate. The discipline violation is the act of substituting memory for verification.

## Detection

Layered defense — no single detection mechanism is sufficient on its own.

- **Forbidden-phrase audit** (`check_expect: none`): the frontmatter pattern `per S[0-9]{2,4}\b.*\b(baseline|established|tests pass|brain has|gaps documented)\b` is run by `session-audit.ts` Phase 3 against `apps/`, `packages/`, and `handoff/` (the .ts/.tsx files Phase 3 scans, plus any markdown in handoff/ if Phase 3 is later extended). Zero matches is the desired state. If anyone ever commits text like `"per S339 baseline"` or `"per S272 tests pass"` to those paths, the audit fails. This catches leakage of the anti-pattern into committed artifacts.

- **Brain retrieval**: this file is indexed in the brain via `brain:build`. Any future boot calling `impactCheck("boot summary discipline")` or `impactCheck("load axhy system")` surfaces this rule. The Book Architecture spec Section 6 references this learning by path, so impactCheck on "boot sequence" surfaces it transitively. This catches recall of the rule when the model thinks about boot.

- **Pre-edit-guard / spec drift**: if a future session edits Section 6 of `axhy-cognitive-system/docs/superpowers/specs/2026-05-26-book-architecture-design.md` to weaken either the unconditional `brain:build` rule or the fresh-artifact rule, the edit must pass `check_before_edit` with explicit acknowledgment that this learning is being overridden. This catches attempts to remove the rule.

- **Known runtime-enforcement gap**: a grep across the model's conversational output itself (the actual boot-summary text Claude emits) is not implementable from `session-audit.ts` — the summary is ephemeral conversation, not a committed artifact. Detection is therefore guidance + retrieval + drift-prevention + forbidden-phrase audit, but not runtime enforcement of the live response. A future stronger mechanism would record the boot summary into a committed transcript file the audit can grep.

- **Known audit limitation**: `session-audit.ts` Phase 3 (the per-learning check runner) hardcodes its grep extensions to `.ts/.tsx` only (`packages/ai-tools/src/session-audit.ts:219`). Learnings that target markdown content (this one, plus `2026-05-25-all-qa-pass-is-a-slice-needs-preflight.md`) cannot use `check_expect: exists` against `.md` files until Phase 3 is extended to include `.md`. This learning works around that by inverting the polarity — flagging the anti-pattern when it leaks into source code, rather than asserting the rule's documentation existence.

## Reference

- Book Architecture spec Section 6 (revised this session): `axhy-cognitive-system/docs/superpowers/specs/2026-05-26-book-architecture-design.md`
- Original boot failure transcript: this session's exchange where the model claimed "no new docs since 9dd6e3d" and cited "S339" as current truth
- Idempotency evidence for unconditional brain:build: today's `brain:build` output `inserted 2, unchanged 179`
- Fresh-artifact evidence: MCP `impact_search` returned `_embedding_mode: real` with scores 0.42-0.59 across 4 verification categories (worker photo, guardrail mandate, book architecture, data deletion)
- Operational gap: `scripts/brain-health-preflight.mjs` uses plain `node` and cannot import `.ts` adapter modules — must be migrated to `tsx` before the spec's `npm run test:brain-health` invocation in Step 3 is fully operational
