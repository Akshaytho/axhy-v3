# 08 — Data Model (what HR sits on)

> Source of truth: `99_CANON_FACTS.md` §7, §12. Primary source: `packages/shared-schema/prisma/schema.prisma` (read live; line numbers cited). The HR portal **adds no new tables of its own** for the kept features; the GAP features need the tables/routes called out in §3.

This doc is the contract layer. The fresh UI reads and writes these models through the backend; it never touches Postgres directly. The most important fact on this page: **`Worker.id`, `User.id`, and `Membership.id` are three different identifiers** — confusing them is the single biggest bug class (§4).

---

## 1. Models the HR portal reads/writes (live today)

### Membership — the org-chart row (`schema.prisma:130-169`)

The center of HR's world. Salary and bank live here (ADR-0025), **not** on Worker.

| Field             | Type   | Notes                                                  |
| ----------------- | ------ | ------------------------------------------------------ |
| `id`              | uuid   | PK                                                     |
| `companyId`       | uuid   | tenant scope                                           |
| `userId`          | uuid   | → User                                                 |
| `role`            | string | holds the Role enum value                              |
| `status`          | string | default `ACTIVE`; one ACTIVE per user (partial unique) |
| `tokenEpoch`      | int    | bump invalidates all access tokens                     |
| `podId?`          | uuid   | → HRPod; **meaningful only when role=HR**              |
| `baseSalaryPaise` | int    | default 0; monthly salary in paise                     |
| `bankIfsc?`       | string | `@personal` PII                                        |
| `bankAcct?`       | string | `@personal` PII                                        |

`@@unique([companyId, userId, role])`. Indexes: `[companyId]`, `[userId]`, `[companyId, podId]`.

### Worker — the worker record (`:243-275`)

| Field               | Type           | Notes                                      |
| ------------------- | -------------- | ------------------------------------------ |
| `id`                | uuid           | **PK — distinct from User.id**             |
| `companyId`         | uuid           | tenant scope                               |
| `userId?`           | uuid `@unique` | null pre-activation and after anonymize    |
| `name`/`phone`      | string         | `@personal`                                |
| `state`             | string         | default `INVITED`; 15-state machine (`09`) |
| `preferredLanguage` | string         | default `hi`                               |
| `joinedAt`          | ts             |                                            |

`@@unique([companyId, phone])`. **`LeaveRequest.workerId` and anonymize key on `Worker.id`.**

### HRPod — the queue partition (`:1114-1133`)

| Field                   | Type | Notes               |
| ----------------------- | ---- | ------------------- |
| `id`/`companyId`/`name` |      |                     |
| `primaryOwnerUserId`    | uuid | default queue owner |
| `backupOwnerUserId?`    | uuid | covers >24h absence |

Relation `memberships[]`. **Schema-only — no CRUD route yet (GAP).**

### SiteSupervisorBinding — acting + permanent coverage (`:1273-1310`)

| Field                              | Notes                                              |
| ---------------------------------- | -------------------------------------------------- |
| `siteId`, `userId`                 | site + responsible supervisor (User.id)            |
| `actingForUserId?`                 | **discriminator**: NULL = permanent / set = acting |
| `effectiveFrom`, `effectiveUntil?` | `effectiveUntil` required for acting               |
| `reason`, `createdBy`              | createdBy = the HR user                            |
| `endedAt?`, `endedReason?`         | manual early end                                   |
| `handoffPackage?`                  | frozen JSON snapshot, written in the same tx       |

No-overlap per `(siteId, acting-vs-permanent)` via Postgres `EXCLUDE USING gist` (migration, not Prisma DSL). **There is no `kind` column** — the discriminator is a CASE over `actingForUserId` written into the migration SQL (`schema.prisma:1267-1268`); don't grep the model for `kind`.

### LeaveRequest (`:507-530`)

`workerId` (**Worker.id**), `fromDate`/`toDate`, `reason`, `state` (string, default `REQUESTED`; **no XState machine** — service-enforced `REQUESTED → APPROVED|REJECTED`), `decidedBy?`/`decidedAt?`/`decisionNote?`.

### Policy — append-only config (`:1146-1166`)

`key` (dotted), `value Json`, `setBy`, `setAt`, `previousValueSnapshot?`, `category ∈ sla|notification|worker|hr|ai|owner|handoff`. Current value = latest row by `setAt`. Write ACL in `apps/backend/src/lib/policy-write-acl.ts`. **HR may write `hr`/`sla`/etc. but not company/ai-limits keys.**

### HRUpdate (`:1034-1064`)

`hrId`, `kind`, `content`, `targetSupervisorId?` (null = org-wide), `acknowledgmentRequired`, `acknowledgmentPhrase?`, `acknowledgedBy?`/`acknowledgedAt?` (single uuid — v0, no per-supervisor ack join). Supervisor _consumer_ endpoints exist; **HR-create route is a GAP.**

### SupervisorDecision — the "DWI" table (`:929-981`)

`kind`, `tier ∈ NOTE|OPERATIONAL|PERSONNEL|EMPLOYMENT`, `targetId?`, `appliedAt?`/`dismissedAt?` (PROPOSED iff both null), `ackRequired`, `ackedAt?`, **`originContext? Json`**, **`proposedDuringAbsence` bool`**. The EMPLOYMENT-tier termination ack (S16) reads this.

### AuditEvent — immutable system-of-record (`:543-568`)

`kind` (free-string taxonomy), `actorId` (no FK — survives actor delete), `targetId?`, `payload Json`, `createdAt`. INSERT-only. HR-relevant kinds:
`MEMBERSHIP_CREATED`, `MEMBERSHIP_POD_ASSIGNED/REASSIGNED`, `WORKER_CREATED`, `WORKER_OTP_VERIFIED`, `WORKER_ANONYMIZED`, `WORKER_TERMINATION_REQUESTED`, `SITE_CREATED`, `BINDING_CREATED`, `BINDING_ENDED_AUTO/MANUAL/SUPERSEDED_BY_PERMANENT`, `HANDOFF_PACKAGE_GENERATED`, `LEAVE_REQUESTED/APPROVED/REJECTED/REVERSED`, `HR_UPDATE_ACKED`, `POLICY_CHANGED`, + closure additions `HR_QUEUE_LOCK_ACQUIRED/RELEASED/EXPIRED/FORCE_RELEASED`, `HR_FALLBACK_INVOKED`, `HR_CROSS_POD_OVERRIDE_USED`, `BOOTSTRAP_SEED_CONFIRMED/REASSIGNED`.

### Supporting (read for context)

- **Attendance** (`:686-713`) — one row per `(workerId, date)`, `status`, `payDeductPaise`. Feeds payroll-close.
- **Complaint** (`:722-783`) — `state ∈ OPEN|IN_HR|RESOLVED|DISMISSED`, `unreadHrRepliesCount`.
- **Site** (`:212-241`) — `state` string (no machine), `workdays`.
- **Visit** (`:277-322`) — 12-state machine; `BILLABLE_VISIT_STATES` feed payroll-close. **Has no earnings/paise field** — pay = `Membership.baseSalaryPaise` × attendance, never a per-visit amount. (The old `SiteVisit.earningsPaise` warning in the payment memo is v1/v2; no such field exists in v3. And closure §5.3.10 says `Worker.baseSalaryPaise`, which also doesn't exist — salary is on Membership per ADR-0025; closure is stale on the field name.)
- **Company / User** — tenant + identity; `User.is_platform_admin` is the SUPER_ADMIN bit.

---

## 2. Notification & Digest (delivery machinery)

- **Notification** (`:1179-1208`) — `audienceUserId? XOR audienceWorkerId?`, `kind`, `channel ∈ push|sms|whatsapp_out|email|in_app_banner`, `priority ∈ URGENT|NEXT_DAY|STANDARD|DIGEST`, delivery timestamps. Dispatcher handler exists; **no HR read/ack API (GAP).**
- **Digest** (`:1218-1244`) — `audienceUserId`, `kind ∈ owner_monthly|owner_incident|owner_annual|hr_team_daily|supervisor_while_you_were_out`, `periodStart/End`, `body Json`. Schema-only stub; **no composer/API (GAP).**

---

## 3. Gaps — what the GAP features need

The closure-spec HR surfaces (`05` Area B3–B5, C1–C4, D2, E2, F1–F2, G1) need these, none of which exist as a usable contract yet:

| Need                      | Today                                                 | To build                                                                                                                                                                                             |
| ------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **QueueItem**             | **no table** — queue is conceptual                    | A `QueueItem` table (or a stable projection view) with `slaTier`, `escalatedAt`, `lockedBy`, `lockExpiresAt`, source ref. The closure spec describes the projection; pick projection-vs-table early. |
| **HRPod CRUD**            | schema only                                           | `POST/PATCH/GET /hr-pods` (HR-only) + `MEMBERSHIP_POD_ASSIGNED` writes                                                                                                                               |
| **Pod lock**              | none                                                  | `lockedBy`/`lockExpiresAt` on the queue row + acquire/release/force endpoints + `HR_QUEUE_LOCK_*` audits                                                                                             |
| **Notification read/ack** | dispatcher only                                       | `GET /notifications`, `POST /notifications/:id/ack` (HR-facing)                                                                                                                                      |
| **Digest**                | stub                                                  | composer (`hr_team_daily`) + `GET /digests`                                                                                                                                                          |
| **HRUpdate create**       | consumer only                                         | `POST /hr-updates` (HR-only), single-tier digest, soft cap 10                                                                                                                                        |
| **Acting-cover verbs**    | only raw binding create                               | cancel/re-pick with notification text; permanent-reassign verb; switch-all-sites atomic endpoint                                                                                                     |
| **Bootstrap review**      | migration script only                                 | seeded-binding rows + confirm/reassign endpoints + `BOOTSTRAP_SEED_*` audits                                                                                                                         |
| **Termination ack**       | `SupervisorDecision` row exists, **driver not wired** | the HR-ack lock + worker-machine transition driver + `originContext` population + 3-audience push                                                                                                    |
| **Payroll-close**         | nothing                                               | a read-only summary composer over Visit+LeaveRequest+salary; **no payment engine**                                                                                                                   |
| **Same-day freeze**       | server guard exists for bindings                      | ensure every new binding verb calls `assertNotChangingTodaysResponsibility`                                                                                                                          |

These map 1:1 to the build layers in `14_BUILD_ORDER_AND_ACCEPTANCE.md`.

---

## 4. The identity contract (read this twice)

```
User.id        ← JWT `sub`; pod ownership; createdBy; bindings (userId)
Membership.id  ← the org-chart row id (rarely surfaced)
Worker.id      ← LeaveRequest.workerId; anonymize target; /admin/workers/:id
```

- **Surface `Worker.id` as `workerId` everywhere** a worker action happens. The first HR-A1 cut exposed `Membership.userId` and would have made every anonymize 404 and every leave inbox empty (fixed in `1edbbfd`).
- **Pod scoping joins `Worker → User → Membership`** to find a worker's pod (the pod lives on the Membership, and the link is via `Worker.userId = User.id` and `Membership.userId = User.id`). A worker with `userId = null` (pre-activation or anonymized) has special handling.
- Build a single `workerIdentity` helper used by every worker-touching route; don't re-derive per route (cross-route drift is invisible to per-route audits — memory `feedback_persona_graph_route_audit`).

---

## 5. Tenant, audit, and append-only rules (always)

- Every read/write is `companyId`-scoped (INV 1); writes wrap `withTenantContext`, which also blocks non-ACTIVE companies (INV 2).
- Every HR action writes one immutable `AuditEvent` (INV 9).
- `Policy` and `AuditEvent` are **append-only** — no UPDATE/DELETE (INV 8/9). "Deleting" a policy = inserting a row with `value:null`.
- State-machined entities (Worker) transition **only via the machine** — no direct status writes (INV 10).
- Offboarding **anonymizes**, never deletes; history is retained forever (INV 11).
