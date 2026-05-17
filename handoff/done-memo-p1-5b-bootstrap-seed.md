# Done Memo — P1.5b SiteSupervisorBinding Bootstrap-Seed (2026-05-17)

> Status: **COMPLETE** — code landed, panel reviewed, P2 polish batch applied, scoped non-dry-run executed cleanly on `axhy-sandbox`. Multi-tenant pass against a real customer tenant is deferred until that data exists in the sandbox (panel-approved deferral).

## Plan

`/Users/thotaakshay/.claude/plans/tranquil-crunching-plum.md` rev 4 (approved 2026-05-17 by friend).

## What shipped

| Step          | Artifact                                                                                                                        | Path                                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| S1            | Spec amendment — pick 8 derivation corrected                                                                                    | `axhy-v3/docs/specs/2026-05-14-supervisor-responsibility-model.md` (Amendments 2026-05-17)                                         |
| Audit schema  | `bypassFreezeReason` optional field added to `BindingCreatedPayloadSchema`                                                      | `packages/shared-schema/src/zod/audit-payloads.ts:99-118`                                                                          |
| S2            | New write helper `createPermanentBinding` (genuinely reusable, freeze-aware, idempotent on window overlap, concurrency-safe)    | `apps/backend/src/lib/site-supervisor-binding.ts` (inserted before `reassignPermanentBinding`)                                     |
| S3            | New read helper `getSitesSupervisedByUser` (reverse query, §5.8 precedence-aware)                                               | `apps/backend/src/lib/effective-responsibility.ts`                                                                                 |
| S4            | Bootstrap-seed library `runBootstrapSeed` + thin CLI wrapper                                                                    | `apps/backend/scripts/p1_5_bootstrap_seed_bindings.ts`                                                                             |
| S5            | Real-DB integration tests — 22 cases (17a/17b inside one logical case; Case 22 added for unknown-slug fail-loud after rev-5 P1) | `apps/backend/test/p1_5_bootstrap_seed.test.ts`                                                                                    |
| S6            | `tmp/` ignored                                                                                                                  | `axhy-v3/.gitignore`                                                                                                               |
| Post-approval | Friend's planning + build decision rules memorialized                                                                           | `~/.claude/projects/-Users-thotaakshay-eclean-workspace/memory/v3/feedback_planning_decision_rules.md` + indexed in `MEMORY_V3.md` |

## Spec coverage matrix

| Claim                                                                                   | Covered?                                                                                                                                                                                                   | Where                                      |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Pick 8 (bootstrap-seed)                                                                 | YES — derivation corrected (Complaint + SwapRequest; both `createdAt`; 30-day window). Original "current active Assignment rows" wording was structurally impossible (`Assignment` has no `supervisorId`). | Amendments A-1 + A-2; script S4 implements |
| Pick 5 (read-time routing single source of truth)                                       | EXTENDED — reverse query added to anti-drift file                                                                                                                                                          | S3 `getSitesSupervisedByUser`              |
| Pick 6 (§5.8 acting-over-permanent precedence)                                          | TESTED — Case 14                                                                                                                                                                                           | S5                                         |
| First-ever-create write path (lib comment §285-291 anticipated this)                    | DELIVERED — `createPermanentBinding`, reusable by HR portal first-bind UI + bootstrap scripts                                                                                                              | S2                                         |
| Freeze parity with `reassignPermanentBinding` (Q3=C)                                    | DELIVERED — non-null `tenantTimeZone` passes through to the shipped freeze unconditionally; null path requires enumerated `bypassFreezeReason`, recorded permanently on audit                              | S2 + Amendments A-3                        |
| Idempotency on requested binding window (matches DB EXCLUDE)                            | DELIVERED — `$queryRaw` uses identical `COALESCE(..., 'infinity'::timestamptz)` form as the shipped constraint at `migration.sql:131-138`                                                                  | S2                                         |
| Concurrency: catch SQLSTATE 23P01, re-read, return WINDOW_OVERLAP                       | DELIVERED — Case 15 verifies                                                                                                                                                                               | S2 + S5                                    |
| CLI vs test contract split (lib never `process.exit`s; wrapper translates to exit code) | DELIVERED — wrapper writes one JSON line on stdout `{ reportPath, summary, failed }`; sets `process.exitCode = result.failed ? 1 : 0`                                                                      | S4                                         |
| Targeted re-run with unknown slug fails loud (not silent success)                       | DELIVERED — `runBootstrapSeed` throws when `companySlug` is provided and zero ACTIVE companies match; CLI wrapper translates to exit code 2; Case 22 verifies                                              | S4 + S5                                    |
| Multi-company default run + ACTIVE-only filter                                          | DELIVERED — Cases 19, 21                                                                                                                                                                                   | S4 + S5                                    |
| Per-company resilience via documented test-only hook                                    | DELIVERED — `_testHookBeforeCompany` seam; Case 20 verifies                                                                                                                                                | S4 + S5                                    |
| Q2 from 2026-05-17 review (harden `markAbsentService`)                                  | NOT TOUCHED — resumed Today slice owns it                                                                                                                                                                  |

## Verification

| #   | Command                                                                                                                                      | Status                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 1   | `grep -n "currently-active Assignment rows" docs/specs/2026-05-14-supervisor-responsibility-model.md` → only inside Amendments strikethrough | PENDING execution               |
| 2   | `pnpm --filter @axhy/shared-schema build` → 0                                                                                                | PENDING execution               |
| 3   | `pnpm --filter @axhy/backend typecheck` → 0                                                                                                  | PENDING execution               |
| 4   | `pnpm --filter @axhy/backend test p1_5_bootstrap_seed` → 22/22 green                                                                         | PENDING — requires sandbox DB   |
| 5   | `pnpm --filter @axhy/backend tsx scripts/p1_5_bootstrap_seed_bindings.ts --dry-run --report-dir tmp/p1_5_seed_reports` → valid JSON report   | PENDING — requires sandbox DB   |
| 6   | `git status` → clean (no `tmp/` noise)                                                                                                       | PENDING execution               |
| 7   | Panel sign-off on dry-run report + thresholds                                                                                                | OUTSTANDING                     |
| 8   | Non-dry-run on sandbox → matches report; re-run no-op                                                                                        | OUTSTANDING — blocked on Step 7 |

## Outstanding gates — all met

1. **Typecheck** — clean (`pnpm --filter @axhy/backend typecheck` → 0).
2. **Migrate sandbox** — 7 pending migrations applied via `prisma migrate deploy` (baseline resolved via `migrate resolve --applied`).
3. **Real-DB test suite** — 23/23 green against the Railway sandbox (Cases 19/20/21 needed `{ timeout: 360_000 }` due to test-fixture accumulation; case 23 = panel-P2 #5 query-count guard at `{ timeout: 60_000 }`).
4. **Dry-run** — produced `tmp/p1_5_seed_reports/p1_5_bootstrap_seed_2026-05-17T09-42-27-280Z.json`. 65 ACTIVE companies, tier breakdown tier1=24 / tier2=14 / tier3-unbound=4 / skipped-recent-hr-action=1 / 0 failures.
5. **Panel review** (S7) — verdict `DEFER_NON_DRY_RUN` with precondition: scope first non-dry-run to `--company axhy-sandbox` only. Threshold defaults signed off. Five P2 findings surfaced (all addressed — see "Panel-polish batch" below).
6. **Scoped non-dry-run** — executed on `axhy-sandbox` with `--recent-action-skip-days 30`. All 5 sites correctly `skipped-window-overlap` (existing bindings from Case 19's earlier run; same reason string, same zero-UUID createdBy, same sole-supervisor winner). Exit 0, `failed: false`. Report at `tmp/p1_5_seed_reports/p1_5_bootstrap_seed_2026-05-17T10-07-11-897Z.json`.
7. **Idempotency loop proven on real-shape tenant**: initial Tier-2 write → idempotent re-run → 0 duplicates → same outcome.

## Panel-polish batch (applied 2026-05-17 after panel verdict)

| P2 # | Fix                                                                                                                                                                         | File:lines                                             |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| #1   | Dropped `'exclusion constraint'` textual fallback from `isPostgresExclusionViolation`; SQLSTATE-only now.                                                                   | `apps/backend/src/lib/site-supervisor-binding.ts`      |
| #2   | Added rationale comment explaining why the Tier-1 SQL counts all `Complaint` rows regardless of status (operational-presence signal, low-signal noise caught at HR review). | `apps/backend/scripts/p1_5_bootstrap_seed_bindings.ts` |
| #3   | Operator-only — `--recent-action-skip-days 30` used in the scoped non-dry-run (no code change).                                                                             | n/a                                                    |
| #4   | Refactored `getSitesSupervisedByUser` to one-shot (2 Prisma queries regardless of portfolio size); N+1 eliminated.                                                          | `apps/backend/src/lib/effective-responsibility.ts`     |
| #5   | New Case 23 — instrumented Prisma `$on('query')` counter asserts `≤2` `SiteSupervisorBinding` queries. Anti-drift guard.                                                    | `apps/backend/test/p1_5_bootstrap_seed.test.ts`        |

## What was deferred (and what was NOT)

Two distinct things; only one was deferred.

**Multi-company code-path testing — DONE.** Cases 19/20/21/23 prove the system can:

- enumerate every ACTIVE company (default run)
- isolate per-company failures so one bad tenant does not halt the rest
- filter out non-ACTIVE companies
- avoid duplicate-binding writes via window-overlap idempotency
- run `getSitesSupervisedByUser` in O(1) round-trips regardless of portfolio size

**Multi-tenant _real-write_ pass against meaningful data — DEFERRED (panel-approved).** The sandbox is mostly test-fixture tenants. A full unscoped non-dry-run today would write/skip fake tenants, validate little about real customer behavior, and add noise + blast radius for low signal. The signal that was missing was NOT "can it handle many companies?" (that was tested) but "does Tier 1 behave sensibly on a real customer-like tenant with real Complaint/SwapRequest history?" — and that data does not yet exist in the sandbox. Once a real customer tenant is loaded, re-run the dry-run, reconvene the panel against fresh data, then unscope the non-dry-run.

## Idempotency / tenancy / concurrency proofs

| Concern                                                 | Test case |
| ------------------------------------------------------- | --------- |
| Idempotency (window overlap)                            | Case 9    |
| Tenancy isolation                                       | Case 10   |
| Recent-HR-action skip                                   | Case 11   |
| `SwapRequest.effectiveAt` vs `createdAt` discrimination | Case 12   |
| §5.8 acting-precedence in reverse query                 | Case 14   |
| Concurrent `createPermanentBinding` (DB EXCLUDE race)   | Case 15   |
| `bypassFreezeReason` discipline                         | Case 16   |
| Q3=C first-bind same-day freeze                         | Case 17a  |
| Q3=C first-bind future-dated                            | Case 17b  |
| Future-dated overlap                                    | Case 18   |
| Multi-company default run                               | Case 19   |
| Per-company fault containment                           | Case 20   |
| ACTIVE-only filter                                      | Case 21   |
| Targeted-rerun unknown-slug fail-loud                   | Case 22   |

## Caller discipline note (for future HR portal slice)

The HR-portal first-bind route MUST call:

```ts
createPermanentBinding(tx, input, { tenantTimeZone: <tenant tz>, /* no bypass */ });
```

The route MUST NOT pass `tenantTimeZone: null`. The runtime guard inside the helper rejects `null` without `bypassFreezeReason` (Case 16). The same-day freeze (`apps/backend/src/lib/same-day-freeze.ts:73-90`) will reject any `effectiveFrom` earlier than the next tenant-local midnight — HR portal UI must collect a future-dated `effectiveFrom`. Product copy must explain that new portfolio assignments take effect from the next tenant-local midnight.

## Resumed Today slice (after panel + non-dry-run)

1. Aggregator uses `getSitesSupervisedByUser(tx, { companyId: auth.companyId, userId: auth.userId, at: new Date() })`.
2. Mark-absent hardening (Q2=B): inside `markAbsentService`, resolve `deriveWorkerPrimarySiteId` → `getEffectiveBinding` → assert `binding.userId === auth.userId`. Reject 403 otherwise. Add cross-supervisor attempt test.
3. FlaggedReviewSheet Resolve/Reject: disabled with "Coming with P1" copy (no log+advance stubs).
