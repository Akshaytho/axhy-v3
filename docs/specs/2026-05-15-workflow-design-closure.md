---
Status: Active but contract-incomplete
Last validated against code: 2026-05-15
Validated branch: feat/phase-c-wave-4b-chat-completion
Primary owner: founder (Akshay Thota)
Authored: 2026-05-15
Promoted: 2026-05-15 (founder approval received; PROMOTION_CHECKLIST run end-to-end)
Replaces: nothing — first-version
Type: Workflow design closure (cross-cutting decisions + primitives + persona surfaces)
Primary inputs: 5 audit files at `docs/audits/2026-05-14-...md` + `docs/audits/2026-05-15-...md`
Active specs amended (cross-refs landed in this same promotion commit): supervisor-responsibility-model (2026-05-14), operations-workflow-model (2026-05-14), D.1 decision-entity-lock (2026-05-12), R6 supervisor-mobile-design (2026-05-12), HR Updates spec (2026-05-12), product framing (2026-05-13)
Canonical-truth: row added 2026-05-15 (Active but contract-incomplete table)
Named open gaps: 8 founder-pick flags (§12 F-P-1 through F-P-8); 5 partial-coverage items per §13 verification matrix; 6 low-cross-cutting gaps explicitly deferred
---

# Workflow Design Closure — Axhy v3 (2026-05-15)

## §1 What this document does

The 5-file persona audit set surfaced a consistent finding: the structural design (binding model, origin attribution, read-time routing, no-overlap invariant) is sound; the operational design (policies + surfaces + fallback + notification + queue rules) is roughly one-third specified. Most dangerous gaps appear in 2+ persona files, which makes them **cross-cutting** decisions, not feature-by-feature workarounds.

This document does three things:

1. **Freezes 10 cross-cutting decisions** with explicit picks (§2).
2. **Defines 6 stable primitives + the HR pod model** that those decisions rest on (§3, §4).
3. **Specifies persona surfaces, fallback rules, notification rules, queue rules, AuditEvent additions, cron jobs, and implementation build order** (§5–§11) so the engineer building from this knows what to build and in what order.

Genuinely strategic / commercial choices remain `[founder pick required]` with 2–3 options + tradeoffs (§12). Everything else is decided here.

A verification matrix (§13) maps every `[MISSING]` / `[BROKEN]` tag from the audit set to a §-reference in this doc.

Status framing: this is a **Draft** pending founder approval. No canonical-truth entry, no existing spec modification, no code or schema migration. After founder approval, this becomes Active and the cross-references at §14 update accordingly.

---

## §2 The 10 frozen decisions

Each decision: question · audit evidence · the pick · rationale · downstream triggers. Cross-cite the persona files where the gap surfaced.

### Decision 1 · Multi-HR coordination

- **Question:** At 5K-employee scale, how do 5 HR users share work without silent duplicate approvals, race losses, or stranded queue items?
- **Audit evidence:** Kavitha Month 2 (first multi-HR collision on Krishna's leave) + Month 9 (multi-direction rebalance Gmail-coordinated) + Month 10 (Diwali repeat). Combined Scenario 1 + 7. The spec has zero content on multi-HR coordination.
- **Pick: HR Pod Model.** HR users are organised into **pods**. Each pod has a primary owner + a backup owner. Workers and supervisors are assigned to pods. Most queue items route to their pod's queue. Cross-pod override allowed with audit trail.
- **Rationale:** Partitioning by ownership is the smallest model that eliminates duplicate-approval races while still allowing any HR user to override in emergencies. Worker-anchored partitioning (workers don't change pods often) is more stable than site-anchored (sites move between supervisors).
- **Downstream triggers:** new `HRPod` entity (§4); `Membership.podId` field; pod-scoped `QueueItem` projection (§3.3, §8); cross-pod override AuditEvent (§9); pod migration job (§10).

### Decision 2 · HR-absent fallback (G-1)

- **Question:** What happens when the responsible HR user is unreachable (vacation, sickness, long absence)? Today: nothing.
- **Audit evidence:** Kavitha Month 4 (3-day wedding produces queue stall) + Reddy Month 4 (he cannot inherit by default) + Combined Scenario 4 (72-hour EMPLOYMENT-tier stall). Open as G-1 in ops §12 #1.
- **Pick: Tiered fallback.**
  1. **Primary unavailable >24h** → pod's backup owner becomes acting primary automatically (telemetry-driven: any HR action by backup during this window writes an `HR_FALLBACK_INVOKED` audit row).
  2. **Both primary + backup unavailable >48h** → any HR user in the company can override pod boundary with audit trail.
  3. **All HR unreachable >72h** → owner receives an "HR-team unreachable" emergency alert with an explicit-invocation override path (NOT default auto-inheritance). Override grants a 7-day emergency HR role on a specific employee or specific action.
- **Rationale:** Three-tier prevents both extremes: HR queue does not stall on one person's absence, but the owner is not silently inheriting authority by default. The 24h/48h/72h thresholds give human escalation time before machine escalation fires.
- **Downstream triggers:** unavailability detection (last-login + last-action telemetry); `HR_FALLBACK_INVOKED` AuditEvent (§9); owner emergency-override surface in admin-web /owner (§5.4); cron `hr-availability-sweep` (§10).

### Decision 3 · HR queue priority / SLA

- **Question:** Kavitha cannot triage under sustained load because all items look identical chronologically. Workers strand under load.
- **Audit evidence:** Kavitha Month 6 (47-item queue, Krishna stranded) + Month 10 (Diwali repeat) + Combined Scenario 1.
- **Pick: 3 SLA tiers + DIGEST.**
  - **URGENT (2-hour SLA):** Same-day or next-day pay/work impact. Examples: same-day urgent leave; replacement-invite waiting; EMPLOYMENT-tier originated from a sick supervisor's cover; bootstrap wrong-owner surfacing.
  - **NEXT-DAY (24-hour SLA):** Affects this-week work. Examples: standard leave requests; routine reassignments; EMPLOYMENT-tier under normal conditions.
  - **STANDARD (7-day SLA):** No same-week pressure. Examples: post-suspension reviews; calendar entries pending; bootstrap-seed reviews; site-state observations.
  - **DIGEST (no SLA):** Informational only; never blocks. Examples: HR Updates ack rollup; site-complaint logs.
- **Age-escalation:** rows auto-upgrade when SLA breach approaches. STANDARD aged 5 days → NEXT-DAY. NEXT-DAY aged 18h → URGENT. URGENT aged 90min → backup owner pinged.
- **Rationale:** 4 tiers is the smallest set that distinguishes the operationally meaningful cases without being overwhelming. Age-escalation eliminates the manual-prioritisation burden — the system upgrades automatically.
- **Downstream triggers:** `QueueItem.slaTier` field (§3.3); `QueueItem.escalatedAt` for audit; cron `hr-queue-age-escalation` (§10); SLA-tier rendering in HR pod queue UI (§5.3).

### Decision 4 · Worker supervisor-change notification

- **Question:** Workers experience supervisor change as a WhatsApp introduction with no in-app signal. Trust transition costs are entirely on the worker.
- **Audit evidence:** Suresh Month 8 (W-1 + W-2 + W-7 combined headline) + Month 9 (W-3) + Ravi Month 8a takeaway acknowledges silence + Combined cross-persona view.
- **Pick: Mandatory in-app notification on every binding change affecting a worker's site.**
  - **When fires:** acting binding created · acting binding ended · permanent binding created · permanent binding ended early.
  - **Channel:** push to worker's phone if `Worker.userId` has a registered token; in-app banner on worker home until acknowledged; SMS fallback if no push token; WhatsApp-out fallback if no SMS via Gupshup.
  - **Content:** plain-language, in worker's preferred language. Example: "Your supervisor for Lakeview Tower is now Lakshmi (until 14 days from today). Their number: +91-..."
  - **Coalescing:** one notification per site change. Multi-site workers receive one per site (not aggregated — each is independently meaningful).
- **Rationale:** Worker trust depends on knowing who has authority over them at any moment. Push + banner + fallback chain is the smallest design that guarantees the message reaches the worker. Preferred language matters at 5K-scale with Hindi/Telugu/Bengali/Tamil/etc. distributions.
- **Downstream triggers:** `Worker.preferredLanguage` field (§3); `Notification` entity (§3.4); `WORKER_SUPERVISOR_CHANGE_NOTIFIED` AuditEvent (§9); worker home banner surface (§5.1).

### Decision 5 · Worker termination notification + records (W-4 termination subcase)

- **Question:** Termination as subject-experience is fully offline today. Mahesh learns by phone call. No in-app trace, no appeal, no records.
- **Audit evidence:** Suresh Month 11 (Mahesh path; `[BROKEN]` design) + Combined Scenario 6 (4-month traversal with zero in-app trace).
- **Pick: Deliberate in-app termination notification + 7-day appeal window + on-demand records export.**
  - **At APPLY:** push + in-app banner + SMS fallback. Plain-language reason from the termination row's `reason` field, localised. Includes final settlement amount + date.
  - **Appeal window:** 7 calendar days from apply. In-app form: appeal reason + optional supporting media (photos, voice). Routes to the originating supervisor's current pod's HR primary owner (URGENT tier).
  - **Records export:** worker can request a downloadable summary (attendance days, total pay, leaves, complaints, terminations) at any time before, during, or after termination. Generated server-side as PDF; delivered via push + WhatsApp link.
- **Rationale:** Labor law in India requires written termination reasons + reasonable opportunity to appeal for non-fault cases. The current "phone call from HR" exposes Surya to both labor disputes and trust collapse. The 7-day appeal window is a default operating target — `[founder pick required]` flag if a different duration is needed (3 / 14 / 30 days).
- **Downstream triggers:** `WorkerTerminationAppeal` entity (lean — id, terminationDecisionId, workerId, reason, media[], status, createdAt, resolvedAt); `TERMINATION_NOTIFIED_TO_SUBJECT` AuditEvent (§9); appeal-resolution surface for HR (§5.3); records-export job + delivery.

### Decision 6 · Bootstrap correction + audit-chain reconstruction (G-4 / G-5)

- **Question:** Day-1 bootstrap-seed wrong-owner cases age into operational + compliance conflict. HR has no surface to triage either at Day 1 or after a wrong reassignment.
- **Audit evidence:** Kavitha Day 1 + Month 6 (seed review backlogged) + Month 9 (post-rebalance audit chain unreadable) + Combined Scenario 5 (Day 1 → Day 90 aging).
- **Pick: Two surfaces in admin-web.**
  - **Bootstrap-seed review UI (one-time per tenant; HR pod primary-owner triage):** each seeded binding shown as a row with — site name, inferred supervisor, alternative supervisors with assignment history, "confirm" / "reassign" / "split-flag for owner review" buttons. Bulk-confirm option for unambiguous rows. Status filter (pending / confirmed / corrected / disputed). Days-since-migration counter; rows aged >30 days at STANDARD SLA upgrade to NEXT-DAY automatically.
  - **Audit-chain timeline view (always-on; admin-web for HR + owner):** for any binding (current or ended) or any site, timeline of all binding events with timestamps + reasons + actors. Drill-down to underlying decisions made under each binding state. Filter by site / supervisor / actor / date.
- **Rationale:** Two-surface split — seed-review is a one-time bulk problem; audit-chain reconstruction is an always-on diagnostic. Combining them would optimise neither. Without the seed-review affordance, Day 1's `BOOTSTRAP_SEED — pending HR review` marker is a deferred-forever liability.
- **Downstream triggers:** admin-web routes + UI (§5.3); cron `bootstrap-seed-aging-sweep` (§10); audit-chain query API.

### Decision 7 · EMPLOYMENT-tier across binding changes

- **Question:** EMPLOYMENT-tier proposals can traverse multiple supervisor states between propose and apply (sick supervisor → acting cover → reassignment → final ack). The typed-phrase gate dilutes; HR acks without context; subject worker has no trace.
- **Audit evidence:** Ravi Month 8d (sick author + Lakshmi-acts case) + Kavitha Month 7 (HR ack with no decision-support) + Suresh Month 11 (Mahesh path) + Combined Scenario 6 (full traversal).
- **Pick: originContext snapshot + HR decision-support + 3-audience push routing.**
  - **`originContext` snapshot on DWI at creation (immutable):** a JSON blob containing the originating supervisor's most-recent chat excerpt around the decision, last 30 days of decisions about the worker, worker's recent attendance + complaint history, and the originating supervisor's identity. Travels with the row across binding changes. Read-only after creation.
  - **HR decision-support panel:** when an HR user opens an EMPLOYMENT-tier row for the typed-phrase ack, the screen shows: originContext + current state of routing (originator / current responsible / their identities) + worker history at-a-glance + the supervisor's typed phrase + a free-text "HR ack notes" field that audit-records HR's stated reason.
  - **3-audience push routing on `TERMINATION_APPLIED`:** originator (the supervisor who proposed it; may be on leave) + current-responsible (the supervisor currently bound to that site; may differ from originator) + worker subject. Each gets a contextually appropriate message.
  - **Sick-author safeguard:** if the originator is currently inside an acting-coverage absence window when the row is created via chat, the row is auto-tagged `proposedDuringAbsence = true`. The receiving acting cover sees a "this was proposed by Ravi during his absence" banner; HR sees the same flag.
- **Rationale:** The typed-phrase gate is a deterrent design; its deterrent value depends on the actor having context. Without context the gate is hollow. Without 3-audience push routing, the apply event has unspecified routing the spec leaves undefined. The sick-author safeguard preserves the proposing supervisor's authority (they originated the decision) without forcing the acting cover to act on it blind.
- **Downstream triggers:** `DecisionWorkspaceItem.originContext` field (JSON column); `DecisionWorkspaceItem.proposedDuringAbsence` boolean; HR decision-support surface (§5.3); 3-audience notification rule (§7); new push channel routing logic.

### Decision 8 · Site handoff context migration

- **Question:** When a site rebinds, the incoming supervisor inherits authority but not site knowledge. LivingDoc is per-supervisor and doesn't migrate; complaint tails go dark; rules are rediscovered by accident.
- **Audit evidence:** Ravi Week 2 (LivingDoc captured) + Month 9 (LivingDoc handoff `[MISSING]`) + Kavitha Month 9 (multi-direction churn) + Combined Scenario 3 (nested handoffs).
- **Pick: Auto-generated `HandoffPackage` on every binding change.**
  - **Contents:** site rules (outgoing supervisor's LivingDoc entries filtered to this site); recent complaints (last 90 days, with state); active worker context (workers currently assigned, their recent decisions, FLAG history); open decisions and calendar entries scheduled for the next 14 days.
  - **Persistence:** stored as a JSON column on the new `SiteSupervisorBinding` row (`handoffPackage` field). Indexed at the site-level so multiple bindings on the same site can chain history.
  - **Surfaced to:**
    - **Permanent rebind:** the package is _prepended_ to the incoming supervisor's LivingDoc as a "handover from [outgoing] on [date]" entry. Becomes part of their personal context.
    - **Acting cover:** the package is shown as a _read-only panel_ in the acting supervisor's Today site card. NOT merged into their LivingDoc (because the cover is temporary; merging would muddle their personal context for sites they normally manage).
  - **Outgoing supervisor:** sees a "you handed off [site] to [incoming] on [date]" notification with a link to view the package they handed off.
- **Rationale:** Context loss at handoff is one of the largest cross-persona gaps. Auto-generating eliminates the human burden of "remembering to write handoff notes." The acting vs permanent distinction respects the difference in identity ownership.
- **Downstream triggers:** `HandoffPackage` JSON shape (§3.7); on-binding-create cron / synchronous handler (§10); `HANDOFF_PACKAGE_GENERATED` AuditEvent (§9); handoff-package panel surface on supervisor Today (§5.2).

### Decision 9 · AI backlog visibility under burst

- **Question:** When the AI chat-extraction pipeline is queued (festival / monsoon), supervisors can't tell if their input was lost or just slow.
- **Audit evidence:** Ravi Month 2 (monsoon burst, 3 retries silent) + Combined Scenario 1 (Diwali) + Scenario 2 (monsoon at 12-portfolio scale).
- **Pick: Per-message processing-state signal + global busy banner.**
  - **Per-message:** after voice-capture, the chat message shows a "processing..." chip. If processing exceeds 30 seconds (configurable per-tenant via Policy), chip upgrades to "queued — system is busy." If exceeds 5 minutes, chip becomes "still processing — your input is saved, decisions will appear when ready."
  - **Global banner:** when AI extraction queue depth exceeds a threshold (telemetry-driven; default 50 pending tenant-wide), a thin top banner shows on all supervisor Chat tabs: "Many supervisors are using AI right now. Decisions may take a few minutes."
  - **No owner notification** for routine bursts. Only fires owner alert if backlog persists >30 minutes (which would indicate genuine infrastructure issue, not festival load).
- **Rationale:** The simplest signal that eliminates the "did the system eat my input" anxiety. Three-stage chip (processing / queued / still processing) gives proportional feedback without alarming users about transient backlog.
- **Downstream triggers:** processing-state field on `ChatMessage` (existing entity); telemetry / queue-depth metric; global banner surface in supervisor mobile shell (§5.2); chip rendering in Chat tab.

### Decision 10 · Owner digest + bank-authority surface

- **Question:** Owner has no auto-generated digest, no KPI surface, no bank-change UI, no compliance access, and no plain-English AI alerts. Today: Kavitha hand-composes WhatsApp summaries; Akshay runs SQL.
- **Audit evidence:** Reddy whole audit + Combined ownership-pointer.
- **Pick:** 7 owner surfaces, split between admin-web pages and off-app delivery.
  - **Admin-web pages** (4): KPI dashboard, bank / tenant settings UI, annual review surface, compliance / audit lookup.
  - **Off-app delivery** (3): monthly auto-composed digest (WhatsApp + admin-web link), high-severity incident digest (push + WhatsApp), AI budget alerts in plain English (push).
  - **Surface contents:**
    1. **Monthly auto-composed digest** sent 1st of month. Telugu + English. WhatsApp summary (1 message) + admin-web link to full digest. Contents: workers/sites/supervisors count, payroll trend, AI spend trend, complaint count (with top 3 sites), suspension count, termination count, top 3 outliers (anything 2σ off norm).
    2. **KPI dashboard** (admin-web, read-only). Same content as the digest, real-time.
    3. **High-severity incident digest** — auto-fires on (a) any 100%-cap AI event; (b) any wrongful-termination-equivalent appeal landing; (c) any same-day full-day site outage. Push + WhatsApp.
    4. **Bank / tenant settings UI** (admin-web). Two screens. Bank account details (account number, IFSC, name on account). Tenant company settings (legal name, GST, address). Both edits require 2-step OTP confirm.
    5. **AI budget alerts in plain English** — 80% warning + 100% cap alerts auto-translated to Telugu + English with 3 action choices: "Continue normally" / "Pause AI until reset" / "Increase cap" (last requires Akshay).
    6. **Annual review surface** (admin-web). Auto-composed at year-end. KPI trends + renewal recommendation.
    7. **Compliance / audit lookup** (admin-web). By employee, by date range, by event type. For legal / regulatory inquiries.
- **Rationale:** Reddy is hands-off operationally but is the legal owner and the renewal authority. The digest + KPI + compliance lookup give him the oversight surfaces that today run through Kavitha's WhatsApp + Akshay's SQL. The bank UI removes Akshay as a single-point-of-failure on routine tenant config.
- **Downstream triggers:** `Digest` entity (§3.5); cron `owner-monthly-digest` (§10); admin-web `/owner` route expansion (§5.4); plain-English alert templates; compliance-lookup query API.

---

## §3 Core primitives

Six entities. Every workflow in v3 produces or consumes these. Adding new features means combining these in new ways, not adding new primitives.

### 3.1 Binding — site responsibility

(Specified in `2026-05-14-supervisor-responsibility-model.md` §7; lands in schema P1.5. This document does not respec the table; it only adds two fields.)

**Additions in this document:**

- `handoffPackage JSON?` — JSON blob containing the auto-generated context package on binding creation (see Decision 8 / §3.7).
- `endedReason ENUM` — already exists; this document extends the enum values: `manual_end`, `auto_expire`, `superseded_by_permanent`, `superseded_by_correction`, `worker_transferred`.

**Lifecycle (compact):** `CREATED → ACTIVE (effectiveFrom passes) → ENDED (effectiveUntil passes OR endedAt set manually OR superseded)`. The ACTIVE → ENDED transition for the `effectiveUntil` path is **time-based and read-time-evaluated** (callers use `getEffectiveBinding`, whose predicate `effectiveFrom <= at AND (effectiveUntil IS NULL OR effectiveUntil > at) AND endedAt IS NULL` correctly excludes the row the instant `effectiveUntil` passes — no cron needed for the responsibility switch itself). Cron `binding-expire-sweep` is for the **side-effect side** of that transition only: emitting a `BINDING_ENDED_AUTO` AuditEvent so downstream consumers (notification dispatcher, digest generator, audit-trail reports) get the signal. AuditEvents on every state change.

**Invariants:**

- At most one active binding per `(siteId, kind)` where `kind ∈ {portfolio, acting}` (existing).
- Origin attribution at decision creation is immutable (existing).
- A binding's `handoffPackage` is computed and frozen at creation; never mutated.

### 3.2 Decision — DecisionWorkspaceItem + AuditEvent

(Specified in `2026-05-12-decision-entity-lock.md` D.1; this document adds 2 fields.)

**Additions in this document:**

- `originContext JSON?` — snapshot at row creation containing the originator's chat excerpt + worker context + supervisor identity (see Decision 7). Required for `tier=EMPLOYMENT`; optional for other tiers.
- `proposedDuringAbsence BOOLEAN` — auto-set `true` when the originator is currently inside an acting-coverage absence window at row creation.

**Lifecycle:** unchanged — `PROPOSED → APPLIED / DISMISSED / FAILED / EXPIRED / UNDONE`.

**Invariants:**

- `originContext` immutable after creation.
- For `tier=EMPLOYMENT` and `proposedDuringAbsence=true`, the receiving acting supervisor sees a flag banner and HR sees the same flag in their decision-support panel.

### 3.3 QueueItem

**Status:** **new in this document.** Formalises what was previously implicit (rows ordered by createdAt across DWI + LeaveRequest + DOC_PENDING transitions + binding-action-requests).

**Shape:** likely a view / projection rather than a materialised table at first. Fields (whether stored or computed):

- `id`
- `companyId`
- `sourceEntity ENUM` — `dwi`, `leave_request`, `binding_action`, `doc_pending`, `replacement_invite`, `worker_appeal`
- `sourceId`
- `audienceRole ENUM` — `worker`, `supervisor`, `hr`, `owner`
- `audienceUserId` (specific user) OR `audiencePodId` (pod queue)
- `priority ENUM` — `URGENT`, `NEXT_DAY`, `STANDARD`, `DIGEST` (per Decision 3)
- `slaTier` — same as priority initially; the field exists so future tier remapping doesn't require schema change
- `state ENUM` — `PENDING`, `LOCKED`, `RESOLVED`, `ESCALATED`, `EXPIRED`
- `lockedBy USER?` — pessimistic lock for HR queue items
- `lockedUntil TIMESTAMPTZ?` — lock TTL (default 15 minutes; renewed on user activity)
- `escalatedAt TIMESTAMPTZ?` — when an age-escalation fired
- `createdAt`, `resolvedAt?`

**Lifecycle:** `PENDING → LOCKED (when a user opens it for action) → RESOLVED / ESCALATED / EXPIRED`.

**Invariants:**

- A queue item with `audiencePodId` set is owned by that pod's primary owner first; their backup at age-escalation.
- A queue item with `audienceUserId` is owned by that specific user; escalates to their pod primary if user is unavailable.
- Lock semantics: only one user can hold a lock; lock-grab is atomic with audit emission.
- Age-escalation upgrades `priority` automatically and emits an AuditEvent.

### 3.4 Notification

**Status:** **formalisation in this document.** Today, outbox topics + downstream handlers act as notifications without a tracking entity. This entity tracks delivery + acknowledgement.

**Shape:**

- `id`
- `companyId`
- `audienceUserId` (or `audienceWorkerId` for worker notifications where the worker has no User)
- `kind ENUM` — `supervisor_change`, `termination_applied`, `leave_status`, `replacement_invite`, `flag_alert`, `hr_update`, `ai_budget_alert`, etc.
- `channel ENUM` — `push`, `sms`, `whatsapp_out`, `email`, `in_app_banner`
- `priority` — same enum as QueueItem (URGENT / NEXT_DAY / STANDARD / DIGEST)
- `payload JSON` — content + localisation context
- `scheduledAt`, `deliveredAt?`, `failedAt?`, `failureReason?`, `ackedAt?`

**Lifecycle:** `SCHEDULED → DELIVERED → ACKED (optional)` or `SCHEDULED → FAILED → RETRIED` with channel fallback chain.

**Invariants:**

- Audience resolution happens at delivery time, not at scheduling time (HR Updates spec §3.2 pattern).
- Channel fallback: push → SMS → WhatsApp-out → email. Configurable per-tenant + per-persona via Policy.
- Coalescing: per-kind rules (e.g., site-suspension cascade fires one notification per affected worker, not coalesced; multi-binding acting-cover events for the SAME supervisor pair coalesce to one push).

### 3.5 Digest

**Status:** **new in this document.** A composed multi-event rollup, distinct from individual notifications.

**Shape:**

- `id`
- `companyId`
- `audienceUserId`
- `kind ENUM` — `owner_monthly`, `owner_incident`, `owner_annual`, `hr_team_daily`, `supervisor_while_you_were_out`
- `period START` / `period END` (range of events covered)
- `composedAt`
- `body JSON` (structured content) + `bodyText` (rendered plain-text version for WhatsApp / SMS)
- `deliveryChannel`
- `deliveredAt?`

**Lifecycle:** generated by cron or by trigger event → composed → delivered.

**Invariants:**

- Digests are immutable once delivered.
- Composition reads from AuditEvent + QueueItem + Notification rows, not from live state (so a digest reflects the period accurately even if state changes after).

### 3.6 Policy

**Status:** **new in this document.** Per-tenant configurable values that govern workflow behaviour.

**Shape:**

- `id`
- `companyId`
- `key STRING` — e.g., `hr.queue.urgent_sla_minutes`, `worker.termination_appeal_days`, `ai.backlog.chip_upgrade_seconds`, `worker.preferred_language_default`
- `value JSON` — type-appropriate value
- `setBy USER`
- `setAt`
- `previousValueSnapshot JSON?` — for audit / rollback
- `category ENUM` — `sla`, `notification`, `worker`, `hr`, `ai`, `owner`

**Lifecycle:** policy changes are append-only; the "current value" for a key is the most-recent row. Older rows preserved for audit.

**Invariants:**

- Every policy change emits `POLICY_CHANGED` AuditEvent.
- A defined set of policies is system-required; defaults shipped with the platform; tenant can override per its needs.
- Policy reads are cached aggressively (rare changes); cache-invalidation on write.

### 3.7 HandoffPackage

**Status:** **new in this document.** Computed-on-write JSON column on `SiteSupervisorBinding`, not a standalone table.

**Shape (JSON blob on `Binding.handoffPackage`):**

- `generatedAt TIMESTAMPTZ` — when the package was composed
- `outgoingSupervisorId UUID?` — the supervisor previously responsible (NULL on first-ever binding for a site)
- `incomingSupervisorId UUID` — the supervisor newly responsible
- `siteRules STRING[]` — site-rule entries filtered from outgoing's LivingDoc for this site
- `recentComplaints OBJECT[]` — last 90 days of `Complaint` rows: `{ id, kind, state, loggedAt, body }`
- `activeWorkers OBJECT[]` — `{ workerId, name, primaryShifts, recentFlags, recentDecisions }`
- `openItems OBJECT[]` — pending decisions + calendar entries scheduled in the next 14 days
- `packageSizeBytes INT` — for telemetry

**Lifecycle:** computed synchronously when a Binding row is created (in the same transaction as the Binding INSERT). Immutable after creation.

**Surfaced to:**

- **Permanent rebind:** prepended to incoming supervisor's LivingDoc as a "handover from [outgoing] on [date]" entry. Becomes part of their personal context layer.
- **Acting cover:** read-only panel on the acting supervisor's Today site card. NOT merged into their LivingDoc (because cover is temporary).

**Invariants:**

- Package is generated synchronously with binding creation; no separate cron lag.
- Package size capped at a Policy-configurable byte limit (default 100KB); truncation strategy: drop oldest complaints first, then activeWorkers field detail.
- One package per binding row; never updated after creation.

---

## §4 HR Pod Model

### 4.1 Purpose

Eliminate multi-HR coordination silence at scale. Provide queue partitioning that scales with company size. Make HR-absent fallback structural rather than ad-hoc.

### 4.2 Default operating target — with override rules

**Default operating target (not a hard freeze):** 1 HR pod owns approximately **200 workers + 4 supervisors**. Surya at 5K workers naturally fits ~25 pods owned by 5 HR users (each user is primary on 5 pods + backup on 5 pods).

**Override rules — pod size is policy-configurable, not numerically hard-coded:**

- Tenant can configure target pod size via Policy (`hr.pod.target_worker_count` and `hr.pod.target_supervisor_count`). Defaults are 200 and 4.
- A pod can hold up to 1.5× target before HR is prompted to split it. Below 0.5× target, HR is prompted to merge.
- Some tenants will deviate: a 500-worker tenant might have 2 large pods of 250; a 50K-worker tenant might use 100-worker pods with more HR users.
- The pod model itself is invariant. The numerical target is tunable per tenant.

### 4.3 Pod roles

- **Primary owner** — the HR user who routinely handles this pod's queue. All non-escalated queue items default to them.
- **Backup owner** — the HR user who covers when primary is unavailable >24h (Decision 2 tier 1).
- **Generalist members** — other HR users in the company. They have read access to all pods (for visibility) but write authority only via cross-pod override (Decision 2 tier 2) or when their own pod overlaps.

### 4.4 Pod assignment

- **Workers** — assigned to a pod when hired, based on their initial supervisor's pod. Workers rarely move between pods (a worker's pod stays even if their supervisor changes, until HR explicitly reassigns).
- **Supervisors** — assigned to a pod when added to the tenant. A supervisor's pod is the pod containing the majority of their workers; auto-rebalances on portfolio changes if cross-pod split exceeds 30%.
- **Sites** — not pod-anchored. Sites move between supervisors via SiteSupervisorBinding; their pod-association is derived (most workers at the site → that worker's pod).

### 4.5 Cross-pod override

- Any HR user can override another pod's queue item with full audit trail.
- Cross-pod overrides do NOT require permission elevation — HR users are trusted at this level.
- Each override writes an audit row that includes the overriding user's reason (free-text required; "emergency cover" is a valid one-liner).

### 4.6 Lock / collision semantics

- HR queue items support pessimistic per-row lock (Decision 1 + §3.3).
- When a user opens a row for action, the row is locked for 15 minutes (renewable on activity).
- If another HR user attempts to open the same row, they see "locked by [user] — opened at [time]; will auto-release at [time]" with options: wait / request unlock (notifies the holder) / force-unlock (HR-team-lead role only; not yet implemented; defer to Phase D).
- Lock holders see a visible countdown timer.
- On force-unlock, the original action attempt by the lock holder fails with a clear "your lock was released" message.

### 4.7 Migration from current state (5 HR users / 1 implicit queue)

- Day-1 migration script: create 1 pod per HR user covering their typical worker count; primary = that user; backup = the closest other HR user by org structure.
- HR users review their seeded pod composition in admin-web (similar surface to bootstrap-seed review per Decision 6).
- Workers / supervisors get pod assignments based on which HR user was previously triaging their requests (derived from AuditEvent history).
- 30-day transition period during which the "all HR users see all rows" fallback remains, so HR can re-pod if the seed is wrong without operational stall.

---

## §5 Persona surfaces

Each surface specified with: visual shape (text, not pixel), notification triggers, queue interactions, edge cases, offline fallback.

### 5.1 Worker (12 surfaces)

**1. Home shell.** A single-page mobile screen showing today's site, today's shift time, current supervisor name + phone, attendance status (clocked in / not), next pay date, leave balance, latest unread notification banner. Lazy-loaded; works offline with last-known state cached.

**2. Today's assignment / site.** Site name + address + map link + shift start/end + co-workers on shift. Updated on assignment changes; push fires for any change.

**3. Current supervisor.** Banner at top of home shell. Updates immediately on binding change (Decision 4). Tappable to call.

**4. Clock-in / clock-out.** A single button on home shell. When tapped at site (within geofence; default 200m, policy-configurable), state transitions SCHEDULED → IN_PROGRESS (clock-in) or IN_PROGRESS → ENDED (clock-out). Photo capture optional at clock-in; required at clock-out for FLAG-eligible sites (per Policy). Offline-tolerant: clock-in time captured locally, synced when network returns; visible "synced" / "pending sync" indicator.

**5. Leave submit + status.** Form: from-date, to-date, reason (template + free text), optional supporting media. Submit fires `LeaveRequest` row + `Notification` to pod HR (URGENT if <7 days out, NEXT_DAY otherwise). Status tab shows each leave's state (REQUESTED / APPROVED / REJECTED / IN_REVIEW with HR-pod-name + ETA from SLA tier). **Multi-site leave semantics (decided here):** an approved leave covers **all** of a worker's scheduled shifts on the affected dates. The replacement-invite cascade fires per affected site-shift, not just the primary site. Closes Ravi Day 3's gap.

**6. Replacement invite accept/reject.** Push notification with full context (site, shift time, pay supplement, expires-in countdown). Accept button on lock-screen for ≤2-min TTL (notification-action). Tap-through to full detail. Acceptance fires `ReplacementInvite.state=ACCEPTED` + new `Assignment` row + notification to inviting supervisor.

**7. False-absence dispute.** When worker is marked absent, push fires to worker with "Tap if you're at site." Tap opens a single screen: confirm presence + optional photo / geolocation. Creates a `WorkerAbsenceDispute` row (URGENT QueueItem) routed to the supervisor who marked absent (their pod's HR as backup if supervisor doesn't respond within 30 minutes).

**8. Flagged-visit visibility (if subject).** When AI flags a visit, the worker who clocked it receives a push: "Your visit at [site] today was flagged: [reason]. Your supervisor will review. Tap to add notes." Optional add-notes flow adds a comment to the visit row that supervisor sees during adjudication.

**9. Suspension visibility with return date.** When suspended, worker home shell shows a suspension banner: "Suspended from [date] to [date]. Pay during suspension: [policy]." Tap-through to suspension details + appeal-if-applicable.

**10. Termination outcome + records / appeal path** (Decision 5). Push at apply + in-app banner. Appeal form available 7 days (policy-configurable). Records export request available before / during / after termination.

**11. Pay / attendance / overtime breakdown.** Monthly statement screen: days worked, total hours, overtime hours, leaves taken, advances if any, deductions, net pay, bank account credited. Compiled from `Visit` + `LeaveRequest` + `Worker.baseSalaryPaise` + payroll handler (Phase D stub today; this surface assumes the handler exists). Until payroll handler ships, show current implementation (Excel-derived numbers if any are accessible) or "Coming soon" with a notification when ready.

**12. Year-end / on-demand records export.** Tap → generates PDF of annual summary (or custom date range). Delivered via push + WhatsApp link. Includes attendance, pay, leaves, complaints, terminations (if any).

**Offline behaviour:** all surfaces show last-cached state when offline. Submit actions (leave, dispute, invite-accept) are queued locally and replayed on reconnect with idempotency.

### 5.2 Supervisor (10 surfaces)

**1. Today queue.** Existing R6 Today tab; extended with: portfolio-delta banner (Decision 8 carry: "since you last opened: gained 3 sites, lost 1") and HR-pending count badge.

**2. Decisions queue.** Existing R6 Decisions tab; extended with: SLA-tier indicator per row (URGENT badge in red, NEXT_DAY in amber, STANDARD in grey, DIGEST in light grey).

**3. Activity / audit trail.** Existing R6 Activity tab; extended with: actor filter chip; worker filter chip; binding-event row separator (groups operational events vs binding-change events visually, addressing Ravi Month 4 confusion).

**4. HR-pending visibility with SLA / escalation.** New section in Decisions tab: rows the supervisor has proposed that are now waiting on HR. Each row shows: HR pod assigned + SLA tier + age + estimated decision time. Supervisor can add an "urgent context" note that HR sees in their decision-support panel (Decision 7).

**5. Absence mode when sick.** When an acting binding is active (the supervisor is being covered), their Today tab shows an absence banner: "Lakshmi is covering your sites until [date]. Decisions you author while you're away will route to her." When the supervisor opens chat to author a new decision, a pre-send banner asks: "You're on absence. This decision will be sent to Lakshmi (your acting cover). Continue?" with "Continue" / "Save as draft for when I return" options. Closes the Ravi 8c `[BROKEN]` design gap.

**6. "While you were out" digest.** On first open after an acting-coverage window ends, the supervisor sees a Digest entity (§3.5) summarising: decisions accepted by the acting cover, decisions dismissed, replacements arranged, complaints logged. Auto-generated.

**7. Portfolio-delta surface.** Banner on Today: "Since [last opened date]: +3 sites, -1 site, +12 workers, -4 workers. Tap for handoff briefings." Tap-through shows a list of the changes with handoff packages for each new site.

**8. Site handoff context when sites move.** Each newly-bound site card has a "First time seeing this site? Read the handoff →" tappable link to the HandoffPackage panel (Decision 8 / §3.7).

**9. Batch grouping / backlog visibility during bursts.** Decisions tab groups rows by `batchId` (when present from compound chat extraction). Each batch shows: "[N] decisions from voice memo at [time]" with expand/collapse. AI backlog visibility via the global busy banner (Decision 9) on Chat tab.

**10. Originator-vs-actor rendering during acting cover.** Activity rows during an acting window show two attribution lines: "originated by [originator]" (small) + "actioned by [actor]" (larger). When the same person is both, only one line shows. Closes the Ravi Month 8d ambiguity.

### 5.3 HR (11 surfaces)

**1. Scoped HR ownership model.** Admin-web HR home: shows my pod(s) at a glance. Each pod card: pod name, worker count, supervisor count, open queue items count, SLA breaches (if any), pod composition link.

**2. Scoped queue.** Default queue view filters to my pods. Tabs for: my pod (primary owner) / pods I back up / all pods (cross-pod override view, sparingly used). Queue items show: source, priority, age, locked-by (if any), audience.

**3. Priority / SLA / escalation signals.** Each queue item shows: SLA tier badge + "X hours remaining" + escalation history (e.g., "Auto-upgraded from STANDARD 2 hours ago").

**4. Acting-cover create / cancel / re-pick flow.** Single screen: select supervisor needing cover → date range → propose acting cover → review supervisor options (with capacity context: current site count + recent decision volume per candidate) → confirm or pick alternative. Cancel-and-repick path available if the chosen cover refuses or becomes unavailable; cancellation prompts for affected-supervisor notification text.

**5. Permanent reassignment flow.** Per-site reassignment form: select site → current responsible (auto-filled) → new responsible → reason → confirm. Effective-from defaults to NOW.

**6. "Switch all sites" bulk reassignment.** From a supervisor's portfolio page: "Reassign all 8 sites to another supervisor" button → bulk reassignment form → review all N bindings being created in one transaction → confirm. Creates N rows in one atomic transaction.

**7. Bootstrap review / correction surface (Decision 6).** Admin-web `/hr/bootstrap-review` page. Row per seeded binding. Per-row actions: confirm / reassign / flag-for-owner. Bulk-confirm for unambiguous rows. Filter by status.

**8. Audit-chain reconstruction surface (Decision 6).** Admin-web `/hr/audit-chain` page. Search by site, supervisor, date range, event kind. Returns timeline view with drill-down. Powered by AuditEvent + binding history.

**9. EMPLOYMENT-tier ack with decision support (Decision 7).** Termination ack screen shows: originContext panel + worker history + supervisor's typed phrase + free-text HR ack notes field + typed-phrase ack input. Audit-emit on submit.

**10. Payroll-close workflow.** Monthly: HR initiates payroll close. System generates per-worker pay-period summary from Visit + LeaveRequest + overtime + Worker.baseSalaryPaise. HR reviews + edits where needed (overtime adjustments, advances) + approves disbursement file. Payroll handler stub remains Phase D; this surface defines what HR will need when the handler ships.

**11. Multi-HR conflict handling.** Queue items show lock state visually. Lock-conflict UI: when a row is locked by another HR user, attempting to open shows "locked by [user]" with wait / request-unlock options.

### 5.4 Owner (7 surfaces)

**1. Monthly digest** (Decision 10) — sent 1st of month via WhatsApp summary + admin-web detail. Telugu + English.

**2. KPI dashboard** — admin-web `/owner/kpi`. Real-time. Same content as digest.

**3. High-severity incident digest** — auto-fires on 100% cap, wrongful-termination appeal, full-day site outage. Push + WhatsApp.

**4. Bank / tenant settings UI** — admin-web `/owner/settings`. Two screens (bank, tenant). 2-step OTP confirm on edit.

**5. AI budget alerts in plain English** — 80% / 100% alerts with 3 action choices. Telugu + English.

**6. Annual review surface** — admin-web `/owner/annual`. Auto-composed at year-end.

**7. Compliance / audit lookup** — admin-web `/owner/compliance`. Search by employee + date range + event type. Returns chronological event log.

---

## §6 Fallback rules

Explicit policy line per failure path.

- **HR primary unavailable >24h** → backup pod owner becomes acting primary (Decision 2 tier 1; `HR_FALLBACK_INVOKED` audit).
- **HR primary + backup unavailable >48h** → cross-pod authority for any HR user (Decision 2 tier 2).
- **All HR unavailable >72h** → owner receives "HR-team unreachable" alert with explicit-invocation emergency override (Decision 2 tier 3).
- **AI chat-extraction queue backlog >30s** → user sees "queued — busy" chip (Decision 9). Backlog >5min → "still processing, saved" chip. Backlog >30min → owner alert.
- **Network failure during worker action** → action queued locally; retry on reconnect; idempotency-key prevents duplicates. UI shows "pending sync."
- **No-overlap invariant refused (DB EXCLUDE catches race)** → losing HR user sees explanation: "This site already has an active binding by [user]. Conflict at [time]. Refresh and retry." Audit row records both the attempt and the refusal.
- **Decision EXPIRED before action** → `DWI_EXPIRED` AuditEvent; supervisor sees the row drop from Decisions tab + a "1 decision expired" digest entry. If originator was on acting cover, the digest entry surfaces in the "while you were out" digest on their return.
- **Supervisor returned from absence with pending Lakshmi-proposed row (C-7.7b)** → on return, supervisor sees the row tagged "originated by Lakshmi during [date range]" with full origin context; they apply or dismiss per normal flow.
- **Worker offline when termination applies** → notification queued via push (deferred delivery); if push fails after 24h, SMS sent; if SMS fails after 48h, WhatsApp-out; if all fail, HR is notified to manually inform the worker.
- **Owner unreachable when emergency override is needed** → escalate to a designated secondary owner contact (admin-web setting; defaults empty); if also unreachable, the situation waits — no further automatic fallback. Open `[founder pick required]` if this needs tighter resolution.
- **Site state cascading (e.g., auto-suspension)** → notifications fire to all currently-assigned workers (push/SMS/WhatsApp-out fallback) AND to the responsible supervisor AND to the pod's HR primary (DIGEST priority). Cascade decisions made atomic with the state transition.

---

## §7 Notification rules

- **Event-driven, audience-resolved.** Outbox topic fires → audience resolution job → Notification rows created → delivery handlers per channel.
- **Audience per kind:**
  - `supervisor_change` → affected workers + outgoing supervisor + incoming supervisor.
  - `termination_applied` → originator + current-responsible + worker subject (Decision 7).
  - `leave_status` (worker-side) → worker; (HR-side, if needed) → originating supervisor.
  - `replacement_invite` → candidate worker.
  - `flag_alert` (worker-side) → worker subject; (supervisor-side) → responsible supervisor.
  - `hr_update` (broadcast) → all supervisors in tenant + workers if `audienceWorkers=true` Policy is set (decision per posting; defaults false; pay-affecting updates default to true).
  - `ai_budget_alert` → owner only.
  - `bootstrap_seed_aging` → pod HR primary.
  - `hr_team_unreachable` → owner.
- **Coalescing:**
  - Multi-binding events for the same supervisor pair (e.g., one supervisor takes 8 sites from another) coalesce to one push: "You're now covering Ravi's 8 sites until [date]" (closes Ravi Month 8a `[CONFUSING]`).
  - Worker-side site-suspension cascade does NOT coalesce — each worker gets their own push because the impact is per-worker.
- **Channel fallback chain (default; per-tenant Policy override):** push → SMS → WhatsApp-out → email. Worker notifications also support in-app banner as a parallel channel (always-on; doesn't substitute for push).
- **Localisation:** notifications are rendered in the recipient's `User.preferredLanguage` (existing field for User; new `Worker.preferredLanguage` defaults to tenant default; can be set during onboarding).
- **Delivery tracking:** each Notification row records `deliveredAt`, `failedAt`, `failureReason`. Retry policy: 3 attempts per channel before falling to next channel.

---

## §8 Queue rules

- **Partition:**
  - Worker queues: per-user (their own pending actions: leave request status, dispute outcomes, etc.).
  - Supervisor queues: per-user (Decisions + Today belong to one supervisor).
  - HR queues: per-pod (Decision 1) + cross-pod backup-routing (Decision 2).
  - Owner queue: tenant-scoped (per-tenant; just Reddy or his delegate).
- **Priority (Decision 3):** URGENT (2h SLA) / NEXT_DAY (24h) / STANDARD (7d) / DIGEST (no SLA).
- **Escalation:**
  - STANDARD aged 5 days → upgrades to NEXT_DAY.
  - NEXT_DAY aged 18 hours → upgrades to URGENT.
  - URGENT aged 90 minutes → pod backup owner pinged (push + queue visibility).
  - URGENT aged 2 hours → cross-pod authority unlocked (Decision 2 tier 2).
- **Lock semantics:** HR queue items support pessimistic per-row lock (15-minute default, renewable). Supervisor and worker queue items do not require locks (single-actor).
- **Visibility:**
  - HR users see their pod's queue by default + can switch to backup pods + can view all-pods (cross-pod read).
  - Supervisors see only their own queue.
  - Workers see only their own queue.
  - Owner sees the tenant-level digest only, not individual queue items.

---

## §9 New AuditEvent kinds

To be added to the existing AuditEvent enum:

- `BINDING_CREATED` (already planned P1.5; formalised here).
- `BINDING_ENDED_MANUAL` / `BINDING_ENDED_AUTO` / `BINDING_ENDED_SUPERSEDED_BY_PERMANENT` / `BINDING_ENDED_SUPERSEDED_BY_CORRECTION`.
- `HR_QUEUE_LOCK_ACQUIRED` / `HR_QUEUE_LOCK_RELEASED` / `HR_QUEUE_LOCK_EXPIRED` / `HR_QUEUE_LOCK_FORCE_RELEASED`.
- `HR_FALLBACK_INVOKED` (records tier 1 / 2 / 3 fallback events; includes reason).
- `HR_CROSS_POD_OVERRIDE_USED` (any time a non-pod-owner takes an action; includes free-text reason).
- `HANDOFF_PACKAGE_GENERATED` (on binding create; captures package size + recipient).
- `POLICY_CHANGED` (every policy update; includes key + previous value).
- `WORKER_SUPERVISOR_CHANGE_NOTIFIED` (records delivery of supervisor-change notification to worker).
- `TERMINATION_NOTIFIED_TO_SUBJECT` (records delivery of termination notification to worker).
- `TERMINATION_APPEAL_FILED` / `TERMINATION_APPEAL_RESOLVED`.
- `WORKER_DISPUTE_FILED` / `WORKER_DISPUTE_RESOLVED` (for the false-absence dispute path).
- `BOOTSTRAP_SEED_CONFIRMED` / `BOOTSTRAP_SEED_REASSIGNED` (records HR review actions).
- `AI_BACKLOG_ESCALATED` (when queue depth crosses threshold and global banner fires; owner alert if >30min).
- `EMERGENCY_OVERRIDE_ACTIVATED` (owner-side emergency HR override).

---

## §10 New cron jobs

- **`binding-expire-sweep`** — runs every 5 minutes. **Side-effect emit only — NOT a responsibility switch.** For each binding whose `effectiveUntil` has passed and that has not yet been processed, emits a `BINDING_ENDED_AUTO` AuditEvent. The sweep does NOT decide who is the current supervisor (that decision is already time-based and read-time-evaluated by `getEffectiveBinding`) and does NOT mutate the binding row (setting `endedAt` here would break historical point-in-time queries). Idempotency is enforced by an audit-existence check on `(kind='BINDING_ENDED_AUTO', targetId=bindingId)`. Generation of the "while you were out" digest is a separate downstream consumer of `BINDING_ENDED_AUTO` and lands in its own slice once the audit emit is reliable.
- **`decision-expire-sweep`** — runs every 15 minutes. Expires PROPOSED DWI rows older than the per-tier threshold (URGENT: 6h; NEXT_DAY: 48h; STANDARD: 14d). `[founder pick required]` if these thresholds need tuning.
- **`flagged-visit-auto-escalate`** — runs every 30 minutes. FLAGGED Visits older than 48h escalate to pod HR queue (URGENT tier). `[founder pick required]` on exact threshold.
- **`hr-queue-age-escalation`** — runs every 10 minutes. Upgrades queue items per Decision 3 escalation rules. Emits audit on each upgrade.
- **`hr-availability-sweep`** — runs every hour. Detects HR users inactive >24h (last-login / last-action telemetry); triggers backup-owner fallback (Decision 2).
- **`bootstrap-seed-aging-sweep`** — runs daily. Bootstrap seeds aged >30 days at STANDARD upgrade to NEXT_DAY (Decision 6).
- **`owner-monthly-digest`** — runs 1st of month at 6am local. Composes + delivers owner monthly digest.
- **`payroll-recompute-tick`** — runs daily at 1am. Recomputes per-worker pending pay for the current month (preparation for monthly payroll close). Stub today; handler lands Phase D.

---

## §11 Implementation build order

Four layers. Each layer has explicit entities + surfaces + exit criteria. Sequential to minimise rework.

### Layer 1 · Core primitives (foundational)

**Entities:** `SiteSupervisorBinding` (P1.5, already planned) · `Membership.podId` field · `HRPod` · `QueueItem` (initial as projection / view) · `Notification` · `Policy` (single append-only table; reconciled 2026-05-15 from earlier `Policy + PolicyValue` two-table draft since the (key, value, setAt) shape collapses both concepts) · `Digest` · `DecisionWorkspaceItem.originContext` + `proposedDuringAbsence` · `Worker.preferredLanguage`.

**Audit kinds:** All §9 additions land here.

**Cron:** `binding-expire-sweep`, `decision-expire-sweep`, `hr-queue-age-escalation`, `hr-availability-sweep` shell jobs (logic may be stubs initially).

**Surfaces:** none (this layer is data + plumbing).

**Exit criteria:** schema migrations applied; AuditEvent kinds emit correctly in test environments; Policy reads / writes work; HRPod CRUD via direct DB or admin API.

### Layer 2 · HR coordination layer

**Entities:** queue partitioning logic; pod assignment migration; lock-table or lock-column on QueueItem.

**Surfaces:** HR admin-web pod home (§5.3.1), scoped queue (§5.3.2), priority/SLA signals (§5.3.3), bootstrap review (§5.3.7), audit-chain reconstruction (§5.3.8), multi-HR conflict UI (§5.3.11). Acting-cover create / cancel / re-pick (§5.3.4). Permanent reassignment + "switch all sites" (§5.3.5, §5.3.6).

**Cron:** `bootstrap-seed-aging-sweep`.

**Exit criteria:** HR can manage queue + create bindings + correct seeds + reconstruct audit chains in admin-web without curl.

### Layer 3 · Supervisor operational layer

**Surfaces:** R6 Today / Decisions / Activity extensions (§5.2.1–§5.2.3); HR-pending visibility (§5.2.4); absence mode (§5.2.5); "while you were out" digest (§5.2.6); portfolio-delta (§5.2.7); handoff context panel (§5.2.8); batch grouping + backlog (§5.2.9); originator-vs-actor (§5.2.10).

**Notifications:** supervisor-side notification rules (§7).

**Exit criteria:** Ravi-style failures from the audit set no longer surface in supervisor mobile testing under all named scenarios.

### Layer 4 · Worker trust + Owner oversight

**Surfaces:** worker home shell (§5.1.1) and all 12 worker surfaces; owner monthly digest (§5.4.1), KPI dashboard (§5.4.2), incident digest (§5.4.3), bank/tenant settings UI (§5.4.4), AI alerts (§5.4.5), annual review (§5.4.6), compliance lookup (§5.4.7).

**Notifications:** worker-side + owner-side notification rules (§7).

**Cron:** `owner-monthly-digest`.

**Exit criteria:** Suresh-style and Reddy-style failures from the audit set no longer surface in respective surface testing; W-1 through W-8 each have a working in-app surface.

---

## §12 Founder-pick flags

These are genuinely commercial / strategic choices the document does NOT decide. Each presented with 2–3 options + tradeoffs.

- **F-P-1 · Pod-size target numbers.** Default proposed: 200 workers / 4 supervisors per pod. Options: 150/3 (more HR users needed, finer-grained queue), 200/4 (default), 250/5 (fewer HR users, broader-shouldered queue). Tradeoff: smaller pods reduce per-HR-user load but increase the number of HR users needed.

- **F-P-2 · SLA durations.** Default proposed: URGENT 2h / NEXT_DAY 24h / STANDARD 7d. Options: tighter (1h / 12h / 5d — more responsive, more pressure on HR), default (2h / 24h / 7d — balanced), looser (4h / 48h / 14d — more relaxed, more worker-stranding risk).

- **F-P-3 · Worker termination appeal window.** Default proposed: 7 days. Options: 3 days (rapid resolution, may not feel fair), 7 days (default; matches typical labor-law expectations in India), 14 days (more deliberate, slower resolution). `[Recommended by labor-counsel review pending]`.

- **F-P-4 · Reverse window resolution.** R6 §4 #1 contradiction: 30 min vs 5 min. Default proposed: 5 minutes per D.1 §2.4, with a 30-minute "soft-flag" path (writes audit but doesn't reverse). Options: 5-min hard (D.1 wins), 30-min hard (R6 wins), 5/30 hybrid (proposed default).

- **F-P-5 · AI overage marketing language.** When AI spend crosses cap, what's the language? Options: "Pause until reset" (hard stop), "Overage charges apply" (continue with cost), "Pause + notify owner" (current proposed default with explicit owner action choice).

- **F-P-6 · Site-level HR Updates routing at launch.** Today: company-wide audience. Options: launch with company-wide only + opt-in per-site later (current default), launch with both modes from day 1 (more complex), launch with company-wide + manual per-site flag (medium).

- **F-P-7 · Worker preferred-language default.** Today: tenant default. Options: tenant default (current proposed), per-worker detected from OTP-language (more accurate but harder UX), explicit prompt at first login (more clicks but explicit consent).

- **F-P-8 · HR-team unreachable secondary contact for emergency override.** §6 fallback rule references "designated secondary owner contact." Founder needs to designate this contact OR confirm "no secondary; situation waits" as acceptable.

---

## §13 Verification matrix

Every `[MISSING]` and `[BROKEN]` tag from the audit set, mapped to its answer in this document. Status is honest: **Answered** (fully closed here), **Partial** (closed in principle but with named follow-up work), **Deferred** (intentionally not closed; low cross-cutting impact).

| Audit gap                                                           | Source                                | Status   | Answered in §                                                                                                                                |
| ------------------------------------------------------------------- | ------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Bootstrap-seed wrong-owner silent                                   | Ravi Day 1, Kavitha Day 1             | Answered | Decision 6 + §5.3.7                                                                                                                          |
| Multi-site worker leave semantics                                   | Ravi Day 3                            | Answered | §5.1.5 — leave covers all of a worker's shifts on the affected dates; replacement-invite per affected site-shift                             |
| Mid-visit AI-flag adjudication                                      | Ravi Day 4                            | Deferred | Low operational priority; post-launch feature work                                                                                           |
| Activation notification to supervisor (DOC_PENDING → ACTIVE)        | Ravi Day 5                            | Partial  | Analogous portfolio-delta surface specified (§5.2.7); explicit activation push must be specified in Layer 4 build (not in this doc)          |
| Dismiss-reason capture for AI learning                              | Ravi Day 7                            | Deferred | AI improvement loop is post-launch                                                                                                           |
| Calendar-kind visual signal on Today                                | Ravi Week 2                           | Deferred | Straightforward UI cleanup; not cross-cutting design                                                                                         |
| Complaint → failed-assignment structural link                       | Ravi Week 2                           | Deferred | Low cross-cutting impact                                                                                                                     |
| LivingDoc handoff on rebind                                         | Ravi Week 2, Month 9; Kavitha Month 9 | Answered | Decision 8 + §3.7 HandoffPackage                                                                                                             |
| HR-pending visibility for proposer                                  | Ravi Month 7, Month 6                 | Answered | §5.2.4 HR-pending visibility                                                                                                                 |
| Retroactive attendance correction path                              | Ravi Month 6, Kavitha Month 6         | Partial  | Reverse window resolution at §12 F-P-4 (founder pick); a separate "HR retroactive correction" workflow needed beyond what this doc specifies |
| Bilateral swap acceptance flow                                      | Ravi Month 6.5                        | Deferred | Workflow extension; not cross-cutting                                                                                                        |
| Suspension return-date render                                       | Ravi Month 6.5                        | Partial  | Worker side specified (§5.1.9); supervisor-side worker-card extension named but not detailed                                                 |
| Sick-supervisor author soft-block                                   | Ravi Month 8c                         | Answered | Decision 7 sick-author safeguard + §5.2.5 absence mode                                                                                       |
| Originator vs actor for EMPLOYMENT-tier                             | Ravi Month 8d                         | Answered | Decision 7 + §5.2.10 originator-vs-actor rendering                                                                                           |
| "While you were out" digest                                         | Ravi Month 8e                         | Answered | §5.2.6 + §3.5 Digest                                                                                                                         |
| Portfolio-delta surface                                             | Ravi Month 9, Month 11                | Answered | §5.2.7 portfolio-delta                                                                                                                       |
| Site handover context                                               | Ravi Month 9                          | Answered | Decision 8 + §3.7                                                                                                                            |
| Batch grouping rendering                                            | Ravi Month 10                         | Answered | §5.2.9                                                                                                                                       |
| Termination-apply push routing                                      | Ravi Month 11                         | Answered | Decision 7 3-audience push                                                                                                                   |
| Worker-side termination notification                                | Suresh Month 11, Ravi Month 11        | Answered | Decision 5 + §5.1.10                                                                                                                         |
| Dead "I'm done for today" button                                    | Ravi Month 12                         | Deferred | R6 UI cleanup; not workflow design                                                                                                           |
| Worker home shell on Day 1                                          | Suresh Day 1                          | Answered | §5.1.1 home shell                                                                                                                            |
| Visit lifecycle worker-side trigger                                 | Suresh Day 2                          | Answered | §5.1.4 clock-in/out                                                                                                                          |
| False-absence dispute                                               | Suresh Day 3                          | Answered | §5.1.7                                                                                                                                       |
| Photo-flag visibility for subject                                   | Suresh Day 4                          | Answered | §5.1.8                                                                                                                                       |
| HR Updates audience excludes workers                                | Suresh Day 5                          | Answered | §7 audience rules + Policy `audienceWorkers=true` for pay-affecting updates                                                                  |
| Replacement-invite worker surface                                   | Suresh Day 7                          | Answered | §5.1.6                                                                                                                                       |
| Worker leave initiation + status                                    | Suresh Week 2                         | Answered | §5.1.5                                                                                                                                       |
| Worker pay surface                                                  | Suresh Week 4                         | Partial  | Surface specified (§5.1.11) but payroll handler is a Phase D stub; pay numbers reflect handler availability                                  |
| Worker hours-worked / overtime                                      | Suresh Months 2, 3, 10                | Partial  | Same as Worker pay — surface specified, handler is Phase D                                                                                   |
| Site-suspension worker push                                         | Suresh Month 5                        | Answered | §6 cascade fallback rule (per-worker push fires on state transition)                                                                         |
| HR queue + escalation visibility for worker (leave status)          | Suresh Month 6                        | Answered | §5.1.5 status with HR pod + SLA-tier ETA                                                                                                     |
| Worker suspension visibility                                        | Suresh Month 7                        | Answered | §5.1.9                                                                                                                                       |
| Worker supervisor-change notification                               | Suresh Month 8, Month 9               | Answered | Decision 4 + §5.1.3                                                                                                                          |
| Worker year-end records                                             | Suresh Month 12                       | Answered | §5.1.12 records export                                                                                                                       |
| HR Day-1 review affordance                                          | Kavitha Day 1                         | Answered | Decision 6 + §5.3.7                                                                                                                          |
| HR caller-side UIs (HR Update post, leave queue, worker activation) | Kavitha Days 2–4                      | Answered | §5.3.1–§5.3.11 surfaces                                                                                                                      |
| HR payroll close                                                    | Kavitha Week 4, Month 12              | Partial  | §5.3.10 surface specified; payroll handler stub deferred to Phase D                                                                          |
| Multi-HR coordination                                               | Kavitha Month 2                       | Answered | Decision 1 + §4 pod model                                                                                                                    |
| HR-absent fallback                                                  | Kavitha Month 4                       | Answered | Decision 2 + §6 fallback                                                                                                                     |
| Site-suspension HR ownership                                        | Kavitha Month 5                       | Answered | §6 cascade fallback + Policy for HR-pod-notification on site-state                                                                           |
| HR queue saturation triage                                          | Kavitha Month 6                       | Answered | Decision 3 + §8 queue rules                                                                                                                  |
| EMPLOYMENT-tier decision-support                                    | Kavitha Month 7                       | Answered | Decision 7 + §5.3.9                                                                                                                          |
| Wrong-binding correction UX                                         | Kavitha Month 8                       | Answered | Decision 6 + §5.3.8 audit-chain + §5.3.4 cancel-and-repick                                                                                   |
| Multi-direction churn audit chain                                   | Kavitha Month 9                       | Answered | Decision 6 + §5.3.8                                                                                                                          |
| Supervisor-quits portfolio liquidation                              | Kavitha Month 11                      | Answered | §5.3.6 "switch all sites" + existing Membership.status INACTIVE                                                                              |
| HR-side ack for EMPLOYMENT                                          | Kavitha Month 11                      | Answered | §5.3.9 decision-support                                                                                                                      |
| Owner bank-change surface                                           | Reddy Day 1, Month 4                  | Answered | §5.4.4                                                                                                                                       |
| Owner monthly digest                                                | Reddy Month 1, Month 12               | Answered | §5.4.1 + Decision 10                                                                                                                         |
| AI budget alert plain English                                       | Reddy Month 3                         | Answered | §5.4.5 + Decision 10                                                                                                                         |
| Owner Kavitha-absent fallback                                       | Reddy Month 4                         | Answered | Decision 2 tier 3 + §5.4 emergency override                                                                                                  |
| Operational event digests for owner                                 | Reddy Months 5, 8, 11                 | Answered | §5.4.3 incident digest                                                                                                                       |
| Owner KPI surface                                                   | Reddy Month 6, Month 12               | Answered | §5.4.2                                                                                                                                       |
| Annual review surface                                               | Reddy Month 12                        | Answered | §5.4.6                                                                                                                                       |
| Owner compliance audit                                              | Reddy (critique)                      | Answered | §5.4.7                                                                                                                                       |
| F26.5 no-overlap acting+acting violation                            | Combined Scenario 7                   | Answered | §6 fallback (race lost) + §3.1 invariants                                                                                                    |
| F27.3 no-overlap permanent+permanent violation                      | Combined Scenario 7                   | Answered | Same as F26.5                                                                                                                                |
| C-7.12b termination during HR absence                               | Combined Scenario 4                   | Answered | Decision 2 tier 1/2/3                                                                                                                        |
| Diwali-scale festival overload                                      | Combined Scenario 1                   | Answered | Decisions 1, 3 + §6 fallback + §8 queue                                                                                                      |
| Multi-supervisor overlap in burst                                   | Combined Scenario 2                   | Answered | Decision 9 + §6 AI backlog fallback                                                                                                          |
| Nested supervisor changes (sick + permanent)                        | Combined Scenario 3                   | Answered | Decisions 7, 8                                                                                                                               |
| Bootstrap-seed aging into conflict                                  | Combined Scenario 5                   | Answered | Decision 6                                                                                                                                   |
| EMPLOYMENT across F26+F27+queue                                     | Combined Scenario 6                   | Answered | Decisions 3, 7                                                                                                                               |
| Worker supervisor-change notification (G-8)                         | Combined cross-persona                | Answered | Decision 4                                                                                                                                   |
| Multi-HR coordination                                               | Combined cross-cutting                | Answered | Decision 1 + §4                                                                                                                              |
| HR queue priority/SLA                                               | Combined cross-cutting                | Answered | Decision 3 + §8                                                                                                                              |
| AI backlog visibility                                               | Combined Scenario 1, 2                | Answered | Decision 9                                                                                                                                   |

**Coverage tally:** of ~67 distinct gaps tracked above:

- **Answered:** ~55 gaps fully closed in this document.
- **Partial:** 5 gaps closed in principle but with named follow-up work (activation push wiring in Layer 4; retroactive attendance correction workflow; supervisor-side worker-card suspension render; worker pay surface pending payroll handler; HR payroll-close pending payroll handler).
- **Deferred:** 6 gaps intentionally not closed here because low cross-cutting impact (mid-visit AI flag, dismiss-reason capture, calendar-kind UI cleanup, complaint→assignment link, bilateral swap acceptance flow, R6 dead-button cleanup) — all addressable in feature work post-launch.

The 5 Partial items concentrate around two themes: (1) payroll handler is a Phase D stub by design (`§5.1.11` + `§5.3.10` define the surface, the handler lands later); (2) a few specific UI extensions (activation push, suspension worker-card supervisor-side) are named in this doc but their precise render shape is implementation work in Layer 4 of §11.

---

## §14 What this doc supersedes / amends

This is a Draft; nothing is amended yet. After founder approval, the following changes land:

- **Supervisor responsibility model (2026-05-14) §10 deferred items** — replaced by Decisions 6, 7, 8 + §5.3 (HR portal) + §5.2.6 (digest) + §3.7 (HandoffPackage).
- **Operations workflow model (2026-05-14) §12 open questions** — 7 of 10 answered here (G-1 Decision 2; G-2/C-7.8 §7 with Policy `audienceWorkers`; G-3 §6 acting-applied correction via audit-chain; G-4 Decision 6; G-5 Decision 6; G-9 §10 decision-expire-sweep thresholds; G-10 §10 flagged-visit-auto-escalate). 3 remain deferred (cross-tenant transfer, payroll handler, multi-tenant worker — separate tracks).
- **D.1 decision-entity-lock §2.11 EMPLOYMENT-tier HR ack** — extends to include `originContext` field + §5.3.9 HR decision-support surface.
- **HR Updates spec §4.1 audience model** — extended via Policy: pay-affecting updates can opt-in to worker audience.
- **R6 §4 #1 reverse window contradiction** — proposed pick: 5-min hard reverse + 30-min soft-flag (§12 F-P-4).
- **Master plan §G HR-confirms lock** — surface specified in §5.3.9.
- **Canonical truth index** — new row to be added on approval.

---

## §15 Cross-references

- 5 audit drafts: `docs/audits/2026-05-14-1yr-sim-{supervisor-ravi,worker-suresh}.md` and `docs/audits/2026-05-15-1yr-sim-{hr-kavitha,owner-reddy,system-combined}.md`.
- 6 active specs: `docs/specs/2026-05-14-supervisor-responsibility-model.md`, `docs/specs/2026-05-14-operations-workflow-model.md`, `docs/specs/2026-05-12-decision-entity-lock.md`, `docs/specs/2026-05-12-supervisor-mobile-r6-design.md`, `docs/specs/2026-05-12-hr-updates-spec.md`, `docs/specs/2026-05-13-product-framing.md`.
- Master plan: `/Users/thotaakshay/.claude/plans/now-i-think-it-functional-kernighan.md` (§O personas, §G HR-confirms lock).
- Plan history: `/Users/thotaakshay/.claude/plans/yes-you-can-start-ancient-yao.md`.

---

_End of workflow design closure. Status: Draft — pending founder approval. After approval, this document becomes the implementation-ready operational design that closes the cross-cutting gaps the audit set surfaced._

---

## 2026-05-16 Update — S-001 same-day supervisor-freeze policy (locked)

Locked 2026-05-16. Triggered after F-002 round 2 + round 3 had to engineer a stale-authority race around the possibility that responsibility can change mid-day. Per the policy-first rule (rule 25): simplify the business rule before engineering around it. The same text is the lock wording in `2026-05-14-supervisor-responsibility-model.md` (single source).

**Lock wording (single source — same text used in the responsibility-model 2026-05-16 update):**

> Same-day supervisor-freeze policy (S-001). Once the day has started in the tenant's local timezone, no supervisor responsibility change may take effect for that site until the next tenant-local midnight. This includes new acting cover, permanent reassignment, ending the current responsible binding, or any other binding mutation that would change who is officially responsible for today. Same-day emergencies are handled operationally outside ownership-change logic. No account sharing. F-002's atomicity and auth re-check protections remain in place as defense-in-depth.

**How this simplifies the closure-spec primitives + persona surfaces:**

- **§3.1 Binding (site responsibility)** — `effectiveFrom`/`effectiveUntil` are still the existing fields. The freeze constrains the values HR can submit through the API; the primitive itself is unchanged.
- **§4 HR Pod Model** — pod owners cannot push a mid-day responsibility change; the cross-pod override (§4.5) is also subject to the freeze. Same-day emergencies route to operational coordination, not to a system mutation.
- **§5.3 HR persona surfaces** — binding-create / binding-end / reassign surfaces honor the freeze at the API layer. The HR portal UX (deferred) will surface the policy by greying out same-day effective dates, but the gate is server-side.
- **§5.2 Supervisor surfaces** — Activity tab attribution-during-acting-window and "while you were out" digest UX are unchanged.
- **§5.4 Owner surfaces** — owner-side digest of binding changes (Decision 8 / §3.7 HandoffPackage) is unchanged; it now describes only tomorrow-or-later binding changes.
- **§6 Fallback rules** — HR-absent fallback (Decision 2 / G-1) is unchanged. Cross-pod override + owner emergency-override now apply only to tomorrow-or-later changes; same-day emergencies are explicitly out of ownership-change logic.

**Effect on F-002 round-2/round-3 protections:** they stay as defense-in-depth. The atomic preCheck + service + commitApply pattern remains in `/chat/apply`; the auth re-check inside `commitApply` remains. They cost nothing now and remain correct if the policy is ever loosened.

**Implementation surface:** one shared API-layer helper `assertNotChangingTodaysResponsibility(tenantTimeZone, mutation)` applied at every HR binding-mutation entry point (binding-create, binding-end, `reassignPermanentBinding`, and any new path that mutates a SiteSupervisorBinding row in a way that would change today's responsible supervisor). 400 BAD_INPUT on violation.

**Cross-reference:** active-slice `same-day-supervisor-freeze (S-001)` on branch `feat/layer-1-core-primitives`. Spec lock approved by friend at HEAD `9e137e4` on 2026-05-16 ("v2 wording is good · spec lock approved").
