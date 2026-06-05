# HR Portal — Canon Facts (single source of truth)

> **Status:** Synthesis reference, 2026-06-04. Compiled by reading the worker/supervisor design canon, the HR specs/plans/evidence, the workflow-design closure spec, the 1-year HR persona simulation, the locked constitutional docs, the live Prisma schema + state machines + backend routes, and the Axhy brain.
>
> **Purpose:** Every other doc in `HR-portal-final/` derives from this file. If a doc contradicts this file, this file wins (until a newer locked decision supersedes it). Every load-bearing claim carries a source citation so it can be traced and re-verified.
>
> **One thing to hold in mind:** the HR control plane is **data-complete and surface-empty**. The schema, state machines, and backend contracts that HR needs largely exist; the _operational workflow surfaces_ HR needs do not. The HR portal is the project of building those surfaces. (`docs/audits/2026-05-15-1yr-sim-hr-kavitha.md:273`)

---

## 0. Decisions set THIS session (founder, 2026-06-04)

These are new and not yet in the brain or locked docs. They govern this doc set.

- **The existing `apps/admin-web` HR _UI_ code is throwaway.** We design the HR web portal **fresh**. The old `/hr/*` pages (listed in §11) are mined only for "what HR does," never for "how it looked." (Founder, this session.)
- **Backend, data models, state machines, and API contracts are KEPT.** The fresh UI sits on the existing foundation (§7–§10).
- **HR ownership is SITE-ANCHORED, not pod-anchored (supersedes the closure spec's pods).** An HR person owns a set of **sites**; a worker's HR = the HR owning the worker's primary site; the queue is a filtered query, not a `QueueItem` projection; "locks" are soft claims; changes take effect next-day. `HRPod`/`Membership.podId` are dropped. Full decision + the 3 rules: **`15_OWNERSHIP_MODEL_DECISION.md`** (authoritative). Confirmed by a 6-lens design panel + the code audit (`AUDIT-worker-supervisor/`) which verified the site substrate already works.
- **Roles:** **Owner = Admin = one persona / one portal** (code role `OWNER`; "COMPANY_ADMIN" is just a doc-name for it). **SuperAdmin = the founder** (internal, cross-tenant). HR, Supervisor, Worker as-is.
- **Sequence:** finish Worker + Supervisor (a "foundation fix-wave" first — see `AUDIT-worker-supervisor/05_VERDICT.md`) → HR → **one Owner/Admin portal** → your internal SuperAdmin console.

---

## 1. Product framing (what Axhy is)

- Axhy is the **operating brain** for a cleaning company's day-to-day operations: workers are interchangeable but **sites are not**; plans break in real time (absences, swaps, terminations, walk-offs); the supervisor can't hold every constraint in memory; owner/HR can't be in the loop for every decision. Axhy holds the constraints, projects consequences, lets people act fast. Governing rule: **"add intelligence before adding surfaces."** (`docs/specs/2026-05-13-product-framing.md:44-55`, §15)
- **Three-layer truth model:** Layer A = stored truth (Postgres rows), Layer B = computed projection (never persisted), Layer C = daily scratch (TTL'd, per-actor). (`product-framing.md:57-87`)
- **Scale target:** ~2,000 workers / 100+ supervisors per tenant; the HR sim models Surya Cleaning at **~5,000 workers / ~100 supervisors / 5 HR users**. (brain `9dff24cf`; `docs/audits/2026-05-15-1yr-sim-hr-kavitha.md:21`)
- **Pricing/payment (locked):** ₹8/visit + ₹2k/mo floor, AI included; **SaaS billing is manual; worker comp is monthly salary, paid by hand outside the system.** No per-task pricing, no payroll engine yet. Salary source is **`Membership.baseSalaryPaise`** (ADR-0025). The live v3 `Visit` model (`schema.prisma:277-322`) has **no earnings field** — an older payment memo warned against a `SiteVisit.earningsPaise` field, but that was v1/v2 naming and **no such model/field exists in v3**; do not look for it. (memory `project_pricing_locked`, `project_payment_is_manual`; brain `bd1515ef`)

---

## 2. Roles & hiring authority (LOCKED, constitutional)

Source: `docs/locked/hiring-hierarchy.md` (LOCKED 2026-05-25), ADR `docs/decisions/0026-hiring-authority-hierarchy.md`, code mirror `apps/backend/src/middleware/role-gates.ts:32-38`. Role enum: `packages/shared-schema/src/zod/auth.ts:21` = `['WORKER','SUPERVISOR','OWNER','HR','SUPER_ADMIN']`. **Naming:** docs say "COMPANY_ADMIN"; code says `OWNER`. They are the same role. (`docs/learnings/2026-05-19-all-company-admin-maps-to-owner.md`)

```
SUPER_ADMIN → creates OWNER                (Axhy team; tenant bootstrap, ~1x/company)
OWNER       → creates HR, OWNER            (rare: HR ~1-2x/yr; co-owner rarer)
HR          → creates SUPERVISOR, WORKER   (high volume: workers daily, supervisors weekly)
SUPERVISOR  → creates nothing
WORKER      → creates nothing
```

- **HR is the middle, high-trust, high-volume hiring layer.** 2-5 HR people per ~2K-employee shop. (`hiring-hierarchy.md:16,28,34`)
- **Two-stage gate on every membership-create route:** (1) `requireRole(...)` preHandler → 401 `AUTH_REQUIRED` / 403 `FORBIDDEN_WRONG_ROLE`; (2) `assertTargetRole(callerRole, targetRole)` pure fn vs `HIRING_AUTHORITY` → 403 `FORBIDDEN_TARGET_ROLE`; (3) tenant gate (companyId from JWT); (4) audit `MEMBERSHIP_CREATED`. (`hiring-hierarchy.md:60-65`; `role-gates.ts:65-94`)
- **Drift protection:** `test/role-gates.test.ts` parses the locked doc and asserts the `HIRING_AUTHORITY` const matches byte-for-byte; drift fails the build. Changing the table requires a constitutional session. (`role-gates.ts:10-12`)
- **Forbidden patterns:** supervisor-creates-worker (403); any "HR proposes -> ADMIN approves" gate (HR creates supervisors directly); worker public self-signup. New workers must be HR-created first; OTP can only bind an existing User to an existing Membership, never create one. (`hiring-hierarchy.md:40-44`)
- **Single ACTIVE membership per user (LOCKED 2026-05-18):** at most one `Membership` per userId with `status=ACTIVE` (DB partial unique index). On exit → Membership `RESIGNED` + User anonymised; re-registration on the same phone is a brand-new User, no carry-over. Multi-tenant switching is permanently closed. (brain `59e07df1`, `b8b2857a`)
- **No self-service resign/terminate (LOCKED 2026-05-18):** there is no "quit/terminate myself" button in any app. Termination always originates from HR (or owner) via the HR/admin surface. The terminated user sees "Your account has been removed by {Company}" on next login. (brain `866282c1`)

---

## 3. The HR persona — Mrs. Kavitha & the HR team

Source: `docs/audits/2026-05-15-1yr-sim-hr-kavitha.md` (full year simulation), `docs/specs/2026-05-14-operations-workflow-model.md:3.2`.

- **Kavitha**, 41, HR + accounts manager at Surya Cleaning, the owner's sister-in-law. Office laptop primary, phone for offline contact. Runs the company on **3 Excel sheets + Tally (accounts) + Gmail + WhatsApp**. **Named primary fear: "Will this make payroll easier?"** (`...kavitha.md:18-20`)
- **HR team at 5K scale (5 users, no role subtypes):** Kavitha (lead) + Anita (payroll) + Vikram (onboarding) + Priya (compliance) + Deepak (general queue). She is "the operational center of the system at 5K scale." (`...kavitha.md:21,271`)
- **Jobs-to-be-done by cadence:**
  - _Daily:_ triage leave-request queue; review `DOC_PENDING` workers; observe auto-events (site suspensions, AI flags) and decide who to tell. Today: SQL + curl + email (no HR UI). (`...kavitha.md:69-77,109-117`)
  - _Weekly/burst:_ festival leave spikes (80+/week → ~250 company-wide at Diwali), today partitioned informally over Gmail. (`...kavitha.md:89-97`)
  - _Monthly:_ payroll close for ~5,000 workers. The payroll processor is a stub; she + Anita pull an Excel attendance export, reconcile against Tally, build the bank file by hand. **Axhy currently adds a reconciliation step without replacing anything.** (`...kavitha.md:79-87`)
  - _Yearly:_ year-end attestation update + annual payroll true-up, still on Excel. (`...kavitha.md:187-193`)
  - _Episodic:_ acting-cover bindings; permanent reassignments; correcting wrong bindings; liquidating a quitting supervisor's portfolio; typing the final ack on a termination.
- **The pains (real scenarios that justify the surfaces):**
  - Day 1: triages a 100-binding bootstrap seed via Sequel Pro + Gmail while also running month-end payroll; flags 6 ambiguities. (`...kavitha.md:59-67`)
  - Month 2: Kavitha + Anita both approve the same leave row → two audit events, one wins the state-machine race, the other silently fails; noticed 2 days later. **First multi-HR collision.** (`...kavitha.md:89-97`)
  - Month 4: 3-day wedding absence, no fallback → an urgent termination ack sits 72h. (`...kavitha.md:99-107`)
  - Month 6: 47-item Friday queue, chronological only, no urgent flag → an "urgent" Saturday medical leave is unseen until 9pm Friday; the worker is stranded. (`...kavitha.md:119-127`)
  - Month 7: a termination lands as just a row + the supervisor's typed phrase, **no decision-support** → she defers it 4 days (eventually 4 months). (`...kavitha.md:129-137`)
  - Month 8: inserts 8 bindings for Anjali, realizes she's overloaded, rolls them back via `endedAt`, re-creates 8 for Lakshmi → Anjali gets 8 pushes then 8 silently disappearing bindings, no apology channel. (`...kavitha.md:139-147`)
  - Month 9: a multi-direction permanent rebalance under concurrent HR action → the binding constraint refuses and the audit chain becomes unreadable. (`...kavitha.md:149-157`)
- **Cross-persona consequence of HR saturation:** workers lose wages, supervisors get no queue-depth visibility, the owner sees nothing. (`docs/audits/2026-05-15-1yr-sim-system-combined.md:220-229`)

---

## 4. The HR org layer — SITE-ANCHORED (supersedes pods)

> The pod model is **superseded**. Authoritative: `15_OWNERSHIP_MODEL_DECISION.md`. This section is the site-anchored canon. (Closure spec §4 "pods" is historical.)

- **Why site, not pod:** a pod is a new invented thing to build/assign/rebalance/migrate/lock; a **site already exists** in the DB, workers + supervisors already attach to it, and customers already think in sites/areas ("you take Banjara, I take Madhapur" — Kavitha's own informal partitioning, §3). Reuse the real object; invent nothing.
- **Ownership:** each `Site` has one owning HR — a nullable **`Site.ownerHrUserId`** (+ optional **`backupHrUserId`**) column. An HR person owns a **territory** = their set of sites. (Graduate to a thin `HrSiteOwnership` binding table — shaped like `SiteSupervisorBinding` — only if time-bounded "acting HR" coverage is ever needed.)
- **A worker's HR** = the HR owning the worker's **primary site**. Primary site is **deterministic and frozen daily** (`Worker.primarySiteId`, snapshotted nightly: most-contracted-hours, tie → lowest `siteId`), reusing `effective-responsibility.ts`. Routing reads the snapshot, never a live recompute.
- **Routing by subject:** a leave/termination routes to the HR of the _worker's_ primary site; coverage routes by the _site_. (Actor ≠ subject: a supervisor decides, the subject's HR owns the queue row — already how `leave-requests.ts:242-258` works.)
- **Multi-HR collisions:** a **soft optimistic claim** (`claimedBy/claimedAt`, expired on read at `now-10min`), reusing first-writer-wins `updateMany`. **No pessimistic 15-min lock, no force-unlock.** A dead claim is stealable.
- **HR-absent fallback (simplified):** `backupHrUserId` covers; beyond that, the owner (or any HR) reassigns the territory's sites — an audited next-day batch. No 3-tier cron escalation, no `hr-availability-sweep`.
- **Load-balancing & giant sites:** an optional per-worker **`hrTerritoryId` override** (covers "move 200 workers HR-A→HR-B" and "one mega-site bigger than one HR").
- **Migration:** Day-1 seeds `Site.ownerHrUserId` from AuditEvent history (who previously triaged that site's workers); HR confirms in the bootstrap-review screen. No pod-assignment, no 30-day "all see all" mode.
- **Deleted vs pods:** HRPod CRUD, pod-assignment, the >30% auto-rebalance, pod migration, the `QueueItem` projection table, the escalation cron, and the pessimistic-lock subsystem — all gone.

---

## 5. HR queue — a FILTERED QUERY (supersedes the QueueItem projection)

> Site-anchored. Authoritative: `15_OWNERSHIP_MODEL_DECISION.md`.

- **The queue = a query, not a table:** `unresolved rows (LeaveRequest / Complaint / SupervisorDecision[EMPLOYMENT] / DOC_PENDING worker / coverage-needed) WHERE site ∈ my owned sites`, computed on page load over the existing `@@index([siteId, ...])`. **No `QueueItem` table, no projection, no write-amplification.**
- **Open matters carry `routedSiteId`** (snapshotted at creation) so a worker moving sites mid-case doesn't yank the case to a new HR.
- **Priority (kept, simplified):** an SLA-tier _label_ on each row (`URGENT` 2h · `NEXT_DAY` 24h · `STANDARD` 7d · `DIGEST`) computed from kind + age — a sort key in the query, **not** a stored `slaTier` column requiring a cron. → durations are founder pick **F-P-2** (Policy default).
- **Escalation = a daily query** ("unresolved AND older-than-3d AND owner unavailable → notify backup"), not a cron subsystem.
- **Urgent immediate-effect** = the founder's notification + manual escape hatch (the supervisor `reload-context-counter` pattern — verified present in code), not real-time.

---

## 6. The 11 HR coordination surfaces (the closure-spec design)

Source: `...closure.md` §5.3 (lines 436-458). Each is admin-web. These are the canonical HR feature set; the fresh portal realizes them.

1. **Territory home (§5.3.1)** _(was "Pod home")_ — "my sites at a glance": per-territory summary with worker count, supervisor count, open-queue count, SLA breaches. (Site-anchored: my territory = the sites where `Site.ownerHrUserId = me`.)
2. **Scoped queue (§5.3.2)** — a **filtered query** over `unresolved rows WHERE site ∈ my owned sites` (no projection table); tabs _my sites / sites I back up / all (override, sparingly)_; items show source, priority, age, claimed-by, the plain-text routing reason.
3. **Priority / SLA signals (§5.3.3)** — per-item SLA tier _label_ (computed from kind+age, not a stored column) + "X hours remaining"; daily-query escalation, not a cron.
4. **Acting-cover create / cancel / re-pick (§5.3.4)** — pick supervisor needing cover → date range → review candidates _with capacity context (site count + recent decision volume)_ → confirm. Cancel-and-repick prompts for **affected-supervisor notification text** (fixes the Anjali silent-disappearance gap).
5. **Permanent reassignment (§5.3.5)** — per-site (site → current responsible auto-filled → new responsible → reason → confirm). Effective-from defaults NOW, constrained by the same-day freeze to next tenant-midnight.
6. **"Switch all sites" bulk reassignment (§5.3.6)** — from a supervisor's portfolio → reassign all N sites in **one atomic transaction** (supervisor-quit liquidation).
7. **Bootstrap review / correction (§5.3.7)** — `/hr/bootstrap-review`; row per seeded binding with confirm / reassign / split-flag-for-owner; bulk-confirm unambiguous rows; aged rows escalate. One-time per tenant. (fixes Day-1 SQL+Gmail triage)
8. **Audit-chain reconstruction (§5.3.8)** — `/hr/audit-chain`; always-on; search by site / supervisor / date / event kind → timeline with drill-down to decisions made under each binding state. (fixes Month 9 unreadable chain)
9. **EMPLOYMENT-tier ack with decision-support (§5.3.9)** — termination ack screen shows `originContext` panel + worker history + supervisor's typed phrase + free-text "HR ack notes" (audited) + typed-phrase ack input. (fixes Month 7/11 acking on intuition)
10. **Payroll-close workflow (§5.3.10)** — monthly; system generates a per-worker pay-period summary from attendance (Visit/Attendance) + LeaveRequest + overtime + `Membership.baseSalaryPaise`; HR reviews/edits + approves a file. **The payroll _handler_ is a Phase D stub** — this surface defines what HR will need; it does not ship a payment engine. **Scope honesty:** v1 covers attendance + base only; **statutory deductions (PF/ESI/PT/TDS), an advances/loan ledger, pro-rata for mid-month joiners/leavers, and full-and-final settlement are NOT in v1** — they are real parts of an Indian cleaning-company payroll and are deferred/named (see `05` Area G, `13` D9). So v1 reduces, but does not replace, the Tally reconciliation. (Note: closure §5.3.10 says `Worker.baseSalaryPaise` — that field doesn't exist; salary is on `Membership` per ADR-0025; the closure spec is **stale on the field name**.)
11. **Multi-HR claim UI (§5.3.11)** _(soft claim, not a pessimistic lock)_ — a row another HR is handling shows "Anita's on this" (soft `claimedBy`, expires on read at 10min); any HR can steal it (audited). No 15-min lock, no force-unlock.

Supporting machinery (cross-cutting): **Notifications** (push → SMS → WhatsApp-out → email fallback chain, localized, coalesced; `...closure.md:228-249`), **Digests** (`hr_team_daily`, `owner_monthly`, `supervisor_while_you_were_out`, etc.; immutable, composed from AuditEvent+QueueItem+Notification; `...closure.md:252-272`), **Handoff packages** (frozen JSON on every binding change, `schemaVersion=1`, transfers `siteRules` only in v1; `...closure.md:297-326`).

---

## 7. Data models HR sits on (live schema)

Source: `packages/shared-schema/prisma/schema.prisma`. **Worker.id != User.id != Membership.id** — this is the single biggest contract hazard (see §12).

- **Membership** (`:130-169`) — the org-chart row. `companyId`, `userId`, `role` (string holding the Role enum), `status` default `ACTIVE`, `tokenEpoch` (bump invalidates tokens), `podId?` (**DROPPED** — pod model superseded, see `15`), **`baseSalaryPaise` Int default 0**, **`bankIfsc?`/`bankAcct?` (`@personal` PII)**. `@@unique([companyId,userId,role])`. **Salary lives here, not on Worker (ADR-0025).**
- **Worker** (`:243-275`) — `id` (PK, distinct from User.id), `companyId`, `userId? @unique` (null pre-activation and after anonymization), `name`/`phone` (`@personal`), **`state` default `INVITED`** (15-state machine, §9), `preferredLanguage` default `hi`, `joinedAt`. `@@unique([companyId,phone])`. **HR-build adds `primarySiteId?`** (nightly-frozen, the routing key — `15`).
- **Site** (`:212-241`) — **HR-build adds `ownerHrUserId?` (+ `backupHrUserId?`)** = the owning HR (territory). Replaces the dropped `HRPod`. (`HRPod` `:1114-1133` and `Membership.podId` exist in schema today with no logic and are **dropped** — `15`.)
- **SiteSupervisorBinding** (`:1273-1310`) — single table for acting + permanent. `siteId`, `userId` (responsible), **`actingForUserId?`** (NULL=permanent / NOT NULL=acting, the discriminator), `effectiveFrom`, `effectiveUntil?` (required for acting), `reason`, `createdBy` (HR), `endedAt?`/`endedReason?`, **`handoffPackage? Json`**. No-overlap enforced by Postgres `EXCLUDE USING gist` (migration, not DSL).
- **LeaveRequest** (`:507-530`) — `workerId` (**Worker.id**), `fromDate`/`toDate`, `reason`, **`state` default `REQUESTED`** (string; **no XState machine** — lifecycle in service code: `REQUESTED → APPROVED|REJECTED`), `decidedBy?`/`decidedAt?`/`decisionNote?`.
- **Policy** (`:1146-1166`) — **append-only** per-tenant config; current value = latest row by `setAt`. `key`, `value Json`, `setBy`, `previousValueSnapshot?`, `category ∈ sla|notification|worker|hr|ai|owner|handoff`. ACL: `apps/backend/src/lib/policy-write-acl.ts`.
- **Notification** (`:1179-1208`) — `audienceUserId? XOR audienceWorkerId?`, `kind`, `channel ∈ push|sms|whatsapp_out|email|in_app_banner`, `priority ∈ URGENT|NEXT_DAY|STANDARD|DIGEST`, delivery timestamps. Dispatcher handler exists; **no HR-facing API** (gap).
- **Digest** (`:1218-1244`) — `audienceUserId`, `kind ∈ owner_monthly|owner_incident|owner_annual|hr_team_daily|supervisor_while_you_were_out`, `periodStart/End`, `body Json`. Schema-only stub; **no API** (gap).
- **HRUpdate** (`:1034-1064`) — `hrId`, `kind`, `content`, `targetSupervisorId?` (null=org-wide), `acknowledgmentRequired`, `acknowledgmentPhrase?`, `acknowledgedBy?`/`acknowledgedAt?` (single uuid, v0 — no per-supervisor ack join table). Supervisor _consumer_ endpoints exist; **no HR-create route** (gap).
- **SupervisorDecision** (`:929-981`) — the real table behind "DWI". `kind`, `tier ∈ NOTE|OPERATIONAL|PERSONNEL|EMPLOYMENT`, `targetId?`, `appliedAt?`/`dismissedAt?` (PROPOSED iff both null), `ackRequired`, `ackedAt?`, **`originContext? Json`**, **`proposedDuringAbsence`**.
- **AuditEvent** (`:543-568`) — immutable system-of-record. `kind` (free-string taxonomy), `actorId` (no FK), `targetId?`, `payload Json`. INSERT-only. HR-relevant kinds: `MEMBERSHIP_CREATED`, `MEMBERSHIP_POD_ASSIGNED/REASSIGNED`, `WORKER_CREATED`, `WORKER_OTP_VERIFIED`, `WORKER_ANONYMIZED`, `WORKER_TERMINATION_REQUESTED`, `SITE_CREATED`, `BINDING_CREATED`, `BINDING_ENDED_AUTO/MANUAL/SUPERSEDED_BY_PERMANENT`, `HANDOFF_PACKAGE_GENERATED`, `LEAVE_REQUESTED/APPROVED/REJECTED/REVERSED`, `HR_UPDATE_ACKED`, `POLICY_CHANGED`, plus closure-spec additions `HR_QUEUE_LOCK_ACQUIRED/RELEASED/EXPIRED/FORCE_RELEASED`, `HR_FALLBACK_INVOKED`, `HR_CROSS_POD_OVERRIDE_USED`, `BOOTSTRAP_SEED_CONFIRMED/REASSIGNED`.
- Supporting: **Attendance** (`:686-713`, one row per worker/date, `payDeductPaise`), **Complaint** (`:722-783`, `state ∈ OPEN|IN_HR|RESOLVED|DISMISSED`, `unreadHrRepliesCount`), **Site** (`:212-241`, `state` string, no machine), **Visit** (`:277-322`, 12-state machine).

---

## 8. API surface (kept — Fastify backend)

Source: `apps/backend/src/server.ts:173-208` + route files. All `/admin/*` writes wrap `withTenantContext` and reject non-ACTIVE companies (403).

| Method | Path                                      | Role gate                        | Purpose                                                                       |
| ------ | ----------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------- |
| POST   | `/super-admin/memberships`                | SUPER_ADMIN                      | bootstrap first OWNER (tenant-exempt)                                         |
| POST   | `/admin/memberships`                      | OWNER, HR                        | create HR (owner) or SUPERVISOR (HR); `assertTargetRole`                      |
| GET    | `/admin/memberships`                      | OWNER, HR                        | list (HR pod-scoped); cursor pagination                                       |
| GET    | `/admin/workers`                          | OWNER, HR                        | list workers (HR pod-scoped); exposes `workerId=Worker.id`, `anonymizedPhone` |
| GET    | `/admin/workers/:id`                      | OWNER, HR                        | worker detail (`:id`=Worker.id); 404 out-of-pod (no existence leak)           |
| POST   | `/admin/workers`                          | HR                               | create worker → state PENDING_ACTIVATION                                      |
| POST   | `/admin/workers/:id/anonymize`            | HR                               | resign/terminate worker (R3); 404/409 guards                                  |
| GET    | `/admin/sites` · `/:id` · `/:id/bindings` | OWNER, HR                        | list/detail/bindings                                                          |
| POST   | `/admin/sites`                            | OWNER, HR                        | create site → DRAFT                                                           |
| POST   | `/admin/sites/:id/bindings`               | OWNER, HR                        | create binding (acting/permanent)                                             |
| POST   | `/admin/policy`                           | requireAuth + `policy-write-acl` | append Policy row                                                             |
| GET    | `/admin/owner-summary`                    | OWNER, SUPER_ADMIN               | dashboard counts + policies                                                   |
| POST   | `/leave-requests`                         | requireAuth                      | worker creates leave                                                          |
| GET    | `/leave-requests`                         | HR                               | HR inbox (REQUESTED, pod-scoped)                                              |
| GET    | `/leave-requests/:id`                     | HR, SUPERVISOR                   | detail (pod/portfolio gated)                                                  |
| POST   | `/leave-requests/:id/approve`·`/reject`   | SUPERVISOR or HR                 | decide; race-safe `updateMany` + audit + outbox                               |
| GET    | `/supervisor/updates`                     | requireAuth                      | HR-update feed for supervisor                                                 |
| POST   | `/supervisor/updates/:id/acknowledge`     | requireAuth                      | 5-word own-voice ack                                                          |

**No write routes yet for:** HRPod CRUD, QueueItem, Notification (read/ack), Digest, **HRUpdate create** (`POST /hr-updates`), acting-cover cancel/re-pick, permanent reassign as its own verb, switch-all-sites, bootstrap-confirm, payroll-close, termination final-ack. These are the backend gaps the portal needs filled (Layer 1/2).

---

## 9. State machines & lifecycles HR touches

Source: `packages/state-machines/src/`. Only **6** machines exist (worker, visit, capture, calendar, assignment, conflicts). LeaveRequest, Site, Membership, SiteSupervisorBinding lifecycles are **service-enforced**, not XState.

- **WorkerState (15)** `worker.ts:17-187`: `INVITED → PENDING_ACTIVATION → DOC_PENDING → ACTIVE`; from ACTIVE: `LEAVE_APPROVED→ON_LEAVE`, `SUSPEND→ON_SUSPENSION`, `NO_SHOW→ABSENT`, `FLAG_AT_RISK→AT_RISK`, `BLOCK→BLOCKED`, `DOCS_MISSING→DOC_PENDING`, `TRANSFER_INITIATED→TRANSFER_PENDING`, `TERMINATE→TERMINATION_PENDING`, `DEACTIVATE→INACTIVE`; `TERMINATION_PENDING→TERMINATED→ARCHIVED→ANONYMIZED(final)`. Pure machine; backend writes audit/outbox externally.
- **LeaveRequest:** `REQUESTED → APPROVED | REJECTED` (service code; on APPROVED, per affected site-shift → `LEAVE_APPROVED` audit + create ReplacementInvite).
- **SiteSupervisorBinding:** created (acting or permanent); ends via `effectiveUntil` (auto), `endedAt` (manual), or superseded-by-permanent; no-overlap invariant per `(siteId, acting-vs-permanent)` — the discriminator is a CASE over `actingForUserId` (there is **no `kind` column**), enforced by a Postgres `EXCLUDE USING gist` in migration SQL (`schema.prisma:1267-1268`).
- **Termination (EMPLOYMENT tier):** supervisor proposes via typed phrase OR HR initiates → **HR final ack required** → worker `ACTIVE → TERMINATION_PENDING → TERMINATED`; 7-day appeal window (F-P-3, today a Policy key `worker.termination_appeal_days`, not yet a table — a `WorkerTerminationAppeal` table is **to build**); `TERMINATION_NOTIFIED_TO_SUBJECT` audit. **GOTCHA:** the HR-ack lock and the worker-machine transition driver are **named but not yet wired in code** (brain `d6b6f9a4`); the `anonymize-worker-service.ts` even writes `state:'TERMINATED'` directly today, which the real build must route through the machine (INV 10).
- **Same-day freeze (S-001, LOCKED 2026-05-16):** once the tenant-local day starts, no supervisor responsibility change takes effect until next tenant-midnight; enforced server-side (`assertNotChangingTodaysResponsibility`); **constrains every HR binding surface** (acting cover, permanent reassign, binding-end). Bootstrap/migration use `bypassFreezeReason`. (`...closure.md:753-772`)

---

## 10. Constitutional constraints (MUST / MUST NOT for HR)

Source: `docs/locked/operational-invariants.md`, `rule-hierarchy-three-layers.md`, `security-gaps-to-fix.md`, ADR-0025.

**Rule hierarchy (three layers):** Layer 1 company rules `ai.rules.company.*` (OWNER) > Layer 2 HR rules `ai.rules.hr.*` (HR, OWNER) > Layer 3 supervisor LivingDoc. Higher always wins; AI explains conflicts, never silently ignores. **HR can write `ai.rules.hr.*` but NOT `ai.rules.company.*` or `ai.limits.*` (403).** (`rule-hierarchy-three-layers.md:12-52`)

**MUST:** scope every query by `companyId` (INV 1); block writes when `Company.status != ACTIVE` (INV 2, GAP 1); write an immutable AuditEvent per action (INV 9); append-only Policy with `previousValueSnapshot` (INV 8); anonymize PII + soft-delete on offboarding, retain record structure forever (INV 11); capture written termination reason + 7-day appeal (closure Decision 5); fire OWNER notification on HR membership add/remove and any Policy write (GAP 7); validate rule text ≤300 chars, ≤50/key (GAP 3, GAP 10); route HR work through pods with pessimistic locks + audited cross-pod override.

**MUST NOT:** HR create OWNER/HR/itself or a Company (INV 3); add an "HR proposes → admin approves" gate or any supervisor-creates-worker path; allow worker self-signup; HR write Layer-1/`ai.limits.*`; UPDATE/DELETE any AuditEvent or Policy row; direct-DB status writes on state-machined entities; hard-delete anything (SUPER_ADMIN only, INV 4); add a bulk-export / "download all rules/data" feature (INV 13, the moat); silently inherit HR authority to owner on absence (must be explicit, 7-day, bounded).

**DPDP:** anonymize-not-delete; `@personal` bank PII; bank-account _changes_ are an OWNER surface with 2-step OTP (not HR); written reason + appeal for termination.

---

## 11. Existing HR-A1 reality (thin, UI to be discarded)

Source: HR-A1 impl + QA + Playwright evidence (2026-05-29/30), brain `c4ef6c8e`/`57426ccc`.

- A **thin** admin-web portal shipped on branch `feat/hr-a1-thin-portal` over the kept R1-R5 routes + 7 GET endpoints. It delivers **7 core ops:** invite HR/SUPERVISOR, invite WORKER, list memberships, list workers → anonymize, create/list sites, bind supervisor + view bindings, leave inbox → approve/reject.
- Existing `/hr/*` pages (**DISCARD — UI only; logic/contracts kept**): `app/hr/layout.tsx`, `page.tsx`, `memberships/{page,new}`, `workers/{page,new,[id]}`, `sites/{page,new,[id],[id]/bindings/new}`, `leave-requests/{page,[id]}`, `Nav.tsx`, `hr.module.css`.
- **Explicitly NOT built / deferred:** HR Updates create UI, HR pod create/edit UI, binding revoke/end, search/filter beyond pagination, bulk ops, audit-log surface, refresh-token rotation (→F1-c), the full 11-surface closure design.
- **The 11-surface closure design is the target; HR-A1 is the floor.**

---

## 12. Hard-won gotchas the fresh build MUST honor (from real bugs)

Source: `docs/evidence/2026-05-30/EVID-HR-PLAYWRIGHT-BUGS.md`, brain.

1. **`workerId` everywhere = `Worker.id`** — not `User.id`, not `Membership.userId`. `LeaveRequest.workerId` and anonymize both key on `Worker.id`. The first cut exposed `Membership.userId` and would have made every anonymize 404 and every HR leave inbox empty. Fixed in `1edbbfd`. Cross-route contract drift is invisible to per-route audits — build the worker-identity contract once, centrally. (matches memory `feedback_persona_graph_route_audit`)
2. **JWT subject claim is `sub` = User.id** (RFC-7519), not `userId`. A verifier that requires `userId` rejects every real backend token. Never test a verifier against self-issued fixtures — test against real backend tokens.
3. **Auth response shape is `{ accessToken, refreshToken, memberships[] }`** — not `user`. A user may have multiple memberships; redirect role-aware (HR → `/hr`). The first login page destructured `user` and blocked every persona from logging in.
4. **Leave-approval was historically `requireAuth`-only** (any authenticated caller could approve) — HR-A1 added the proper HR pod-ownership gate. Don't assume older paths are HR-gated.
5. **Termination HR-ack lock is specified but not wired** — design assumes it; code does not enforce it yet. Treat as a build item, not an existing guarantee.
6. **Author E2E against the running UI, never ahead of it** — the deferred Playwright spec drifted on selectors, OTP bypass (dev OTP = `123456`), button text, and port. A real browser driving the real login form is mandatory.

---

## 13. Founder picks (F-P-1..8) — status & HR impact

Source: `...closure.md` §12; none individually resolved as of these docs.

| F-P       | Decides                           | Default                     | HR impact                                                                                                                               |
| --------- | --------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| ~~F-P-1~~ | ~~pod-size target~~               | **VOID**                    | **Removed** — no pods (site-anchored, `15`). HR load is balanced by site ownership + the `hrTerritoryId` override, not a pod-size knob. |
| F-P-2     | SLA durations                     | 2h / 24h / 7d               | **HIGH** — HR queue triage (now an SLA _label_ in the filtered query, not a stored field)                                               |
| F-P-3     | termination appeal window         | 7d                          | HR fields appeals                                                                                                                       |
| F-P-4     | reverse window (30min vs 5min)    | 5/30 hybrid                 | HR retroactive correction                                                                                                               |
| F-P-5     | AI-overage marketing language     | pause+notify-owner          | owner-facing (not HR)                                                                                                                   |
| F-P-6     | site-level HR Updates routing     | company-wide + opt-in later | **HIGH** — HR Updates scope                                                                                                             |
| F-P-7     | worker preferred-language default | tenant default (`hi`)       | HR sets at worker invite                                                                                                                |
| F-P-8     | HR-unreachable secondary contact  | designate or "waits"        | **HIGH** — terminal fallback tier                                                                                                       |

---

## 14. The house method (how worker/supervisor screens were derived — reused for HR)

Source: worker + supervisor design canon.

- **Derivation chain:** persona → need → feature → screen → screen-states (loading / empty / error / success / locked / forbidden). The app **reads server state, never simulates it** — legality comes from server `canX` booleans, not on-device machine re-runs. (`docs/personas/worker/WORKER_MVP_SPRINT_PLAN.md:95`)
- **Source hierarchy / tier table** governs authority: locked docs > existing state machines + schema > canonical product spec > persona/design references > the plan itself > visual reference. Every artifact cites ≥1 source in a coverage matrix. (`WORKER_MVP_SPRINT_PLAN.md:60-69`)
- **Three-layer information hierarchy (supervisor R3):** **SCAN** (main surface — "what matters in 3 seconds") → **ACT** (next screen — one purpose, one action) → **INSPECT** (detail — metadata/proof, hidden by default). Applied to every screen. (`docs/specs/2026-05-11-supervisor-mobile-r3-design.md:24-31`)
- **Operations Reality Review** for every major feature: persona-stress-test + exception-first + ownership-model + time-window + control-plane. (`docs/specs/2026-05-14-supervisor-responsibility-model.md:13`)
- **"Do Not Build" cut list** with default-deny: if it's not on the build list and not in the product spec, ask before building; record the reason for every cut. (`docs/personas/worker/DO_NOT_BUILD_MVP.md:4`)
- **UX conventions (admin-web):** visual-first, minimal text, badges over paragraphs, no state-machine jargon, design for scanning; show 2-3 options and let the human decide — the AI does not propose a "smart pick." (brain `ad3bc8b9`, `ad464e5f`; memory `feedback_no_ai_suggestions_admin_decides`)
- **Admin-web stack (fresh UI follows this):** Next.js 15 App Router, React 19, Tailwind 4 + `@axhy/ui-tokens` + `@axhy/ui-web`, server components for reads + server actions for writes, **httpOnly cookie `axhy_at`** JWT verified server-side via `@axhy/jwt-public`, closed-by-default `requireRole(...)` gating each subtree, backend calls via `lib/api.ts` `fetchJson` (the `@axhy/api-client` package is an empty stub today).

---

## 15. Source map (where to re-verify)

- Worker method/inventory: `docs/personas/worker/*`, `docs/design/worker-app-canon/{DESIGN_INVENTORY,GAP_ANALYSIS,DESIGN_MISSING}.md`
- Supervisor design: `docs/specs/2026-05-12-supervisor-mobile-r6-design.md`, `2026-05-11-...-r3-design.md`, `2026-05-14-supervisor-responsibility-model.md`, `2026-05-14-operations-workflow-model.md`
- HR design keystone: `docs/specs/2026-05-15-workflow-design-closure.md`; persona: `docs/audits/2026-05-15-1yr-sim-hr-kavitha.md`; HR Updates: `docs/specs/2026-05-12-hr-updates-spec.md`
- HR build reality: `docs/plans/2026-05-29-hr-a1-implementation.md`, `2026-05-25-admin-hr-backend-wave-2-prep*.md`; evidence `docs/evidence/2026-05-29..30/EVID-HR-*`
- Constitution: `docs/locked/{hiring-hierarchy,operational-invariants,rule-hierarchy-three-layers,security-gaps-to-fix}.md`, `docs/decisions/0025`, `0026`
- Foundation code: `packages/shared-schema/prisma/schema.prisma`, `packages/state-machines/src/`, `apps/backend/src/{server.ts,middleware,routes}`, `apps/admin-web/`
