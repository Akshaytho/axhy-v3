# Phase C — Spec 1: Assignment primitive

> **Status:** DRAFT for founder review
> **Date:** 2026-05-09
> **Sequence:** Spec 1 of 3 in Phase C (Spec 2 = AI chat, Spec 3 = Mobile UI)
> **Depends on:** Phase B (50/50 integration tests green, dispatcher live, schema in sync with Railway)
> **Authors:** Akshay (founder) + panel debate (2026-05-09 session)

> **How to give async feedback:** anywhere in this doc, leave `> FOUNDER NOTE: …` lines.
> Save and push (or commit on GitHub mobile/web). I integrate next session.

---

## TL;DR (lock from your phone in 30 seconds)

1. **18-table schema** — adds 6 new tables (Assignment, ChangeRequest, CalendarEntry, SiteShiftRequirement, ChatThread, ChatMessage) + Visit correction columns. Schema lock #18 = `chat/CalendarEntry` (founder-proposed soft-state planning surface).
2. **3 Assignment states** — `DRAFT`, `ACTIVE`, `TERMINATED`. No PAUSED/EXPIRED/SUPERSEDED_BY (no scenario forces them). EXPIRED is a computed view.
3. **Visit materialization = cron tight + compute-on-the-fly + on-action lazy.** Cron generates today + tomorrow only. Future-day reads compute from rules. First action on a future day materializes that day's rows.
4. **Past Visits append-only.** Corrections via `correctsVisitId` chain + `latest_visit` view. Reporting queries forbidden from direct Visit reads (ESLint-enforced).
5. **5 ChangeRequest kinds ship in v3.0**: LEAVE, SWAP, VISIT_CORRECTION, TERMINATION_PROBATION, TERMINATION_PERMANENT. SALARY_ADVANCE / BANK_UPDATE / WORKER_TRANSFER deferred to v3.1.
6. **Approvers route to SUPERVISOR or HR by default; OWNER reserved for legal anchors + HR-absent fallback.** Owner is hands-off operationally.
7. **20-tool AI surface contract** (14 `propose_*` + 6 read) locks the Spec 1 → Spec 2 interface. Routes 1:1 mapped. Patched 2026-05-09 from live tool-use test (Move 1) — added `find_sites`, `propose_replace_visit_worker`, collapsed termination to one tool, defined `Ambiguity` type, multi-call pattern for compound utterances.
8. **Calendar (soft state) is distinct from Assignment (hard state).** AI reads 30-day Calendar window for context. Soft → hard via DecisionCard promotion.

---

## 1. Why this spec exists

Phase B shipped the supervisor backend foundation: 5 Tier 1 routes (mark-absent, leave-decide, complaint, swap-request, end-visit), AuditEvent + Outbox + Device foundation, dispatcher with retries, 50/50 integration tests on real Railway. No AI yet.

Phase C adds three load-bearing surfaces:

- **The assignment primitive** — recurring patterns from which Visits auto-generate. Replaces V2's daily-row Assignment model that caused bug cascades.
- **AI chat + LivingDoc** (Spec 2)
- **Supervisor mobile UI** (Spec 3)

This spec covers the assignment primitive only. It is the foundation Spec 2's tool surface and Spec 3's UI build on top of.

**Why split into 3 specs:** each surface has distinct review surface, distinct test discipline, distinct implementation arc. Bundling produces a 3000+ word doc that's hard to review and hard to track. Each spec ships independently with its own panel debate, but all three deploy together as Phase C v1.

---

## 2. What ships (locks summary)

| #            | Lock                                                                                                                                                                                                       | Source                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Q1           | Assignment = open-ended pattern. `validUntil` nullable. Termination = state transition + sets validUntil.                                                                                                  | Q1 panel debate                                            |
| Q2           | 3 states only: DRAFT, ACTIVE, TERMINATED. EXPIRED computed-on-read.                                                                                                                                        | Q2 panel debate                                            |
| Q3           | Past Visits append-only. `correctsVisitId` chain. `latest_visit` view. ESLint-enforced reporting discipline. Mutability windows: current month = supervisor approves; past month = HR; cross-scope = HR.   | Q3 round-3 panel debate                                    |
| Q3           | Approver-role principle: SUPERVISOR + HR own approvals; OWNER for legal anchors + HR-absent fallback.                                                                                                      | Q3 round-3 + `feedback_phase_c_approver_role_principle.md` |
| Q4           | Materialization: cron today+tomorrow, compute-on-the-fly preview beyond, lazy materialize on first action.                                                                                                 | Q4 panel debate                                            |
| Q4-extended  | Calendar (soft state) = `chat/CalendarEntry` table, 18th in schema. 30-day editable forward window. AI reads for context. Soft → hard promotion via DecisionCard.                                          | Founder-proposed + adopted                                 |
| Q5           | Conflict policy: HARD (leave, terminated, anonymized) / SOFT (overlap) / SUGGEST_PROMOTE (Calendar tentative) / INFO. Override flow with preset chips. Voice-low-confidence makes "Re-record" primary CTA. | Q5 round-2 panel debate                                    |
| Q6           | 5 ChangeRequest kinds ship: LEAVE, SWAP, VISIT_CORRECTION, TERMINATION_PROBATION, TERMINATION_PERMANENT. SALARY_ADVANCE / BANK_UPDATE / WORKER_TRANSFER / SITE_REASSIGN defer to v3.1.                     | Q6 panel debate                                            |
| Q7           | 20-tool AI surface contract (14 `propose_*` + 6 read); 1:1 backend route mapping; standardized DecisionCard return shape; `Ambiguity` type defined; multi-call pattern; AI utterance translations.         | Q7 panel debate + Move 1 patches                           |
| Q7-rolled-in | rruleOverride deferred entirely (no real customer scenario yet). Tenant.holidays JSON for v3.0 (no Holiday table).                                                                                         | Q7 + Q4 lock                                               |

---

## 3. Schema

### 3.1 The 6 buckets, 18 tables

```
people/      — User, Worker, Membership                              (3 tables)
places/      — Client, Site, SiteShiftRequirement                    (3 tables)
work/        — Assignment, Visit, VisitPhoto, Attendance             (4 tables)
decisions/   — ChangeRequest, Complaint                              (2 tables)
chat/        — ChatThread, ChatMessage, LivingDoc, CalendarEntry     (4 tables)  ← +1 from 17-lock
infra/       — Company, AuditEvent, Outbox, Device                   (4 tables)
                                                              total: 18 tables
```

Memorize the 6 buckets, not the 18 tables. Each scenario typically touches 5–7 tables, never all 18.

### 3.2 Assignment

```ts
model Assignment {
  id          String   @id @default(cuid())
  companyId   String
  workerId    String
  siteId      String
  shiftStart  String   // "HH:mm" — e.g., "09:00"
  shiftEnd    String   // "HH:mm" — e.g., "17:00"
  dayMask     String   // 7-char: "MTWTFS_" = Mon-Sat, "_______" = none, "MTWTFSS" = all 7
  validFrom   DateTime
  validUntil  DateTime?  // null = open-ended
  state       String   @default("DRAFT")  // DRAFT | ACTIVE | TERMINATED
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  terminatedReason String?  // free text when state=TERMINATED
  terminatedBy     String?  // FK Membership

  worker  Worker  @relation(fields: [workerId], references: [id])
  site    Site    @relation(fields: [siteId], references: [id])
  company Company @relation(fields: [companyId], references: [id])

  @@index([companyId, state])
  @@index([workerId, state])
  @@index([siteId, state])
}
```

**Constraint:** DB-level rule blocks UPDATE on Assignment when `validUntil < CURRENT_DATE` AND state != 'TERMINATED' — past-immutability anchor. Implemented as a Postgres trigger.

### 3.3 ChangeRequest

```ts
model ChangeRequest {
  id           String   @id @default(cuid())
  companyId    String
  kind         String   // 'LEAVE' | 'SWAP' | 'VISIT_CORRECTION' | 'TERMINATION_PROBATION' | 'TERMINATION_PERMANENT'
  payload      Json     // kind-specific shape, Zod-validated at app layer
  state        String   @default("DRAFT")
                        // DRAFT | PENDING | APPROVED | REJECTED | CANCELLED | APPLIED | EXPIRED

  requestedBy  String   // FK Membership
  requestedAt  DateTime @default(now())

  approverRole String   // 'SUPERVISOR' | 'HR' | 'OWNER' — resolved at create time via defaultApprover()
  approvedBy   String?  // FK Membership
  decidedAt    DateTime?
  decisionNote String?

  expiresAt    DateTime  // PENDING → EXPIRED if not decided
                         // 7 days for LEAVE/SWAP/VISIT_CORRECTION; 14 days for TERMINATION_*

  appliedAt    DateTime? // when state → APPLIED (Outbox cascade complete)
  cancelledAt  DateTime?
  cancelledBy  String?

  company  Company @relation(fields: [companyId], references: [id])

  @@index([companyId, state])
  @@index([companyId, kind])
  @@index([approverRole, state])
}
```

**Payload Zod schemas** live in `packages/shared-schema/src/changeRequest/`:

```ts
// LEAVE
{ workerId, fromDate, toDate, reason: 'sick'|'casual'|'vacation'|'emergency'|'other',
  reasonDetail?: string, dailyDeduction?: boolean }

// SWAP
{ workerAId, workerBId, dateRange: { from, to }, swapKind: 'shifts'|'sites'|'both' }

// VISIT_CORRECTION
{ visitId, originalVisitId, fields: { siteId?, startTime?, endTime?, notes? },
  reason: 'wrong-site'|'wrong-time'|'duplicate'|'other', reasonDetail?: string }

// TERMINATION_PROBATION
{ workerId, effectiveDate, reason: 'performance'|'attendance'|'misconduct'|'mutual'|'other',
  reasonDetail?: string, finalSettlementDate?, noticeWaived?: boolean }

// TERMINATION_PERMANENT
{ workerId, effectiveDate, reason: 'performance'|'attendance'|'misconduct'|'mutual'|'redundancy'|'other',
  reasonDetail: string,        // REQUIRED — legal record
  noticePeriodDays: number,
  finalSettlementDate, gratuityApplicable: boolean,
  signedDocumentRef?: string   // FK to uploaded termination letter PDF in R2
}
```

### 3.4 CalendarEntry (the 18th table)

```ts
model CalendarEntry {
  id             String   @id @default(cuid())
  companyId      String
  supervisorId   String   // FK Membership (per-supervisor)
  date           DateTime @db.Date
  kind           String   // 'NOTE' | 'DEMAND' | 'TENTATIVE_ASSIGNMENT' | 'EVENT'
  payload        Json     // kind-specific structured fields
  notes          String?  /// @personal — PII-bearing free text (DPDP scrub on erasure)

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  editableUntil  DateTime // computed: min(createdAt + 30d, promotedAt). Stored for query speed.

  promotedToKind String?  // 'ASSIGNMENT' | 'SITE_SHIFT_REQ' | 'CHANGE_REQUEST' | null
  promotedToId   String?
  promotedAt     DateTime?

  company  Company @relation(fields: [companyId], references: [id])

  @@index([companyId, supervisorId, date])
  @@index([companyId, date])  // for AI's 30-day-context query
}
```

**Kinds (locked for v3.0):**

| kind                   | payload                                         | example                                |
| ---------------------- | ----------------------------------------------- | -------------------------------------- |
| `NOTE`                 | `{}` (notes carries content)                    | "Diwali Mon — short shifts everywhere" |
| `DEMAND`               | `{ siteId, headcount, shift?, skillRequired? }` | Apollo needs 5 workers on May 25       |
| `TENTATIVE_ASSIGNMENT` | `{ workerId, siteId, shiftStart?, shiftEnd? }`  | Thinking Pradeep at Apollo Tuesday     |
| `EVENT`                | `{ siteId?, title, startTime?, endTime? }`      | Client visit at Apollo noon            |

### 3.5 SiteShiftRequirement

```ts
model SiteShiftRequirement {
  id              String  @id @default(cuid())
  companyId       String
  siteId          String
  shiftStart      String  // "HH:mm"
  shiftEnd        String  // "HH:mm"
  dayMask         String  // 7-char like Assignment
  requiredHeadcount Int
  skillRequired   String? // free-text skill tag e.g. "machine-operator"
  validFrom       DateTime
  validUntil      DateTime?
  notes           String?

  site    Site    @relation(fields: [siteId], references: [id])
  company Company @relation(fields: [companyId], references: [id])

  @@index([companyId, siteId])
}
```

**Demand vs supply:** SiteShiftRequirement = demand (this site needs N workers on these days/times). Assignment = supply (this worker fills part of demand). They are independent rows. Coverage gap reports compute `SUM(requiredHeadcount) - COUNT(matching active assignments)` on the fly. **No FK between them.**

### 3.6 Visit additions (correction columns)

Visit table (already exists from Phase B) gains:

```ts
correctsVisitId  String?  @relation("Correction", references: [id])  // FK self
originalVisitId  String   @relation("Original", references: [id])    // self-pointer to root of correction chain
correctionReason String?  // 'wrong-site' | 'wrong-time' | 'duplicate' | 'other'
correctionNote   String?
```

**Partial unique index** (engineering discipline):

```sql
CREATE UNIQUE INDEX visit_canonical_per_chain
  ON Visit (originalVisitId)
  WHERE correctsVisitId IS NULL;
```

Guarantees one canonical (uncorrected) row per chain.

**`latest_visit` view:**

```sql
CREATE VIEW latest_visit AS
  SELECT v.* FROM Visit v
  WHERE NOT EXISTS (
    SELECT 1 FROM Visit v2
    WHERE v2.correctsVisitId = v.id
  );
```

All payroll/billing/reporting queries MUST read via `latest_visit`. ESLint custom rule enforces this in `services/payroll/*` and `services/billing/*`.

### 3.7 Phase B tables RETIRED in Phase C migration

- `LeaveRequest` (Phase B.2) → migrated rows into `ChangeRequest` with `kind=LEAVE`
- `SwapRequest` (Phase B.2) → migrated rows into `ChangeRequest` with `kind=SWAP`

`HRUpdate` (B.2) and `SupervisorDecision` (B.2) — keep both for now. Revisit during Spec 2/3 to see if they merge into ChangeRequest.

### 3.8 Migration plan

One Prisma migration `003_phase_c_assignment.sql`:

1. Create `Assignment`, `SiteShiftRequirement`, `CalendarEntry` tables.
2. Alter `ChangeRequest` from Phase B's existing shape (currently `LeaveRequest` + `SwapRequest` separate tables) to the universal table. Migrate existing rows with `kind` set per source.
3. Add Visit correction columns + partial unique index + `latest_visit` view.
4. Drop `LeaveRequest`, `SwapRequest` tables (after row migration).
5. Add `Tenant.holidays Json @default("[]")`.
6. Seed `axhy-sandbox` tenant with realistic Phase C data.

Migration runs against `axhy-sandbox` first (real Railway), then production after validation.

---

## 4. State machines

### 4.1 Assignment — 3 states

```
                    ┌─ propose_create_assignment ─┐
                    │       (AI proposes)         │
                    ▼                             │
                ┌────────┐                        │
                │ DRAFT  │  ◄────────────────────┘
                └───┬────┘
                    │ supervisor confirms (Apply on DecisionCard)
                    │ + re-runs detectConflicts; if conflict, fail tx
                    ▼
                ┌────────┐
                │ ACTIVE │ ◄─── (most assignments live here forever)
                └───┬────┘
                    │ propose_terminate_assignment
                    │ + sets validUntil = effectiveDate
                    ▼
              ┌────────────┐
              │ TERMINATED │  (terminal)
              └────────────┘
```

**EXPIRED** is a computed view (`state='ACTIVE' AND validUntil < CURRENT_DATE`). Never stored. Cron does NOT auto-transition state.

**AuditEvent** writes on every state transition AND every `validUntil` change. AuditEvent is the legal/compliance answer.

### 4.2 ChangeRequest — single machine, 5 kinds

```
DRAFT ──submit──► PENDING ──┬── APPROVED ──cascade──► APPLIED
                            ├── REJECTED                  (terminal)
                            ├── CANCELLED
                            └── EXPIRED (TTL)
                                         (all terminal)
```

**TTL (`expiresAt`):**

- LEAVE / SWAP / VISIT_CORRECTION: 7 days from PENDING.
- TERMINATION_PROBATION / TERMINATION_PERMANENT: 14 days from PENDING.

**Guards:**

- TERMINATION_PERMANENT: requires `payload.signedDocumentRef` set before APPROVED → APPLIED.
- VISIT_CORRECTION: requires `payload.visitId` to belong to a Visit not in past-month-locked window unless approver = HR.

---

## 5. Visit materialization model

### 5.1 Cron — today + tomorrow

```ts
// runs daily at 00:30 local-tenant-time
async function materializeTodayAndTomorrow(tenantId): Promise<void> {
  for each Active Assignment of tenant:
    if dayMask matches today AND not blocked by approved LEAVE AND not Tenant.holidays.includes(today):
      ensure Visit row exists with state=SCHEDULED for today
    if dayMask matches tomorrow AND not blocked AND not holiday:
      ensure Visit row exists with state=SCHEDULED for tomorrow
}
```

### 5.2 Beyond tomorrow — compute on the fly

```ts
// pure function in packages/state-machines/visit/preview.ts
function previewVisits(args: {
  workerId?: string;
  siteId?: string;
  supervisorScope?: string;
  dateRange: { from; to };
}): VisitPreview[];
```

Returns shape `Visit & { isPreview: true }`. No DB writes. 5-min view cache.

Reads consult: Assignment + ChangeRequest (LEAVE) + Tenant.holidays + SiteShiftRequirement (for headcount context).

### 5.3 On action — lazy materialize

When supervisor takes action on a future day (swap, leave-applied, correction-proposed) AND no Visit row exists for that day:

```ts
async function materializeVisitsForDate(date: Date, tenantId: string): Promise<Visit[]>;
```

Atomically:

1. Run preview for that date.
2. Insert Visit rows with state=SCHEDULED.
3. Apply the action.
4. Write AuditEvent.

Same write path as cron uses — single source of truth for materialization.

### 5.4 Cache invalidation

- Cache TTL: 5 minutes per `(workerId, dateRange)` and per `(siteId, dateRange)`.
- Bust on: any write to Assignment / ChangeRequest / CalendarEntry / Visit affecting workers/sites in cached range.
- v3.0 implementation: in-process LRU (no Redis dependency). Per-tenant scope. Lives in `apps/backend/services/cache/preview-cache.ts`. Migration to Redis when concurrent reads exceed single-instance capacity (re-debate trigger).

### 5.5 Past-day handling

Past Visits are frozen Visit rows from when day was today/tomorrow (cron-materialized). Read directly from Visit table (or `latest_visit` view if reporting). Past Assignment rows immutable per Postgres trigger.

---

## 6. Past-immutability + correction routing

### 6.1 Append-only Visit + correction chain

Every Visit row is append-only after the day passes. Edits create a NEW Visit row with `correctsVisitId` pointing to the row being corrected, `originalVisitId` pointing to the root of the chain.

```
Original Visit (V1, Friday) ──── correctsVisitId? = null, originalVisitId = V1
        ▲
        │ correctsVisitId
        │
Correction Visit (V2)        ──── correctsVisitId = V1, originalVisitId = V1
        ▲
        │
Correction-of-correction (V3) ──── correctsVisitId = V2, originalVisitId = V1
```

`latest_visit` view (Section 3.6) returns V3 for queries about "this Friday's visit."

### 6.2 Mutability windows

| Time window                           | Approver            | UX                                                      |
| ------------------------------------- | ------------------- | ------------------------------------------------------- |
| Current month, supervisor's own scope | SUPERVISOR (direct) | AuditEvent only, no ChangeRequest                       |
| Current month, cross-scope            | HR                  | `ChangeRequest(kind=VISIT_CORRECTION)`                  |
| Past month                            | HR                  | `ChangeRequest(kind=VISIT_CORRECTION)` + Outbox cascade |

Windows are by `Visit.scheduledFor`, not by correction-creation time.

### 6.3 Correctable fields

- ✅ via `propose_visit_correction`: `siteId`, `startTime`, `endTime`, `notes`
- ✅ via `propose_replace_visit_worker` (separate tool): `workerId`. AI translates supervisor utterances like "correct, was Pradeep not Suresh" into this tool — NOT into `propose_visit_correction(fields: { workerId })`.
- ❌ `aiVerificationScore`, `phoneOtpAttempts` — system-generated, never edited

**Why two tools:** changing the worker on a Visit is semantically different from correcting site/time/notes. It terminates one worker's record and creates another's, with payroll implications for both. A single DecisionCard renders the dual operation atomically.

### 6.4 Cascades on every Visit correction

| Always                                           | If Visit's date is in an issued invoice's range |
| ------------------------------------------------ | ----------------------------------------------- |
| AuditEvent (with before/after JSON)              | Outbox: `billing.recompute_invoice(invoiceId)`  |
| `latest_visit` view auto-updates                 |                                                 |
| Outbox: `payroll.recompute(workerId, dateRange)` |                                                 |

### 6.5 Worker visibility of corrections

Worker app shows latest version + caption "Updated by [Supervisor name] on [date]." Tap reveals original (read-only). Worker can file a complaint about a correction → routes to HR.

### 6.6 Abuse alert

Any Visit with >3 corrections in 7 days flags to HR via supervisor profile dashboard. Soft alert, not a block.

### 6.7 Engineering discipline (NON-NEGOTIABLE)

1. **ESLint custom rule** in `tools/eslint-rules/no-direct-visit-read.js`:
   - Forbids `prisma.visit.find*` calls in `services/payroll/*` and `services/billing/*`.
   - Must use `prisma.latestVisit.find*` (mapped to view).
2. **Postgres partial unique index** (Section 3.6) guarantees one canonical row per chain.
3. **Integration test:** create Visit + 3 corrections; assert payroll + billing + supervisor app all return correction #3, never originals.

---

## 7. Conflict policy

### 7.1 Severity tiers

| Conflict                                          | Severity                                          | Behavior                                                                                                                  |
| ------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Approved LEAVE blocks new assignment              | HARD (simple tool) / **composite tool available** | `propose_create_assignment` → HARD error. Composite tool `propose_cancel_leave_and_reassign` allows in-flow cancellation. |
| Worker `state=TERMINATED`                         | HARD                                              | No override. Re-hire = new Membership row.                                                                                |
| Worker `state=ANONYMIZED` (DPDP-scrubbed)         | HARD, no override                                 | Decommissioned worker, no assignments allowed.                                                                            |
| Time-overlapping ACTIVE Assignment / Visit        | SOFT                                              | DecisionCard with timeline-overlap diagram + override chips.                                                              |
| CalendarEntry `kind=TENTATIVE_ASSIGNMENT` matches | SUGGEST_PROMOTE                                   | AI proposes `propose_promote_calendar_entry` instead of new-create.                                                       |
| Same-day-no-overlap (multi-shift)                 | INFO, conditional                                 | Show only when establishing new multi-shift; suppress on subsequent edits.                                                |
| DRAFT Assignment overlap                          | INFO                                              | No block. Re-checked at DRAFT → ACTIVE; transition can fail.                                                              |

### 7.2 Override flow

DecisionCard "Create anyway" reveals **preset chips** (tap-fast, structured):

- ▢ Split shift
- ▢ Covering for [worker picker]
- ▢ Mistake — cancel
- ▢ Other → 5+ word free text

80% of overrides should be one chip-tap. AuditEvent records `{ chipReason, freeText?, supervisorId, conflictsDetected, voiceConfidence? }`.

### 7.3 Voice low-confidence flow

When Sarvam STT confidence = LOW AND a conflict is detected, DecisionCard makes "Re-record" the primary CTA, "Create anyway" secondary. Reduces phantom overrides from misheard times.

### 7.4 Pure function

All conflict logic lives in `packages/state-machines/conflicts.ts`:

```ts
export function detectConflicts(
  ctx: { workerId: string; dateRange: DateRange; newShift: ShiftSpec },
  state: { activeAssignments; visits; calendarEntries; changeRequests },
): Conflict[];

export function matchTentatives(
  criteria: { workerId; siteId?; shiftRange? },
  tentatives: CalendarEntry[],
): { exact: CalendarEntry[]; ambiguous: CalendarEntry[]; none: boolean };
```

No DB writes in this package. Pure functions, deterministic, fully testable.

### 7.5 Pilot monitoring (Spec 3 surface)

- Override rate. >30% = conflict logic too aggressive, re-tune.
- Voice-share-of-creates. <70% in pilots = override UX too heavy, revisit.

---

## 8. Approver-role principle

Per `feedback_phase_c_approver_role_principle.md` (locked 2026-05-09):

### 8.1 Per-kind default approver table

| Kind                                         | Default    | Threshold escalation     |
| -------------------------------------------- | ---------- | ------------------------ |
| LEAVE                                        | HR         | —                        |
| SWAP                                         | SUPERVISOR | —                        |
| WORKER_TRANSFER (deferred to v3.1)           | HR         | —                        |
| SITE_REASSIGN (deferred)                     | HR         | —                        |
| VISIT_CORRECTION (current month, own scope)  | SUPERVISOR | —                        |
| VISIT_CORRECTION (past month or cross-scope) | HR         | —                        |
| SALARY_ADVANCE (deferred)                    | HR         | OWNER if > 1 month's pay |
| BANK_UPDATE (deferred)                       | OWNER      | —                        |
| TERMINATION_PROBATION                        | HR         | —                        |
| TERMINATION_PERMANENT                        | OWNER      | — (Indian labor law)     |

### 8.2 `defaultApprover()` function

Single source of truth in `packages/state-machines/changeRequest/approver.ts`:

```ts
export function defaultApprover(
  kind: ChangeRequestKind,
  payload: object,
  tenant: { id; hasActiveHRMember: boolean },
): 'SUPERVISOR' | 'HR' | 'OWNER';
```

Handles HR-absent fallback: if resolved role is `HR` and tenant has no active HR member, return `OWNER`.

### 8.3 Owner UX (admin web — Spec 3 territory)

- Default landing: aggregated reports + tenant config. NO operational approval inbox.
- Small "Owner sign-off needed" inbox shown only when an OWNER-routed item exists. Empty most days.

---

## 9. AI tool surface contract — 20 tools (14 `propose_*` + 6 read)

This is the **Spec 1 → Spec 2 interface.** Spec 2's AI chat builds tools that call these. Spec 1 implements the backend routes (Section 10).

> **Patched 2026-05-09 from Move 1 (live tool-use test):** added `find_sites`, expanded `find_workers` return shape with disambiguation context, defined `Ambiguity` type explicitly, added `propose_replace_visit_worker`, collapsed termination tools to single `propose_termination` (backend computes probation/permanent from tenure), simplified composite tool signature to use `fromDate` not `leaveId`, added `oneOffDate` shorthand on `propose_create_assignment`, documented multi-call pattern for compound utterances.

### 9.1 Assignment tools (5)

```ts
// Recurring assignment (95% case)
propose_create_assignment(
  workerId, siteId, dayMask, shiftStart, shiftEnd, validFrom,
  validUntil?
)

// Single-day shorthand (one-off "send Suresh to Westfield today")
// Backend auto-fills: validFrom = validUntil = oneOffDate, dayMask = day-of-week of oneOffDate
propose_create_assignment(
  workerId, siteId, oneOffDate, shiftStart, shiftEnd
)

propose_terminate_assignment(assignmentId, effectiveDate, reason?)
propose_modify_assignment(assignmentId, changes: { dayMask?, shiftStart?, shiftEnd?, validUntil? })

// Composite — backend resolves which active LEAVE for workerId covers fromDate
propose_cancel_leave_and_reassign(workerId, fromDate, newAssignment)

// Visit-level worker swap (one Visit, replace worker)
propose_replace_visit_worker(visitId, newWorkerId, reason, reasonDetail?)
```

### 9.2 ChangeRequest tools (6)

```ts
propose_leave(workerId, fromDate, toDate, reason, reasonDetail?)
propose_swap(workerAId, workerBId, dateRange, swapKind)
propose_visit_correction(visitId, fields: { siteId?, startTime?, endTime?, notes? }, reason, reasonDetail?)

// Single termination tool — backend computes probation vs permanent from tenure (>=240 days continuous)
// Backend sets approverRole: HR (probation) or OWNER (permanent), validates signedDocumentRef if permanent
propose_termination(workerId, effectiveDate, reason, reasonDetail, signedDocumentRef?)

propose_decide_change_request(crId, decision: 'APPROVE'|'REJECT', decisionNote?)
propose_cancel_change_request(crId)
```

### 9.3 Calendar tools (3)

```ts
propose_calendar_entry(date, kind, payload, notes?)
propose_promote_calendar_entry(entryId, target: 'assignment'|'requirement'|'change_request')
propose_edit_calendar_entry(entryId, changes)
```

### 9.4 Read tools (6, no DB writes)

```ts
get_worker_status(workerId) → { worker, activeAssignments, pendingChangeRequests, currentLeave?, recentVisits }
get_supervisor_today_pulse(supervisorId) → { todayVisits, pendingApprovals, openComplaints, calendarToday }

find_workers(query, supervisorScope: boolean) → {
  exact: WorkerWithContext[],
  ambiguous: WorkerWithContext[],
  none: boolean
}
find_sites(query, supervisorScope: boolean) → {
  exact: SiteWithContext[],
  ambiguous: SiteWithContext[],
  none: boolean
}
find_calendar_entries(supervisorId, dateRange) → CalendarEntry[]
find_change_requests(filters) → ChangeRequest[]

// Disambiguation context shapes (for AI's AmbiguousDecisionCard rendering)
type WorkerWithContext = {
  id, name, role, phone_last4,
  recentSite?: string,         // most recent assigned site
  recentAction?: string,       // 'clocked in 06:30 today' | 'on leave Tue-Wed' | etc
  tenureDays: number           // for probation/permanent termination resolution
}
type SiteWithContext = {
  id, name, alias?, address_brief,
  activeAssignments: number,
  client_name: string
}
```

### 9.5 Standardized return shape (every `propose_*`)

```ts
type ToolResponse = {
  toolCallId,
  decisionCardData: DecisionCardData | { batch: DecisionCardData[] },  // see "Multi-call pattern" below
  conflicts: Conflict[],                                                // from conflicts.ts
  ambiguities?: Ambiguity[],                                            // see Ambiguity type below
  voiceConfidence?: 'HIGH' | 'MEDIUM' | 'LOW'                           // passthrough from Sarvam
}

type DecisionCardData = {
  title, description,                                                   // for chat bubble
  fields: { ... },                                                      // for the card UI
  severity: 'OK' | 'CONFIRM' | 'WARN' | 'BLOCKED',
  presets?: { chips: [...] }                                            // override flow
}

type Ambiguity = {
  kind: 'MISSING_INFO' | 'AMBIGUOUS_WORKER' | 'AMBIGUOUS_SITE' | 'OFF_TOPIC' | 'CONTRADICTION'
  what?: 'workerId' | 'siteId' | 'date' | 'shift' | string  // which field is ambiguous
  candidates?: Array<{ id, label, context }>                // for selection card rendering
  prompt: string                                            // human-readable question for DecisionCard
}
```

### 9.6 Multi-call pattern (compound utterances)

When supervisor's utterance maps to multiple structured operations, AI emits multiple `propose_*` tool calls in a SINGLE turn. Frontend collects them and renders as ONE DecisionCard with sub-items, atomic confirm.

**Examples:**

- _"Apollo needs 5 next Tuesday, thinking Pradeep"_ → `propose_calendar_entry(kind='DEMAND')` + `propose_calendar_entry(kind='TENTATIVE_ASSIGNMENT')` — one DecisionCard, two sub-cards.
- _"Lock in Apollo Tuesday"_ (where 2 tentatives exist) → `propose_promote_calendar_entry(entry1)` + `propose_promote_calendar_entry(entry2)` — one DecisionCard, batch promotion.
- _"Cancel Suresh's leave + put him on Apollo tomorrow"_ → single `propose_cancel_leave_and_reassign` call (composite tool encapsulates the two ops).

Per-call vs composite-tool decision rule: **use a composite tool when the operations are tightly coupled and meaningless in isolation** (cancel-leave-and-reassign — neither half makes sense alone). **Use multi-call when operations are independent but contextually related** (Calendar demand + tentative — supervisor might want either separately).

### 9.7 AI behavior translations (utterance → tool mapping)

Some natural utterances don't map 1:1 to a tool name; AI must translate the supervisor's mental model to the right shape:

| Utterance                                               | NOT this tool                                         | Use this tool                                         |
| ------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------- |
| _"correct Wednesday Westfield, was Pradeep not Suresh"_ | `propose_visit_correction(fields: { workerId })`      | `propose_replace_visit_worker(visitId, newWorkerId)`  |
| _"send Suresh to Apollo today only"_                    | `propose_calendar_entry(kind='TENTATIVE_ASSIGNMENT')` | `propose_create_assignment(oneOffDate)`               |
| _"fire Pradeep"_                                        | `propose_termination_probation` OR `_permanent`       | `propose_termination` (backend resolves tenure)       |
| _"thinking next Tuesday Apollo needs five workers"_     | `propose_create_assignment(validFrom=Tuesday)`        | `propose_calendar_entry(kind='DEMAND')`               |
| _"Suresh maybe Pradeep covers Apollo Tuesday"_          | `propose_create_assignment` (commits prematurely)     | `propose_calendar_entry(kind='TENTATIVE_ASSIGNMENT')` |

---

## 10. Backend routes (1:1 mapping)

| Tool                                                                                  | Route                                                                                                                                                      |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `propose_create_assignment`                                                           | `POST /assignments` (creates state=DRAFT). `oneOffDate` shorthand handled server-side: validFrom=validUntil=oneOffDate, dayMask=day-of-week of oneOffDate. |
| `propose_terminate_assignment`                                                        | `PATCH /assignments/:id/terminate`                                                                                                                         |
| `propose_modify_assignment`                                                           | `PATCH /assignments/:id`                                                                                                                                   |
| `propose_cancel_leave_and_reassign`                                                   | Composite tx: backend looks up active LEAVE for `workerId` covering `fromDate`, cancels it, then creates new Assignment.                                   |
| `propose_replace_visit_worker`                                                        | `PATCH /visits/:id/replace-worker` — atomically writes correction Visit row (new workerId) + AuditEvent + Outbox payroll.recompute for both workers.       |
| `propose_leave` / `propose_swap` / `propose_visit_correction` / `propose_termination` | `POST /change-requests` (kind in body). `propose_termination`: backend computes tenure → kind=TERMINATION_PROBATION or \_PERMANENT.                        |
| `propose_decide_change_request`                                                       | `POST /change-requests/:id/decide`                                                                                                                         |
| `propose_cancel_change_request`                                                       | `POST /change-requests/:id/cancel`                                                                                                                         |
| `propose_calendar_entry`                                                              | `POST /calendar`                                                                                                                                           |
| `propose_promote_calendar_entry`                                                      | `POST /calendar/:id/promote`                                                                                                                               |
| `propose_edit_calendar_entry`                                                         | `PATCH /calendar/:id`                                                                                                                                      |
| `get_worker_status`                                                                   | `GET /workers/:id/status`                                                                                                                                  |
| `get_supervisor_today_pulse`                                                          | `GET /supervisor/:id/today-pulse`                                                                                                                          |
| `find_workers`                                                                        | `GET /workers/search?q=...&supervisorScope=...`                                                                                                            |
| `find_sites`                                                                          | `GET /sites/search?q=...&supervisorScope=...`                                                                                                              |
| `find_calendar_entries`                                                               | `GET /calendar?supervisorId=...&from=...&to=...`                                                                                                           |
| `find_change_requests`                                                                | `GET /change-requests?...`                                                                                                                                 |

---

## 11. Outbox cascades

| Kind                  | APPROVED triggers                              | APPLIED triggers                                               |
| --------------------- | ---------------------------------------------- | -------------------------------------------------------------- |
| LEAVE                 | `gupshup.send` (notify worker)                 | `payroll.recompute` (current period)                           |
| SWAP                  | (none — supervisor confirms via UI)            | `gupshup.send` (notify both workers)                           |
| VISIT_CORRECTION      | (none)                                         | `payroll.recompute`, `billing.recompute_invoice` (if invoiced) |
| TERMINATION_PROBATION | `gupshup.send` (notify worker), `hr.terminate` | `payroll.final_settlement`                                     |
| TERMINATION_PERMANENT | `gupshup.send`, `hr.terminate`, `legal.notify` | `payroll.final_settlement`, `legal.archive_record`             |

All handlers stub-only in Spec 1; Spec 2 wires real Gupshup / payroll / R2.

**New Outbox topics this spec adds (beyond Phase B):**

- `hr.terminate` — fires on TERMINATION_PROBATION/PERMANENT APPROVED
- `payroll.final_settlement` — fires on TERMINATION\_\* APPLIED
- `billing.recompute_invoice` — fires on VISIT_CORRECTION APPLIED if invoiced
- `legal.notify` — fires on TERMINATION_PERMANENT APPROVED
- `legal.archive_record` — fires on TERMINATION_PERMANENT APPLIED

Phase B's existing topics (`hr.worker_absent`, `hr.site_complaint`, `worker.leave_approved`, `worker.leave_rejected`, `gupshup.send`, `payroll.recompute`, `ai.verify`) remain. Total Outbox topics after Spec 1 = 12.

---

## 12. Engineering discipline

### 12.1 ESLint custom rules

| Rule                                      | Enforces                                                                                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `no-direct-visit-read-in-payroll-billing` | Direct `prisma.visit.find*` forbidden in `services/payroll/*`, `services/billing/*`. Must use `latest_visit` view.               |
| `no-owner-default-in-change-request`      | `defaultApprover()` is the single source of truth for `OWNER` routing. Don't hardcode `OWNER` elsewhere.                         |
| `assignment-write-via-state-machine`      | Direct `prisma.assignment.update({ state: ... })` forbidden. Must go through `packages/state-machines/assignment/transition.ts`. |

### 12.2 DB constraints

- Postgres trigger: blocks UPDATE on Assignment when `validUntil < CURRENT_DATE` AND `state != 'TERMINATED'`. Returns 403-equivalent error.
- Partial unique index on Visit (`originalVisitId WHERE correctsVisitId IS NULL`) — one canonical row per chain.
- Foreign-key cascades: SET NULL on `correctsVisitId` if the corrected Visit is hard-deleted (rare — usually anonymization scrubs PII but keeps row).

### 12.3 Pure-function packages

| Package                                    | Contains                          | Has DB? |
| ------------------------------------------ | --------------------------------- | ------- |
| `packages/state-machines/assignment/`      | transition graph, guards          | No      |
| `packages/state-machines/changeRequest/`   | transition graph, defaultApprover | No      |
| `packages/state-machines/conflicts.ts`     | detectConflicts, matchTentatives  | No      |
| `packages/state-machines/visit/preview.ts` | previewVisits                     | No      |

DB writes happen ONLY in `apps/backend/services/*` and `apps/backend/routes/*`.

---

## 13. Test surface

### 13.1 Unit tests (`packages/state-machines/**`)

- Assignment state transitions: ~6 cases (create-draft, draft→active happy, draft→active conflict, active→terminated, terminated-is-terminal, draft-cancel).
- ChangeRequest transitions: ~12 cases (per kind: create, approve, reject, cancel, expire, applied).
- `detectConflicts` matrix: ~20 cases covering Q5 severity table.
- `matchTentatives`: ~6 cases (exact, ambiguous, none, with-shifts, with-sites, mixed).
- `previewVisits`: ~10 cases (basic dayMask, holiday, leave-overlap, mid-day terminate, multi-shift).
- `defaultApprover`: ~10 cases (every kind × HR-present and HR-absent).

### 13.2 Integration tests (`tests/integration/phase-c/**`)

Each on real Railway via `axhy-sandbox` tenant:

- `assignment-lifecycle.test.ts`: create → activate → terminate. Asserts AuditEvents + Outbox messages.
- `change-request-lifecycle.test.ts`: per kind, create → decide → applied (via dispatcher).
- `visit-correction.test.ts`: create Visit + 3 corrections; assert payroll/billing/supervisor-app return latest.
- `calendar-promotion.test.ts`: create CalendarEntry → promote → assert hard-state row + promotedTo populated.
- `materialization.test.ts`: cron generates today+tomorrow; future-day query returns previews; on-action lazy materialize works.
- `conflict-detection.test.ts`: end-to-end via routes — leave-blocks, overlap-warns, tentative-suggests-promote.
- `cross-tenant-isolation.test.ts` (extends Phase B's): every new route enforces tenant scope.

Targets: 60+ integration tests across 7 files, all green on real Railway.

### 13.3 Water-flow test (E2E pre-merge gate)

Per `feedback_integration_vs_water_flow.md`:

1. Supervisor JWT logs in.
2. Calls `POST /assignments` directly with curl/script.
3. Asserts: Assignment row created (state=DRAFT), AuditEvent written.
4. Activates via `PATCH /assignments/:id` (state=ACTIVE).
5. Cron runs (forced via dev endpoint), Visits materialize for tomorrow.
6. Submits `POST /change-requests` (kind=LEAVE).
7. HR approves.
8. Outbox cascade fires (`gupshup.send` stub logs message; `payroll.recompute` stub logs).
9. Asserts: every step's AuditEvent + Outbox row exists.

This is the GATE before Spec 2 starts. No green water-flow = no Spec 2.

---

## 14. What's deferred from Spec 1

| Item                                                                               | Reason                                                                    | Triggers re-debate                                         |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `rruleOverride` column on Assignment                                               | dayMask covers 95%+; no real customer scenario for alternate-week.        | First customer with bi-weekly site cleaning.               |
| Holiday table                                                                      | `Tenant.holidays Json` adequate for v3.0.                                 | Multi-tenant per-region holiday calendars.                 |
| SALARY_ADVANCE / BANK_UPDATE / WORKER_TRANSFER / SITE_REASSIGN ChangeRequest kinds | Add via 1-line enum + Zod schema + state-machine entry + tool. ~1-2 days. | Pilot demand for any of them.                              |
| Owner approval inbox in admin web                                                  | No OWNER-routed items in default tenant setup.                            | When a tenant has no HR + needs OWNER fallback frequently. |
| Holiday-aware cron variations (e.g., short-shift Diwali)                           | `Tenant.holidays` blocks materialization; partial-shift not v3.0.         | First customer with explicit half-day-holiday operations.  |
| Vector RAG over Calendar                                                           | Calendar 30-day window fits prompt cache.                                 | When calendar history >90 days needs retrieval.            |

---

## 15. Re-debate triggers

| Signal                                        | What forces re-debate                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------- |
| Override usage > 30% in pilot data            | Conflict logic too aggressive — re-tune severity tiers.                         |
| Voice-share-of-creates < 70% in pilots        | Override UX too heavy — revisit chip flow.                                      |
| Cache invalidation issues (stale previews)    | Move from compute-on-the-fly to materialize-N-days-ahead.                       |
| Calendar adoption < 30% by pilot supervisors  | Calendar table is wrong shape OR UI not surfacing it well.                      |
| New ChangeRequest kind needed (real scenario) | Add via 1-line enum + Zod + state-machine + tool. No re-debate of core machine. |
| Schema migration shape change (not additive)  | Triggers full panel re-debate. Additive changes require only founder approval.  |

---

## 16. Glossary

| Term                           | Meaning                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Hard state**                 | Committed, audit-grade rows: Assignment, Visit, ChangeRequest.                                                     |
| **Soft state**                 | Tentative supervisor planning: CalendarEntry. Convertible to hard state via promotion.                             |
| **dayMask**                    | 7-character string `M T W T F S S` representing weekday recurrence. `MTWTFS_` = Mon-Sat.                           |
| **Materialization**            | Creating a Visit row from an Assignment pattern. Cron does today+tomorrow; on-action does lazy.                    |
| **Compute-on-the-fly preview** | Pure-function generation of future-day Visit shapes from Assignment + ChangeRequest + holidays, without DB writes. |
| **`latest_visit` view**        | SQL view returning the most-recent (uncorrected) row in each Visit correction chain.                               |
| **DecisionCard**               | UI primitive in supervisor mobile app: AI proposes, supervisor taps Apply.                                         |
| **Approver-role principle**    | SUPERVISOR + HR own approvals; OWNER for legal anchors + HR-absent fallback.                                       |
| **Soft → hard promotion**      | Converting a CalendarEntry to Assignment / SiteShiftRequirement / ChangeRequest.                                   |
| **Outbox cascade**             | Async side-effects (Gupshup, payroll, billing) triggered by ChangeRequest state transitions.                       |

---

## 17. Sign-off

> **Founder review:** approve, request changes, or open new questions inline as `> FOUNDER NOTE: …`. Once approved, this spec gets locked (status changes from DRAFT to LOCKED) and the implementation plan is written via the writing-plans skill.

> **Implementation gate:** Phase B 50/50 tests must remain green. Any regression on Phase B tests during Spec 1 implementation = stop, fix, re-run.

> **Next step after lock:** writing-plans skill produces `docs/specs/2026-05-09-phase-c-assignment-plan.md` — wave-by-wave implementation plan with checkpoints. Then code begins on `feat/phase-c-assignment` branch.
