# 10 — API Contracts

> Source of truth: `99_CANON_FACTS.md` §8, §12. Primary source: `apps/backend/src/server.ts:173-208` + route files (kept) and the closure spec (to build). The fresh UI calls the backend through `apps/admin-web/lib/api.ts` `fetchJson` (server-only, attaches the httpOnly cookie as `Authorization: Bearer`). The `@axhy/api-client` package is an empty stub — either keep `fetchJson` or finally generate the client (`11 §6`).

Two sections: **A. Kept endpoints** (wire the fresh UI to these as-is) and **B. Endpoints to build** (the GAP features). Every endpoint is `companyId`-scoped from the JWT and writes an AuditEvent on success.

---

## A. Kept endpoints (backend exists, fresh UI consumes)

| #   | Method · Path                                  | Role gate                        | Request → Response                                                                                                                         | Notes / errors                                                                                                                                                                                                                                                |
| --- | ---------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | POST `/admin/memberships`                      | OWNER, HR                        | `{phone,name,role:'HR'\|'SUPERVISOR',baseSalaryPaise,bankIfsc?,bankAcct?,podId?}` → `{membershipId,userId,role,status}`                    | `assertTargetRole`; 403 FORBIDDEN_TARGET_ROLE; 409 MEMBERSHIP_ALREADY_EXISTS; audit `MEMBERSHIP_CREATED`; owner-notify                                                                                                                                        |
| 2   | GET `/admin/memberships`                       | OWNER, HR                        | `?limit≤50&cursor` → `{items[{id,userId,role,status,podId,createdAt,user{name,phone}}],nextCursor}`                                        | HR pod-scoped; cursor = base64 `(createdAt,id)`                                                                                                                                                                                                               |
| 3   | POST `/admin/workers`                          | HR                               | `AdminCreateWorkerInput{phone,name,baseSalaryPaise,bankIfsc?,bankAcct?,preferredLanguage,podId?}` → `{workerId,userId,membershipId,state}` | creates Worker(PENDING_ACTIVATION); audit `WORKER_CREATED`                                                                                                                                                                                                    |
| 4   | GET `/admin/workers`                           | OWNER, HR                        | `?limit≤100&cursor` → `{items[{workerId,name,phone,state,podId,anonymizedPhone}],nextCursor}`                                              | **`workerId = Worker.id`**; HR pod-scoped                                                                                                                                                                                                                     |
| 5   | GET `/admin/workers/:id`                       | OWNER, HR                        | `:id=Worker.id` → worker detail                                                                                                            | 404 cross-tenant/out-of-pod (no existence leak)                                                                                                                                                                                                               |
| 6   | POST `/admin/workers/:id/anonymize`            | HR                               | `{reason,effectiveAt?}` → `{workerId,anonymizedAt}`                                                                                        | 404 NOT_FOUND / 409 ALREADY_TERMINATED; audit `WORKER_ANONYMIZED`; **owner-notify** (membership deactivated → GAP 7 remove side)                                                                                                                              |
| 7   | GET `/admin/sites` · `/:id` · `/:id/bindings`  | OWNER, HR                        | → list / detail / bindings (joins User)                                                                                                    | tenant-wide (sites not pod-anchored)                                                                                                                                                                                                                          |
| 8   | POST `/admin/sites`                            | OWNER, HR                        | `{name,address?,lat?,lng?,workdays}` → site                                                                                                | Site(DRAFT); audit `SITE_CREATED`                                                                                                                                                                                                                             |
| 9   | POST `/admin/sites/:id/bindings`               | OWNER, HR                        | `AdminCreateBindingInput{supervisorUserId,effectiveFrom,effectiveUntil?,actingForUserId?,reason}` → `{bindingId}`                          | 404 SITE/SUPERVISOR_NOT_FOUND; acting requires `effectiveUntil`; writes handoff; audit `BINDING_CREATED` + `HANDOFF_PACKAGE_GENERATED`; **same-day freeze**                                                                                                   |
| 10  | POST `/admin/policy`                           | requireAuth + `policy-write-acl` | `{key,value,category}` → `{policyId,setAt,previousValueSnapshot}`                                                                          | 403 POLICY_KEY_FORBIDDEN_FOR_ROLE; append-only; owner-notify. **Key ACL (`rule-hierarchy-three-layers.md:44-49`): `ai.rules.hr.*` → HR/OWNER; `ai.rules.company.*` → COMPANY_ADMIN/OWNER; `ai.limits.*` → OWNER only.** HR writing a company/limits key → 403 |
| 11  | GET `/admin/owner-summary`                     | OWNER, SUPER_ADMIN               | → counts + policies                                                                                                                        | dashboard (owner; HR uses pod-home GAP instead)                                                                                                                                                                                                               |
| 12  | POST `/leave-requests`                         | requireAuth                      | `{workerId,fromDate,toDate,reason}` → 201                                                                                                  | worker-created                                                                                                                                                                                                                                                |
| 13  | GET `/leave-requests`                          | HR                               | `?cursor` → REQUESTED leaves in my pods                                                                                                    | HR inbox                                                                                                                                                                                                                                                      |
| 14  | GET `/leave-requests/:id`                      | HR, SUPERVISOR                   | → detail                                                                                                                                   | pod/portfolio gated; 404 otherwise                                                                                                                                                                                                                            |
| 15  | POST `/leave-requests/:id/approve` · `/reject` | SUPERVISOR or HR                 | `{decisionNote?}`/`{reason}` → updated                                                                                                     | race-safe `updateMany`; audit `LEAVE_APPROVED/REJECTED`; outbox `worker.leave_*`                                                                                                                                                                              |
| 16  | GET `/supervisor/updates`                      | requireAuth                      | → `{needsAck,recentAcked}`                                                                                                                 | supervisor consumer of HR Updates                                                                                                                                                                                                                             |
| 17  | POST `/supervisor/updates/:id/acknowledge`     | requireAuth                      | `{ackText (≥5 words)}` → ok                                                                                                                | audit `HR_UPDATE_ACKED`                                                                                                                                                                                                                                       |

**Auth (shared):** `POST /auth/otp/request`, `POST /auth/otp/verify` → `{accessToken, refreshToken, memberships[]}` (**not `user`** — §12.3); JWT subject = `sub` = User.id (§12.2). Dev OTP bypass `123456`.

---

## B. Endpoints to build (GAP features)

> **⚠ NONE of the endpoints in this section exist yet.** Every path, request, and response below is a _proposal_ to build, not a kept contract — confirm all shapes at backend-build time. (Contrast with §A, which is live code.)

These realize the closure-spec surfaces. Shapes are proposed (`[ASSUMPTION]` where the closure spec doesn't pin them) and should be confirmed at backend-build time. All HR-only, pod-scoped, audited. Plus the deferred accounts surfaces from `05` G2–G5 (document/KYC, advances ledger, statutory config, F&F) which need their own tables + routes — sketched in `14`, not enumerated here.

### Pods

| Method · Path               | Request → Response                                         | Audit                                |
| --------------------------- | ---------------------------------------------------------- | ------------------------------------ |
| `POST /hr-pods`             | `{name,primaryOwnerUserId,backupOwnerUserId?}` → pod       | pod create                           |
| `PATCH /hr-pods/:id`        | `{name?,primaryOwnerUserId?,backupOwnerUserId?}` → pod     | pod update                           |
| `GET /hr-pods`              | → my pods + counts (worker/supervisor/open-queue/breaches) | —                                    |
| `POST /hr-pods/:id/members` | `{userId,role:'worker'\|'supervisor'}`                     | `MEMBERSHIP_POD_ASSIGNED/REASSIGNED` |

### Queue & locks

| Method · Path                       | Request → Response                                                                                  | Notes                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `GET /hr-queue`                     | `?pod&tier&tab` → projected items `{id,kind,sourceRef,slaTier,age,hoursLeft,lockedBy,audience,pod}` | tier-first ordering; `[ASSUMPTION]` projection until a `QueueItem` table is chosen |
| `POST /hr-queue/:id/lock`           | → `{lockedBy:me,expiresAt}`                                                                         | `HR_QUEUE_LOCK_ACQUIRED`; 409 if held                                              |
| `POST /hr-queue/:id/unlock`         | → ok                                                                                                | `HR_QUEUE_LOCK_RELEASED`                                                           |
| `POST /hr-queue/:id/request-unlock` | → pings holder                                                                                      | notification to holder                                                             |

### Coverage verbs

| Method · Path                      | Request → Response                                                                       | Notes                                                                                                                                                              |
| ---------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /coverage/acting`            | `{awayUserId,from,until,coverUserId,reason}` → `{bindingIds}`                            | capacity context fetched via `GET /coverage/candidates`; freeze                                                                                                    |
| `GET /coverage/candidates`         | `?awayUserId&from&until` → `[{userId,name,siteCount,recentDecisionVolume}]`              | for the picker; **no AI pre-pick**                                                                                                                                 |
| `POST /coverage/acting/:id/cancel` | `{notificationText}` → ok                                                                | **notification text required** (Month-8 fix); ends bindings — **binding-end is same-day-frozen** (effective next tenant-midnight, S-001), not just the create side |
| `POST /coverage/reassign`          | `{siteId,newUserId,reason}` → `{bindingId}`                                              | permanent; supersedes; freeze                                                                                                                                      |
| `POST /coverage/switch-all`        | `{fromUserId, assignments:[{siteId,newUserId}], deactivateMembership?}` → `{bindingIds}` | **atomic** (all-or-nothing); freeze; if `deactivateMembership` → **owner-notify** (GAP 7 remove side)                                                              |

### Termination

| Method · Path                              | Request → Response                                                      | Notes                                                                                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /terminations/:decisionId`            | → decision + `originContext` + worker history + `proposedDuringAbsence` | reads SupervisorDecision                                                                                                                    |
| `POST /terminations/:decisionId/ack`       | `{typedPhrase, ackNotes}` → ok                                          | **wires the HR-ack lock + worker-machine driver (currently unwired)**; worker→TERMINATION_PENDING→TERMINATED; 3-audience push; opens appeal |
| `POST /terminations/:decisionId/send-back` | `{reason}` → ok                                                         | dismisses decision                                                                                                                          |

### HR Updates (create side)

| Method · Path      | Request → Response                                        | Notes                                                                                                                            |
| ------------------ | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `POST /hr-updates` | `{kind,content,rules?[],ackRequired,ackPhrase?}` → update | HR-only; single-tier digest; soft cap 10 (warn header, not reject); audience = all supervisors (F-P-6); audit `HR_UPDATE_POSTED` |
| `GET /hr-updates`  | → sent list + ack counts                                  | composer's SCAN list                                                                                                             |

### Notifications / digests (HR-facing reads)

| Method · Path                     | Notes                                                                               |
| --------------------------------- | ----------------------------------------------------------------------------------- |
| `GET /notifications`              | this HR user's notifications (owner-notify echoes, fallback pings, unlock requests) |
| `POST /notifications/:id/ack`     | mark read                                                                           |
| `GET /digests?kind=hr_team_daily` | HR's daily rollup                                                                   |

### Bootstrap & audit

| Method · Path                                | Notes                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------- |
| `GET /bootstrap-review`                      | seeded bindings + alternatives + status + age                                         |
| `POST /bootstrap-review/:bindingId/confirm`  | `BOOTSTRAP_SEED_CONFIRMED`; `bypassFreezeReason`                                      |
| `POST /bootstrap-review/:bindingId/reassign` | `{newUserId}` → `BOOTSTRAP_SEED_REASSIGNED`                                           |
| `GET /audit-chain`                           | `?site&supervisor&from&to&kind` → timeline (read-only; **not a bulk export**, INV 13) |

### Payroll-close (prep only)

| Method · Path                   | Notes                                                                                                                                                                                                                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /payroll-close?period&pod` | computed per-worker **attendance+base** summary from attendance+LeaveRequest+overtime+`Membership.baseSalaryPaise` (Visit has no earnings field; the `SiteVisit.earningsPaise` warning is v1/v2 cruft, not in v3). **v1 excludes statutory/advances/pro-rata/F&F** (see `05` G2–G5) |
| `POST /payroll-close/approve`   | locks the period summary; **no money moves** (engine is a Phase-D stub)                                                                                                                                                                                                             |

---

## C. Conventions every endpoint follows

- **Auth:** Bearer JWT (subject `sub` = User.id); `requireRole(...)` preHandler; `withTenantContext` on writes (also blocks non-ACTIVE companies, 403).
- **Errors:** typed code per failure (`AUTH_REQUIRED`, `FORBIDDEN_WRONG_ROLE`, `FORBIDDEN_TARGET_ROLE`, `BAD_INPUT`, `NOT_FOUND`, `ALREADY_EXISTS`, `CURSOR_INVALID`, `POLICY_KEY_FORBIDDEN_FOR_ROLE`, `COMPANY_NOT_ACTIVE`, lock 409s).
- **Pagination:** cursor = base64url `(createdAt,id)`; `limit` capped per route.
- **Rate limit:** per-user, default 100/min (tunable).
- **Idempotency:** ack/decide endpoints are idempotent on identical retry; conflicting retry → 409.
- **Pod scope:** HR routes filter to `getMyPodIds`; out-of-pod detail → 404 (no existence leak).
- **`canX` flags:** list/detail responses include the booleans the UI needs (`canApprove`, `canAck`, `isLocked`, `lockedBy`, `companyActive`) so the client renders legality without re-deriving it (`03 §1`).

> **Build note:** the `canX`-in-response pattern is partly aspirational on the kept routes; adding it consistently is part of wiring the fresh UI. Where a kept route doesn't yet return a flag, the UI derives the minimum it needs and the backend catches the rest with its gates (defense-in-depth).
