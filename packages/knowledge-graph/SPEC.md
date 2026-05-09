# SPEC — Connectedness Map (extending `@axhy/knowledge-graph`)

> **Status:** Draft, panel-locked 2026-05-07
> **Branch:** `feat/connectedness-map`
> **Master plan:** `~/.claude/plans/now-i-think-it-functional-kernighan.md` §M
> **Lineage anchors:** ADR-0002 (three knowledge graphs), ADR-0007 (JWT), ADR-0011 (auto-generated clients), ADR-0014 (token-driven design), ADR-0019 (custom ESLint rules)
> **Plan companion:** `/Users/thotaakshay/.claude/plans/velvety-cuddling-pillow.md` (full phasing + risk analysis)

---

## 1. Context — why this work, why now

Founder mental model (verbatim, 2026-04-29 panel debate):

> "if a seed gives birth to a big tree we still need to be connected to seed even when we grow that big — see where each branch is and what and how, just like vector dbs."

Concrete restatement (2026-05-07):

> "how each table and feature components screens all of them are connected i want that you know with figma maybe or more better than that."

**Why the Connectedness Map matters:**

- **Phase B (backend foundations) is about to start.** Adding ~10 Prisma tables + ~50 backend routes blind would silo the schema from the UI. The connectedness picture lands FIRST so backend tables are designed with the screens that consume them in mind.
- **Solo-founder forgetfulness.** At 200K+ LOC, no one can read the whole codebase. AI tools (Claude, Cursor) need precise per-question context.
- **Panel auditability.** Any change is panel-auditable with one-hop visibility across schema → state machines → routes → screens.
- **Customer artifact.** Procurement officers ask for architecture diagrams. Connectedness Map exports double as a sanitized architecture deliverable.

**"Better than Figma" — what that means here:**

- Figma gives **visual fidelity** — paint that drifts from code.
- Connectedness Map gives **semantic fidelity** — bound to source via `@derives()` annotations and AST extraction. Stays current as code changes.

**What the map answers (founder, verbatim):**

> "open a thing and SEE: this is the supervisor home, here are the fields it reads from the database, here are the actions it can take, here are the tables those actions write to. End-to-end, without reading 6 files."

**The diagnostic question — the spec's acceptance test:**

> "if I rename `Worker.phoneE164`, here's what breaks." (field-level traceability)

---

## 2. Non-goals

- **Pixel-perfect visual design.** That's Figma's job. This map is structure + semantics only.
- **Wishful surfaces.** No nodes for screens that don't yet exist (RN mobile worker/supervisor/owner/HR apps). They auto-appear when commits land.
- **MCP server build-out** (`query_structure`, `query_semantic`, `query_lineage`, `query_hybrid`) — separate spec/ADR. The `mcp:serve` script is broken today; its repair is **deferred**.
- **Tree-sitter-aware chunking** — current whole-file chunking suffices for v1.
- **Component primitive governance** — `<Button>`, `<Input>`, etc. from `@axhy/ui-web` are NOT graph nodes in v1. Separate ADR if/when needed.
- **Pinecone, Neo4j, ArangoDB, or any new datastore.** Postgres + pgvector is locked (ADR-0002).

---

## 3. Panel-locked decisions

The 17-voice panel reached unanimous or majority-with-overruled-minority consensus on all 15 open spec questions. Full debate is in the chat preceding this spec; the locks are below.

| #   | Decision                              | Lock                                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Naming alignment with existing schema | Reuse existing enum kinds: `ui_screen`, `ui_component`, `api_endpoint`. No new node kinds added.                                                                                                                                                                                                                                                      |
| Q2  | Edge kinds                            | Add 4 new (`mounts`, `triggers`, `mirrors`, `navigates_to`); reuse `reads`, `writes`.                                                                                                                                                                                                                                                                 |
| Q3  | READS granularity                     | BOTH table-level AND field-level via 3 tiers. **Tier 1** (always, 100%): `field belongs_to entity` Prisma-derived. **Tier 2** (best-effort): destructuring-based `reads` edges, `metadata.confidence='low'`. **Tier 3** (deferred): typed-client field-list reads. Viewer collapses to table-level by default.                                        |
| Q4  | Component scope                       | Feature-scoped only. Folder convention: `apps/*/app/**` + `apps/*/components/feature/**` get nodes; `packages/ui-web/*`, `packages/ui-native/*` do NOT.                                                                                                                                                                                               |
| Q5  | NAVIGATES_TO extraction               | AST via `ts-morph`. Covers `<Link href>`, `router.push`, `router.replace`, `redirect()`. Two flags: `metadata.dynamic=true + parsedPrefix=/visit/` (template literal partially resolved) vs `metadata.unresolvable=true` (couldn't extract). Audit reports unresolvable count as drivable metric. RN `navigation.navigate` deferred (no RN code yet). |
| Q6  | TRIGGERS scope                        | Generic edge — both `ui_screen → api_endpoint` AND `api_endpoint → api_endpoint`. metadata.kind = `direct` \| `indirect_dispatch`.                                                                                                                                                                                                                    |
| Q7  | MIRRORS granularity                   | Coarse: `ui_screen → state` (machine root). metadata.relevantStates lists specific states.                                                                                                                                                                                                                                                            |
| Q8  | Annotation strategy                   | Auto-detect primary, explicit `@derives()` supplement. Regex captures anything up to closing paren: `/@derives\(([^)]+)\)/g`. Normalization to ADR/section/path/panel form happens in app code, not regex.                                                                                                                                            |
| Q9  | TRIGGERS extraction                   | AST via `ts-morph`. **No `apiClient` exists today** — only raw `fetch()` calls. Use `TemplateExpression.getSpans()` to resolve `fetch(\`${API_URL}/auth/...\`)`static tails. When`@axhy/api-client`is generated (per ADR-0011), extend to`apiClient.\*`traversal. metadata.discoveredVia =`fetch_literal`\|`fetch_template`\|`api_client`.            |
| Q10 | Bug fixes                             | Phase A in-scope: color-map case, provenance source-kind detection, `@derives()` regex broadening, audit-orphan-kind parameterization. Phase B deferred: MCP server, tree-sitter chunking.                                                                                                                                                            |
| Q11 | Mobile surfaces                       | Skip in v1. Auto-pickup on landing.                                                                                                                                                                                                                                                                                                                   |
| Q12 | Performance ceiling                   | Hard ceiling 5K nodes / 15K edges. Viewer adds filter-by-app + 1-hop expansion.                                                                                                                                                                                                                                                                       |
| Q13 | Build trigger                         | Triple: local on-demand, husky pre-push (audit-only fast), CI full rebuild + audit.                                                                                                                                                                                                                                                                   |
| Q14 | Privacy / auth                        | `/api/graph` requires SUPER_ADMIN. Field nodes carry `metadata.personal: true` if `/// @personal` annotation present.                                                                                                                                                                                                                                 |
| Q15 | Output format                         | Plain `{nodes, links}` JSON. Unchanged.                                                                                                                                                                                                                                                                                                               |

No items escalated to founder for tie-break. All locks reached without escalation.

---

## 4. Schema additions

### 4.1 Node kinds (no schema change required)

All target node kinds **already exist** in `axhy_graph.node_kind` enum (verified 2026-05-07):

| Kind                  | Used for                                                    |
| --------------------- | ----------------------------------------------------------- |
| `entity`              | Prisma model (Table)                                        |
| `field`               | Prisma model field                                          |
| `state`               | XState machine root + individual states                     |
| `transition`          | XState transitions                                          |
| `api_endpoint`        | Backend route (Fastify + Next.js Route Handlers)            |
| `ui_screen`           | Surface (one per route file under `apps/*/app/**/page.tsx`) |
| `ui_component`        | Feature-scoped UI component                                 |
| `adr`                 | ADR doc                                                     |
| `master_plan_section` | §X.Y reference                                              |
| `panel_debate`        | Panel debate doc                                            |

**`metadata jsonb` keys (canonical reference):**

| Key                        | On                                          | Values                                                                    | Purpose                                                |
| -------------------------- | ------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------ |
| `app`                      | `ui_screen`, `ui_component`, `api_endpoint` | `'admin-web' \| 'supervisor-preview' \| 'backend' \| 'mobile'`            | Filter-by-app in viewer                                |
| `personal`                 | `field`                                     | `true`                                                                    | Mirrors Prisma `/// @personal` annotation; PII flag    |
| `model`, `prismaField`     | `field`                                     | strings                                                                   | Stable identifier for diagnostic tests                 |
| `method`, `path`, `role`   | `api_endpoint`                              | strings                                                                   | Backend route metadata                                 |
| `confidence`               | `reads`/`writes` (tier-2)                   | `'low'`                                                                   | Set on destructuring-derived field reads (best-effort) |
| `dynamic` + `parsedPrefix` | `navigates_to`                              | `true` + string                                                           | Template-literal href, partially resolved              |
| `unresolvable`             | `navigates_to`                              | `true`                                                                    | Couldn't extract anything; audit metric                |
| `kind`                     | `triggers`                                  | `'direct' \| 'indirect_dispatch'`                                         | Surface→route vs route→route                           |
| `discoveredVia`            | `triggers`                                  | `'fetch_literal' \| 'fetch_template' \| 'api_client' \| 'fastify_inject'` | Provenance of the edge                                 |
| `relevantStates`           | `mirrors`                                   | `string[]`                                                                | Specific states the screen distinguishes               |

### 4.2 Edge kinds (ALTER TYPE migration)

Add 4 values to `axhy_graph.edge_kind`:

```sql
-- scripts/migrations/0001-graph-edge-kinds.sql
ALTER TYPE axhy_graph.edge_kind ADD VALUE IF NOT EXISTS 'mounts';
ALTER TYPE axhy_graph.edge_kind ADD VALUE IF NOT EXISTS 'triggers';
ALTER TYPE axhy_graph.edge_kind ADD VALUE IF NOT EXISTS 'mirrors';
ALTER TYPE axhy_graph.edge_kind ADD VALUE IF NOT EXISTS 'navigates_to';
```

Constraints: idempotent. Postgres requires `ALTER TYPE ... ADD VALUE` outside a transaction block.

| New edge       | src kind                      | dst kind       | meaning                                      |
| -------------- | ----------------------------- | -------------- | -------------------------------------------- |
| `mounts`       | `ui_screen`                   | `ui_component` | Screen renders this component                |
| `triggers`     | `ui_screen` \| `api_endpoint` | `api_endpoint` | Surface or route invokes a route             |
| `mirrors`      | `ui_screen`                   | `state`        | Screen UI varies based on this state machine |
| `navigates_to` | `ui_screen`                   | `ui_screen`    | Surface links to another surface             |

| Reused edge         | src kind                      | dst kind            | meaning                    |
| ------------------- | ----------------------------- | ------------------- | -------------------------- |
| `reads` (existing)  | `ui_screen` \| `api_endpoint` | `entity` \| `field` | Reads this table or field  |
| `writes` (existing) | `api_endpoint`                | `entity` \| `field` | Writes this table or field |

### 4.3 Migration runner

**Verified state:** No `scripts/migrations/` directory exists today. Single `scripts/init-postgres.sql` runs once at DB init. No migration runner.

**Lock:** Introduce `scripts/migrations/` + idempotent runner `scripts/run-migrations.mjs`. Runner reads files in lexical order, executes inside an advisory-lock-protected loop, tracks applied migrations in a new `axhy_graph.schema_migrations` table.

Wired into `pnpm db:migrate` (new package.json target). Runs as part of Railway deploy hook.

**Side benefit:** unblocks every future schema change. v3 was about to need a migration runner anyway.

---

## 5. Extractor pipeline

### 5.1 Existing pipeline (unchanged)

`packages/knowledge-graph/src/builder.ts` runs via `tsx`. Three sequential phases:

1. **Semantic chunks** — walks `SCAN_DIRS = ['apps', 'packages', 'docs', 'scripts', 'tools', 'tests']`, extensions `.ts .tsx .js .mjs .md .prisma .sql .mmd`. Hashes file content; skips if unchanged. Embeds via OpenAI `text-embedding-3-small`. Whole-file chunk.
2. **Structural nodes** — Prisma regex (`^model\s+(\w+)\s*\{`) → `entity` nodes. XState regex → `state` nodes (machine root only).
3. **Provenance edges** — `@derives()` regex over all files; ADR docs at `docs/decisions/NNNN-slug.md` → `adr` nodes; edges from file's source node → ADR node.

### 5.2 New extractor stages

Five new stages, run inside Step 2 (structural nodes) after Prisma + XState:

#### Stage 2a — Prisma field extraction

For every model parsed in Step 2, extract its fields. Use AST (Prisma's own parser via `@prisma/internals`) — NOT regex. Each field:

- Becomes a `field` node with `name = "Worker.phoneE164"`, `source_path = path/to/schema.prisma:LN`.
- `belongs_to` edge: `field → entity` (existing kind).
- `metadata.personal = true` if field has `/// @personal` annotation.

#### Stage 2b — Fastify route extraction

Walk `apps/backend/src/routes/**/*.ts` via `ts-morph`. Find Fastify route declarations (`fastify.get(...)`, `fastify.post(...)`, `app.route(...)`). Each route:

- Becomes an `api_endpoint` node with `name = "POST /workers/:id"`, `source_path = path/to/handler.ts:LN`.
- `metadata.method`, `metadata.path`, `metadata.role` (from auth-decorator inspection).
- AST inside the handler: find Prisma client calls (`prisma.X.findMany`, `.create`, `.update`, `.delete`, `.upsert`). Emit `reads` (find\*) or `writes` (create/update/upsert/delete) edges to `entity` nodes (table-level) and to specific fields if the call uses `select: { ... }` or `data: { ... }` projections (field-level).
- Find `fastify.inject(...)` or internal-route call patterns → `triggers` edges (`api_endpoint → api_endpoint`, `metadata.kind='indirect_dispatch'`).

#### Stage 2c — Surface (UI screen) extraction

Walk Next.js + RN screen files:

- `apps/admin-web/app/**/page.tsx`
- `apps/supervisor-preview/app/**/page.tsx`
- `apps/mobile/app/**/*.tsx` (when commits land — currently nothing)

For each screen file:

- Becomes a `ui_screen` node with `name` = route path inferred from app-router folder structure (`/owner/operations`, `/hr/workers/[id]`).
- `metadata.app` set per app.
- AST traversal (ts-morph):
  - Imports from `apps/*/components/feature/**` → `mounts` edges to those `ui_component` nodes.
  - `fetch(literal)` or `fetch(\`${API_URL}/...\`)`→`triggers`edges. Static literal:`metadata.discoveredVia='fetch_literal'`. Template: extract static tail via `TemplateExpression.getSpans()`, `metadata.discoveredVia='fetch_template'`. (Codebase has no `apiClient`or`useSWR`today;`apiClient.\*` traversal added later when ADR-0011 lands.)
  - Imports of state-machine modules from `@axhy/state-machines` → `mirrors` edges. `metadata.relevantStates` inferred from `useSelector(...)` or `state.matches('...')` strings.
  - `<Link href="...">`, `router.push("...")`, `router.replace("...")`, `redirect("...")` → `navigates_to` edges. Static literals → exact target. TemplateExpression with parsable prefix → `metadata.dynamic=true, parsedPrefix='/visit/'`. Fully unparseable → `metadata.unresolvable=true` (audit metric).

#### Stage 2d — Component (feature-scoped) extraction

Walk:

- `apps/*/components/feature/**/*.tsx`
- co-located feature components inside `apps/*/app/**/_components/*.tsx`

Each file → `ui_component` node. Same AST traversal as Stage 2c (`mounts`, `triggers`, `mirrors`). Components rarely emit `navigates_to`; extractor handles them if found.

#### Stage 2e — XState transitions extraction

Currently the builder finds the machine root only. Extend to walk every state config inside the machine:

- Each named state → `state` node, `belongs_to` edge to machine root.
- Each transition (`on: { EVENT: 'TARGET' }`) → `transitions_to` edge (existing kind).

Unblocks the "MIRRORS metadata.relevantStates" lookup.

### 5.3 AST library — ts-morph

Add `ts-morph` as a `devDependency` of `@axhy/knowledge-graph`.

Rationale:

- AST is the only correct path for production extraction (per Iteration 4 of panel rule: "no cheap shortcuts"). Regex on JS/TS is brittle.
- `ts-morph` is the standard wrapper. Babel-parser is an alternative but `ts-morph` understands TS-specific syntax (interfaces, type annotations).
- Performance: full repo walk via `ts-morph` is ~10s on a project this size; cached via mtime check.

### 5.4 Idempotency + incrementality

- Each new node has a stable `(kind, name, source_path)` UNIQUE constraint (already in schema).
- New edges use `(kind, src_id, dst_id)` UNIQUE.
- Re-running the builder is idempotent — same input → same graph.
- **Incremental mode:** builder takes `--full` flag; default is incremental. Structural pass uses content-hash gate (mirroring existing chunk-pass gate). `--full` forces re-extraction.
- Deleted files: nodes pointing at non-existent `source_path` are flagged orphan in `audit.ts`.

---

## 6. `@derives()` annotation evolution

### 6.1 Broadened regex

Current (in `builder.ts:40`):

```ts
const DERIVES_RE = /@derives\(([A-Z0-9-]+|master-plan §[A-Z0-9.]+)\)/g;
```

Broadened (per Q8 — capture anything up to closing paren, normalize in app code):

```ts
const DERIVES_RE = /@derives\(\s*([^)]+?)\s*\)/g;
```

Then in app code:

```ts
function normalizeDerivesTarget(raw: string): { kind: NodeKind; name: string } {
  const trimmed = raw.trim();
  if (/^ADR-\d{4}$/.test(trimmed)) return { kind: 'adr', name: trimmed };
  if (/^master-plan §/.test(trimmed)) return { kind: 'master_plan_section', name: trimmed };
  if (/^docs\/.+\.md$/.test(trimmed)) return { kind: 'doc', name: trimmed };
  if (/^panel-\d{4}-\d{2}-\d{2}/.test(trimmed)) return { kind: 'panel_debate', name: trimmed };
  if (/^invariant:/.test(trimmed))
    return { kind: 'doc', name: `docs/invariants/${trimmed.slice('invariant:'.length)}.md` };
  return { kind: 'doc', name: trimmed }; // fallback
}
```

Captures (today's usages + new):

- `@derives(ADR-0006)` — existing
- `@derives(master-plan §G)` — existing
- `@derives(docs/invariants/multi-tenant.md)` — currently dropped (`tenant-context.ts`)
- `@derives(panel-2026-04-30 — graph viewer cheap version)` — currently dropped
- `@derives(panel-2026-05-06 round 3)` — currently dropped (`ActionHome.tsx`)
- `@derives(invariant:multi-tenant)` — new short form
- Any future ref form — captured by `[^)]+`, normalization extends without regex changes.

### 6.2 Source-kind detection (replaces hardcoded `ui_component`)

Current `builder.ts` hardcodes `kind = '.md' ? 'doc' : 'ui_component'` for `@derives()` source. All `.ts` files (state machines, routes, tests, etc.) become `ui_component` — wrong. Replace with path-based detection:

```ts
function inferSourceKind(path: string): NodeKind {
  if (path.endsWith('.prisma')) return 'entity';
  if (path.endsWith('.md')) return 'doc';
  if (path.match(/packages\/state-machines\//)) return 'state';
  if (path.match(/apps\/backend\/src\/routes\//)) return 'api_endpoint';
  if (path.match(/apps\/[^/]+\/app\/.+\/page\.tsx?$/)) return 'ui_screen';
  if (path.match(/apps\/[^/]+\/(components\/feature|app\/.*\/_components)\//))
    return 'ui_component';
  if (path.match(/\.test\.tsx?$/)) return 'test';
  return 'doc'; // fallback
}
```

### 6.3 ESLint rule — extend existing `require-derives.js`

**Verified:** `packages/eslint-config-axhy/src/rules/require-derives.js` already exists (per ADR-0019). Enforces `@derives(...)` on `ExportNamedDeclaration` and `ExportDefaultDeclaration` with file-level + per-export modes. Exempts test files, `dist/`, `.next/`, `generated/`.

**Change:**

- Broaden the captured-target regex inside the rule (capture `[^)]+`, normalize in app code).
- Add a new opt-out exception: a file participating in auto-extraction (`apps/*/app/**`, `apps/*/components/feature/**`, `apps/backend/src/routes/**`) does NOT need an explicit `@derives()` because the extractor already binds it. Rule consults a small JSON manifest of "auto-extracted paths" maintained alongside.

**Anti-pattern to avoid:** do NOT create a parallel `require-derives-or-extracted.ts` rule. Extend the existing one.

---

## 7. Viewer changes

File: `apps/admin-web/app/system/graph/page.tsx`. Existing: `react-force-graph-2d`, full-graph dump, kind-filter buttons, gray-rendering bug.

### 7.1 Bug fixes

- **Color-map case fix.** `KIND_COLORS` keys → lowercase (matching DB enum values). Add entries for: `ui_screen`, `ui_component`, `api_endpoint`, `field`, `transition`, `master_plan_section`, `panel_debate`. Use `@axhy/ui-tokens` brand palette (per ADR-0014; no inline hex).
- **Distinct sizing.** Currently every node renders at default size. Map `val` to incoming-edge degree.

### 7.2 New filters

- **Filter by app/package.** Sidebar checkboxes: `admin-web`, `supervisor-preview`, `backend`, `state-machines`, `shared-schema`. Driven by `metadata.app` (or inferred from `source_path`).
- **Filter by node kind.** Existing toggle row (fixed).
- **Filter by edge kind.** New toggle row: `reads`, `writes`, `mounts`, `triggers`, `mirrors`, `navigates_to`, `transitions_to`, `derives_from`.

### 7.3 1-hop expansion on click

Side panel shows: kind, name, source-path link, metadata.

- **+ Expand 1-hop:** ghosts non-neighbors (opacity 0.1), highlights node + 1-hop in full opacity.
- **+ Pin filter to this node:** re-fetches `/api/graph?focus=<nodeId>&hops=1` (server-side slice) for performance at scale.

### 7.4 Field-level expand toggle

Default: edges to `entity` nodes (table-level) shown.
Toggle: "Show field-level edges." Reveals edges to `field` nodes. Field nodes default-hidden until toggled (otherwise screen looks noisy).

### 7.5 Auth gate

`apps/admin-web/app/api/graph/route.ts` — currently public unauthed (with a comment claiming "no PII"). Vinod's lock retracts that contract.

- Read JWT from `Authorization: Bearer ...` header (per ADR-0007). Verify via `jose`.
- If no token → **401 Unauthorized**.
- If token valid but `role !== 'SUPER_ADMIN'` → **403 Forbidden**.
- If valid super-admin → proceed.
- Strip nodes with `metadata.personal: true` from the response unless caller passes `?includePersonal=1` (only honored for SUPER_ADMIN, double-checked).
- Update / delete the misleading comment at the top of the route file. Replace with a comment that cites Vinod's lock.

---

## 8. Bug fixes scoped in (Phase A)

Listed already in §6 (annotations) and §7 (viewer). Plus:

- **`audit.ts` orphan check parameterization.** Currently `WHERE n.kind = 'ui_component'`. Change to scan all kinds via constant array. Audit becomes CI-runnable health check that returns non-zero exit on:
  - Orphan ADR (no `derives_from` edge into it)
  - Dead-link (an `@derives()` ref to a non-existent ADR)
  - Floating screen/route/component (no incoming or outgoing edges)
  - Field referenced in graph but missing in current schema (renamed-field detection)
- **`audit.ts` callable from CI** with exit codes + summary JSON output.

---

## 9. Bug fixes deferred (Phase B, separate spec/ADR)

- **MCP server build-out.** `mcp-server.ts` doesn't exist; `mcp:serve` script broken. Implement 4 query tools: `query_structure`, `query_semantic`, `query_lineage`, `query_hybrid` (per ADR-0002). The broken script is **temporarily removed** from package.json in Phase 1 to stop crashes.
- **Tree-sitter chunking.** Replace whole-file embedding with function-level / class-level / state-level chunks for better semantic search granularity.

---

## 10. Implementation phasing (summary; full plan in writing-plans output)

The work splits into **5 phases**, panel-locked after Plan-agent review. Full per-phase file lists, LOC estimates, exit criteria, and risks live in the plan companion.

| Phase | Name                                                                          | Risk        | Approx LOC |
| ----- | ----------------------------------------------------------------------------- | ----------- | ---------- |
| 1     | Foundations: schema migration + bug triage                                    | LOW         | ~140       |
| 2     | Structural node extraction (fields, routes, screens, components, transitions) | MEDIUM      | ~600       |
| 3     | Edge extraction: READS, WRITES, MOUNTS, MIRRORS                               | MEDIUM-HIGH | ~250       |
| 4     | AST navigation: NAVIGATES_TO + TRIGGERS                                       | HIGH        | ~220       |
| 5     | Auth gate + viewer upgrades                                                   | LOW         | ~250       |

**Sequencing:** Phase 1 → 2 → 3 → 4 strict serial (FK constraints + node-before-edge). Phase 5 (viewer) can develop in parallel with Phases 3-4 atop Phase 2 data.

**Two-subagent parallel pattern (per `feedback_token_efficiency_delegate_sonnet.md`):**

- Subagent A: Phase 3 + Phase 4 (extractor edges)
- Subagent B: Phase 5 (viewer + auth gate)
- Both work atop Phase 2's nodes; both merge before final spec sign-off.

**Per-PR strategy:** one PR per phase, atomic. Per-phase verification before next phase starts. Branch: `feat/connectedness-map` (already on it).

---

## 11. Test strategy

Per `feedback_no_patches_production_only.md` + `feedback_simulator_*.md` rules: real-DB tests, no mocks.

### Unit tests (extractors)

- `packages/knowledge-graph/test/extractors/screens.test.ts` — fixture-based: synthetic `page.tsx` with known imports/JSX/fetch calls, assert extracted nodes + edges match expected shape.
- Same shape per extractor: `routes.test.ts`, `components.test.ts`, `navigates-to.test.ts`, `triggers.test.ts`, `prisma-fields.test.ts`, `xstate-transitions.test.ts`.
- Fixtures live at `packages/knowledge-graph/test/fixtures/` — small synthetic .tsx/.ts/.prisma files exercising each AST shape.

### Integration test (real-DB)

- Test runs against `axhy-sandbox` Railway tenant DB.
- Build full graph: `pnpm graph:build`.
- Assertions:
  - ≥20 `entity` nodes
  - ≥120 `field` nodes
  - ≥40 `ui_screen` nodes
  - ≥20 `api_endpoint` nodes
  - ≥3 `mounts` edges per `ui_screen` (avg)
  - 0 orphan ADRs

### Diagnostic test — the founder's quote-test

> "if I rename `Worker.phoneE164`, here's what breaks."

Concrete, runnable shape:

1. After Phase 4 lands, run full builder against sandbox at HEAD.
2. Test queries the graph:
   - Find `field` node where `metadata.model='Worker'` AND `metadata.prismaField='phone'`.
   - Query all nodes with incoming `reads` or `writes` edges to that field node.
   - Assert count ≥ N (where N is discovered the first time the test runs and locked in; "6 surfaces" is the founder's mental model — actual N depends on extractor coverage).
3. Drift signal:
   - PR renames Prisma field but doesn't update consumers → field node `name` changes; old edges still reference the old name; audit reports "renamed field with surviving references" with a list.
   - Count drops without rename → extractor regressed.
   - Count grows → new surface started reading sensitive data — also worth a CI signal.

This is the **acceptance test for the whole spec.**

### Performance test

- Build full graph: < 60s (cold cache), < 15s (warm cache).
- Viewer first paint: < 2s for ~1K nodes.
- `/api/graph` response (full dump): < 500KB gzipped.

---

## 12. Verification (end-to-end)

1. `pnpm graph:build` runs without error, produces ~950 nodes, ~3500 edges (rough projection).
2. Visit `/system/graph` as super-admin: see all kinds in distinct colors (no gray nodes).
3. Click a `ui_screen` node: side panel shows triggered routes + mirrored states + mounted components.
4. Toggle field-level READS: see fields fan out from entities.
5. Click a `field` node: see all surfaces that read it.
6. CI: open a dummy PR that renames a Prisma field without updating consumers; CI fails with the renamed-field warning naming the affected surfaces.

---

## 13. Out-of-scope (deferred work)

| Item                                                                                   | Where it'll go              |
| -------------------------------------------------------------------------------------- | --------------------------- |
| MCP server (4 query tools)                                                             | Separate spec + ADR-NNNN    |
| Tree-sitter chunking                                                                   | Separate spec               |
| Component primitive tracking                                                           | Separate ADR if/when needed |
| Mobile RN surface nodes                                                                | Auto-pickup as code lands   |
| 10 gaps in data-flow doc (AssignmentConfig SM, AI cost table, owner route paths, etc.) | Filed as follow-up issues   |

---

## 14. Risks + mitigations

| Risk                                                     | Mitigation                                                                                                                                                               |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ts-morph` perf at large repo                            | Cached file-mtime + content-hash gate (extending existing chunk gate to structural pass); `--full` flag forces full rebuild.                                             |
| Field-level tier-2 edges noisy + low-coverage            | `metadata.confidence='low'` flag; viewer dims low-conf edges; audit reports tier-2-only edges as "verify manually". Tier-1 (Prisma-derived `belongs_to`) is always 100%. |
| `metadata.dynamic=true` becomes "I gave up" flag         | Split: `dynamic=true + parsedPrefix` (partially resolved) vs `unresolvable=true` (full giveup). Audit tracks unresolvable count as drivable metric.                      |
| Auto-detect misses unusual call patterns                 | `@derives()` supplement is hand-authored escape hatch.                                                                                                                   |
| Schema enum migration fails in prod                      | Idempotent `ADD VALUE IF NOT EXISTS`; runner tracks applied migrations in `axhy_graph.schema_migrations`; tested on sandbox first.                                       |
| Graph drift on long-lived branches                       | Husky pre-push runs audit; CI rebuilds on every PR.                                                                                                                      |
| Phase 4 brittle JSX/template parsing                     | Fixture-based unit tests cover every shape; unresolvable count baseline locked first run.                                                                                |
| Audit floods false positives during Phase 2-3 transition | `field` kind explicitly excluded from orphan check until Phase 4 wires reads/writes edges.                                                                               |

---

## 15. Open questions for founder visibility (no approval needed)

Panel reached consensus. Surfacing for visibility:

1. **Component primitive tracking.** Panel locked OUT of v1. Founder: any objection? (If yes → add a separate ADR after Phase B.)
2. **Mobile surface inclusion timing.** Panel says "auto-pickup when commits land." Founder: any preference for stubs landing earlier just to populate the graph?
3. **Spec location.** Panel locked at `packages/knowledge-graph/SPEC.md` (this file). Founder: any preference for `docs/architecture/connectedness-map.md` instead?

If silence, panel locks stand.

---

## 16. Critical files (verified paths)

| File                                                            | Action                                                                         | Phase      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------ | ---------- |
| `packages/knowledge-graph/src/builder.ts`                       | EDIT — refactor into orchestrator; add incremental flag; ceiling guard         | 1, 2, 3, 4 |
| `packages/knowledge-graph/src/audit.ts`                         | EDIT — parameterize kinds; add ceiling + unresolvable metrics                  | 1, 3, 4    |
| `packages/knowledge-graph/src/index.ts`                         | EDIT — export extractor types + AUDIT_KINDS constant                           | 2          |
| `packages/knowledge-graph/src/extractors/prisma-fields.ts`      | NEW                                                                            | 2          |
| `packages/knowledge-graph/src/extractors/xstate-transitions.ts` | NEW                                                                            | 2          |
| `packages/knowledge-graph/src/extractors/fastify-routes.ts`     | NEW                                                                            | 2          |
| `packages/knowledge-graph/src/extractors/nextjs-routes.ts`      | NEW                                                                            | 2          |
| `packages/knowledge-graph/src/extractors/screens.ts`            | NEW                                                                            | 2          |
| `packages/knowledge-graph/src/extractors/components.ts`         | NEW                                                                            | 2          |
| `packages/knowledge-graph/src/extractors/edges-reads-writes.ts` | NEW                                                                            | 3          |
| `packages/knowledge-graph/src/extractors/edges-mounts.ts`       | NEW                                                                            | 3          |
| `packages/knowledge-graph/src/extractors/edges-mirrors.ts`      | NEW                                                                            | 3          |
| `packages/knowledge-graph/src/extractors/edges-navigates-to.ts` | NEW                                                                            | 4          |
| `packages/knowledge-graph/src/extractors/edges-triggers.ts`     | NEW                                                                            | 4          |
| `packages/knowledge-graph/src/extractors/index.ts`              | NEW — barrel + shared types                                                    | 2          |
| `packages/knowledge-graph/package.json`                         | EDIT — add `ts-morph` dep; remove broken `mcp:serve` script (defer to Phase B) | 1, 2       |
| `packages/knowledge-graph/test/builder.integration.test.ts`     | NEW — real-DB integration test                                                 | 2-4        |
| `packages/knowledge-graph/test/diagnostic-rename.test.ts`       | NEW — Worker.phone test                                                        | 4          |
| `packages/eslint-config-axhy/src/rules/require-derives.js`      | EDIT — broaden regex to `[^)]+`; normalize captured target in app code         | 1          |
| `scripts/init-postgres.sql`                                     | UNCHANGED (idempotent baseline; future schema changes go through migrations)   | —          |
| `scripts/migrations/0001-graph-edge-kinds.sql`                  | NEW                                                                            | 1          |
| `scripts/run-migrations.mjs`                                    | NEW — idempotent migration runner                                              | 1          |
| `package.json` (root)                                           | EDIT — add `db:migrate` target                                                 | 1          |
| `apps/admin-web/app/system/graph/page.tsx`                      | EDIT — color-map case fix; filters; 1-hop expansion; field toggle              | 1, 5       |
| `apps/admin-web/app/api/graph/route.ts`                         | EDIT — SUPER_ADMIN gate; `?focus=&hops=` slice; comment retract                | 5          |
| `.husky/pre-push`                                               | EDIT — add `pnpm graph:audit` (fast, ~3s)                                      | 1          |
| `.github/workflows/ci.yml`                                      | EDIT — add `pnpm graph:build && pnpm graph:audit` step                         | 4          |

— end of spec —
