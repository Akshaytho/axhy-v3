# @axhy/knowledge-graph — BOUNDARY

## Owns
- Three graphs over the repo:
  1. **Structural** — entities, fields, states, transitions, endpoints, tests, UI screens (from static analysis)
  2. **Semantic** — pgvector embeddings of every code chunk + doc + decision + conversation (RAG)
  3. **Provenance** — code → ADR → panel debate → master plan section (lineage)
- MCP server exposing 4 tools: `query_structure`, `query_semantic`, `query_lineage`, `query_hybrid`
- Graph builders run on every CI commit
- Lineage audit — orphan detection, dead-link detection, version-drift detection
- Dashboard UI at `axhy-graph.local:3000`

## Does NOT own
- Code changes (graph informs; Claude/Cursor edit)
- Tests (graph maps structure; tests verify behavior)
- Operational data (lives in `apps/backend` Postgres)

## Internal dependencies
- Reads ALL packages and apps for graph construction
- Writes only to its own Postgres tables (separate from operational data)

## Who imports this
- Nobody. Leaf consumer. CI runs it; Claude Code consumes via MCP.

## Lineage anchor
Master plan §M (memory). ADR-0021 — Three-graph knowledge system + MCP server.
