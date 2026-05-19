/**
 * Lock-seed: one-time script to mark existing doc chunks as locked in the
 * knowledge graph. Run after migration 014 to protect all founder-locked
 * decisions, feedback rules, ADRs, specs, and security constraints.
 *
 * What it does:
 *   1. Finds all chunks whose source_path matches a lockable pattern
 *   2. Classifies each chunk by category
 *   3. Sets is_locked = true, locked_at = now(), locked_reason, chunk_category
 *
 * Idempotent — running twice is safe (skips already-locked chunks).
 *
 * Usage:
 *   railway run -- pnpm --filter @axhy/knowledge-graph graph:lock-seed
 *
 * @derives(ADR-0022) — pgvector on Railway Postgres
 * @derives(project_hierarchical_rule_system_architecture.md)
 */

import pg from 'pg';

const url =
  process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? process.env.AXHY_DB_URL ?? '';

if (!url) {
  console.error('[lock-seed] No DATABASE_URL set.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

type LockRule = {
  pattern: string;
  category: string;
  reason: string;
};

const LOCK_RULES: LockRule[] = [
  {
    pattern: 'docs/decisions/%',
    category: 'adr',
    reason: 'ADR — architectural decision record. Locked by convention.',
  },
  {
    pattern: 'docs/specs/%',
    category: 'spec',
    reason: 'Specification document. Locked after founder approval.',
  },
  {
    pattern: 'docs/protocols/%',
    category: 'architecture_lock',
    reason: 'Protocol document. Locked by doc-discipline protocol.',
  },
  {
    pattern: '%/schema.prisma',
    category: 'schema_invariant',
    reason: 'Prisma schema — single source of truth (ADR-0003). Schema changes need migration.',
  },
  {
    pattern: 'packages/state-machines/%',
    category: 'schema_invariant',
    reason: 'State machine definition. Transitions are invariants.',
  },
  {
    pattern: 'docs/invariants/%',
    category: 'architecture_lock',
    reason: 'Invariant document. Locked by definition.',
  },
];

async function main() {
  await client.connect();
  console.log('[lock-seed] Connected to database.');

  let totalLocked = 0;

  for (const rule of LOCK_RULES) {
    const result = await client.query(
      `UPDATE axhy_graph.chunks
       SET is_locked = true,
           locked_at = now(),
           locked_reason = $2,
           chunk_category = $3,
           updated_at = now()
       WHERE source_path LIKE $1
         AND is_locked = false`,
      [rule.pattern, rule.reason, rule.category],
    );
    const count = result.rowCount ?? 0;
    if (count > 0) {
      console.log(`  [${rule.category}] locked ${count} chunks matching ${rule.pattern}`);
    }
    totalLocked += count;
  }

  // Also classify (but don't lock) code chunks — they follow code, never locked
  const codeClassified = await client.query(
    `UPDATE axhy_graph.chunks
     SET chunk_category = 'code', updated_at = now()
     WHERE chunk_category = 'doc'
       AND source_path NOT LIKE 'docs/%'
       AND source_path NOT LIKE '%.md'
       AND is_locked = false`,
  );
  console.log(
    `  [code] classified ${codeClassified.rowCount ?? 0} code chunks (not locked — code follows code)`,
  );

  // Summary
  const summary = await client.query(`
    SELECT
      chunk_category,
      COUNT(*) FILTER (WHERE is_locked) AS locked,
      COUNT(*) FILTER (WHERE NOT is_locked) AS unlocked,
      COUNT(*) FILTER (WHERE is_stale) AS stale,
      COUNT(*) AS total
    FROM axhy_graph.chunks
    GROUP BY chunk_category
    ORDER BY chunk_category
  `);
  console.log('\n[lock-seed] Final state:');
  console.log('  Category             Locked  Unlocked  Stale  Total');
  console.log('  ─────────────────────────────────────────────────────');
  for (const row of summary.rows) {
    const cat = (row.chunk_category as string).padEnd(20);
    console.log(
      `  ${cat} ${String(row.locked).padStart(6)}  ${String(row.unlocked).padStart(8)}  ${String(row.stale).padStart(5)}  ${String(row.total).padStart(5)}`,
    );
  }

  console.log(`\n[lock-seed] Done. Locked ${totalLocked} chunks total.`);
  await client.end();
}

await main();
