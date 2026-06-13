# HR Portal — System Flow & Build Contract

**Date:** 2026-06-13 · **Status:** Authoritative (verified against source) · **Property:** `app.axhy.app/hr`
**How this was built:** 22 agents read every HR route + service + state-machine file and adversarially re-verified each claim. Every endpoint below is quoted from real code. Nothing is guessed.

**Legend:** `EXISTS` = endpoint live in the backend today (path verified). `NEW` = screen needs it; backend must build it. Tag is on every action — once built it's fixed, so this line is the contract.

---

## 0. THE ONE FACT THAT SHAPES THE BUILD

The backend was built **supervisor-first**. Of the HR portal's surfaces, exactly **one is fully backed today: Leave.** The rest are partial or read-only-or-write-only. The HR write surface (suspend/terminate a worker, edit a worker, the late-reversal review queue, authoring company updates, policy read/history, revoking a teammate) **does not exist yet** and is the build backlog in §5.

Design the screens fully now; the data wiring lands endpoint-by-endpoint. A screen with no backing endpoint renders its empty/coming-soon state until §5 ships it.

---

## 1. GLOBAL REQUEST CONTRACT (every endpoint obeys this — verified)

| Concern           | Exact rule                                                                                                                                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Base URL          | `https://backend-production-344e1.up.railway.app/v1` (mobile/portal pin `/v1`; bare paths also accepted during compat window)                                                                                        |
| Auth context      | `req.auth = { userId, companyId, role, membershipId, epoch }` — decoded from the session; the client never sends `companyId`                                                                                         |
| Auth gate         | `requireAuth` (401 if no/invalid session) then `requireRole('HR')` (403 if wrong role). Some routes allow `('OWNER','HR')` or `('HR','SUPERVISOR')` — noted per endpoint                                             |
| Tenant isolation  | `withTenantContext` / `withTenantRead(prisma, auth.companyId, …)` sets Postgres GUC `axhy.current_company_id`; RLS FORCE on 27 tables is the last line. Reads also carry explicit `WHERE companyId = auth.companyId` |
| HR site-anchoring | `getHrSiteIds(prisma, auth.userId, auth.companyId)` → the site IDs where `Site.ownerHrUserId = me`. HR sees only workers with an `Assignment` (state `ACTIVE`                                                        | `DRAFT`) to those sites. **No sites ⇒ empty lists, by design.** |
| Success response  | the object directly (no envelope), e.g. `{ items, nextCursor }` or `{ ok: true, … }`                                                                                                                                 |
| Error response    | `{ error: 'CODE', message? }` + HTTP status. Codes are exact strings (e.g. `QUERY_INVALID` 400, `COMPLAINT_TERMINAL` 409, `WINDOW_OPEN` 422, `SUPERVISOR_ROLE_REQUIRED` 403)                                         |
| List pagination   | cursor-based: `?cursor=<opaque>&limit=<n>` → `{ items, nextCursor }`. Cursor is `createdAt DESC, id DESC`                                                                                                            |
| Dates             | request/response dates `YYYY-MM-DD`; timestamps ISO 8601; display en-IN                                                                                                                                              |
| Audit             | every write appends an immutable `AuditEvent` row (often in the same tx). Audit is INSERT-only; Company→AuditEvent FK is `RESTRICT` (migration 031). No edit, no delete, anywhere                                    |
| Side-effects      | writes that notify enqueue an `Outbox`/`Notification` row in-tx (e.g. leave approve, membership create)                                                                                                              |

---

## 2. AUTH + SESSION + SHELL (EXISTS — fully backed)

```
Login screen → OTP screen → role lands area
```

| Step         | Endpoint                                 | Request                    | Response                                                                                                                                          | Writes                           |
| ------------ | ---------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Request OTP  | `POST /auth/otp/request` EXISTS (public) | `phone` E.164 (auto +91)   | `{ ok, resendInSeconds }`                                                                                                                         | — (Redis)                        |
| Verify OTP   | `POST /auth/otp/verify` EXISTS (public)  | `phone`, `code` (6 digit)  | `{ ok, accessToken, refreshToken, memberships:[{companyId,companyName,role}] }`                                                                   | `User, RefreshToken, AuditEvent` |
| Load session | `GET /me` EXISTS (`requireAuth`)         | —                          | `{ user:{id,phone,name,locale}, activeCompany:{id,name,slug}, activeRole, availableRoles, memberships, notificationPrefs:{push,whatsapp,email} }` | —                                |
| Notif prefs  | `PATCH /me/notification-prefs` EXISTS    | `{push?,whatsapp?,email?}` | `{ ok, notificationPrefs }`                                                                                                                       | `Membership, AuditEvent`         |
| Sign out     | `POST /auth/sign-out` EXISTS             | `refreshToken?`            | `{ ok }`                                                                                                                                          | `RefreshToken` (revoke)          |

**Shell wiring:** portal middleware → no session → `/login`. `GET /me` gives `activeRole`; if `HR` render the HR shell. The sidebar/queue-badge counts (§3.1) need a NEW `GET /hr/overview`. Session expiry = any `/v1` call returns 401 → redirect `/login?next=…`.

**Note (NEW for web):** `/auth/otp/verify` returns tokens for the **mobile** Bearer model. The portal needs the backend to ALSO set an **httpOnly session cookie** on verify (the admin-web cookie pattern) — `NEW: cookie-session on verify` so the browser portal isn't holding a JWT in JS.

---

## 3. SCREEN-BY-SCREEN FLOW (UI → endpoint → service → machine → DB)

### 3.1 Home `/hr`

**Contains:** greeting; 4 queue stat-cards (pending leave, open complaints, swap requests, reversal requests) with counts + oldest-waiting; today strip (visits verified/flagged); recent activity (last 10 audit rows).
**Reads:** `NEW: GET /hr/overview` → `{ leavePending, complaintsOpen, swapsPending, reversalsPending, visitsToday:{verified,flagged}, recentActivity:[…] }`. (No single endpoint aggregates this today — each count currently needs a separate list call; the build collapses them.)
**Connects to:** each card → its queue screen (§3.4–3.7); today strip → Record filtered today (§3.11).

### 3.2 Workers `/hr/workers` (data-field detail in `02a-hr-workers-data-spec.md`)

| Action                                       | Endpoint                                                                                                                                                                | Service                  | Machine                                                                                      | DB written                          | Tag                                            |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------- |
| List                                         | `GET /admin/workers?cursor&limit` role `OWNER,HR` → `{items:[{workerId,userId,membershipId,status,podId,name,phone,anonymizedPhone,createdAt}],nextCursor}`             | admin-worker-service     | —                                                                                            | —                                   | EXISTS                                         |
| Detail                                       | `GET /admin/workers/:id` role `OWNER,HR` → `{workerId,userId,membershipId,status,podId,state,name,phone,anonymizedPhone,createdAt}`                                     | admin-worker-service     | —                                                                                            | —                                   | EXISTS                                         |
| Add worker                                   | `POST /admin/workers` role `HR`; body `phone,name,baseSalaryPaise,bankIfsc?,bankAcct?,preferredLanguage?` → `{workerId,userId,membershipId,state:'PENDING_ACTIVATION'}` | admin-worker-service     | worker → entry `PENDING_ACTIVATION`                                                          | `User,Membership,Worker,AuditEvent` | EXISTS                                         |
| Anonymise                                    | `POST /admin/workers/:id/anonymize` role `HR`; body `reason(1-500),effectiveAt?` → `{workerId,anonymizedAt}`                                                            | anonymize-worker-service | worker `TERMINATION_PENDING → TERMINATED` (guard `WORKER_NOT_PENDING_TERMINATION`)           | `Worker,User,Membership,AuditEvent` | EXISTS                                         |
| Edit profile (name/phone/lang/salary/bank)   | `PUT /admin/workers/:id`                                                                                                                                                | —                        | edits → audit                                                                                | `Worker/Membership,AuditEvent`      | **NEW**                                        |
| Suspend / Lift / Terminate / At-risk / Block | `POST /admin/workers/:id/transition` (event-driven)                                                                                                                     | worker-lifecycle-service | worker machine (§4.1) e.g. `SUSPEND ACTIVE→ON_SUSPENSION`; `TERMINATE *→TERMINATION_PENDING` | `Worker,AuditEvent`                 | **NEW** (only anonymize-finalize exists today) |
| Worker's assignments                         | (detail tab) `GET /admin/workers/:id/assignments`                                                                                                                       | assignment-service       | —                                                                                            | —                                   | **NEW**                                        |
| Worker's attendance                          | `GET /admin/workers/:id/attendance?month`                                                                                                                               | attendance-service       | —                                                                                            | —                                   | **NEW** (read)                                 |
| Worker's visits                              | `GET /admin/workers/:id/visits`                                                                                                                                         | —                        | —                                                                                            | —                                   | **NEW** (read)                                 |
| Worker's audit                               | `GET /admin/workers/:id/audit`                                                                                                                                          | activity-service         | —                                                                                            | —                                   | **NEW** (read)                                 |
| Search                                       | `GET /admin/workers?q=` filter                                                                                                                                          | admin-worker-service     | —                                                                                            | —                                   | **NEW** (only cursor paging today)             |

**Note:** attendance is written by supervisor/system (`POST /workers/:id/mark-absent`, role-checked NOT_SUPERVISOR; writes `Attendance,AuditEvent,Outbox`; 5 statuses `PRESENT|ABSENT_NO_CALL|ABSENT_APPROVED_LEAVE|HALF_DAY|ON_BREAK`; `payDeductPaise` by payroll job). **HR does not edit attendance** — corrections flow through Reversals (§3.7).
**Connects to:** Workers → Worker detail → (Sites via assignment, Leave via leave tab, Record via audit tab). Pending-leave rows deep-link to the Leave review sheet (§3.4) — one approval surface.

### 3.3 Sites `/hr/sites`

| Action                                | Endpoint                                                                                                                                                                                                                          | Machine                                               | DB written                         | Tag                   |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------- | --------------------- | ------------------- |
| List                                  | `GET /admin/sites?cursor&limit≤50` role `OWNER,HR` → `{items:[{id,name,state,address,latitude,longitude,workdays,createdAt}],nextCursor}`                                                                                         | —                                                     | —                                  | EXISTS                |
| Detail                                | `GET /admin/sites/:id` role `OWNER,HR` → `{…,updatedAt}`                                                                                                                                                                          | —                                                     | —                                  | EXISTS                |
| Bindings (supervisors)                | `GET /admin/sites/:id/bindings` → `{items:[{id,siteId,supervisorUserId,actingForUserId,effectiveFrom,effectiveUntil,endedAt,reason,createdAt,supervisorName,supervisorPhone}],nextCursor}`                                        | —                                                     | —                                  | EXISTS                |
| Add site                              | `POST /admin/sites` role `OWNER,HR`; body `name(1-120),address?,latitude?,longitude?,workdays?(^[MTWFSU_]{7}$, default MTWTFS_)` → `{siteId,state:'DRAFT'}`                                                                       | site created `DRAFT`                                  | `Site,AuditEvent`                  | EXISTS                |
| Bind supervisor                       | `POST /admin/sites/:id/bindings`; body `supervisorUserId,effectiveFrom,effectiveUntil?,actingForUserId?,reason(1-1000)` → `{bindingId}`                                                                                           | —                                                     | `SiteSupervisorBinding,AuditEvent` | EXISTS                |
| Reassign site's HR                    | `PATCH /admin/sites/:id/hr` role `OWNER`; body `hrUserId                                                                                                                                                                          | null`→`{siteId,hrUserId}`(guards`WOULD_SPLIT_WORKER`) | —                                  | `Site,AuditEvent`     | EXISTS (OWNER only) |
| Add assignment (worker→site)          | `POST /assignments` role `SUPERVISOR,HR`; recurring body `workerId,siteId,dayMask(^[MTWTFS_]{7}$),shiftStart(HH:mm),shiftEnd,validFrom,validUntil?` OR one-off `…,oneOffDate` → `{id,state:'DRAFT',dayMask,validFrom,validUntil}` | assignment created `DRAFT` (§4.6)                     | `Assignment,AuditEvent`            | EXISTS                |
| Edit site (name/address/geo/workdays) | `PATCH /admin/sites/:id`                                                                                                                                                                                                          | site `DRAFT` only                                     | `Site,AuditEvent`                  | **NEW**               |
| Activate assignment                   | `POST /assignments/:id/activate`                                                                                                                                                                                                  | assignment `DRAFT→ACTIVE`                             | `Assignment,AuditEvent`            | **NEW**               |
| End assignment                        | `POST /assignments/:id/terminate`; body `reason`                                                                                                                                                                                  | assignment `*→TERMINATED`                             | `Assignment,AuditEvent`            | **NEW**               |
| Site's workers (roster)               | `GET /admin/sites/:id/workers`                                                                                                                                                                                                    | —                                                     | —                                  | **NEW**               |
| Site QR                               | (printable scan code)                                                                                                                                                                                                             | derive from `Site.id`                                 | —                                  | **NEW** (read/derive) |

**Invariant (enforced):** one-worker-one-HR — a worker cannot hold assignments under two different HRs (`validateWorkerHrInvariant`; `WORKER_DIFFERENT_HR` 403). HR add-assignment is gated to `Site.ownerHrUserId = me` (else 403).
**Connects to:** Sites → Site detail → (roster workers → Worker detail; bindings → Team).

### 3.4 Leave `/hr/leave-requests` ✅ FULLY BACKED

| Action                 | Endpoint                                                                                                                                                               | Machine                                                       | DB written                                                                                                                                                        | Tag                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------- |
| Inbox (queue)          | `GET /leave-requests?cursor&limit≤100` role `HR` → `{items:[{id,workerId,fromDate,toDate,reason,state,createdAt}],nextCursor}` (only `REQUESTED`, only HR-owned sites) | —                                                             | —                                                                                                                                                                 | EXISTS                  |
| Detail                 | `GET /leave-requests/:id` role `HR,SUPERVISOR` → `{id,workerId,workerName,workerPhone,fromDate,toDate,reason,state,decidedBy,decidedAt,decisionNote,createdAt}`        | —                                                             | —                                                                                                                                                                 | EXISTS                  |
| Approve                | `POST /leave-requests/:id/approve` (HR site-scoped); body `reason?` → `{ok,leaveRequestId,workerId,state:'APPROVED',decidedBy,decidedAt}`                              | leaveRequest `REQUESTED→APPROVED` (canTransition, Ledger #20) | `LeaveRequest, Attendance (1 row/leave day, status ABSENT_APPROVED_LEAVE payDeduct 0, idempotent on workerId+date), AuditEvent, Outbox (payroll recompute/month)` | EXISTS                  |
| Reject                 | `POST /leave-requests/:id/reject`; body `reason` **required** → `{…,state:'REJECTED',…}`                                                                               | leaveRequest `REQUESTED→REJECTED`                             | `LeaveRequest,AuditEvent,Outbox`                                                                                                                                  | EXISTS                  |
| Create (worker self)   | `POST /leave-requests`; body `workerId,fromDate,toDate,reason(1-500)` → `{…,state:'REQUESTED'}`                                                                        | → `REQUESTED`                                                 | `LeaveRequest,AuditEvent,Outbox`                                                                                                                                  | EXISTS (worker, not HR) |
| History list (decided) | `GET /leave-requests?state=APPROVED                                                                                                                                    | REJECTED`                                                     | —                                                                                                                                                                 | —                       | **NEW** (inbox returns only REQUESTED) |

**Machine (§4.2):** 3 states `REQUESTED → APPROVED | REJECTED`. Terminal `APPROVED`,`REJECTED`. Re-deciding a terminal row → 409 `ALREADY_<state>`.
**Connects to:** Home leave-card → here; Worker-detail leave-tab `REQUESTED` row → review sheet here.

### 3.5 Swaps `/hr/swap-requests`

| Action          | Endpoint                                                                                                                                              | Machine  | DB written                                                                                                | Tag                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------- | ---------------- | ------------------------------- | ------ |
| Create          | `POST /swap-requests` role `SUPERVISOR` (403 if not); body `fromWorkerId,toWorkerId,siteId,effectiveAt(future),reason?(0-500)` → `{…,state:'SENT',…}` | → `SENT` | `SwapRequest,AuditEvent,Outbox`                                                                           | EXISTS (supervisor)                                            |
| Decide          | `POST /swap-requests/:id/decide`; body `decision(approve                                                                                              | reject   | approve_anyway),reason?(req. if reject),overrideToken?(=='OVERRIDE')`→`{ok,swapRequestId,state:'ACCEPTED' | 'DECLINED',decidedBy,decidedAt}`                               | swapRequest `SENT→ACCEPTED | DECLINED` (§4.3) | `SwapRequest,AuditEvent,Outbox` | EXISTS |
| HR list / inbox | `GET /swap-requests?…`                                                                                                                                | —        | —                                                                                                         | **NEW** (no read endpoint today — HR cannot see swaps via API) |
| HR detail       | `GET /swap-requests/:id`                                                                                                                              | —        | —                                                                                                         | **NEW**                                                        |

**Reality:** swaps today are a supervisor-only create+decide. For HR to have a Swaps queue at all, the **read endpoints are NEW**. Machine `SENT → ACCEPTED|DECLINED`, terminal both, no cancel.

### 3.6 Complaints `/hr/complaints`

| Action          | Endpoint                                                                                                                                                                                                                                                                                  | Machine                                                           | DB written                                                                        | Tag                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------- | -------------------- |
| List            | `GET /complaints?state?&siteId?&limit≤100&cursor?` role `SUPERVISOR,HR,OWNER` → `{complaints:[{id,siteId,siteName,createdByUserId,supervisorId,kind,severity,state,text,unreadHrRepliesCount,lastReplyAt,createdAt,resolvedAt,resolvedBy}],nextCursor}` (HR sees `siteId ∈ getHrSiteIds`) | —                                                                 | —                                                                                 | EXISTS                                              |
| Detail + thread | `GET /complaints/:id` → `{complaint, messages:[{id,complaintId,authorUserId,authorRole,body,attachments,createdAt,readByCallerAt}]}`                                                                                                                                                      | —                                                                 | —                                                                                 | EXISTS                                              |
| Reply           | `POST /complaints/:id/messages`; body `body(1-2000),attachments?(≤8 image)` → `{ok,messageId,createdAt}`                                                                                                                                                                                  | HR/ADMIN author: `OPEN→IN_HR`; supervisor author: no state change | `ComplaintMessage, Complaint(unreadHrRepliesCount,lastReplyAt,state), AuditEvent` | EXISTS                                              |
| Mark read       | `POST /complaints/:id/messages/:messageId/read` → `{ok,wasAlreadyRead}`                                                                                                                                                                                                                   | —                                                                 | `ComplaintMessageRead, Complaint(unread−1)`                                       | EXISTS                                              |
| Resolve         | `POST /complaints/:id/resolve` → `{ok,resolvedAt}` (409 `ALREADY_TERMINAL`)                                                                                                                                                                                                               | complaint `OPEN                                                   | IN_HR → RESOLVED`                                                                 | `Complaint(state,resolvedAt,resolvedBy),AuditEvent` | EXISTS                                         |
| Dismiss         | `POST /complaints/:id/dismiss`                                                                                                                                                                                                                                                            | complaint `OPEN                                                   | IN_HR → DISMISSED`                                                                | `Complaint,AuditEvent`                              | **NEW** (machine has DISMISSED; no REST route) |
| Create by HR    | `POST /sites/:id/complaints` role `SUPERVISOR,HR,OWNER`; body `text(1-2000),severity(LOW                                                                                                                                                                                                  | MEDIUM                                                            | HIGH)`→`{ok,complaintId,…}`                                                       | → `OPEN`                                            | `Complaint,ComplaintMessage,AuditEvent,Outbox` | EXISTS (site-scoped) |

**Machine (§4.4):** `OPEN, IN_HR, RESOLVED, DISMISSED`. Terminal `RESOLVED`,`DISMISSED`. Complaint text/severity/kind are set on create, never edited. **Resolve is reachable via REST; Dismiss is NOT (NEW).**

### 3.7 Reversals `/hr/reversals` — ⚠️ HR side is entirely NEW

**What exists (supervisor side):** when a supervisor needs to undo an action after the 30-min window, `POST /activity/:id/soft-flag` (role SUPERVISOR) creates a `SupervisorDecision{ kind:'LATE_REVERSAL_REQUEST', appliedAt:null }` + audit `ACTIVITY_LATE_REVERSAL_REQUESTED`. That row is what HR must review. **There is no HR endpoint to list/apply/reject these.**
| Action | Endpoint | Tag |
|---|---|---|
| HR reversal queue | `GET /hr/reversals` → pending `LATE_REVERSAL_REQUEST` decisions w/ context | **NEW** |
| Apply (do the undo) | `POST /hr/reversals/:id/apply` → runs the per-kind compensating reverse | **NEW** |
| Reject | `POST /hr/reversals/:id/reject`; body `reason` | **NEW** |

**Reference (the supervisor reverse, EXISTS, for the per-kind logic the HR-apply must reuse):** `POST /activity/:id/reverse` role SUPERVISOR, self-only, within 30-min window. Per kind: `WORKER_MARKED_ABSENT→Attendance deleted`; `LEAVE_APPROVED→LeaveRequest APPROVED→REQUESTED`; `ASSIGNMENT_CREATED→Assignment ACTIVE→TERMINATED`; `REPLACEMENT_INVITE_ACCEPTED→Assignment TERMINATED + ReplacementInvite CANCELLED`. Emits compensating audit (`ATTENDANCE_REVERSED`/`LEAVE_REVERSED`/`ASSIGNMENT_REVERSED`) FIRST, then `ACTIVITY_REVERSED`. Reversible kinds: `WORKER_MARKED_ABSENT, LEAVE_APPROVED, ASSIGNMENT_CREATED, REPLACEMENT_INVITE_ACCEPTED` (all else 422 `KIND_NOT_REVERSIBLE`).

### 3.8 Policies `/hr/policies`

| Action                | Endpoint                                                                                                                                                 | Machine      | DB written | Tag                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ---------- | -------------------------- | --- | ----- | -------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------- | ------------------- |
| Set policy            | `POST /admin/policy` `requireAuth` (role ACL inside: `assertPolicyKeyAllowedForRole` → 403 if key-prefix forbidden); body `key(1-200),value,category(sla | notification | worker     | hr                         | ai  | owner | handoff)`→`{policyId,setAt,previousValueSnapshot}` | append-only (newest row = current; null value = delete-sentinel) | `Policy,AuditEvent,Notification(active OWNERs)` | EXISTS (write only) |
| List current policies | `GET /admin/policy`                                                                                                                                      | —            | —          | **NEW** (no read endpoint) |
| Policy history        | `GET /admin/policy/:key/history`                                                                                                                         | —            | —          | **NEW**                    |

**Constraint:** Policy is append-only (INVARIANT 8) — no update, no delete; history is the row stream. The **"takes effect tomorrow" copy** is a product rule for the UI; the daily-cutoff is enforced by consumers, not this write. `Company.status` must be `ACTIVE` (else 403 `COMPANY_NOT_ACTIVE`).

### 3.9 Updates `/hr/updates` — ⚠️ HR authoring is entirely NEW

**What exists (supervisor side):** `GET /supervisor/updates` role SUPERVISOR → `{needsAck:[…],recentAcked:[…],counts}`; `POST /supervisor/updates/:id/acknowledge` body `{text}` (server requires ≥5 words) → writes `HRUpdate(acknowledgedBy,acknowledgmentPhrase),AuditEvent`. **The HR side that CREATES updates and reads the ack report does not exist.**
| Action | Endpoint | Tag |
|---|---|---|
| Compose/publish update | `POST /hr/updates`; body `title,body,kind,acknowledgmentRequired` | **NEW** |
| List my updates | `GET /hr/updates` | **NEW** |
| Ack report (who/what 5-word ack, who hasn't) | `GET /hr/updates/:id/acks` | **NEW** |

**Schema note (v0):** `HRUpdate` stores a single `acknowledgedBy` + `acknowledgmentPhrase` (most-recent, idempotent re-ack). A true per-supervisor ack matrix needs a join table — flag as a schema decision before building the ack report.

### 3.10 Team `/hr/team`

| Action                   | Endpoint                                                                                                                                                                                | DB written                                                                                           | Tag                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------ |
| List members             | `GET /admin/memberships?limit≤50&cursor?` role `OWNER,HR` → `{items:[{id,userId,role,status,podId,createdAt,user:{name,phone}}],nextCursor}` (HR filtered to its sites' HR/supervisors) | —                                                                                                    | EXISTS                                    |
| Invite member            | `POST /admin/memberships` role `OWNER,HR`; body `phone,name,role(HR                                                                                                                     | SUPERVISOR),baseSalaryPaise,bankIfsc?,bankAcct?,podId?`→`{membershipId,userId,role,status:'ACTIVE'}` | `User,Membership,AuditEvent,Notification` | EXISTS |
| Member detail            | `GET /admin/memberships/:id`                                                                                                                                                            | —                                                                                                    | **NEW**                                   |
| Update (salary/bank/pod) | `PATCH /admin/memberships/:id`                                                                                                                                                          | `Membership,AuditEvent`                                                                              | **NEW**                                   |
| Deactivate / revoke      | `POST /admin/memberships/:id/revoke`                                                                                                                                                    | `Membership(status),AuditEvent`                                                                      | **NEW** (deactivate, never delete)        |
| Resend invite            | `POST /admin/memberships/:id/resend-invite`                                                                                                                                             | `Outbox`                                                                                             | **NEW**                                   |

**Connects to:** supervisor members → the sites they're bound to (§3.3 bindings).

### 3.11 Record `/hr/record` (audit trail) — ⚠️ read surface is NEW

**Reality:** writes append `AuditEvent` everywhere, but there is **no general read endpoint** for the audit trail today (only the supervisor self-feed `GET /supervisor/activity` exists, which is SUPERVISOR-role + self-only). For an HR-wide, filterable, read-only Record screen:
| Action | Endpoint | Tag |
|---|---|---|
| Audit list (filter person/site/date/kind) | `GET /hr/audit?…` → `{items:[{at,actorName,kind,summary,targetId}],nextCursor}` | **NEW** |
| Single audit detail | `GET /activity/:id` | **NEW** |
| Visit detail | `GET /visits/:id` | **NEW** |
| Flagged-visit list | `GET /visits?state=FLAGGED` | **NEW** |

**Reference (flagged-visit decisions, EXISTS, supervisor-only):** `POST /visits/:id/resolve` (`FLAGGED→VERIFIED`, audit `VISIT_RESOLVED`) and `POST /visits/:id/reject` body `supervisorReason` required (`FLAGGED→REJECTED`, audit `VISIT_REJECTED`). Both role SUPERVISOR, `REJECTABLE_VISIT_STATES=['FLAGGED']` only. The Record screen is read-only — it never edits/deletes (its immutability is the feature).

---

## 4. STATE MACHINES (verified from packages/state-machines/src/)

### 4.1 worker — 15 states (`worker.ts`)

States: `INVITED, PENDING_ACTIVATION, DOC_PENDING, ACTIVE, ON_LEAVE, ON_SUSPENSION, ABSENT, AT_RISK, BLOCKED, TRANSFER_PENDING, INACTIVE, TERMINATION_PENDING, TERMINATED, ARCHIVED, ANONYMIZED`.
Key transitions (event: from→to): `INVITE_ACCEPTED: INVITED→PENDING_ACTIVATION` · `OTP_VERIFIED: PENDING_ACTIVATION→DOC_PENDING` · `DOCS_PROVIDED: DOC_PENDING→ACTIVE` · `LEAVE_APPROVED: ACTIVE→ON_LEAVE` · `LEAVE_RETURNED: ON_LEAVE→ACTIVE` · `SUSPEND: ACTIVE|ON_LEAVE|AT_RISK→ON_SUSPENSION` · `SUSPENSION_LIFTED: ON_SUSPENSION→ACTIVE` · `NO_SHOW: ACTIVE→ABSENT` · `CHECK_IN: ABSENT→ACTIVE` · `FLAG_AT_RISK: ACTIVE|ABSENT→AT_RISK` · `CLEAR_AT_RISK: AT_RISK→ACTIVE` · `BLOCK: ACTIVE→BLOCKED` · `UNBLOCK: BLOCKED→ACTIVE` · `TRANSFER_INITIATED: ACTIVE→TRANSFER_PENDING` · `TRANSFER_COMPLETED|TRANSFER_CANCELLED: TRANSFER_PENDING→ACTIVE` · `DEACTIVATE: INVITED|PENDING_ACTIVATION|DOC_PENDING|ACTIVE→INACTIVE` · `REACTIVATE: INACTIVE→ACTIVE` · `TERMINATE: (most active states)→TERMINATION_PENDING` · `TERMINATION_FINALIZED: TERMINATION_PENDING→TERMINATED` · `ARCHIVE_THRESHOLD_REACHED: INACTIVE|TERMINATED→ARCHIVED` · `ANONYMIZATION_REQUESTED: ARCHIVED→ANONYMIZED`.
(Correction applied: the entry event is `DOCS_PROVIDED`, not `PROFILE_COMPLETED` — the latter is a dead type.)

### 4.2 leaveRequest (`leave-request.ts`, authority = Ledger #20)

`REQUESTED → APPROVED` · `REQUESTED → REJECTED`. Terminal: `APPROVED`, `REJECTED`. (Schema lists CANCELLED/EXPIRED/APPLIED/COMPLETED as future placeholders — NOT in the active machine.)

### 4.3 swapRequest (`swap-request.ts`)

`SENT → ACCEPTED` · `SENT → DECLINED`. Terminal: `ACCEPTED`, `DECLINED`. No cancel; re-decide on terminal blocked by `isTerminal()`.

### 4.4 complaint (`complaint.ts`)

States: `OPEN, IN_HR, RESOLVED, DISMISSED`. Transitions include `OPEN→IN_HR` (HR replies), `OPEN|IN_HR→RESOLVED`, `OPEN|IN_HR→DISMISSED`. Terminal: `RESOLVED`, `DISMISSED`. (DISMISSED reachable in machine, NOT via REST yet.)

### 4.5 visit (`visit.ts`) — 13 states

`SCHEDULED, NOTIFIED, EN_ROUTE, ON_SITE, IN_PROGRESS, PHOTOS_PENDING, PHOTOS_UPLOADED, AWAITING_VERIFICATION, AI_VERIFIED/VERIFIED, AI_FLAGGED/FLAGGED, REJECTED, NO_SHOW, CANCELLED, ARCHIVED`. HR-relevant: `FLAGGED→VERIFIED` (SUPERVISOR_RESOLVED ok), `FLAGGED→REJECTED` (reject). Billable terminal set: `VERIFIED, FLAGGED, CANCELLED, REJECTED, NO_SHOW`.

### 4.6 assignment (`assignment.ts`)

`DRAFT → ACTIVE` (confirm) · `DRAFT → TERMINATED` (cancel) · `ACTIVE → TERMINATED` (end). Today only `DRAFT` is created via `POST /assignments`; the transition endpoints are NEW (§3.3).

---

## 5. BUILD BACKLOG — every NEW endpoint the HR portal needs

Each follows the locked rules: `requireAuth + requireRole('HR')` (or OWNER,HR), `withTenantContext` tenant wrapper, `getHrSiteIds` site-anchoring, zod-validated body, `AuditEvent` on write, real-DB test.

| #   | Endpoint                                                                                    | Purpose                                               | Screen        |
| --- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------- | --- |
| N1  | `GET /hr/overview`                                                                          | Home queue counts + today + recent                    | 3.1           |
| N2  | cookie-session on `/auth/otp/verify`                                                        | browser portal session (not JS-held JWT)              | 2             |
| N3  | `PUT /admin/workers/:id`                                                                    | edit worker profile                                   | 3.2           |
| N4  | `POST /admin/workers/:id/transition`                                                        | suspend/lift/terminate/at-risk/block (worker machine) | 3.2           |
| N5  | `GET /admin/workers/:id/{assignments,attendance,visits,audit}`                              | worker detail tabs (read)                             | 3.2           |
| N6  | `GET /admin/workers?q=`                                                                     | worker search                                         | 3.2           |
| N7  | `PATCH /admin/sites/:id`                                                                    | edit site (DRAFT)                                     | 3.3           |
| N8  | `POST /assignments/:id/{activate,terminate}`                                                | assignment lifecycle                                  | 3.3           |
| N9  | `GET /admin/sites/:id/workers`                                                              | site roster                                           | 3.3           |
| N10 | site QR derive/print                                                                        | visit scan code                                       | 3.3           |
| N11 | `GET /leave-requests?state=APPROVED                                                         | REJECTED`                                             | leave history | 3.4 |
| N12 | `GET /swap-requests`, `GET /swap-requests/:id`                                              | HR swaps queue (none today)                           | 3.5           |
| N13 | `POST /complaints/:id/dismiss`                                                              | dismiss complaint (machine has it)                    | 3.6           |
| N14 | `GET /hr/reversals`, `POST /hr/reversals/:id/{apply,reject}`                                | the late-reversal review queue                        | 3.7           |
| N15 | `GET /admin/policy`, `GET /admin/policy/:key/history`                                       | policy read + history                                 | 3.8           |
| N16 | `POST /hr/updates`, `GET /hr/updates`, `GET /hr/updates/:id/acks` (+ ack join-table schema) | author + ack report                                   | 3.9           |
| N17 | `GET /admin/memberships/:id`, `PATCH …`, `POST …/revoke`, `POST …/resend-invite`            | team detail/edit/revoke/resend                        | 3.10          |
| N18 | `GET /hr/audit`, `GET /activity/:id`, `GET /visits/:id`, `GET /visits?state=FLAGGED`        | Record read surface                                   | 3.11          |

---

## 6. SCREEN CONNECTION MAP

```
Login → OTP → [role=HR] → HR shell
  Home ─cards→ Leave / Complaints / Swaps / Reversals
       ─today→ Record(filter=today)
  Workers ─row→ Worker detail ─tabs→ Sites(assignment) · Leave(req row→3.4 sheet) · Record(audit)
  Sites ─row→ Site detail ─→ roster→Worker detail · bindings→Team · QR(print)
  Team ─supervisor→ their site bindings (3.3)
  every write ─→ AuditEvent ─read→ Record (3.11)
```

One approval surface rule: a `REQUESTED` leave shown on Worker-detail opens the SAME review sheet as the Leave queue (`GET/POST /leave-requests/:id…`), never a second code path.

---

## 7. READINESS TODAY (honest)

| Screen                                                       | Backed end-to-end today?                                             |
| ------------------------------------------------------------ | -------------------------------------------------------------------- |
| Login / shell / sign-out                                     | ✅ yes                                                               |
| Leave queue (list/detail/approve/reject)                     | ✅ yes (history list = N11)                                          |
| Workers list / detail / add / anonymise                      | ✅ read+create+anonymise; ⚠️ edit + suspend/terminate + tabs = N3–N6 |
| Sites list / detail / bindings / add / bind / add-assignment | ✅ those; ⚠️ edit + assignment lifecycle + roster + QR = N7–N10      |
| Complaints list / detail / reply / read / resolve / create   | ✅ those; ⚠️ dismiss = N13                                           |
| Team list / invite                                           | ✅ those; ⚠️ detail/edit/revoke/resend = N17                         |
| Policies set                                                 | ✅ write; ⚠️ read + history = N15                                    |
| Swaps                                                        | ⚠️ create+decide exist (supervisor); HR read queue = N12             |
| Reversals                                                    | ⚠️ supervisor soft-flag exists; entire HR queue = N14                |
| Updates                                                      | ⚠️ supervisor read+ack exist; HR authoring + ack report = N16        |
| Record / audit                                               | ⚠️ writes exist; read surface = N18                                  |
| Home overview                                                | ⚠️ N1                                                                |

**Bottom line:** Leave is shippable against today's backend. Everything else is design-now, wire-as-§5-lands. This is the contract — build to it, no guessing.
