# Done Memo — F-013 Sandbox-Fixture Cleanup Utility (2026-05-17)

> Status: **COMPLETE**. Tiny maintenance slice; opened immediately after P1.5b closed, per friend's 2026-05-17 priority order.

## Why

P1.5b run revealed 73+ companies in the sandbox, ~99% test-fixture rows accumulated over time (prefixes `p15b-*`, `cal-find-*`). Multi-company default-run tests took 130s–239s because every test iterated all of them. Ops hygiene, not a logic problem; tracked separately so P1.5b stayed frozen.

## What shipped

| Artifact                                                         | Path                                                 |
| ---------------------------------------------------------------- | ---------------------------------------------------- |
| Library function `runFixtureCleanup`                             | `apps/backend/scripts/cleanup_sandbox_fixtures.ts`   |
| Thin CLI wrapper (one JSON line stdout, `process.exitCode` only) | same file                                            |
| Real-DB integration tests (6 cases, 6/6 green)                   | `apps/backend/test/cleanup_sandbox_fixtures.test.ts` |
| Done memo (this file)                                            | `axhy-v3/handoff/done-memo-f013-sandbox-cleanup.md`  |

## Locked constraints (all enforced)

| #   | Constraint                                                                       | Where                                                                   |
| --- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | Dry-run by default; `--apply` required to delete                                 | `opts.apply ?? false` in `runFixtureCleanup`                            |
| 2   | Prefix-based selector (defaults `p15b-`, `cal-find-`; `--prefix <p>` repeatable) | `DEFAULT_PREFIXES` + `prefixes.map(p => ({ slug: { startsWith: p } }))` |
| 3   | Company-root delete; cascades handle children                                    | `prisma.company.delete({ where: { id }})` (FKs are `onDelete: Cascade`) |
| 4   | Hardcoded denylist refuses `axhy-sandbox` (defense-in-depth)                     | `SLUG_DENYLIST = new Set(['axhy-sandbox'])`                             |
| 5   | Empty prefix list throws — refuse to enumerate ALL companies                     | `if (prefixes.length === 0) throw …`                                    |
| 6   | Same JSON-line stdout + exit-code contract as bootstrap script                   | CLI wrapper at file bottom                                              |
| 7   | Real-DB tests                                                                    | 6 cases in test file                                                    |

## Run record

| Stage      | Command                                                                                        | Result                                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Tests      | `railway run --service Postgres -- pnpm exec vitest run test/cleanup_sandbox_fixtures.test.ts` | 6/6 green in 10.6s                                                                          |
| Dry-run    | `... cleanup_sandbox_fixtures.ts --report-dir tmp/cleanup_reports`                             | matched=71, blocked-by-denylist=0, would-delete=71, exit 0                                  |
| Apply      | `... cleanup_sandbox_fixtures.ts --apply --report-dir tmp/cleanup_reports`                     | matched=71, deleted=71, failed=0, exit 0                                                    |
| Post-state | direct query                                                                                   | total=2, active=2, remaining `p15b-*`=0, remaining `cal-find-*`=0, `axhy-sandbox` preserved |

## Files touched in this slice

- **Add**: `apps/backend/scripts/cleanup_sandbox_fixtures.ts`
- **Add**: `apps/backend/test/cleanup_sandbox_fixtures.test.ts`
- **Modify**: `axhy-v3/handoff/feature-queue/INDEX.md` (F-013 → `DONE`)
- **Add**: `axhy-v3/handoff/done-memo-f013-sandbox-cleanup.md` (this file)

No production code touched. No schema changes. `.gitignore` already covers `tmp/` from P1.5b.

## Operational impact

- Sandbox went from 73 → 2 companies. Next multi-company default-run test will iterate 2 not 73 — expected runtime drops from ~180s to ~5s.
- `axhy-sandbox` and its 5 bootstrap-seed PERMANENT bindings preserved (denylist held).
- Re-running the utility now reports `matched=0` (nothing left to clean) — idempotent.

## Reuse notes for future

- If a new test file uses a new slug prefix, add it to the prefixes list via CLI flag OR add to `DEFAULT_PREFIXES` in the script.
- If a new persistent sandbox tenant needs protection, add it to `SLUG_DENYLIST` in `cleanup_sandbox_fixtures.ts`.
- This utility is **sandbox-only** by design. It must NEVER be pointed at the production Railway tenant. The denylist is defense-in-depth, but the actual protection is operational discipline: only run with the sandbox `DATABASE_URL`.

## Next slice per friend's 2026-05-17 priority order

Today slice resume — Q2=B `markAbsentService` hardening first (`deriveWorkerPrimarySiteId` → `getEffectiveBinding` → assert `binding.userId === auth.userId`; cross-supervisor rejection test first). Then reopen the Today aggregator/UI slice on top of `getSitesSupervisedByUser`.
