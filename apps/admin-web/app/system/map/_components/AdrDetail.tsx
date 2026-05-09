/**
 * AdrDetail — detail panel for ADR (Architecture Decision Record) nodes.
 * Shows: title, status, what derives from this ADR (grouped by source kind).
 *
 * @derives(ADR-0021)
 */

'use client';

import styles from '../_styles.module.css';

import { Section } from './Section';
import type { GraphEdge, GraphNode } from './types';
import { edgesTo, nodeById } from './types';

type AdrDetailProps = {
  node: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNavigate: (node: GraphNode) => void;
};

const KIND_LABELS: Record<string, string> = {
  ui_screen: 'Screens',
  api_endpoint: 'Routes',
  entity: 'Tables',
  state: 'State Machines',
  ui_component: 'Components',
  adr: 'ADRs',
  master_plan_section: 'Master Plan Sections',
  doc: 'Documents',
  field: 'Fields',
};

/** @derives(ADR-0021) */
export function AdrDetail({ node, nodes, edges, onNavigate }: AdrDetailProps) {
  const meta = node.metadata as Record<string, unknown> | undefined;
  const status = (meta?.status as string) ?? 'Unknown';
  const adrId = (meta?.adrId as string) ?? node.name;

  // What derives from this ADR: incoming "derives_from" edges
  const derivedEdges = edgesTo(edges, node.id, 'derives_from');

  // Group by source kind
  const grouped = new Map<string, GraphNode[]>();
  for (const e of derivedEdges) {
    const src = nodeById(nodes, e.source);
    if (!src) continue;
    const kindGroup = grouped.get(src.kind) ?? [];
    kindGroup.push(src);
    grouped.set(src.kind, kindGroup);
  }

  const totalDerived = derivedEdges.length;

  const statusColor = (() => {
    switch (status.toLowerCase()) {
      case 'accepted':
        return { bg: 'var(--ok-soft)', color: 'var(--ok)' };
      case 'deprecated':
        return { bg: 'var(--bad-soft)', color: 'var(--bad)' };
      case 'superseded':
        return { bg: 'var(--warn-soft)', color: 'var(--warn)' };
      case 'proposed':
        return { bg: 'var(--info-soft)', color: 'var(--info-ink)' };
      default:
        return { bg: 'var(--paper-3)', color: 'var(--ink-3)' };
    }
  })();

  return (
    <div className={styles.detailPanel}>
      <div className={styles.detailHeader}>
        <span
          className={styles.detailKindBadge}
          style={{ background: 'var(--paper-3)', color: 'var(--ink-2)' }}
        >
          adr
        </span>
        <h1 className={styles.detailTitle}>{node.name}</h1>
        {node.sourcePath && <div className={styles.detailSubtitle}>{node.sourcePath}</div>}
        <div className={styles.detailActions}>
          <span
            className={styles.detailKindBadge}
            style={{ background: statusColor.bg, color: statusColor.color }}
          >
            {status}
          </span>
          {adrId && adrId !== node.name && (
            <span
              style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--ink-3)' }}
            >
              {adrId}
            </span>
          )}
          <a href="/system/graph" className={styles.actionLink}>
            ↗ open in graph view
          </a>
        </div>
      </div>

      <Section title="What derives from this ADR" count={totalDerived} icon="📐">
        {totalDerived === 0 ? (
          <p className={styles.noData}>Nothing in the graph derives from this ADR yet.</p>
        ) : (
          <div>
            {Array.from(grouped.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([kind, kindNodes]) => (
                <div key={kind}>
                  <div
                    style={{
                      padding: '8px 14px 4px',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      fontWeight: 500,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: 'var(--ink-3)',
                      borderBottom: '1px solid var(--card-edge)',
                      background: 'var(--paper-2)',
                    }}
                  >
                    {KIND_LABELS[kind] ?? kind} ({kindNodes.length})
                  </div>
                  <ul className={styles.edgeList}>
                    {kindNodes.map((n) => (
                      <li
                        key={n.id}
                        className={`${styles.edgeRow} ${styles.edgeRowClickable}`}
                        onClick={() => onNavigate(n)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') onNavigate(n);
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className={styles.edgeRowName}>{n.name}</div>
                          {n.sourcePath && <div className={styles.edgeRowMeta}>{n.sourcePath}</div>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        )}
      </Section>
    </div>
  );
}
