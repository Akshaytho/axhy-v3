---
broken_rule: 'self-reasoning protocol Phase 2 (impactCheck/vectorSearch) must be functional or the session degrades silently'
persona: all
date: 2026-05-19
session: 'Wave A — sidebar + chat AI compliance'
check_pattern: 'axhy_brain\.chunks'
check_paths: 'packages/ai-tools/src'
check_expect: 'exists'
---

# Learning: `brain:build` requires `axhy_brain.chunks` schema to exist

## What happened

`railway run -- pnpm --filter @axhy/ai-tools brain:build` failed with:

```
error: relation "axhy_brain.chunks" does not exist
```

The brain schema migration has never been applied to the Railway sandbox
DB. This means `impactCheck()` and `vectorSearch()` — the Phase 2 tools
of the self-reasoning protocol — are offline for any session that does
not explicitly handle this state. The session continued from filesystem
truth (per `docs/locked/ai-fact-verification.md`) but a less careful
session might have proceeded on a stale `impactCheck` cache without
noticing.

## Root cause

Two issues braided:

1. The `axhy_brain` schema initialization is not in the standard
   `prisma migrate deploy` flow — it lives in a separate seed step that
   wasn't run on this Railway project yet.
2. `brain:build` does not check the schema exists before attempting an
   `INSERT INTO axhy_brain.chunks` and instead crashes with a Postgres
   `42P01` error.

## Prevention rule

1. `brain:build` should detect the missing schema at startup and emit a
   clear, actionable error: "Run `pnpm --filter @axhy/ai-tools brain:init`
   first to create the schema."
2. `session-audit` Phase 0 should check vector DB connectivity and degrade
   gracefully — printing a HIGH warning "vector DB unavailable; impactCheck
   will return empty" — rather than letting the session believe the brain
   is functional.

## Reference

- Brain builder: `packages/ai-tools/src/brain-builder.ts`
- Wave A session: plans/abstract-wandering-kazoo.md (Brain stress-test catch #2)
