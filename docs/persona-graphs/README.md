# Persona-route map prototypes

[ORCHESTRATOR_EXCEPTION] Final README write to complete the prototype trio; pure docs, no code; bundled with the parallel commit. Two prototypes for the system-wide persona-route map. Pick one, we standardize. This is a comparison artifact — the goal is for the founder to choose a format that fits the workflow of "snapshot every ~5 sessions, embed in the brain, diff against prior state."

Both prototypes show **the same 30 routes + 12 cross-persona edges** sourced from `EVID-HR-A1-PLAYWRIGHT.md`, `EVID-OWNER-PERSONA-MAP.md` (slice-2 branch), `EVID-SUPER-ADMIN-PERSONA-MAP.md` (slice-3 branch), and a backend route grep. Snapshot: `main @ 1c4859f`, 2026-05-31.

## Side-by-side

| dimension                             | Prototype 1 — HTML + CSS + JS + JSON                                           | Prototype 2 — Mermaid                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| **authoring cost**                    | Higher — 4 files (~600 LOC total)                                              | Lower — 1 markdown file (~150 LOC)                                                      |
| **data lives in**                     | `spec.json` (parseable, separable from view)                                   | inline in markdown (data + view fused)                                                  |
| **visual quality**                    | High — full CSS control, persona-color lanes, soft shadows, status badges      | Medium — limited Mermaid styling, fixed node shapes                                     |
| **interactivity**                     | Hover for full contracts, click persona to dim, click route to lock side panel | None — static diagram                                                                   |
| **route contracts shown**             | Yes, in side panel (reads/writes/side-effects/downstream)                      | Not in diagram — separate markdown table below the chart                                |
| **GitHub renders directly**           | No — must clone + open `index.html` locally                                    | Yes — renders inline on github.com PR/file view                                         |
| **mobile/iPad readable**              | Yes — responsive grid collapses side panel                                     | Partial — Mermaid is wide; GitHub mobile clips it                                       |
| **brain-embeddable as text**          | Partial — JSON parseable; HTML/CSS/JS are noise                                | Yes — single markdown file, brain just embeds it                                        |
| **diff-friendly across snapshots**    | Very — `spec.json` line-per-route diff is clean                                | Yes — markdown diff readable; node IDs stable                                           |
| **founder-readable raw**              | Reading `spec.json` raw is fine; HTML/CSS/JS are not                           | Reading `system.md` raw is the failure mode founder flagged ("mermaid is hard to read") |
| **offline / no internet**             | Yes — `spec.json` inlined into `index.html`; works fully via `file://`         | Yes if rendered ahead of time; raw markdown is always offline                           |
| **CDN dependencies**                  | None                                                                           | None (Mermaid built into GitHub's renderer)                                             |
| **layout stability across snapshots** | High — lanes are fixed, only route boxes change                                | Medium — Mermaid auto-layout reflows when nodes/edges change                            |
| **adding a route**                    | Append to `spec.json` array (one block, mechanical)                            | Insert a node line + maybe an edge line inside the right subgraph                       |
| **adding a new persona**              | Append to `personas[]`, lane appears automatically                             | Add a `subgraph` block + style line + relevant edges                                    |
| **failure mode**                      | If `render.js` breaks, nothing renders                                         | If Mermaid syntax breaks, the whole block fails silently on GitHub                      |

## How to open each

### Prototype 1 (HTML)

```bash
open docs/persona-graphs/prototype-html/index.html
# or just double-click from Finder
# if file:// blocks fetch on your browser, the spec is also inlined into index.html — it still renders
```

Inside: hover a route box for the full contract; click a persona name to dim everything not connected to it; click a route to lock the side panel.

### Prototype 2 (Mermaid)

Just open `docs/persona-graphs/prototype-mermaid/system.md` on GitHub (PR file view renders it inline) or in any markdown previewer (VSCode preview, Obsidian, Typora). No build step.

## Honest recommendation

**Prototype 2 (Mermaid) for the standard cadence; Prototype 1 (HTML) only if the founder explicitly wants the hover/click ergonomics for an audit walkthrough.**

The founder said mermaid is hard to read. That bias matters — but the workflow is "snapshot every 5 sessions, embed in the brain, diff against prior state." For that workflow:

1. **Brain-embedding favors Mermaid.** The brain embeds markdown chunks. `spec.json` would need a custom embedding adapter; `index.html`/`render.js` are not knowledge-graph content. Mermaid lives in one markdown file the brain already knows how to handle.

2. **Diff-readability favors Mermaid.** A 5-session diff on `spec.json` is JSON-array-deep — readable to a machine, noisy to a human reviewer. A 5-session diff on `system.md` shows added/removed nodes + edges directly in PR view.

3. **GitHub rendering favors Mermaid.** When the founder reviews a snapshot from his phone or a PR thread, Mermaid shows up inline. HTML requires cloning. For 5-session-cadence review, friction kills the habit.

4. **What we lose with Mermaid:** hover-detail (mitigated by the markdown table below the diagram), persona-color customization (mitigated by `style` directives), and click-to-dim (no mitigation — it's a static format).

**The "mermaid is hard to read" feedback this prototype addresses:** the founder's prior pain came from generic / un-styled flowcharts. The styling in `system.md` (color-per-persona subgraph, status classes, legend up top, contracts table below) turns it from "wall of nodes" into "five clearly-colored regions with labeled arrows between them." That is the experiment worth running.

**If after looking at both you still find Mermaid unreadable, Prototype 1 is the fallback** — full design control, but pay the brain/diff/GitHub-render cost up front.

## Pick one, comment on the PR

Reply on the PR thread with `pick: mermaid` or `pick: html` and I lock the format for every future persona-route snapshot.
