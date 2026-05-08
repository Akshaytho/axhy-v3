/**
 * RouteDetail — detail panel for api_endpoint nodes.
 * Shows: who can call this, triggered-by, reads, writes, lineage.
 *
 * @derives(ADR-0021)
 */

'use client';

import styles from '../_styles.module.css';

import type { EdgeRow } from './EdgeList';
import { EdgeList } from './EdgeList';
import { Section } from './Section';
import type { GraphEdge, GraphNode } from './types';
import { edgesFrom, edgesTo, nodeById } from './types';

type RouteDetailProps = {
  node: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNavigate: (node: GraphNode) => void;
};

/** @derives(ADR-0021) */
export function RouteDetail({ node, nodes, edges, onNavigate }: RouteDetailProps) {
  const meta = node.metadata as Record<string, unknown> | undefined;
  const method = (meta?.method as string) ?? '';
  const roles = (meta?.roles as string[]) ?? (meta?.role as string[]) ?? [];

  // Triggered by: incoming "triggers" edges
  const triggeredByEdges = edgesTo(edges, node.id, 'triggers');
  const triggeredByRows: EdgeRow[] = deduplicateBySrc(triggeredByEdges).map((e) => {
    const src = nodeById(nodes, e.source);
    return {
      id: e.source,
      name: src?.name ?? e.source,
      meta: src?.sourcePath ?? undefined,
    };
  });

  // Reads: outgoing "reads" edges
  const readEdges = edgesFrom(edges, node.id, 'reads');
  const readRows: EdgeRow[] = readEdges.map((e) => {
    const target = nodeById(nodes, e.target);
    return {
      id: e.target,
      name: target?.name ?? e.target,
      meta: target?.sourcePath ?? undefined,
    };
  });

  // Writes: outgoing "writes" edges
  const writeEdges = edgesFrom(edges, node.id, 'writes');
  const writeRows: EdgeRow[] = writeEdges.map((e) => {
    const target = nodeById(nodes, e.target);
    return {
      id: e.target,
      name: target?.name ?? e.target,
      meta: target?.sourcePath ?? undefined,
    };
  });

  // Lineage
  const lineageEdges = edgesFrom(edges, node.id, 'derives_from');
  const lineageNodes = lineageEdges
    .map((e) => nodeById(nodes, e.target))
    .filter(Boolean) as GraphNode[];

  return (
    <div className={styles.detailPanel}>
      <div className={styles.detailHeader}>
        <span
          className={styles.detailKindBadge}
          style={{ background: 'var(--warn-soft)', color: 'var(--warn)' }}
        >
          api_endpoint
        </span>
        <h1 className={styles.detailTitle}>
          {method && (
            <span style={{ color: 'var(--accent)', marginRight: '10px', fontSize: '18px' }}>
              {method}
            </span>
          )}
          {node.name}
        </h1>
        {node.sourcePath && <div className={styles.detailSubtitle}>{node.sourcePath}</div>}
        <div className={styles.detailActions}>
          <a href="/system/graph" className={styles.actionLink}>
            ↗ open in graph view
          </a>
        </div>
      </div>

      {roles.length > 0 && (
        <Section title="Who can call this" count={roles.length} icon="🔑">
          <div className={styles.rolePills}>
            {roles.map((role) => (
              <span key={role} className={styles.rolePill}>
                {role}
              </span>
            ))}
          </div>
        </Section>
      )}

      <Section title="Triggered by these surfaces" count={triggeredByRows.length} icon="↩">
        <EdgeList
          rows={triggeredByRows}
          onNavigate={(id) => {
            const n = nodeById(nodes, id);
            if (n) onNavigate(n);
          }}
          emptyMessage="No surfaces trigger this route yet."
        />
      </Section>

      <Section title="Reads" count={readRows.length} icon="📖">
        <EdgeList
          rows={readRows}
          onNavigate={(id) => {
            const n = nodeById(nodes, id);
            if (n) onNavigate(n);
          }}
          emptyMessage="No reads recorded for this route."
        />
      </Section>

      <Section title="Writes" count={writeRows.length} icon="✏">
        <EdgeList
          rows={writeRows}
          onNavigate={(id) => {
            const n = nodeById(nodes, id);
            if (n) onNavigate(n);
          }}
          emptyMessage="No writes recorded for this route."
        />
      </Section>

      {lineageNodes.length > 0 && (
        <Section title="Lineage" count={lineageNodes.length} icon="📌">
          <div className={styles.lineageTags}>
            {lineageNodes.map((n) => (
              <button
                key={n.id}
                type="button"
                className={styles.lineageTag}
                onClick={() => onNavigate(n)}
              >
                {n.name}
              </button>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ── Helpers ──

function deduplicateBySrc(edges: GraphEdge[]): GraphEdge[] {
  const seen = new Set<string>();
  return edges.filter((e) => {
    if (seen.has(e.source)) return false;
    seen.add(e.source);
    return true;
  });
}
