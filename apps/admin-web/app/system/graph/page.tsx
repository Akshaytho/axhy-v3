/**
 * /system/graph — internal knowledge-graph viewer.
 *
 * Fetches nodes + edges from /api/graph and renders with react-force-graph-2d.
 * Brand colors from @axhy/ui-tokens (per ADR-0014). Internal-only.
 * No auth gate yet (Phase 5 wires SUPER_ADMIN gate per SPEC.md §7.5).
 *
 * @derives(panel-2026-04-30 — graph viewer cheap version)
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamicImport from 'next/dynamic';
import { tokens } from '@axhy/ui-tokens';

// react-force-graph uses canvas + window — must be dynamic-import client-only.
const ForceGraph2D = dynamicImport(() => import('react-force-graph-2d').then((m) => m.default), {
  ssr: false,
});

type Node = {
  id: string;
  kind: string;
  name: string;
  sourcePath: string | null;
  metadata: Record<string, unknown>;
};
type Edge = {
  id: string;
  kind: string;
  source: string;
  target: string;
  metadata: Record<string, unknown>;
};
type Snapshot = {
  nodes: Node[];
  edges: Edge[];
  counts: { nodes: number; edges: number; chunks: number };
};

// All keys lowercase to match DB enum values (axhy_graph.node_kind).
// Colors from @axhy/ui-tokens — no inline hex (per ADR-0014).
// Viewer renders on a black canvas; chosen values are legible against #000000.
const DEFAULT_COLOR = tokens.color.ink.tertiary; // #7A6B58 — warm gray for unknown kinds

const KIND_COLORS: Record<string, string> = {
  // structural
  entity: tokens.color.brand.accent, // terracotta — Prisma models (most referenced)
  field: tokens.color.brand.accentSoft, // soft terracotta — Prisma fields
  state: tokens.color.semantic.ok, // green — XState machine root
  transition: tokens.color.semantic.okSoft, // soft green — XState transitions
  api_endpoint: tokens.color.semantic.warn, // amber — backend routes
  ui_screen: tokens.color.semantic.infoSoft, // light blue — Next.js pages
  ui_component: tokens.color.semantic.infoInk, // dark blue — feature components
  test: tokens.color.ink.placeholder, // warm neutral — test files
  i18n_key: tokens.color.surface.paper3, // cream — i18n keys
  audit_event_kind: tokens.color.semantic.bad, // red — audit events
  // provenance
  master_plan_section: tokens.color.brand.accent2, // dark terracotta — master-plan §refs
  panel_debate: tokens.color.brand.accentInk, // deep terracotta — panel debate docs
  iteration_lock: tokens.color.semantic.badSoft, // soft red — locked iteration items
  adr: tokens.color.ink.secondary, // dark warm — ADR docs
  persona: tokens.color.semantic.warnSoft, // soft amber — persona nodes
  journey: tokens.color.surface.paper2, // off-white — journey nodes
  workflow: tokens.color.surface.paper, // cream — workflow nodes
  feature: tokens.color.surface.card, // near-white — feature nodes
  // semantic
  doc: tokens.color.ink.placeholder, // warm neutral — generic docs
};

function colorFor(kind: string): string {
  return KIND_COLORS[kind] ?? DEFAULT_COLOR;
}

/** @derives(ADR-0021) */
export default function GraphPage() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Node | null>(null);
  const [filterKind, setFilterKind] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 800, h: 600 });

  useEffect(() => {
    fetch('/api/graph')
      .then((r) => r.json())
      .then((j) => {
        if (j.error) setError(j.error);
        else setData(j as Snapshot);
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const observer = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const graphData = useMemo(() => {
    if (!data) return { nodes: [], links: [] };
    const filteredNodes = filterKind ? data.nodes.filter((n) => n.kind === filterKind) : data.nodes;
    const allowedIds = new Set(filteredNodes.map((n) => n.id));
    const filteredEdges = data.edges.filter(
      (e) => allowedIds.has(e.source) && allowedIds.has(e.target),
    );
    // Map node val to incoming-edge degree (visually larger nodes have more references).
    const inDegree = new Map<string, number>();
    for (const e of filteredEdges) {
      inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    }
    return {
      nodes: filteredNodes.map((n) => ({
        ...n,
        color: colorFor(n.kind),
        val: 1 + Math.min(8, inDegree.get(n.id) ?? 0),
      })),
      links: filteredEdges,
    };
  }, [data, filterKind]);

  const kinds = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.nodes.map((n) => n.kind))).sort();
  }, [data]);

  return (
    <div className="page" style={{ height: '100vh', overflow: 'hidden' }}>
      <header className="graph-header">
        <a href="/" className="logo" aria-label="Axhy home">
          A<span className="dot" aria-hidden="true" />
        </a>
        <div className="graph-title">
          <span className="eyebrow">Knowledge graph</span>
          {data && (
            <span className="graph-counts">
              {data.counts.nodes} nodes · {data.counts.edges} edges · {data.counts.chunks} chunks
            </span>
          )}
        </div>
        <div className="graph-filters">
          <button
            type="button"
            className={filterKind === null ? 'graph-filter is-on' : 'graph-filter'}
            onClick={() => setFilterKind(null)}
          >
            All
          </button>
          {kinds.map((k) => (
            <button
              key={k}
              type="button"
              className={filterKind === k ? 'graph-filter is-on' : 'graph-filter'}
              onClick={() => setFilterKind(k)}
              style={{ borderColor: colorFor(k) }}
            >
              <span className="graph-swatch" style={{ background: colorFor(k) }} />
              {k}
            </button>
          ))}
        </div>
      </header>

      <div className="graph-body">
        <div className="graph-canvas" ref={wrapRef}>
          {error && <div className="graph-error">Failed to load graph: {error}</div>}
          {!error && !data && <div className="graph-loading">Loading graph…</div>}
          {!error && data && (
            <ForceGraph2D
              graphData={graphData}
              width={size.w}
              height={size.h}
              backgroundColor="#000000"
              nodeLabel={(n) => `${(n as Node).kind} · ${(n as Node).name}`}
              nodeColor={(n) => (n as { color: string }).color}
              nodeRelSize={4}
              linkColor={() => 'rgba(255,255,255,0.18)'}
              linkDirectionalArrowLength={3}
              linkDirectionalArrowRelPos={0.95}
              cooldownTicks={120}
              onNodeClick={(n) => setSelected(n as Node)}
            />
          )}
        </div>

        {selected && (
          <aside className="graph-detail">
            <button
              type="button"
              className="graph-detail-close"
              onClick={() => setSelected(null)}
              aria-label="Close"
            >
              ×
            </button>
            <div className="graph-detail-kind" style={{ color: colorFor(selected.kind) }}>
              {selected.kind}
            </div>
            <div className="graph-detail-name">{selected.name}</div>
            {selected.sourcePath && <div className="graph-detail-path">{selected.sourcePath}</div>}
            <pre className="graph-detail-meta">{JSON.stringify(selected.metadata, null, 2)}</pre>
          </aside>
        )}
      </div>
    </div>
  );
}
