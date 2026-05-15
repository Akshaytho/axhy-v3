---
Status: Active
Last validated against code: 2026-05-14
Validated branch: feat/phase-c-wave-4b-chat-completion
Validated commit: (pending — landed in this commit)
Primary owner: founder (Akshay Thota)
Replaces: nothing — first-version
Replaces founder-lock: 2026-05-08 backup-supervisor account-sharing lock (in-context per §6)
---

# Supervisor Responsibility Model

Operations Reality Review + design. Triggered 2026-05-14 when founder surfaced the supervisor-sick scenario during P1 schema implementation approval. The previous implicit answer to "what happens when a supervisor is sick?" was the 2026-05-08 founder-lock — "share the account." This doc replaces that workaround with a structured responsibility-binding model.

**Status: Active but contract-incomplete** (per `docs/index/canonical-truth.md`). Promoted 2026-05-14 after founder picks on all 9 open questions and the P1 → P1.5 → P2 re-scope. P1 schema implementation is **unblocked** for the existing narrow scope; `SiteSupervisorBinding` lands as P1.5 between P1 and P2 routes.

## §1 Status

**Active but contract-incomplete** (per `docs/index/canonical-truth.md`). Promoted 2026-05-14.

Promotion conditions met:

1. ✅ Friend pressure-test review (2 review rounds, draft + 4 consistency fixes).
2. ✅ Founder explicit approval of §6 (replaces the 2026-05-08 founder-lock).
3. ✅ Founder picks on all 9 §9 questions — see §9 below for locked picks.
4. ✅ P1 → P1.5 → P2 re-scope confirmed (P1 stays narrow; `SiteSupervisorBinding` lands as P1.5).

What this Active state means in practice:

- The responsibility-binding model is **binding** on any feature that touches supervisor routing or HR control over portfolios.
- The 2026-05-08 backup-supervisor account-sharing founder-lock is **replaced** (see §6).
- D.1 / R6 / HR Updates / product framing must cross-reference this model in their next revision; soft pointers landed in D.1 and framing in this same commit batch.
- §8 lists the downstream specs that get fuller updates over time.

What "contract-incomplete" means here: the model is locked, but the HR control-plane admin-web UI, the bootstrap-seed migration script, the SQL `EXCLUDE` invariant shape, and the "while you were out" digest UX are deferred to implementation (P1.5 + later R-versions).

## §2 Why this doc exists — the operations gap

The design process for D.1 / R6 / HR Updates was spec-first. Real-life persona stress tests (supervisor sick, supervisor quits, HR rebalances sites, new supervisor ramping up) were not run as a discipline. The supervisor-absence scenario surfaced late, after D.1 was promoted Active and after P1 pre-flight passed.

What that gap costs if left unaddressed:

- **Accountability erodes.** "Share the account" makes audit trails meaningless — you can no longer say who did what during a coverage window.
- **In-flight work fragments.** Open decisions, chat context, replacements, absences, and pending actions become unrouted when a supervisor disappears.
- **Cherry-picking surfaces.** Premium sites vs difficult sites become political when reassignment is informal and unrecorded.
- **Overload risk.** HR cannot see capacity if responsibility isn't structured.
- **Reporting breaks.** Per-supervisor performance metrics become unreliable when reassignment is casual.
- **Security blurs.** Account sharing hides who actually exercised authority.

The fix is to separate supervisor **identity** from supervisor **responsibility**.

## §3 Two distinct features (separate by design)

### 3.1 Temporary acting-supervisor coverage

Triggered by sickness, emergency, short-term absence, planned PTO. Time-windowed. The original supervisor remains the rightful owner; routing temporarily flows to the acting supervisor. When the window ends, responsibility returns automatically.

### 3.2 Permanent site portfolio reassignment

Triggered by rebalancing — HR moves sites between supervisors for capacity reasons, performance, premium-site allocation, or gradual ramp-up of new supervisors. Permanent until the next reassignment. No "original" supervisor concept — the new supervisor is the new rightful owner.

### 3.3 Capacity / load management — deferred

Out of scope for this doc. Possibly a third feature later: load suggestions, balance flags, ramp-up recommendations. Not designed here.

## §4 Core principle — responsibility binding, not person replacement

- A supervisor **is** a `User` + `Membership(role = SUPERVISOR)` row. Identity is permanent and unchanged across coverage windows and reassignments.
- Site responsibility is a **separate binding layer** keyed by `(siteId, userId, effectiveFrom, effectiveUntil?, actingForUserId?, reason)`.
- **Origin attribution is written at row-creation time.** When a writer creates a DWI / Visit / etc., it records the supervisor responsible at that exact moment. That value is immutable and forms the audit record of who originated the row.
- **Current responsibility routing for open work is read-time.** Today / Decisions queries JOIN against the active binding at read time to determine who currently sees each open `PROPOSED` row. Open work follows binding changes automatically; no sweep, no row updates. Terminal-state rows stay attributed to whoever actioned them.
- **Audit captures the binding change itself** — original, acting, why, from, until — separately from per-row audit.

What is explicitly NOT done:

- No account sharing (replaces the 2026-05-08 workaround — see §6).
- No `User` row deletion or replacement.
- No mutation of `Membership.userId`.
- No retroactive rewrite of past decisions, visits, or audit rows.
- No supervisor-app self-service delegation (replacement-supervisor identity is always a real `User` selected by HR, not impersonation).

## §5 Operational questions — answered

### 5.1 Can HR switch all sites, or selected sites only?

**Both.** The model is per-site binding. A "switch all sites currently owned by Y" convenience UI creates N per-site binding rows in one transaction. HR portfolio view shows per-supervisor; per-site view shows per-site. Granularity is the supervisor's choice in any given action.

### 5.2 `effectiveFrom` / `effectiveUntil`

- `effectiveFrom`: **required**. Defaults to NOW for "starts immediately." Future-dated bookings supported (e.g., HR schedules coverage for next Tuesday's planned PTO).
- `effectiveUntil`: **nullable**.
  - Temporary coverage (§3.1) → **required**, set to the absence end. UI forces an explicit end.
  - Permanent reassignment (§3.2) → **NULL** (open-ended; persists until next reassignment).

### 5.3 Auto-revert or manual revert?

**Auto-revert when `effectiveUntil` passes** for temporary coverage. Mechanism: cron sweep closes expired windows AND/OR read-time check at every routing computation (defense in depth). Manual "end coverage now" action available to HR for early returns.

Permanent reassignments have no auto-revert — they're terminal until the next reassignment.

### 5.4 What happens to open decisions during a binding change?

**Policy (operational behaviour):**

- Decisions in `PROPOSED` state at the moment of binding switch — **routing follows the new responsible supervisor.** The PROPOSED row appears in the new supervisor's Today / Decisions surface; the original supervisor sees it disappear from their open queue.
- Decisions in terminal states (`APPLIED` / `DISMISSED` / `FAILED` / `EXPIRED` / `UNDONE`) — **no change.** They stay attributed to whoever actioned them. Terminal is terminal.
- The original supervisor (who proposed the decision) is **preserved in audit** via the immutable `DWI.supervisorId` (origin attribution). Decision history reconstructs "originally proposed by X; routed to Y at HH:MM by binding change" through the AuditEvent for the binding change.

**Mechanism (how this is achieved):** Read-time computation per the locked §7(ii) choice. `DWI.supervisorId` is the supervisor at decision creation (immutable origin attribution); Today / Decisions queries JOIN against `SiteSupervisorBinding` at read time to surface each open `PROPOSED` row to whoever is currently responsible. Binding changes shift visibility automatically; no row update, no sweep.

### 5.5 Today / Decisions / Activity / Chat / HR Updates routing

Described at the conceptual / policy level. Column names and query shapes follow the locked §7 schema (single `SiteSupervisorBinding` table, read-time JOIN routing); implementation details land with P1.5.

- **Today**: shows decisions + visits for sites the calling supervisor is **currently responsible for**, as determined by the active binding row(s) covering `auth.userId` at query time. Includes both permanent-portfolio sites and any active acting-coverage windows.
- **Decisions**: same scope as Today — open decisions for sites in the calling supervisor's current responsibility set.
- **Activity**: historical. Shows audit events for sites the supervisor was responsible for **at the time of each event**. Activity references binding-at-audit-time, not current binding. (So when a supervisor returns from absence, Activity shows the acting supervisor's actions during their window, attributed correctly.)
- **Chat**: existing chat threads stay attributed to their creator (so the original supervisor can find their old threads). **Thread ownership does NOT migrate on binding change, but operational authority does** — new chat turns and the decisions they produce route to whoever is currently responsible for the affected site, not to the thread creator. A previous supervisor does not retain authority over a site just because they own an old thread about it.
- **HR Updates**: audience model unchanged at launch — all supervisors in `companyId` per HR Updates spec §4.1. Future per-site HR-update routing becomes possible (but not required) once the binding entity exists.

### 5.6 What happens when a supervisor returns from absence?

- `effectiveUntil` passes → cron / read-time check closes the temporary binding row.
- Open `PROPOSED` decisions for those sites route back to the returning supervisor automatically.
- Returning supervisor sees a **"while you were out" digest** on first open after the window ends — summarizes decisions accepted/dismissed by the acting supervisor during the absence.
- No retroactive ownership change to terminal decisions.
- The acting supervisor's authority for those sites ends. New decisions during the window remain attributed to them.

### 5.7 Gradual site ramp-up for a new supervisor

- HR creates per-site bindings progressively: e.g., day 1 = 2 sites, day 30 = 5 more, day 60 = full portfolio.
- No special "ramp" mode — it's a series of permanent reassignments via portfolio operations.
- Capacity context visible in HR portfolio view (current site count + recent decision volume per supervisor). No hard enforcement — HR judgment is the gate.

### 5.8 No-overlap invariant + precedence

**Hard invariant: at most one active binding **of each kind** per site at any moment.** "Kind" means temporary acting-coverage vs permanent portfolio. The two kinds may legitimately stack — that's the override case below. Two bindings of the _same_ kind covering the same `(siteId, time-window)` are forbidden.

**Precedence when both kinds are active for the same site:**

- A temporary acting-coverage binding (where `actingForUserId IS NOT NULL` in the chosen schema option) **overrides** the baseline permanent portfolio binding for the duration of its window.
- The portfolio binding is not removed — it is suppressed for the override window.
- When the temporary window's `effectiveUntil` passes (or HR ends it early), the portfolio binding becomes the active row again automatically.

This means at any moment, every site has **exactly one effective responsible supervisor**, determined by: "most-specific active binding wins" — an acting window beats the portfolio assignment underneath.

**Enforcement (schema-dependent — final form decided in §7):**

- DB-level (preferred): a Postgres `EXCLUDE` constraint or a partial unique index keyed on `(siteId, kind)` (where `kind ∈ {portfolio, acting}`) intersected with the time window. Postgres `tstzrange` + `EXCLUDE USING gist` is the canonical shape.
- App-layer (always present, regardless of DB enforcement): HR portfolio routes refuse to create an overlapping same-kind window. Acting-coverage routes refuse a window whose `effectiveFrom` is earlier than the current time.

**HR cannot:**

- Create two simultaneous acting-coverage windows for the same site (same-kind overlap).
- Create two simultaneous permanent portfolio bindings for the same site (same-kind overlap).
- Backdate `effectiveFrom` before now.

**HR can:**

- Stack a temporary acting window over a permanent portfolio binding (intentional override; the common sick-leave case).
- Create future-dated bindings that begin after now (e.g., schedule next Tuesday's coverage today).
- End a window early by setting `endedAt` / shortening `effectiveUntil` to now.

### 5.9 Routing for items that don't carry a `siteId`

The whole model is site-responsibility-based, but not every decision/event is cleanly site-scoped. The doc must answer: given an item without a direct `siteId`, how is the responsible supervisor derived?

**Per-kind derivation table (launch set; widen per future tool surface):**

| Item kind                              | `siteId` source                                                       | Then route via                                                                     |
| -------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `MARK_ABSENT` decision                 | Worker → primary site (see derivation rule below)                     | Binding lookup for that site                                                       |
| `APPROVE_LEAVE` decision               | Worker → primary site                                                 | Binding lookup for that site                                                       |
| `INITIATE_SWAP` decision               | The originating site of the swap (the site the supervisor is filling) | Binding lookup for that site                                                       |
| `CREATE_ASSIGNMENT` decision           | The new assignment's `siteId` (directly present on the row)           | Binding lookup for that site                                                       |
| `UPDATE_LIVING_DOC` decision           | Not site-scoped — supervisor's own writing                            | The supervisor who initiated; no derivation                                        |
| `TERMINATE` decision (EMPLOYMENT tier) | Worker → primary site                                                 | Binding lookup for that site **PLUS** HR ack required (per D.1 §2.5 HR writer row) |
| Visit / Attendance row                 | Already carries `siteId` directly                                     | Binding lookup for that site                                                       |
| HR Update fan-out                      | Not supervisor-scoped — company-wide audience                         | Per HR Updates spec §4.1 (all supervisors in `companyId`)                          |
| Owner-only decisions                   | Not in supervisor responsibility scope                                | Owner / HR-portal flow; out of binding model                                       |

**Worker → primary site derivation:**

- `primary_site_id` for a Worker = the `siteId` from the Worker's **most-recent active `Assignment` row** (by `createdAt DESC`).
- If the Worker is currently assigned to multiple sites simultaneously: pick the most recent assignment by `createdAt`. (Multi-site workers are uncommon at launch but supported.)
- If the Worker has no active Assignment (newly hired, not yet placed): primary site = the most-recent Assignment row regardless of state. If still none: routing falls back to HR queue (Worker has no responsible supervisor yet — HR must place them first).
- This is **read-time derivation**, not a stored field. Worker has no `primarySiteId` column at launch.

**Open question for founder (§9 Q9):** Is implicit derivation acceptable at launch, or should we add an explicit `Worker.primarySiteId` field for unambiguous routing? Recommend implicit at launch; explicit field is a Wave-4c+ optimization once multi-site workers become common.

**Excluded from supervisor binding scope (by design):**

- Company-wide HR updates — audience-model, not supervisor-routed.
- Owner-only decisions (bank-account changes, permanent terminations beyond supervisor authority, payroll structural changes).
- Cross-tenant operations — N/A; tenant boundary is rigid.

## §6 Replacing the 2026-05-08 backup-supervisor founder-lock

The 2026-05-08 founder-lock said: _"if a supervisor goes on leave, they share their account with someone trustworthy. No in-app delegation feature."_ Recorded in R6 §6.

**That lock is replaced by the model in this doc.** Specifically:

| Old lock (2026-05-08)                      | This doc (2026-05-14)                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Account sharing as the absence workaround  | Account sharing forbidden; no shared credentials                                                              |
| No in-app delegation feature               | Structured HR-driven responsibility binding (not delegation; HR assigns, supervisors don't delegate to peers) |
| Backup-supervisor mode removed from mobile | Confirmed — no supervisor-app self-service delegation                                                         |
| HR has no control surface                  | HR is the control plane (acting windows + portfolio reassignment) — surface details TBD in a future R-version |

This replacement is in-context per friend's instruction. No separate founder-unlock step. Founder approves the new rule by approving this doc.

## §7 Schema — chosen model

The schema is **locked** as of 2026-05-14. The chosen model below is binding. Alternatives considered + reasons rejected follow in §7.x for traceability.

### Chosen: single `SiteSupervisorBinding` table with `actingForUserId` discriminator (Option A)

```
SiteSupervisorBinding
  id                UUID
  companyId         UUID
  siteId            UUID
  userId            UUID  -- the supervisor responsible for this binding
  actingForUserId?  UUID  -- NULL = permanent portfolio assignment; NOT NULL = temporary
                          --   coverage, references the original supervisor being covered for
  effectiveFrom     TIMESTAMPTZ
  effectiveUntil?   TIMESTAMPTZ  -- NULL for permanent; REQUIRED for temporary
  reason            TEXT
  createdBy         UUID  -- HR userId who created the binding
  createdAt         TIMESTAMPTZ
  endedAt?          TIMESTAMPTZ  -- set when manually ended early or cron-closed
  endedReason?      TEXT
```

One table, two features. Permanent portfolio rows have `actingForUserId IS NULL` and `effectiveUntil IS NULL`. Temporary coverage rows have both NOT NULL. UI distinguishes the two by checking `actingForUserId`. P1.5 lands this table — see `/Users/thotaakshay/.claude/plans/tranquil-crunching-plum.md` Phasing section.

### §7.i `actingForUserId` placement — **binding-only**

`DWI`, `Visit`, and other domain rows record only `supervisorId`. The `actingForUserId` context lives **on the binding row only**. Audit reconstructs "original supervisor was Y; acting supervisor is X" via JOIN against the binding active at the relevant moment.

Rejected alternative (i.b — also on downstream rows): would have added a redundant `actingForOriginalSupervisorId` column on every domain table and required every writer to keep it in sync with the binding. Tradeoff accepted: Activity-tab render needs one JOIN against the (tiny, indexed) binding table — cheap at launch volumes.

### §7.ii Routing computation — **read-time computation**

`DWI.supervisorId` is **immutable** after row creation — it records the supervisor at decision-creation time (origin attribution per §4). Today / Decisions queries determine "who currently sees this open `PROPOSED` row" by JOINing against the binding table at read time. On binding change, no DWI row is updated; routing shifts automatically because the binding-lookup returns a different supervisor.

Rejected alternative (ii.b — write-at-creation + sweep-on-change): would have made `DWI.supervisorId` mutable and required a cron + tx-on-binding-change sweep to update `PROPOSED` rows for affected sites. Tradeoff accepted: zero sweep complexity, no race conditions on binding switches, origin naturally preserved in `DWI.supervisorId`. Read-side cost is one indexed JOIN per Today / Decisions query.

### §7.x Rejected schema alternatives (for traceability)

These were on the table during the design pass and are explicitly **not chosen**. Listed so the reasoning is recoverable.

| Alternative                                                                       | Why considered                                                                                      | Why rejected                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Option B — two separate tables** (`SitePortfolio` + `ActingSupervisorWindow`)   | Cleanest semantic separation; each table models exactly one feature.                                | Doubles the table count for the same conceptual entity; every routing query needs a JOIN across both tables with explicit "most-specific active window beats baseline portfolio" logic. Implementation overhead outweighs the semantic-clarity gain at launch scale. |
| **Option C — single binding + supersession chain** (`supersededById` linked list) | History naturally embedded; reversal / audit semantically clean and replay-able.                    | Every "who currently owns site X?" query has to walk the chain or maintain a denormalized `currentBindingId` per site. Query complexity outweighs the audit elegance for our launch needs; standard binding history is sufficient via `endedAt` + `endedReason`.     |
| **i.b — `actingForUserId` on downstream rows too**                                | Activity tab could render attribution without a JOIN.                                               | Forces every writer to maintain a sync invariant across two columns; small JOIN cost is preferable to the discipline burden.                                                                                                                                         |
| **ii.b — write-at-creation + sweep-on-change**                                    | Flat queries (no JOIN); mirrors current Phase B route patterns that scope by static `supervisorId`. | Adds cron sweep jobs, race conditions on concurrent writers, and forces either a redundant `originalSupervisorId` column or AuditEvent reconstruction for origin attribution. Operational risk outweighs the query-flatness gain.                                    |

## §8 What existing specs must change after this doc lands

Listed for traceability. **Not updated by this doc** — each spec gets its own update commit after this responsibility model reaches Active.

| Spec                                                                           | Required change                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2026-05-12-decision-entity-lock.md` (D.1)                                     | §2.5 writers — `supervisorId` is stamped at row creation from the active binding (origin attribution; immutable). Current-responsibility routing for open `PROPOSED` rows is read-time JOIN against `SiteSupervisorBinding`; no mutation, no sweep. `actingForUserId` lives on the binding row only — no column added to DWI. Soft cross-ref landed in this commit batch under D.1 §2.5. |
| `2026-05-12-supervisor-mobile-r6-design.md` (R6)                               | §6 founder-locked decisions — the 2026-05-08 backup-supervisor entry replaced by a reference to this doc. New HR control-plane surface (admin-web; possibly mobile-secondary) added in a future R-version.                                                                                                                                                                               |
| `2026-05-12-hr-updates-spec.md`                                                | §4.1 audience model unchanged at launch; add a forward-pointer noting per-site routing becomes possible once the binding exists.                                                                                                                                                                                                                                                         |
| `2026-05-13-product-framing.md`                                                | §17 — two new implementation rules: (a) **origin attribution** is written at row creation and is immutable; (b) **current responsibility routing** is read-time JOIN against `SiteSupervisorBinding`. §18 — new anti-pattern: "Account sharing as an absence workaround." Soft cross-ref landed in this commit batch at end of §17.                                                      |
| `connectedness/features/`                                                      | New manifest or extension to an existing one (probably `assignments.yml` or a new `responsibility.yml`) to claim the binding table once schema lands.                                                                                                                                                                                                                                    |
| P1 schema plan (`/Users/thotaakshay/.claude/plans/tranquil-crunching-plum.md`) | **Resolved 2026-05-14:** P1 stays narrow (current 4 tables + AuditEvent.targetType). `SiteSupervisorBinding` + bootstrap-seed migration lands as **P1.5 prerequisite** between P1 and P2 routes. Plan doc updated in this same commit batch with the explicit P1 → P1.5 → P2 phasing.                                                                                                    |

## §9 Resolved picks (locked 2026-05-14)

All 9 founder picks below are **locked**. They drive P1.5 schema design and downstream feature behavior.

| #   | Question                                                    | **Locked pick**                                                                        | One-line rationale                                                                                                                                   |
| --- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Schema option (A / B / C)?                                  | **A — single binding table with `actingForUserId` discriminator**                      | Simplest single-table model; both features share one query; smallest migration footprint.                                                            |
| 2   | `actingForUserId` placement (i.a / i.b)?                    | **i.a — binding-only**                                                                 | Single source of truth for "original vs acting"; keeps DWI / Visit / etc. tables clean.                                                              |
| 3   | Routing computation (ii.a / ii.b)?                          | **ii.a — read-time computation**                                                       | Zero sweep complexity, race-condition-free, naturally preserves origin in `DWI.supervisorId`.                                                        |
| 4   | HR control plane surface?                                   | **admin-web only at launch**                                                           | Matches the HR-portal-future surface in HR Updates spec §2.1; covers the urgent sick-supervisor case.                                                |
| 5   | Acting-supervisor window start/end notifications?           | **yes — push on both start and end**                                                   | Operational awareness — acting supervisor must know "you're on point" and "you're off."                                                              |
| 6   | Default `effectiveUntil` for "supervisor sick today" cases? | **no default — HR specifies per-row**                                                  | Sickness duration varies wildly; encoding a default becomes wrong policy.                                                                            |
| 7   | Per-supervisor portfolio cap?                               | **visibility-only at launch**                                                          | Hard caps encode brittle policy; HR judgment with capacity context (current site count + recent decision volume) is more flexible.                   |
| 8   | Migration backfill?                                         | **bootstrap seed from current active `Assignment` rows, then HR reviews and corrects** | Launch-day empty Today / Decisions is too risky and looks broken; HR reviews and adjusts the inferred seed rather than treating it as perfect truth. |
| 9   | Explicit `Worker.primarySiteId` field?                      | **no — implicit derivation at launch**                                                 | Avoids redundant denormalization until query-cost evidence demands it; single-site workers are the common case.                                      |

### Operational note for pick 8 — bootstrap seed mechanism

The P1.5 migration that creates `SiteSupervisorBinding` ships with a one-time seed step:

- For each currently-active `Assignment` row, infer `(siteId, supervisorUserId)` and insert a permanent-portfolio binding (`actingForUserId = NULL`, `effectiveFrom = now`, `effectiveUntil = NULL`).
- Where multiple supervisors have active assignments touching the same site, pick the supervisor with the most recent `Assignment.createdAt` for that site as the inferred portfolio owner.
- Mark the seeded rows with `reason = 'BOOTSTRAP_SEED — pending HR review'` so HR knows to verify them.
- Admin-web HR portfolio view surfaces the bootstrapped rows with a "review and confirm" affordance; HR clicks through each to confirm or reassign.

Detailed migration script + admin-web seed-review UX land with P1.5 implementation.

## §10 What this doc does NOT do

- Does NOT design the HR control-plane admin-web UI (separate R-version pass after this model is Active — pick 4 confirms admin-web only; the UI shape itself is deferred).
- Does NOT write the bootstrap-seed migration script or the admin-web seed-review affordance (pick 8 confirms the mechanism; the SQL + UI land with P1.5 implementation).
- Does NOT update R6 / HR Updates beyond noting the required changes in §8 (each gets its own update commit in their next revision).
- Does NOT touch `connectedness/` manifests (separate update after the binding schema lands in P1.5).
- Does NOT save memory or process-discipline updates (per founder instruction 2026-05-14 — process meta changes deferred until after this doc reaches Active **and** P1+P1.5 ship).
- Does NOT introduce account-sharing in any form — replaced in-context per §6.

Soft cross-references into D.1 §2.5 and product framing §17 **do** land in this same commit batch (per §8).

## §11 Approval gate — CLOSED 2026-05-14

All gate conditions met (see §1 status block). Doc is **Active but contract-incomplete**.

Standing rules (now binding, not pending):

- No account sharing as an absence workaround — replaced by HR-managed acting windows.
- No supervisor-app self-service delegation — HR is the control plane.
- New HR control-plane code lands at admin-web only (per pick 4).
- Any future spec / R-version / migration that touches supervisor routing must consult this model.

## §12 Cross-references

- 2026-05-08 founder-lock — replaced by §6 of this doc.
- D.1 Decision entity lock: `docs/specs/2026-05-12-decision-entity-lock.md`.
- R6 supervisor mobile design: `docs/specs/2026-05-12-supervisor-mobile-r6-design.md`.
- HR Updates spec: `docs/specs/2026-05-12-hr-updates-spec.md`.
- Product framing: `docs/specs/2026-05-13-product-framing.md`.
- P1 schema migration plan: `/Users/thotaakshay/.claude/plans/tranquil-crunching-plum.md`.
- Doc discipline protocol: `docs/protocols/doc-discipline.md`.
- Canonical index: `docs/index/canonical-truth.md`.
- Multi-tenant invariant: `docs/invariants/multi-tenant.md`.

---

## 2026-05-15 Update — Workflow Design Closure cross-reference

The deferred items listed in §10 of this spec are now answered by `docs/specs/2026-05-15-workflow-design-closure.md` (Active but contract-incomplete; promoted 2026-05-15). Specifically:

- **HR control-plane admin-web UI design** → closure spec §5.3 (11 HR surfaces).
- **Bootstrap-seed migration script + admin-web seed-review affordance** → closure spec Decision 6 + §5.3.7 (bootstrap-seed review UI) + §5.3.8 (audit-chain reconstruction).
- **"While you were out" digest UX** → closure spec §5.2.6 + §3.5 (Digest entity).
- **Cross-reference propagation into R6 / HR Updates / D.1 / product framing** → landed in this same 2026-05-15 promotion commit.

Plus the HR pod model (closure §4) gives the operational coordination layer over the `SiteSupervisorBinding` table this spec locks. The HR-absent fallback (closure Decision 2 / G-1) closes one of the ops §12 open questions referenced here.
