# Workflow Maps — Index + Conventions

> **Layer 2 of the three-layer handoff system.** Layer 1 (`handoff/execution-state/`) answers **what is built**. This layer answers **how the system is intended to work** end-to-end, persona by persona, and how the data model underneath connects.
>
> **You should not write code that touches a workflow without first looking at the journey here.**

## Files

| File                   | What it contains                                                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `INDEX.md` (this file) | Conventions, diagram standards, state legend, update rules. Read first.                                                                         |
| `supervisor-ravi.md`   | 6 journey flowcharts for Ravi + the current-slice focus diagram.                                                                                |
| `worker-suresh.md`     | 5 journey flowcharts from Suresh's seat. Every step today is `NOT_STARTED` — worker app doesn't exist. The diagrams document the intended flow. |
| `hr-kavitha.md`        | 6 journey flowcharts for HR control plane.                                                                                                      |
| `owner-reddy.md`       | 4 journey flowcharts for owner digests, alerts, approvals.                                                                                      |
| `combined-system.md`   | 6 cross-persona sequence diagrams. **Where implementation currently stops is visually marked in every diagram.**                                |
| `data-model.md`        | Entity-relationship diagram for the 23 axhy tables + a tables-by-workflow read/write matrix.                                                    |

## Difference between layer 1 and layer 2

|                | Layer 1 (`execution-state/`)       | Layer 2 (`workflow-maps/`)                                    |
| -------------- | ---------------------------------- | ------------------------------------------------------------- |
| Answers        | What is built today                | How the workflow is supposed to run                           |
| Shape          | Tables + status colours            | Connected flowcharts + sequences + ER diagrams                |
| Update trigger | Slice changes implementation state | Slice changes workflow design or surfaces a new flow          |
| Node labels    | Workflow IDs (A1, C11, F26…)       | Human-readable steps ("Worker no-shows", "HR approves leave") |
| State markers  | Yes — in the table                 | Yes — in the diagram, via colour                              |

Both must be updated together when a slice changes either. Failure-mode rule #2 in `execution-state/INDEX.md` covers this.

## Diagram conventions (mandatory — keeps everything consistent)

### Journey flowcharts (Mermaid `graph TD`)

- **Node label = human action.** Bad: `C11`. Good: `Mark Mukesh absent`.
- **Workflow ID as secondary tag** at the end of the label: `Mark Mukesh absent (C11)`.
- **Arrows show intended flow.** Annotate branches with the condition: `--> |"worker is multi-site"| …`.
- **Handoff to another persona** = use a separate node with a clear persona prefix: `HR: review leave queue`. Style with a different classDef.
- **Backend / entity touchpoint** = a separate-shape node (cylinder for tables, hexagon for events): `[(SiteSupervisorBinding row)]` or `{{AuditEvent: BINDING_CREATED}}`.
- **End state** = oval terminator with the real-world outcome: `(("Mukesh's pay deducted ₹500"))`.

### State colours (consistent across every file in this folder + execution-state's overview graphs)

```
BUILT       → fill:#1e8e3e (green)     stroke:#0b6624 color:#fff
PARTIAL     → fill:#f5b400 (amber)     stroke:#8a6900 color:#000
WIP         → fill:#1a73e8 (blue)      stroke:#0b3d8a color:#fff
STUBBED     → fill:#bdbdbd (grey)      stroke:#555    color:#000
BLOCKED     → fill:#8e24aa (purple)    stroke:#4a1361 color:#fff
NOT_STARTED → fill:#e53935 (red)       stroke:#7a1715 color:#fff
CURRENT     → fill:#fff176 (yellow)    stroke:#806e00 color:#000 (used only by current-slice focus diagrams)
```

These map onto the `classDef` lines at the top of every Mermaid block in this folder.

### Where implementation currently stops

Every journey flowchart must visually mark **the boundary** between built/partial code and unbuilt code. Two conventions:

- A red dashed line annotation: `--- IMPL STOPS HERE ---`.
- OR a hexagonal "implementation horizon" node placed between the last built step and the first unbuilt step, styled with `classDef horizon fill:#fff,stroke:#e53935,stroke-dasharray: 5 5`.

The horizon node is preferred for sequence diagrams; the annotation works for flowcharts.

### Sequence diagrams (`combined-system.md`)

- Always include all participating personas + the backend + the outbox / dispatcher.
- Annotate every arrow with what state-machine transition or table-write happens.
- Mark the **implementation horizon** explicitly: `Note over Backend,Outbox: ⛔ IMPLEMENTATION STOPS HERE — Outbox dispatcher (Phase C) not built`.
- After the horizon, show what the spec says SHOULD happen using dashed arrows + lighter notes.

### ER diagrams (`data-model.md`)

- Use Mermaid `erDiagram` for the table relationships.
- Annotate each relationship with the FK column name and the cascade behaviour: `Company ||--o{ User : "companyId, ON DELETE SET NULL"`.
- Group entities by lifecycle layer (identity / operational / responsibility / observability).
- Below the ER, include the "tables-by-workflow" matrix: every workflow on rows, every table on columns, R/W/A (read/write/audit-emit) in cells.

## Update rules (read together with execution-state/INDEX.md rules 1–15)

These are the rules that apply when a slice changes anything in this folder:

1. **Flow-truth changes go here first.** If the slice changes how a workflow runs (new step, new branch, new handoff, removed step), edit the persona journey diagram FIRST. Then update execution-state. Then regenerate `handoff/generated/`.
2. **Journey diagrams stay readable from phone.** Aim for fewer-than-12 nodes per journey. If a journey gets bigger, split it into two smaller journeys ("happy path" + "edge cases") rather than ballooning one diagram.
3. **Implementation horizon must move forward, never disappear.** When code lands that pushes a step from `NOT_STARTED` → `PARTIAL` or higher, redraw the horizon node further down the journey. It should never silently vanish — its presence is what tells a reader "this is where the system stops working today."
4. **Sequence diagrams in combined-system.md are the load-bearing artifact for cross-persona work.** Don't let them get stale. Any slice that touches an end-to-end workflow (F26, F27, D17, E21, E24) MUST update the corresponding sequence diagram.
5. **Data-model.md updates on every schema change.** Adding a column, table, FK, index, or audit-kind = same-slice edit to data-model.md.
6. **Regenerate generated/ outputs in the same session** (per execution-state INDEX rule 7).
7. **No invented flows.** Every journey must trace back to an Active spec section, an audit verdict, or a closure-spec decision. Cite the spec section in a comment block at the top of the persona file.

## What this folder will NOT contain

- Per-workflow Mermaid diagrams for all 29 workflows (would be 29 files of noise). Diagrams group by persona-journey and cross-persona system.
- Status colours used as the primary content (those live in execution-state/).
- Founder picks / commercial decisions (those live in closure spec §12).
- Audit verdicts (those live in the audit drafts).
- Source-code excerpts (link to the file path; don't paste).

## What lives where (quick reference)

| Question                                                                       | Where to look                                                                                     |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Is workflow C11 built?                                                         | `execution-state/supervisor-ravi.md` C11 row                                                      |
| How does C11 actually flow end-to-end?                                         | `workflow-maps/supervisor-ravi.md` journey "Worker no-show"                                       |
| What tables does C11 read/write?                                               | `workflow-maps/data-model.md` tables-by-workflow matrix                                           |
| What happens to the worker when C11 fires?                                     | `workflow-maps/worker-suresh.md` journey "Subject of attendance"                                  |
| What's the cross-persona path when supervisor is on leave and worker no-shows? | `workflow-maps/combined-system.md` overlap-stress sequence                                        |
| Where is the system most likely to break today?                                | `execution-state/combined.md` gaps section + the implementation-horizon nodes in `workflow-maps/` |

---

**Created:** 2026-05-15 (friend-approved layer 2 of the 3-layer handoff system).
**Maintained by:** every slice that touches workflow design or schema, per failure-mode rule #1 in `execution-state/INDEX.md`.
