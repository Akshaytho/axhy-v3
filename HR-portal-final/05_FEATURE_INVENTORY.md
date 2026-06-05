# 05 — Feature Inventory

> Source of truth: `99_CANON_FACTS.md` §6 (the 11 surfaces), §3 (persona), §5 (queue/SLA). Each feature below carries the founder-required full case: **why · what · depth · profit · risk · real-life narrative**, plus the governing constraints and the screen it maps to.

The HR portal is **11 coordination surfaces** plus the **org/people/site CRUD** that HR-A1 already proved, plus the **cross-cutting machinery** (notifications, digests, handoff). They are grouped into seven feature areas. Each area lists its capabilities; each capability is traceable to a need in `02` and a constraint in `04`.

Legend for status: **KEPT** = backend exists, fresh UI needed · **GAP** = backend route to build · **STUB** = deliberately deferred (see `13_DO_NOT_BUILD.md`).

---

## Area A — Onboarding & org chart (people in)

### A1 · Invite a member (HR or — for owner — HR) · KEPT

- **Why:** HR hires supervisors and workers constantly; this is the highest-volume HR action.
- **What:** a form that creates a `Membership` (+ `User` upsert) with role, salary, and pod. HR may create `SUPERVISOR`; an owner here may create `HR`.
- **Depth:** two-stage gate (`requireRole` + `assertTargetRole`); salary → `Membership.baseSalaryPaise`; bank → `Membership.bankIfsc/bankAcct`; audit `MEMBERSHIP_CREATED`; owner-notified (GAP 7).
- **Profit:** removes the founder from every hire; makes the org chart self-serve.
- **Risk:** wrong target role (must 403, not silently downgrade); salary written to the wrong table (must be Membership, not Worker).
- **Narrative:** _Vikram hires three supervisors before lunch; each is live in the portal with salary set, no curl, no founder._
- **Constraints:** §1 hiring authority, §6 bank PII. **Screen:** Invite member.

### A2 · Invite a worker · KEPT

- **Why:** workers are onboarded daily; they exist in the system before they ever hold a phone.
- **What:** create `Worker` (state `PENDING_ACTIVATION`) + `User` + `Membership(WORKER)` in one transaction; capture name, phone, salary, bank?, preferred language (default `hi`).
- **Depth:** worker activates later via OTP (`PENDING_ACTIVATION → ACTIVE`), no code change needed; audit `WORKER_CREATED`.
- **Profit:** the worker app has someone to log into; HR owns the KYC entry (bank/Aadhaar collected offline).
- **Risk:** `Worker.id` vs `User.id` confusion downstream (see §12.1); language default (F-P-7).
- **Narrative:** _A new cleaner is hired Monday; HR creates her with bank details; she logs in Tuesday with OTP and her first visit is already assignable._
- **Constraints:** §1, §6. **Screen:** Invite worker.

### A3 · Member / worker directory · KEPT

- **Why:** HR needs to find a person fast and see their state.
- **What:** pod-scoped, cursor-paginated lists of memberships and workers; worker rows show state (badge), pod, anonymized flag.
- **Depth:** HR sees only their pods; owner sees the whole tenant; out-of-pod detail returns 404 (no existence leak).
- **Profit:** replaces "which Excel tab is this person in."
- **Risk:** pod-scope leak; surfacing the wrong id as `workerId`.
- **Narrative:** _Priya looks up a worker before filing a compliance note and sees `DOC_PENDING` at a glance._
- **Constraints:** §3 INV 1, §3 pod-scope. **Screen:** Members list, Workers list, Worker detail.

---

## Area B — Sites & supervisor coverage (who runs what)

### B1 · Create & view sites · KEPT

- **Why:** sites are the unit of work; HR sets them up.
- **What:** create `Site` (state `DRAFT`), list, detail with its bindings.
- **Depth:** `companyId`-scoped; workdays mask; audit `SITE_CREATED`.
- **Profit:** the operational map exists in the system.
- **Risk:** none high. **Narrative:** _A new contract site is added with its workdays before any worker is assigned._
- **Constraints:** §3 INV 1. **Screen:** Sites list, Site detail.

### B2 · Bind a supervisor to a site (acting or permanent) · KEPT

- **Why:** every site needs a responsible supervisor; coverage changes constantly.
- **What:** create a `SiteSupervisorBinding`. `actingForUserId = null` → permanent portfolio; `actingForUserId` set + `effectiveUntil` required → temporary acting cover.
- **Depth:** no-overlap invariant per `(site, kind)`; **same-day freeze** → effective next tenant-midnight; auto-generates a **handoff package** (frozen JSON) on every change; audit `BINDING_CREATED` + `HANDOFF_PACKAGE_GENERATED`.
- **Profit:** the supervisor app's Today/Decisions route correctly; coverage is recorded, not remembered.
- **Risk:** acting without `effectiveUntil`; same-day change attempted; overlap.
- **Narrative:** _Ravi is sick Thursday; HR makes Lakshmi acting cover until Monday; her Today fills with his sites tomorrow, with his handoff notes attached._
- **Constraints:** §7 freeze, §2 ownership. **Screen:** Create binding (acting/permanent).

### B3 · Acting-cover create / cancel / re-pick · GAP (closure §5.3.4)

- **Why:** coverage gets it wrong sometimes; HR must back out cleanly.
- **What:** pick the supervisor needing cover → date range → review candidates **with capacity context** (site count + recent decision volume) → confirm; **cancel-and-repick prompts for an affected-supervisor notification text**.
- **Depth:** end the old binding (`endedReason`), create the new one, send the typed apology/notice; same-day freeze applies.
- **Profit:** eliminates the Month-8 "8 bindings silently disappear" failure.
- **Risk:** silent disappearance (must notify); collision with another HR user (lock).
- **Narrative:** _HR makes Anjali cover 8 sites, sees she's overloaded, re-picks Lakshmi, and Anjali gets one clear "never mind, Lakshmi has it" notice instead of 8 ghost pushes._
- **Constraints:** §7 freeze + locks. **Screen:** Acting-cover wizard.

### B4 · Permanent reassignment (single site) · GAP (closure §5.3.5)

- **Why:** portfolios genuinely change hands.
- **What:** per-site form: site → current responsible (auto-filled) → new responsible → reason → confirm; effective next tenant-midnight.
- **Depth:** supersede the old permanent binding; handoff package prepended to the incoming supervisor's LivingDoc; audit chain preserved.
- **Profit:** clean ownership transfer with context.
- **Risk:** same-day attempt; lost handoff context.
- **Narrative:** _A site moves from Ravi to Joseph; Joseph inherits the site rules and recent complaints as his own context._
- **Constraints:** §7. **Screen:** Permanent reassign.

### B5 · "Switch all sites" bulk reassignment · GAP (closure §5.3.6)

- **Why:** when a supervisor quits, their whole portfolio must move at once.
- **What:** from a supervisor's portfolio page → "reassign all N sites" → review N bindings → confirm in **one atomic transaction**.
- **Depth:** atomicity (all-or-nothing); N handoff packages; Membership → INACTIVE if they're leaving — which **owner-notifies** (GAP 7, membership remove).
- **Profit:** turns the Month-11 hand-curl liquidation into one click.
- **Risk:** partial application (must be atomic); orphaned sites.
- **Narrative:** _Mahesh quits; HR reassigns his 8 sites to two supervisors in a single confirmed action and his membership goes inactive._
- **Constraints:** §7, §2. **Screen:** Switch-all-sites.

---

## Area C — The queue & coordination (how HR sees work)

### C1 · Pod home · GAP (closure §5.3.1)

- **Why:** HR needs a 3-second answer to "what's mine and what's on fire."
- **What:** a card per pod I own/back up: worker count, supervisor count, open-queue count, SLA breaches, composition link.
- **Depth:** reads pod membership + projected queue; SCAN layer of the whole portal.
- **Profit:** replaces "which Gmail thread is mine today."
- **Risk:** stale counts; wrong pod scope.
- **Narrative:** _Kavitha opens the portal and sees Pod 3 has 2 SLA breaches before she's had chai._
- **Constraints:** §3 pod-scope. **Screen:** Pod home (landing).

### C2 · Scoped queue · GAP (closure §5.3.2)

- **Why:** all HR work arrives here; it must be partitioned and prioritized.
- **What:** default to my pods; tabs _my pod / pods I back up / all pods (cross-pod)_; each item shows source, priority, age, locked-by, audience.
- **Depth:** projected from LeaveRequest + SupervisorDecision + bootstrap + binding events until a real `QueueItem` table lands; pessimistic lock on open.
- **Profit:** one place, partitioned, collision-safe.
- **Risk:** flat ordering burying urgent items (solved by C3); cross-pod overuse (audited).
- **Narrative:** _Deepak works the general pod queue top-down by SLA, not by whoever shouted loudest on WhatsApp._
- **Constraints:** §4 pods, §5 SLA, §7 locks. **Screen:** Queue.

### C3 · Priority / SLA / escalation signals · GAP (closure §5.3.3)

- **Why:** a chronological queue strands the urgent thing.
- **What:** per-item SLA tier badge (`URGENT 2h` / `NEXT_DAY 24h` / `STANDARD 7d` / `DIGEST`), "X hours remaining," escalation history.
- **Depth:** age-escalation cron (`hr-queue-age-escalation`); URGENT 90min → backup pinged, 2h → cross-pod unlocked.
- **Profit:** the 9pm medical leave floats to the top instead of dying at the bottom.
- **Risk:** wrong tier assignment; SLA durations (F-P-2).
- **Narrative:** _Friday's "urgent Saturday medical leave" shows red with "1h left" and gets handled, not buried under 47 routine rows._
- **Constraints:** §5. **Screen:** Queue (item badges) + item detail.

### C4 · Multi-HR conflict / lock UI · GAP (closure §5.3.11)

- **Why:** five HR users share a queue; two on one row corrupt state.
- **What:** every open row takes a 15-min lock; a second opener sees "locked by [user], auto-release [time]" with wait / request-unlock.
- **Depth:** pessimistic lock + audit (`HR_QUEUE_LOCK_ACQUIRED/RELEASED/EXPIRED`); force-unlock deferred (Phase D).
- **Profit:** ends the Month-2 silent double-approval.
- **Risk:** lock starvation; stuck locks (TTL solves).
- **Narrative:** _Anita opens Krishna's leave; Kavitha sees it's locked and moves on instead of racing her._
- **Constraints:** §7. **Screen:** Lock banner (on every ACT screen).

### C5 · Complaint triage & HR reply · KEPT (read) / GAP (reply UI)

- **Why:** worker/site complaints escalate to HR (`Complaint.state = IN_HR`); HR must read, reply, and resolve them — a real queue kind, not just context.
- **What:** complaint detail with the threaded messages (`ComplaintMessage`), an HR reply, and resolve/dismiss. `unreadHrRepliesCount` drives a badge.
- **Depth:** `Complaint` table exists (`state ∈ OPEN|IN_HR|RESOLVED|DISMISSED`); the HR reply/resolve write path + a thin UI are the gap; audit `COMPLAINT_RESOLVED`/`COMPLAINT_MESSAGE_APPENDED`.
- **Profit:** closes the `COMPLAINT_HR` queue lane so the front door fronts _all_ HR work, not just coverage.
- **Risk:** orphaned route (it's referenced in the IA/queue) if no screen exists — so it gets one here.
- **Narrative:** _A worker complains about unpaid wages; it routes to HR's pod queue; Priya reads the thread, replies, and resolves it._
- **Constraints:** §3 INV 9. **Screen:** Complaint detail (S23).

---

## Area D — Employment decisions (the hard calls)

### D1 · Leave decide (approve / reject) · KEPT

- **Why:** the daily bread of HR; workers' wages and cover depend on it.
- **What:** pod-scoped inbox → detail → approve/reject with note; race-safe `updateMany` + audit + outbox.
- **Depth:** on approve, per affected site-shift → `LEAVE_APPROVED` audit + create `ReplacementInvite`; HR pod-ownership gate (added in HR-A1).
- **Profit:** workers get answers same-day; supervisors get cover triggered.
- **Risk:** the historically-missing HR gate (now fixed — don't regress); double-decide race (lock + updateMany).
- **Narrative:** _Kavitha approves a worker's 3-day leave; the system immediately spins up replacement invites for the sites he'd have covered._
- **Constraints:** §3 pod-scope, §7 locks. **Screen:** Leave inbox, Leave detail.

### D2 · EMPLOYMENT-tier ack with decision-support · GAP (closure §5.3.9)

- **Why:** terminations are the highest-stakes, least-reversible HR act; today they arrive context-free and get parked for months.
- **What:** an ack screen showing the **`originContext` panel** (the supervisor's chat excerpt, last-30-day decisions, attendance + complaint history, originator identity) + **worker history at a glance** + **the supervisor's typed phrase** + a free-text **"HR ack notes"** field (audited) + the typed-phrase ack input.
- **Depth:** `proposedDuringAbsence` flag shown if the originator was on acting-cover; 3-audience push on apply (originator + current-responsible + worker subject); worker `ACTIVE → TERMINATION_PENDING → TERMINATED`; 7-day appeal.
- **Profit:** HR acks on evidence, not intuition; the Month-7 4-month deferral never happens.
- **Risk:** **the HR-ack lock + worker-machine driver are specified but not yet wired** — this is a _build_ item, not an existing guarantee (§12.5).
- **Narrative:** _A supervisor proposes terminating Mahesh; Kavitha sees his 30-day record, the supervisor's exact words, and types her confirmation the same afternoon._
- **Constraints:** §6 DPDP, §2 attribution. **Screen:** Termination ack (decision-support).

### D3 · Worker offboarding (anonymize) · KEPT

- **Why:** resignations/terminations must be processed without losing the legal record.
- **What:** from worker detail → confirm with reason → `Worker.state → TERMINATED`, `Worker.userId → null`, `User.phone → anon:<hash>`, `Membership.status → INACTIVE`, audit `WORKER_ANONYMIZED`; 404/409 guards.
- **Depth:** anonymize-not-delete (INV 11); structure retained forever. **Owner-notified** — anonymize deactivates a membership, which GAP 7 requires the owner be told about (add/remove). If an F&F worksheet exists (G5), trigger it here.
- **Profit:** DPDP-clean offboarding, one action.
- **Risk:** double-anonymize (409); cross-tenant (404).
- **Narrative:** _A worker resigns; HR anonymizes the record; the attendance history survives for audit but the PII is gone._
- **Constraints:** §6 DPDP, §3 INV 4/11. **Screen:** Worker detail → anonymize.

---

## Area E — Company rules & broadcast (HR's voice down)

### E1 · HR rules (Layer-2 policy) · GAP (write path partial)

- **Why:** HR sets company-wide-within-its-layer rules the AI must respect.
- **What:** append-only writes to `ai.rules.hr.*` (≤300 chars, ≤50/key) via the policy route; current value = latest row.
- **Depth:** Layer 2 overrides supervisor LivingDoc, is overridden by Layer-1 owner rules; owner-notified on write.
- **Profit:** HR shapes AI behavior for its domain without touching the owner's layer.
- **Risk:** writing a company/`ai.limits` key (must 403); editing in place (must append).
- **Narrative:** _HR sets a rule that leave during the first 30 days needs a note; the AI applies it, the owner is notified._
- **Constraints:** §4 rule hierarchy. **Screen:** HR rules editor.

### E2 · HR Updates (post → supervisor ack) · GAP (no HR-create route)

- **Why:** HR must push company-wide notices that supervisors actually read.
- **What:** post an update (single / digest); audience = all supervisors in the company (F-P-6 governs site-level later); supervisors ack with **≥5 words in their own voice** (an attention gate, not a checkbox).
- **Depth:** append-only `HRUpdate` + `HRUpdateRule`; single-tier digests only; soft cap 10 rules; no reminders at launch; audit `HR_UPDATE_ACKED`. Ack patches the supervisor's Layer-C scratch in the same transaction as the audit write.
- **Profit:** replaces the WhatsApp broadcast nobody confirms reading.
- **Risk:** mixed-tier digest (forbidden); treating ack as compliance theater (it's context-loading).
- **Narrative:** _HR posts the Diwali leave policy; every supervisor must restate it in their own words before it clears their feed._
- **Constraints:** §4, framing. **Screen:** HR Updates composer + sent list.

---

## Area F — Setup, correction & audit (one-time and always-on)

### F1 · Bootstrap review / correction · GAP (closure §5.3.7)

- **Why:** Day-1 migration seeds supervisor bindings from history; HR must confirm them.
- **What:** `/hr/bootstrap-review`; one row per seeded binding (site, inferred supervisor, alternatives with history) → confirm / reassign / split-flag-for-owner; bulk-confirm unambiguous rows; status filter; aged rows escalate.
- **Depth:** one-time per tenant; uses `bypassFreezeReason`; audit `BOOTSTRAP_SEED_CONFIRMED/REASSIGNED`.
- **Profit:** turns Day-1's Sequel-Pro-and-Gmail triage into a screen.
- **Risk:** confirming a wrong seed; never finishing (aging escalation).
- **Narrative:** _On go-live Kavitha confirms 94 bindings in bulk and hand-resolves the 6 ambiguous ones, between payroll runs._
- **Constraints:** §7 freeze (bypass). **Screen:** Bootstrap review.

### F2 · Audit-chain reconstruction · GAP (closure §5.3.8)

- **Why:** "who was responsible for this site when this happened" must be answerable; corrections can make the chain unreadable.
- **What:** `/hr/audit-chain`; always-on; search by site / supervisor / date / event kind → timeline with drill-down to decisions made under each binding state.
- **Depth:** reads `AuditEvent` + binding history; read-only.
- **Profit:** the Month-9 unreadable chain becomes a navigable timeline; also serves compliance.
- **Risk:** none high (read-only) — but must not become a bulk-export (INV 13).
- **Narrative:** _After a messy rebalance, Priya reconstructs exactly who owned the site on the day a complaint was logged._
- **Constraints:** §3 INV 9/13. **Screen:** Audit-chain.

---

## Area G — Payroll preparation (the fear)

### G1 · Payroll-close workflow · GAP (prep) / STUB (engine)

- **Why:** payroll is Kavitha's named fear and the thing Axhy currently makes _worse_.
- **What (v1):** monthly, HR-initiated; the system generates a per-worker pay-period summary from attendance (`Visit`/`Attendance`) + `LeaveRequest` + overtime + `Membership.baseSalaryPaise`; HR reviews/edits and approves a file.
- **Depth:** **prep only — the payment _engine_ is a Phase D stub.** No money moves; HR exports/approves the file and pays via their existing channel. The `Visit` model has **no earnings field** — pay = base × attendance, never a per-visit amount (the old `SiteVisit.earningsPaise` cruft is v1/v2; it doesn't exist in v3).
- **⚠ v1 scope honesty (Kavitha is HR _and accounts_):** v1 covers **attendance + base + pro-rata** (pro-rata for mid-month joiners/leavers is a v1 must-have). It does **NOT** yet do **statutory deductions (PF/ESI/PT/TDS), an advances/loan ledger, full-and-final settlement, or festival/annual bonus runs** — all real parts of an Indian cleaning-company payroll. So v1 **reduces but does not replace** the Tally reconciliation. The deferred set is tracked as its own surfaces (**G3–G5 below + statutory/bonus + `13` D9**); document/KYC tracking (G2) ships in v1 via S6. Be honest that the named fear is _eased_, not _solved_, in v1.
- **Profit:** replaces the manual attendance-export-and-reconcile step with a generated, trusted attendance+base summary — the first concrete step toward "payroll easier."
- **Risk:** over-promising a payment engine; claiming payroll is "done" when statutory/advances/pro-rata are absent; trusting the wrong field for pay.
- **Narrative:** _Month-end, Kavitha opens payroll-close; the per-worker attendance+base summary is already reconciled; she still applies statutory + advances in Tally (v1), but the attendance reconciliation that ate her evenings is gone._
- **Constraints:** §1 pricing/manual payment. **Screen:** Payroll-close (prep, S21).

### G2 · Document / KYC tracking · GAP (v1 — daily accounts work, screen S6)

- **Why:** at 5K scale HR chases Aadhaar, PAN, bank passbook, police verification, ESI/UAN for hundreds of workers; a worker can't be paid or insured without them. This is the real meaning of the `DOC_PENDING` worker state.
- **What:** a per-worker document checklist (collected / pending / expiry) that feeds `DOC_PENDING` and gives the daily review a screen instead of a Gmail thread.
- **Depth:** stored as worker-attached document records (to model); resolving the checklist clears `DOC_PENDING`. PII handling per DPDP.
- **Profit:** turns "remind the supervisor" into a tracked queue; unblocks pay + insurance.
- **Risk:** PII storage scope; expiry tracking.
- **Narrative:** _Vikram sees at a glance that 40 new joiners are missing PAN and 12 have police-verification expiring this month._
- **Constraints:** §6 DPDP. **Screen:** Worker detail document panel (S6) + a `DOC_PENDING` queue lane. **Status:** named here so it isn't lost; sequence in `14`.

### G3 · Advances / loan ledger · GAP (DEFERRED-but-named)

- **Why:** advances are a running balance (issue ₹2,000, deduct ₹500/month over 4 months); payroll must read the outstanding balance, not a one-off text edit.
- **What:** a small standing ledger per worker (issue, outstanding, per-cycle deduction) that payroll-close reads.
- **Depth:** to model; ledger entries are append-only and audited.
- **Risk:** losing the balance at close time (the reason a free-text field is wrong).
- **Narrative:** _Kavitha gave Suresh ₹2,000 in March; payroll-close shows ₹1,000 still outstanding and auto-proposes the ₹500 April deduction._
- **Constraints:** §1. **Screen:** Advances ledger (deferred). **Status:** deferred; `13` D9 / `14`.

### G4 · Statutory deductions config · GAP (DEFERRED-but-named)

- **Why:** PF/ESI/PT/TDS are mandatory line-items for a registered Indian employer; without them the "file" is a gross estimate re-keyed into Tally.
- **What:** company-level statutory config + per-worker line-items the payroll summary carries as editable fields.
- **Status:** deferred (`13` D9); named so payroll v1's gap is explicit, not silent.

### G5 · Full-and-final settlement worksheet · GAP (DEFERRED-but-named)

- **Why:** terminating a worker triggers F&F — pending salary, advance recovery, leave encashment, gratuity-if-eligible. The highest-stakes act currently leaves its accounts half-done.
- **What:** on termination apply (S16), generate an F&F worksheet (days worked this cycle, outstanding advance to recover, leave balance) that flows into the next payroll-close.
- **Status:** deferred; ties S16 (termination) to G1 (payroll). Named so termination isn't "done" while the money owed/owing is off-system.

---

## Cross-cutting machinery (not screens, but every screen depends on them)

- **Notifications** — `push → SMS → WhatsApp-out → email` fallback chain, localized to the recipient's language, coalesced per kind. HR actions emit them (binding change, leave status, termination, owner-notify). (`closure §3.4`)
- **Digests** — `hr_team_daily` (HR's own rollup), plus the owner/supervisor digests HR's actions feed. Immutable, composed from AuditEvent + QueueItem + Notification. (`closure §3.5`)
- **Handoff packages** — frozen JSON snapshot on every binding change (`schemaVersion=1`, `siteRules` only in v1); permanent → prepended to LivingDoc, acting → read-only panel. (`closure §3.7`)

---

## Feature → surface → status summary

| #   | Feature                         | Closure ref | Status                | Screen                             |
| --- | ------------------------------- | ----------- | --------------------- | ---------------------------------- |
| A1  | Invite member                   | —           | KEPT                  | Invite member                      |
| A2  | Invite worker                   | —           | KEPT                  | Invite worker                      |
| A3  | Directory                       | —           | KEPT                  | Members/Workers list + detail      |
| B1  | Sites                           | —           | KEPT                  | Sites list/detail                  |
| B2  | Bind supervisor                 | —           | KEPT                  | Create binding                     |
| B3  | Acting-cover ±re-pick           | §5.3.4      | GAP                   | Acting-cover wizard                |
| B4  | Permanent reassign              | §5.3.5      | GAP                   | Permanent reassign                 |
| B5  | Switch all sites                | §5.3.6      | GAP                   | Switch-all-sites                   |
| C1  | Pod home                        | §5.3.1      | GAP                   | Pod home                           |
| C2  | Scoped queue                    | §5.3.2      | GAP                   | Queue                              |
| C3  | SLA signals                     | §5.3.3      | GAP                   | Queue badges + item                |
| C4  | Lock UI                         | §5.3.11     | GAP                   | Lock banner                        |
| C5  | Complaint triage/reply          | —           | KEPT(read)/GAP(reply) | Complaint detail (S23)             |
| D1  | Leave decide                    | —           | KEPT                  | Leave inbox/detail                 |
| D2  | Termination ack                 | §5.3.9      | GAP                   | Termination ack                    |
| D3  | Anonymize                       | —           | KEPT                  | Worker detail                      |
| E1  | HR rules                        | —           | GAP(partial)          | HR rules editor                    |
| E2  | HR Updates                      | —           | GAP                   | HR Updates composer                |
| F1  | Bootstrap review                | §5.3.7      | GAP                   | Bootstrap review                   |
| F2  | Audit-chain                     | §5.3.8      | GAP                   | Audit-chain                        |
| G1  | Payroll-close (attendance+base) | §5.3.10     | GAP/STUB              | Payroll-close (S21)                |
| G2  | Document / KYC tracking         | —           | GAP (named)           | Worker doc panel (S6) + queue lane |
| G3  | Advances / loan ledger          | —           | DEFERRED              | Advances ledger                    |
| G4  | Statutory deductions config     | —           | DEFERRED              | (config)                           |
| G5  | Full-and-final worksheet        | —           | DEFERRED              | ties S16↔S21                       |
| —   | Notifications (bell) panel      | §3.4        | GAP                   | Notifications panel (S25)          |

Build sequencing for these is in `14_BUILD_ORDER_AND_ACCEPTANCE.md`. **Honesty note:** G2–G5 are the "accounts" half of Kavitha's job. **In v1:** G2 (document/KYC via S6) and pro-rata (in G1). **Deferred beyond v1:** G3 (advances ledger), G4 (statutory), G5 (F&F), plus bonus runs — named here, not silently dropped; the portal is not "done" for her until they exist, which `14`, `13` D9, and `01` now state plainly.
