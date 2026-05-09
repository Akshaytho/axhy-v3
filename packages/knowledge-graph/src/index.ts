/**
 * @axhy/knowledge-graph
 *
 * Three graphs (structural, semantic, provenance) over the entire Axhy repo.
 * Exposes an MCP server so Claude Code can query the graph natively while
 * editing code. The seed-to-leaf connection.
 *
 * @derives(ADR-0021)
 */

export const PACKAGE_NAME = '@axhy/knowledge-graph' as const;
export type {
  NodeKind,
  EdgeKind,
  Metadata,
  ExtractorOutput,
  ExtractorContext,
  Extractor,
} from './extractors/index.js';
export { AUDIT_KINDS } from './audit.js';
