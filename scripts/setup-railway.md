# Setup — Railway Postgres for axhy-v3

Run-once steps to provision the new Railway project.

## 1. Create the Railway project

```bash
# install Railway CLI if you haven't
brew install railway

railway login
railway init      # name: axhy-v3
```

## 2. Add Postgres service with pgvector

Railway's default Postgres image does NOT include pgvector. You have two options:

### Option A: Custom Docker image (recommended)

In the Railway dashboard:
- New service → Empty service
- Source: Docker image `pgvector/pgvector:pg16`
- Set env: `POSTGRES_PASSWORD`, `POSTGRES_DB=axhy_prod`, `POSTGRES_USER=axhy_root`
- Volume: 10GB persistent

### Option B: Railway's Postgres + pgvector via SQL

Railway recently added pgvector to their Postgres template. Try:
- Add database → PostgreSQL
- Once running, connect and run `CREATE EXTENSION vector;`

If that fails (depends on Railway plan/version), use Option A.

## 3. Run init script

```bash
railway run --service axhy-postgres -- psql $DATABASE_URL -f scripts/init-postgres.sql
```

This creates schemas (`axhy`, `axhy_graph`, `axhy_audit`, `axhy_super`), enables `vector` + `pgcrypto` + `uuid-ossp` + `pg_trgm`, creates graph node + edge tables with HNSW + BM25 indices, sets up RLS policies, and creates `axhy_app` + `axhy_super` roles.

## 4. Capture connection strings

```bash
railway variables --service axhy-postgres
```

Save:
- `DATABASE_URL` — for backend (`axhy_app` role)
- `DATABASE_URL_SUPER` — for super-admin tools (`axhy_super` role)
- `DATABASE_URL_LINK` — for `pnpm prisma db pull` and migrations during dev

Add these to:
- `.env.local` for local development
- Railway service env vars for `axhy-backend` (when that service deploys)

## 5. Sandbox tenant

After Prisma schema is in place (build phase 1 week 1), seed the persistent sandbox tenant:

```bash
pnpm --filter @axhy-tools/seed-data seed:sandbox
```

`axhy-sandbox` lives in production-like Postgres but is segregated for integration tests. Per master plan rule: no mocks; integration tests hit this tenant.

## 6. Backups

Railway includes daily backups. Verify:
- Dashboard → axhy-postgres → Backups → confirm enabled
- Retention: 7 days minimum
- Export schedule: weekly snapshot to Cloudflare R2 (tooling Day 6 of evidence sprint)

## Cost estimate

- Postgres: $10–20/month at solo-founder scale
- Storage: included until 5GB
- Backups: included
- Embeddings (OpenAI): ~₹500/month after initial one-time embedding (~₹200)

Total: ~$15-25/month for the data backbone.

## Lineage

ADR-0004 (Postgres backend), ADR-0022 (pgvector on existing Postgres).
