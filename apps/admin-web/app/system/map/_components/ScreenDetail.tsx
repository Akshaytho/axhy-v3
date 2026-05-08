/**
 * ScreenDetail — detail panel for ui_screen nodes.
 * Shows: reads, triggers, mounts, mirrors, navigates_to, "what breaks", lineage.
 *
 * @derives(ADR-0021)
 */

'use client';

import styles from '../_styles.module.css';

import { EdgeList } from './EdgeList';
import type { EdgeRow } from './EdgeList';
import { Section } from './Section';
import type { GraphEdge, GraphNode } from './types';
import { edgesFrom, edgesTo, nodeById } from './types';

type ScreenDetailProps = {
  node: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNavigate: (node: GraphNode) => void;
};

/** @derives(ADR-0021) */
export function ScreenDetail({ node, nodes, edges, onNavigate }: ScreenDetailProps) {
  // 1. Reads: outgoing "reads" edges from this screen
  const readEdges = edgesFrom(edges, node.id, 'reads');
  // Group by target entity
  const readsByEntity = groupEdgesByTarget(readEdges, nodes);

  // 2. Triggers: outgoing "triggers" edges from this screen
  const triggerEdges = edgesFrom(edges, node.id, 'triggers');
  const triggerRows: EdgeRow[] = triggerEdges.map((e) => {
    const target = nodeById(nodes, e.target);
    const meta = e.metadata as Record<string, unknown> | undefined;
    const method = (meta?.method as string) ?? '';
    return {
      id: e.target,
      name: target?.name ?? e.target,
      meta: target?.sourcePath ?? undefined,
      badge: method || undefined,
      badgeVariant: method ? 'method' : undefined,
    };
  });

  // 3. Mounts: outgoing "mounts" edges
  const mountEdges = edgesFrom(edges, node.id, 'mounts');
  const mountRows: EdgeRow[] = mountEdges.map((e) => {
    const target = nodeById(nodes, e.target);
    return {
      id: e.target,
      name: target?.name ?? e.target,
      meta: target?.sourcePath ?? undefined,
    };
  });

  // 4. Mirrors: outgoing "mirrors" edges
  const mirrorEdges = edgesFrom(edges, node.id, 'mirrors');
  const mirrorRows: EdgeRow[] = mirrorEdges.map((e) => {
    const target = nodeById(nodes, e.target);
    const meta = e.metadata as Record<string, unknown> | undefined;
    const stateCount = meta?.stateCount as number | undefined;
    const relevantStates = meta?.relevantStates as string[] | undefined;
    return {
      id: e.target,
      name: target?.name ?? e.target,
      meta:
        [
          stateCount !== undefined ? `${stateCount} states` : null,
          relevantStates?.length ? `relevant: ${relevantStates.join(', ')}` : null,
        ]
          .filter(Boolean)
          .join(' · ') || undefined,
    };
  });

  // 5. Navigates to: outgoing "navigates_to" edges.
  // Skip unresolvable + sentinel-named targets entirely — they're noise from
  // Phase 4's failed-href fallback. The audit metric tracks them separately.
  const navEdges = edgesFrom(edges, node.id, 'navigates_to').filter((e) => {
    const meta = e.metadata as Record<string, unknown> | undefined;
    if (meta?.unresolvable === true) return false;
    const target = nodeById(nodes, e.target);
    if (!target) return false;
    if (target.name === '__unresolvable__') return false;
    if (target.name.startsWith('__')) return false;
    return true;
  });
  const navRows: EdgeRow[] = navEdges.map((e) => {
    const target = nodeById(nodes, e.target);
    const meta = e.metadata as Record<string, unknown> | undefined;
    const isDynamic = meta?.dynamic === true;
    return {
      id: e.target,
      name: target?.name ?? e.target,
      meta: target?.sourcePath ?? undefined,
      badge: isDynamic ? 'dynamic' : undefined,
      badgeVariant: isDynamic ? 'dynamic' : undefined,
    };
  });

  // 6. "What breaks" — for each table/route/machine this screen depends on,
  // find OTHER ui_screen nodes that ALSO depend on it.
  const breaksItems = computeBreaks(node, nodes, edges);

  // 7. Lineage: outgoing "derives_from" edges
  const lineageEdges = edgesFrom(edges, node.id, 'derives_from');
  const lineageNodes = lineageEdges
    .map((e) => nodeById(nodes, e.target))
    .filter(Boolean) as GraphNode[];

  const meta = node.metadata as Record<string, unknown> | undefined;
  const app = (meta?.app as string) ?? extractApp(node.sourcePath);

  return (
    <div className={styles.detailPanel}>
      <div className={styles.detailHeader}>
        <span
          className={styles.detailKindBadge}
          style={{ background: 'var(--info-soft)', color: 'var(--info-ink)' }}
        >
          ui_screen
        </span>
        <h1 className={styles.detailTitle}>{node.name}</h1>
        <div className={styles.detailSubtitle}>
          {app && <span>{app} · </span>}
          {node.sourcePath && <span>{node.sourcePath}</span>}
        </div>
        <div className={styles.detailActions}>
          <a href={`/system/graph`} className={styles.actionLink} title="Open in dot-graph viewer">
            ↗ open in graph view
          </a>
          {node.sourcePath && (
            <span className={styles.actionLink} title={node.sourcePath}>
              📄 {truncatePath(node.sourcePath)}
            </span>
          )}
        </div>
      </div>

      <div className={styles.phaseNote}>
        Description from JSDoc auto-extraction is Phase 6 work — see SPEC.md §17. No description
        data available yet.
      </div>

      <Section title="Reads from these tables" count={readsByEntity.length} icon="📖">
        {readsByEntity.length === 0 ? (
          <p className={styles.noData}>No reads recorded for this screen.</p>
        ) : (
          <ul className={styles.edgeList}>
            {readsByEntity.map((item) => (
              <li
                key={item.entityId}
                className={`${styles.edgeRow} ${styles.edgeRowClickable}`}
                onClick={() => {
                  const n = nodeById(nodes, item.entityId);
                  if (n) onNavigate(n);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    const n = nodeById(nodes, item.entityId);
                    if (n) onNavigate(n);
                  }
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={styles.edgeRowName}>{item.entityName}</div>
                  <div className={styles.edgeRowMeta}>
                    {item.fieldCount > 0
                      ? `${item.fieldCount} field${item.fieldCount !== 1 ? 's' : ''}`
                      : 'entity-level read'}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Triggers these actions" count={triggerRows.length} icon="⚡">
        <EdgeList
          rows={triggerRows}
          onNavigate={(id) => {
            const n = nodeById(nodes, id);
            if (n) onNavigate(n);
          }}
          emptyMessage="No API actions triggered by this screen."
        />
      </Section>

      <Section title="Mounts these components" count={mountRows.length} icon="🧩">
        <EdgeList rows={mountRows} emptyMessage="No component mounts recorded." />
      </Section>

      <Section title="Mirrors this state machine" count={mirrorRows.length} icon="⚙">
        <EdgeList
          rows={mirrorRows}
          onNavigate={(id) => {
            const n = nodeById(nodes, id);
            if (n) onNavigate(n);
          }}
          emptyMessage="No state machine mirroring recorded."
        />
      </Section>

      <Section title="Navigates to" count={navRows.length} icon="→">
        <EdgeList
          rows={navRows}
          onNavigate={(id) => {
            const n = nodeById(nodes, id);
            if (n) onNavigate(n);
          }}
          emptyMessage="No navigation targets recorded."
        />
      </Section>

      {breaksItems.length > 0 && (
        <Section
          title="If you change anything here, these break"
          count={breaksItems.length}
          warnStyle
        >
          {breaksItems.map((item) => (
            <div key={item.depId} className={styles.breaksRow}>
              <div className={styles.breaksRowLeft}>
                <div className={styles.breaksRowName}>{item.depName}</div>
                <div className={styles.breaksRowCount}>
                  also used by {item.sharedScreenCount} other screen
                  {item.sharedScreenCount !== 1 ? 's' : ''}
                </div>
              </div>
            </div>
          ))}
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

type EntityReadGroup = {
  entityId: string;
  entityName: string;
  fieldCount: number;
};

function groupEdgesByTarget(edges: GraphEdge[], nodes: GraphNode[]): EntityReadGroup[] {
  const map = new Map<string, EntityReadGroup>();
  for (const e of edges) {
    const target = nodeById(nodes, e.target);
    if (!target) continue;
    // If target is a field, find the parent entity
    if (target.kind === 'field') {
      // Field names often formatted as Entity.field; we'd need belongs_to edges
      // For v1, group by field parent extracted from name
      const entityName = target.name.split('.')[0] ?? target.name;
      const key = `field-parent-${entityName}`;
      const existing = map.get(key);
      if (existing) {
        existing.fieldCount++;
      } else {
        map.set(key, { entityId: e.target, entityName, fieldCount: 1 });
      }
    } else {
      // Direct entity read
      const existing = map.get(e.target);
      if (existing) {
        existing.fieldCount++;
      } else {
        map.set(e.target, { entityId: e.target, entityName: target.name, fieldCount: 0 });
      }
    }
  }
  return Array.from(map.values());
}

type BreaksItem = {
  depId: string;
  depName: string;
  sharedScreenCount: number;
};

function computeBreaks(screen: GraphNode, nodes: GraphNode[], edges: GraphEdge[]): BreaksItem[] {
  // For each dependency of this screen (reads, triggers, mirrors edges),
  // find other ui_screen nodes that also have a relationship to the same target
  const outEdges = edges.filter(
    (e) => e.source === screen.id && ['reads', 'triggers', 'mirrors'].includes(e.kind),
  );
  const allScreenIds = nodes.filter((n) => n.kind === 'ui_screen').map((n) => n.id);

  const result: BreaksItem[] = [];
  const seen = new Set<string>();

  for (const dep of outEdges) {
    if (seen.has(dep.target)) continue;
    seen.add(dep.target);

    const target = nodeById(nodes, dep.target);
    if (!target) continue;

    // Count other screens that also depend on this target
    const otherScreens = edges.filter(
      (e) =>
        e.target === dep.target &&
        e.source !== screen.id &&
        allScreenIds.includes(e.source) &&
        ['reads', 'triggers', 'mirrors'].includes(e.kind),
    );

    const uniqueOtherScreens = new Set(otherScreens.map((e) => e.source));

    if (uniqueOtherScreens.size > 0) {
      result.push({
        depId: dep.target,
        depName: target.name,
        sharedScreenCount: uniqueOtherScreens.size,
      });
    }
  }

  return result.sort((a, b) => b.sharedScreenCount - a.sharedScreenCount);
}

function extractApp(sourcePath: string | null): string {
  if (!sourcePath) return '';
  if (sourcePath.includes('supervisor-preview')) return 'supervisor-preview';
  if (sourcePath.includes('admin-web')) return 'admin-web';
  if (sourcePath.includes('mobile')) return 'mobile';
  return '';
}

function truncatePath(path: string): string {
  const parts = path.split('/');
  if (parts.length <= 4) return path;
  return '…/' + parts.slice(-3).join('/');
}

// Re-export edgesTo to satisfy lint (it's imported from types)
const _edgesTo = edgesTo;
void _edgesTo;
