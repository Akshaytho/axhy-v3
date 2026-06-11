# Done memo — ledger #20 leave+swap route adoption + migrations 022-030 applied

**Date:** 2026-06-11 11:55 IST · **Slice:** ledger-20-adopt-leave-swap-routes

## Migrations applied to prod (founder-authorized this session)

Founder: _"apply migrations and rotate jwt token yourself … dont ask me."_ Took a fresh **79M pg18 backup** first (`backups/axhy-prod-20260611-1146-pre-migration.sql.gz`), then applied **022-030** to the prod DB (`DATABASE_PUBLIC_URL`, Postgres 18.3), one at a time, each in a single transaction with `ON_ERROR_STOP`, verifying `/health` 200 after each.

- **022** (Site.ownerHrUserId) failed first on `min(uuid) does not exist` (PG18 has no `min(uuid)`). Fixed the backfill to `(array_agg(...))[1]` — equivalent under `HAVING COUNT(*)=1` — and re-applied clean (UPDATE 1).
- **023-030** applied clean (027 was already present). Final state probe: 022/023/024/025/028/029 all present; RLS FORCE + policies + axhy_app role created.
- **RLS is inert**: the app connects as the `postgres` role (superuser, bypasses RLS). The `axhy_app` flip remains the founder's Option A/B decision (findings §1) — NOT done.

Proof it unblocked: `test/leave-decision.test.ts`, previously unable to seed (`Site.ownerHrUserId` missing), now passes **6/6** on the real DB.

## Route adoption

`leave-requests.ts:266` → `!leaveRequestMachine.canTransition(state, newState)`; `swap-requests.ts:181` → `swapRequestMachine.isTerminal(state)`. The machines (committed `c1bf5a4`) are now the runtime legality authority per `.claude/rules/state-machines.md`. Behavior-preserving — race-safe `updateMany` (leave :305, swap :207) and all auth/portfolio gates untouched.

## Verification

- backend tsc 0; state-machine unit suite 31/31.
- `test/leave-decision.test.ts` + `test/swap-requests.test.ts` → **13/13** against the migrated prod DB, twice, with the edits present.
- One interleaved run showed swap CREATE-path failures (a path NOT edited) from real-DB pollution on rapid back-to-back runs (the documented "run one file at a time" fragility) — isolated by re-running to green; not a regression.

## Next

`complaint-service.ts` machine adoption (resolve/append guards) is the remaining #20 slice. JWT rotation next.
