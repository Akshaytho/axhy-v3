# 04 — Governance & Constraints (the constitution HR obeys)

> Source of truth: `99_CANON_FACTS.md` §2, §10. Primary sources: `docs/locked/{hiring-hierarchy,operational-invariants,rule-hierarchy-three-layers,security-gaps-to-fix}.md`, ADR-0025, ADR-0026.

These are not design preferences — they are locked, founder-authored rules. If a screen in this set ever appears to violate one, **the screen is the bug**. This doc is the checklist every HR feature is validated against.

---

## 1. Hiring authority (who HR can create)

```
SUPER_ADMIN → OWNER
OWNER       → HR, OWNER
HR          → SUPERVISOR, WORKER     ← HR's box
SUPERVISOR  → nothing
WORKER      → nothing
```

- HR creates **SUPERVISOR and WORKER only** — directly, with no approval gate. (`hiring-hierarchy.md:24-30`)
- HR **cannot** create OWNER, another HR, or itself; HR cannot create a Company. (`hiring-hierarchy.md:28`; INV 3) — (note: an **OWNER** acting in the admin-web _may_ create HR; the **HR role** cannot. The invite-member screen exposes the `HR` option only when the caller is OWNER.)
- Every membership-create route runs the **two-stage gate**: `requireRole(...)` (401/403 `FORBIDDEN_WRONG_ROLE`) then `assertTargetRole(caller,target)` (403 `FORBIDDEN_TARGET_ROLE`), then tenant scope, then audit. (`role-gates.ts:65-94`)
- The `HIRING_AUTHORITY` table in code is asserted byte-for-byte against the locked doc by `test/role-gates.test.ts`; drift fails the build. **Changing it is a constitutional session, not a code change.**

**Forbidden (require a constitutional session to change):** supervisor-creates-worker; any "HR proposes → admin approves" gate; worker public self-signup. (`hiring-hierarchy.md:40-44`)

---

## 2. Identity & lifecycle invariants

- **Single ACTIVE membership per user** — at most one `Membership` per `userId` with `status=ACTIVE` (DB partial unique index). On exit (resign/quit/fired): Membership → RESIGNED + User anonymised; re-registration on the same phone is a **brand-new User**, no carry-over. Multi-tenant switching is permanently closed. (LOCKED 2026-05-18; brain `59e07df1`)
- **No self-service resign/terminate** — there is no "quit/terminate myself" button anywhere. Offboarding **always originates from HR** (or owner) via the HR surface. The removed user sees _"Your account has been removed by {Company}"_ on next login. (LOCKED 2026-05-18; brain `866282c1`)
- **`Worker.id != User.id != Membership.id`** — worker-keyed actions (leave, anonymize, worker detail) use `Worker.id`; pod scoping joins `Worker → User → Membership`. Build this contract once, centrally. (`99_CANON_FACTS.md §12.1`)

---

## 3. Operational invariants (every HR action obeys all)

From `operational-invariants.md` — _"Code that violates any invariant is a bug. No exceptions."_

|      # | Invariant                                               | What it means for HR                                                                                                                                                                                                                                                                                                                                                   |
| -----: | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|  INV 1 | No cross-tenant access                                  | Scope every query/write by `companyId` from JWT. **Note:** the locked invariant says RLS is the _primary_ mechanism and app filters are defense-in-depth; in reality RLS is enabled only on chat embeddings today (`11 §3`), so app-level `companyId` filtering is currently load-bearing. Tracked as constitutional debt; "RLS on HR tables" is a Wave-0 item (`14`). |
|  INV 2 | Company status gates ops                                | Block all HR **writes** when `Company.status != ACTIVE`; reads still allowed                                                                                                                                                                                                                                                                                           |
|  INV 3 | Tenant creation is admin-only                           | HR cannot create Company rows                                                                                                                                                                                                                                                                                                                                          |
|  INV 4 | Hard-delete is SUPER_ADMIN only                         | HR soft-deletes (anonymize); never row-removes                                                                                                                                                                                                                                                                                                                         |
|  INV 8 | Policy is append-only                                   | HR rule writes insert a new row with `previousValueSnapshot`; no UPDATE/DELETE                                                                                                                                                                                                                                                                                         |
|  INV 9 | AuditEvent is immutable                                 | Every HR action writes an INSERT-only audit row; never edited                                                                                                                                                                                                                                                                                                          |
| INV 10 | State-machined entities transition only via the machine | No direct DB status writes on Worker/LivingDoc                                                                                                                                                                                                                                                                                                                         |
| INV 11 | Worker history retained forever                         | Offboarding = anonymize PII + keep record structure; never delete                                                                                                                                                                                                                                                                                                      |
| INV 13 | No bulk export (the moat)                               | No "download all rules/data" feature in the HR portal                                                                                                                                                                                                                                                                                                                  |

---

## 4. Rule hierarchy — three layers

```
Layer 1  ai.rules.company.*   OWNER            (overrides everything)
Layer 2  ai.rules.hr.*        HR, OWNER        (overrides Layer 3 only)   ← HR's box
Layer 3  supervisor LivingDoc Supervisor / AI  (overrides nothing)
```

- Higher layer **always** wins; the AI explains a conflict, never silently ignores it. (`rule-hierarchy-three-layers.md:34-42`)
- **HR can write `ai.rules.hr.*`** but **not** `ai.rules.company.*` or `ai.limits.*` → 403. (`rule-hierarchy-three-layers.md:44-52`)
- Rule text validated on write: **≤300 chars per rule, ≤50 rules per key.** (security GAP 3 / GAP 10)

---

## 5. Security gaps the portal must honor

- **GAP 1** — `requireAuth` enforces `Company.status='ACTIVE'`; suspended company → 403 on writes.
- **GAP 2** — key-namespace ACL (see §4); HR write to a company key → 403.
- **GAP 7** — **OWNER is notified** on: any Policy write, any add/remove of an HR/admin membership, "apply urgently," any company-setting change. Every HR membership/policy action fires an owner notification.
- **GAP 6** — "apply urgently" capped at 3/company/day, each one audited + owner-notified + confirm-modal.

---

## 6. DPDP / PII

- **Anonymize, don't delete** (INV 11). Worker offboarding = `Worker.state → TERMINATED`, `Worker.userId → null`, `User.phone → anon:<sha256>`, `Membership.status → INACTIVE`, audit `WORKER_ANONYMIZED`. The record structure survives forever.
- **Bank PII** (`bankIfsc`, `bankAcct`) is `@personal`-tagged and lives on `Membership`. **Bank-account _changes_ are an OWNER surface with 2-step OTP — not HR.** HR captures bank details at onboarding; HR does not run the bank-change flow. (ADR-0025; closure Decision 10)
- **Termination** requires a **written reason** and supports a **7-day appeal** (needs a `WorkerTerminationAppeal` table + a `TERMINATION_NOTIFIED_TO_SUBJECT` audit emitter — **both to build**; today only a Policy key `worker.termination_appeal_days`). (closure Decision 5; F-P-3)

---

## 7. Time & concurrency constraints

- **Same-day freeze (S-001, LOCKED 2026-05-16)** — once the tenant-local day starts, no supervisor-responsibility change (acting cover, permanent reassign, binding-end) takes effect until next tenant-midnight. Enforced server-side (`assertNotChangingTodaysResponsibility`). **Every HR binding surface must surface this**: "effective tomorrow" is the default, and same-day emergencies are handled operationally, off-system. Bootstrap/migration carry a `bypassFreezeReason`. (`closure.md:753-772`)
- **Pessimistic pod locks** — 15-min row lock, renewable; second opener sees the lock state. Force-unlock is HR-team-lead only and deferred to Phase D. (`closure.md:365-371`)
- **HR-absent fallback is explicit, not silent** — owner does not inherit HR authority by default; it is an explicit, time-bounded 7-day grant after the 72h tier. (`closure.md:48-57`)

---

## 8. The HR portal MUST / MUST NOT (one-page checklist)

**MUST**

- Run the two-stage hiring gate on every membership create.
- Restrict HR creates to SUPERVISOR/WORKER.
- Write salary + bank to **Membership** at onboarding.
- Scope every query by `companyId`.
- Block writes when company ≠ ACTIVE.
- Write an immutable AuditEvent per action.
- Append-only Policy writes for `ai.rules.hr.*` with `previousValueSnapshot`.
- Anonymize + soft-delete on offboarding; retain structure forever.
- Capture a written termination reason; support the 7-day appeal.
- Fire an OWNER notification on HR membership **add AND deactivate/remove** (so: invite member/worker **and** anonymize, switch-all-sites `deactivateMembership`) and on any Policy write. (GAP 7 — the remove side is easy to forget; every membership-mutating surface owner-notifies.)
- Route work through pods; lock rows; audit cross-pod overrides.
- Default every binding change to "effective next tenant-midnight" (same-day freeze).
- Read server `canX` flags for legality; never recompute on the client.

**MUST NOT**

- HR create OWNER/HR/itself or a Company.
- Add an "HR proposes → admin approves" gate or any supervisor-creates-worker path.
- Allow worker self-signup.
- HR write `ai.rules.company.*` or `ai.limits.*`.
- UPDATE/DELETE any AuditEvent or Policy row.
- Direct-DB status writes on state-machined entities.
- Hard-delete anything (SUPER_ADMIN only).
- Add a bulk-export / "download all" feature.
- Let the owner silently inherit HR authority on absence.
- Run the bank-account-change flow (that's owner + 2-step OTP).
- Show state-machine jargon or AI "smart picks" in the UI.
