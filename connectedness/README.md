# Connectedness Index

Living engineering surface for "what does this feature touch, and what breaks if I change X?"

Replaces the visual-graph-as-primary approach with a 4-layer system:

- **Layer A — Feature manifests** (this directory, human-owned source of truth)
- **Layer B — Generated evidence** (machine-built JSON at `connectedness/generated/`, rebuilt by `pnpm connectedness:build`)
- **Layer C — Impact CLI** (`pnpm connectedness:impact <entity>`)
- **Layer D — CI freshness guard** (`pnpm connectedness:check`)

All 4 layers ship in the MVP. Built across Idx-1 (seed manifests) → Idx-2 (extractors + generated JSON) → Idx-3 (impact CLI with route-name resolution) → Idx-4 (CI guard, 6 rules).

## Scope of this MVP

- **10 feature manifests** for: `tenancy`, `identity`, `decisions`, `hr-updates`, `replacements`, `assignments`, `attendance`, `chat`, `audit`, `notifications`
- These cover every feature the P1 schema migration + P2 routes will touch
- All other repo domains (`leaves`, `swaps`, `visits`, `living-doc`, `complaints`, plus external SaaS integrations like `gupshup`, `payroll`) are **external referenced domains** — they exist in the codebase, MVP manifests reference them via `external_references:`, but they get their own manifests later (Iteration 3, when feature work touches them)

## Manifest schema (canonical)

Every manifest is a YAML file at `connectedness/features/<feature-name>.yml`. Use kebab-case for the filename.

### Live vs planned — the machine-readable split

`routes`, `state_machines`, and `tests` must distinguish **what exists today** from **declared intent that doesn't exist yet**. CI-2 (manifest validity) only validates `live:` entries against the filesystem. `planned:` entries are intent — they fail CI-2 only if the corresponding artifact lands without being moved from `planned:` to `live:`.

```yaml
routes:
  live:
    - POST /assignments # exists in apps/backend/src/routes/assignments.ts today
  planned:
    - POST /decisions/:id/apply # P2 — not yet present; declared intent

state_machines:
  live:
    - packages/state-machines/src/worker.ts
  planned:
    - packages/state-machines/src/decision-workspace-item.ts

tests:
  live:
    - apps/backend/test/auth-flow.test.ts
  planned:
    - apps/backend/test/decisions/**/*.test.ts
```

### `affects:` semantics (strict)

`affects:` lists **downstream cascade / blast radius** only — mapped MVP features that this feature's writes propagate into. It is **not** dependency, **not** tenant-scoping, **not** "uses". A row change in this feature must causally produce a change (or potential change) in the listed feature.

Wrong uses of `affects:`:

- `tenancy.yml.affects: [identity, decisions, ...]` — tenant scoping is not cascade. Wrong.
- `identity.yml.affects: [tenancy, decisions]` — identity rows don't cascade-change those. Wrong.
- `chat.yml.affects: [tenancy]` — scoping, not cascade. Wrong.

Right uses:

- `decisions.yml.affects: [attendance, replacements, audit]` — accepting a decision writes Attendance (MARK_ABSENT) / spawns ReplacementInvite / writes AuditEvent. Real cascade.
- `assignments.yml.affects: [attendance]` — an Assignment generates Visits which write Attendance. Real cascade.

### Required top-level fields

```yaml
feature: <name> # string identifier (must match filename minus .yml)
status: active # active | active-but-contract-incomplete | deprecated
description: <one-line summary> # ≤120 chars

owns: # ENTITIES THIS FEATURE PERMANENTLY OWNS
  tables: [<TableName>, ...]
  state_machines: # split live/planned
    live: [<path>, ...]
    planned: [<path>, ...]

provisional_owns: # OPTIONAL — temporary MVP-coverage ownership
  tables:
    - name: <TableName>
      reason: <why temporarily here>
      rightful_owner: <feature name that should own it in Iteration 3+>
      migrate_when: <trigger description>

routes: # ROUTES THIS FEATURE DECLARES (live vs planned)
  live: [<METHOD> <path>, ...]
  planned: [<METHOD> <path>, ...]
  # Routes whose effect writes/reads a table owned by THIS feature
  # CI-5: a route may appear in only one manifest

ui: # UI SURFACES THIS FEATURE DECLARES
  surfaces: [<name>, ...] # R6 prototype tab/sheet names
  prototypes: [<path>, ...] # paths to prototype JSX/HTML files

packages: # PACKAGES THIS FEATURE DEPENDS ON (existing dirs only)
  - <packages/...> # CI-2 validates each path exists today

specs: # AUTHORITATIVE SPEC DOCS (existing files only)
  - <docs/specs/...>

tests: # TEST FILE PATHS / GLOBS (live vs planned)
  live: [<apps/backend/test/...>, ...]
  planned: [<apps/backend/test/...>, ...]

affects: # MAPPED MVP FEATURES THIS WRITES CASCADE INTO
  - <feature-name> # must match another manifest's `feature:` value
  # CI fails if a name here doesn't resolve to a manifest in this directory
  # NOT dependency. NOT scoping. NOT "uses". Cascade/blast-radius ONLY.

external_references: # UNMAPPED DOMAINS REFERENCED BUT NOT OWNED
  - name: <domain-name> # e.g. leaves, swaps, visits
    why: <one-line reason>
    iteration: <iteration when this domain gets its own manifest>
```

### Two separation rules (per friend's execution rules 2026-05-13)

1. **`affects:` ≠ `external_references:`** — `affects:` lists only mapped MVP features (cascade targets). Unmapped domains go in `external_references:`. Don't mix.
2. **`provisional_owns:` ≠ `owns:`** — Temporary MVP-coverage ownership is a separate machine-readable block. Tools grep `provisional_owns` to find tables that should migrate to other manifests in Iteration 3.

### Validation rules CI will enforce (when Idx-4 lands)

| Rule                             | Failure example                                                                                                                   |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Touched-entity ownership         | "PR modifies `POST /decisions/:id/apply` but `decisions.yml` doesn't list it"                                                     |
| Manifest validity (live only)    | "Dead live reference: `chat.yml` lists `apps/backend/test/chat-messages.test.ts` (file not found)"                                |
| Generated freshness (post-Idx-2) | "Stale index; re-run `pnpm connectedness:build`"                                                                                  |
| No dual ownership                | "`AuditEvent` is claimed by both `audit.yml` and `decisions.yml`"                                                                 |
| Provisional triggers             | "PR touches `Outbox` for non-audit reasons but `audit.yml` still claims it provisionally — move to `notifications.yml`"           |
| Planned-arrival promotion        | "File `packages/state-machines/src/decision-workspace-item.ts` now exists; move it from `planned:` to `live:` in `decisions.yml`" |

CI scope at MVP: **touched entities only**, not full-repo orphan elimination.

## What's deferred to later Idx phases

- **Idx-2**: Extractors for Prisma schema, backend routes, migrations, manifests → emit `nodes.json`, `edges.json`, `impact-index.json`
- **Idx-3**: `pnpm connectedness:impact <entity>` CLI with pretty-printed output
- **Idx-4**: CI guard with the 6 rules above
- **Iteration 2** (post-MVP): screen extractor, test extractor, state-machine extractor
- **Iteration 3** (post-MVP): manifests for `leaves`, `swaps`, `visits`, `living-doc`, `complaints`, `notifications`
- **Iteration 4** (post-MVP): full-repo orphan elimination CI rule

## Known limitations (MVP)

Documented intentionally — these surface in the generated output and CLI rather than being silent gaps.

### Route-name resolution falls back to file paths in two narrow cases

The `edges-reads-writes` extractor walks the AST from each Prisma call up to the enclosing `<receiver>.METHOD('/path', ...)` call to resolve a `METHOD /path` route name. This works for **the useful majority** of route handlers. Two narrow cases fall back to the route file path instead:

| Case                                               | Example                                                                                                                          | Reason                                                                                                      | Count today     |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------- |
| Module-scope helper functions called from handlers | `apps/backend/src/routes/chat.ts` — handlers invoke top-level helpers that contain the Prisma calls                              | The AST walker doesn't follow call-graph references across function definitions                             | 16 Prisma calls |
| Template-literal route paths with substitutions    | `apps/backend/src/routes/leave-requests.ts` — `app.post(\`/leave-requests/:id/\${action}\`, ...)` for action ∈ {approve, reject} | The walker only resolves string-literal paths; the `extractFastifyRoutes` extractor has the same limitation | 5 Prisma calls  |

In both cases the impact CLI shows the route file path (e.g., `apps/backend/src/routes/chat.ts`) inside the `routeReads` / `routeWrites` bucket instead of a clean `METHOD /path`. The data is still attributed to the correct entity; the label is just the file rather than the route. Engineers asking "what writes to X?" still find the file; they just need one extra hop to identify which specific handler.

Resolving these would require either (a) following call-graph references across function definitions in the AST walker, or (b) expanding template-literal paths from their enumerated substitution set. Both are post-MVP cleanups; the current state is documented here so neither becomes hidden noise.

## File layout

```
connectedness/
├── README.md                       # this file
├── features/                       # Layer A — human-owned manifests
│   ├── tenancy.yml                 # Company
│   ├── identity.yml                # User, Membership, Worker, Site
│   ├── decisions.yml               # DecisionWorkspaceItem (P1)
│   ├── hr-updates.yml              # HRUpdate, HRUpdateRule (P1 redesign)
│   ├── replacements.yml            # ReplacementInvite (P1)
│   ├── assignments.yml             # Assignment, CalendarEntry
│   ├── attendance.yml              # Attendance
│   ├── chat.yml                    # ChatThread, ChatMessage, ChatRequestLog
│   ├── audit.yml                   # AuditEvent
│   └── notifications.yml           # Outbox, Device
└── generated/                      # Layer B — built by `pnpm connectedness:build`; committed
    ├── nodes.json
    ├── edges.json
    ├── impact-index.json
    ├── manifest-coverage.json
    └── extraction-log.json
```

## Status

- **Idx-1 — Layer A seed manifests**: complete (10 manifests, including notifications.yml added on 2026-05-14 when Outbox was promoted out of audit's provisional ownership)
- **Idx-2 — Extractors + generated JSON**: complete (`pnpm connectedness:build`)
- **Idx-3 — Impact CLI with route-name resolution**: complete (`pnpm connectedness:impact <entity>`)
- **Idx-4 — CI guard with 6 rules**: complete (`pnpm connectedness:check [--base=<ref>]`)

Implementation lives in:

- `packages/knowledge-graph/src/extractors/` (Prisma + Fastify route + reads/writes extractors — reused as a library)
- `tools/connectedness/src/build.ts` (orchestrator + JSON emitter)
- `tools/connectedness/src/impact.ts` (impact CLI)
- `tools/connectedness/src/check.ts` (CI guard)

Re-run `pnpm connectedness:build` after any change to a manifest, route file, schema.prisma, or migration. CI-3 (generated-freshness) fails any PR that leaves `connectedness/generated/` out of date.
