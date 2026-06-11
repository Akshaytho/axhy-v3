# Done memo — RLS Option-A wiring (2026-06-12 00:45 IST)

**Founder trigger:** "yes wire RLS and proceed" (2026-06-11 ~21:50 IST).

## Built — all 30 breaking sites from the 48-file audit

1. **Dispatcher split** (06-09 decision made real): NEW `dispatcher/db.ts` — `dispatcherPrisma` IS the singleton until `DISPATCHER_DATABASE_URL` is set; ai/notifications/owner-budget handlers + all 3 cross-tenant sweeps ride it via the `client` param. NEW fail-fast probe in the tick: a non-RLS-bypass role crashes the process naming the fix; transient errors retry. The audit's worst silent no-op (visits stuck AWAITING_VERIFICATION, spend uncharged) is now an impossible state.
2. **6 supervisor read routes** → NEW `tenantReadClient` (official Prisma RLS client-extension: per-query batch tx `[set_config, query]`) — Cluster-1 parallelism preserved, reads RLS-correct, living-doc upsert passes WITH CHECK, no ACTIVE gate (INVARIANT 2).
3. **3 worker read routes** → NEW `withWorkerTenantRead` (user GUC → own-Worker self-read → company GUC, one tx, 15s timeouts kept, NO_WORKER semantics identical).
4. **`revokeForCompromise`** — epoch bump under correct GUC sequencing; bonus: a deleted membership no longer rolls back the token revoke.
5. **`anonymizeTurnEmbeddings`** — set_config-then-execute tx per locked vector-rag §3.3. Stale-comment truth pass across all touched routes.

## Proof

- tsc + eslint clean (17 files).
- Lab = fresh prod dump → `:5433/axhy_rls_lab` (29 policies, 27 FORCE-RLS, 156 grants verified): NEW `test/rls-option-a-routes.test.ts` **8/8 as axhy_app** with 2 NEGATIVE CONTROLS reproducing the audit bugs on the bare client; existing RLS suites **18/18**; probe SQL verified both roles.
- Targeted prod-DB regression as postgres: supervisor today/summary/context/updates/living-doc + worker today/history/visit + owner-budget **green**. `outbox-dispatcher` is flaky against the LIVE prod dispatcher (different test fails per run, incl. on base — shared-Outbox race, pre-existing). `auth-refresh-happy` + `auth-refresh-compromise-detect` fail identically on the BASE tree (git-stash-verified pre-existing; happy-path asserts `isPlatformAdmin=true` on seeded data that no longer matches).

## Prod findings → founder runbook (handoff §FOUNDER ACTIONS 4)

`axhy_app` is NOLOGIN with no password; ZERO grants on schema `axhy_chat` (flip would break chat embeddings). Role SQL + env order + smoke + one-var rollback all written out. I was permission-blocked from prod role changes (correct — founder-owned).

## Honest scope

Prod flip/deploy founder-owned. Vector tables not lab-executable (no pgvector on lab PG17) — anonymize fix is pattern-identical to the proven insert path. Extension-client latency verified by mechanism + lab, not prod-distance timing (smoke step covers it). C-C/C-E walk fixes NOT here — scouting + full fix design recorded in the walk's 04-rca-and-fix.md (incl. the NEW non-reversible-kind in-window dead-end found tonight).
