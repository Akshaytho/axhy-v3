---
Status: Active
Last validated against code: 2026-05-14
Validated branch: feat/phase-c-wave-4b-chat-completion
Validated commit: e9c5ca1
Primary owner: founder (Akshay Thota)
Replaces: nothing — first-version
---

# Operations Workflow Model

The single trunk model for the product. Names every persona, every major entity, every state machine, every workflow, every exception, every routing rule, every audit consequence in one place. Triggered 2026-05-14 after a recurring failure mode: feature gaps were being surfaced one-by-one (R3→R4→R5→R6 contradictions; supervisor-absence model; etc.) instead of caught up-front by a unified operations review.

This doc is a synthesis/reference trunk, **Active but contract-incomplete** (per `docs/index/canonical-truth.md`). It governs product operations across personas, workflows, exceptions, routing, and audit; downstream feature specs (D.1, R6, HR Updates, supervisor-responsibility model, future ones) implement parts of the model named here. Downstream specs MUST align with this model unless a section is explicitly relocked by a later spec. The model does **not** retroactively override any Active spec already in force; each downstream spec retains authority over its own contract surface. The 10 named open gaps in §12 are the "contract-incomplete" surface.

**Source discipline:** every fact below was verified against the live repo on 2026-05-14 (commit `e9c5ca1`) via direct file reads — schema.prisma, state machine files, route handlers, dispatcher handlers, R6 prototype JSX, real mobile + admin-web entry points, ADRs, existing specs, and connectedness manifests. Nothing here is from memory. Where a thing doesn't exist yet, it's marked `(P1)`, `(P1.5)`, `(P2)`, `(P3+)`, or `(deferred)` to anchor it to a real implementation milestone.

---

## §1 Status

**Active but contract-incomplete** (per `docs/index/canonical-truth.md`). Promoted 2026-05-14.

Promotion conditions met:

1. ✅ Friend review of the workflow inventory, exception matrix, and design-consequences sections (2 substantive review passes + 2 cleanup passes).
2. ✅ Authority contradiction at top of doc resolved.
3. ✅ All 12 workflow blocks Status-tagged for current/planned/gap separation.
4. ✅ §7.1 / §7.6 / §7.7 internally consistent (chat extracts PROPOSED; apply is separate).
5. ✅ §7.9 internally consistent (table P1, machine + routes P2, cron P3).
6. ✅ Source-grounded against commit `e9c5ca1` via direct repo recon (schema, state machines, routes, dispatcher handlers, R6 prototype, ADRs, existing specs, connectedness manifests).

What this Active state means in practice:

- The operations model is **binding** on any feature that touches a persona, workflow, exception, routing/authority decision, or audit consequence named here.
- Downstream Active specs (D.1, R6, HR Updates, product framing, supervisor-responsibility) retain authority over their own contracts. Conflicts between this trunk and a downstream contract resolve toward the contract spec by default; bring genuine conflicts to friend for relock.
- The 10 open questions in §12 are documented gaps; this Active state does NOT pretend they are resolved. They get separate review passes.
- Implementation continues per the P1 → P1.5 → P2 phasing locked 2026-05-14.

What "contract-incomplete" means here: the trunk is locked, but HR portal admin-web UI, worker app surface, payroll handler, worker cross-tenant transfer, and several other items in §12 are deferred to their own iterations. Cross-references into the existing Active specs are also deferred to a separate batch (not part of this promotion).

---

## §2 Why this doc exists

The design process up to 2026-05-13 was spec-first, feature-by-feature: D.1 (decisions), R6 (mobile surface), HR Updates (HR fan-out), Product Framing (Layer A/B/C), Supervisor Responsibility (acting coverage). Each spec was internally coherent. The whole was not.

Symptoms:

- R3 → R4 → R5 → R6 surfaced 15 contradictions only after months of design (resolved 2026-05-12).
- D.1 was promoted Active 2026-05-12; the supervisor-sick scenario was caught 2026-05-14, after P1 pre-flight passed.
- The 2026-05-08 founder-lock ("share the account") encoded a workaround as a design choice because no operations review existed.

Operations Reality Review framework (per friend's 2026-05-13 directive + 2026-05-14 escalation): for every major feature, persona stress test + exception-first review + ownership model review + time-window review + control-plane review. This doc is the place those reviews live.

**Scope of this doc:** entire product, not one feature. Every persona, every workflow, every exception. Implementation specs land separately; this is the trunk they branch from.

---

## §3 Personas

Five distinct personas. Each has a primary surface, a set of operational responsibilities, an "if absent" handling rule, and a routing-authority rule.

| Persona         | `Membership.role` value                                                      | Primary surface                                                                                       | Implemented today?                                                                                    |
| --------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Supervisor**  | `'SUPERVISOR'`                                                               | Supervisor mobile (5 tabs: Today / Decisions / Activity / Chat / Profile + Summary/Updates secondary) | Yes — `apps/mobile/app/(supervisor)/*` (Decisions + Activity tabs are stubs) + R6 prototype reference |
| **HR**          | `'HR'` (planned; not yet visible in any route or test)                       | Admin-web HR portal                                                                                   | Not yet routed; HR Updates Active spec assumes admin-web HR portal exists in the future               |
| **Owner**       | `'OWNER'` (referenced in master plan + AI-budget alerts; no route guard yet) | Admin-web /owner page + WhatsApp alerts                                                               | Partial — `/owner` route exists; AI-budget alert handlers exist as stubs                              |
| **Worker**      | `'WORKER'`                                                                   | Worker mobile (Phase B+ surface; not in R6 prototype)                                                 | Auth + assignment-receipt scaffolding only                                                            |
| **Super-admin** | `'SUPER_ADMIN'`                                                              | Admin-web /system/graph + /system/map                                                                 | Yes — JWT role guard at `apps/admin-web/app/api/graph/route.ts:6`                                     |

`Membership.role` is a free-string column (per `schema.prisma:102`); no DB enum constraint. Values are app-enforced. The role taxonomy is intentionally open to forward-compat additions without schema migration.

### 3.1 Supervisor

- **Owns operationally**: a portfolio of sites + the workers assigned to those sites. Ownership is mediated by `SiteSupervisorBinding` (P1.5) per the 2026-05-14 responsibility model.
- **Daily actions** (verified from route handlers + R6 prototype): start the day on Today tab; mark workers absent; review open `PROPOSED` decisions; voice-capture intent in Chat tab; review HR Updates and acknowledge; resolve flagged Visits; log site complaints; initiate worker swaps.
- **If absent**: HR creates a `SiteSupervisorBinding` row with `actingForUserId = supervisor.userId`, `effectiveFrom = now`, `effectiveUntil = absence_end`. Routing automatically flows to the acting supervisor (read-time JOIN, no row updates). On return, the binding auto-expires; "while you were out" digest renders.
- **Authority**: PROPOSED decisions; visit verification overrides; complaint logging; chat-extracted decision acceptance. Cannot terminate workers without typed-phrase ack. Cannot reassign portfolio (that's HR).

### 3.2 HR

- **Owns operationally**: posting HR Updates (single rules + digests per HR Updates spec); managing acting-supervisor windows; managing permanent portfolio reassignment (P1.5+); approving leave requests; approving worker terminations.
- **Daily actions**: post an HR Update with optional ack requirement; respond to LeaveRequest rows (approve/reject); manage SiteSupervisorBinding (P1.5+); resolve worker DOC_PENDING transitions; manage worker hiring/termination workflows.
- **If absent**: deferred. Today, no fallback exists — HR routes have no role-rotation built in. Future option: owner takes HR authority temporarily. **Open gap, surfaced in §8.**
- **Authority**: HRUpdate posting (HR-only); LeaveRequest approve/reject (per `leave-requests.ts:125`); SiteSupervisorBinding write (P1.5+); worker EMPLOYMENT-tier final approval (planned).
- **Surface today**: admin-web HR portal not yet routed. HR routes exist server-side without UI.

### 3.3 Owner

- **Owns operationally**: company-level decisions — pricing, bank account, structural payroll changes, AI budget caps, supervisor capacity (visibility), strategic site portfolio.
- **Daily actions**: minimal; weekly/monthly. Reviews owner dashboard; receives AI-budget alerts (80% warning, 100% cap) via push or WhatsApp.
- **If absent**: scenarios where owner is unreachable for >24h are handled by HR (per master plan §C). Owner is not on the critical operational path.
- **Authority**: bank-account changes; permanent terminations beyond supervisor scope; AI budget cap overrides; tenant-level settings (Company.aiSpendDailyInr override).
- **Surface today**: `apps/admin-web/app/owner/page.tsx` stub; `owner.ai_budget_warning` / `owner.ai_budget_capped` outbox topics fire (handlers are stubs today).

### 3.4 Worker

- **Owns operationally**: showing up at assigned site; clocking in/out; capturing photos before+after; requesting leave; accepting swap invites; responding to replacement invites (P1.5+).
- **Daily actions** (Phase B scaffolding only at present): receive assignment notifications; clock in on arrival; take before-photos; clock out; take after-photos; respond to leave/swap/replacement invitations.
- **If absent**: triggers Attendance(`ABSENT_NO_CALL`) → optional supervisor `propose_replacement` flow → ReplacementInvite (P1) sent to candidate worker → 2-min TTL.
- **Authority**: leave request submission; visit clock-in/clock-out; complaint submission (planned); accept/decline swap or replacement invites.
- **Surface today**: minimal worker mobile UI; auth + assignment receipt scaffolding only.

### 3.5 Super-admin

- **Owns operationally**: cross-tenant observability (Knowledge Graph, connectedness map), system-level admin actions.
- **Daily actions**: rare — diagnostic, debugging, ops-tier escalation.
- **If absent**: not on operational critical path.
- **Authority**: cross-tenant data access (gated by JWT role check at `/api/graph/route.ts:6`).
- **Surface today**: admin-web `/system/graph` + `/system/map`.

### 3.6 Derived sub-personas (not separate roles)

- **Acting supervisor** = a `SUPERVISOR` user assigned via `SiteSupervisorBinding` with `actingForUserId` NOT NULL (P1.5). Routing flows to them automatically for the binding's window.
- **New supervisor (ramp-up)** = a `SUPERVISOR` user given a small site portfolio (1–2 sites), increased gradually via permanent `SiteSupervisorBinding` rows over weeks. No special role.
- **Dispatcher / ops coordinator** = not a separate role at launch. The system itself (dispatcher handlers + cron jobs) plays this role.

---

## §4 Core entities

Every table in `schema.prisma` (24 models verified 2026-05-14), grouped by domain, with the connectedness-manifest owner.

### 4.1 Tenancy + identity

| Entity       | Manifest owner                      | Key fields (verified)                                                                                       | State machine?                            |
| ------------ | ----------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `Company`    | tenancy                             | `id`, `slug @unique`, `status`, `aiSpendDailyInr`                                                           | No                                        |
| `User`       | identity                            | `id`, `phone @unique`, `status`, optional `companyId`                                                       | No                                        |
| `Membership` | identity                            | `companyId`, `userId`, `role` (String, free), `status`; `@@unique([companyId, userId, role])`               | No                                        |
| `Site`       | identity                            | `id`, `companyId`, `name`, `state` (14-state machine; placeholder), `workdays` (7-char Mon-Sun mask)        | Yes — `siteMachine` (placeholder)         |
| `Worker`     | identity                            | `id`, `companyId`, optional `userId`, `phone`, `bankIfsc`/`bankAcct`, `state` (15-state), `baseSalaryPaise` | Yes — `worker.ts` (15 states)             |
| `Device`     | notifications                       | `id`, `userId`, `state` (10-state DeviceState), `phoneModel`, `osVersion`, `appVersion`, `lastSeenAt`       | Yes — `device.ts` (10-state, placeholder) |
| `OtpAttempt` | (orphan; flagged in `identity.yml`) | `phone`, `codeHash`, `issuedAt`, `consumed`; raw SQL access only                                            | No                                        |

### 4.2 Planning + execution

| Entity          | Manifest owner                           | Key fields (verified)                                                                                                                                              | State machine?                                    |
| --------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| `Assignment`    | assignments                              | `workerId`, `siteId`, `shiftStart`/`shiftEnd`, `dayMask` (7-char), `validFrom`/`validUntil`, `state` (DRAFT/ACTIVE/TERMINATED)                                     | Yes — `assignment.ts` (3-state)                   |
| `CalendarEntry` | assignments                              | `supervisorId` (User.id), `date`, `kind` (NOTE/DEMAND/TENTATIVE_ASSIGNMENT/EVENT), `payload` (JSONB), `editableUntil` (now + 30d), `promotedToKind`/`promotedToId` | Yes — `calendar.ts` (kind enum + promote helpers) |
| `Visit`         | (manifest-unmapped; external referenced) | `workerId`, `siteId`, `state` (12-state), `scheduledFor`, `startedAt`/`completedAt`, `photosBefore`/`photosAfter`, `flagged`, `correctsVisitId` (correction chain) | Yes — `visit.ts` (12-state)                       |
| `VisitPhoto`    | (manifest-unmapped; external referenced) | `visitId`, `side` (BEFORE/AFTER), `r2Key`, `pHash`, `aiVerifyStatus` (PENDING/PASS/FLAGGED/NEEDS_REVIEW), `aiVerifyText`                                           | No (status field only)                            |
| `Attendance`    | attendance                               | `(workerId, date)` unique, `status` (PRESENT/ABSENT_NO_CALL/ABSENT_APPROVED_LEAVE/HALF_DAY/ON_BREAK), `payDeductPaise`, `markedBySupervisorId` (User.id, not FK)   | No (5-value enum field)                           |

### 4.3 Decisions + communication

| Entity                           | Manifest owner                | Key fields (verified)                                                                                                                                                                                                                                                                         | State machine?                                                 |
| -------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `SupervisorDecision`             | (placeholder — dropped in P1) | Will be replaced by `DecisionWorkspaceItem`                                                                                                                                                                                                                                                   | No                                                             |
| `DecisionWorkspaceItem` **(P1)** | decisions                     | per D.1 §2.3: `sourceKind` (CHAT/HR/SYSTEM/MANUAL), `kind`, `tier` (NOTE/OPERATIONAL/PERSONNEL/EMPLOYMENT), `status` (PROPOSED→APPLIED                                                                                                                                                        | DISMISSED                                                      | FAILED | EXPIRED | UNDONE), `targetType`/`targetId`, `payload`, `ackRequired`/`ackedAt`/`ackPayload`, `needsReview` + `payload.options[]`, `noteKind` (SITE_RULE/WORKING_NOTE) | Yes — `decision-workspace-item.ts` (P2) |
| `ReplacementInvite` **(P1)**     | replacements                  | per D.1 §2.8: `siteId`, `candidateWorkerId`, `replacingWorkerId`, `parentDecisionId`, `state` (SENT/ACCEPTED/REJECTED/EXPIRED/CANCELLED), `expiresAt` (2-min TTL)                                                                                                                             | Yes — `replacement-invite.ts` (P2)                             |
| `HRUpdate` **(P1 redesign)**     | hr-updates                    | per D.1 §2.9 + HR Updates spec §2.1: `title`, `body`, `tier`, `ackedAt`/`ackText` (5+ words own voice)                                                                                                                                                                                        | No (parallel ack lifecycle, no state transitions per D.1 §2.5) |
| `HRUpdateRule` **(P1)**          | hr-updates                    | child of HRUpdate; `hrUpdateId`, `body`, `tier`, `position`; append-only                                                                                                                                                                                                                      | No                                                             |
| `ChatThread`                     | chat                          | `supervisorId` (User.id), `lastMessageAt`, `archivedAt`                                                                                                                                                                                                                                       | No (archivedAt is soft-delete)                                 |
| `ChatMessage`                    | chat                          | `threadId`, `role` (user/assistant/system), `transcript`/`aiResponseText`, `toolCalls` (JSONB), `decisionCard` (JSONB), `voiceConfidence`, `modelUsed`, `costInr`, `cacheTokens`, `idempotencyKey`                                                                                            | No                                                             |
| `ChatRequestLog`                 | chat                          | idempotency dedup; 24h TTL per Spec 2 §8.3                                                                                                                                                                                                                                                    | No                                                             |
| `LeaveRequest`                   | (manifest-unmapped; external) | `workerId`, `fromDate`/`toDate`, `reason`, `state` (12-state, REQUESTED/APPROVED/REJECTED + placeholders), `decidedBy`/`decidedAt`                                                                                                                                                            | Yes — `leave-request.ts` (placeholder)                         |
| `SwapRequest`                    | (manifest-unmapped; external) | `supervisorId`, `fromWorkerId`/`toWorkerId`, `siteId`, `state` (12-state, DRAFT/SENT/ACCEPTED/DECLINED/EXPIRED/APPLIED/REVERSED), `effectiveAt`                                                                                                                                               | Yes — `swap-request.ts` (12-state)                             |
| `Complaint`                      | (manifest-unmapped; external) | `siteId`, `supervisorId`, `text`, `severity` (LOW/MEDIUM/HIGH), `resolvedAt`                                                                                                                                                                                                                  | No                                                             |
| `LivingDoc`                      | (manifest-unmapped; external) | `(companyId, supervisorId)` unique; 5 JSON sections (`siteRules`, `workerNotes`, `clientPreferences`, `recurringTasks`, `freeNotes`); each section is an array of `LivingDocRule` with own state (PENDING/ACTIVE/REJECTED/EXPIRED); `version` int bumped on every update for prompt-cache key | No (per-rule state within JSON, not table state)               |

### 4.4 Infrastructure + cross-cutting

| Entity       | Manifest owner | Key fields (verified)                                                                                     | State machine?                  |
| ------------ | -------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `AuditEvent` | audit          | `kind` (open taxonomy, free string), `actorId` (not FK), `targetId` (free string), `payload` (JSONB)      | No (append-only)                |
| `Outbox`     | notifications  | `topic` (dotted), `payload`, `processedAt`, `failCount`, `nextRetryAt`, `idempotencyKey` (partial unique) | No (processedAt null = pending) |

### 4.5 P1.5 add

| Entity                             | Manifest owner (planned) | Key fields                                                                                                                                                                                                               | State machine?                           |
| ---------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| `SiteSupervisorBinding` **(P1.5)** | (new manifest, TBD)      | per 2026-05-14 responsibility model §7: `siteId`, `userId`, `actingForUserId?` (NULL = permanent, NOT NULL = temporary), `effectiveFrom`/`effectiveUntil?`, `reason`, `createdBy`, `createdAt`/`endedAt?`/`endedReason?` | No (binding-row lifecycle via `endedAt`) |

### 4.6 Entity count

24 verified models in `schema.prisma` today. After P1: 24 + 4 new − 1 dropped (= 27). After P1.5: 28. Stable until P2+ adds nothing schema-wise.

---

## §5 State machines

Verified from `packages/state-machines/src/`. Files: `worker.ts`, `visit.ts`, `assignment.ts`, `calendar.ts`, `conflicts.ts` (plus `index.ts` barrel). Site / Device / Leave / Swap state machines exist as placeholders in `schema.prisma` (e.g., `Site.state String @default("DRAFT")` with comment "14-state SiteState machine") but the actual machine files in `packages/state-machines/src/` are not all implemented yet — verified by directory listing 2026-05-14.

| Machine                          | File                         | States                                                                                                                                                                                      | Key events (sample)                                                                                                     |
| -------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `workerMachine`                  | `worker.ts`                  | INVITED, PENDING_ACTIVATION, DOC_PENDING, ACTIVE, ON_LEAVE, ON_SUSPENSION, ABSENT, AT_RISK, BLOCKED, TRANSFER_PENDING, INACTIVE, TERMINATION_PENDING, TERMINATED, ARCHIVED, ANONYMIZED (15) | INVITE_ACCEPTED, OTP_VERIFIED, DOCS_PROVIDED, LEAVE_APPROVED, SUSPEND, NO_SHOW, BLOCK, TERMINATE, TERMINATION_FINALIZED |
| `visitMachine`                   | `visit.ts`                   | SCHEDULED, NOTIFIED, EN_ROUTE, ON_SITE, IN_PROGRESS, PHOTOS_PENDING, AWAITING_VERIFICATION, VERIFIED, FLAGGED, CANCELLED, NO_SHOW, ARCHIVED (12)                                            | NOTIFY, WORKER_DEPART, CLOCK_IN, CLOCK_OUT, PHOTOS_UPLOADED, AI_VERIFIED, AI_FLAGGED, SUPERVISOR_RESOLVED               |
| Assignment helpers               | `assignment.ts`              | DRAFT, ACTIVE, TERMINATED (3)                                                                                                                                                               | No events — guard-only helpers (`canTransition`, `expandOneOffToRecurring`)                                             |
| Calendar helpers                 | `calendar.ts`                | (kinds not states) — NOTE, DEMAND, TENTATIVE_ASSIGNMENT, EVENT                                                                                                                              | `canEdit`, `canPromote`, `mapCalendarPayloadToAssignment` helpers                                                       |
| `conflicts`                      | `conflicts.ts`               | (pure function; no states)                                                                                                                                                                  | `detectConflicts(newAssignment, existing)` — detects worker double-booking                                              |
| **DWI** **(P1.5)**               | `decision-workspace-item.ts` | PROPOSED, APPLIED, DISMISSED, FAILED, EXPIRED, UNDONE (6)                                                                                                                                   | (not implemented) — APPLY, DISMISS, FAIL, EXPIRE, UNDO                                                                  |
| **ReplacementInvite** **(P1.5)** | `replacement-invite.ts`      | SENT, ACCEPTED, REJECTED, EXPIRED, CANCELLED (5)                                                                                                                                            | (not implemented) — ACCEPT, REJECT, EXPIRE, CANCEL                                                                      |
| **Site**                         | (placeholder)                | DRAFT + 13 states (per `Site.state` comment)                                                                                                                                                | (machine file absent today)                                                                                             |
| **Device**                       | (placeholder)                | REGISTERED + 9 states (per `Device.state` comment)                                                                                                                                          | (machine file absent today)                                                                                             |
| **LeaveRequest**                 | (placeholder)                | REQUESTED, APPROVED, REJECTED + 9 placeholders                                                                                                                                              | (machine file absent today)                                                                                             |
| **SwapRequest**                  | (placeholder)                | DRAFT, SENT, ACCEPTED, DECLINED, EXPIRED, APPLIED, REVERSED + 5 placeholders                                                                                                                | (machine file absent today)                                                                                             |

**Per ADR-0006:** XState v5 is the state machine library; every state-bearing entity gets a machine. Placeholders above are real database state-strings without yet-implemented machine files — that's a known gap.

---

## §6 Workflow map

29 workflows grouped by category. Each gets a brief at this level; the 12 most-load-bearing get full detail blocks in §7.

### A. Auth + identity

1. Phone OTP login
2. JWT refresh + role/membership selection (multi-tenant user)
3. Worker invitation → activation
4. Worker doc collection → ACTIVE

### B. Site + assignment

5. Site creation (admin-web; not yet routed)
6. Site state transitions (auto on Complaint threshold; manual via admin)
7. Calendar entry creation (4 kinds)
8. Calendar entry promotion to Assignment
9. Direct assignment creation (POST /assignments)
10. Conflict detection at assignment creation (double-booking)

### C. Daily ops (the bulk of supervisor work)

11. **Mark worker absent** (Today tab → /workers/:id/mark-absent → Attendance write)
12. **Visit lifecycle** (SCHEDULED → arrival → IN_PROGRESS → photos → AI verify → VERIFIED/FLAGGED)
13. **Site complaint logging** (NOTE-tier decision)
14. **Visit photo verification** (AI flag → supervisor resolve)
15. Audit reversal (30-min window per R6 Activity tab)

### D. Decisions (P1+P2)

16. **AI chat turn → decision extraction → DecisionWorkspaceItem** (chat-extraction writer)
17. **Decision apply** (PROPOSED → APPLIED via /chat/apply or /decisions/:id/apply)
18. Decision dismiss / undo
19. Option-picker decision (`needsReview = true`)
20. EMPLOYMENT-tier ack (typed-phrase per D.1 §2.11)

### E. HR + people management

21. **Leave request** (worker submits) → HR approval/rejection → return
22. **Worker swap request** (supervisor initiates → workers respond)
23. **HR Update post** (single or digest) → supervisor ack
24. **Worker termination** (EMPLOYMENT tier)
25. Worker suspension / block / unblock

### F. Coverage + portfolio (P1.5+)

26. **Acting supervisor coverage** (HR creates time-windowed SiteSupervisorBinding)
27. **Permanent portfolio reassignment** (HR creates open-ended SiteSupervisorBinding)
28. **Replacement invite** (2-min TTL → candidate accepts/rejects/expires)

### G. Cross-cutting + cron

29. AI budget alerts (80% / 100%) + daily reset (UTC midnight cron)

---

## §7 Per-workflow detail blocks (12 critical)

Each block answers friend's 12-row template: trigger, actor, inputs, outputs, owner, visibility, override, absent-actor handling, in-progress collision, failure, persistence, recomputation.

### 7.1 Mark worker absent

| Concern                    | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**                 | **mixed** — manual route exists `[CURRENT]`; chat-propose path `[P2]`; binding-based routing `[P1.5+]`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Trigger**                | `[CURRENT]` Supervisor decides a worker hasn't shown up; taps worker row in Today tab; confirms via R6 single-tap (manual route `POST /workers/:id/mark-absent`). `[P2]` Or via chat ("Rajesh didn't come today") → `propose_mark_absent` → DWI.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Actor**                  | SUPERVISOR (`auth.userId`); responsible for the worker's primary site per P1.5 binding lookup.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **Inputs**                 | `workerId`, `date` (defaults to today), optional `reason` (free text), optional voice transcript.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Outputs**                | `[CURRENT]` Manual route (`POST /workers/:id/mark-absent`) writes in one tx: `Attendance` row upserted with `status = 'ABSENT_NO_CALL'`, `payDeductPaise` computed (`baseSalaryPaise / 26`); `AuditEvent('WORKER_MARKED_ABSENT')`; Outbox: `hr.worker_absent`, `payroll.recompute`. `[P1]` Chat-extraction path writes only a `DecisionWorkspaceItem` row with `status = 'PROPOSED'`, `sourceKind = 'CHAT'`, `kind = 'MARK_ABSENT'`, `targetType = 'ATTENDANCE'` (no Attendance write at this stage; matches §7.6). `[P2]` The separate apply step (§7.7) transitions that DWI `PROPOSED → APPLIED` and writes Attendance + AuditEvent + Outbox in a single transaction at that moment. |
| **Who owns it**            | The supervisor with current responsibility for the worker's primary site at write time. Stamped on `DecisionWorkspaceItem.supervisorId` if proposed via chat (P2); stamped on `Attendance.markedBySupervisorId` directly for manual mark-absent (existing route).                                                                                                                                                                                                                                                                                                                                                                                                                       |
| **Who sees it**            | The acting/responsible supervisor for the site sees the change live; HR sees via Outbox-fanned-out push (P3 plumbing); worker sees via worker app (Phase B scaffolding).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Who can override**       | Supervisor (or acting supervisor) within 30-min reverse window via Activity tab. After 30 min, HR override only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **Absent actor**           | If the responsible supervisor is on acting-coverage, the acting supervisor performs the action. If no responsible supervisor (e.g., Worker has no active Assignment), routes to HR queue.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **In-progress collision**  | If a chat-proposed `propose_mark_absent` is `PROPOSED` and Today-tab manual mark-absent fires for the same worker+date: the manual route applies; the chat decision row transitions `PROPOSED → APPLIED` if its applied state matches, else `FAILED` with `STATE_ALREADY_CHANGED` (per D.1 §2.4 failure-reason enum).                                                                                                                                                                                                                                                                                                                                                                   |
| **Failure modes**          | Worker not in tenant (`TENANT_CONTEXT_MISMATCH`); already PRESENT today and changing to ABSENT requires explicit override; payroll deduct overflow.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **Preserved historically** | `Attendance` row + `AuditEvent` row are immutable after the 30-min reverse window expires. Origin supervisor (via `markedBySupervisorId`) is preserved forever.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Recomputed dynamically** | `Worker.state` may transition `ACTIVE → ABSENT` per `workerMachine`; the transition itself is a separate event triggered by the absence streak rule (not on first absence). Today/Decisions/Activity routing is read-time per the responsibility model.                                                                                                                                                                                                                                                                                                                                                                                                                                 |

### 7.2 Worker leave request → approval → return

| Concern                    | Resolution                                                                                                                                                                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| **Status**                 | **mixed** — routes exist `[CURRENT]`; HR-only role gate missing `[GAP — leave-requests.ts:125 accepts any authenticated caller, not HR-only]`; chat-propose path `[P2]`                                                                                                                           |
| **Trigger**                | `[CURRENT]` Worker submits via worker mobile (`POST /leave-requests`) OR `[P2]` supervisor proposes via chat (`propose_leave` tool); HR approves/rejects via `POST /leave-requests/:id/approve                                                                                                    | reject` `[CURRENT]`. |
| **Actor**                  | `[CURRENT]` Worker (request). HR (decision) — **but** `[GAP — leave-requests.ts:125 enforces only requireAuth, not HR-only role]` — the route handler currently allows any authenticated supervisor to approve. Spec intent is HR-only; enforcement is P2 work.                                   |
| **Inputs**                 | Request: `workerId`, `fromDate`, `toDate`, `reason`. Decision: `decisionNote` (optional, @personal).                                                                                                                                                                                              |
| **Outputs**                | Request: `LeaveRequest` row with `state = 'REQUESTED'`. Audit: `LEAVE_REQUESTED`. Outbox: `hr.leave_requested`. Decision (approve): `state = 'APPROVED'`, `decidedAt`, `decidedBy`. Audit: `LEAVE_APPROVED`. Outbox: `worker.leave_approved`. Decision (reject): symmetric with `LEAVE_REJECTED`. |
| **Who owns it**            | Request: the worker. Decision: HR (or by responsibility model, the supervisor responsible for the worker's primary site can pre-approve and HR ratifies — current implementation skips ratification, treats supervisor as decider).                                                               |
| **Who sees it**            | Worker (request status); responsible supervisor (Today tab shows pending leave); HR (queue of REQUESTED rows).                                                                                                                                                                                    |
| **Who can override**       | HR can revoke an APPROVED leave (audit-tracked via separate LEAVE_REVOKED event — not yet implemented).                                                                                                                                                                                           |
| **Absent actor**           | HR absent: today, no fallback. Future: owner inherits HR authority.                                                                                                                                                                                                                               |
| **In-progress collision**  | Leave overlapping with an already-APPROVED leave for the same worker on overlapping dates: rejection at app-layer (no DB constraint enforces this; planned P2 invariant).                                                                                                                         |
| **Failure modes**          | `state != 'REQUESTED'` on re-decision (idempotency = 409). Worker not in tenant. Dates inverted (fromDate > toDate).                                                                                                                                                                              |
| **Preserved historically** | `LeaveRequest` row immutable post-decision. Audit chain preserves the full request → decision → revocation sequence.                                                                                                                                                                              |
| **Recomputed dynamically** | Worker state may transition `ACTIVE → ON_LEAVE` on approval (per `workerMachine`). Attendance rows during the leave window get `status = 'ABSENT_APPROVED_LEAVE'` (not deduct). On return, supervisor manually clocks worker back in (or auto on first Visit clock-in).                           |

### 7.3 Worker swap request

| Concern                    | Resolution                                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Status**                 | **mixed** — `POST /swap-requests` exists `[CURRENT]`; ACCEPTED/APPLIED state transitions `[P2]`; chat-propose path `[P2]`                                                |
| **Trigger**                | `[CURRENT]` Supervisor decides to swap two workers between sites or shift slots; initiates via Today tab worker row. `[P2]` Or via chat (`propose_swap` tool).           |
| **Actor**                  | SUPERVISOR (`auth.userId`); writes to `SwapRequest.supervisorId`.                                                                                                        |
| **Inputs**                 | `fromWorkerId`, `toWorkerId`, `siteId`, `effectiveAt`, optional `reason`.                                                                                                |
| **Outputs**                | `SwapRequest` row, `state = 'SENT'`. Audit: `SWAP_REQUEST_SENT`. Outbox: `gupshup.send` (×2 — to each worker).                                                           |
| **Who owns it**            | The responsible supervisor at swap-creation time.                                                                                                                        |
| **Who sees it**            | Both workers (via SMS / mobile notification — Phase C plumbing); the supervisor's Decisions tab if proposed via chat.                                                    |
| **Who can override**       | Supervisor can `CANCEL` before workers respond. Workers can `ACCEPT` or `DECLINE`. After acceptance + `APPLIED`, only HR override.                                       |
| **Absent actor**           | If the initiating supervisor leaves before workers respond: acting supervisor sees the open swap on Today; can cancel or wait.                                           |
| **In-progress collision**  | Two simultaneous swaps for the same worker: app-layer rejects (currently no enforcement; planned P2). Swap involving a worker already on leave: app-layer guard rejects. |
| **Failure modes**          | `fromWorkerId == toWorkerId` (BAD_INPUT). Either worker not in tenant. Effective date in past.                                                                           |
| **Preserved historically** | `SwapRequest` row through all state transitions; audit chain preserves every send/accept/decline/apply/reverse event.                                                    |
| **Recomputed dynamically** | `Assignment` rows mutate on `APPLIED`: original assignment terminates, new assignment created (per Wave 4a-PRO patterns).                                                |

### 7.4 Visit lifecycle

| Concern                    | Resolution                                                                                                                                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**                 | **mixed** — `visitMachine` (12 states) exists `[CURRENT]`; nightly cron Visit-row creator `[P3+ placeholder]`; real AI verify dispatcher call `[P3+ stub today]`; `POST /visits/:id/end` exists `[CURRENT]` |
| **Trigger**                | `[P3+ placeholder]` Cron creates `Visit` rows in `SCHEDULED` state from active `Assignment` rows nightly (per Spec 1; cron is a placeholder today — Visits are seeded manually by tests).                   |
| **Actor**                  | System (cron) creates; worker drives state transitions via mobile clock-in/clock-out; AI verifies; supervisor resolves FLAGGED.                                                                             |
| **Inputs**                 | Per state: `WORKER_DEPART` event (en-route), `CLOCK_IN` event (on-site, photos before), `CLOCK_OUT` event (photos after), photo uploads, AI verification result.                                            |
| **Outputs**                | `Visit` row transitions through 12 states. `VisitPhoto` rows for each photo (BEFORE/AFTER). `AuditEvent('VISIT_ENDED')` on clock-out. Outbox: `ai.verify`.                                                  |
| **Who owns it**            | Worker (CLOCK_IN/CLOCK_OUT); AI (VERIFY); supervisor (RESOLVE on FLAGGED).                                                                                                                                  |
| **Who sees it**            | Today tab supervisor (real-time visit status per `Site → Worker → Visit` lookup); worker mobile (own visit only); HR / owner (aggregate reports — planned).                                                 |
| **Who can override**       | Supervisor can resolve FLAGGED Visits as OK or REJECT. CANCEL via supervisor action.                                                                                                                        |
| **Absent actor**           | If supervisor absent during FLAGGED state: acting supervisor sees the flag in Today urgency banner; can resolve. If worker absent during expected ON_SITE: state goes NO_SHOW.                              |
| **In-progress collision**  | Two CLOCK_IN events from same worker: idempotent — second is no-op. Visit deletion attempted while ON_SITE: blocked by FK + app guard.                                                                      |
| **Failure modes**          | Photo upload failure mid-clock-out (state remains PHOTOS_PENDING; worker retries). AI verification failure (state remains AWAITING_VERIFICATION; ops-tier escalation).                                      |
| **Preserved historically** | Visit row immutable; correction chain via `correctsVisitId` / `originalVisitId` for retroactive fixes. All audit events preserved.                                                                          |
| **Recomputed dynamically** | Visit state machine drives Today tab "ON SITE / SHORT / PENDING" metrics (3-metric floor pulse per R6 today.jsx).                                                                                           |

### 7.5 Calendar entry → assignment promotion

| Concern                    | Resolution                                                                                                                                                                                                                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**                 | **mostly current** — all four routes exist `[CURRENT]` (`POST /calendar`, `PATCH /calendar/:id`, `POST /calendar/:id/promote`, `GET /calendar`); `SITE_SHIFT_REQ` / `CHANGE_REQUEST` promote targets `[GAP — Wave 1 only supports ASSIGNMENT target]`                                               |
| **Trigger**                | `[CURRENT]` Supervisor creates a `CalendarEntry` of kind `TENTATIVE_ASSIGNMENT` on a date; later decides to promote it to a real `Assignment` (`POST /calendar/:id/promote`).                                                                                                                       |
| **Actor**                  | SUPERVISOR (`auth.userId` → `CalendarEntry.supervisorId`).                                                                                                                                                                                                                                          |
| **Inputs**                 | Create: `date`, `kind`, `payload` (kind-specific JSON). Promote: `targetKind` (`ASSIGNMENT` per Wave 1; `SITE_SHIFT_REQ` / `CHANGE_REQUEST` deferred).                                                                                                                                              |
| **Outputs**                | Create: `CalendarEntry` row with computed `editableUntil = min(createdAt + 30d, promotedAt)`. Audit: `CALENDAR_ENTRY_CREATED`. Promote: `CalendarEntry.promotedAt` set; new `Assignment` row created via `mapCalendarPayloadToAssignment`. Audit: `CALENDAR_ENTRY_PROMOTED` + `ASSIGNMENT_CREATED`. |
| **Who owns it**            | The creating supervisor. After promotion, the new `Assignment` is owned per responsibility-binding for its site.                                                                                                                                                                                    |
| **Who sees it**            | Today tab + Summary tab (calendar-entry rows visible to creator); other supervisors only see entries on sites in their portfolio.                                                                                                                                                                   |
| **Who can override**       | Creating supervisor can PATCH the entry within `editableUntil` window. After promotion, edits are blocked.                                                                                                                                                                                          |
| **Absent actor**           | If creating supervisor absent before promotion: acting supervisor can edit or promote within `editableUntil`.                                                                                                                                                                                       |
| **In-progress collision**  | Two simultaneous promotions of the same entry: second receives 409. Promotion when target conflict exists (worker double-booking): app-layer `detectConflicts` returns HARD conflicts; promotion blocks until resolved.                                                                             |
| **Failure modes**          | `kind = 'NOTE'` cannot be promoted (`canPromote` returns false). Promotion past `editableUntil`. Target type unsupported (`SITE_SHIFT_REQ` not yet implemented).                                                                                                                                    |
| **Preserved historically** | `CalendarEntry` row preserved post-promotion (`promotedAt`, `promotedToId` link). Audit chain.                                                                                                                                                                                                      |
| **Recomputed dynamically** | Tomorrow / This-Week views read `CalendarEntry` + promoted-Assignment unions at read time (per product framing §4.2 Layer B).                                                                                                                                                                       |

### 7.6 AI chat turn → decision extraction → DecisionWorkspaceItem (P1+)

| Concern                    | Resolution                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**                 | **mixed** — `POST /chat/messages` exists `[CURRENT]`; current chat writes `SupervisorDecision` placeholder rows (dropped in P1) `[CURRENT but soon-obsolete]`; `DecisionWorkspaceItem` table `[P1]`; `consequences[]` contract on `propose_*` tools `[P2]`                                                                                                                             |
| **Trigger**                | `[CURRENT]` Supervisor types or voices a turn in Chat tab. Frontend calls `POST /chat/messages` with `idempotencyKey`.                                                                                                                                                                                                                                                                 |
| **Actor**                  | SUPERVISOR (chat thread is `(companyId, supervisorId)` unique per `ChatThread.supervisorId`). AI (Anthropic) extracts intent + emits `propose_*` tool calls.                                                                                                                                                                                                                           |
| **Inputs**                 | `threadId`, `text` (voice transcript or typed), `idempotencyKey`.                                                                                                                                                                                                                                                                                                                      |
| **Outputs**                | `[CURRENT]` `ChatMessage` rows (user + assistant); `AuditEvent('CHAT_MESSAGE_CREATED')`; `Company.aiSpendDailyInr` incremented. `[P1]` Each `propose_*` tool call writes a `DecisionWorkspaceItem` row with `sourceKind = 'CHAT'`, `status = 'PROPOSED'`, `payload` carrying tool input, `tier` per policy. `[P2]` `consequences[]` field on the DWI payload (per product framing §6). |
| **Who owns it**            | The supervisor who initiated the chat. `DWI.supervisorId` = `auth.userId` at row creation (P1); P2 routes consult `SiteSupervisorBinding` to determine current routing.                                                                                                                                                                                                                |
| **Who sees it**            | Decisions tab (`PROPOSED` rows for the calling supervisor) per read-time binding lookup. Activity tab shows applied/dismissed terminal states.                                                                                                                                                                                                                                         |
| **Who can override**       | Supervisor accepts (`POST /decisions/:id/apply`), dismisses, or undoes within 30-min reverse window. AI cannot apply on its own.                                                                                                                                                                                                                                                       |
| **Absent actor**           | If supervisor goes absent before applying: acting supervisor sees the PROPOSED row in their Decisions tab (read-time binding).                                                                                                                                                                                                                                                         |
| **In-progress collision**  | 50-slot concurrent chat semaphore (per `chat-concurrency.ts`). Idempotency dedup via `ChatRequestLog` (24h TTL). Duplicate `idempotencyKey` returns cached response.                                                                                                                                                                                                                   |
| **Failure modes**          | `aiSpendDailyInr` exceeds cap (`AICostBudgetError → 429`). OpenAI/Anthropic API outage. Tool call validation fails (no DWI emitted).                                                                                                                                                                                                                                                   |
| **Preserved historically** | `ChatMessage` rows immutable. `DecisionWorkspaceItem` rows transition state but origin attribution (`supervisorId` at creation) is immutable.                                                                                                                                                                                                                                          |
| **Recomputed dynamically** | Today / Decisions tab visibility recomputes on every read per binding (per responsibility model §5.4).                                                                                                                                                                                                                                                                                 |

### 7.7 Decision apply (PROPOSED → APPLIED)

| Concern                    | Resolution                                                                                                                                                                                                                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**                 | **planned** — all `[P2]` (route `POST /decisions/:id/apply`, state machine, ack flow). Phase B legacy path `POST /chat/apply` exists `[CURRENT]` but reshapes around DWI in P2.                                                                                                               |
| **Trigger**                | `[P2]` Supervisor taps Apply on a `DecisionWorkspaceItem` in the Decisions tab. UI calls `POST /decisions/:id/apply`.                                                                                                                                                                         |
| **Actor**                  | The supervisor currently responsible for the affected site (per binding lookup at apply time).                                                                                                                                                                                                |
| **Inputs**                 | `decisionId`, optional `chosenOptionId` (for `needsReview = true` rows), optional `ackPayload` (for `ackRequired = true` EMPLOYMENT-tier rows).                                                                                                                                               |
| **Outputs**                | DWI transitions `PROPOSED → APPLIED`. Domain write happens in same transaction per D.1 §2.5 — e.g., `Attendance.create` for `MARK_ABSENT`, `LeaveRequest.update` for `APPROVE_LEAVE`, etc. AuditEvent emitted. Outbox topics enqueued per writer kind.                                        |
| **Who owns it**            | The supervisor applying (recorded via DWI lifecycle event in audit).                                                                                                                                                                                                                          |
| **Who sees it**            | Activity tab (terminal state row). The original supervisor (if different from applier — i.e., binding switched between propose-time and apply-time) sees the change in their "while you were out" digest on next open.                                                                        |
| **Who can override**       | UNDO within 30-min reverse window (`PROPOSED → APPLIED → UNDONE`). Past 30 min: only HR can override via manual correction (auditable but not "undo").                                                                                                                                        |
| **Absent actor**           | If supervisor goes absent between propose and apply: acting supervisor applies. If acting binding ends between propose and apply: original supervisor applies on return. Origin (`DWI.supervisorId`) stays the proposer's User.id.                                                            |
| **In-progress collision**  | Two simultaneous apply calls: first wins (idempotency-key required); second returns cached success. State-machine guards reject `APPLIED → APPLIED`.                                                                                                                                          |
| **Failure modes**          | `OVERLAP_CONFLICT`, `WORKER_ON_LEAVE`, `WORKER_NOT_FOUND`, `SITE_NOT_FOUND`, `STATE_ALREADY_CHANGED`, `BACKEND_VALIDATION_FAILED`, `PERMISSION_DENIED`, `TENANT_CONTEXT_MISMATCH`, `IDEMPOTENCY_REPLAY_CONFLICT`, `INVALID_OPTION_ID` (10 typed failure reasons per Wave 4b advisory review). |
| **Preserved historically** | DWI row immutable origin; AuditEvent for every transition. `failureReason` enum stored for FAILED rows.                                                                                                                                                                                       |
| **Recomputed dynamically** | Today tab counts of OPEN/PENDING decisions recompute on every read.                                                                                                                                                                                                                           |

### 7.8 HR Update post → supervisor ack

| Concern                    | Resolution                                                                                                                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**                 | **planned** — current `HRUpdate` is Phase B.2 placeholder (zero rows, zero callers); P1 drops it and recreates with new shape; routes `POST /hr-updates`, `POST /hr-updates/:id/ack`, `GET /hr-updates` `[P2]`; admin-web HR portal UI `[deferred R-version]` |
| **Trigger**                | `[P2]` HR posts via admin-web HR portal (not yet routed; `POST /hr-updates` planned per HR Updates spec §2.1). Single update or digest with `rules[]`.                                                                                                        |
| **Actor**                  | HR (`Membership.role = 'HR'`). Authority gated at route (P2).                                                                                                                                                                                                 |
| **Inputs**                 | `title`, `body`, optional `rules[]` (digest), `tier` (uniform within a digest per HR Updates spec §5), `ackRequired` (default true at launch).                                                                                                                |
| **Outputs**                | `HRUpdate` row + N `HRUpdateRule` child rows (single tx). Audit: `HR_UPDATE_POSTED`. Outbox: `hr_update.posted` → dispatcher fans out push notifications to all supervisors in `companyId`.                                                                   |
| **Who owns it**            | HR (originator); supervisors (responders).                                                                                                                                                                                                                    |
| **Who sees it**            | Every active supervisor in the company sees the update in the Updates tab (audience model per HR Updates spec §4.1).                                                                                                                                          |
| **Who can override**       | HR cannot edit a posted HRUpdate (append-only per D.1 §2.9). To correct, HR posts a follow-up update or HRUpdateRule.                                                                                                                                         |
| **Absent actor**           | HR absent: no fallback today (gap, see §8). Supervisor absent: acting supervisor sees the update; ack is per-supervisor (not per-user-acting), so the original supervisor must ack on return. **Open question** in §8.                                        |
| **In-progress collision**  | Two HR posts of the same content rapid-fire: each is its own row (no dedup by content).                                                                                                                                                                       |
| **Failure modes**          | Mixed-tier digest (`MIXED_TIER_NOT_ALLOWED`); `ackText` <5 words on ack attempt (`ACK_TEXT_TOO_SHORT`); HR not in tenant; rules>10 (soft warn only).                                                                                                          |
| **Preserved historically** | HRUpdate + HRUpdateRule rows are append-only. Audit chain for posted + acked events.                                                                                                                                                                          |
| **Recomputed dynamically** | "Acked by me" computed per caller. Per product framing §13, ack patches Layer C (supervisor day-context) immediately on success.                                                                                                                              |

### 7.9 Replacement invite (P1.5+, 2-min TTL)

| Concern                    | Resolution                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**                 | **mixed** — `ReplacementInvite` table lands `[P1]` (per the P1 schema migration plan); XState v5 machine + routes (`POST /replacement-invites`, `/:id/accept`, `/:id/reject`, `/:id/cancel`, `GET /replacement-invites`) land `[P2]`; cron sweep for 2-min TTL expiry lands `[P3]`. R6 prototype `replacement-picker.jsx` exists `[CURRENT]` as visual reference only. |
| **Trigger**                | `[P2]` Supervisor recognizes an absence and decides to find a replacement. Today tab site card menu → "Find replacement" → ReplacementPicker → select candidate → "Send invite — 2 min timer" (per R6 replacement-picker.jsx, which exists `[CURRENT]` as visual reference only).                                                                                      |
| **Actor**                  | SUPERVISOR (initiator); candidate worker (responder).                                                                                                                                                                                                                                                                                                                  |
| **Inputs**                 | `siteId`, `replacingWorkerId` (the absent worker), `candidateWorkerId`, optional `parentDecisionId` (the absence decision).                                                                                                                                                                                                                                            |
| **Outputs**                | `ReplacementInvite` row, `state = 'SENT'`, `expiresAt = now + 2 min`. Audit: `REPLACEMENT_INVITE_SENT`. Outbox: notification fan-out to candidate (gupshup or push, per future channel decisions).                                                                                                                                                                     |
| **Who owns it**            | The supervisor who sent the invite.                                                                                                                                                                                                                                                                                                                                    |
| **Who sees it**            | Candidate worker (notification); supervisor's Today tab (live 2-min countdown).                                                                                                                                                                                                                                                                                        |
| **Who can override**       | Supervisor can CANCEL mid-window. Candidate can ACCEPT or REJECT.                                                                                                                                                                                                                                                                                                      |
| **Absent actor**           | If supervisor goes absent before candidate responds: acting supervisor sees the live invite; can cancel and pick a different candidate.                                                                                                                                                                                                                                |
| **In-progress collision**  | Per D.1 §2.8 — serial invite only at launch. Parallel invites for the same absence are forbidden until the trigger metric (median replacement time >6 min for 2+ weeks across 5+ tenants) fires.                                                                                                                                                                       |
| **Failure modes**          | `INVITE_EXPIRED` (accept past 2-min); `INVITE_ALREADY_RESPONDED` (terminal state); `INVITE_CANCELLED_BY_SUPERVISOR`.                                                                                                                                                                                                                                                   |
| **Preserved historically** | ReplacementInvite row immutable post-terminal-state. Each transition emits AuditEvent.                                                                                                                                                                                                                                                                                 |
| **Recomputed dynamically** | Cron sweep (every 30s) closes expired invites — `SENT → EXPIRED` with `actorId = NULL`. Route-level check at accept enforces the 2-min window too (defense in depth).                                                                                                                                                                                                  |

### 7.10 Acting supervisor coverage (P1.5+)

| Concern                    | Resolution                                                                                                                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Status**                 | **planned** — all `[P1.5+]`: `SiteSupervisorBinding` table + bootstrap-seed lands P1.5; HR routes + admin-web portfolio UI `[deferred R-version]`                                                            |
| **Trigger**                | `[P1.5+]` HR observes a supervisor is/will be absent; uses admin-web HR portfolio view to create a temporary `SiteSupervisorBinding`.                                                                        |
| **Actor**                  | HR (`createdBy`); the bound supervisor (acting).                                                                                                                                                             |
| **Inputs**                 | `siteId(s)` (per-site or bulk-by-supervisor), `userId` (acting supervisor), `actingForUserId` (original supervisor being covered for), `effectiveFrom`, `effectiveUntil` (required), `reason`.               |
| **Outputs**                | One or more `SiteSupervisorBinding` rows. Audit: per binding creation. Outbox: push notification to acting supervisor on window start (per responsibility model pick 5).                                     |
| **Who owns it**            | HR (control); acting supervisor (operationally during the window); original supervisor (rightful, returns on `effectiveUntil`).                                                                              |
| **Who sees it**            | Acting supervisor sees the new sites in Today/Decisions; HR sees the binding row in portfolio view; original supervisor sees a "you'll be covered" note (UX TBD).                                            |
| **Who can override**       | HR can end early via `endedAt`; HR can extend via patching `effectiveUntil`; HR cannot retroactively shorten past now.                                                                                       |
| **Absent actor**           | HR creates the binding; nothing else. If acting supervisor refuses or is also absent: HR cancels + picks another.                                                                                            |
| **In-progress collision**  | No-overlap invariant (responsibility model §5.8): at most one active acting-coverage binding per site at a time. Same-kind overlap forbidden. Acting overrides permanent portfolio for the window.           |
| **Failure modes**          | `effectiveFrom` in the past (BAD_INPUT). Same-kind overlap (DB EXCLUDE constraint rejects). Site not in tenant. Acting supervisor not in tenant.                                                             |
| **Preserved historically** | Binding row preserved post-expiry (`endedAt` set, row stays). Audit chain for every binding event.                                                                                                           |
| **Recomputed dynamically** | Routing for every open `PROPOSED` decision recomputes via read-time JOIN — no DWI rows updated when the binding starts/ends. On expiry, original supervisor's Today/Decisions returns to baseline portfolio. |

### 7.11 Permanent portfolio reassignment (P1.5+)

| Concern                    | Resolution                                                                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**                 | **planned** — all `[P1.5+]`: uses the same `SiteSupervisorBinding` table as 7.10 with `actingForUserId = NULL` for permanent rows                                                                 |
| **Trigger**                | `[P1.5+]` HR rebalances: a strong supervisor gets more sites; a new supervisor ramps up; a premium site reassigns.                                                                                |
| **Actor**                  | HR (creator).                                                                                                                                                                                     |
| **Inputs**                 | `siteId`, `userId` (new responsible supervisor), `effectiveFrom`, `effectiveUntil = NULL` (open-ended), `reason`.                                                                                 |
| **Outputs**                | New `SiteSupervisorBinding` row (`actingForUserId = NULL`). The previous permanent binding for that site is ended (`endedAt = now`, `endedReason = 'reassigned'`). Audit: per binding transition. |
| **Who owns it**            | HR (control); new supervisor (operational). No "original" — permanent is permanent until next reassignment.                                                                                       |
| **Who sees it**            | New supervisor sees the new site immediately (read-time binding). Old supervisor sees the site disappear from Today.                                                                              |
| **Who can override**       | Only HR (next reassignment).                                                                                                                                                                      |
| **Absent actor**           | If HR absent: today, no fallback.                                                                                                                                                                 |
| **In-progress collision**  | No-overlap invariant: at most one permanent binding per site. New permanent assignment must end the prior one in the same transaction.                                                            |
| **Failure modes**          | Same as 7.10 plus: new supervisor not eligible (e.g., wrong role).                                                                                                                                |
| **Preserved historically** | Both bindings (old + new) preserved. Audit chain.                                                                                                                                                 |
| **Recomputed dynamically** | All open work for the site routes via the new binding immediately. Old supervisor's open `PROPOSED` rows for that site move to the new supervisor's Decisions tab on next render.                 |

### 7.12 Worker termination (EMPLOYMENT tier)

| Concern                    | Resolution                                                                                                                                                                                                                                                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Status**                 | **mixed** — `workerMachine` TERMINATION_PENDING/TERMINATED states exist `[CURRENT]`; full chat-propose → typed-phrase ack → HR-finalize flow `[P2]`; HR-ack-lock enforcement `[GAP — master plan §G names it but no code enforces today]`                                                                                   |
| **Trigger**                | `[P2]` Supervisor proposes via chat (`propose_terminate`) OR HR initiates directly (HR-portal flow, P2+).                                                                                                                                                                                                                   |
| **Actor**                  | SUPERVISOR (proposer) OR HR (direct). Final apply requires HR ack per master plan §G (HR-confirms-EMPLOYMENT-tier lock).                                                                                                                                                                                                    |
| **Inputs**                 | `workerId`, `reason`, `lastDay`. For supervisor-proposed: `DWI.ackRequired = true`; `ackPayload` must contain `phrase: 'TERMINATE'`.                                                                                                                                                                                        |
| **Outputs**                | `[P2]` DWI `PROPOSED → APPLIED` with ackPayload. `[CURRENT]` `Worker.state` transitions `ACTIVE → TERMINATION_PENDING` via `workerMachine` (state machine in place; transition driver not yet wired). `[P2]` Audit: `WORKER_TERMINATED_PENDING`. After payroll settles: `TERMINATION_FINALIZED` event → `TERMINATED` state. |
| **Who owns it**            | Supervisor (initiator) + HR (final-decider per master plan lock).                                                                                                                                                                                                                                                           |
| **Who sees it**            | Decisions tab (urgent banner per R6 `tier === 'EMPLOYMENT'`); admin-web HR queue (planned).                                                                                                                                                                                                                                 |
| **Who can override**       | Within 30-min reverse window: UNDO (returns `TERMINATION_PENDING → ACTIVE`). Past 30 min + before TERMINATION_FINALIZED: HR cancels via separate cancel flow. After TERMINATED: no override (archived per worker retention rule).                                                                                           |
| **Absent actor**           | Supervisor absent post-propose: acting sees the EMPLOYMENT urgent banner; can review but cannot final-apply without HR (per rule). HR absent: terminations stall pending HR return.                                                                                                                                         |
| **In-progress collision**  | Two simultaneous terminate proposals: app-layer rejects (only one open EMPLOYMENT-tier DWI per worker at a time).                                                                                                                                                                                                           |
| **Failure modes**          | `phrase != 'TERMINATE'` on ack (BAD_INPUT). Worker not in tenant. Worker already TERMINATED or ARCHIVED.                                                                                                                                                                                                                    |
| **Preserved historically** | DWI + Worker.state transitions + AuditEvent chain. Per `feedback_data_retention_forever`: Worker row + audit history preserved forever (GDPR anonymization only).                                                                                                                                                           |
| **Recomputed dynamically** | Payroll recompute triggers `worker.terminated → payroll.recompute` outbox topic. Final salary settled in next month-end batch.                                                                                                                                                                                              |

---

## §8 Exception matrix

Friend's list + additional ones surfaced during this synthesis. Each row: scenario, what happens today, what should happen, status.

| Scenario                                                              | What happens today                                                                                                            | What should happen                                                                                                                                                                                                        | Status                                                                                                                            |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Supervisor sick (1 day)**                                           | No structured handling — 2026-05-08 founder-lock said "share account"                                                         | HR creates `SiteSupervisorBinding` with `actingForUserId`, `effectiveUntil = absence_end`. Routing flows to acting. On return, binding auto-expires.                                                                      | **Resolved 2026-05-14** by responsibility model; P1.5 implementation lands the binding table.                                     |
| **Supervisor sick (1+ weeks)**                                        | Same as above                                                                                                                 | Same model, longer window. HR may end the window early if supervisor returns sooner.                                                                                                                                      | **Resolved 2026-05-14**.                                                                                                          |
| **Supervisor quits permanently**                                      | No handling                                                                                                                   | HR creates permanent `SiteSupervisorBinding` rows reassigning the portfolio to other supervisors. Original supervisor `Membership.status` → `INACTIVE`. Original `DWI.supervisorId` rows preserved as origin attribution. | **Resolved 2026-05-14** by responsibility model; UI for "transfer portfolio" lands with admin-web HR portal (deferred R-version). |
| **Worker has no site (newly hired, no Assignment)**                   | Worker-scoped decisions have no `siteId` to derive from → route fails                                                         | Per responsibility model §5.9: route to HR queue (no responsible supervisor exists yet). HR places worker via `Assignment` creation, then decisions route normally.                                                       | **Resolved 2026-05-14**. App-layer fallback to HR queue is P2 implementation.                                                     |
| **Worker has multiple sites simultaneously**                          | Per `Assignment` schema: legal — worker can have multiple active assignments                                                  | Per responsibility model §5.9: primary site = most-recent active Assignment by `createdAt DESC`. Tie-breaker explicit.                                                                                                    | **Resolved 2026-05-14**.                                                                                                          |
| **Overlapping acting-coverage windows for same site**                 | No constraint enforces this today                                                                                             | Per responsibility model §5.8: hard invariant — at most one active acting-window per site. Same-kind overlap forbidden by DB constraint (Postgres EXCLUDE) + app-layer guard.                                             | **Resolved 2026-05-14**. DB constraint shape locks in P1.5.                                                                       |
| **Acting supervisor window ends mid-workflow**                        | No structured handling                                                                                                        | Per responsibility model §5.6: auto-revert on `effectiveUntil`. Open `PROPOSED` rows for those sites flow back to original supervisor. Returning supervisor sees "while you were out" digest.                             | **Resolved 2026-05-14**. "While you were out" digest UX deferred (R-version).                                                     |
| **HR error (wrong reassignment)**                                     | Today: no remediation path                                                                                                    | HR ends the wrong binding early via `endedAt`. If terminal state on a decision was already applied during the wrong window: it stays terminal (immutable), but audit chain shows the routing path.                        | Partially resolved by responsibility model. Audit chain reconstruction UX is deferred.                                            |
| **Stale PROPOSED decisions**                                          | DWI has `EXPIRED` state per D.1 §2.4 but no cron yet                                                                          | Cron sweeps `PROPOSED` DWI rows older than configurable threshold (24h? 7d?) → `EXPIRED` with `actorId = NULL`. **Open question for P2.**                                                                                 | **Open** — cron lands P3+, threshold needs founder pick.                                                                          |
| **HR absent (vacation, sick)**                                        | No fallback today                                                                                                             | **Open gap.** Options: owner inherits HR authority temporarily; HR power vested in second HR member if exists; HR routes queue with no SLA. Needs explicit decision.                                                      | **Open** — not resolved by any current Active spec. Surfaced in §12.                                                              |
| **HR Update — supervisor absent during ack window**                   | No handling; ack is per-`supervisorId` per HR Updates §2.2                                                                    | **Open question.** Two interpretations: (a) acting supervisor acks on behalf and the audit reflects acting-supervisor-acked-while-covering-for-X; (b) ack is personal to the original supervisor and waits until return.  | **Open** — not resolved. Surfaced in §12.                                                                                         |
| **Worker who is also a User in multiple companies**                   | `Worker.userId` is optional; `User.companyId` is also optional — User can have memberships across companies                   | No cross-tenant data leak: every query scopes by `companyId`. A user with HR role in Company A and SUPERVISOR role in Company B sees only the rows from the tenant their JWT was issued for.                              | Resolved by existing multi-tenant invariant (`docs/invariants/multi-tenant.md`); enforced at every route.                         |
| **OTP brute force / replay**                                          | Per `otp-store.ts`: rate limit (max 2 per phone per interval); `consumed` flag prevents replay                                | Adequate at launch. Stronger limits (account lockout after N failures) deferred to security hardening.                                                                                                                    | Resolved by current implementation.                                                                                               |
| **AI budget exceeded mid-conversation**                               | `AICostBudgetError → 429` returned from `/chat/messages`                                                                      | Supervisor sees a "daily budget reached" UI. Cap resets at UTC midnight via `reset-ai-spend.ts` cron. Owner gets 80% warning + 100% cap outbox alerts.                                                                    | Resolved by current implementation.                                                                                               |
| **Outbox handler fails repeatedly**                                   | `failCount >= 5` → quarantined per `outbox.ts`                                                                                | Quarantined rows surface in ops queue (admin-web `/system` view — not yet routed). Manual investigation + retry.                                                                                                          | Partially resolved — UI to surface quarantined rows is deferred.                                                                  |
| **Visit FLAGGED but supervisor never resolves**                       | State stays `FLAGGED` indefinitely                                                                                            | App-layer cron: `FLAGGED` Visits older than 48h auto-escalate to HR queue. **Not implemented today; deferred.**                                                                                                           | **Open** — not implemented.                                                                                                       |
| **Worker takes leave during their replacement-invite window**         | No coordination — invite goes out anyway                                                                                      | App-layer guard: candidate-worker `Worker.state` must be `ACTIVE` to receive an invite. ON_LEAVE workers excluded from `ReplacementPicker` candidate list.                                                                | Resolved by `ReplacementPicker` filter logic per R6 `replacement-picker.jsx`.                                                     |
| **Two supervisors claim same site (data corruption / race)**          | DB constraint prevents — no two active permanent bindings per site (P1.5 EXCLUDE)                                             | Same — DB EXCLUDE constraint hard-blocks.                                                                                                                                                                                 | Resolved by P1.5 schema invariant.                                                                                                |
| **AI hallucinates worker name / fabricates decision**                 | Today: app-layer Zod validation rejects malformed tool inputs (`propose_*` returns must have `consequences[]` per framing §6) | Per framing §10: agents never invent facts. CI gate ensures `propose_*` tools declare `consequences[]` per output type. Tool outputs that summarize data MUST include `refs[]`.                                           | Partially resolved — Zod + CI gate are P2 implementation. Today: trust-and-verify with manual audit.                              |
| **Acting supervisor accepts a decision the original is unhappy with** | No undo across binding boundary — terminal states stay terminal                                                               | Audit chain shows acting-applied-while-covering. Original supervisor cannot retro-undo, but can file a formal correction (HR-escalated workflow).                                                                         | Partially resolved — formal-correction UI deferred.                                                                               |
| **Mid-shift binding switch (mid-day acting handover)**                | No special handling                                                                                                           | Per responsibility model: acting window starts at `effectiveFrom`. Open work moves immediately. No state inconsistency.                                                                                                   | Resolved by read-time routing model.                                                                                              |

---

## §9 Routing & authority model

### 9.1 Tenant boundary

Every query scopes by `companyId` via `withTenantContext` wrapper (per `apps/backend/src/middleware/tenant-context.ts`). Every multi-column index leads with `companyId`. JWT carries `companyId` + `userId` + `role`. Cross-tenant data access is impossible at the route layer; super-admin observability is a separate role-gated surface.

### 9.2 Role authority (verified from route handlers + spec rules)

| Action                         | Who can                                                 | Verified via                                                 |
| ------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------ |
| Mark worker absent             | SUPERVISOR with responsibility for worker's site        | `workers.ts:54` + responsibility-binding lookup (P1.5)       |
| Approve leave                  | HR (current implementation allows any supervisor — gap) | `leave-requests.ts:125`                                      |
| Reject leave                   | Same as approve                                         | Same                                                         |
| Create assignment              | SUPERVISOR                                              | `assignments.ts:14`                                          |
| Create calendar entry          | SUPERVISOR                                              | `calendar.ts:29`                                             |
| Promote calendar entry         | SUPERVISOR (creator)                                    | `calendar.ts:156`                                            |
| End visit                      | SUPERVISOR                                              | `visits.ts:39`                                               |
| Log site complaint             | SUPERVISOR                                              | `sites.ts:37`                                                |
| Initiate worker swap           | SUPERVISOR                                              | `swap-requests.ts:38`                                        |
| Post HR Update                 | HR                                                      | Planned route per HR Updates spec §2.1 (not yet implemented) |
| Ack HR Update                  | SUPERVISOR (each in audience)                           | Planned route per HR Updates spec §2.2                       |
| Apply decision                 | SUPERVISOR (currently responsible per binding)          | Planned route per D.1 (P2)                                   |
| Undo decision (30-min)         | SUPERVISOR (the applier)                                | Planned (P2)                                                 |
| Manage responsibility binding  | HR                                                      | Planned (P1.5+)                                              |
| Terminate worker (EMPLOYMENT)  | SUPERVISOR proposes + HR ack                            | Per master plan §G HR-confirms lock                          |
| Override anything past 30-min  | HR (with audit)                                         | Per `feedback_data_retention_forever`                        |
| Bank account / tenant settings | OWNER                                                   | Planned (admin-web /owner)                                   |
| Cross-tenant access            | SUPER_ADMIN                                             | `/api/graph/route.ts:6`                                      |

### 9.3 Authority change events

Listed for audit clarity:

- `SiteSupervisorBinding` created → supervisor authority over site begins at `effectiveFrom`
- `SiteSupervisorBinding` ended (manual or cron) → authority returns to baseline portfolio (or to next-in-chain binding)
- `Membership.status = INACTIVE` → all authority revoked (handled at route layer via auth middleware re-check)
- `Membership.role` changed → authority shifts per new role (manual HR action; rare)
- `User.status = INACTIVE` → all authority revoked across all memberships

Each event writes an AuditEvent row (kinds named per existing taxonomy; many not yet implemented).

---

## §10 Audit consequences

### 10.1 What is preserved historically (immutable)

- Every `DecisionWorkspaceItem` row's `supervisorId` (origin at creation) — never mutated.
- Every `Attendance`, `LeaveRequest`, `SwapRequest`, `Complaint`, `Visit`, `VisitPhoto` row's authoring user reference — never mutated.
- Every `AuditEvent` row — append-only.
- Every `HRUpdate` + `HRUpdateRule` row — append-only per D.1 §2.9.
- Worker history per `feedback_data_retention_forever`: Worker row + audit chain preserved forever even after TERMINATED + ARCHIVED + ANONYMIZED.

### 10.2 What is recomputed dynamically (no row updates)

- "Currently responsible supervisor" for any open work: computed read-time via `SiteSupervisorBinding` lookup (P1.5+, per responsibility model §7.ii.a).
- Today / Decisions tab visibility per supervisor: read-time JOIN against binding.
- Tomorrow / This-Week views: read-time projection from `Assignment` + `CalendarEntry` + open `Decision` rows (per product framing §4.2 Layer B).
- "While you were out" digest: read-time aggregation of decisions applied during the supervisor's absence window.
- `Worker.state` derived counts (ACTIVE / ON_LEAVE / etc.): read-time queries against `Worker.state`.

### 10.3 Audit-event taxonomy (currently observed in route handlers + designed for P1/P2)

Observed in code today:

- `WORKER_MARKED_ABSENT`, `LEAVE_APPROVED`, `LEAVE_REJECTED`, `LEAVE_REQUESTED`
- `SITE_COMPLAINT_LOGGED`
- `SWAP_REQUEST_SENT`
- `ASSIGNMENT_CREATED`, `CALENDAR_ENTRY_CREATED`, `CALENDAR_ENTRY_UPDATED`, `CALENDAR_ENTRY_PROMOTED`
- `VISIT_ENDED`
- `CHAT_MESSAGE_CREATED`
- `OWNER_BUDGET_ALERT_DISPATCHED`
- `AI_SPEND_DAILY_RESET`

Planned (P1/P2 per D.1 §2.4):

- `DWI_PROPOSED`, `DWI_APPLIED`, `DWI_DISMISSED`, `DWI_FAILED`, `DWI_EXPIRED`, `DWI_UNDONE`
- `<APPLY_KIND>_REVERSED` family: `ATTENDANCE_REVERSED`, `LEAVE_REVERSED`, `SWAP_REVERSED`, `TERMINATION_REVERSED`, `ASSIGNMENT_REVERSED`
- `HR_UPDATE_POSTED`, `HR_UPDATE_ACKED`
- `REPLACEMENT_INVITE_SENT`, `REPLACEMENT_INVITE_ACCEPTED`, `REPLACEMENT_INVITE_REJECTED`, `REPLACEMENT_INVITE_EXPIRED`, `REPLACEMENT_INVITE_CANCELLED`

Planned (P1.5):

- `BINDING_CREATED`, `BINDING_ENDED_MANUAL`, `BINDING_ENDED_AUTO` (for `SiteSupervisorBinding`)

### 10.4 Outbox topics (verified)

Today:

- `hr.worker_absent`, `hr.site_complaint`, `hr.leave_requested`
- `worker.leave_approved`, `worker.leave_rejected`
- `payroll.recompute`
- `ai.verify`
- `gupshup.send`
- `owner.ai_budget_warning`, `owner.ai_budget_capped`

Planned (P2+):

- `hr_update.posted`, `hr_update.acked`
- `replacement.invite_sent`, `replacement.invite_expired`
- `binding.created`, `binding.ended` (P1.5)

---

## §11 Design consequences

What this whole model implies for schema, code, and feature design. Binding rules for downstream specs.

### 11.1 Person-bound (immutable across coverage / reassignment)

- `User` identity — name, phone, locale
- `Worker.userId` link
- `DecisionWorkspaceItem.supervisorId` (origin attribution)
- `Attendance.markedBySupervisorId` (origin)
- `ChatThread.supervisorId` (creator)
- `CalendarEntry.supervisorId` (creator)
- `SwapRequest.supervisorId` (initiator)
- `Complaint.supervisorId` (logger)

### 11.2 Responsibility-bound (mediated by `SiteSupervisorBinding`, P1.5+)

- Open `DWI.PROPOSED` row visibility on Today/Decisions
- HR Updates push fan-out audience (per HR Updates spec §4.1 — currently all-supervisors; future per-site routing)
- ReplacementPicker candidate filtering by site
- "Who is responsible for site X right now?" queries

### 11.3 Site-bound (intrinsic to the site itself)

- `Site.state` (14-state SiteState)
- `Site.workdays` pattern
- `Complaint` rows (FK siteId)
- `Visit` rows (FK siteId)

### 11.4 Written once + preserved (immutable after creation)

- `AuditEvent` rows
- `HRUpdate` + `HRUpdateRule` rows (per D.1 §2.9 append-only)
- DWI origin attribution (`supervisorId`, `sourceKind`, `sourceId`, `kind`, `tier` at creation)
- `Visit.completedAt`, `VisitPhoto.r2Key`
- `SwapRequest.appliedAt`
- `Attendance.markedBySupervisorId`

### 11.5 Recomputed at read time (no storage)

- Tomorrow / This-Week projection (per framing §4.2)
- Layer C supervisor day-context (per framing §4.3; TTL-evicted)
- Today / Decisions current-routing supervisor (per responsibility model §7.ii.a)
- Open-decision counts per supervisor

### 11.6 Operations-required features (not optional)

- Real audit trail (every state transition writes AuditEvent in same tx)
- Outbox pattern for side-effects (no fire-and-forget)
- Multi-tenant scoping every query (via `withTenantContext`)
- Idempotency keys on every chat turn + decision apply
- Cron jobs that auto-expire (DWI EXPIRED, ReplacementInvite EXPIRED, SiteSupervisorBinding endedAt)

### 11.7 Forbidden patterns

- Account sharing (replaced by responsibility model §6)
- Mutating origin attribution on existing rows (preserve forever per `feedback_data_retention_forever`)
- Sweeping `PROPOSED` DWI rows on binding change (per responsibility model §7.ii.a — read-time only)
- Storing tomorrow / week plans in tables (per framing §17 rule 1 — no `WeeklyPlan` / `TomorrowPlan` / `ProposedAssignment` tables)
- AI free-text claims without `refs[]` grounding (per framing §10)
- Auto-applying AI proposals (per framing §17 rule 6 — acceptance is the only Layer B → A bridge)

---

## §12 Open questions surfaced by this synthesis

These are not yet resolved by any Active spec. Each needs a future review pass.

1. **HR absence fallback** — who acts when HR is unreachable? Today: nothing. Options: owner inherits; second HR member; HR queue with no SLA. (Surfaced in §3.2, §8.)
2. **HR Update ack during supervisor absence** — does acting supervisor ack on behalf, or does ack wait for original supervisor's return? (Surfaced in §8.)
3. **DWI `EXPIRED` threshold** — how stale before a `PROPOSED` DWI auto-expires? 24h? 7d? Per-kind threshold? (Surfaced in §8.)
4. **FLAGGED visit auto-escalation** — cron-escalate to HR after 48h, or different threshold? (Surfaced in §8.)
5. **HR portal admin-web routes** — not yet implemented. R6 covers supervisor mobile; the HR + owner admin-web surfaces are an unwritten R-version.
6. **Worker app surface** — Phase B scaffolding exists; full worker mobile UI (assignment cards, swap responses, replacement-invite responses, leave submission) is unplanned.
7. **Cross-supervisor portfolio visibility** — can a supervisor see another supervisor's portfolio? Today: no. Should there be a "team view"? (Master plan §C mentions this in passing.)
8. **Site-level acks for HR Updates** — currently audience is all-supervisors-in-companyId. Per-site routing via binding is technically possible but unspecified.
9. **Wage / payroll routing** — outbox topics `payroll.recompute` fire but handler is a stub; full payroll system is Phase D scope.
10. **Worker transfer between companies** — `workerMachine` has `TRANSFER_PENDING` state, but the cross-tenant transfer flow is unimplemented and lacks an Active spec.

---

## §13 What this doc does NOT do

- Does NOT introduce new schema. Every entity listed in §4 is either already in `schema.prisma` or named in an Active spec (D.1 / responsibility model).
- Does NOT pick implementation details. The 10 open questions in §12 need separate review.
- Does NOT replace any existing Active spec. Conflicts resolve against the existing spec; this doc surfaces them as gaps.
- Does NOT design new UI. The HR portal + worker app surfaces are flagged as unspecified.
- Does NOT touch `connectedness/` manifests. Manifest updates happen when entities actually land.
- Does NOT modify the P1 or P1.5 plans. Those plans stay locked.

---

## §14 Approval gate — CLOSED 2026-05-14

All gate conditions met (see §1 status block). Doc is **Active but contract-incomplete**.

1. ✅ Friend review of §3 / §4 / §7 / §8 / §11 contents (2 substantive review passes + 2 cleanup passes — authority contradiction, Status row separation, §7.1/§7.9 internal consistency).
2. ⏸ Founder approval of §12 open questions — **deferred**; the questions are documented as named gaps under the "contract-incomplete" classification, not resolved by this promotion.
3. ⏸ Remaining §12 open questions get "deferred to which iteration" stamps — **deferred to future review passes** as each question becomes load-bearing for a specific implementation milestone.
4. ⏸ Cross-references propagated into D.1 / R6 / HR Updates / framing / responsibility-model — **deferred to a separate batch** (not part of this promotion per founder pick 2026-05-14).

Standing rules now binding:

- Any feature spec, R-version, or migration touching a persona / workflow / exception / routing rule / audit consequence named here must consult this trunk.
- Conflicts between this trunk and a downstream Active contract spec default to the contract spec; genuine conflicts go back to friend for relock.
- The 10 §12 open questions remain open until separately addressed.

---

## §15 Cross-references

- D.1 Decision entity lock: `docs/specs/2026-05-12-decision-entity-lock.md`
- R6 supervisor mobile design: `docs/specs/2026-05-12-supervisor-mobile-r6-design.md`
- HR Updates spec: `docs/specs/2026-05-12-hr-updates-spec.md`
- Product framing: `docs/specs/2026-05-13-product-framing.md`
- Supervisor responsibility model: `docs/specs/2026-05-14-supervisor-responsibility-model.md`
- Phase C Spec 1 (Assignment + Visit): `docs/specs/2026-05-09-phase-c-assignment-design.md`
- Phase C Spec 2 (AI chat + LivingDoc): `docs/specs/2026-05-09-phase-c-spec-2-ai-chat-design.md`
- Multi-tenant invariant: `docs/invariants/multi-tenant.md`
- Doc discipline protocol: `docs/protocols/doc-discipline.md`
- Canonical index: `docs/index/canonical-truth.md`
- 23 ADRs: `docs/decisions/0001-*.md` through `0023-*.md`
- P1 schema migration plan: `/Users/thotaakshay/.claude/plans/tranquil-crunching-plum.md` (outside repo)
- Connectedness manifests: `connectedness/features/*.yml` (10 manifests)
