/**
 * Sidebar — sticky left panel for /system/map.
 * Groups nodes by kind (Screens, Routes, Tables, State Machines, ADRs).
 * Within Screens, further groups by app (admin-web, supervisor-preview, mobile).
 *
 * @derives(ADR-0014)
 */

'use client';

import { useState } from 'react';

import styles from '../_styles.module.css';

import type { GraphEdge, GraphNode } from './types';

type SidebarProps = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedId: string | null;
  onSelect: (node: GraphNode) => void;
};

type GroupConfig = {
  label: string;
  kind: string;
  defaultOpen: boolean;
};

const GROUPS: GroupConfig[] = [
  { label: 'Screens', kind: 'ui_screen', defaultOpen: true },
  { label: 'Routes', kind: 'api_endpoint', defaultOpen: false },
  { label: 'Tables', kind: 'entity', defaultOpen: false },
  { label: 'State Machines', kind: 'state', defaultOpen: false },
  { label: 'ADRs', kind: 'adr', defaultOpen: false },
];

// For ui_screen nodes, group by app (extracted from sourcePath or metadata)
function appForScreen(node: GraphNode): string {
  const sp = node.sourcePath ?? '';
  const meta = node.metadata as Record<string, string> | undefined;
  if (meta?.app) return String(meta.app);
  if (sp.includes('supervisor-preview')) return 'supervisor-preview';
  if (sp.includes('admin-web')) return 'admin-web';
  if (sp.includes('mobile')) return 'mobile';
  if (sp.includes('worker')) return 'mobile';
  return 'other';
}

const APP_ORDER = ['admin-web', 'supervisor-preview', 'mobile', 'other'];
const APP_LABELS: Record<string, string> = {
  'admin-web': 'admin-web',
  'supervisor-preview': 'supervisor',
  mobile: 'mobile',
  other: 'other',
};

type SubgroupState = Record<string, boolean>;

/** @derives(ADR-0014) */
export function Sidebar({ nodes, edges, selectedId, onSelect }: SidebarProps) {
  const initialGroupOpen = Object.fromEntries(GROUPS.map((g) => [g.kind, g.defaultOpen]));
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>(initialGroupOpen);
  const [subgroupOpen, setSubgroupOpen] = useState<SubgroupState>({
    'admin-web': true,
    'supervisor-preview': true,
    mobile: true,
    other: true,
  });

  // Root state machines are the TARGETS of belongs_to edges among state nodes
  const rootStateMachineIds = new Set(
    edges
      .filter((e) => e.kind === 'belongs_to')
      .map((e) => e.target)
      .filter((id) => nodes.some((n) => n.id === id && n.kind === 'state')),
  );
  // Also include states with isRoot/isMachineRoot metadata, or if no belongs_to edges exist,
  // show all state nodes as roots.
  const hasAnyBelongsTo = edges.some((e) => e.kind === 'belongs_to');

  function toggleGroup(kind: string) {
    setGroupOpen((prev) => ({ ...prev, [kind]: !prev[kind] }));
  }

  function toggleSubgroup(app: string) {
    setSubgroupOpen((prev) => ({ ...prev, [app]: !prev[app] }));
  }

  return (
    <nav className={styles.sidebar} aria-label="Map navigation">
      {GROUPS.map((group) => {
        let groupNodes = nodes.filter((n) => {
          if (group.kind === 'state') {
            if (n.kind !== 'state') return false;
            // isRoot/isMachineRoot explicit flags take priority
            if (n.metadata?.isRoot === true || n.metadata?.isMachineRoot === true) return true;
            // Otherwise: if belongs_to edges exist, show only targets (roots)
            if (hasAnyBelongsTo) return rootStateMachineIds.has(n.id);
            // No belongs_to edges at all — show all state nodes
            return true;
          }
          return n.kind === group.kind;
        });

        // Deduplicate ADRs: multiple nodes with the same name are graph references,
        // not distinct ADRs. Show only the first occurrence of each unique name.
        if (group.kind === 'adr') {
          const seenNames = new Set<string>();
          groupNodes = groupNodes.filter((n) => {
            if (seenNames.has(n.name)) return false;
            seenNames.add(n.name);
            return true;
          });
        }

        if (groupNodes.length === 0) return null;

        const isOpen = groupOpen[group.kind] ?? group.defaultOpen;

        return (
          <div key={group.kind} className={styles.sidebarGroup}>
            <button
              type="button"
              className={styles.sidebarGroupHeader}
              onClick={() => toggleGroup(group.kind)}
              aria-expanded={isOpen}
            >
              <span>{group.label}</span>
              <span>
                <span className={styles.sidebarGroupCount}>{groupNodes.length}</span>{' '}
                <span className={`${styles.sidebarGroupArrow}${isOpen ? ` ${styles.isOpen}` : ''}`}>
                  ▶
                </span>
              </span>
            </button>

            {isOpen &&
              (group.kind === 'ui_screen' ? (
                // Screens get sub-grouped by app
                <ScreenSubgroups
                  nodes={groupNodes}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  subgroupOpen={subgroupOpen}
                  onToggleSubgroup={toggleSubgroup}
                />
              ) : (
                <ul className={styles.sidebarItems}>
                  {groupNodes
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((node) => (
                      <li key={node.id}>
                        <button
                          type="button"
                          className={`${styles.sidebarItem}${selectedId === node.id ? ` ${styles.isSelected}` : ''}`}
                          onClick={() => onSelect(node)}
                          title={node.sourcePath ?? node.name}
                        >
                          <span className={styles.sidebarItemName}>{node.name}</span>
                        </button>
                      </li>
                    ))}
                </ul>
              ))}
          </div>
        );
      })}
    </nav>
  );
}

type ScreenSubgroupsProps = {
  nodes: GraphNode[];
  selectedId: string | null;
  onSelect: (node: GraphNode) => void;
  subgroupOpen: SubgroupState;
  onToggleSubgroup: (app: string) => void;
};

function ScreenSubgroups({
  nodes,
  selectedId,
  onSelect,
  subgroupOpen,
  onToggleSubgroup,
}: ScreenSubgroupsProps) {
  // Group by app
  const byApp: Record<string, GraphNode[]> = {};
  for (const node of nodes) {
    const app = appForScreen(node);
    if (!byApp[app]) byApp[app] = [];
    byApp[app].push(node);
  }

  return (
    <>
      {APP_ORDER.filter((app) => byApp[app]?.length).map((app) => {
        const appNodes = (byApp[app] ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
        const isOpen = subgroupOpen[app] ?? true;

        return (
          <div key={app} className={styles.sidebarSubgroup}>
            <button
              type="button"
              className={styles.sidebarSubgroupHeader}
              onClick={() => onToggleSubgroup(app)}
              aria-expanded={isOpen}
            >
              <span>{APP_LABELS[app] ?? app}</span>
              <span>
                <span
                  style={{
                    color: 'var(--ink-4)',
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  {appNodes.length}
                </span>{' '}
                <span
                  className={`${styles.sidebarSubgroupArrow}${isOpen ? ` ${styles.isOpen}` : ''}`}
                >
                  ▶
                </span>
              </span>
            </button>
            {isOpen && (
              <ul className={styles.sidebarItems}>
                {appNodes.map((node) => (
                  <li key={node.id}>
                    <button
                      type="button"
                      className={`${styles.sidebarItem}${selectedId === node.id ? ` ${styles.isSelected}` : ''}`}
                      onClick={() => onSelect(node)}
                      title={node.sourcePath ?? node.name}
                    >
                      <span className={styles.sidebarItemName}>{node.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </>
  );
}
