#!/usr/bin/env node
// scripts/run-init-sql.mjs
// One-time runner for init-postgres.sql against the linked Railway DB.
// Uses DATABASE_URL or DATABASE_PUBLIC_URL from env.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
const sqlPath = path.join(here, 'init-postgres.sql');

const url =
  process.env.DATABASE_PUBLIC_URL ||
  process.env.DATABASE_URL ||
  process.env.AXHY_DB_URL;

if (!url) {
  console.error('No DATABASE_URL / DATABASE_PUBLIC_URL set. Run via `railway run -- node scripts/run-init-sql.mjs` or set DATABASE_URL.');
  process.exit(1);
}

const sql = await readFile(sqlPath, 'utf8');
console.log(`[init] Executing ${sqlPath} (${sql.length} bytes) against Railway DB...`);

const { Client } = pg;
const client = new Client({ connectionString: url });
try {
  await client.connect();
  console.log('[init] Connected.');

  // Probe pgvector availability before running the full file
  const probe = await client.query(
    `SELECT installed_version, default_version FROM pg_available_extensions WHERE name = 'vector'`,
  );
  if (probe.rowCount === 0) {
    console.error('[init] FATAL: pgvector extension is not available on this Postgres instance.');
    console.error('[init] Switch the Postgres service to pgvector/pgvector:pg16 image and retry.');
    process.exit(2);
  }
  console.log(`[init] pgvector available: ${JSON.stringify(probe.rows[0])}`);

  await client.query(sql);
  console.log('[init] All statements executed successfully.');

  // Verify
  const ext = await client.query(
    `SELECT extname FROM pg_extension WHERE extname IN ('vector','pgcrypto','uuid-ossp','pg_trgm') ORDER BY extname`,
  );
  console.log('[init] Extensions installed:', ext.rows.map((r) => r.extname).join(', '));

  const schemas = await client.query(
    `SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'axhy%' ORDER BY schema_name`,
  );
  console.log('[init] Schemas created:', schemas.rows.map((r) => r.schema_name).join(', '));

  const tables = await client.query(
    `SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema LIKE 'axhy%' ORDER BY table_schema, table_name`,
  );
  console.log('[init] Tables created:');
  for (const t of tables.rows) console.log(`         ${t.table_schema}.${t.table_name}`);
} catch (err) {
  console.error('[init] FAILED:', err.message);
  if (err.position) console.error('[init] At position:', err.position);
  process.exit(1);
} finally {
  await client.end();
}
