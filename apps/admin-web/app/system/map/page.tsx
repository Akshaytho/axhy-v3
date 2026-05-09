/**
 * /system/map — human-first narrative viewer for the Axhy knowledge graph.
 *
 * Stripe-API-docs-style layout: click any node in the sidebar to read
 * plain-English "what this reads, triggers, mounts, mirrors" in the detail panel.
 *
 * Data: fetches /api/graph once (full 2,300-node snapshot, ~700KB).
 * Auth: SUPER_ADMIN JWT or NEXT_PUBLIC_DEV_GRAPH_TOKEN dev bypass.
 * Complements /system/graph (the dot-graph viewer) — both stay alive.
 *
 * @derives(ADR-0021)
 * @derives(ADR-0014)
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import styles from './_styles.module.css';
import { AdrDetail } from './_components/AdrDetail';
import { RouteDetail } from './_components/RouteDetail';
import { ScreenDetail } from './_components/ScreenDetail';
import { SearchBar } from './_components/SearchBar';
import { Sidebar } from './_components/Sidebar';
import { StateMachineDetail } from './_components/StateMachineDetail';
import { TableDetail } from './_components/TableDetail';
import type { GraphNode, GraphSnapshot } from './_components/types';

/** @derives(ADR-0021) */
export default function MapPage() {
  const [data, setData] = useState<GraphSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const devToken = process.env.NEXT_PUBLIC_DEV_GRAPH_TOKEN;
    const headers: Record<string, string> = devToken ? { Authorization: `Bearer ${devToken}` } : {};
    fetch('/api/graph', { headers })
      .then((r) => r.json())
      .then((j: GraphSnapshot & { error?: string }) => {
        if (j.error) {
          setError(j.error);
        } else {
          setData(j);
        }
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const selectedNode = useMemo(
    () => (data && selectedId ? (data.nodes.find((n) => n.id === selectedId) ?? null) : null),
    [data, selectedId],
  );

  const handleSelect = useCallback((node: GraphNode) => {
    setSelectedId(node.id);
  }, []);

  if (loading) {
    return (
      <div className={styles.shell}>
        <PageHeader nodes={[]} onSelect={handleSelect} data={null} />
        <div className={styles.body}>
          <div className={styles.loadingState}>Loading graph…</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={styles.shell}>
        <PageHeader nodes={[]} onSelect={handleSelect} data={null} />
        <div className={styles.body}>
          <div className={styles.errorState}>
            <span>Failed to load graph</span>
            <span style={{ fontSize: '12px', color: 'var(--ink-3)' }}>{error}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <PageHeader nodes={data.nodes} onSelect={handleSelect} data={data} />
      <div className={styles.body}>
        <Sidebar
          nodes={data.nodes}
          edges={data.edges}
          selectedId={selectedId}
          onSelect={handleSelect}
        />
        <main className={styles.main}>
          {!selectedNode ? (
            <EmptyState counts={data.counts} />
          ) : (
            <DetailRouter
              node={selectedNode}
              nodes={data.nodes}
              edges={data.edges}
              onNavigate={handleSelect}
            />
          )}
        </main>
      </div>
    </div>
  );
}

// ── Sub-components ──

type PageHeaderProps = {
  nodes: GraphNode[];
  onSelect: (node: GraphNode) => void;
  data: GraphSnapshot | null;
};

function PageHeader({ nodes, onSelect, data }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        <a href="/" className={styles.logo} aria-label="Axhy home">
          A<span className={styles.logoDot} aria-hidden="true" />
        </a>
        <nav className={styles.breadcrumb} aria-label="breadcrumb">
          <a href="/system/graph" style={{ color: 'inherit', textDecoration: 'none' }}>
            System
          </a>
          <span className={styles.breadcrumbSep}>›</span>
          <span className={styles.breadcrumbCurrent}>Map</span>
          {data && (
            <>
              <span className={styles.breadcrumbSep}>·</span>
              <span style={{ color: 'var(--ink-4)', fontSize: '11px' }}>
                {data.counts.nodes} nodes · {data.counts.edges} edges
              </span>
            </>
          )}
        </nav>
      </div>
      <div />
      <div className={styles.headerRight}>
        {nodes.length > 0 && <SearchBar nodes={nodes} onSelect={onSelect} />}
        <a href="/system/graph" className={styles.graphViewLink} title="Open dot-graph viewer">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <circle cx="2" cy="6" r="1.5" fill="currentColor" />
            <circle cx="10" cy="2" r="1.5" fill="currentColor" />
            <circle cx="10" cy="10" r="1.5" fill="currentColor" />
            <line x1="3.5" y1="5.5" x2="8.5" y2="2.5" stroke="currentColor" strokeWidth="1" />
            <line x1="3.5" y1="6.5" x2="8.5" y2="9.5" stroke="currentColor" strokeWidth="1" />
          </svg>
          graph view
        </a>
      </div>
    </header>
  );
}

type EmptyStateProps = {
  counts: GraphSnapshot['counts'];
};

function EmptyState({ counts }: EmptyStateProps) {
  return (
    <div className={styles.emptyState}>
      <span style={{ fontSize: '32px' }}>←</span>
      <span className={styles.emptyStateTitle}>Select a node to explore</span>
      <span className={styles.emptyStateHint}>
        {counts.nodes} nodes · {counts.edges} edges · use search or sidebar
      </span>
    </div>
  );
}

type DetailRouterProps = {
  node: GraphNode;
  nodes: GraphNode[];
  edges: GraphSnapshot['edges'];
  onNavigate: (node: GraphNode) => void;
};

function DetailRouter({ node, nodes, edges, onNavigate }: DetailRouterProps) {
  switch (node.kind) {
    case 'ui_screen':
      return <ScreenDetail node={node} nodes={nodes} edges={edges} onNavigate={onNavigate} />;
    case 'entity':
      return <TableDetail node={node} nodes={nodes} edges={edges} onNavigate={onNavigate} />;
    case 'api_endpoint':
      return <RouteDetail node={node} nodes={nodes} edges={edges} onNavigate={onNavigate} />;
    case 'state':
      return <StateMachineDetail node={node} nodes={nodes} edges={edges} onNavigate={onNavigate} />;
    case 'adr':
      return <AdrDetail node={node} nodes={nodes} edges={edges} onNavigate={onNavigate} />;
    default:
      return <GenericDetail node={node} />;
  }
}

type GenericDetailProps = {
  node: GraphNode;
};

function GenericDetail({ node }: GenericDetailProps) {
  return (
    <div className={styles.detailPanel}>
      <div className={styles.detailHeader}>
        <span
          className={styles.detailKindBadge}
          style={{ background: 'var(--paper-3)', color: 'var(--ink-2)' }}
        >
          {node.kind}
        </span>
        <h1 className={styles.detailTitle}>{node.name}</h1>
        {node.sourcePath && <div className={styles.detailSubtitle}>{node.sourcePath}</div>}
      </div>
      <pre
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
          padding: '16px',
          background: 'var(--paper-2)',
          borderRadius: 'var(--r-2)',
          color: 'var(--ink-2)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          border: '1px solid var(--card-edge)',
        }}
      >
        {JSON.stringify(node.metadata, null, 2)}
      </pre>
    </div>
  );
}
