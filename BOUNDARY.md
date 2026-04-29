# BOUNDARY.md — repo-wide architectural rules

This file states the non-negotiable rules for the whole monorepo. Every package and app has its own `BOUNDARY.md` declaring its specific contract.

## The dependency DAG

```
       apps/* ─────────┐
                       ▼
                 api-client ──────── (consumes shared-schema)
                       │
                 ai-tools ────────── (consumes shared-schema, errors)
                       │
                 ui-web ───────────┐
                 ui-native ────────┤
                                   ▼
                             ui-tokens ── (no internal deps)
                       │
                 state-machines ──── (consumes shared-schema)
                       │
                 business-rules ──── (consumes shared-schema)
                       │
                 copy ─────────────── (no internal deps)
                 errors ───────────── (no internal deps)
                 knowledge-graph ──── (consumes everything; nothing depends on it)
                       │
                       ▼
                 shared-schema ──── (no internal deps — THE SEED)
```

## Hard rules (ESLint-enforced)

1. **Apps never import apps.** `apps/backend` cannot import from `apps/mobile`.
2. **Packages never depend on apps.** No package may import from `apps/*`.
3. **`@axhy/shared-schema` imports nothing internal.** Zero internal dependencies. Period.
4. **`@axhy/ui-tokens` imports nothing internal.** Pure data + generators.
5. **`@axhy/copy` and `@axhy/errors` import nothing internal.** Leaf packages.
6. **`@axhy/ai-tools` never imports `@axhy/state-machines`.** AI is at the boundary; state machines are the spine. Never crossed.
7. **`@axhy/state-machines` never imports `@axhy/ai-tools`.** State machines are deterministic.
8. **`@axhy/knowledge-graph` is a leaf consumer.** Nothing imports it; it imports the world.

## Multi-tenant invariants

- Every domain table has `companyId` foreign key.
- Server-side gateway injects `companyId` from authenticated session.
- LLM can NEVER pass `companyId` directly.
- Postgres Row-Level Security (RLS) is defense in depth.
- Every backend test asserts cross-tenant isolation.
- Per-tenant rate limits at API gateway.

## Lineage requirement

Every exported symbol from any package must carry `@derives(adr-NNNN)` annotation in its JSDoc comment. The annotation links the symbol to its originating Architecture Decision Record. ESLint rule `axhy/require-derives` enforces.

## Engineering rules

- TypeScript strict mode everywhere; no `any`, no `as any`, no untyped catch.
- No `// TODO`, `// FIXME` in committed code; use ADRs and issues instead.
- No mocks in integration tests; real Postgres, real Railway sandbox tenant.
- Every state machine transition has a test.
- Every PR runs CI green for ALL packages, not just touched.
- Every commit message references an ADR (or `chore:` for trivial).

## When boundaries change

A package's boundary changes ONLY by:
1. Writing a new ADR
2. Linking it to the master-plan section it derives from
3. Updating the package's `BOUNDARY.md`
4. Running the lineage-audit job to verify graph consistency

Do not change boundaries silently.
