-- Migration 016 — axhy_chat.turn_embeddings + HNSW vector index.
--
-- Spec: docs/locked/vector-rag-context-assembly.md §3.1 (LOCKED 2026-05-20)
-- Plan: docs/plans/2026-05-20-vector-rag-wave-a3-phase-1.md §2.1
-- Phase: Wave A.3 Phase 1 (foundation — collect embeddings; no retrieval).
--
-- Separate schema from axhy_brain (which holds dev-time docs). axhy_chat
-- holds production chat data with tenant isolation. RLS policy deferred
-- to Phase 2 / pre-launch per spec §3.3.
--
-- Verification (run before + after on Railway):
--   SELECT schemaname, tablename FROM pg_tables
--   WHERE schemaname='axhy_chat';
--   SELECT indexname FROM pg_indexes
--   WHERE schemaname='axhy_chat' AND tablename='turn_embeddings';
--
-- Before: schema absent.
-- After:  axhy_chat.turn_embeddings present + 4 indexes (PK + HNSW + tenant + thread + decisions partial).
--
-- Rollback:
--   DROP TABLE IF EXISTS "axhy_chat"."turn_embeddings";
--   DROP SCHEMA IF EXISTS "axhy_chat";
--
-- @derives(docs/locked/vector-rag-context-assembly.md §3.1)
-- @derives(ADR-0022)  -- brain schema pattern this mirrors
-- @derives(ADR-0023)  -- model policy / embed_general surface

CREATE SCHEMA IF NOT EXISTS "axhy_chat";

CREATE TABLE IF NOT EXISTS "axhy_chat"."turn_embeddings" (
  "id"                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Tenant isolation (RLS-ready in Phase 2)
  "company_id"            uuid NOT NULL,
  "supervisor_id"         uuid NOT NULL,
  "thread_id"             uuid NOT NULL,

  -- Source reference (back to axhy.ChatMessage)
  "user_message_id"       uuid NOT NULL,
  "assistant_message_id"  uuid NOT NULL,

  -- Embedding payload
  "combined_text"         text NOT NULL,
  "embedding"             vector(1536) NOT NULL,
  "token_count"           integer NOT NULL,

  -- Retrieval-quality metadata (used by Phase 2 scoring)
  "has_decision"          boolean NOT NULL DEFAULT false,
  "has_tool_call"         boolean NOT NULL DEFAULT false,
  "tool_names"            text[] NOT NULL DEFAULT '{}',
  "topic_hint"            text,

  "created_at"            timestamptz NOT NULL DEFAULT now(),

  -- Idempotency: never double-embed a turn (Phase 1.b uses ON CONFLICT DO NOTHING)
  CONSTRAINT "turn_embeddings_user_message_id_unique" UNIQUE ("user_message_id")
);

-- HNSW cosine-similarity index (spec §3.1 — m=16, ef_construction=64)
CREATE INDEX IF NOT EXISTS "turn_embeddings_hnsw"
  ON "axhy_chat"."turn_embeddings"
  USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Tenant-scoped lookup (always filter by company + supervisor + recency)
CREATE INDEX IF NOT EXISTS "turn_embeddings_tenant_idx"
  ON "axhy_chat"."turn_embeddings" ("company_id", "supervisor_id", "created_at" DESC);

-- Thread-scoped lookup (continuity-turn fetch path in Phase 2)
CREATE INDEX IF NOT EXISTS "turn_embeddings_thread_idx"
  ON "axhy_chat"."turn_embeddings" ("thread_id", "created_at" DESC);

-- Decision-bearing-turn lookup (high-value context partial index, Phase 2)
CREATE INDEX IF NOT EXISTS "turn_embeddings_decisions_idx"
  ON "axhy_chat"."turn_embeddings" ("company_id", "supervisor_id")
  WHERE "has_decision" = true;
