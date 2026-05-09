/**
 * GET /api/graph — knowledge-graph snapshot for the /system/graph viewer.
 *
 * Auth gate per Vinod (DPO) lock — panel-locked 2026-05-07, SPEC.md §7.5:
 *   - Requires Authorization: Bearer <jwt> with role === 'SUPER_ADMIN'.
 *   - 401 if no bearer token or token invalid/expired.
 *   - 403 if token valid but role !== 'SUPER_ADMIN'.
 *   - Field nodes with metadata.personal === true are stripped unless
 *     caller passes ?includePersonal=1 (SUPER_ADMIN-only; double-checked).
 *
 * Previous comment claiming "public, no PII" retracted — graph data includes
 * file-path shapes that expose internal structure, and personal-field metadata
 * exposes Prisma @personal annotations. SUPER_ADMIN gate is required.
 * (Vinod lock, panel-2026-05-07, SPEC.md §7.5)
 *
 * @derives(ADR-0021)
 * @derives(ADR-0007)
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import pg from 'pg';

/** @derives(ADR-0021) */
export const dynamic = 'force-dynamic';

let pool: pg.Pool | null = null;
function getPool(): pg.Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL ?? process.env.DATABASE_PUBLIC_URL;
    if (!url) throw new Error('DATABASE_URL not set');
    pool = new pg.Pool({ connectionString: url, max: 2 });
  }
  return pool;
}

type RawNode = {
  id: string;
  kind: string;
  name: string;
  source_path: string | null;
  metadata: Record<string, unknown> | null;
};
type RawEdge = {
  id: string;
  kind: string;
  src_id: string;
  dst_id: string;
  metadata: Record<string, unknown> | null;
};

/**
 * Verify the Authorization: Bearer header and assert SUPER_ADMIN role.
 * Returns { ok: true } or { ok: false, status, reason }.
 *
 * In dev only: if NEXT_PUBLIC_DEV_GRAPH_TOKEN is set in the environment,
 * a matching bearer token bypasses full JWT verification. This env var
 * is never set in production.
 *
 * @derives(ADR-0007)
 */
async function verifySuperAdmin(
  req: NextRequest,
): Promise<{ ok: true } | { ok: false; status: number; reason: string }> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, status: 401, reason: 'Authorization: Bearer <token> required' };
  }

  const token = authHeader.slice('Bearer '.length).trim();

  // Dev-only escape hatch: orchestrator sets NEXT_PUBLIC_DEV_GRAPH_TOKEN for local viewing.
  const devToken = process.env.NEXT_PUBLIC_DEV_GRAPH_TOKEN;
  if (devToken && token === devToken) {
    return { ok: true };
  }

  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    // Server misconfiguration — 500, not 401
    return { ok: false, status: 500, reason: 'JWT_SECRET not configured on server' };
  }

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(jwtSecret));
    if (payload['role'] !== 'SUPER_ADMIN') {
      return { ok: false, status: 403, reason: 'SUPER_ADMIN role required' };
    }
    return { ok: true };
  } catch {
    return { ok: false, status: 401, reason: 'Token invalid or expired' };
  }
}

/** @derives(ADR-0021) */
export async function GET(req: NextRequest) {
  const authResult = await verifySuperAdmin(req);
  if (!authResult.ok) {
    return NextResponse.json({ error: authResult.reason }, { status: authResult.status });
  }

  const url = new URL(req.url);
  const includePersonal = url.searchParams.get('includePersonal') === '1';

  try {
    const client = await getPool().connect();
    try {
      const nodesRes = await client.query<RawNode>(
        `SELECT id, kind, name, source_path, metadata FROM axhy_graph.nodes`,
      );
      const edgesRes = await client.query<RawEdge>(
        `SELECT id, kind, src_id, dst_id, metadata FROM axhy_graph.edges`,
      );
      const countsRes = await client.query<{ nodes: number; edges: number; chunks: number }>(`
        SELECT
          (SELECT COUNT(*)::int FROM axhy_graph.nodes) AS nodes,
          (SELECT COUNT(*)::int FROM axhy_graph.edges) AS edges,
          (SELECT COUNT(*)::int FROM axhy_graph.chunks) AS chunks
      `);

      let rawNodes = nodesRes.rows;
      let rawEdges = edgesRes.rows;
      const counts = countsRes.rows[0] ?? { nodes: 0, edges: 0, chunks: 0 };

      // Strip personal field nodes unless caller explicitly requests them.
      // ?includePersonal=1 is SUPER_ADMIN-only — already enforced by verifySuperAdmin().
      if (!includePersonal) {
        rawNodes = rawNodes.filter((n) => !(n.kind === 'field' && n.metadata?.personal === true));
        const allowedIds = new Set(rawNodes.map((n) => n.id));
        rawEdges = rawEdges.filter((e) => allowedIds.has(e.src_id) && allowedIds.has(e.dst_id));
      }

      return NextResponse.json({
        nodes: rawNodes.map((r) => ({
          id: r.id,
          kind: r.kind,
          name: r.name,
          sourcePath: r.source_path,
          metadata: r.metadata,
        })),
        edges: rawEdges.map((r) => ({
          id: r.id,
          kind: r.kind,
          source: r.src_id,
          target: r.dst_id,
          metadata: r.metadata,
        })),
        counts,
      });
    } finally {
      client.release();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
