/**
 * ScreenDetail — detail panel for ui_screen nodes.
 * Shows: reads, triggers, mounts, mirrors, navigates_to, "what breaks", lineage.
 * Tier 3: also shows transitive reads/writes via screen -> triggers -> api_endpoint -> reads/writes.
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

/** Groups for a single transitive entity: which routes touch it and which fields */
type TransitiveEntityEntry = {
  entity: GraphNode;
  viaRoutes: GraphNode[];
  fields: GraphNode[];
};

/**
 * Compute the transitive entity map for a given edge kind (reads | writes).
 * Follows: screen --triggers--> api_endpoint --[kind]--> entity/field
 *
 * @derives(ADR-0021)
 */
function computeTransitiveByEntity(
  screenId: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
  kind: 'reads' | 'writes',
): Map<string, TransitiveEntityEntry> {
  const triggerEdges = edgesFrom(edges, screenId, 'triggers');
  const byEntity = new Map<string, TransitiveEntityEntry>();

  for (const trigger of triggerEdges) {
    const route = nodeById(nodes, trigger.target);
    if (!route || route.kind !== 'api_endpoint') continue;

    const routeDataEdges = edgesFrom(edges, route.id, kind);
    for (const r of routeDataEdges) {
      const target = nodeById(nodes, r.target);
      if (!target) continue;

      if (target.kind === 'entity') {
        const entry = byEntity.get(target.id) ?? {
          entity: target,
          viaRoutes: [],
          fields: [],
        };
        if (!entry.viaRoutes.find((x) => x.id === route.id)) entry.viaRoutes.push(route);
        byEntity.set(target.id, entry);
      } else if (target.kind === 'field') {
        // Resolve parent entity via belongs_to edge
        const belongsToEdges = edgesFrom(edges, target.id, 'belongs_to');
        const parentId = belongsToEdges[0]?.target;
        if (parentId) {
          const parent = nodeById(nodes, parentId);
          if (parent) {
            const entry = byEntity.get(parentId) ?? {
              entity: parent,
              viaRoutes: [],
              fields: [],
            };
            if (!entry.viaRoutes.find((x) => x.id === route.id)) entry.viaRoutes.push(route);
            if (!entry.fields.find((x) => x.id === target.id)) entry.fields.push(target);
            byEntity.set(parentId, entry);
          }
        }
      }
    }
  }

  return byEntity;
}

/** Format a route node as a readable label like "POST /workers/:id" */
function routeLabel(route: GraphNode): string {
  const meta = route.metadata as Record<string, unknown> | undefined;
  const method = (meta?.method as string) ?? '';
  return method ? `${method} ${route.name}` : route.name;
}

/** @derives(ADR-0021) */
export function ScreenDetail({ node, nodes, edges, onNavigate }: ScreenDetailProps) {
  // 1. Reads: outgoing "reads" edges from this screen (direct)
  const readEdges = edgesFrom(edges, node.id, 'reads');
  const readsByEntity = groupEdgesByTarget(readEdges, nodes);

  // 1b. Transitive reads: screen -> triggers -> api_endpoint -> reads -> entity/field
  const transitiveReads = computeTransitiveByEntity(node.id, nodes, edges, 'reads');
  const transitiveReadEntries = Array.from(transitiveReads.values());

  // 1c. Transitive writes: screen -> triggers -> api_endpoint -> writes -> entity/field
  const transitiveWrites = computeTransitiveByEntity(node.id, nodes, edges, 'writes');
  const transitiveWriteEntries = Array.from(transitiveWrites.values());

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

  // 6. "What breaks" — for each table/route/machine this screen depends on (direct + transitive),
  // find OTHER ui_screen nodes that ALSO depend on it.
  const breaksItems = computeBreaks(node, nodes, edges, transitiveReads, transitiveWrites);

  // 7. Lineage: outgoing "derives_from" edges
  const lineageEdges = edgesFrom(edges, node.id, 'derives_from');
  const lineageNodes = lineageEdges
    .map((e) => nodeById(nodes, e.target))
    .filter(Boolean) as GraphNode[];

  const meta = node.metadata as Record<string, unknown> | undefined;
  const app = (meta?.app as string) ?? extractApp(node.sourcePath);

  const hasDirectReads = readsByEntity.length > 0;
  const hasTransitiveReads = transitiveReadEntries.length > 0;
  const hasTransitiveWrites = transitiveWriteEntries.length > 0;

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

      {/* Direct reads — shown when present */}
      <Section title="Reads from these tables" count={readsByEntity.length} icon="📖">
        {!hasDirectReads && !hasTransitiveReads ? (
          <p className={styles.noData}>
            This screen does not directly query any tables. (Tables touched via API calls — see
            Triggers section.)
          </p>
        ) : !hasDirectReads ? (
          <p className={styles.noData}>No direct table reads on this screen.</p>
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

      {/* Transitive reads — only shown when there is at least one */}
      {hasTransitiveReads && (
        <Section
          title="Reads from these tables (via API)"
          count={transitiveReadEntries.length}
          icon="📖"
        >
          <TransitiveEntityList entries={transitiveReadEntries} onNavigate={onNavigate} />
        </Section>
      )}

      {/* Transitive writes — only shown when there is at least one */}
      {hasTransitiveWrites && (
        <Section
          title="Writes to these tables (via API)"
          count={transitiveWriteEntries.length}
          icon="✏️"
        >
          <TransitiveEntityList entries={transitiveWriteEntries} onNavigate={onNavigate} />
        </Section>
      )}

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
                  {item.isTransitive ? ' (via API)' : ''}
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

// ── Transitive entity list component ──

type TransitiveEntityListProps = {
  entries: TransitiveEntityEntry[];
  onNavigate: (node: GraphNode) => void;
};

function TransitiveEntityList({ entries, onNavigate }: TransitiveEntityListProps) {
  return (
    <ul className={styles.edgeList}>
      {entries.map((entry) => {
        const routeLabels = entry.viaRoutes.map(routeLabel).join(', ');
        const fieldNames = entry.fields.map((f) => f.name.split('.').pop() ?? f.name);
        const fieldSuffix =
          fieldNames.length > 0 ? ` · fields: ${fieldNames.slice(0, 4).join(', ')}` : '';
        const metaLine = `via ${routeLabels}${fieldSuffix}`;
        return (
          <li
            key={entry.entity.id}
            className={`${styles.edgeRow} ${styles.edgeRowClickable}`}
            onClick={() => onNavigate(entry.entity)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onNavigate(entry.entity);
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className={styles.edgeRowName}>{entry.entity.name}</div>
              <div className={styles.edgeRowMeta}>{metaLine}</div>
            </div>
          </li>
        );
      })}
    </ul>
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
  isTransitive: boolean;
};

/**
 * Compute "what breaks" — for each dependency of this screen (direct edges +
 * transitive entity reads/writes via API), find other ui_screen nodes that also
 * depend on the same target (directly or transitively).
 *
 * @derives(ADR-0021)
 */
function computeBreaks(
  screen: GraphNode,
  nodes: GraphNode[],
  edges: GraphEdge[],
  transitiveReads: Map<string, TransitiveEntityEntry>,
  transitiveWrites: Map<string, TransitiveEntityEntry>,
): BreaksItem[] {
  // Direct outgoing deps (reads, triggers, mirrors)
  const directOutEdges = edges.filter(
    (e) => e.source === screen.id && ['reads', 'triggers', 'mirrors'].includes(e.kind),
  );
  const allScreenIds = nodes.filter((n) => n.kind === 'ui_screen').map((n) => n.id);

  const result: BreaksItem[] = [];
  const seen = new Set<string>();

  // Helper: add a dep target to the result
  const addDep = (targetId: string, isTransitive: boolean): void => {
    if (seen.has(targetId)) return;
    seen.add(targetId);

    const target = nodeById(nodes, targetId);
    if (!target) return;

    // Count other screens that also depend on this target (directly)
    const otherDirectScreens = edges.filter(
      (e) =>
        e.target === targetId &&
        e.source !== screen.id &&
        allScreenIds.includes(e.source) &&
        ['reads', 'triggers', 'mirrors'].includes(e.kind),
    );

    // Count other screens that also touch this entity transitively
    const otherTransitiveScreens = new Set<string>();
    for (const sid of allScreenIds) {
      if (sid === screen.id) continue;
      const tr = computeTransitiveByEntity(sid, nodes, edges, 'reads');
      const tw = computeTransitiveByEntity(sid, nodes, edges, 'writes');
      if (tr.has(targetId) || tw.has(targetId)) {
        otherTransitiveScreens.add(sid);
      }
    }

    const uniqueOtherScreens = new Set([
      ...otherDirectScreens.map((e) => e.source),
      ...otherTransitiveScreens,
    ]);

    if (uniqueOtherScreens.size > 0) {
      result.push({
        depId: targetId,
        depName: target.name,
        sharedScreenCount: uniqueOtherScreens.size,
        isTransitive,
      });
    }
  };

  // 1. Direct deps
  for (const dep of directOutEdges) {
    addDep(dep.target, false);
  }

  // 2. Transitive read entities
  for (const entityId of transitiveReads.keys()) {
    addDep(entityId, true);
  }

  // 3. Transitive write entities
  for (const entityId of transitiveWrites.keys()) {
    addDep(entityId, true);
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
