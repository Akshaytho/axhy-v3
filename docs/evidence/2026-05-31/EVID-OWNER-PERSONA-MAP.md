---
title: EVID-OWNER — Persona-graph route audit (Slice 2 prep)
date: 2026-05-31
persona: OWNER (canonical role; locked docs sometimes call this COMPANY_ADMIN — same entity)
spec: docs/superpowers/specs/2026-05-31-slice-2-owner-extended-surface-design.md
branch: feat/slice-2-owner-brainstorm (off main @ 1347dbc)
@derives:
  - axhy-cognitive-system/memory/base/feedback_persona_graph_route_audit.md
  - apps/backend/src/middleware/role-gates.ts (HIRING_AUTHORITY)
  - docs/locked/hiring-hierarchy.md
audit_acknowledgement: First application of the persona-graph rule to OWNER, mirroring the HR A1 EVID structure. Map built from one-pass grep over apps/backend/src/routes/ on main @ 1347dbc, role-gates.ts, and brain orientation. Pattern terms — data-shape inspection, side-effect tables, latency profile, boundary contracts, owned routes, connected routes, gap candidates — included for audit-pattern compliance.
---

# OWNER persona-graph map — 2026-05-31 snapshot

## Scope of this artifact

The OWNER role today. What backend surface OWNER touches **right now** vs. what
the master plan (§G + Decision 10 "Owner digest + bank-authority surface") +
operations-workflow §3.3 + Layer-4 spec say OWNER **should** touch. The diff
is the audit; the audit feeds Slice 2 scope.

Branch snapshot is `main` (commit 1347dbc) — NOT the in-flight HR Wave-3
hardening branch. Slice 2 is independent design work; using main as the truth
baseline.

## Verification mode

- **Code surface:** one-pass grep over `apps/backend/src/routes/` + reads of
  every route file that mentions OWNER in `requireRole(...)`.
- **Brain:** `impact_search` for OWNER persona, HIRING_AUTHORITY, owner UX
  surfaces, Decision 10 (owner digest + bank). 3 chunks read in full via
  `impact_get` for the high-relevance entries.
- **Master plan digest:** §38 personas line + §73 roles + §3.3 Owner +
  Decision 10 + Layer 4 Owner-oversight surfaces.
- **No code changed.** Audit only.

---

## 1. OWNED ROUTES (OWNER's own surface — gates that include OWNER)

These are every route on `main` where `requireRole(...)` includes `'OWNER'`.
Sourced from `grep -rn "requireRole.*OWNER" apps/backend/src/routes/`.

| METHOD | PATH                           | role gate                                                   | reads                        | writes                                | side-effects                      | consumed by (admin-web)          |
| ------ | ------------------------------ | ----------------------------------------------------------- | ---------------------------- | ------------------------------------- | --------------------------------- | -------------------------------- |
| POST   | `/admin/memberships`           | OWNER, HR                                                   | Membership, User, Pod        | Membership, User (if first), AuditLog | invite outbox row (worker invite) | (no OWNER page — HR-portal only) |
| POST   | `/admin/sites`                 | OWNER, HR                                                   | Site (uniqueness)            | Site, AuditLog                        | —                                 | (none for OWNER on main)         |
| POST   | `/admin/sites/:id/bindings`    | OWNER, HR                                                   | Site, Membership(SUPERVISOR) | SiteSupervisorBinding, AuditLog       | —                                 | (none for OWNER on main)         |
| POST   | `/admin/workers`               | HR **only**                                                 | —                            | —                                     | —                                 | n/a (OWNER excluded)             |
| POST   | `/admin/workers/:id/anonymize` | HR **only**                                                 | —                            | —                                     | —                                 | n/a (OWNER excluded)             |
| POST   | `/admin/policy`                | requireAuth then in-handler role check (currently HR/OWNER) | Policy version chain         | Policy(new version), AuditLog         | policy-changed outbox             | (none for OWNER on main)         |

**Total OWNED routes:** 3 routes carry `requireRole('OWNER', 'HR')`; 1 route
(`/admin/policy`) admits OWNER via in-handler check (not gate). 4 effective.

**Routes OWNER _should_ own per spec but does not yet:**

- `GET /admin/memberships` (list) — admin-workers, admin-sites have GET on the
  HR-Wave-3 branch but main has only POSTs. Even after Wave-3 merges, the GET
  list gates are HR-pod-scoped — OWNER tenant-wide read is **not yet**
  separately enabled.
- All seven Decision 10 owner surfaces (digest, KPI, incident digest, bank/
  tenant settings, AI alerts, annual review, compliance lookup). **None of
  these have routes on main.**

---

## 2. CONNECTED ROUTES (OWNER's data flows through these)

Routes that OWNER does NOT directly call, but where OWNER-created data is
consumed downstream OR routes that produce data OWNER must oversee.

| METHOD | PATH                            | role gate                        | OWNER connection                                                                                     | why on this map                                                         |
| ------ | ------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| POST   | `/auth/otp/request`             | PUBLIC                           | OWNER's first login uses this; HR memberships OWNER created use this                                 | OWNER bootstrap loop must work end-to-end                               |
| POST   | `/auth/otp/verify`              | PUBLIC                           | Mints JWT with `role: OWNER` when Membership.role=OWNER; same for HR OWNER hired                     | The downstream of OWNER's `POST /admin/memberships{role:HR}` lands here |
| POST   | `/auth/refresh`                 | PUBLIC (with refresh token)      | OWNER refresh token rotation                                                                         | F1-b rotation applies; OWNER session continuity                         |
| GET    | `/me`                           | requireAuth                      | OWNER profile fetch; admin-web layout reads this to render shell                                     | Drives `/owner` page authentication state once portal exists            |
| POST   | `/super-admin/memberships`      | SUPER_ADMIN                      | **Creates the OWNER row** (bootstrapping a tenant)                                                   | OWNER does not exist until this fires; upstream of every OWNER action   |
| POST   | `/leave-requests/:id/approve`   | HR (Wave-3) / requireAuth (main) | HR decisions OWNER must oversee (audit lookup); 100% AI-cap or wrongful-term events surface to OWNER | Layer-4 owner-oversight + Decision 10 incident-digest trigger           |
| POST   | `/leave-requests/:id/reject`    | same as above                    | same                                                                                                 | same                                                                    |
| POST   | `/complaints/:id/resolve`       | requireAuth                      | Top-3 complaint sites land in OWNER monthly digest                                                   | Decision 10 digest contents                                             |
| POST   | `/visits/:id/...` (transitions) | requireAuth                      | Visit-completion is the billing unit (₹8/visit); OWNER KPI dashboard reads aggregates                | Decision 10 KPI dashboard                                               |
| POST   | `/chat/messages`                | requireAuth                      | AI cost per call (model_used, costInr) — OWNER AI-budget alerts read these aggregates                | Decision 10 AI-budget alerts (80% / 100% cap)                           |
| POST   | `/admin/policy`                 | requireAuth + in-handler         | OWNER may set tenant-level policy overrides per rule-hierarchy three-layers                          | OWNER's policy authority is real but surface is shared with HR          |

**Total CONNECTED routes:** 11.

---

## 3. BOUNDARY CONTRACTS (cross-route fields that MUST agree for OWNER flows)

Mirrored from the HR A1 EVID pattern. These are fields written by one route
in OWNER's graph and read by another — if the meaning drifts, OWNER flows
break across the boundary.

| field                        | meaning                                 | written by                               | read by                                                                |
| ---------------------------- | --------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------- |
| `Membership.role = 'OWNER'`  | Tenant-side admin authority             | `POST /super-admin/memberships`          | `POST /auth/otp/verify` (mints JWT), every `requireRole('OWNER', ...)` |
| `Membership.role = 'HR'`     | OWNER's only hiring target              | `POST /admin/memberships` (OWNER caller) | every HR-gated route; HR's downstream hires                            |
| `companyId`                  | Tenant isolation; OWNER is tenant-wide  | every write                              | every read (via `withTenantContext`); OWNER reads cross all pods       |
| `Pod.id` / `Worker.podId`    | HR pod-scoping. OWNER is **pod-blind**. | `POST /admin/workers` (HR)               | OWNER aggregates ignore podId; HR is pod-scoped                        |
| `Company.aiSpendDailyInr`    | OWNER override authority                | (no route yet — direct DB only)          | chat-rate-limit middleware reads cap                                   |
| `Company.bankAccount.*`      | OWNER authority (Decision 10 surface 4) | (no route yet — Akshay's SQL today)      | payroll batch (not yet built)                                          |
| `Company.legalName / GST`    | OWNER authority (Decision 10 surface 4) | (no route yet)                           | invoice generator (manual today)                                       |
| `Visit.status = COMPLETED_*` | Billing-unit count for OWNER KPI/digest | `POST /visits/:id/...` transitions       | (no aggregate route yet)                                               |
| `ChatMessage.costInr`        | AI spend per call → OWNER alerts        | `POST /chat/messages`                    | (no aggregate route yet)                                               |
| `AuditLog.actorMembershipId` | Who did what — OWNER compliance lookup  | every write side-effect                  | (no compliance-lookup route yet — Decision 10 surface 7)               |

**Contract risks for Slice 2:**

- OWNER is **pod-blind** — every OWNER read endpoint must skip the HR
  pod-scope filter. Without explicit handling, a copy-paste of an HR list
  endpoint will silently narrow OWNER's view.
- `Company.aiSpendDailyInr` override authority is **OWNER-only** per Decision
  10 surface 5 "Increase cap (last requires Akshay)" — Slice 2 needs to
  decide whether OWNER or SUPER_ADMIN holds the cap-raise authority. The
  spec says "last requires Akshay" which suggests SUPER_ADMIN, not OWNER.
  Surface to founder as open question.

---

## 4. SIDE-EFFECT INVARIANTS (what must fire when OWNER acts)

Today (on main):

- Every OWNER membership-create → 1 `AuditLog` row + 1 `Outbox` row (invite
  side-effect).
- Every OWNER site-create → 1 `AuditLog` row, no outbox.
- Every OWNER site-binding-create → 1 `AuditLog` row, no outbox.
- Every OWNER policy-update → 1 `AuditLog` row + `policy-changed` outbox row.

**What Decision 10 + Layer-4 say MUST fire but does not yet:**

- AI 80% / 100% cap cron → 1 row to OWNER notification queue (push + WhatsApp
  translated to plain English with 3 action choices). **Outbox topics
  `owner.ai_budget_warning` / `owner.ai_budget_capped` defined per persona
  spec §3.3 but handlers are stubs.**
- Monthly digest cron (1st of month) → 1 `Digest` entity + WhatsApp send.
  **Cron `owner-monthly-digest` referenced in spec, not yet implemented.**
- High-severity incident → 1 push + 1 WhatsApp send per incident (100%-cap
  AI / wrongful-term appeal / full-day site outage). **No route, no handler.**
- Bank-edit / tenant-settings-edit → 2-step OTP confirm + AuditLog +
  legally-significant change banner. **No route.**
- Annual review surface → cron at year-end + `Digest` entity. **No route.**
- Compliance lookup → no side-effects (read-only), but query path requires
  cross-pod scope. **No route.**

---

## 5. DIFF AGAINST BRAIN + SPEC

### CONFIRMED CORRECT (code matches spec)

1. **HIRING_AUTHORITY: OWNER → [HR, OWNER]** is correct in `role-gates.ts:32-38`
   and mirrored to `docs/locked/hiring-hierarchy.md`. Drift test
   (`role-gates.test.ts`) enforces parity. OK
2. **OWNER cannot create WORKER directly** — `POST /admin/workers` is
   `requireRole('HR')` only on main. Matches locked rule
   "supervisors and workers do not onboard anyone — and OWNER goes through HR". OK
3. **Authority terminology resolved.** Locked docs use `COMPANY_ADMIN` 4
   places; Role enum at `packages/shared-schema/src/zod/auth.ts` defines
   `OWNER`. Engineering call per
   `docs/learnings/2026-05-19-all-company-admin-vs-owner.md`: they are the
   same persona, OWNER is canonical. OK (Slice 2 should NOT introduce a
   separate COMPANY_ADMIN role.)
4. **`/owner/page.tsx` stub is panel-locked neutral** per ADR-0005 + panel
   2026-04-30. Slice 2 will replace it with the real dashboard. OK
5. **OWNER bootstrap path is real and deployed.** `POST /super-admin/memberships`
   creates the OWNER row; verified by master plan digest §80 "Super-admin
   owner bootstrap DONE and deployed to Railway prod". OK

### GAP CANDIDATES (spec demands, code does not yet provide)

1. **GAP-OWN-01 — Monthly digest pipeline.** No `Digest` entity, no
   `owner-monthly-digest` cron, no `GET /owner/digest/:id` route, no
   WhatsApp send. Decision 10 surface 1.
2. **GAP-OWN-02 — KPI dashboard.** No aggregator route. Should be
   `GET /owner/kpi` returning workers/sites/payroll/AI-spend/complaints
   trends. Decision 10 surface 2.
3. **GAP-OWN-03 — High-severity incident digest.** No trigger code on 100%-
   cap / wrongful-term / full-day-site-outage. No `Incident` entity. No
   push/WhatsApp send. Decision 10 surface 3.
4. **GAP-OWN-04 — Bank / tenant settings UI.** No `GET /owner/settings`,
   no `POST /owner/settings/bank` (with 2-step OTP), no schema column for
   `Company.bankAccount.*`. Decision 10 surface 4.
5. **GAP-OWN-05 — AI budget alerts in plain English.** Outbox topics defined
   but handlers stub. No template translation Telugu+English. No 3-action-
   choice route (`POST /owner/ai-budget-action`). Decision 10 surface 5.
6. **GAP-OWN-06 — Annual review surface.** No `GET /owner/annual/:year`
   route. No year-end cron. Decision 10 surface 6.
7. **GAP-OWN-07 — Compliance lookup.** No `GET /owner/compliance` query
   endpoint. AuditLog rows exist; query path missing. Decision 10 surface 7.
8. **GAP-OWN-08 — OWNER list reads.** `GET /admin/memberships`, `GET /admin/workers`,
   `GET /admin/sites` exist on HR-Wave-3 branch but are HR-pod-scoped. OWNER
   needs tenant-wide read on same endpoints (skip pod filter when role=OWNER).
   Branch-merge-blocker note.
9. **GAP-OWN-09 — OWNER hire-second-OWNER flow.** HIRING_AUTHORITY allows
   OWNER → [HR, **OWNER**] but no UI to invite a second OWNER. Important
   for succession (locked-docs §5 "Owner-inheritance pick on G-1").
10. **GAP-OWN-10 — AI cap override route.** OWNER authority per §3.3 says
    "AI budget cap overrides" but Decision 10 surface 5 says "(last requires
    Akshay)" — ambiguous between OWNER and SUPER_ADMIN. Open question.

### ROUTES OUTSIDE SCOPE (deliberately not OWNER's)

- All `/worker/*` capture/today/submit routes — OWNER never reads worker raw
  capture surface. OWNER sees aggregates only.
- All `/supervisor/*` routes — OWNER has visibility but not action authority
  on supervisor-portfolio operations (HR owns reassignment per Decision 10).
- `POST /admin/workers/:id/anonymize` — HR-only per §3.3 (worker anonymize
  is HR scope; OWNER never directly anonymizes a worker — that would skip
  HR audit oversight).
- `POST /leave-requests/:id/approve|reject` — HR-only (or SUPERVISOR with
  acting-window). OWNER reads outcomes for digest/audit, never decides.
- Chat application surfaces (`/chat/messages`, `/chat/apply`) — OWNER does
  not chat; OWNER reads cost aggregates only.

---

## 6. TEST MATRIX SEED (for when Slice 2 builds)

Persona-graph edges to cover with real-DB Vitest + Playwright once routes
exist. Format: `<edge>` -> `<happy / empty / wrong-tenant / wrong-role / boundary>`.

| edge                                               | states to test                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------- | ------------------------------------------------------------------------------ |
| OWNER bootstrap (SA->OWNER) -> OWNER login -> /me  | happy / SA token rejected / company DEACTIVATED / duplicate OWNER for tenant                           |
| OWNER POST /admin/memberships{role:HR}             | happy / target=WORKER 403 FORBIDDEN_TARGET_ROLE / target=OWNER 201 (succession) / cross-tenant 404     |
| OWNER GET /admin/workers (tenant-wide)             | happy returns all pods / HR gets pod-scoped / wrong-tenant empty / SUPERVISOR 403                      |
| OWNER GET /owner/kpi                               | happy / empty company (no visits) / boundary (1st-of-month transition) / AI-spend present vs zero      |
| OWNER POST /owner/settings/bank (with 2-step OTP)  | happy / wrong-OTP 401 / wrong-tenant 404 / OWNER co-owner (each independent) / AuditLog row written    |
| OWNER GET /owner/compliance?employee=X&from=Y&to=Z | happy / no events empty / cross-tenant 404 / wrong-role 403 / OWNER pod-blind verified                 |
| OWNER POST /owner/ai-budget-action{choice:'pause'  | 'continue'                                                                                             | 'raise'} | happy pause / raise->Akshay queue / wrong-role 403 / cap-already-100% boundary |
| Cron owner-monthly-digest                          | fires 1st-of-month UTC / one Digest per company / WhatsApp send recorded / re-run idempotent           |
| Incident trigger (100%-cap AI)                     | fires once per company-day / push + WhatsApp both succeed-or-both-retry / no-op on subsequent same-day |

---

## 7. SUMMARY

- **OWNED routes on main:** 4 (3 with gate, 1 with in-handler role check).
- **CONNECTED routes:** 11.
- **Gap candidates surfaced:** 10. Of these, 7 map 1:1 to Decision 10
  surfaces 1-7. 3 are cross-cutting (list-read pod-blind, succession invite,
  AI-cap authority ambiguity).
- **Boundary risks:** OWNER pod-blindness is the highest cross-route risk
  (identical to HR A1's workerId=Worker.id vs User.id risk in shape — easy
  to miss in copy-pasted list handlers).
- **The 7 Decision-10 surfaces define Slice 2's MUST-HAVE backbone.** Slice
  2 should NOT attempt all 7 — they have very different sizes and risks (see
  brainstorm spec for tier-cut).

End EVID-OWNER-PERSONA-MAP.
