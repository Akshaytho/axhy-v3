/**
 * packages/knowledge-graph/src/extractors/index.ts
 *
 * Shared types for extractors and the builder orchestrator.
 *
 * @derives(ADR-0002)
 */

export type NodeKind =
  | 'entity'
  | 'field'
  | 'state'
  | 'transition'
  | 'api_endpoint'
  | 'ui_screen'
  | 'ui_component'
  | 'test'
  | 'i18n_key'
  | 'audit_event_kind'
  | 'master_plan_section'
  | 'panel_debate'
  | 'iteration_lock'
  | 'adr'
  | 'persona'
  | 'journey'
  | 'workflow'
  | 'feature'
  | 'doc';

export type EdgeKind =
  | 'reads'
  | 'writes'
  | 'transitions_to'
  | 'belongs_to'
  | 'tests'
  | 'describes'
  | 'renders'
  | 'prompted_by'
  | 'localizes'
  | 'derives_from'
  | 'motivated_by'
  | 'implements'
  | 'covers'
  | 'sibling_of'
  | 'supersedes'
  | 'conflicts_with'
  | 'mounts'
  | 'triggers'
  | 'mirrors'
  | 'navigates_to';

export type Metadata = Record<string, unknown>;

export type NodeRecord = {
  kind: NodeKind;
  name: string;
  sourcePath: string | null;
  metadata: Metadata;
};

export type EdgeRecord = {
  kind: EdgeKind;
  srcKey: { kind: NodeKind; name: string; sourcePath: string | null };
  dstKey: { kind: NodeKind; name: string; sourcePath: string | null };
  metadata: Metadata;
};

export type ExtractorOutput = {
  nodes: NodeRecord[];
  edges: EdgeRecord[];
};

export type ExtractorContext = {
  repoRoot: string;
  files: string[]; // relative paths from repoRoot
  fullExtraction: boolean; // true when --full flag passed; otherwise incremental
};

export type Extractor = {
  name: string;
  run(ctx: ExtractorContext): Promise<ExtractorOutput>;
};
