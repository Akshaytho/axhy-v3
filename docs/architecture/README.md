# Architecture

C4 model — four levels of architecture diagrams. Auto-rendered from Mermaid sources.

## Files

- `c4-context.mmd` — Context: Axhy + external actors (workers, supervisors, owners, HR, Axhy team, AI providers, telecom providers, payment providers)
- `c4-container.mmd` — Containers: backend, admin-web, mobile, Postgres, Cloudflare R2, knowledge-graph
- `c4-component.mmd` — Components inside backend (auth, routes, services, outbox, AI gateway)
- `c4-code.mmd` — Code-level for the most critical paths (state-machine transitions, photo upload pipeline)

## Diagrams land

Day 2 of evidence sprint. Auto-render via `tools/graph-builder/render-c4.mjs`.
