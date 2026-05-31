---
title: Slice 3 — SUPER_ADMIN platform surface design (brainstorm)
date: 2026-05-31
slice: 3
persona: SUPER_ADMIN
branch: feat/slice-3-super-admin-brainstorm
evidence: docs/evidence/2026-05-31/EVID-SUPER-ADMIN-PERSONA-MAP.md
prior_art:
  - docs/superpowers/specs/2026-05-31-slice-2-owner-extended-surface-design.md (Slice 2 OWNER)
  - docs/evidence/2026-05-29/EVID-HR-A1-QA.md (HR A1 reference, ~13 routes + 12 pages + 50 tests)
status: BRAINSTORM — not yet panel-locked, not yet approved for build
---

# Slice 3 — SUPER_ADMIN platform surface design (brainstorm)

## 1. Goal

Make the SUPER_ADMIN persona — the platform-level founder role currently held
by Akshay — legible as a product surface, not a direct-DB workflow. Today,
SUPER_ADMIN has ONE productized operational route (`POST /super-admin/memberships`,
the OWNER bootstrap) plus a read-only `/system/graph` debug viewer. Every
other §3.5 use case (cross-tenant audit lookup, incident response, billing
reconciliation, compliance debug-read of a tenant's chat/policy, hard-delete
authorization, tenant pause / reactivate / off-board) is performed via direct
DB SQL today. Slice 3 productizes the **read-and-observe + audit-trail**
half of that workload — building the cross-tenant audit table per the
multi-tenant invariant doc, an incident inbox, a compliance read-only debug
surface, and a billing aggregator. Tenant creation and key rotation remain
deliberately out-of-scope per founder direction.

---

## 2. SUPER_ADMIN scope (tier-cut)

| tier       | item                                                                                     | rationale                                                                                                                                |
| ---------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **MUST**   | `SuperAdminAccessLog` table + middleware that writes a row on every cross-tenant read    | Closes documented invariant violation per `docs/invariants/multi-tenant.md` rule #3. Pre-requisite for every other MUST.                 |
| **MUST**   | `GET /super-admin/audit?tenant=&from=&to=&actor=&kind=`                                  | Akshay needs to reconstruct audit chains today; he uses raw SQL. Highest-frequency need. (Decision 6 bootstrap-correction relies on it.) |
| **MUST**   | `GET /super-admin/tenants` (list — paginated tenant directory)                           | Every other route needs a tenant picker. No `/super-admin/*` surface works without it.                                                   |
| **MUST**   | `GET /super-admin/tenants/:companyId` (tenant detail card)                               | Pivot point for every other action. Read-only.                                                                                           |
| **MUST**   | `GET /super-admin/incidents` (cross-tenant inbox — 100%-cap AI / wrongful-term / outage) | Decision 10 incident-digest at OWNER level, but Akshay needs the platform-wide consolidation.                                            |
| **MUST**   | `GET /super-admin/billing/:companyId/:month` (₹8/visit + ₹2K floor aggregator)           | Pricing locked. Manual today. Mismatch risk grows with each new tenant.                                                                  |
| **MUST**   | Three-site `is_platform_admin` audit (fix GAP-SA-08 `/api/graph` short-circuit)          | Architectural; small surface but high-trust. Bring `/api/graph` onto the same trust path as `requireAuth` strict mode.                   |
| **SHOULD** | `GET /super-admin/tenants/:companyId/chat-debug` (Policy/LivingDoc/ChatMessage RO)       | Journey scene E-B. Lower priority than audit because Akshay can fall back to raw DB; needed for the Axhy-team-of-two horizon.            |
| **SHOULD** | `POST /super-admin/companies/:id/pause` + `/reactivate`                                  | Today: direct DB UPDATE on `Company.status`. Productizing it audits the action and prevents typo-tenant-pause.                           |
| **SHOULD** | `POST /super-admin/hard-delete/:type/:id` (with 2-step confirm)                          | Locked invariant gives SUPER_ADMIN the authority; surface enforces it. Behind a 5-minute confirm-token.                                  |
| **SHOULD** | Admin-web `/super-admin/*` page tree (parallel to `/hr/*`, `/owner/*`)                   | IA parity. 5 pages — tenants list, tenant detail, audit, incidents, billing.                                                             |
| **NEVER**  | `POST /super-admin/companies` (tenant creation)                                          | Out-of-scope per master plan §G. Wave-6 multi-tenant scale seed is the revisit trigger.                                                  |
| **NEVER**  | Key rotation surface                                                                     | Founder direction: pre-release, user-owned. No nag, no UI.                                                                               |
| **NEVER**  | Chat-send-as-another-role                                                                | Journey scene E-B explicit: SUPER_ADMIN can READ a tenant's chat, never SEND as another role.                                            |
| **NEVER**  | Operational tenant work (leave approve, complaint resolve, worker hire)                  | If SUPER_ADMIN does this routinely, the OWNER/HR surface has a gap. Fix the gap, do not let the platform persona absorb tenant work.     |

---

## 3. Persona walks (founder-grade scenarios)

### Walk A — Wrongful-term appeal, cross-tenant audit lookup

**Trigger.** A worker at Tenant T1 ("Suvarna Cleaning") sends a WhatsApp to
Akshay's personal number: "boss, sir mujhe galat nikala — Reddy ko bolo." It
is 9:43pm. The HR who terminated the worker is a 6-month-tenured HR named
Apoorva.

**Today.** Akshay opens his laptop. He SSHes into Railway, opens `psql`,
runs `SELECT * FROM "AuditLog" WHERE company_id = ... AND kind IN
('MEMBERSHIP_DEACTIVATED', 'WORKER_TERMINATED') AND target_id = ... ORDER BY
created_at DESC LIMIT 20`. He pastes the rows into a notes app, reads the
payload JSON, opens `psql` again to read the Membership row, opens it again
to read the previous Membership row (since `MEMBERSHIP_DEACTIVATED` only
references the new state, not the old). Total: ~12 minutes of SSH +
psql-paste-text. The audit chain is reconstructable but no one but Akshay
can do it.

**With Slice 3.** Akshay opens `/super-admin/tenants`, types "suvarna",
clicks the tenant card. On the tenant detail page he clicks "Audit". He
filters by `kind=MEMBERSHIP_DEACTIVATED`, `actor=Apoorva`, `from=2 weeks
ago`. He sees the row, expands it, sees the rendered before/after Membership
state, sees Apoorva's reason payload ("repeated no-show"), sees the
preceding `LEAVE_REJECTED` row from 4 days earlier. He WhatsApps the worker
the timeline in 90 seconds. Total: ~2 minutes.

**Side effects.** Every audit lookup writes 1 `SuperAdminAccessLog` row
with `(actor_user_id=Akshay, target_company_id=T1, route=/super-admin/audit,
intent_reason="wrongful-term appeal review")`. The `intent_reason` is a
required free-text field on the request — no silent reads.

### Walk B — Tenant pause for non-payment

**Trigger.** Tenant T3 has not paid the ₹2K floor for 2 months. Akshay wants
to pause the tenant (read-only mode — workers still see their visits but
OWNER cannot make changes). Locked rule: pause is reversible, off-board is
not.

**Today.** Akshay runs `UPDATE "Company" SET status = 'PAUSED' WHERE id =
'...'`. No audit row. No notification to OWNER. The OWNER login the next
morning fails with a generic "AUTH_INVALID" because every gated route
strictly checks tenant status — and the OWNER cannot tell whether their
account is broken or whether the tenant is paused.

**With Slice 3.** Akshay opens the tenant detail page, clicks "Pause
tenant". A modal asks for `intent_reason` (required, 20+ chars) and shows a
preview of what OWNER will see (a banner: "This tenant is paused. Reason
provided by platform: <reason>. Please contact billing@axhy.in."). Akshay
types "Non-payment for May and June. Email sent 2026-05-15 unanswered."
clicks "Pause". Side-effects: 1 `Company.status` update, 1 `AuditLog` row in
TARGET tenant (`COMPANY_PAUSED`, actorRole=SUPER_ADMIN, actorUserId=Akshay,
payload includes intent_reason), 1 `SuperAdminAccessLog` row, 1 outbox row
for the OWNER notification (WhatsApp + in-app banner). The pause is
reversible via `POST /super-admin/companies/:id/reactivate` with the same
intent_reason discipline.

### Walk C — Cross-tenant chat debug (Aditya scene E-B)

**Trigger.** Suresh, a supervisor at T2, complains that chat is hallucinating
worker names. The bug-report channel says "happens around 6pm IST". Akshay
needs to read T2's Policy + LivingDoc + ChatMessage rows around 6pm
yesterday.

**Today.** Direct `psql`. Akshay copies messages into a text file, runs
`grep`, sees the LivingDoc state, sees the prompt, sees the model response.
Personal data (worker phone numbers, names) leaks into his clipboard.

**With Slice 3.** Akshay opens `/super-admin/tenants/T2/chat-debug`. He
picks a date range. He sees ChatMessage rows redacted by default (worker
names show as `<worker_id:abc123>`, phones show as `<phone:redacted>`).
He clicks "Reveal personal data" — which is a separate intent-token,
2-step confirm, audit-logged separately as `intent=read_pii`. He sees the
de-redacted rows. He closes the tab. Side-effects: 1 `SuperAdminAccessLog`
row for the chat-debug read (intent_reason required), 1 ADDITIONAL row for
the PII reveal action.

### Walk D — Monthly billing reconciliation

**Trigger.** First of the month. Akshay needs to send invoices to all
tenants. Pricing: `max(visits * ₹8, ₹2000)`.

**Today.** Akshay runs SUM queries per tenant. Composes invoices in a
spreadsheet. Sends WhatsApp + PDF.

**With Slice 3.** Akshay opens `/super-admin/billing` — a table of all
tenants for the current month with `visits_completed`, `gross_inr`,
`floor_applied`, `final_inr`, `payment_status` ('pending' / 'manual_marked
\_paid' / 'overdue'). Clicking a row shows per-day breakdown. Marking
"manual_marked_paid" writes an audit row with payment proof URL (Akshay
pastes WhatsApp screenshot link). Invoice generation: out of scope — too
much surface, billing remains "compose externally" but the AGGREGATE is
trusted.

### Walk E — High-severity incident response

**Trigger.** Tenant T5's AI spend hits 100% of its daily cap. Per Decision
10, OWNER gets an alert. The OWNER pushes "raise cap" — which per the
ambiguity flagged in GAP-SA-10 requires Akshay's approval. The push lands in
Akshay's `/super-admin/incidents` inbox.

**With Slice 3.** Akshay opens the incident — sees OWNER's request + the
day's prompt history + the spend curve. He approves with intent_reason ("OK
1.5x for today, follow up tomorrow for permanent raise"). Approval writes
to the TARGET tenant's `Policy` key `ai.limits.daily_cap_inr` with a
1-day-TTL override, plus the standard audit + SuperAdminAccessLog trail.

---

## 4. Backend routes needed

NEW routes (under `/super-admin/*` namespace, all gated by
`requireRole('SUPER_ADMIN')` and wrapped by a NEW `superAdminAccessLog`
middleware that requires `intent_reason` query/body field):

| METHOD | PATH                                                    | tier   | notes                                                                                           |
| ------ | ------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------- |
| GET    | `/super-admin/tenants`                                  | MUST   | Paginated tenant directory. Returns company id, name, status, OWNER count, last activity.       |
| GET    | `/super-admin/tenants/:companyId`                       | MUST   | Tenant detail card. Aggregates: worker count, supervisor count, HR count, last 24h visit count. |
| GET    | `/super-admin/audit?tenant=&from=&to=&actor=&kind=`     | MUST   | Cross-tenant audit lookup. Required: tenant + intent_reason. Returns expanded payload.          |
| GET    | `/super-admin/incidents`                                | MUST   | Cross-tenant incident inbox. Sources: 100%-cap-AI, wrongful-term, full-day-site-outage.         |
| GET    | `/super-admin/incidents/:id`                            | MUST   | Single incident detail + actions available.                                                     |
| POST   | `/super-admin/incidents/:id/respond`                    | MUST   | Acknowledge / dismiss / escalate. Required: intent_reason + action.                             |
| GET    | `/super-admin/billing/:companyId/:month`                | MUST   | Aggregator: visits_completed, gross_inr, floor_applied, final_inr.                              |
| POST   | `/super-admin/billing/:companyId/:month/mark-paid`      | MUST   | Records payment proof URL + audit.                                                              |
| GET    | `/super-admin/tenants/:companyId/chat-debug?from=&to=`  | SHOULD | Read-only Policy/LivingDoc/ChatMessage with personal-data redaction.                            |
| POST   | `/super-admin/tenants/:companyId/chat-debug/reveal-pii` | SHOULD | 2-step confirm; mints 5-min PII-reveal token; separate audit row.                               |
| POST   | `/super-admin/companies/:id/pause`                      | SHOULD | Required: intent_reason. Triggers OWNER notification.                                           |
| POST   | `/super-admin/companies/:id/reactivate`                 | SHOULD | Required: intent_reason. Triggers OWNER notification.                                           |
| POST   | `/super-admin/hard-delete/:type/:id`                    | SHOULD | 2-step confirm. Required: intent_reason. Fail-closed if not in allowlisted type set.            |
| POST   | `/super-admin/ai-budget/:companyId/raise`               | SHOULD | OWNER request -> SUPER_ADMIN approve. Writes 1-day-TTL policy override.                         |

EXTENDS (existing routes, no new path):

| METHOD | PATH                     | extension                                                                                                                                                                                  |
| ------ | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/graph` (admin-web) | Fix GAP-SA-08 — call backend `/super-admin/_trust-check` (new helper, returns 200 if User.is_platform_admin still true) instead of role-only short-circuit. Add SuperAdminAccessLog write. |
| POST   | `/admin/policy`          | When `actorRole=SUPER_ADMIN`, write companion `SuperAdminAccessLog` row + tag `AuditLog.actorRole='SUPER_ADMIN'` explicitly.                                                               |

**Total NEW routes:** 14 backend.
**Total EXTENDS routes:** 2.
**Total schema additions:** 1 table (`SuperAdminAccessLog`) + 1 column on
`AuditLog` (`actorRole: Role` — nullable for legacy rows).

---

## 5. Admin-web surfaces — `/super-admin/*` route structure

Parallel to `/hr/*` and `/owner/*`. 5 MUST pages, 3 SHOULD pages. Shared
layout shell: a sticky tenant-picker header, a sidebar with sections
(Tenants / Audit / Incidents / Billing / Debug / System), and a footer
strip showing "logged in as Akshay (platform-admin)".

| route                                          | tier   | content                                                                                                   |
| ---------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| `/super-admin`                                 | MUST   | Dashboard. 4 cards: incident count, tenants paused, billing not-marked-paid count, recent audit activity. |
| `/super-admin/tenants`                         | MUST   | Tenant directory — sortable table. Click row -> detail page.                                              |
| `/super-admin/tenants/[companyId]`             | MUST   | Tenant detail card + tabs: Audit / Incidents / Billing / Debug / Settings (pause/reactivate buttons).     |
| `/super-admin/incidents`                       | MUST   | Cross-tenant inbox. Filter by tenant, severity, status.                                                   |
| `/super-admin/billing`                         | MUST   | Month picker + tenant table with aggregates.                                                              |
| `/super-admin/tenants/[companyId]/chat-debug`  | SHOULD | Redacted by default; explicit "Reveal personal data" workflow with 2-step confirm.                        |
| `/super-admin/tenants/[companyId]/hard-delete` | SHOULD | Type-selector + 2-step confirm + intent_reason textarea.                                                  |
| `/super-admin/audit-log`                       | SHOULD | The platform's audit OF SUPER_ADMIN itself — `SuperAdminAccessLog` viewer. Akshay auditing himself.       |

The existing `/system/graph` and `/system/map` viewer pages remain — they
become a "System" sidebar section, not removed.

**Total admin-web pages:** 8 (5 MUST + 3 SHOULD).

---

## 6. Critical security questions

1. **Intent_reason as soft-token vs hard-required.** Every cross-tenant read
   takes `intent_reason` (free text, 20+ chars). Question: is this
   client-side validation only, or should the server REJECT requests
   missing it? Slice 3 default: server-required, returns 400
   `INTENT_REASON_REQUIRED`. (Open Q1)
2. **2-step confirm for hard-delete + pause + PII-reveal.** Mints a
   5-minute "confirm token" returned by a `POST /super-admin/intent-token`
   route; the destructive action requires both auth + confirm-token. The
   confirm-token is one-time. (Resolved: Slice 3 builds this.)
3. **`/api/graph` short-circuit (GAP-SA-08) — sync vs async fix.** Today it
   role-only-gates. Slice 3 default: introduce a `_trust-check` helper
   route on backend that admin-web calls server-side before returning the
   graph payload. Adds ~50ms; acceptable for a debug viewer.
4. **`policy-write-acl` SUPER_ADMIN bypass distinguishability.** Today the
   bypass writes audit rows indistinguishable from OWNER edits. Slice 3
   adds `AuditLog.actorRole` column. Migration: nullable, backfill not
   required (legacy rows stay null). This is a SCHEMA change — needs the
   Prisma migration + Akshay sign-off.
5. **Hard-delete authority scope — what types?** Allowlisted set is the
   safe default. Initial allowlist: `User` (anonymisation-then-delete),
   `Company` (only when status='OFF_BOARDED'), `Membership` (always
   permitted). Other types -> 400 `HARD_DELETE_TYPE_NOT_PERMITTED`. (Open Q2)
6. **Cross-tenant audit lookup return-empty-vs-403.** When SUPER_ADMIN
   queries a tenant that does not exist, should the response be 404
   (signals "tenant not in system") or empty 200 (signals "no audit rows
   match")? Default: 404 — SUPER_ADMIN already sees the tenants list, so
   leaking existence isn't a new info disclosure. (Open Q3)
7. **PII-reveal token scope.** Once minted, is it good for ALL chat-debug
   pages or scoped to the current tenant only? Default: scoped to
   `(actor_user_id, target_company_id, expires_at)`. Cross-tenant reuse
   forbidden.

---

## 7. Boundary contracts (cross-tenant)

The hardest invariant: **SUPER_ADMIN routes bypass `withTenantContext`.**
This is a deliberate carve-out (the trust path is `is_platform_admin`, not
`companyId` agreement). The discipline that protects multi-tenant integrity:

- Every SUPER_ADMIN route takes `companyId` from URL parameters or body —
  NEVER from `req.auth.companyId` (which may carry the SUPER_ADMIN's own
  OWNER-tenant if they happen to have one).
- Every SUPER_ADMIN route writes exactly 1 `SuperAdminAccessLog` row
  BEFORE returning, with `(actor_user_id, target_company_id, route,
intent_reason)`. Middleware enforces this; route handlers cannot opt out.
- Every SUPER_ADMIN write to a target tenant's data ALSO writes 1
  `AuditLog` row in that tenant with `actorRole='SUPER_ADMIN'` +
  `actorUserId=Akshay's user id` + `actorMembershipId=null`. The
  `actorRole` column distinguishes these from OWNER edits.
- Reads do NOT write to target tenant's `AuditLog` (would pollute the
  tenant's audit timeline). Reads only write to `SuperAdminAccessLog`.
- The `/super-admin/_trust-check` helper revalidates
  `User.is_platform_admin` against the DB on every call from admin-web.
  Cheap query; no caching. 5-minute access-token TTL keeps the staleness
  window finite.

---

## 8. Open questions for founder

**Q1 — intent_reason enforcement.** Should `intent_reason` be server-required
(reject with 400) or client-strongly-encouraged (log with severity but
permit)?

- (a) Server-required — cleanest audit, but slows down emergency lookups
  (typing 20 chars in a real outage feels friction). [SLICE-3 DEFAULT]
- (b) Client-required, server-warns — flexibility for outages, but the
  audit will sometimes have empty reasons.
- (c) Server-required with a single allowlisted skip ("EMERGENCY") that
  flags the row red in the SuperAdminAccessLog viewer.

**Q2 — hard-delete type allowlist initial set.** Which types should
SUPER_ADMIN be able to hard-delete on Day 1?

- (a) Only `User` (anonymise-then-delete) — minimum viable. [SAFE DEFAULT]
- (b) `User` + `Membership` — covers the common "wrong-role onboarding"
  cleanup.
- (c) `User` + `Membership` + `Company` (only when OFF_BOARDED) —
  full lifecycle.
- (d) Defer entirely to Slice 4. Akshay keeps using direct DB.

**Q3 — Tenant-not-found response semantics.** When querying
`/super-admin/audit?tenant=DOES_NOT_EXIST`:

- (a) 404 NOT_FOUND — fine because SUPER_ADMIN has tenant list access.
  [SLICE-3 DEFAULT]
- (b) Empty 200 — uniform shape across all queries.
- (c) 422 with `tenant_not_in_system` — explicit.

**Q4 — AI budget cap-raise authority (closing GAP-SA-10).** Decision 10
surface 5 says "(last requires Akshay)". Is that:

- (a) OWNER can raise up to 1.5x autonomously; only above 1.5x requires
  Akshay. [PRODUCT-FRIENDLY]
- (b) OWNER can REQUEST any raise; Akshay approves all. [CONSERVATIVE,
  audits clean, requires the `POST /super-admin/ai-budget/raise` route]
- (c) OWNER has unilateral raise authority; Akshay only sees it in the
  incident inbox after-the-fact. [FOUNDER-FRIENDLY, lighter surface]

**Q5 — Admin-web `/super-admin/*` sign-in flow.** Today an OWNER + platform-
admin user gets a JWT with role=OWNER if they have an active membership.
Should the admin-web have a "Switch to platform-admin" button that re-mints
the JWT with role=SUPER_ADMIN + companyId=null + isPlatformAdmin=true?

- (a) Yes — explicit switch, audit-logged. [SLICE-3 DEFAULT]
- (b) Auto-pick platform-admin role on login if `is_platform_admin=true`
  (downgrade to OWNER only if explicitly chosen).
- (c) Two separate logins (different login URL for platform-admin) —
  matches the multi-tenant invariant doc rule #2 "separate JWT scope".

---

## 9. Estimated build size vs HR A1

HR A1 baseline (`docs/evidence/2026-05-29/EVID-HR-A1-QA.md`):

- ~13 routes (admin-memberships, admin-workers, admin-sites + sub-routes)
- ~12 admin-web pages
- ~50 tests

Slice 3 estimate:

| metric                              | MUST tier                 | + SHOULD tier       | comparison to HR A1                            |
| ----------------------------------- | ------------------------- | ------------------- | ---------------------------------------------- |
| NEW backend routes                  | 8                         | +6 = 14             | similar to HR A1 (13)                          |
| EXTENDS existing routes             | 2                         | 2                   | n/a for HR A1                                  |
| NEW schema changes                  | 1 table + 1 column        | same                | larger than HR A1 (HR A1 was zero schema)      |
| NEW middleware                      | 1 (`superAdminAccessLog`) | 1 (+ confirm-token) | none in HR A1                                  |
| Admin-web pages                     | 5                         | +3 = 8              | smaller than HR A1 (12) — fewer write surfaces |
| Tests (real-DB Vitest + Playwright) | ~35                       | ~55                 | similar to HR A1 (50)                          |
| Estimated build days (solo)         | 3-4                       | 6-7                 | HR A1 was 4 days for MUST + 7 for full         |

**Recommendation.** Build MUST tier first as one PR (~4 days). SHOULD tier
as Slice 3.5 follow-up (~3 days). The cleanest cut is at the schema
boundary — MUST adds the `SuperAdminAccessLog` table and the `actorRole`
column; SHOULD only adds routes that consume them. If panel rejects the
SHOULD-tier scope, MUST tier still produces a coherent shippable surface.

---

## 10. What this slice does NOT change

- **OWNER scope (Slice 2).** OWNER's surface is independent. The
  cap-raise question (Q4) is the ONLY OWNER<->SUPER_ADMIN coupling.
- **HR scope.** Untouched.
- **Tenant creation.** Stays direct-DB.
- **Key rotation.** Stays direct-DB.
- **Worker / Supervisor mobile apps.** Untouched.
- **Chat AI behaviour.** Read-only debug surface; no behaviour change.

---

## 11. Next steps (out of brainstorm)

1. Founder reviews this doc + answers Q1-Q5.
2. Panel debate per `docs/superpowers/protocols/4-hard-gates.md` —
   architecture + security + DPO + ops, minimum.
3. If approved, write Slice 3 plan in `superpowers:writing-plans` format.
4. Plan executed via `superpowers:executing-plans` with per-sub-task review
   checkpoints.
5. Pre-build: extend `EVID-SUPER-ADMIN-PERSONA-MAP.md` with the locked
   scope; pre-commit the test matrix seed as the QA target.

End brainstorm.
