# HR Workers Area — Exact Data Spec (system level)

**Date:** 2026-06-13 · **Companion to:** `02-hr-portal-design-brief.md` §6.2
**Source of truth:** every field below is copied from `packages/shared-schema/prisma/schema.prisma` and the live `admin-workers` route. Tags: **[DB]** stored field · **[DERIVED]** computed from stored data · **[NEW]** needs a new/extended endpoint.

---

## 1. Workers LIST `/hr/workers`

**Scope (server-enforced):** only workers with an `Assignment` in state `ACTIVE` or `DRAFT` to a site this HR owns (`Site.ownerHrId = me`). Site-less HR ⇒ empty list, by design.

### Columns

| #   | Column (display) | Source                                                            | Type / values                                   | Notes                                               |
| --- | ---------------- | ----------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------- |
| 1   | Worker           | `Worker.name` [DB]                                                | text                                            | Primary cell; initials avatar from name             |
| 2   | Phone            | `Worker.phone` [DB]                                               | E.164, shown as +91 XXXXX XXXXX                 | tap-to-copy                                         |
| 3   | Status           | `Worker.state` [DB]                                               | 15-state machine chip (brief §5)                | filterable                                          |
| 4   | Primary site     | first `Assignment` where `state='ACTIVE'` → `Site.name` [DERIVED] | text                                            | "+2 more" overflow when multiple ACTIVE assignments |
| 5   | Shift            | same assignment → `shiftStart`–`shiftEnd` [DB]                    | "HH:mm–HH:mm"                                   | hide on narrow screens                              |
| 6   | Days             | same assignment → `dayMask` [DB]                                  | 7-char Mon–Sun mask, e.g. `MTWTFS_` → "Mon–Sat" | render as day dots                                  |
| 7   | Language         | `Worker.preferredLanguage` [DB]                                   | `hi`/`te`/`en`/…                                | chip; default hi                                    |
| 8   | Joined           | `Worker.joinedAt` [DB]                                            | date, en-IN                                     | sortable                                            |
| 9   | Last visit       | max `Visit.completedAt` for worker [DERIVED, NEW in list payload] | relative ("2 days ago")                         | list endpoint must add this aggregate               |
| 10  | App access       | `Worker.userId` non-null [DERIVED]                                | "Has app" / "No phone yet" dot                  | many workers exist before phone access              |

### Toolbar

- **Search:** matches `Worker.name` (contains, case-insensitive) and `Worker.phone` (suffix match).
- **Filters:** Status (`Worker.state` multi-select) · Site (`Assignment.siteId` of my sites) · App access (has `userId` / not) · Language.
- **Sort:** name (default A–Z) · joinedAt · last visit. One sort at a time.
- **Primary action:** Add worker.
- **Counts line:** "214 workers · 3 suspended · 5 on leave" [DERIVED from state counts].

### Row behavior

Click → detail. No row-level destructive actions in the list (all lifecycle actions live on the detail page, behind confirmations). Pagination 50/page.

---

## 2. Worker DETAIL `/hr/workers/:id`

### 2.1 Header

`Worker.name` [DB] · `Worker.phone` [DB] · status chip `Worker.state` [DB] · `preferredLanguage` chip [DB] · "Joined `joinedAt`" [DB] · App-access dot (`userId`) [DERIVED] · Actions menu (§2.8).

### 2.2 Profile tab (editable)

| Field              | Source                          | Editable           | Validation                                                                                                                 |
| ------------------ | ------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Name               | `Worker.name` [DB]              | yes                | non-empty; edits land in audit                                                                                             |
| Phone              | `Worker.phone` [DB]             | yes (careful flow) | E.164; unique per company (`@@unique(companyId, phone)`) — duplicate ⇒ inline error "this phone already belongs to <name>" |
| Preferred language | `Worker.preferredLanguage` [DB] | yes                | one of supported ISO codes; drives WhatsApp/notification language                                                          |
| App account        | `Worker.userId` [DB]            | read-only          | shows linked phone-login status; "invite again" action if null                                                             |

There are NO other profile fields in the system today (no address, no ID-document storage, no photo). If the founder wants documents/photos, that is a schema+R2 feature request — do not design fake fields.

### 2.3 Sites & shifts tab — rows = `Assignment` records

| Column            | Source                                                                              |
| ----------------- | ----------------------------------------------------------------------------------- |
| Site              | `Assignment.siteId` → `Site.name` [DB]                                              |
| Shift             | `shiftStart`–`shiftEnd` [DB] ("HH:mm")                                              |
| Days              | `dayMask` [DB] (7-char Mon–Sun)                                                     |
| From              | `validFrom` [DB] (date)                                                             |
| Until             | `validUntil` [DB] (date or "open-ended" when null)                                  |
| State             | `Assignment.state` [DB]: `DRAFT` / `ACTIVE` / `TERMINATED`                          |
| Ended by / reason | `terminatedBy` → membership name, `terminatedReason` [DB] — only on TERMINATED rows |

Actions: **Add assignment** (site picker from my sites + shift HH:mm pair + day mask + validFrom + optional validUntil) · **End assignment** (sets TERMINATED; reason required). Editing an active assignment = end + create new (history preserved — never overwrite).

### 2.4 Attendance tab — rows = `Attendance` (one per worker per day, `@@unique(workerId, date)`)

| Field      | Source                                                                                                                                       | Values                                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Date       | `Attendance.date` [DB]                                                                                                                       | calendar day                                                                                                         |
| Status     | `Attendance.status` [DB]                                                                                                                     | `PRESENT` · `ABSENT_NO_CALL` · `ABSENT_APPROVED_LEAVE` · `HALF_DAY` · `ON_BREAK` — these 5 exactly; legend mandatory |
| Marked by  | `markedBySupervisorId` [DB] → resolve to name [DERIVED]; may show "(account removed)" — the ID is deliberately not a FK so the fact survives |                                                                                                                      |
| Reason     | `Attendance.reason` [DB]                                                                                                                     | optional supervisor note / voice transcription                                                                       |
| Pay impact | `payDeductPaise` [DB]                                                                                                                        | paise → "₹500" ; 0 hidden                                                                                            | computed by payroll job, may arrive later than the mark |

View: month calendar (5 mark types + legend) with a day-tap drawer showing the row above. Month picker; current month default. HR does NOT edit attendance here (marks come from supervisors/system; corrections flow through the Reversals queue) — read-only by design.

### 2.5 Visits tab — rows = `Visit`

| Column     | Source                                                                                              |
| ---------- | --------------------------------------------------------------------------------------------------- |
| Date/time  | `scheduledFor` [DB]; `startedAt`/`completedAt` [DB] in the drawer                                   |
| Site       | `siteId` → `Site.name` [DB]                                                                         |
| State      | `Visit.state` [DB] — 13-state chip (brief §5)                                                       |
| Photos     | `photosBefore` / `photosAfter` [DB] ("3 + 4")                                                       |
| AI check   | `flagged` [DB] + `verificationText` [DB] (the AI's plain-words reason, shown in drawer)             |
| Correction | `correctsVisitId`/`originalVisitId`/`correctionReason` [DB] — "corrects visit #…" link when present |

Filter: state, site, date range. Default: last 30 days, newest first.

### 2.6 Leave tab — rows = `LeaveRequest`

| Column            | Source                                              |
| ----------------- | --------------------------------------------------- |
| Dates             | `fromDate`–`toDate` [DB] + day count [DERIVED]      |
| Reason            | `LeaveRequest.reason` [DB] (worker's words)         |
| State             | `state` [DB]: `REQUESTED` / `APPROVED` / `REJECTED` |
| Decided by / when | `decidedBy` → name [DERIVED], `decidedAt` [DB]      |
| Decision note     | `decisionNote` [DB]                                 |

`REQUESTED` rows deep-link into the Leave queue review sheet (one approval surface, not two).

### 2.7 Record tab

Audit trail filtered to this worker (same component as `/hr/record`): when (IST en-IN) · actor name · plain-words action. Read-only, no affordances to edit/delete — ever.

### 2.8 Actions menu (lifecycle — drives `Worker.state` through the machine only)

| Action            | Visible when state is                            | Transition                                 | Dialog requirements                                                                                                 |
| ----------------- | ------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Invite again      | `INVITED`/`PENDING_ACTIVATION`, or `userId` null | re-send invite                             | —                                                                                                                   |
| Suspend           | `ACTIVE`/`AT_RISK`                               | → `ON_SUSPENSION`                          | reason **required**; consequence: "stops appearing on rosters from tomorrow"                                        |
| Lift suspension   | `ON_SUSPENSION`                                  | → `ACTIVE`                                 | —                                                                                                                   |
| Start termination | `ACTIVE`/`ON_SUSPENSION`/`INACTIVE`              | → `TERMINATION_PENDING` → `TERMINATED`     | reason **required**; copy: "history is kept permanently"                                                            |
| Anonymise         | `TERMINATED`                                     | → `ANONYMIZATION_REQUESTED` → `ANONYMIZED` | strongest warning; copy: "name and phone are removed forever; work records stay for legal protection"; irreversible |
| Transfer site     | `ACTIVE`                                         | assignment end+create (§2.3)               | not a worker-state change                                                                                           |

No delete action exists anywhere — deletion is not a concept in this system (INVARIANT 11).

---

## 3. Add Worker `/hr/workers/new` — exact form

| Field                 | Maps to                    | Required         | Validation                                                              |
| --------------------- | -------------------------- | ---------------- | ----------------------------------------------------------------------- |
| Full name             | `Worker.name`              | yes              | non-empty                                                               |
| Phone                 | `Worker.phone`             | yes              | +91 fixed prefix, 10 digits; company-unique with inline duplicate error |
| Preferred language    | `Worker.preferredLanguage` | yes (default hi) | hi / te / en (+ future codes)                                           |
| First site (optional) | creates `Assignment`       | no               | site (my sites) + shift HH:mm + day mask + validFrom (default today)    |

On create: worker starts in machine state `INVITED` [DB default]; success banner: "Worker invited — they log in with a WhatsApp code." There is no email, no password, no photo upload at create.

---

## 4. Endpoint work this implies (for the build phase, flagged honestly)

Existing `admin-workers` list returns the membership-anchored set; to serve the table above it needs to **add aggregates**: primary ACTIVE assignment (site/shift/dayMask), last-visit timestamp, and state counts for the toolbar line — or a new `GET /hr/workers` view endpoint does it in one query. Detail tabs map to existing `workers`, `worker-history`, `worker-lifecycle`, `leave-requests`, `visits` surfaces. All [NEW] work follows the locked route rules (auth + role + tenant wrapper + zod + real-DB tests).
