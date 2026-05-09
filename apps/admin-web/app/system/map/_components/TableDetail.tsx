/**
 * TableDetail — detail panel for entity (table / Prisma model) nodes.
 * Shows: fields, read-by surfaces, written-by routes, governed-by state machine, lineage.
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

type TableDetailProps = {
  node: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNavigate: (node: GraphNode) => void;
};

/** @derives(ADR-0021) */
export function TableDetail({ node, nodes, edges, onNavigate }: TableDetailProps) {
  // Fields: find field nodes whose name starts with "EntityName." OR
  // that have a belongs_to edge to this entity node
  const fieldNodes = findFieldNodes(node, nodes, edges);

  // Compute incoming reads/writes per field for the fields table
  const fieldReadCount = (fieldId: string) =>
    edges.filter((e) => e.target === fieldId && e.kind === 'reads').length;
  const fieldWriteCount = (fieldId: string) =>
    edges.filter((e) => e.target === fieldId && e.kind === 'writes').length;

  // Read by these surfaces: incoming "reads" edges (from any screen or route)
  const readByEdges = edgesTo(edges, node.id, 'reads');
  const readByRows: EdgeRow[] = deduplicateBySrc(readByEdges, nodes).map((e) => {
    const src = nodeById(nodes, e.source);
    return {
      id: e.source,
      name: src?.name ?? e.source,
      meta: src?.sourcePath ?? undefined,
    };
  });

  // Written by these routes: incoming "writes" edges
  const writtenByEdges = edgesTo(edges, node.id, 'writes');
  const writtenByRows: EdgeRow[] = deduplicateBySrc(writtenByEdges, nodes).map((e) => {
    const src = nodeById(nodes, e.source);
    const meta = e.metadata as Record<string, unknown> | undefined;
    const method = (meta?.method as string) ?? '';
    return {
      id: e.source,
      name: src?.name ?? e.source,
      meta: src?.sourcePath ?? undefined,
      badge: method || undefined,
      badgeVariant: method ? ('method' as const) : undefined,
    };
  });

  // Governed by state machine: best-effort match by entity name
  const stateMachineNodes = findGoverningMachines(node, nodes, edges);
  const stateMachineRows: EdgeRow[] = stateMachineNodes.map((sm) => ({
    id: sm.id,
    name: sm.name,
    meta: sm.sourcePath ?? undefined,
  }));

  // "What breaks": count all surfaces + routes + machines depending on this entity
  const totalDependents = new Set([
    ...readByEdges.map((e) => e.source),
    ...writtenByEdges.map((e) => e.source),
  ]).size;

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
          style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}
        >
          entity
        </span>
        <h1 className={styles.detailTitle}>{node.name}</h1>
        {node.sourcePath && <div className={styles.detailSubtitle}>{node.sourcePath}</div>}
        <div className={styles.detailActions}>
          <a href="/system/graph" className={styles.actionLink}>
            ↗ open in graph view
          </a>
        </div>
      </div>

      <div className={styles.phaseNote}>
        Description from JSDoc auto-extraction is Phase 6 work — see SPEC.md §17.
      </div>

      <Section title="Fields" count={fieldNodes.length} icon="🗂">
        {fieldNodes.length === 0 ? (
          <p className={styles.noData}>No field nodes found for this entity.</p>
        ) : (
          <table className={styles.fieldsTable}>
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>PII</th>
                <th>Reads</th>
                <th>Writes</th>
              </tr>
            </thead>
            <tbody>
              {fieldNodes.map((field) => {
                const fmeta = field.metadata as Record<string, unknown> | undefined;
                const isPii = fmeta?.personal === true;
                const fieldType = (fmeta?.type as string) ?? '—';
                const reads = fieldReadCount(field.id);
                const writes = fieldWriteCount(field.id);
                const shortName = field.name.includes('.')
                  ? field.name.split('.').slice(1).join('.')
                  : field.name;
                return (
                  <tr key={field.id}>
                    <td>
                      <span className={styles.fieldName}>{shortName}</span>
                    </td>
                    <td>
                      <span className={styles.fieldType}>{fieldType}</span>
                    </td>
                    <td>
                      {isPii ? (
                        <span className={`${styles.edgeRowBadge} ${styles.badgePii}`}>PII</span>
                      ) : (
                        <span style={{ color: 'var(--ink-4)', fontSize: '11px' }}>—</span>
                      )}
                    </td>
                    <td>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                          color: 'var(--ink-3)',
                        }}
                      >
                        {reads || '—'}
                      </span>
                    </td>
                    <td>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '11px',
                          color: 'var(--ink-3)',
                        }}
                      >
                        {writes || '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Section>

      <Section title="Read by these surfaces" count={readByRows.length} icon="👁">
        <EdgeList
          rows={readByRows}
          onNavigate={(id) => {
            const n = nodeById(nodes, id);
            if (n) onNavigate(n);
          }}
          emptyMessage="No surfaces read this table yet."
        />
      </Section>

      <Section title="Written by these routes" count={writtenByRows.length} icon="✏">
        <EdgeList
          rows={writtenByRows}
          onNavigate={(id) => {
            const n = nodeById(nodes, id);
            if (n) onNavigate(n);
          }}
          emptyMessage="No routes write to this table yet."
        />
      </Section>

      <Section title="Governed by state machine" count={stateMachineRows.length} icon="⚙">
        <EdgeList
          rows={stateMachineRows}
          onNavigate={(id) => {
            const n = nodeById(nodes, id);
            if (n) onNavigate(n);
          }}
          emptyMessage="No state machine governs this entity (best-effort match)."
        />
      </Section>

      {totalDependents > 0 && (
        <Section
          title={`If you rename or drop this — ${totalDependents} surface${totalDependents !== 1 ? 's' : ''} will break`}
          warnStyle
        >
          <div className={styles.breaksRow}>
            <div className={styles.breaksRowLeft}>
              <div className={styles.breaksRowName}>{node.name}</div>
              <div className={styles.breaksRowCount}>
                {readByRows.length} reader{readByRows.length !== 1 ? 's' : ''} ·{' '}
                {writtenByRows.length} writer{writtenByRows.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
        </Section>
      )}

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

function findFieldNodes(entity: GraphNode, nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] {
  // Strategy 1: belongs_to edges pointing to this entity
  const byEdge = edges
    .filter((e) => e.target === entity.id && e.kind === 'belongs_to')
    .map((e) => nodeById(nodes, e.source))
    .filter((n): n is GraphNode => n !== undefined && n.kind === 'field');

  if (byEdge.length > 0) return byEdge;

  // Strategy 2: field nodes whose name starts with "EntityName."
  return nodes.filter((n) => n.kind === 'field' && n.name.startsWith(`${entity.name}.`));
}

function findGoverningMachines(
  entity: GraphNode,
  nodes: GraphNode[],
  _edges: GraphEdge[],
): GraphNode[] {
  const entityNameLower = entity.name.toLowerCase();
  // Find state nodes with name that contains the entity name (e.g., WorkerState, workerMachine)
  return nodes.filter(
    (n) =>
      n.kind === 'state' &&
      (n.metadata?.isRoot === true || n.metadata?.isMachineRoot === true) &&
      (n.name.toLowerCase().includes(entityNameLower) ||
        entityNameLower.includes(n.name.toLowerCase().replace('state', '').replace('machine', ''))),
  );
}

function deduplicateBySrc(edges: GraphEdge[], _nodes: GraphNode[]): GraphEdge[] {
  const seen = new Set<string>();
  return edges.filter((e) => {
    if (seen.has(e.source)) return false;
    seen.add(e.source);
    return true;
  });
}
