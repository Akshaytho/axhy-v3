-- 0004: brain_entries — unified v3 brain schema
--
-- Replaces axhy_brain.chunks with a richer, authority-aware table.
-- Old table kept for 7-day rollback safety net.
--
-- @derives(docs/superpowers/specs/2026-05-24-axhy-cognitive-system-v3.md)

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS brain_entries (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- ORIGIN: where this came from
  kind                 TEXT NOT NULL,

  -- TRUST: how much weight axhy gives this entry
  authority_level      TEXT NOT NULL DEFAULT 'evidence',

  -- CERTAINTY
  confidence           TEXT NOT NULL DEFAULT 'medium',

  -- SEMANTIC TYPE
  type                 TEXT NOT NULL,

  -- FILTERING TAGS
  concepts             JSONB NOT NULL DEFAULT '[]',

  -- PROVENANCE
  source_file          TEXT,
  source_session_id    TEXT,
  source_hash          TEXT,
  origin               TEXT NOT NULL,
  parent_entry_id      UUID REFERENCES brain_entries(id),

  -- CONTENT
  title                TEXT,
  content              TEXT NOT NULL,
  field_type           TEXT,

  -- INDEXES
  embedding            VECTOR(1536) NOT NULL,
  content_search       TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', COALESCE(title, '') || ' ' || content)
  ) STORED,

  -- TIME
  created_at_epoch     BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint,
  superseded_at_epoch  BIGINT,

  -- STATS
  read_count           INT NOT NULL DEFAULT 0,

  metadata             JSONB NOT NULL DEFAULT '{}'
);

-- Domain constraints
ALTER TABLE brain_entries ADD CONSTRAINT brain_entries_kind_check
  CHECK (kind IN ('curated', 'activity', 'change', 'migrated'));

ALTER TABLE brain_entries ADD CONSTRAINT brain_entries_authority_check
  CHECK (authority_level IN ('locked', 'curated', 'candidate', 'evidence', 'activity', 'deprecated', 'rejected'));

ALTER TABLE brain_entries ADD CONSTRAINT brain_entries_confidence_check
  CHECK (confidence IN ('high', 'medium', 'low', 'unknown'));

ALTER TABLE brain_entries ADD CONSTRAINT brain_entries_origin_check
  CHECK (origin IN ('brain_build', 'axhy_hook', 'claude_mem_sync', 'git_commit', 'manual'));

-- Composite indexes for query patterns
CREATE INDEX idx_brain_kind_authority ON brain_entries (kind, authority_level)
  WHERE superseded_at_epoch IS NULL;

CREATE INDEX idx_brain_type ON brain_entries (type)
  WHERE superseded_at_epoch IS NULL;

CREATE INDEX idx_brain_recency ON brain_entries (created_at_epoch DESC)
  WHERE superseded_at_epoch IS NULL;

CREATE INDEX idx_brain_source_file ON brain_entries (source_file);

CREATE INDEX idx_brain_source_session ON brain_entries (source_session_id);

CREATE INDEX idx_brain_concepts ON brain_entries USING GIN (concepts);

CREATE INDEX idx_brain_fts ON brain_entries USING GIN (content_search);

CREATE INDEX idx_brain_embedding ON brain_entries
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Grant permissions
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'axhy_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON brain_entries TO axhy_app';
  END IF;
END
$$;
