---
Status: DRAFT
Author: Claude Opus 4.7 (1M context) + Founder (Akshay Thota)
Date: 2026-05-25
Slice: admin-hr-backend-wave-2-prep
Related lock: docs/locked/hiring-hierarchy.md (2026-05-25)
Related ADR: 0025-salary-on-membership-not-worker.md (to be written during execution)
---

# Admin/HR Backend — Wave-2 Prerequisite

## Why this slice exists

The 2026-05-25 wave-2 QA preflight surfaced that the cross-persona scenarios the worker depends on cannot be tested today — the backend has no admin/HR creation API:

- `workers.ts` only has `/workers/:id/mark-absent` (supervisor-scoped). No `POST /workers`.
- `admin-web` is marketing-only (pricing/about/terms/owner/login/system/graph). No HR operations UI.
- No `/admin/memberships`, no `/admin/sites`, no `/admin/sites/:id/bindings`, no anonymize route.

Without these, every fixture must be hand-seeded via raw Prisma — wave-2 cross-persona QA degenerates into "test that the seed worked." The founder direction this session: pause wave 2, build the backend for the cross-persona surfaces the worker connects to, then run the QA wave.

The hiring authority is locked in `docs/locked/hiring-hierarchy.md` (founder-authored 2026-05-25, same session). This plan implements the routes that enforce that lock.

## Scope

### In scope (5 routes + 1 migration + 1 ADR)

| #   | Route                               | Caller roles      | Writes                                      |
| --- | ----------------------------------- | ----------------- | ------------------------------------------- |
| R1  | `POST /admin/memberships`           | COMPANY_ADMIN, HR | User (upsert by phone) + Membership(role)   |
| R2  | `POST /admin/workers`               | HR                | User (upsert) + Membership(WORKER) + Worker |
| R3  | `POST /admin/workers/:id/anonymize` | HR                | Wraps existing identity-lifecycle service   |
| R4  | `POST /admin/sites`                 | COMPANY_ADMIN, HR | Site (state=DRAFT default)                  |
| R5  | `POST /admin/sites/:id/bindings`    | COMPANY_ADMIN, HR | SiteSupervisorBinding                       |

Plus:

- **M1**: Prisma migration — move `baseSalaryPaise`, `bankIfsc`, `bankAcct` from `Worker` → `Membership`.
- **ADR-0025**: "Salary belongs on Membership, not Worker." Cites real-world Indian payroll system convention (Zoho Payroll, RazorpayX, TallyPrime).

### Out of scope (explicit deferrals)

- **Admin UI.** Founder direction: "for now build there backend". UI lives in a later slice, possibly wave-3.
- **`POST /super-admin/companies`.** QA Test Co already exists; we don't need to create new tenants for wave 2.
- **`PATCH /admin/memberships/:id/role` (promote worker to supervisor).** Edge case; not blocking wave 2.
- **`POST /admin/assignments` (shift-pattern templates).** `/worker/today` reads `Visit`, not `Assignment` — visit seeding bypasses the Assignment layer for now. Tracked as future work.
- **Visit generator service.** QA seed creates Visit rows directly; production cron job is a later slice.
- **Worker UI for ON_LEAVE / BLOCKED state transitions.** Backend already supports; UI is a worker-app slice.

## Schema move (precondition for the 5 routes)

### Why move salary?

Every real Indian payroll system (Zoho Payroll, RazorpayX Payroll, TallyPrime, Workday, BambooHR) stores salary on the employment record, not on a role-specific table. Salary is tied to the `(Person, Company, Role)` tuple — when an employee changes roles, salary travels with the new employment record. The current schema only stores salary for Workers; HR and Supervisor are paid in the real world but have nowhere to persist it.

### Migration shape

**Move from `Worker` to `Membership`:**

- `baseSalaryPaise` (Int, default 0) — monthly salary in paise
- `bankIfsc` (String?, @personal) — bank IFSC for payroll transfer
- `bankAcct` (String?, @personal) — bank account number for payroll transfer

**Data backfill:**

- For each existing Worker row, set the matching `Membership` (where `role=WORKER`, `userId=Worker.userId`) to the Worker's `baseSalaryPaise`, `bankIfsc`, `bankAcct`.
- Workers without a User row (`userId=null`) keep their values orphaned in this migration — the next stage will require a "ghost membership" row, but no production data has this case yet so we accept it as a follow-up.

**Drop from Worker:**

- `baseSalaryPaise`, `bankIfsc`, `bankAcct` columns dropped after backfill verification.

### Downstream code updates

| File                                                  | Change                                                                                                                                                                                                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/backend/src/lib/services/attendance-service.ts` | `markAbsentService` reads `tx.membership.findFirst({ where: { userId: worker.userId, companyId, role: 'WORKER' } })` for salary. Returns NO_MEMBERSHIP_FOR_PAYROLL if worker has no User row yet (PENDING_ACTIVATION); falls back to 0 deduction. |
| Test fixtures using `baseSalaryPaise` on Worker       | Migrated to set the value on Membership instead. ~5 test files.                                                                                                                                                                                   |
| `packages/shared-schema/src/zod/*`                    | Worker output Zod schemas drop the 3 fields; Membership Zod schemas gain them.                                                                                                                                                                    |
| `apps/mobile/lib/api-routes.ts` and any consumer      | None — these fields are not exposed to mobile today.                                                                                                                                                                                              |

### Risk

- Worker → Membership join becomes load-bearing for mark-absent. Already indexed via Membership `@@unique([companyId, userId, role])`; one lookup per absence.
- ON_LEAVE / TERMINATED workers retain Membership row (status flips, not deletes), so salary still queryable.
- ARCHIVED workers — salary read can return `null`, mark-absent service handles gracefully.

## Route specs

### R1: `POST /admin/memberships`

**Caller roles:** COMPANY_ADMIN, HR
**Path:** `apps/backend/src/routes/admin-memberships.ts` (new file)

**Request body (Zod):**

```ts
{
  phone: string;          // E.164
  name: string;           // displayed name
  role: 'HR' | 'SUPERVISOR'; // target role for this slice
  baseSalaryPaise: number;   // monthly in paise
  bankIfsc?: string;         // optional
  bankAcct?: string;         // optional
  podId?: string;            // only when role=HR, references HRPod
}
```

> The locked authority table allows COMPANY_ADMIN to create another COMPANY_ADMIN (co-owner case). That target role is **deferred for this slice** — co-owner creation is a real-world edge case but not blocking wave 2. R1's Zod restricts to `HR | SUPERVISOR` to keep the slice tight; a follow-up slice can widen the Zod + add COMPANY_ADMIN handling in target-role gate. The const HIRING_AUTHORITY remains complete (mirrors the lock); the deferral is at the API surface, not in the truth table.

**Logic:**

1. Caller-role gate (preHandler): 401 if no JWT; 403 FORBIDDEN_WRONG_ROLE if caller is not COMPANY_ADMIN or HR.
2. Target-role gate: check (callerRole, body.role) against authority table:
   - COMPANY_ADMIN → may create HR
   - HR → may create SUPERVISOR
   - Any other combination → 403 FORBIDDEN_TARGET_ROLE
3. `withTenantContext(prisma, caller.companyId, async (tx) => { ... })`:
   - Upsert User by phone (reuse existing, create new if not found)
   - Create Membership(companyId=caller.companyId, userId, role, baseSalaryPaise, bankIfsc, bankAcct, podId, status=ACTIVE)
   - Catch `@@unique([companyId, userId, role])` violation → 409 MEMBERSHIP_ALREADY_EXISTS
   - Write AuditEvent(MEMBERSHIP_CREATED, actorUserId=caller.userId, targetUserId, targetRole, companyId)
4. Return `{ membershipId, userId, role, status }`.

**Response codes:** 200 happy, 400 BAD_INPUT, 401 AUTH_REQUIRED, 403 FORBIDDEN_WRONG_ROLE, 403 FORBIDDEN_TARGET_ROLE, 409 MEMBERSHIP_ALREADY_EXISTS, 500 INTERNAL.

### R2: `POST /admin/workers`

**Caller role:** HR
**Path:** `apps/backend/src/routes/admin-workers.ts` (new file)

**Request body (Zod):**

```ts
{
  phone: string;             // E.164
  name: string;
  baseSalaryPaise: number;
  bankIfsc?: string;
  bankAcct?: string;
  preferredLanguage?: string; // ISO 639-1; default 'hi'
}
```

**Logic:**

1. Caller-role gate: HR only. 403 FORBIDDEN_WRONG_ROLE otherwise.
2. `withTenantContext`:
   - Upsert User by phone
   - Create Membership(role=WORKER, salary fields, status=ACTIVE)
   - Create Worker(userId, companyId, name, phone, preferredLanguage, state=PENDING_ACTIVATION) — the workerMachine entry state
   - Catch unique-constraint violations → 409 WORKER_ALREADY_EXISTS
   - Write AuditEvent(WORKER_CREATED)
3. Return `{ workerId, userId, membershipId, state: 'PENDING_ACTIVATION' }`.

When the worker subsequently runs `/auth/otp/verify`, the existing `workerOtpVerifiedService` transitions state to ACTIVE. No code change needed there.

### R3: `POST /admin/workers/:id/anonymize`

**Caller role:** HR
**Path:** `apps/backend/src/routes/admin-workers.ts` (same file as R2)

**Request body (Zod):**

```ts
{
  reason: string;     // free-text, audit log
  effectiveAt?: string; // ISO; default now
}
```

**Logic:**

1. Caller-role gate: HR only.
2. Worker ownership check: Worker.companyId === caller.companyId; 404 WORKER_NOT_FOUND otherwise.
3. Invoke existing `anonymizeWorkerService` (search for the canonical name during implementation):
   - Worker state transition → TERMINATED (via workerMachine)
   - Worker.userId set null
   - User.phone replaced with `anon:<hash>` form (one-way)
   - Membership.status set INACTIVE
4. AuditEvent(WORKER_ANONYMIZED, actorUserId, targetWorkerId, reason, effectiveAt).
5. Return `{ workerId, anonymizedAt }`.

**Response codes:** 200, 400, 401, 403 FORBIDDEN_WRONG_ROLE, 404 WORKER_NOT_FOUND, 409 WORKER_ALREADY_TERMINATED, 500.

### R4: `POST /admin/sites`

**Caller roles:** COMPANY_ADMIN, HR
**Path:** `apps/backend/src/routes/admin-sites.ts` (new file)

**Request body (Zod):**

```ts
{
  name: string;
  address?: string;          // @personal
  latitude?: number;         // decimal degrees
  longitude?: number;
  workdays?: string;         // 7-char mask, default 'MTWTFS_'
}
```

**Logic:**

1. Caller-role gate: COMPANY_ADMIN or HR.
2. `withTenantContext`:
   - Create Site(companyId, name, address, latitude, longitude, state='DRAFT', workdays default 'MTWTFS\_').
   - AuditEvent(SITE_CREATED).
3. Return `{ siteId, state: 'DRAFT' }`.

### R5: `POST /admin/sites/:id/bindings`

**Caller roles:** COMPANY_ADMIN, HR
**Path:** `apps/backend/src/routes/admin-sites.ts` (same file as R4)

**Request body (Zod):**

```ts
{
  supervisorUserId: string; // User.id of the supervisor being bound
  effectiveFrom: string;    // ISO timestamp
  effectiveUntil?: string;  // ISO timestamp, required when actingForUserId set
  actingForUserId?: string; // optional cover for another supervisor
  reason: string;
}
```

**Logic:**

1. Caller-role gate: COMPANY_ADMIN or HR.
2. Site ownership check: Site.companyId === caller.companyId.
3. Supervisor ownership check: the target supervisorUserId has an active Membership with role=SUPERVISOR in caller.companyId. 404 SUPERVISOR_NOT_FOUND otherwise.
4. Acting check: if `actingForUserId` set, `effectiveUntil` must be set (DB CHECK enforces too).
5. `withTenantContext`:
   - Create SiteSupervisorBinding(siteId, userId=supervisorUserId, actingForUserId, effectiveFrom, effectiveUntil, reason, createdBy=caller.userId).
   - AuditEvent(BINDING_CREATED).
6. Return `{ bindingId }`.

## Role gate enforcement (Layer 1: caller, Layer 2: target, Layer 3: tenant, Layer 4: audit)

### Caller-role helper (new)

`apps/backend/src/middleware/role-gates.ts` (new file). Exports:

- `requireRole(...allowedRoles: Role[])` — preHandler that 401 if no JWT and 403 FORBIDDEN_WRONG_ROLE if caller's role not in allowedRoles.
- `assertTargetRole(callerRole, targetRole)` — pure function. Checks the authority table from `docs/locked/hiring-hierarchy.md`. Throws TargetRoleError if not allowed; route catches and returns 403 FORBIDDEN_TARGET_ROLE.

The authority table is encoded as a const literal:

```ts
const HIRING_AUTHORITY: Record<Role, ReadonlyArray<Role>> = {
  SUPER_ADMIN: ['COMPANY_ADMIN'],
  COMPANY_ADMIN: ['HR', 'COMPANY_ADMIN'],
  HR: ['SUPERVISOR', 'WORKER'],
  SUPERVISOR: [],
  WORKER: [],
};
```

Tests assert the table matches the locked doc byte-for-byte. A mismatch fails CI.

## Tests required (per E11)

### Per route (25 integration tests, 5 routes × 5)

1. **401 unauthenticated** — call with no Authorization header.
2. **403 wrong caller role** — call with a JWT for the wrong role (e.g., SUPERVISOR calls /admin/workers).
3. **403 wrong target role** — call with valid caller role but target role not allowed (e.g., HR calls /admin/memberships with body.role='HR').
4. **403 cross-tenant** — caller's JWT is for Company A, body references Company B entities (where applicable). For R5, supervisor must be in caller's company.
5. **Happy path** — full create succeeds, response matches Zod, DB row + AuditEvent written.

### Schema migration tests (3)

1. Salary fields readable on Membership after migration; absent on Worker.
2. mark-absent service still computes correct payDeductPaise via Membership join.
3. Worker without User (userId=null) → mark-absent returns NO_MEMBERSHIP_FOR_PAYROLL gracefully.

### Authority table test (1)

1. The HIRING_AUTHORITY const matches the table in docs/locked/hiring-hierarchy.md (parsed at test time).

### Total

**29 new integration tests.** Run against real Railway DB via `railway run -- pnpm --filter @axhy/backend test:integration`. Local CI runs against the dockerised Postgres.

## Enterprise baseline (E1-E14) per route

| Item                  | How addressed                                                                                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1 Security           | JWT + caller-role gate + target-role gate on every route. No userId/companyId from body.                                                                                                                       |
| E2 Tenant ownership   | `withTenantContext(prisma, caller.companyId, ...)` wraps every write. Cross-tenant attempts 403 by construction.                                                                                               |
| E3 Rate limit         | Per-user Redis rate limit at 30/min default on each /admin/\* route (less burst-tolerant than worker routes since HR onboarding has lower volume than worker daily reads). Env-tunable.                        |
| E4 Source of truth    | hiring-hierarchy.md (lock) is the rule. HIRING_AUTHORITY const literal is the code mirror; CI asserts they match.                                                                                              |
| E5 State machines     | Worker create goes through workerMachine (PENDING_ACTIVATION entry). Anonymize through identity-lifecycle service. No direct status writes.                                                                    |
| E6 Data loss          | Migration is reversible with a documented rollback (data copy is preserved during the transition window; drop step is gated on backfill verification).                                                         |
| E7 Mobile/web         | Routes are backend-only; no mobile/web platform branching needed. Web admin UI lives in a later slice.                                                                                                         |
| E8 App crash          | Every route catches and returns specific errors; never throws to Fastify default.                                                                                                                              |
| E9 Scale              | Membership unique index covers the role-gate join; Site/Binding lookups indexed by companyId. No N+1. Membership table is bounded by company headcount (max ~3000 for a 2K-worker shop with HR + supervisors). |
| E10 Doc truth         | This plan matches code shipped; ADR-0025 captures the schema decision; locked doc cited from each route.                                                                                                       |
| E11 Required tests    | 29 integration tests covered above.                                                                                                                                                                            |
| E12 Error specificity | Each code maps to one failure: AUTH_REQUIRED, FORBIDDEN_WRONG_ROLE, FORBIDDEN_TARGET_ROLE, MEMBERSHIP_ALREADY_EXISTS, WORKER_NOT_FOUND, WORKER_ALREADY_TERMINATED, SUPERVISOR_NOT_FOUND, BAD_INPUT, INTERNAL.  |
| E13 Secrets           | None handled in this slice; JWT_SECRET already provisioned.                                                                                                                                                    |
| E14 Non-deferrable    | All non-deferrable categories addressed; no deferrals requested.                                                                                                                                               |

## Implementation order (proposed for the plan)

Phase A (schema):

1. Write ADR-0025 (salary on Membership).
2. Write Prisma migration (move 3 fields + backfill + drop).
3. Update mark-absent service + tests.
4. Run migration against Railway, verify backfill.

Phase B (foundation routes): 5. Write `role-gates.ts` middleware + tests. 6. Write Zod schemas for the 5 routes in `packages/shared-schema/src/zod/admin-*.ts`. 7. Write R1 (memberships) route + service + tests.

Phase C (worker + anonymize): 8. Write R2 (workers) route + service + tests. 9. Write R3 (anonymize) route + service + tests.

Phase D (sites + bindings): 10. Write R4 (sites) route + tests. 11. Write R5 (bindings) route + tests.

Phase E (verify + ship): 12. Run all 29 integration tests against Railway DB. 13. Run full session audit + typecheck. 14. Commit (locked doc + ADR + migration + routes + tests as one logical change) with `AXHY_FOUNDER_APPROVED=1` since locked doc is part of the diff. 15. Push to main; Railway redeploys; smoke-verify /admin/\* routes return correct shape via curl.

Estimated total: 6-10 hours focused implementation.

## After this slice lands

Wave 2 resumes with:

- `qa-seed-multi-persona.ts` rewritten to use real APIs (no raw Prisma writes for membership/worker/site/binding creates).
- `qa-multi-persona-walk.ts` extended to walk: HR creates supervisor → supervisor logs in → supervisor sees expected screens → HR creates worker → worker logs in → worker sees supervisor's site → worker submits visit → supervisor verifies → all assertions green.
- Real-device checklist for camera/AI/push (unchanged from wave-2 declaration).
- WORKER_QA_FINDINGS_2026-05-25-wave2.md captures end-to-end verified=true/false.

## Risk register

| Risk                                                                       | Severity | Mitigation                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration locks the `axhy.Worker` table during column drop on Railway prod | HIGH     | Run during a known idle window; use `ALTER TABLE ... DROP COLUMN` (DDL, not data move) after backfill is verified via SQL `SELECT COUNT(*)` from both tables. Expected lock duration small at current row count (verified at migration time via EXPLAIN); if estimates exceed 5s, defer the drop step to a second migration and run during a deploy gap. |
| Other services read Worker.baseSalaryPaise besides mark-absent             | MEDIUM   | Phase A step 3 includes `grep -rn "baseSalaryPaise\|bankIfsc\|bankAcct" apps/backend packages` before touching the migration. Every consumer migrates in the same diff. CI typecheck catches missed cases.                                                                                                                                               |
| Existing fixtures break after schema migration                             | MEDIUM   | Update all fixture-bearing test files in Phase A step 3 before any route work begins. CI catches missed cases.                                                                                                                                                                                                                                           |
| Authority table drifts from locked doc                                     | MEDIUM   | CI test that parses the locked doc markdown table and asserts it matches the HIRING_AUTHORITY const. Drift fails build.                                                                                                                                                                                                                                  |
| Anonymize service has unstated coupling to Worker fields that just moved   | LOW      | Read identity-lifecycle service end-to-end during Phase A step 3. If it touches the 3 moved fields, refactor to read from Membership in the same step.                                                                                                                                                                                                   |
| HR pod assignment (podId) for the SUPERVISOR target role is ambiguous      | LOW      | Per current Membership schema, podId is only meaningful when role=HR. Zod schema rejects podId for non-HR targets.                                                                                                                                                                                                                                       |

## Open questions (none — all answered before this plan was written)

1. ~~Endpoint design A/B/C~~ → A (two endpoints).
2. ~~Salary location~~ → Membership.
3. ~~Hiring hierarchy~~ → admin→HR; HR→supervisor+worker (locked).
4. ~~Assignment in scope~~ → no, /worker/today reads Visit directly.
5. ~~SUPER_ADMIN company create~~ → out of scope, QA Test Co exists.
6. ~~UI in scope~~ → no, backend only.

If any of the above changes during execution, this plan needs an `## Amendment YYYY-MM-DD` section and the writing-plans skill should be re-invoked from the amended doc.
