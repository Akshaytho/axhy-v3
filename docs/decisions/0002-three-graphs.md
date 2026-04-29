# ADR-0002: Three knowledge graphs (structural + semantic + provenance)

- **Status:** Accepted
- **Date:** 2026-04-29
- **Master plan §:** §M (memory + context)
- **Panel debate:** 2026-04-29-knowledge-graph

## Context

Solo founder forgets prior decisions across sessions. At 200K+ LoC, no one can read the whole codebase. AI tools (Claude, Cursor) need precise per-question context. Customers (procurement officers) ask for architecture diagrams. We need ONE system that solves all four.

Founder metaphor: "if a seed gives birth to a big tree we still need to be connected to seed even when we grow that big — see where each branch is and what and how, just like vector dbs."

## Decision

Three graphs, one MCP server, one Postgres backing store.

| Graph | What it answers | Source | Storage |
|---|---|---|---|
| Structural | "Where is field X used?" — exact map | Static analysis (Prisma + XState + Zod + routes) | Postgres tables `graph_nodes` + `graph_edges` |
| Semantic | "Find code that handles cases like Y" — meaning-based | OpenAI `text-embedding-3-small` over code chunks | Postgres `pgvector` HNSW index |
| Provenance | "Why does this code exist? What other code shares its DNA?" | Master plan extraction + ADR refs + commit refs | Same `graph_nodes` + `graph_edges` with new node-kinds |

MCP server (`axhy-knowledge`) exposes 4 tools to Claude Code:
- `query_structure(...)` — exact code map
- `query_semantic(...)` — fuzzy meaning-based retrieval
- `query_lineage(...)` — ancestry, descendants, siblings, conflicts, versions
- `query_hybrid(...)` — combines all three with reciprocal rank fusion

Embedding model split: OpenAI for our code (US region OK under MSA); Cohere India region for customer data (DPDP).

## Consequences

### Positive
- Future-you reads the graph, not the code
- Claude Code makes correct cross-file changes (queries graph before editing)
- Customers get sanitized architecture exports for procurement
- Lineage prevents architectural drift — code without ADR fails CI
- Single Postgres backing store = single backup, single ops surface

### Negative
- ~3 days of setup work in the evidence sprint
- Embedding pipeline ongoing cost (~₹500/month at our scale)
- Annotations require discipline; ESLint rule must enforce

### Neutral
- Pinecone deferred (overkill at our scale)
- Reranker (Cohere Rerank) optional, opt-in per query

## Lineage

- **Derives from:** master plan §M, founder seed-tree metaphor 2026-04-29
- **Affects packages:** @axhy/knowledge-graph, @axhy/eslint-config-axhy
- **Implementation tracked in:** evidence sprint Day 7
