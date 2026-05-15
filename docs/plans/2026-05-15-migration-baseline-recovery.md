# Migration baseline recovery — Day-3 era foundational tables

**Status:** Implemented 2026-05-15 (branch `feat/migration-baseline-recovery`)
**Replaces:** the gap surfaced during Layer 1 PR 1 local verification.

## What was broken

On a fresh Postgres, `prisma migrate deploy` against the v3 migration history failed with:

```
relation "axhy.Company" does not exist
```

Reason: the 8 foundational tables — `Company`, `User`, `Membership`, `Site`, `Worker`, `Visit`, `LeaveRequest`, `otp_attempts` — were created via `prisma db push` during the Day-2 / Day-3 evidence sprint (commits `7298fc3`, `3556a3f`, `6da84fb`). They were never captured as a formal migration. Every later migration (Phase B foundation, Phase B domain, Phase C Wave 1/2a/4b) assumes those tables exist via `ADD CONSTRAINT` / `ALTER TABLE` statements.

Production has the tables because they were `db push`-applied directly. Any fresh DB (local dev, ephemeral CI) had no path to a known-good state.

## Approach taken (Option C: reconstruct Day-3 era baseline from git history)

Three other options were considered and rejected:

- **Option A — Squash all migrations into one current-state baseline.** Loses the history of what was added when. Breaks if anyone has a partially-applied environment.
- **Option B — Idempotent full baseline (CREATE IF NOT EXISTS for all 23 tables).** Conflicts with existing per-migration ADD COLUMN statements (e.g., `Visit.correctsVisitId` added in Wave 1 calendar) because the full-state baseline would already have those columns and Wave 1 would re-add them.
- **Option D — Live with the gap.** Means CI cannot ever apply migrations from scratch, and local dev needs a manual `prisma db push` of a stale schema. Indefinitely fragile.

**Chosen path:** generate a baseline migration that contains ONLY the 8 missing tables in their Day-3 shape. Place it before the existing migrations. Later migrations apply on top normally.

## Implementation

1. **Source schema:** state of `packages/shared-schema/prisma/schema.prisma` at commit `b9058b6` (parent of `6da84fb`, which introduced the first formal migration). At that commit the schema had the 7 foundational tables. The `OtpAttempt` model added in `6da84fb` (but also never migrated) was appended manually.
2. **Generated SQL** via:
   ```
   prisma migrate diff --from-empty --to-schema-datamodel <day-3-schema-file> --script
   ```
3. **Verified the candidate** against 6 guards:
   - 8 tables created — and ONLY those 8.
   - No `INSERT` statements.
   - No `_prisma_migrations` touched.
   - No `GRANT` / `OWNER` clauses.
   - No Layer 1 entities (HRPod / Policy / Notification / Digest).
   - No Phase B+ entities (no conflict with later migrations).
4. **Confirmed no existing migration re-creates the foundational tables** (would have made the baseline conflict).
5. **Placed as `prisma/migrations/20260507_phase_a_baseline_day3/migration.sql`** with a header comment explaining its purpose and the production resolve step.

## Local verification (the Verification discipline gate)

Stood up a fresh Postgres 16 container, ran the full migration chain:

```
docker run -d --name axhy-baseline-verify \
  -e POSTGRES_PASSWORD=verify -e POSTGRES_DB=verify \
  -p 55444:5432 postgres:16-alpine

DATABASE_URL="postgresql://postgres:verify@localhost:55444/verify?schema=axhy" \
  pnpm exec prisma migrate deploy
```

Result: all 8 migrations applied cleanly:

- `20260507_phase_a_baseline_day3` ← new
- `20260508_phase_b_domain`
- `20260508_phase_b_foundation`
- `20260509_phase_c_wave_1_calendar`
- `20260510_phase_c_wave_2a`
- `20260510_wave_4b_ai_spend_protection`
- `20260511_phase_c_wave_4b_phase_2`
- `20260512_phase_c_wave_4b_phase_2_5_cleanup`

`prisma migrate status` reports "Database schema is up to date." 23 axhy tables present (matches prod). Smoke test inserted a Company → User → Worker chain and confirmed FK cascade behaviour (`ON DELETE SET NULL` on User, `ON DELETE CASCADE` on Worker).

**Verification status: verified against real DB (local Postgres 16, fresh apply).**

## What to do on production

The 8 foundational tables already exist in production (they were `db push`-created months ago). The baseline migration must NOT be re-run there. Mark it as already-applied:

```
prisma migrate resolve --applied 20260507_phase_a_baseline_day3
```

This adds a row to `_prisma_migrations` recording the baseline as logically applied without executing its SQL. Subsequent `prisma migrate deploy` runs will skip it and proceed to any new migrations.

This must be done on every prod-equivalent environment that has the existing 8 tables. Fresh environments (local, CI) just run the baseline normally.

## What this unblocks

- Layer 1 PR 1 (schema-only migrations) — its real-DB verification gate can now run against a fresh local Postgres.
- All subsequent layer work — same gate now executable.
- CI can run `prisma migrate deploy` from scratch (e.g., for ephemeral test DBs).

## Source provenance

- `b9058b6` — parent of `6da84fb`; schema state used as the diff target (7 foundational models).
- `6da84fb` — Phase B.1 commit; source of the `OtpAttempt` model definition appended to the diff target.
- `3556a3f` — Day-3 commit that originally created Site / Worker / Visit / LeaveRequest via `prisma db push`.

The baseline migration's header comment records this provenance inline so future readers don't need to re-derive it.
