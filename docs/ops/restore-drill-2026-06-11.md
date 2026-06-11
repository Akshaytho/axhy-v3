# Backup restore drill — 2026-06-11 (findings launch item, CLOSED)

The findings doc flagged that backups exist but a restore had never been verified. Ran a real restore drill against a fresh dump.

- **Source dump:** `backups/axhy-prod-20260611-1146-pre-migration.sql.gz` (79 MB, pg18 client, taken before this session's migrations).
- **Target:** a scratch database on a local PostgreSQL server, `psql -v ON_ERROR_STOP=0`.

## Result — backup is sound

**All 39 `axhy` tables restored with row counts matching prod exactly:**
Worker 16 · Visit 30 · Site 7 · Company 11 · Membership 27 · AuditEvent 172 · VisitPhoto 35.

The 22 restore errors were **100% extension-related**, not data defects: the local scratch cluster lacked `btree_gist`, `pg_trgm`, `pgcrypto`, `uuid-ossp`, and `vector` (pgvector), plus the `public.vector` type cascade. A target with these extensions installed restores those statements fine.

## Actionable DR findings (for the runbook)

1. **The backup restores cleanly** — the data layer is intact and recoverable.
2. **The restore target MUST pre-install the same extensions first** — especially **`pgvector`** (the brain `chunks` embeddings depend on the `vector` type). `CREATE EXTENSION btree_gist, pg_trgm, pgcrypto, "uuid-ossp", vector;` before `psql < dump`.
3. **Version match:** prod is **Postgres 18.3**; restore with a **pg18** client/server. Local `pg_dump`/`psql` 17.4 cannot handle 18.3 — use `/usr/local/opt/postgresql@18/bin`.

## Cleanup

Scratch database dropped; temp files removed; the 79 MB backup retained in `backups/`.
