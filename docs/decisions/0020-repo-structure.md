# ADR-0020: Repo structure — 3 apps + 12 packages, lockstep versioning

- **Status:** Accepted
- **Date:** 2026-04-29
- **Master plan §:** §K (build plan)
- **Panel debate:** 2026-04-29-repo-structure

## Context

Solo founder. Monorepo. Need clear seams that prevent V2-style cross-contamination. Need ESLint-enforceable boundaries.

## Decision

```
axhy-v3/
├── apps/        backend, admin-web, mobile
├── packages/    12 packages with strict dependency DAG
├── tools/       internal tooling (graph-builder, seed-data, voice-benchmark, master-plan-extractor)
├── docs/        architecture, decisions, workflows, journeys, runbooks, security, invariants, master-plan
├── tests/       cross-package tests (ai-eval, voice-benchmark, e2e)
├── scripts/     one-off utility scripts
└── .github/workflows/  CI
```

Dependency DAG (apps depend on packages; packages have strict layering; `shared-schema` is the seed with zero internal deps).

Lockstep versioning — every package shares the monorepo version. Single semver across all packages.

## Consequences

### Positive
- Boundaries are explicit, ESLint-enforceable
- Single `pnpm install`, single CI matrix
- Lockstep versioning eliminates cross-package drift
- ≤ 12 packages cap forces packages to earn existence

### Negative
- Cannot publish a single package independently to npm without unbundling
- Slightly higher CI cost (touched-package detection still works via Turbo)

### Neutral
- Adopt independent versioning (changesets) only if a package gets open-sourced

## Lineage

- **Derives from:** master plan §K, V2 retrospective
- **Affects:** entire repo
