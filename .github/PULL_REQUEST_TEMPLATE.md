# Pull Request

## What changed

<!-- one sentence -->

## Why

<!-- the motivation; reference the master plan section, ADR, or panel debate -->

## Lineage

<!-- which ADR(s) does this derive from or change? -->

- Derives from: ADR-XXXX
- Affects packages: @axhy/foo, @axhy/bar
- Affects apps: apps/backend, apps/mobile

## Concepts touched

<!--
Tables / state machines / routes / packages / tool surfaces affected.
Helps reviewers AND future AI subagents tracing impact.
Replace with the actual list — examples: Assignment table, ChatThread,
propose_create_assignment tool, latest_visit view, etc.
-->

## Re-debate triggers added/changed

<!--
If this PR creates a new lock or changes one, list the conditions
under which it should be revisited. None = leave empty.
-->

## Test plan

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated (real Postgres)
- [ ] Cross-tenant isolation asserted (if backend change)
- [ ] AI eval fixtures unchanged or improved
- [ ] Manual flow tested as the relevant persona (Mr. Reddy / Kavitha / Ravi / Suresh)

## Graph impact

- [ ] Structural graph regenerates cleanly (CI green)
- [ ] No new orphans (lineage audit green)
- [ ] No version drift on derived ADRs

## Checks

- [ ] No `any` types
- [ ] No `// TODO` / `// FIXME` left in code
- [ ] All exported symbols carry `@derives(ADR-NNNN)`
- [ ] Personal-data fields carry `@personal` annotation
