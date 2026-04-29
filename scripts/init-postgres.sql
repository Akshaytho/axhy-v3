-- scripts/init-postgres.sql
-- Run once against the new Railway Postgres instance.
-- Sets up extensions, schemas, and the knowledge-graph backing tables.
--
-- Lineage: ADR-0002 (three knowledge graphs), ADR-0022 (pgvector backing).

-- ============================================================================
-- Extensions
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;          -- pgvector for semantic graph
CREATE EXTENSION IF NOT EXISTS pg_trgm;         -- BM25-style hybrid retrieval

-- ============================================================================
-- Schemas
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS axhy;            -- operational data (workers, sites, etc.)
CREATE SCHEMA IF NOT EXISTS axhy_graph;      -- knowledge graph (3 graphs in one)
CREATE SCHEMA IF NOT EXISTS axhy_audit;      -- append-only audit events
CREATE SCHEMA IF NOT EXISTS axhy_super;      -- super-admin tools (separate scope)

-- ============================================================================
-- Knowledge graph: nodes + edges
-- ============================================================================

CREATE TYPE axhy_graph.node_kind AS ENUM (
  -- structural
  'entity', 'field', 'state', 'transition', 'api_endpoint',
  'ui_screen', 'ui_component', 'test', 'i18n_key', 'audit_event_kind',
  -- provenance
  'master_plan_section', 'panel_debate', 'iteration_lock',
  'adr', 'persona', 'journey', 'workflow', 'feature',
  -- semantic (chunks indexed in `chunks` table separately)
  'doc'
);

CREATE TYPE axhy_graph.edge_kind AS ENUM (
  -- structural
  'reads', 'writes', 'transitions_to', 'belongs_to', 'tests',
  'describes', 'renders', 'prompted_by', 'localizes',
  -- provenance
  'derives_from', 'motivated_by', 'implements', 'covers',
  'sibling_of', 'supersedes', 'conflicts_with'
);

CREATE TABLE axhy_graph.nodes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            axhy_graph.node_kind NOT NULL,
  name            text NOT NULL,
  source_path     text,                          -- file path in repo (nullable for plan sections)
  source_range    text,                          -- "L42-L57" if applicable
  version         integer NOT NULL DEFAULT 1,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, name, source_path)
);
CREATE INDEX nodes_kind_idx ON axhy_graph.nodes (kind);
CREATE INDEX nodes_source_path_idx ON axhy_graph.nodes (source_path);
CREATE INDEX nodes_metadata_gin_idx ON axhy_graph.nodes USING gin (metadata);

CREATE TABLE axhy_graph.edges (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            axhy_graph.edge_kind NOT NULL,
  src_id          uuid NOT NULL REFERENCES axhy_graph.nodes(id) ON DELETE CASCADE,
  dst_id          uuid NOT NULL REFERENCES axhy_graph.nodes(id) ON DELETE CASCADE,
  src_version     integer NOT NULL DEFAULT 1,    -- version of src at time of edge creation
  dst_version     integer NOT NULL DEFAULT 1,    -- version of dst at time of edge creation
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, src_id, dst_id)
);
CREATE INDEX edges_src_idx ON axhy_graph.edges (src_id);
CREATE INDEX edges_dst_idx ON axhy_graph.edges (dst_id);
CREATE INDEX edges_kind_idx ON axhy_graph.edges (kind);

-- ============================================================================
-- Semantic graph: code/doc chunks + embeddings
-- ============================================================================

CREATE TABLE axhy_graph.chunks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_path     text NOT NULL,
  start_line      integer NOT NULL,
  end_line        integer NOT NULL,
  content         text NOT NULL,
  content_hash    text NOT NULL,
  language        text,                          -- 'typescript', 'markdown', 'mermaid', etc.
  embedding       vector(1536),                  -- OpenAI text-embedding-3-small dimension
  bm25_tsv        tsvector,                      -- for hybrid retrieval
  node_id         uuid REFERENCES axhy_graph.nodes(id) ON DELETE SET NULL,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_path, start_line, end_line, content_hash)
);

-- HNSW index for fast ANN similarity search
CREATE INDEX chunks_embedding_hnsw ON axhy_graph.chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- BM25-ish full-text index for keyword fallback
CREATE INDEX chunks_bm25_idx ON axhy_graph.chunks USING gin (bm25_tsv);

-- Trigger to keep tsvector updated
CREATE OR REPLACE FUNCTION axhy_graph.update_chunk_tsv()
RETURNS trigger AS $$
BEGIN
  NEW.bm25_tsv := to_tsvector('english', NEW.content);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chunks_tsv_trigger
BEFORE INSERT OR UPDATE OF content ON axhy_graph.chunks
FOR EACH ROW EXECUTE FUNCTION axhy_graph.update_chunk_tsv();

-- ============================================================================
-- Customer-data embeddings (per-tenant, encrypted at rest, RLS-protected)
-- ============================================================================

CREATE TABLE axhy_graph.tenant_chunks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL,
  source_kind     text NOT NULL,
  source_id       uuid NOT NULL,
  content_encrypted bytea NOT NULL,
  content_hash    text NOT NULL,
  embedding       vector(1024),                  -- Cohere embed-multilingual-v3 dimension
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tenant_chunks_company_idx ON axhy_graph.tenant_chunks (company_id);
CREATE INDEX tenant_chunks_embedding_hnsw ON axhy_graph.tenant_chunks
  USING hnsw (embedding vector_cosine_ops);

ALTER TABLE axhy_graph.tenant_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_chunks_isolation ON axhy_graph.tenant_chunks
  USING (company_id = current_setting('axhy.current_company_id', true)::uuid);

-- ============================================================================
-- Audit (append-only)
-- ============================================================================

CREATE TABLE axhy_audit.events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL,
  actor_id        uuid,
  actor_role      text,
  kind            text NOT NULL,
  target_kind     text,
  target_id       uuid,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  source          text,                          -- 'mobile', 'admin-web', 'cron', 'super'
  occurred_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_company_idx ON axhy_audit.events (company_id, occurred_at DESC);
CREATE INDEX audit_events_kind_idx ON axhy_audit.events (kind);
CREATE INDEX audit_events_actor_idx ON axhy_audit.events (actor_id);
CREATE INDEX audit_events_target_idx ON axhy_audit.events (target_kind, target_id);

ALTER TABLE axhy_audit.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_events_tenant_isolation ON axhy_audit.events
  USING (company_id = current_setting('axhy.current_company_id', true)::uuid);

-- ============================================================================
-- Sandbox tenant marker (axhy-sandbox is a fixed UUID, used by integration tests)
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'axhy_app') THEN
    CREATE ROLE axhy_app NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA axhy, axhy_graph, axhy_audit TO axhy_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA axhy TO axhy_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA axhy_audit TO axhy_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA axhy_graph TO axhy_app;

-- super-admin schema permission granted only to a separate role
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'axhy_super') THEN
    CREATE ROLE axhy_super NOLOGIN;
  END IF;
END
$$;
GRANT USAGE ON SCHEMA axhy_super TO axhy_super;
