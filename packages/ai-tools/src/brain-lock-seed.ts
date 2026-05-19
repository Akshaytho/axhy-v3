/**
 * Brain lock-seed: marks existing doc chunks as locked in axhy_brain.
 * Run after migration 0003 + brain:build to protect founder-locked decisions.
 *
 * Idempotent — running twice is safe (skips already-locked chunks).
 *
 * Usage:
 *   railway run -- pnpm --filter @axhy/ai-tools brain:lock-seed
 *
 * @derives(ADR-0022) — pgvector on Railway Postgres
 */

import pg from 'pg';

const url =
  process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? process.env.AXHY_DB_URL ?? '';

if (!url) {
  console.error('[brain:lock-seed] No DATABASE_URL set.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });

type LockRule = { pattern: string; category: string; reason: string };

const LOCK_RULES: LockRule[] = [
  {
    pattern: 'docs/locked/%',
    category: 'architecture_lock',
    reason:
      'Constitutional document. Locked by founder. Cannot be modified without explicit unlock.',
  },
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
    reason: 'Prisma schema — single source of truth (ADR-0003).',
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

type PersonaRule = { pattern: string; persona: string };

const PERSONA_RULES: PersonaRule[] = [
  { pattern: '%chat-behavior%', persona: 'supervisor' },
  { pattern: '%chat-sidebar%', persona: 'supervisor' },
  { pattern: '%chat-tools%', persona: 'supervisor' },
  { pattern: '%chat-error%', persona: 'supervisor' },
  { pattern: '%chat-abuse%', persona: 'supervisor' },
  { pattern: '%livingdoc%', persona: 'supervisor' },
  { pattern: '%supervisor%', persona: 'supervisor' },
  { pattern: '%worker%', persona: 'worker' },
  { pattern: '%admin%', persona: 'admin' },
  { pattern: '%super-admin%', persona: 'super_admin' },
  { pattern: '%hr-%', persona: 'hr' },
];

async function main() {
  await client.connect();
  console.log('[brain:lock-seed] Connected.');

  let totalLocked = 0;

  for (const rule of LOCK_RULES) {
    const result = await client.query(
      `UPDATE axhy_brain.chunks
       SET is_locked = true, locked_at = now(), locked_reason = $2,
           chunk_category = $3, updated_at = now()
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

  // Assign personas based on file path patterns
  let totalPersonaSet = 0;
  for (const rule of PERSONA_RULES) {
    const result = await client.query(
      `UPDATE axhy_brain.chunks
       SET persona = $2, updated_at = now()
       WHERE source_path LIKE $1
         AND persona = 'all'`,
      [rule.pattern, rule.persona],
    );
    const count = result.rowCount ?? 0;
    if (count > 0) {
      console.log(`  [persona:${rule.persona}] tagged ${count} chunks matching ${rule.pattern}`);
    }
    totalPersonaSet += count;
  }
  console.log(`  [persona] tagged ${totalPersonaSet} chunks total`);

  const summary = await client.query(`
    SELECT
      chunk_category,
      COUNT(*) FILTER (WHERE is_locked) AS locked,
      COUNT(*) FILTER (WHERE NOT is_locked) AS unlocked,
      COUNT(*) FILTER (WHERE is_stale) AS stale,
      COUNT(*) AS total
    FROM axhy_brain.chunks
    GROUP BY chunk_category
    ORDER BY chunk_category
  `);
  console.log('\n[brain:lock-seed] Final state:');
  console.log('  Category             Locked  Unlocked  Stale  Total');
  for (const row of summary.rows) {
    const cat = (row.chunk_category as string).padEnd(20);
    console.log(
      `  ${cat} ${String(row.locked).padStart(6)}  ${String(row.unlocked).padStart(8)}  ${String(row.stale).padStart(5)}  ${String(row.total).padStart(5)}`,
    );
  }

  const personaSummary = await client.query(`
    SELECT persona, COUNT(*) AS total
    FROM axhy_brain.chunks
    GROUP BY persona
    ORDER BY persona
  `);
  console.log('\n  Persona breakdown:');
  for (const row of personaSummary.rows) {
    console.log(`    ${(row.persona as string).padEnd(14)} ${String(row.total).padStart(5)}`);
  }

  console.log(
    `\n[brain:lock-seed] Done. Locked ${totalLocked}, tagged ${totalPersonaSet} personas.`,
  );
  await client.end();
}

await main();
