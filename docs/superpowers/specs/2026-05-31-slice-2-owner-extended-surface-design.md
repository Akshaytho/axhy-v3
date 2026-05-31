## [ORCHESTRATOR_EXCEPTION] Single-author design doc — no sub-agent benefit; the analysis is already synthesized in-context from the EVID-OWNER persona map.

title: Slice 2 — OWNER Extended Surface (brainstorm spec)
date: 2026-05-31
slice: Slice 2 (post HR A1)
persona: OWNER (canonical role; locked docs use COMPANY_ADMIN — same entity)
status: BRAINSTORM (not locked, awaiting founder review)
branch: feat/slice-2-owner-brainstorm
@derives:

- docs/evidence/2026-05-31/EVID-OWNER-PERSONA-MAP.md
- axhy-cognitive-system/memory/base/feedback_persona_graph_route_audit.md
- docs/specs/2026-05-15-workflow-design-closure.md (Decision 10 + §5.4)
- docs/specs/2026-05-14-operations-workflow-model.md (§3.3 Owner)
- docs/locked/hiring-hierarchy.md (HIRING_AUTHORITY)
- docs/learnings/2026-05-19-all-company-admin-vs-owner.md

---

# Slice 2 — OWNER Extended Surface

## 1. Goal

Replace the OWNER `coming-soon` stub with the minimum coherent set of OWNER
surfaces that (a) give Reddy (the 52-yr-old founder of a 2K-employee cleaning
company) the oversight he needs without daily login, (b) remove Akshay as a
single-point-of-failure for routine bank/tenant config and renewal-time
analytics, and (c) lay the read-only pipe for the four async oversight
surfaces (monthly digest, KPI dashboard, incident digest, AI alerts) so the
write-side surfaces (bank/tenant settings, AI cap action) can ride the same
auth + audit substrate without re-architecting.

Concretely: pick 3 of Decision 10's 7 surfaces as MUST-HAVE for Slice 2;
defer the 4 most cron/notification-heavy ones to Slice 2.x. Result: OWNER
has a real dashboard, can read aggregates, can edit bank/tenant config, and
can pull a compliance audit log — all within roughly HR A1's ship size.

---

## 2. OWNER scope — 3-tier table

### Tier A — In Slice 2 (must-have)

| ID   | Surface                         | Decision-10 # | Why now (rationale)                                                                                        |
| ---- | ------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------- |
| S2-1 | OWNER dashboard `/owner` (real) | 2 (KPI)       | The stub is a trust hole — anyone reaching `/owner` post-login sees "coming soon". Worst first impression. |
| S2-2 | KPI aggregate route + page      | 2             | Read-only, no cron, no notifications. Pure aggregation over existing tables. Tests cleanly.                |
| S2-3 | Bank / tenant settings UI       | 4             | Removes Akshay from the routine-config critical path (the 1-yr sim audit flagged this twice).              |
| S2-4 | Compliance / audit lookup       | 7             | Read-only over existing AuditLog table. Most legally important. Cheapest big-win.                          |
| S2-5 | Tenant-wide list reads          | n/a (cross)   | GAP-OWN-08 — OWNER needs `GET /admin/{memberships,workers,sites}` without HR pod-scope. Small change.      |
| S2-6 | Co-OWNER invite (succession)    | n/a (cross)   | GAP-OWN-09 — HIRING_AUTHORITY allows it but no UI. Tiny add to existing membership form.                   |

### Tier B — Slice 2.x (nice-to-have / heavy)

| ID    | Surface                          | Decision-10 # | Why defer                                                                                           |
| ----- | -------------------------------- | ------------- | --------------------------------------------------------------------------------------------------- |
| S2x-1 | Monthly digest cron + WhatsApp   | 1             | Requires new `Digest` entity + WhatsApp adapter + Telugu/English template engine. Big.              |
| S2x-2 | Incident digest                  | 3             | Requires defining "high-severity" thresholds, cross-table trigger, push infra. Risk-prone.          |
| S2x-3 | AI budget alerts (plain English) | 5             | Outbox topics defined but handlers stub. Translation + 3-action-choice flow. Cross-cutting w/ chat. |
| S2x-4 | Annual review surface            | 6             | Year-end cron + bespoke compose. Only matters once a year per tenant. Late-month-12 deferral safe.  |

### Tier C — NEVER for OWNER (founder-locked / scope-protected)

| ID  | Forbidden surface               | Why locked                                                                                         |
| --- | ------------------------------- | -------------------------------------------------------------------------------------------------- |
| N-1 | Worker anonymize                | HR-only per `feedback_anti_gaming_audit.md` + ops-workflow §3.3. OWNER skipping HR is audit-break. |
| N-2 | Leave-request approve/reject    | HR / SUPERVISOR-only per leave-request spec. OWNER reads outcomes, never decides.                  |
| N-3 | Direct worker create            | Locked HIRING_AUTHORITY: OWNER -> [HR, OWNER] only. WORKER must come from HR.                      |
| N-4 | Cross-tenant access             | `INVARIANT 3` locked. OWNER is bounded by `companyId`. Period.                                     |
| N-5 | Hard-delete any entity          | Locked: SUPER_ADMIN only. Data retention: forever.                                                 |
| N-6 | Policy authority override at L1 | Rule-hierarchy: master plan > tenant > pod. OWNER can edit L2 (tenant policy), never L1.           |
| N-7 | Chat-application execute        | OWNER does not chat. Reads cost aggregates only.                                                   |

---

## 3. Persona walks — 5 concrete OWNER scenarios

These are the user stories Slice 2 must support end-to-end. Pulled from the
1-yr Reddy audit + the operations-workflow §3.3 Owner profile.

### Walk 1 — "Reddy logs in for the first time post-pilot"

- SUPER_ADMIN runs `POST /super-admin/memberships` to bootstrap him.
- Reddy gets OTP on phone, hits `POST /auth/otp/verify`, JWT minted with
  `role: OWNER`.
- Lands at `/owner` (real dashboard, not stub). Sees: 1,847 workers, 23 sites,
  Rs4.3L payroll trend, Rs38K AI spend MTD, 7 open complaints, 2 terminations
  this month.
- **Routes hit:** `/auth/otp/verify`, `/me`, `GET /owner/kpi` (new), shell components.

### Walk 2 — "Reddy needs to change the bank account (twice/year)"

- Reddy navigates `/owner/settings/bank`.
- Sees current account masked: `****3421 / Axis / NAME ON ACCOUNT`.
- Hits "Edit" -> form pre-filled. Changes IFSC + name.
- Submits -> backend issues 2-step OTP to his phone.
- Enters OTP -> confirms -> AuditLog row written + outbox `owner.bank_changed`
  fires (for SUPER_ADMIN review queue, payroll batch pickup).
- **Routes hit:** `GET /owner/settings`, `POST /owner/settings/bank/request-edit` (sends OTP), `POST /owner/settings/bank/confirm`.

### Walk 3 — "Reddy's CA asks for all events involving employee Suresh in March"

- Reddy navigates `/owner/compliance`.
- Filters: employee = Suresh, from = 2026-03-01, to = 2026-03-31.
- Sees chronological list: 22 visits completed, 1 leave approved (15-Mar by
  HR Kavitha), 1 complaint resolved (28-Mar by SUPERVISOR), 0 disciplinary.
- Exports CSV.
- **Routes hit:** `GET /owner/compliance?employee=&from=&to=`, `GET /owner/compliance/export.csv`.

### Walk 4 — "Reddy wants to add his brother as co-OWNER for succession"

- Reddy navigates `/owner/memberships`.
- Sees 1 OWNER (himself), 3 HRs, 12 supervisors, 1,847 workers.
- Hits "Invite OWNER" -> form takes phone + name.
- Submits -> `POST /admin/memberships{role:OWNER}` — `assertTargetRole`
  permits because HIRING_AUTHORITY allows OWNER -> OWNER.
- AuditLog row + invite outbox fires.
- Brother logs in -> also lands at real `/owner` dashboard.
- **Routes hit:** `GET /admin/memberships` (tenant-wide for OWNER), `POST /admin/memberships`.

### Walk 5 — "Reddy reviews KPI before quarterly meeting with co-founder"

- Reddy lands `/owner/kpi` (also accessible from dashboard "View full KPI").
- Sees 90-day rolling: workers added/lost, AI cost trend (line chart),
  payroll trend, top-3 complaint sites, top-3 outliers (2-sigma off norm),
  visit-completion rate per site.
- Tenant-wide. **Not pod-scoped** — must verify pod-blind in
  every aggregator query (see EVID-OWNER §3 boundary risk).
- **Routes hit:** `GET /owner/kpi?window=90d`.

---

## 4. Backend routes needed

Mark: **NEW** = create from zero. **EXTENDS** = modify an existing route's
behavior (typically to relax pod-scope when caller role = OWNER).

| ID  | METHOD | PATH                                  | role gate                 | DB tables                                               | side-effects                            | NEW/EXTENDS | Tier |
| --- | ------ | ------------------------------------- | ------------------------- | ------------------------------------------------------- | --------------------------------------- | ----------- | ---- |
| R1  | GET    | `/owner/kpi?window={30d,90d,mtd,ytd}` | requireRole('OWNER')      | Worker, Site, Membership, Visit, ChatMessage, Complaint | —                                       | NEW         | A    |
| R2  | GET    | `/owner/settings`                     | requireRole('OWNER')      | Company                                                 | —                                       | NEW         | A    |
| R3  | POST   | `/owner/settings/bank/request-edit`   | requireRole('OWNER')      | Company, OtpChallenge                                   | sends OTP                               | NEW         | A    |
| R4  | POST   | `/owner/settings/bank/confirm`        | requireRole('OWNER')      | Company, AuditLog, Outbox                               | AuditLog row, owner.bank_changed outbox | NEW         | A    |
| R5  | POST   | `/owner/settings/tenant/request-edit` | requireRole('OWNER')      | Company, OtpChallenge                                   | sends OTP                               | NEW         | A    |
| R6  | POST   | `/owner/settings/tenant/confirm`      | requireRole('OWNER')      | Company, AuditLog, Outbox                               | AuditLog row, owner.tenant_changed      | NEW         | A    |
| R7  | GET    | `/owner/compliance`                   | requireRole('OWNER')      | AuditLog, User, Worker, Membership                      | —                                       | NEW         | A    |
| R8  | GET    | `/owner/compliance/export.csv`        | requireRole('OWNER')      | AuditLog (cursor)                                       | —                                       | NEW         | A    |
| R9  | GET    | `/admin/memberships`                  | requireRole('OWNER','HR') | Membership (OWNER: tenant-wide, HR: pod-scoped)         | —                                       | EXTENDS     | A    |
| R10 | GET    | `/admin/workers`                      | requireRole('OWNER','HR') | Worker (same scope split)                               | —                                       | EXTENDS     | A    |
| R11 | GET    | `/admin/sites`                        | requireRole('OWNER','HR') | Site (tenant-wide for both, no pod axis)                | —                                       | EXTENDS     | A    |
| R12 | POST   | `/admin/memberships` (existing)       | requireRole('OWNER','HR') | already permits OWNER->OWNER per HIRING_AUTHORITY       | already audited                         | (no change) | A    |

**Backend total Tier A:** 11 NEW + 3 EXTENDS = 14 routes touched.

**Schema additions (Tier A):**

- `Company.bankAccountNumber: String?`, `bankIfsc: String?`,
  `bankAccountName: String?`, `legalName: String?`, `gstNumber: String?`,
  `legalAddress: String?` (or normalize into `Company.bank` sub-table — pick
  in plan phase).
- `OtpChallenge.purpose enum` already exists or extend with
  `BANK_EDIT | TENANT_EDIT`.
- New outbox topics: `owner.bank_changed`, `owner.tenant_changed`.

---

## 5. Admin-web surfaces (parallel to HR's `/hr/*`)

Mirror the HR A1 structure under `/owner/*`:

```
apps/admin-web/app/owner/
  layout.tsx                        — calls requireRole('OWNER'); renders shell+nav
  error.tsx                         — catches ApiError; 401 -> /login
  page.tsx                          — REAL dashboard (replaces stub)
  kpi/
    page.tsx                        — KPI charts + tables (Recharts or similar)
  settings/
    page.tsx                        — settings landing (links to bank + tenant)
    bank/
      page.tsx                      — current bank account view + Edit link
      edit/page.tsx                 — form with 2-step OTP
    tenant/
      page.tsx                      — current legal/GST view + Edit link
      edit/page.tsx                 — form with 2-step OTP
  compliance/
    page.tsx                        — filter form (employee + date range + event type)
    results/page.tsx                — server-side rendered table + CSV export link
  memberships/                      — tenant-wide list
    page.tsx                        — list
    new/page.tsx                    — invite (HR or OWNER target)
  workers/
    page.tsx                        — tenant-wide list (read-only for OWNER — no anonymize)
    [id]/page.tsx                   — read-only detail
  sites/
    page.tsx                        — tenant-wide list
    [id]/page.tsx                   — read-only detail
```

**Admin-web page total Tier A:** ~14 pages (matches HR A1's 12 + small extra).

**Reuse plan:** memberships/new can largely reuse `<InviteForm />` from HR
with a `targetRoleOptions={['HR','OWNER']}` prop; HR's is
`{['HR','SUPERVISOR']}`. Workers + sites list pages on the OWNER side are
read-only views — drop the action buttons and the pod-scope query param.

---

## 6. Boundary contracts to maintain

Carrying forward from EVID-OWNER §3 + HR A1's learnings:

1. **`Membership.role`** — JWT carries this; `requireRole` enforces. Slice 2
   routes must use the same enum, never strings.
2. **`workerId = Worker.id`** (NOT User.id) — same lesson as commit 1edbbfd.
   Compliance lookup joins via `Worker.id`; UI displays `Worker.displayName`.
3. **`Membership.status` lifecycle** — `ACTIVE | INVITED | ENDED`. OWNER's
   tenant-wide lists must filter by status (default: ACTIVE; admin toggle to
   include ENDED for audit).
4. **`companyId` everywhere** — even OWNER cannot cross tenants. Slice 2
   uses the same `withTenantContext` wrapper as every other admin route.
5. **`Pod.id` filter skip** — for OWNER reads, the pod-scope predicate must
   be explicitly skipped (not absent by accident). Tests assert that OWNER
   sees workers from every pod in the tenant, HR sees only pod-bound workers.
6. **`AuditLog.actorMembershipId`** — every Slice 2 write (R4, R6) must
   write this. Compliance lookup (R7) reads it.
7. **2-step OTP `purpose`** — must be `BANK_EDIT` / `TENANT_EDIT`, not the
   generic LOGIN purpose. Otherwise a login OTP could authorize a bank
   change.

---

## 7. What about COMPANY_ADMIN role?

**Resolution: there is no separate COMPANY_ADMIN role. Do not introduce one.**

- The Role enum in `packages/shared-schema/src/zod/auth.ts` defines exactly
  five values: `WORKER, SUPERVISOR, OWNER, HR, SUPER_ADMIN`. There is no
  COMPANY_ADMIN value in code.
- Four locked docs (rule-hierarchy-three-layers.md, security-gaps-to-fix.md,
  operational-invariants.md) use the term `COMPANY_ADMIN` but this is legacy
  terminology from V1. Mapping is documented in
  `docs/learnings/2026-05-19-all-company-admin-vs-owner.md`.
- HIRING_AUTHORITY (locked) operates on OWNER only.
- Master plan digest §38 explicitly writes "Owner (COMPANY_ADMIN)" treating
  them as one persona.

**Recommendation for Slice 2:** when implementation lands, do a doc-only
sweep over `docs/locked/*` to add a parenthetical "(canonical role: OWNER)"
next to every COMPANY_ADMIN mention. **Do NOT modify the locked text** —
that requires founder approval per locked-docs rule. Surface this as a
separate session.

---

## 8. Open questions (3-5 for founder, multiple-choice)

### Q1 — Slice 2 scope: 3 or 4 of Decision-10's surfaces?

Current pick: KPI + Bank/Tenant settings + Compliance lookup (surfaces 2, 4, 7).

**Pick one:**

- (a) Just 3 (KPI, Settings, Compliance). Smallest, cleanest. ~14 routes, ~14 pages, ~50 tests. Ship in roughly HR-A1-size.
- (b) 4 surfaces — add AI-budget alerts (S2x-3). Bigger but the AI-budget pain is in production today.
- (c) 5 — also add monthly digest. Adds Digest entity + cron + WhatsApp adapter. Roughly 2x HR-A1.

### Q2 — AI cap override authority: OWNER or SUPER_ADMIN?

Decision 10 surface 5 says "(last requires Akshay)" — ambiguous.

**Pick one:**

- (a) OWNER can raise their own AI cap (with audit + WhatsApp confirm to SUPER_ADMIN). Trust + speed for the founder.
- (b) OWNER requests, SUPER_ADMIN approves. Akshay stays in the loop on commercials.
- (c) Skip the "raise" action in Slice 2; OWNER only has "pause" + "continue". Defer raise to Slice 3.

### Q3 — Bank/tenant edit: 2-step OTP only, or also notify SUPER_ADMIN?

**Pick one:**

- (a) 2-step OTP to OWNER only. AuditLog row, no SUPER_ADMIN ping.
- (b) 2-step OTP + outbox `owner.bank_changed` -> SUPER_ADMIN review queue. Akshay sees every change within 24h.
- (c) 2-step OTP + WhatsApp ping to Akshay immediately. Heaviest oversight.

### Q4 — Co-OWNER invite UI: in Slice 2 or defer?

**Pick one:**

- (a) Include S2-6 in Slice 2. Cheap (reuses HR's InviteForm). Real succession value.
- (b) Defer. Only ~1% of tenants will use it.
- (c) Include but hide behind a feature flag until tested with a real co-OWNER.

### Q5 — Tenant-wide list reads: extend existing routes or new `/owner/*` routes?

**Pick one:**

- (a) **Extend** `GET /admin/{memberships,workers,sites}` — branch on caller role inside the handler. Single source of truth.
- (b) **Duplicate** as `GET /owner/{memberships,workers,sites}` — fully separate handlers. No risk to HR.
- (c) Hybrid — extend backend (a), share admin-web list component, separate the page wrapper for `/owner/*` vs `/hr/*`.

---

## 9. Estimated build size

In HR A1 units (~13 routes + 12 admin-web pages + ~50 tests):

| Tier A choice                            | backend routes          | admin-web pages | tests | est. wall   |
| ---------------------------------------- | ----------------------- | --------------- | ----- | ----------- |
| Q1 (a) 3 surfaces, no co-OWNER           | 11 NEW + 3 EXTENDS = 14 | ~14             | ~55   | ~1.2x HR-A1 |
| Q1 (a) 3 surfaces, **+ co-OWNER** (S2-6) | 14 (R12 reused)         | ~15             | ~58   | ~1.3x HR-A1 |
| Q1 (b) + AI alerts                       | 14 + ~3 = 17            | ~16             | ~70   | ~1.6x HR-A1 |
| Q1 (c) + digest cron                     | 17 + ~5 = 22            | ~17             | ~85   | ~2.0x HR-A1 |

Recommendation: **Q1=(a) + Q4=(a) + Q5=(c)**. ~1.3x HR-A1. Lands the trust-
critical surfaces (KPI + bank + compliance + succession) in one ship-able
slice, defers async-pipe surfaces to Slice 2.x. Sets up the OWNER auth +
shell + audit substrate that Slice 2.x rides for free.

---

## 10. Next steps after founder review

1. Founder answers Q1-Q5.
2. Lock this spec.
3. Write `docs/plans/2026-MM-DD-slice-2-owner-implementation.md` with the
   chosen scope as numbered tasks (mirroring the HR A1 plan structure).
4. Apply persona-graph rule step 7: real-prod-DB tests on every edge.
5. Playwright water-flow spec at `apps/admin-web/e2e/owner-water-flow.spec.ts`.
6. Ship behind feature flag (OWNER portal is high-blast-radius) until
   pilot OWNER signs off.

End brainstorm spec.
