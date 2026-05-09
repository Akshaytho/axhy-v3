/**
 * Shared type definitions for the /system/map narrative viewer.
 * These mirror the shape returned by /api/graph (the full graph snapshot).
 *
 * @derives(ADR-0021)
 */

/** @derives(ADR-0021) */
export type GraphNode = {
  id: string;
  kind: string;
  name: string;
  sourcePath: string | null;
  metadata: Record<string, unknown>;
};

/** @derives(ADR-0021) */
export type GraphEdge = {
  id: string;
  kind: string;
  source: string;
  target: string;
  metadata: Record<string, unknown>;
};

/** @derives(ADR-0021) */
export type GraphSnapshot = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  counts: { nodes: number; edges: number; chunks: number };
};

/**
 * Helper: return all edges where src or dst matches a given node id,
 * filtered by edge kind.
 *
 * @derives(ADR-0021)
 */
export function edgesFrom(edges: GraphEdge[], nodeId: string, kind: string): GraphEdge[] {
  return edges.filter((e) => e.source === nodeId && e.kind === kind);
}

/** @derives(ADR-0021) */
export function edgesTo(edges: GraphEdge[], nodeId: string, kind: string): GraphEdge[] {
  return edges.filter((e) => e.target === nodeId && e.kind === kind);
}

/** @derives(ADR-0021) */
export function nodeById(nodes: GraphNode[], id: string): GraphNode | undefined {
  return nodes.find((n) => n.id === id);
}
