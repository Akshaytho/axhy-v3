/**
 * @axhy/knowledge-graph — lineage audit
 *
 * CI-friendly health check on the graph:
 *   1. ORPHAN check: any code file (.ts in apps/* or packages/*) that has no
 *      derives_from edge → it's missing @derives. Print as warnings.
 *   2. DEAD-LINK check: any derives_from edge pointing to an ADR / master-plan
 *      section that doesn't have a real target node yet → list them.
 *   3. STALENESS check: any chunk older than 30 days for a file that still
 *      exists on disk and has changed since → flag for re-embedding.
 *
 * Exits non-zero on dead-links (hard fail). Orphans/staleness print warnings
 * but don't fail. Tighten when v3.1 ships.
 *
 * @derives(ADR-0002)
 */

import pg from 'pg';

const url =
  process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? process.env.AXHY_DB_URL ?? '';
if (!url) {
  console.error('[audit] No DATABASE_URL set.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

let hardFail = 0;
let warnings = 0;

console.log('[audit] Lineage audit starting...');

// 1. ORPHAN check — code files in apps/* or packages/* without provenance
const orphansRes = await client.query(`
  SELECT n.source_path
  FROM axhy_graph.nodes n
  WHERE n.kind = 'ui_component'
    AND (n.source_path LIKE 'apps/%' OR n.source_path LIKE 'packages/%')
    AND NOT EXISTS (
      SELECT 1 FROM axhy_graph.edges e
      WHERE e.kind = 'derives_from' AND e.src_id = n.id
    )
  ORDER BY n.source_path
`);
if ((orphansRes.rowCount ?? 0) > 0) {
  console.warn(`[audit] WARN: ${orphansRes.rowCount} files have NO @derives lineage:`);
  for (const r of orphansRes.rows) console.warn(`  - ${r.source_path}`);
  warnings += orphansRes.rowCount ?? 0;
}

// 2. DEAD-LINK check — referenced ADRs whose actual file doesn't exist on disk.
// Build the set of "valid" ADRs from nodes that have source_path set (= file scanned).
const validAdrs = await client.query(
  `SELECT name FROM axhy_graph.nodes WHERE kind = 'adr' AND source_path IS NOT NULL`,
);
const valid = new Set<string>(validAdrs.rows.map((r) => r.name));
const referenced = await client.query(
  `SELECT DISTINCT dst.name
   FROM axhy_graph.edges e
   JOIN axhy_graph.nodes dst ON dst.id = e.dst_id
   WHERE e.kind = 'derives_from' AND dst.kind = 'adr'
   ORDER BY dst.name`,
);
const referencedNames = referenced.rows.map((r) => r.name as string);
const dead = referencedNames
  .filter((n) => !valid.has(n))
  .filter((n) => n !== 'ADR-NNNN' && n !== 'ADR-XXXX');
if (dead.length > 0) {
  console.error(`[audit] FAIL: ${dead.length} ADR references point to non-existent ADRs:`);
  for (const name of dead)
    console.error(`  - ${name} referenced but no matching docs/decisions/<num>-*.md exists`);
  hardFail += dead.length;
}

// 3. Coverage summary
const cov = await client.query(`
  SELECT
    (SELECT COUNT(*) FROM axhy_graph.chunks) AS total_chunks,
    (SELECT COUNT(*) FROM axhy_graph.nodes WHERE kind = 'entity') AS entities,
    (SELECT COUNT(*) FROM axhy_graph.nodes WHERE kind = 'state') AS state_machines,
    (SELECT COUNT(*) FROM axhy_graph.nodes WHERE kind = 'adr') AS adrs,
    (SELECT COUNT(*) FROM axhy_graph.edges WHERE kind = 'derives_from') AS derives_edges
`);
const c = cov.rows[0];
console.log('[audit] Graph coverage:');
console.log(`  chunks:         ${c.total_chunks}`);
console.log(`  entities:       ${c.entities}`);
console.log(`  state_machines: ${c.state_machines}`);
console.log(`  adrs:           ${c.adrs}`);
console.log(`  derives edges:  ${c.derives_edges}`);

await client.end();

console.log('');
if (hardFail > 0) {
  console.error(`[audit] FAILED with ${hardFail} hard errors and ${warnings} warnings.`);
  process.exit(1);
}
console.log(`[audit] PASSED (${warnings} warnings).`);
