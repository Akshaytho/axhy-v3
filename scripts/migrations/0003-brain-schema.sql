-- 0003: axhy_brain schema — Living Brain (separate from knowledge graph)
--
-- Standalone vector DB for founder-locked design decisions, semantic search,
-- and impact analysis. Completely independent of axhy_graph (nodes/edges).
--
-- @derives(ADR-0022) — pgvector on Railway Postgres
-- @derives(ADR-0023) — embed_general surface

CREATE SCHEMA IF NOT EXISTS axhy_brain;

CREATE TABLE IF NOT EXISTS axhy_brain.chunks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_path     text NOT NULL,
  start_line      integer NOT NULL,
  end_line        integer NOT NULL,
  content         text NOT NULL,
  content_hash    text NOT NULL,
  language        text,
  embedding       vector(1536),
  bm25_tsv        tsvector,

  is_locked       boolean NOT NULL DEFAULT false,
  locked_at       timestamptz,
  locked_reason   text,
  derived_from_paths text[] NOT NULL DEFAULT '{}',
  is_stale        boolean NOT NULL DEFAULT false,
  stale_since     timestamptz,
  chunk_category  text NOT NULL DEFAULT 'doc',
  persona         text NOT NULL DEFAULT 'all',
  -- persona values: supervisor, worker, admin, super_admin, hr, all
  -- 'all' = applies across every role (security, invariants, dev standards)
  -- role-specific = only relevant when building/debugging that role's surface

  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (source_path, start_line, end_line, content_hash)
);

-- HNSW index for vector similarity search
CREATE INDEX IF NOT EXISTS brain_chunks_embedding_hnsw ON axhy_brain.chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- BM25 full-text search
CREATE INDEX IF NOT EXISTS brain_chunks_bm25_idx ON axhy_brain.chunks USING gin (bm25_tsv);

-- tsvector auto-update trigger
CREATE OR REPLACE FUNCTION axhy_brain.update_chunk_tsv()
RETURNS trigger AS $$
BEGIN
  NEW.bm25_tsv := to_tsvector('english', NEW.content);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS brain_chunks_tsv_trigger ON axhy_brain.chunks;
CREATE TRIGGER brain_chunks_tsv_trigger
BEFORE INSERT OR UPDATE OF content ON axhy_brain.chunks
FOR EACH ROW EXECUTE FUNCTION axhy_brain.update_chunk_tsv();

-- Locked chunks must have audit trail
ALTER TABLE axhy_brain.chunks
  ADD CONSTRAINT brain_chunks_lock_audit_check CHECK (
    (is_locked = false)
    OR (is_locked = true AND locked_at IS NOT NULL AND locked_reason IS NOT NULL)
  );

-- Stale chunks must have timestamp
ALTER TABLE axhy_brain.chunks
  ADD CONSTRAINT brain_chunks_stale_audit_check CHECK (
    (is_stale = false)
    OR (is_stale = true AND stale_since IS NOT NULL)
  );

-- Impact check: find locked chunks by category
CREATE INDEX IF NOT EXISTS brain_chunks_locked_category_idx
  ON axhy_brain.chunks (chunk_category) WHERE is_locked = true;

-- Staleness sweep: find stale unlocked chunks to re-embed
CREATE INDEX IF NOT EXISTS brain_chunks_stale_idx
  ON axhy_brain.chunks (is_stale) WHERE is_stale = true AND is_locked = false;

-- Persona-filtered search: find docs relevant to a specific role
CREATE INDEX IF NOT EXISTS brain_chunks_persona_idx
  ON axhy_brain.chunks (persona);

-- Derived-from lookup: GIN on text array
CREATE INDEX IF NOT EXISTS brain_chunks_derived_from_gin_idx
  ON axhy_brain.chunks USING gin (derived_from_paths);

-- Grant permissions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'axhy_app') THEN
    EXECUTE 'GRANT USAGE ON SCHEMA axhy_brain TO axhy_app';
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA axhy_brain TO axhy_app';
  END IF;
END
$$;
