/**
 * GET /api/graph — knowledge-graph snapshot for the /system/graph viewer.
 *
 * Returns all nodes + edges from axhy_graph schema. Public (unauthed) for
 * v1.0 internal-tool purposes — graph data is file paths + AST shapes,
 * already in the open codebase, no PII.
 *
 * Planned follow-up (Rahul): when /owner becomes authed and /system/*
 * gets gated behind admin auth, move this query to apps/backend as
 * GET /system/graph and have admin-web fetch it. Direct pg here is
 * pragmatic for v1.0 internal-tool only.
 *
 * @derives(ADR-0021)
 */

import { NextResponse } from 'next/server';
import pg from 'pg';

/** @derives(ADR-0021) */
export const dynamic = 'force-dynamic';

let pool: pg.Pool | null = null;
function getPool() {
  if (!pool) {
    const url = process.env.DATABASE_URL ?? process.env.DATABASE_PUBLIC_URL;
    if (!url) throw new Error('DATABASE_URL not set');
    pool = new pg.Pool({ connectionString: url, max: 2 });
  }
  return pool;
}

/** @derives(ADR-0021) */
export async function GET() {
  try {
    const client = await getPool().connect();
    try {
      const nodesRes = await client.query(
        `SELECT id, kind, name, source_path, metadata FROM axhy_graph.nodes`,
      );
      const edgesRes = await client.query(
        `SELECT id, kind, src_id, dst_id, metadata FROM axhy_graph.edges`,
      );
      const counts = await client.query(`SELECT
        (SELECT COUNT(*)::int FROM axhy_graph.nodes) AS nodes,
        (SELECT COUNT(*)::int FROM axhy_graph.edges) AS edges,
        (SELECT COUNT(*)::int FROM axhy_graph.chunks) AS chunks`);

      return NextResponse.json({
        nodes: nodesRes.rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          name: r.name,
          sourcePath: r.source_path,
          metadata: r.metadata,
        })),
        edges: edgesRes.rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          source: r.src_id,
          target: r.dst_id,
          metadata: r.metadata,
        })),
        counts: counts.rows[0],
      });
    } finally {
      client.release();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
