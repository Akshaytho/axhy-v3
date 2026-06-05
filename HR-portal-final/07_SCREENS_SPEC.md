# 07 — Screens Spec (screen-by-screen)

> Source of truth: `99_CANON_FACTS.md`, `05_FEATURE_INVENTORY.md`, `06_INFORMATION_ARCHITECTURE.md`. Every screen follows the SCAN/ACT/INSPECT layering (`03 §3`) and names every state from the checklist (`03 §4`). States omitted only with a stated reason.

**Per-screen template:** _Purpose · Layer · Route · Data in · Layout (SCAN/ACT/INSPECT) · Primary action · States · Edges & constraints · Maps to._

Visual language throughout: paper/ink surfaces from `@axhy/ui-tokens`, badges over paragraphs, mono for numbers/dates, no state-machine jargon (a worker is "On leave," not `ON_LEAVE`), one primary action per ACT screen. These are wireframe-level specs; pixel polish is a frontend-design pass on top.

---

## S1 · Pod home (landing) — SCAN

- **Route:** `/hr` · **Maps to:** C1
- **Purpose:** the 3-second answer to "what's mine and what's on fire."
- **Data in:** pods where I'm primary or backup; per pod → worker count, supervisor count, open-queue count, SLA-breach count.
- **Layout:**
  - **SCAN:** a card per pod. Card header = pod name + role chip (Primary / Backup). Body = three counts (Workers · Supervisors · Open) + a red breach pill if any SLA breaches. A company-wide strip on top: "Today: N pending leave · N terminations waiting · N SLA breaches."
  - **ACT:** each card → opens the Queue filtered to that pod. The breach pill → Queue filtered to breaches.
  - **INSPECT:** "Composition" link per card → pod member list (workers + supervisors).
- **Primary action:** open the pod with the worst breach (visually emphasized).
- **States:** _loading_ skeleton cards · _empty_ "You don't own a pod yet — ask the owner to assign you" (a real case during the 30-day migration) · _error_ retry · _populated_ the cards · _company-suspended_ read-only banner.
- **Edges & constraints:** counts are projected, may lag a few seconds — never render a stale action as live; pod scope strictly = my pods (INV 1, pod-scope).

---

## S2 · Queue — SCAN (the front door)

- **Route:** `/hr/queue` (`?pod=`, `?tier=`, `?tab=`) · **Maps to:** C2, C3, C4
- **Purpose:** the single partitioned, prioritized list of everything HR must act on.
- **Data in:** projected queue items (from LeaveRequest + SupervisorDecision[EMPLOYMENT] + bootstrap-seed + coverage-needed + DOC_PENDING), each with: kind, source, `slaTier`, age, "X left," `lockedBy`, audience, pod.
- **Layout:**
  - **SCAN:** rows grouped by SLA tier (URGENT → NEXT_DAY → STANDARD → DIGEST). Each row = a one-line summary + tier badge (red/amber/grey) + "Xh left" (mono) + a small lock glyph if locked-by-someone. Tabs across the top: **My pod · Backing up · All pods**.
  - **ACT:** row → opens the kind's ACT screen (`06 §3` routing), acquiring the lock.
  - **INSPECT:** row expander → escalation history + who's locked it + the underlying source row.
- **Primary action:** open the top URGENT item.
- **States:** _loading_ · _empty_ "Nothing pending in your pods — nice" · _error_ · _populated_ · _locked_ rows show the glyph; opening a locked row shows the lock screen (S2a) instead of the ACT screen · _company-suspended_ (reads fine; the ACT screens will block writes).
- **Edges & constraints:** ordering is **tier-first, then age** — never pure chronological (that's the Month-6 failure). Cross-pod tab use writes `HR_CROSS_POD_OVERRIDE_USED` on action, with a required reason. SLA durations come from Policy (F-P-2).

### S2a · Lock state (modal/inline on any ACT open)

- **Purpose:** prevent the Month-2 silent double-action.
- **Layout:** "Anita opened this at 2:14pm — auto-releases 2:29pm." Buttons: **Wait** (return to queue) · **Request unlock** (pings the holder). Force-unlock is **not** shown (Phase D, HR-lead only).
- **States:** _held-by-other_ (this screen) · _held-by-me_ (proceed, show my countdown) · _expired_ (re-acquire silently).

---

## S3 · People — Members & Workers list — SCAN

- **Route:** `/hr/people` (tabs: Members | Workers) · **Maps to:** A3
- **Purpose:** find a person and see their state fast.
- **Data in:** pod-scoped, cursor-paginated. Members → name, phone, role, status, pod. Workers → name, phone, **state badge**, pod, anonymized flag.
- **Layout:**
  - **SCAN:** a dense table; worker state as a colored badge (Active / On leave / Doc pending / Suspended / Terminated). Search-by-name within the page; filter chips by state and pod.
  - **ACT:** "+ Invite member" / "+ Invite worker" (top-right); row → detail.
  - **INSPECT:** row → S3a/S6.
- **Primary action:** invite (the high-frequency reason HR opens this).
- **States:** _loading_ skeleton rows · _empty_ "No people in your pods yet" · _error_ · _populated_ · _end-of-list_ (cursor exhausted).
- **Edges & constraints:** HR sees only their pods; owner sees all. `workerId` exposed is **`Worker.id`** (§12.1). No bulk export (INV 13).

---

## S4 · Invite member — ACT

- **Route:** `/hr/people/members/new` · **Maps to:** A1
- **Purpose:** create a SUPERVISOR (or, for owner, HR) membership.
- **Data in:** form — phone (E.164), name, role (`SUPERVISOR`; `HR` only if caller is OWNER), `baseSalaryPaise`, `bankIfsc?`, `bankAcct?`, `podId?`.
- **Layout:**
  - **ACT:** a single column form, one primary "Create member" button. Role is a constrained select (the gate is enforced server-side too). Salary in ₹, stored as paise. An **owner-notify hint** under the button.
  - **INSPECT:** a collapsible "What happens" note: creates the login + the role; salary lives on the membership.
- **Primary action:** Create member.
- **States:** _idle_ · _submitting_ · _success_ (toast + return to list with the new row) · _error: FORBIDDEN_TARGET_ROLE_ "You can create supervisors and workers" · _error: MEMBERSHIP_ALREADY_EXISTS_ 409 inline · _company-suspended_ form disabled with banner.
- **Edges & constraints:** two-stage gate (§1); salary → Membership (ADR-0025); audit `MEMBERSHIP_CREATED`; owner notified (GAP 7).

---

## S5 · Invite worker — ACT

- **Route:** `/hr/people/workers/new` · **Maps to:** A2
- **Purpose:** create a worker who can later activate by OTP.
- **Data in:** phone, name, `baseSalaryPaise`, `bankIfsc?`, `bankAcct?`, `preferredLanguage` (default `hi`), `podId?`.
- **Layout:** ACT form; one "Create worker" button; a note that the worker activates with OTP on first login.
- **Primary action:** Create worker.
- **States:** _idle/submitting/success/error_ (BAD_INPUT inline; ALREADY_EXISTS 409) · _company-suspended_ disabled.
- **Edges & constraints:** creates `Worker(PENDING_ACTIVATION)` + `User` + `Membership(WORKER)` atomically; audit `WORKER_CREATED`; language default is F-P-7.

---

## S6 · Worker detail (+ anonymize) — INSPECT + ACT

- **Route:** `/hr/people/workers/[workerId]` (`workerId = Worker.id`) · **Maps to:** A3, D3
- **Purpose:** see a worker's record; offboard when needed.
- **Data in:** worker fields (name, phone, state, pod, language, joinedAt, anonymizedAt?), recent attendance + leave + complaints (read-only context), **document/KYC checklist** (Aadhaar/PAN/bank/police-verification/ESI-UAN: collected / pending / expiry), **bank status** (entered? last transfer bounced?).
- **Layout:**
  - **INSPECT:** the record + history timeline + the document/bank panel.
  - **ACT (document):** a **"Resolve document"** action per checklist item (mark collected / record expiry) — this is how a `DOC_PENDING` / `KYC_FLAG` / `BANK_BOUNCE` queue item is cleared (the queue routes here, §06.3). Clearing all required docs can transition the worker out of `DOC_PENDING`.
  - **ACT (offboard):** an **Anonymize** button (only if not already terminated/anonymized), opening a confirm dialog requiring a **reason**. (Bank details are **view-only here — never editable**; bank _changes_ are an owner+OTP surface, §04.6.)
- **Primary action:** resolve the flagged document (the common queue-driven reason to be here); anonymize is a guarded secondary.
- **States:** _loading/error_ · _active worker_ (resolve-doc + anonymize available) · _doc-pending_ (checklist shows what's missing) · _already terminated/anonymized_ (anonymize hidden, shows `anonymizedAt`) · _out-of-pod_ → **cloaked 404** (no existence leak) · _forbidden_ (non-HR/owner role → `/forbidden`) · _confirm-dialog_ (reason required) · _submitting/success_ (state flips) · _conflict 409_ (already terminated, on a stale anonymize) · _suspended_ (writes blocked).
- **Edges & constraints:** anonymize = `Worker.state→TERMINATED`, `userId→null`, phone hashed, membership INACTIVE, audit `WORKER_ANONYMIZED`, **owner-notify** (membership deactivated, GAP 7); 404/409 guards; anonymize-not-delete (INV 11). **No self-resign path anywhere** (§2). Bank is create-only (entered at invite), never edited here (H14).

---

## S7 · Sites list / S8 · Create site / S9 · Site detail — SCAN/ACT/INSPECT

- **Routes:** `/hr/sites`, `/hr/sites/new`, `/hr/sites/[siteId]` · **Maps to:** B1, B2
- **S7 Sites list (SCAN):** table — name, state, address; "+ New site." States: loading/empty/error/populated.
- **S8 Create site (ACT):** form — name, address?, lat?, lng?, workdays mask; "Create site." Creates `Site(DRAFT)`; audit `SITE_CREATED`. States: idle/submitting/success/error/suspended.
- **S9 Site detail (INSPECT + ACT):** site fields + **bindings table** (supervisor, acting-for?, effectiveFrom/Until, reason) + a **handoff view** (read the frozen package for a binding). Actions: "+ Add binding," "Reassign this site." States: loading/error/populated/empty-bindings.
- **Edges & constraints:** binding creation here routes to S10; same-day freeze applies to any binding change.

---

## S10 · Create binding (acting / permanent) — ACT

- **Route:** `/hr/sites/[siteId]/bindings/new` · **Maps to:** B2
- **Purpose:** make a supervisor responsible for a site.
- **Data in:** supervisor (User picker, must have active SUPERVISOR membership), kind toggle **Permanent / Acting**, `effectiveFrom` (default next tenant-midnight), `effectiveUntil` (**required if Acting**), `actingForUserId` (required if Acting — who's being covered), reason.
- **Layout:** ACT form; the Permanent/Acting toggle changes which fields are required; a prominent **same-day-freeze notice**.
- **Primary action:** Create binding.
- **States:** _idle/submitting/success_ · _error: SUPERVISOR_NOT_FOUND_ (404) · _error: acting-without-until_ (inline) · _error: overlap_ (the no-overlap invariant refused it — explain, don't silently overwrite) · _error: same-day_ (offer "effective tomorrow") · _suspended_ disabled.
- **Edges & constraints:** generates a handoff package; audit `BINDING_CREATED` + `HANDOFF_PACKAGE_GENERATED`; freeze (§7).

---

## S11 · Acting-cover wizard (create / cancel / re-pick) — ACT

- **Route:** `/hr/coverage/acting/new` (often reached from the Queue or a supervisor's portfolio) · **Maps to:** B3
- **Purpose:** arrange and _correct_ temporary coverage without silent disappearances.
- **Data in:** supervisor needing cover, date range, candidate supervisors **with capacity context** (their current site count + recent decision volume).
- **Layout (3 steps):**
  1. **Who & when** — pick the away supervisor + the cover window.
  2. **Pick cover** — candidate list, each row showing capacity context so HR doesn't overload someone (the Month-8 lesson). HR picks; the AI does not pre-pick.
  3. **Confirm** — review the N sites that will move; confirm.
  - **Cancel / re-pick path:** from an existing acting cover → "Cancel & re-pick" → **prompts for an affected-supervisor notification text** before applying.
- **Primary action:** Confirm coverage (step 3) / Send re-pick notice (cancel path).
- **States:** _idle/submitting/success_ · _no-candidates_ (empty: "No available supervisors — widen the window or reassign permanently") · _error/overlap/same-day_ · _suspended_ · _locked_ (if the supervisor's bindings are mid-edit by another HR user).
- **Edges & constraints:** cancel-and-repick **must** notify the dropped supervisor (closes the Month-8 gap); freeze applies; audit on every binding end/create.

---

## S12 · Permanent reassign (single site) — ACT

- **Route:** `/hr/coverage/reassign` (or from S9) · **Maps to:** B4
- **Purpose:** move one site's ownership permanently.
- **Data in:** site → current responsible (auto-filled) → new responsible → reason.
- **Layout:** ACT form; same-day-freeze notice; a note that the incoming supervisor inherits the site's handoff context.
- **Primary action:** Reassign site.
- **States:** idle/submitting/success/error(overlap/same-day)/suspended.
- **Edges & constraints:** supersedes the old permanent binding (`BINDING_ENDED_SUPERSEDED_BY_PERMANENT`); handoff prepended to incoming LivingDoc; freeze.

---

## S13 · Supervisor portfolio + Switch-all-sites — SCAN + ACT

- **Route:** `/hr/people/supervisors/[userId]/portfolio` · **Maps to:** B5
- **Purpose:** see everything a supervisor owns; move it all at once when they leave.
- **Data in:** the supervisor's current bindings (sites), recent activity.
- **Layout:**
  - **SCAN:** the list of N sites they're responsible for.
  - **ACT:** "Reassign all N sites" → a review screen mapping each site to a new responsible (defaulting all to one person, editable per row) → confirm in **one atomic transaction**; optional "and mark this membership inactive" (they're leaving).
- **Primary action:** Reassign all (atomic).
- **States:** idle/submitting/success · _partial-failure must not exist_ (atomic — all or nothing; on failure, nothing moved + clear error) · suspended · same-day notice.
- **Edges & constraints:** atomicity is the whole point (the Month-11 lesson); N handoff packages; freeze.

---

## S14 · Leave inbox / S15 · Leave detail — SCAN / ACT

- **Routes:** `/hr/leave`, `/hr/leave/[id]` · **Maps to:** D1
- **S14 inbox (SCAN):** pod-scoped `REQUESTED` leaves; rows = worker, dates, reason snippet, SLA badge, age. States: loading/empty("No pending leave")/error/populated.
- **S15 detail (ACT):** the request + the worker's recent attendance/leave (context) + **Approve** / **Reject (reason required)**. Acquires a lock on open.
- **Primary action:** Approve (or Reject).
- **States:** idle/submitting/success · _already-decided_ (someone else won the race — show the decision, don't double-apply) · _locked-by-other_ (S2a) · error · suspended.
- **Edges & constraints:** HR pod-ownership gate (don't regress the historically-missing gate); race-safe `updateMany`; on approve → `LEAVE_APPROVED` audit + replacement invites; outbox notifies the worker.

---

## S16 · Termination ack (decision-support) — ACT + INSPECT

- **Route:** `/hr/terminations/[decisionId]` · **Maps to:** D2
- **Purpose:** let HR ack a termination on evidence, not intuition — the highest-stakes screen in the portal.
- **Data in:** the `SupervisorDecision(EMPLOYMENT)` + its immutable `originContext` (the supervisor's chat excerpt, last-30-day decisions, attendance + complaint history, originator identity) + `proposedDuringAbsence` flag + the worker's record.
- **Layout:**
  - **INSPECT (dominant):** the decision-support panel — origin context, worker history at a glance, the supervisor's exact typed phrase. If `proposedDuringAbsence`, a banner: "Proposed by [originator] while on acting-cover."
  - **ACT:** a free-text **"HR ack notes"** field (audited) + the **typed-phrase ack** input (HR must type the confirmation phrase) → **Confirm termination**. A clear secondary: **Cancel / send back** with reason.
- **Primary action:** Confirm termination (typed-phrase gated).
- **States:** _loading/error_ · _ready_ · _typed-phrase-mismatch_ (button disabled until exact) · _submitting/success_ (worker → Termination pending → Terminated; 7-day appeal opens) · _locked-by-other_ · _already-acked_ (stale) · _forbidden_ (non-HR → `/forbidden`) · _cloaked-404_ (decision in another pod — no existence leak) · _suspended_.
- **Edges & constraints:** **the HR-ack lock + worker-machine driver are a BUILD item, not yet wired (§12.5)** — flag prominently to the implementer. Written reason required (DPDP); 3-audience push on apply; appeal window F-P-3. Origin attribution is immutable (§2). **On apply, generate the F&F worksheet** (`05` G5 — days worked this cycle, advance to recover, leave balance) that flows into the next payroll-close, so the money owed/owing isn't left off-system.

---

## S17 · HR Updates composer + sent list — ACT + SCAN

- **Route:** `/hr/updates` · **Maps to:** E2
- **Purpose:** post company-wide notices supervisors must actually read.
- **Data in:** compose — kind, content, single-or-digest, `acknowledgmentRequired`, `acknowledgmentPhrase?`; sent list — past updates + ack counts.
- **Layout:**
  - **ACT:** composer; if digest, add rules (≤10 soft cap, single-tier only); a note that audience = all supervisors in the company (F-P-6 for site-level later).
  - **SCAN:** sent updates with "N of M supervisors acknowledged."
- **Primary action:** Post update.
- **States:** idle/submitting/success · _error: MIXED_TIER_NOT_ALLOWED_ · _soft-cap warning_ (10 rules — warn, don't block) · suspended.
- **Edges & constraints:** append-only `HRUpdate`/`HRUpdateRule`; ack is ≥5 words own-voice (an attention gate); no reminders at launch; **`POST /hr-updates` is a GAP to build**.

---

## S18 · HR rules editor (Layer-2 policy) — ACT

- **Route:** `/hr/rules` · **Maps to:** E1
- **Purpose:** set/adjust `ai.rules.hr.*` rules the AI must respect.
- **Data in:** current HR-layer rules (latest Policy rows by key), each ≤300 chars.
- **Layout:** ACT list-with-add; each rule shows its key + text + who set it + when; add/replace appends a new row (never edits in place).
- **Primary action:** Add / replace a rule.
- **States:** idle/submitting/success · _error: POLICY_KEY_FORBIDDEN_FOR_ROLE_ (tried a company/`ai.limits` key) · _over-limit_ (>300 chars / >50 rules) · suspended.
- **Edges & constraints:** Layer-2 only (§4); append-only with `previousValueSnapshot`; owner-notified (GAP 7); AI explains conflicts with Layer-1.

---

## S19 · Bootstrap review (one-time) — ACT

- **Route:** `/hr/bootstrap-review` · **Maps to:** F1
- **Purpose:** confirm the Day-1 seeded supervisor bindings.
- **Data in:** seeded bindings — site, inferred supervisor, alternative supervisors with their assignment history; status (pending/confirmed/corrected/disputed); days-since-migration.
- **Layout:** a table; per row → **Confirm / Reassign / Flag for owner**; **bulk-confirm** the unambiguous rows; status filter; an aging indicator.
- **Primary action:** Bulk-confirm unambiguous rows; hand-resolve the rest.
- **States:** _loading/error_ · _populated_ · _all-confirmed_ (the screen's job is done; show a quiet "complete") · _empty_ (not a fresh tenant) · _suspended_.
- **Edges & constraints:** one-time per tenant; `bypassFreezeReason` (Day-1 isn't bound by same-day freeze); audit `BOOTSTRAP_SEED_CONFIRMED/REASSIGNED`; aged rows escalate in the queue.

---

## S20 · Audit-chain (always-on) — INSPECT

- **Route:** `/hr/audit-chain` · **Maps to:** F2
- **Purpose:** answer "who was responsible for X when Y happened" and make corrections readable.
- **Data in:** `AuditEvent` + binding history, searchable by site / supervisor / date / event kind.
- **Layout:** a search bar + a **timeline**; each node = an event; drill-down → the decision made under that binding state. Read-only.
- **Primary action:** none (pure INSPECT) — search is the interaction.
- **States:** _idle_ (search prompt) · _loading/error_ · _results_ (timeline) · _no-results_.
- **Edges & constraints:** read-only; immutable source (INV 9); **must not become a bulk-export** (INV 13) — it answers questions, it doesn't dump the database.

---

## S21 · Payroll-close (prep) — ACT

- **Route:** `/hr/payroll-close` · **Maps to:** G1
- **Purpose:** prepare (not disburse) the monthly payroll — the answer to Kavitha's fear.
- **Data in:** per-worker **attendance+base** summary computed from attendance (`Visit`/`Attendance`) + `LeaveRequest` + overtime + `Membership.baseSalaryPaise` for the selected period and pod scope, **pro-rated for mid-month joiners/leavers** (from `joinedAt` / termination date — a v1 must-have for Indian monthly payroll).
- **Layout:**
  - **SCAN:** the per-worker summary table (worker, days present, leave, base, pro-rata factor, outstanding-advance [read-only in v1], computed gross). Statutory (PF/ESI/PT/TDS) columns are shown as **"computed in Tally (v1)"** placeholders so the gap is visible, not silent.
  - **ACT:** edit overtime/advances per row; **Approve the prepared file** (export/sign-off) — **no money moves**.
  - **INSPECT:** drill into a worker's days for the period.
- **Primary action:** Approve the prepared file.
- **States:** _loading_ (computing) · _ready_ · _editing_ · _disputed_ (a supervisor sent an attendance correction during the run — flag the worker) · _reopened-for-correction_ (audited reason; un-locks the affected row) · _approved_ (locks the period summary) · _error_ · _empty_ (no workers in scope) · _suspended_.
- **Edges & constraints:** **prep only — the payment engine is a STUB (Phase D); v1 is attendance+base only.** Statutory deductions, an advances/loan _ledger_ (v1 shows the balance read-only), F&F, and bonus runs are deferred (`05` G3–G5, `13` D9) — v1 **reduces but does not replace** Tally. `Visit` has **no earnings field**; use `Membership.baseSalaryPaise` + attendance (the `SiteVisit.earningsPaise` warning is v1/v2 cruft, not in v3). Approve must allow **reopen-for-correction** before disbursement (the real Monday: corrections arrive _during_ the run). Manual payment stays outside the system (§1).

---

## S22 · Settings — ACT (light)

- **Route:** `/hr/settings` · **Purpose:** language, notification prefs, sign-out.
- **States:** populated/submitting/success. No tenant switch (single membership). Sign-out uses a timeout so a dead network can't hang it (worker-side lesson reused).

---

## S23 · Complaint detail (reply / resolve) — ACT + INSPECT

- **Route:** `/hr/complaints/[id]` · **Maps to:** C5
- **Purpose:** read a worker/site complaint that escalated to HR, reply, and resolve it.
- **Data in:** the `Complaint` (severity, kind, state) + threaded `ComplaintMessage` history; `unreadHrRepliesCount` drives the badge.
- **Layout:** **INSPECT** the thread; **ACT** a reply box + **Resolve / Dismiss** (reason). Acquires a lock on open (multi-HR safe).
- **Primary action:** Reply, or Resolve.
- **States:** _loading/error_ · _open (IN_HR)_ · _resolved/dismissed_ (read-only) · _locked-by-other_ · _forbidden_ · _cloaked-404_ (other pod) · _suspended_.
- **Edges & constraints:** state `OPEN → IN_HR → RESOLVED|DISMISSED`; audit `COMPLAINT_MESSAGE_APPENDED` / `COMPLAINT_RESOLVED`; the reply/resolve write path is a GAP to build over the existing `Complaint` table.

---

## S25 · Notifications panel (bell) — SCAN

- **Route:** `/hr/notifications` (from the top-bar bell) · **Maps to:** the notification machinery (`05` cross-cutting)
- **Purpose:** the notifications addressed to _this_ HR user — owner-notify echoes, HR-absent fallback pings, lock-release requests, queue-escalation alerts.
- **Data in:** this user's `Notification` rows (kind, priority, payload, delivered/ack timestamps), localized.
- **Layout:** **SCAN** list grouped by priority; tap → the relevant screen; mark-read.
- **Primary action:** open the top item / mark read.
- **States:** _loading_ · _empty_ ("Nothing new") · _error_ · _populated_ · _suspended_(reads fine).
- **Edges & constraints:** the HR-facing `GET /notifications` + ack route is a GAP (`10 §B`); the `hr_team_daily` digest is reachable from here or email (`12` decision). Read-only consumption — never a bulk export.

---

## States coverage matrix (acceptance gate)

Every screen must green every applicable column before it's "done." `—` = not applicable (with reason).

One row per screen ID (the gate has no holes). `forbidden` = wrong role → `/forbidden`; the out-of-pod existence cloak is shown as `404` in the forbidden cell where it applies. `stale` = the row changed under you; `(409)` = write-conflict. `—` = not applicable. `(r)` = reads still allowed while suspended; only writes block.

| Screen                 | loading |      empty       | error |    success    | forbidden |             locked              | suspended |               stale               |
| ---------------------- | :-----: | :--------------: | :---: | :-----------: | :-------: | :-----------------------------: | :-------: | :-------------------------------: |
| S1 Pod home            |    ✓    |        ✓         |   ✓   |       ✓       |     ✓     |                —                |   ✓(r)    | ✓(counts lag; re-validate on act) |
| S2 Queue               |    ✓    |        ✓         |   ✓   |       ✓       |     ✓     |                ✓                |   ✓(r)    |                 ✓                 |
| S2a Lock state         |    —    |        —         |   —   | ✓(held-by-me) |     —     |                ✓                |     —     |            ✓(expired)             |
| S3 People              |    ✓    |        ✓         |   ✓   |       ✓       |     ✓     |                —                |   ✓(r)    |       ✓(re-validate on act)       |
| S4 Invite member       | ✓(idle) |        —         |   ✓   |       ✓       |     ✓     |                —                |     ✓     |                 —                 |
| S5 Invite worker       | ✓(idle) |        —         |   ✓   |       ✓       |     ✓     |                —                |     ✓     |           ✓(409 exists)           |
| S6 Worker detail       |    ✓    |        —         |   ✓   |       ✓       |   ✓/404   | —(direct nav, not queue-locked) |     ✓     |              ✓(409)               |
| S7 Sites list          |    ✓    |        ✓         |   ✓   |       ✓       |     ✓     |                —                |   ✓(r)    |                 —                 |
| S8 Create site         | ✓(idle) |        —         |   ✓   |       ✓       |     ✓     |                —                |     ✓     |                 —                 |
| S9 Site detail         |    ✓    |  ✓(no bindings)  |   ✓   |       ✓       |   ✓/404   |                —                |   ✓(r)    |                 —                 |
| S10 Create binding     | ✓(idle) |        —         |   ✓   |       ✓       |     ✓     |                —                |     ✓     |            ✓(overlap)             |
| S11 Acting-cover       |    ✓    | ✓(no candidates) |   ✓   |       ✓       |     ✓     |                ✓                |     ✓     |                 ✓                 |
| S12 Permanent reassign | ✓(idle) |        —         |   ✓   |       ✓       |     ✓     |                —                |     ✓     |        ✓(overlap/same-day)        |
| S13 Switch-all         |    ✓    |        —         |   ✓   |       ✓       |     ✓     |                ✓                |     ✓     |        ✓(atomic rollback)         |
| S14 Leave inbox        |    ✓    |        ✓         |   ✓   |       ✓       |     ✓     |                —                |   ✓(r)    |                 —                 |
| S15 Leave detail       |    ✓    |        —         |   ✓   |       ✓       |     ✓     |                ✓                |     ✓     |            ✓(decided)             |
| S16 Termination ack    |    ✓    |        —         |   ✓   |       ✓       |   ✓/404   |                ✓                |     ✓     |             ✓(acked)              |
| S17 HR Updates         | ✓(idle) |     ✓(sent)      |   ✓   |       ✓       |     ✓     |                —                |     ✓     |                 —                 |
| S18 HR rules           |    ✓    |        ✓         |   ✓   |       ✓       |     ✓     |                —                |     ✓     |                 —                 |
| S19 Bootstrap          |    ✓    |        ✓         |   ✓   |       ✓       |     ✓     |                —                |     ✓     |                 —                 |
| S20 Audit-chain        |    ✓    |        ✓         |   ✓   |       ✓       |     ✓     |                —                |     —     |                 —                 |
| S21 Payroll-close      |    ✓    |        ✓         |   ✓   |       ✓       |     ✓     |                —                |     ✓     |    ✓(disputed/reopen/approved)    |
| S22 Settings           | ✓(idle) |        —         |   ✓   |       ✓       |     ✓     |                —                |     ✓     |                 —                 |
| S23 Complaint detail   |    ✓    |        —         |   ✓   |       ✓       |   ✓/404   |                ✓                |     ✓     |            ✓(resolved)            |
| S25 Notifications      |    ✓    |        ✓         |   ✓   |       ✓       |     ✓     |                —                |   ✓(r)    |                 —                 |
