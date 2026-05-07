#!/usr/bin/env node
// scripts/run-migrations.mjs
//
// Idempotent migration runner. Reads scripts/migrations/*.sql in lexical order,
// executes each inside an advisory-lock-protected loop, tracks applied
// migrations in axhy_graph.schema_migrations.
//
// Usage: node scripts/run-migrations.mjs
// or via package.json target: pnpm db:migrate

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, 'migrations');
const ADVISORY_LOCK_KEY = 0xa10c1a; // arbitrary; identifies this runner

const dbUrl =
  process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL || process.env.AXHY_DB_URL;

if (!dbUrl) {
  console.error('[migrate] no DATABASE_URL / DATABASE_PUBLIC_URL / AXHY_DB_URL set');
  process.exit(2);
}

const client = new pg.Client({ connectionString: dbUrl });

async function main() {
  await client.connect();
  await client.query('CREATE SCHEMA IF NOT EXISTS axhy_graph');
  await client.query(`
    CREATE TABLE IF NOT EXISTS axhy_graph.schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const lockResult = await client.query('SELECT pg_try_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
  if (!lockResult.rows[0].pg_try_advisory_lock) {
    console.error('[migrate] another migration runner holds the lock; aborting');
    process.exit(3);
  }

  try {
    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    const applied = await client.query('SELECT id FROM axhy_graph.schema_migrations');
    const appliedSet = new Set(applied.rows.map((r) => r.id));

    let pending = 0;
    for (const file of files) {
      if (appliedSet.has(file)) continue;
      pending++;
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`[migrate] applying ${file}`);
      // ALTER TYPE ADD VALUE cannot run inside a transaction.
      // Postgres allows multiple ALTER TYPE statements separated by ;
      // when each is auto-committed.
      const statements = sql
        .split(/;\s*$/m)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const stmt of statements) {
        await client.query(stmt);
      }
      await client.query('INSERT INTO axhy_graph.schema_migrations (id) VALUES ($1)', [file]);
    }

    if (pending === 0) {
      console.log('[migrate] no pending migrations');
    } else {
      console.log(`[migrate] applied ${pending} migration(s)`);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
    await client.end();
  }
}

main().catch((err) => {
  console.error('[migrate] failed:', err);
  process.exit(1);
});
