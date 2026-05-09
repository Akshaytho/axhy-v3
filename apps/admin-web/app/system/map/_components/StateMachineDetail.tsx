/**
 * StateMachineDetail — detail panel for state machine root nodes.
 * Shows: states list, mirrored-by surfaces, lineage.
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

type StateMachineDetailProps = {
  node: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNavigate: (node: GraphNode) => void;
};

/** @derives(ADR-0021) */
export function StateMachineDetail({ node, nodes, edges, onNavigate }: StateMachineDetailProps) {
  // States: find state nodes with belongs_to edge pointing to this machine
  const stateNodes = findStateNodes(node, nodes, edges);

  // Mirrored by: incoming "mirrors" edges
  const mirroredByEdges = edgesTo(edges, node.id, 'mirrors');
  const mirroredByRows: EdgeRow[] = mirroredByEdges.map((e) => {
    const src = nodeById(nodes, e.source);
    return {
      id: e.source,
      name: src?.name ?? e.source,
      meta: src?.sourcePath ?? undefined,
    };
  });

  // Lineage
  const lineageEdges = edgesFrom(edges, node.id, 'derives_from');
  const lineageNodes = lineageEdges
    .map((e) => nodeById(nodes, e.target))
    .filter(Boolean) as GraphNode[];

  const meta = node.metadata as Record<string, unknown> | undefined;
  const stateCount = (meta?.stateCount as number) ?? stateNodes.length;

  return (
    <div className={styles.detailPanel}>
      <div className={styles.detailHeader}>
        <span
          className={styles.detailKindBadge}
          style={{ background: 'var(--ok-soft)', color: 'var(--ok)' }}
        >
          state machine
        </span>
        <h1 className={styles.detailTitle}>{node.name}</h1>
        {node.sourcePath && <div className={styles.detailSubtitle}>{node.sourcePath}</div>}
        <div className={styles.detailSubtitle} style={{ marginTop: '6px' }}>
          {stateCount > 0 && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--ok)' }}>
              {stateCount} state{stateCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className={styles.detailActions}>
          <a href="/system/graph" className={styles.actionLink}>
            ↗ open in graph view
          </a>
        </div>
      </div>

      <Section title="States" count={stateNodes.length} icon="●">
        {stateNodes.length === 0 ? (
          <p className={styles.noData}>No state nodes found for this machine.</p>
        ) : (
          <ul className={styles.edgeList}>
            {stateNodes.map((stateNode) => {
              const sm = stateNode.metadata as Record<string, unknown> | undefined;
              const transitionCount = edges.filter(
                (e) => e.source === stateNode.id && e.kind === 'transitions_to',
              ).length;
              return (
                <li key={stateNode.id} className={styles.edgeRow}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className={styles.edgeRowName}>{stateNode.name}</div>
                    {transitionCount > 0 && (
                      <div className={styles.edgeRowMeta}>
                        {transitionCount} transition{transitionCount !== 1 ? 's' : ''}
                      </div>
                    )}
                    {sm?.description ? (
                      <div className={styles.edgeRowMeta}>{String(sm.description)}</div>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Mirrored by these surfaces" count={mirroredByRows.length} icon="📺">
        <EdgeList
          rows={mirroredByRows}
          onNavigate={(id) => {
            const n = nodeById(nodes, id);
            if (n) onNavigate(n);
          }}
          emptyMessage="No UI surfaces mirror this state machine yet."
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

function findStateNodes(machine: GraphNode, nodes: GraphNode[], edges: GraphEdge[]): GraphNode[] {
  // Strategy 1: belongs_to edges pointing to this machine
  const byEdge = edges
    .filter((e) => e.target === machine.id && e.kind === 'belongs_to')
    .map((e) => nodeById(nodes, e.source))
    .filter((n): n is GraphNode => n !== undefined && n.kind === 'state');

  if (byEdge.length > 0) return byEdge;

  // Strategy 2: state nodes whose name starts with machine name
  const machineNameLower = machine.name.toLowerCase();
  return nodes.filter(
    (n) =>
      n.kind === 'state' &&
      n.id !== machine.id &&
      n.metadata?.isRoot !== true &&
      n.metadata?.isMachineRoot !== true &&
      n.name.toLowerCase().includes(machineNameLower.replace('state', '').replace('machine', '')),
  );
}

// Satisfy lint for imported but "unused" helper
const _edgesTo = edgesTo;
void _edgesTo;
