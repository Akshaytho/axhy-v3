---
title: EVID-SUPER-ADMIN — Persona-graph route audit (Slice 3 prep)
date: 2026-05-31
persona: SUPER_ADMIN (platform-level founder role; Akshay himself + future Axhy team)
spec: docs/superpowers/specs/2026-05-31-slice-3-super-admin-surface-design.md
branch: feat/slice-3-super-admin-brainstorm (off main HEAD at audit time)
@derives:
  - axhy-cognitive-system/memory/base/feedback_persona_graph_route_audit.md
  - apps/backend/src/middleware/role-gates.ts (HIRING_AUTHORITY)
  - apps/backend/src/middleware/tenant-context.ts (SUPER_ADMIN trust path)
  - docs/locked/hiring-hierarchy.md
  - docs/invariants/multi-tenant.md "When you're tempted to relax"
audit_acknowledgement: |
  Third application of the persona-graph rule (after HR A1 and OWNER Slice 2),
  applied to SUPER_ADMIN — the platform-level founder role. Unlike OWNER
  (tenant-scoped) and HR (pod-scoped), SUPER_ADMIN is cross-tenant. The audit
  intentionally surfaces the "this persona is mostly unbuilt" finding: today
  the entire SUPER_ADMIN surface is two routes (`POST /super-admin/memberships`
  on the backend + `GET /api/graph` on admin-web) plus two read-only viewer
  pages (`/system/graph`, `/system/map`). Pattern terms — data-shape
  inspection, side-effect tables, latency profile, boundary contracts, owned
  routes, connected routes, gap candidates — included for audit-pattern
  compliance.
---

# SUPER_ADMIN persona-graph map — 2026-05-31 snapshot

## Scope of this artifact

The SUPER_ADMIN role today. What backend + admin-web surface SUPER_ADMIN
touches **right now** vs. what the master plan, `docs/invariants/multi-tenant.md`,
the operations-workflow spec §3.5, locked docs, and the journey-scene
"Aditya debugging Suresh's chat" say SUPER_ADMIN **should** touch. The diff
is the audit; the audit feeds Slice 3 scope.

SUPER_ADMIN is fundamentally different from OWNER (tenant-scoped) and HR
(pod-scoped). It is the **only** role in v3 that is cross-tenant. Every
finding here must be read through that lens. A bug that is "annoying" for
OWNER (`/admin/policy` admits OWNER via in-handler check) is "catastrophic"
for SUPER_ADMIN (any unaudited write to a tenant is a compliance breach the
tenant has zero ability to detect).

Branch snapshot is `main` (current HEAD at audit time — the slice-2
brainstorm sits on top of main but does NOT add any SUPER_ADMIN routes).
Slice 3 is independent design work.

## Verification mode

- **Code surface:** one-pass grep over `apps/backend/src/{routes,middleware,lib}/`
  - `apps/admin-web/app/` for `SUPER_ADMIN`, `is_platform_admin`,
    `tenant-exempt`, `requireRole.*SUPER`. Every hit read in full.
- **Brain:** `impact_search` for SUPER_ADMIN persona, cross-tenant
  observability, debug surface, hiring authority. Top results fetched in
  full via `impact_get` for the four high-relevance entries (3.5 Super-admin
  spec, multi-tenant invariant relaxation rule, HIRING_AUTHORITY locked
  table, ADR-0026 authority mirror).
- **Master plan digest:** §38 personas line + §73 roles + §3.5 Super-admin
  - Decision 6 (bootstrap correction) + the multi-tenant invariants doc.
- **No code changed.** Audit only.

---

## 1. OWNED ROUTES (SUPER_ADMIN's own surface — gates that include SUPER_ADMIN)

These are every route on `main` where the gate admits SUPER_ADMIN. Sourced
from `grep -rn "requireRole.*SUPER_ADMIN\|role === .SUPER_ADMIN."
apps/backend/src/ apps/admin-web/`.

### Backend (Fastify)

| METHOD | PATH                       | role gate                    | reads               | writes                                           | side-effects                                                    | consumed by (admin-web)                                                  |
| ------ | -------------------------- | ---------------------------- | ------------------- | ------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| POST   | `/super-admin/memberships` | `requireRole('SUPER_ADMIN')` | Company (existence) | User (upsert by phone), Membership(OWNER=ACTIVE) | AuditLog `MEMBERSHIP_CREATED` (kind=bootstrappedBy=SUPER_ADMIN) | (no admin-web page on main — calls hand-rolled via `curl`/Railway shell) |

### Admin-web (Next.js App Router API routes + viewer pages)

| METHOD | PATH              | role gate                                                               | reads                                                      | writes | side-effects                     | viewer page                                    |
| ------ | ----------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------- | ------ | -------------------------------- | ---------------------------------------------- |
| GET    | `/api/graph`      | jwtVerify + `claims.role === 'SUPER_ADMIN'` (Vinod DPO lock 2026-05-07) | KnowledgeGraph nodes + edges via `pg.Pool` direct (raw DB) | —      | (no audit log fired — read-only) | `/system/graph` (RawNode/RawEdge debug viewer) |
| GET    | (filesystem JSON) | open page render — but data is build-time bundled, panel-locked         | local JSON snapshot of nodes/edges                         | —      | —                                | `/system/map` (component-detail debug viewer)  |

**Total OWNED routes:** 2 backend + 1 admin-web API + 2 admin-web viewer pages = 5 surfaces total.

**Routes SUPER*ADMIN \_should* own per spec but does not yet:**

- Every operational-tier action that touches data across tenants.
  Operations-workflow §3.5 says "cross-tenant observability, system-level
  admin actions, diagnostic / debugging / ops-tier escalation". On main,
  ONE of those exists (`/api/graph`). The other 14+ implied routes
  (incident lookup, audit trail cross-tenant, hard-delete, company
  lifecycle, billing, key rotation surface, schema-migration trigger, etc.)
  do not.

- Per `docs/invariants/multi-tenant.md` "When you're tempted to relax":
  every cross-tenant read MUST go through a `super_admin_*`-scoped JWT and
  MUST audit-log the access with target tenant ID. Today `GET /api/graph`
  reads cross-tenant from raw pg without an audit row. **This is a known
  invariant relaxation that has shipped.**

---

## 2. CONNECTED ROUTES (SUPER_ADMIN's data flows through these)

Routes that SUPER_ADMIN does NOT directly call, but where SUPER_ADMIN-created
data is consumed downstream OR routes that produce data SUPER_ADMIN must
oversee.

| METHOD | PATH                           | role gate                            | SUPER_ADMIN connection                                                                                                           | why on this map                                                                  |
| ------ | ------------------------------ | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| POST   | `/auth/otp/request`            | PUBLIC                               | Login path for SUPER_ADMIN. No platform-admin special case at request time — same OTP send.                                      | SUPER_ADMIN authentication entry point                                           |
| POST   | `/auth/otp/verify`             | PUBLIC                               | Mints JWT with `role: SUPER_ADMIN` + `isPlatformAdmin: true` claim if `User.is_platform_admin=true` (auth.ts:171)                | Drives SUPER_ADMIN JWT issuance                                                  |
| POST   | `/auth/refresh`                | PUBLIC (refresh token IS credential) | F1-b path: re-reads `User.is_platform_admin`; rotates refresh token; auth-refresh.ts:151-175 has untested null-membershipId path | F1-b QA EVID-LOW finding: SUPER_ADMIN membershipId=null path NOT exercised by QA |
| GET    | `/me`                          | requireAuth                          | SUPER_ADMIN can hit `/me`; returns role + isPlatformAdmin                                                                        | Drives any `/super-admin/*` admin-web page shell                                 |
| POST   | `/admin/policy`                | requireAuth + in-handler ACL         | `policy-write-acl.ts` admits SUPER_ADMIN on every prefix (debug bypass). SUPER_ADMIN can write ANY tenant's policy.              | Highest-risk silent cross-tenant write today. No `companyId` audit required.     |
| (any)  | every `withTenantContext` site | requireAuth + role-specific          | SUPER_ADMIN bypasses `withTenantContext` via `is_platform_admin` (tenant-context.ts:92-110)                                      | Architectural — SUPER_ADMIN reads can hit ANY tenant if a route admits the role  |
| POST   | `/chat/messages`               | requireAuth                          | SUPER_ADMIN scene E-B (journey 2026-05-19) — read Policy/LivingDoc/ChatMessage rows for ANY tenant; cannot SEND as another role  | Implied debug surface; route currently rejects (chat is supervisor-only)         |
| POST   | `/complaints/:id/resolve`      | requireAuth                          | ComplaintAuthorRole.SUPER_ADMIN exists in code (complaints.ts:129 comment) — explicit author-role enum value reserved            | Author-role plumbing in place; no real handler today                             |

**Total CONNECTED routes:** 8.

---

## 3. BOUNDARY CONTRACTS (cross-route fields that MUST agree for SUPER_ADMIN flows)

Mirrored from the OWNER + HR A1 EVID pattern. These are fields written by
one route in SUPER_ADMIN's graph and read by another — if the meaning
drifts, SUPER_ADMIN flows break across the boundary. The risks here are
SYSTEM-WIDE, not tenant-scoped.

| field                                                                     | meaning                                                                                                                                                 | written by                                          | read by                                                                                         |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `User.is_platform_admin = true`                                           | Platform-admin trust source-of-truth. Out-of-band-set (DB direct, no route writes this).                                                                | (no route — direct DB)                              | `auth.ts:171`, `auth-refresh.ts:156,211`, `tenant-context.ts:97`. Three trust sites must agree. |
| `JWT.role = 'SUPER_ADMIN'`                                                | Platform-admin role on token. Companion to `isPlatformAdmin: true` claim.                                                                               | `auth.ts:171` (OTP verify), `auth-refresh.ts:243`   | `requireAuth` strict mode (tenant-context.ts:92), every `requireRole('SUPER_ADMIN')` preHandler |
| `JWT.isPlatformAdmin = true`                                              | Companion trust signal — used as the gate against `User.is_platform_admin` mismatch.                                                                    | `auth.ts:171`, `auth-refresh.ts:243`                | (none yet — defensive only)                                                                     |
| `JWT.companyId` for SUPER_ADMIN                                           | What tenant context does a SUPER_ADMIN token carry? Today: ambiguous — SUPER_ADMIN can still get a JWT with a companyId if they ALSO have a Membership. | `auth.ts` OTP verify (membership picker)            | every cross-tenant decision point                                                               |
| `JWT.membershipId` for SUPER_ADMIN                                        | F1: can be null when SUPER_ADMIN has no active membership.                                                                                              | `auth.ts`, `auth-refresh.ts`                        | refresh-token-store: special `revokeForCompromise` path with no epoch bump                      |
| `Membership.role = 'OWNER'` (post-bootstrap)                              | OWNER row created by SUPER_ADMIN seeding a tenant                                                                                                       | `POST /super-admin/memberships` -> service          | every OWNER-gated route downstream                                                              |
| `AuditLog.kind = 'MEMBERSHIP_CREATED'` w/ `bootstrappedBy: 'SUPER_ADMIN'` | Bootstrap provenance — distinguishes platform-bootstrap from in-tenant hire                                                                             | `superAdminCreateOwnerService` (~service.ts:88-100) | (no compliance lookup route today — only DB-direct queries)                                     |
| KnowledgeGraph node `metadata.personal: true`                             | Personal-field marker for `/api/graph` strip-unless-`?includePersonal=1`                                                                                | knowledge-graph build pipeline                      | `/api/graph` route filter (admin-web app/api/graph/route.ts)                                    |
| `policy-write-acl.PREFIX_ACL` includes SUPER_ADMIN                        | Platform-debug bypass on every restricted policy key                                                                                                    | `policy-write-acl.ts:38-40`                         | `POST /admin/policy` handler                                                                    |
| `RoleSchema.enum.SUPER_ADMIN`                                             | Zod-encoded enum value. Drift between code constant and DB enum is a strict-mode auth failure.                                                          | `packages/shared-schema/src/zod/auth.ts`            | every JWT issuance + verification site                                                          |

**Contract risks for Slice 3:**

- **Three-site trust agreement.** `User.is_platform_admin` is read at
  THREE places (auth.ts, auth-refresh.ts, tenant-context.ts). All three
  must agree. Today they do, but any new SUPER_ADMIN-gated route MUST go
  through `requireAuth` strict path — never short-circuit on `claims.role
=== 'SUPER_ADMIN'` alone. (The `/api/graph` Next.js route does its OWN
  jwtVerify and DOES short-circuit on role only — see GAP-SA-08 below.)

- **companyId-on-SUPER_ADMIN-JWT ambiguity.** Today an Akshay-with-Membership
  gets a JWT with companyId set to that membership's tenant. Routes that
  read `req.auth.companyId` will silently see ONE tenant for a
  cross-tenant operator. This is fine for current code (only `/super-admin/
memberships` is gated and it takes companyId from BODY) but is a
  Slice-3 trap when adding new routes.

- **policy-write-acl bypass is unaudited.** SUPER_ADMIN can write ANY
  policy key in ANY tenant via `POST /admin/policy` and there is NO
  AuditLog `actorRole` distinction — the row looks identical to an
  OWNER edit. Compliance breach risk on a per-tenant basis.

- **`/api/graph` does not audit reads.** Per `docs/invariants/multi-tenant.md`
  rule #3 "Audit-log every super-admin access with target tenant ID" —
  this is a documented invariant violation. Slice 3 must decide
  whether to fix in-scope or to leave as "platform-trust" carve-out.

---

## 4. SIDE-EFFECT INVARIANTS (what must fire when SUPER_ADMIN acts)

Today (on main):

- SUPER_ADMIN `POST /super-admin/memberships` -> 1 `AuditLog` row
  (`MEMBERSHIP_CREATED`, payload includes `bootstrappedBy: 'SUPER_ADMIN'`,
  targetRole: 'OWNER'). No outbox row (no invite SMS for OWNER bootstrap —
  Akshay calls them by hand). OK
- SUPER_ADMIN `GET /api/graph` -> **NO AuditLog row, NO access record.**
  Per invariant doc this is a VIOLATION. Documented but unfixed.
- SUPER_ADMIN refresh -> 1 RefreshToken family row, 1 revoke if rotation,
  no epoch bump (SUPER_ADMIN has no membership to bump). OK
- SUPER_ADMIN `POST /admin/policy` if invoked -> 1 `AuditLog` row with
  `actorMembershipId` = (likely) the SUPER_ADMIN's OWN tenant membership
  if they have one, OR null. This is a MISLEADING audit row — the row
  lives in the TARGET tenant but the actor membership lives in (possibly)
  a different tenant. Per-tenant compliance auditors cannot trace this.

**What spec + invariant doc say MUST fire but does not yet:**

- Every cross-tenant read (graph, audit lookup, debug query) -> 1
  `SuperAdminAccessLog` row with `(actor_user_id, target_company_id, route,
intent_reason)` per `docs/invariants/multi-tenant.md` rule #3. **No
  `SuperAdminAccessLog` table exists in schema.prisma.**
- Every SUPER_ADMIN write to a tenant's data -> 1 `AuditLog` row in the
  TARGET tenant with `actorRole='SUPER_ADMIN'` + `actorUserId` (not
  membershipId — SUPER_ADMIN may have no membership in that tenant). **The
  AuditLog schema does not distinguish; today actorMembershipId is null
  for SUPER_ADMIN writes, but the schema does not enforce the absence-
  vs-presence semantics.**
- Hard-delete authorization (per locked invariants "Hard-delete is
  SUPER_ADMIN only") -> no `/super-admin/hard-delete/:tenant/:type/:id`
  route exists. Cannot exercise this authority through the product.
- Tenant lifecycle (create / pause / reactivate / off-board) -> no
  routes. Companies exist by direct DB INSERT today (per master plan §80
  - journey-spec QA Test Co).
- Key rotation prompt surface -> the project memory says "key rotation
  deferred / user-owned / pre-release" — no route, no surface, intentional.
- Cross-tenant chat/policy DEBUG read (scene E-B) -> no route. SUPER_ADMIN
  cannot view a tenant's Policy/LivingDoc/ChatMessage rows via the product.

---

## 5. DIFF AGAINST BRAIN + SPEC

### CONFIRMED CORRECT (code matches spec)

1. **HIRING_AUTHORITY: SUPER_ADMIN -> [OWNER]** is correct in
   `role-gates.ts:33` and mirrored to `docs/locked/hiring-hierarchy.md`
   line 25. The drift test (`role-gates.test.ts`) parses the locked doc
   and would fail the build on disagreement. OK
2. **SUPER_ADMIN bootstrap path is real and deployed.** `POST
/super-admin/memberships` exists, is registered (server.ts:188),
   gated by `requireRole('SUPER_ADMIN')`, marked `tenant-exempt` with
   inline justification. Calls `assertTargetRole('SUPER_ADMIN', 'OWNER')`
   so HIRING_AUTHORITY drift fails closed. OK
3. **F1 trust model for SUPER_ADMIN.** `tenant-context.ts:92-110` —
   strict-mode SUPER_ADMIN requires `User.is_platform_admin=true` against
   the DB, not just JWT-trust. Three sites agree. OK
4. **The defensive error message at `super-admin-memberships.ts:54`**
   ("SUPER_ADMIN is no longer permitted to create OWNER per
   HIRING_AUTHORITY") is **defensive code, not current behaviour**. It
   would fire only if HIRING_AUTHORITY ever drops OWNER from
   SUPER_ADMIN. Current state allows it. OK (this is what an audit
   should catch and explicitly note as "not a stale message" —
   the assertion in the service guarantees the message text matches
   reality if HIRING_AUTHORITY changes.)
5. **`/api/graph` SUPER_ADMIN gate is real and panel-locked** (Vinod
   DPO lock 2026-05-07, SPEC.md §7.5). Personal-field stripping is
   guarded. OK

### GAP CANDIDATES (spec demands, code does not yet provide)

1. **GAP-SA-01 — Cross-tenant audit lookup.** No `GET
/super-admin/audit?tenant=&from=&to=&actor=` route. Decision 6
   "audit-chain reconstruction" relies on direct DB queries today.
2. **GAP-SA-02 — Cross-tenant compliance read of Policy / LivingDoc /
   ChatMessage** (journey scene E-B — Aditya debugging Suresh's chat).
   No `GET /super-admin/tenants/:companyId/chat-debug` route. Cannot
   debug a tenant's chat behaviour through the product.
3. **GAP-SA-03 — Tenant lifecycle routes.** No `POST /super-admin/companies`
   (deliberately deferred per spec "Out of scope" — QA Test Co exists),
   no `POST /super-admin/companies/:id/pause`, no `POST
/super-admin/companies/:id/reactivate`, no `POST
/super-admin/companies/:id/off-board`. All tenant lifecycle is direct
   DB today.
4. **GAP-SA-04 — Hard-delete authority surface.** "Hard-delete requires
   SUPER_ADMIN approval" per locked invariant, but no `POST
/super-admin/hard-delete/:type/:id` route exists. Cannot exercise.
5. **GAP-SA-05 — Cross-tenant access audit table.** Per
   `docs/invariants/multi-tenant.md` rule #3 "audit-log every
   super-admin access with target tenant ID" — no
   `SuperAdminAccessLog` table in schema.prisma. `GET /api/graph` is the
   one shipped violation.
6. **GAP-SA-06 — Incident response surface.** Decision 6 + Decision 10
   (incident digest) reference SUPER_ADMIN escalation but no
   `GET /super-admin/incidents` cross-tenant inbox exists. AI 100%-cap,
   wrongful-term appeals, full-day site outage — all visible to OWNER
   per Slice 2 design, but the platform-wide consolidation for Akshay
   does not exist.
7. **GAP-SA-07 — Billing reconciliation surface.** Master plan §G
   pricing (₹8/visit + ₹2K/mo floor) bills MANUALLY today. No
   `GET /super-admin/billing/:tenant/:month` aggregator. Akshay
   composes invoices by direct DB query.
8. **GAP-SA-08 — `/api/graph` and `/api/policy` short-circuit on role
   only.** The admin-web `/api/graph` route does its own jwtVerify and
   gates on `claims.role === 'SUPER_ADMIN'` without re-checking
   `User.is_platform_admin`. This is a SECOND trust path that does not
   match the backend's strict-mode three-site agreement. A revoked
   platform-admin with a still-valid JWT can still hit `/api/graph`
   until token expiry. Risk: low (5-min access-token TTL) but
   architectural inconsistency.
9. **GAP-SA-09 — F1-b SUPER_ADMIN refresh test coverage gap.** Per
   EVID-QA-F1B issue 1: auth-refresh.ts:151-175 handles SUPER_ADMIN
   with `membershipId === null` — covered by unit tests, NOT exercised
   by the F1-b QA walk. Slice-3 QA must include an
   `is_platform_admin=true` + no-membership user to close.
10. **GAP-SA-10 — AI budget cap-raise authority.** OWNER Slice 2 EVID
    flagged ambiguity in Decision 10 surface 5 "Increase cap (last
    requires Akshay)". This implies a `POST
/super-admin/ai-budget/:tenant/raise` route or similar. Does not
    exist. The decision must be made in Slice 3 brainstorm.
11. **GAP-SA-11 — Admin-web `/super-admin/*` page tree.** Admin-web has
    `/system/graph` and `/system/map` but NO `/super-admin/*` namespace
    parallel to `/hr/*` and `/owner/*`. Inconsistent IA. No tenant
    picker, no debug inbox, no billing surface, no incident inbox.

### ROUTES OUTSIDE SCOPE (deliberately not SUPER_ADMIN's)

- **All operational tenant work.** SUPER_ADMIN does NOT approve leave,
  does NOT resolve complaints, does NOT manage workers/supervisors/sites
  as a daily action. Per §3.5 "Daily actions: rare — diagnostic,
  debugging, ops-tier escalation." If SUPER_ADMIN is doing operational
  work for a tenant, the OWNER surface has a gap.
- **Chat send as another role.** Per journey scene E-B: "SUPER_ADMIN
  cannot send chat messages AS Suresh — the supervisor surface requires
  SUPERVISOR role." Slice 3 must NOT introduce role-impersonation.
- **Tenant creation `POST /super-admin/companies`.** Explicit out-of-scope
  per master plan §G — QA Test Co already exists, tenant onboarding is
  Akshay-led for the foreseeable future (Wave-6 multi-tenant scale seed
  is the trigger to revisit).
- **Direct DB writes.** SUPER_ADMIN should never write directly to the
  DB if a route exists. Slice 3 closes this gap for the routes it
  introduces; existing DB-only operations (company create, key rotate)
  remain DB-only by founder direction.

---

## 6. TEST MATRIX SEED (for when Slice 3 builds)

Persona-graph edges to cover with real-DB Vitest + Playwright once routes
exist. Format: `<edge>` -> `<happy / empty / wrong-tenant / wrong-role / boundary>`.

| edge                                                        | states to test                                                                                                                                  |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| SUPER_ADMIN login (`is_platform_admin=true`, no membership) | OTP request / OTP verify mints JWT with companyId=null / refresh works / membershipId=null path (closes GAP-SA-09 + F1-b EVID Issue 1)          |
| SUPER_ADMIN login (`is_platform_admin=true`, has OWNER mem) | Membership picker logic / picks platform or tenant; if tenant, downgrade to OWNER role; if platform, no companyId. Edge: revoked platform admin |
| SUPER_ADMIN -> `POST /super-admin/memberships`              | happy / company NOT_FOUND / company NOT_ACTIVE / duplicate OWNER for tenant / hiring authority drift (HIRING_AUTHORITY mutated -> fail closed)  |
| SUPER_ADMIN -> `GET /super-admin/audit` (new)               | happy with target tenant / no tenant filter -> 400 / wrong-tenant returns empty not 403 / audit row written for THIS lookup                     |
| SUPER_ADMIN -> `GET /super-admin/tenants/:id/chat-debug`    | happy / tenant not found / personal-data redaction unless `?includePersonal=1` / audit row written / non-SUPER_ADMIN 403                        |
| SUPER_ADMIN -> `POST /super-admin/hard-delete/:type/:id`    | happy with 2-step confirm / wrong type / 2-step token expired / target tenant audit row + cross-tenant SuperAdminAccessLog row                  |
| SUPER_ADMIN -> `POST /super-admin/companies/:id/pause`      | happy / already paused / wrong-tenant / OWNER login post-pause -> 403 PAUSED                                                                    |
| SUPER_ADMIN -> `GET /super-admin/billing/:tenant/:month`    | happy / no visits empty / cross-tenant boundary / month-rollover boundary / matches `(visits * ₹8 + ₹2K floor)` formula                         |
| SUPER_ADMIN -> `GET /super-admin/incidents`                 | happy aggregated across N tenants / per-tenant view drill / closed-incident lookback boundary / wrong-role 403                                  |
| `/api/graph` SUPER_ADMIN gate                               | happy with role=SUPER_ADMIN / wrong-role 403 / revoked platform admin within token TTL (currently passes — bug; closes GAP-SA-08)               |
| `policy-write-acl` SUPER_ADMIN bypass                       | SUPER_ADMIN writes any prefix in target tenant succeeds / AuditLog row in TARGET tenant captures actorRole=SUPER_ADMIN / actorMembershipId=null |

---

## 7. SUMMARY

- **OWNED routes on main:** 2 backend + 1 admin-web API + 2 viewer pages = 5 surfaces.
- **CONNECTED routes:** 8.
- **Gap candidates surfaced:** 11. Of these, 5 map 1:1 to spec §3.5 +
  Decision 6 + Decision 10 surfaces; 3 are platform-architectural
  (cross-tenant audit log, three-site trust agreement, SuperAdminAccessLog
  table); 3 are tenant-lifecycle (pause, off-board, billing). 1 is a
  QA-coverage gap from F1-b EVID.
- **Boundary risks:** three-site `is_platform_admin` trust is the highest
  cross-route risk. The `/api/graph` short-circuit (GAP-SA-08) is a
  documented invariant violation that has shipped. `policy-write-acl`
  bypass without distinguishable audit (cross-tenant compliance breach
  vector) is the second-highest.
- **The persona is mostly unbuilt.** Today SUPER_ADMIN has ONE shipped
  operational route (`POST /super-admin/memberships`) plus a read-only
  debug viewer. Every other §3.5 use case is direct-DB Akshay-led work.
  Slice 3 cannot productize all of it; the brainstorm spec sets a
  tier-cut MUST / SHOULD / WON'T.
- **Slice 3 is the "make the platform role legible to a product team"
  slice.** It does NOT productize tenant creation (deliberately
  out-of-scope) and does NOT productize key rotation (founder-deferred).
  It DOES productize cross-tenant audit lookup, incident inbox,
  compliance read, billing reconciliation, and the `SuperAdminAccessLog`
  invariant fix.

End EVID-SUPER-ADMIN-PERSONA-MAP.
