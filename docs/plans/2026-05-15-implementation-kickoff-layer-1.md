---
Status: Draft kickoff memo
Type: Implementation kickoff — Layer 1 (Core Primitives)
Authored: 2026-05-15
Source of truth: docs/specs/2026-05-15-workflow-design-closure.md (Draft — pending founder approval; treated as source of truth for sequencing)
Audit background (read-only context, not respec'd here): docs/audits/2026-05-{14,15}-1yr-sim-*.md
Not added to: docs/index/canonical-truth.md (Draft)
---

# Implementation Kickoff Memo — Layer 1 (Core Primitives)

## §1 What this memo is

The closure spec defines four implementation layers. This memo unpacks **Layer 1 only** — the data + plumbing foundation. Everything else (Layers 2–4: HR coordination surfaces, supervisor operational surfaces, worker + owner surfaces) builds on what Layer 1 lands.

This memo answers four questions:

1. What schema / entity changes are required first?
2. What can be built in parallel vs sequentially?
3. What must wait for founder picks?
4. What does the first implementation branch contain?

Not in scope: any redesign discussion, any spec amendment, any Layer 2/3/4 work.

## §2 Layer 1 scope (verbatim from closure §11 + concrete unpacking)

From the closure spec:

> **Entities:** `SiteSupervisorBinding` (P1.5, already planned) · `Membership.podId` field · `HRPod` · `QueueItem` (initial as projection / view) · `Notification` · `Policy` (single append-only table; reconciled 2026-05-15 from earlier `Policy + PolicyValue` draft) · `Digest` · `DecisionWorkspaceItem.originContext` + `proposedDuringAbsence` · `Worker.preferredLanguage`.
>
> **Audit kinds:** All §9 additions land here.
>
> **Cron:** `binding-expire-sweep`, `decision-expire-sweep`, `hr-queue-age-escalation`, `hr-availability-sweep` shell jobs (logic may be stubs initially).
>
> **Surfaces:** none (this layer is data + plumbing).
>
> **Exit criteria:** schema migrations applied; AuditEvent kinds emit correctly in test environments; Policy reads / writes work; HRPod CRUD via direct DB or admin API.

## §3 Schema migrations (sequence)

8 migrations. Numbering follows existing `axhy-shared` Prisma migration sequence; insert at the next available index after the current P1 migrations.

**Migration A — HRPod + Membership.podId**

- Create `HRPod` table (id, companyId, name, primaryOwnerUserId, backupOwnerUserId, createdAt, updatedAt).
- Add `Membership.podId UUID? FK → HRPod.id`.
- Backfill: NULL for non-HR roles; for `role=HR`, leave NULL initially (assignment happens in Layer 2 migration).
- Index: `(companyId, podId)` on Membership.

**Migration B — Policy (single append-only table; reconciled from earlier `Policy + PolicyValue` two-table draft)**

- Create `Policy` table (id, companyId, key, value JSON, category, setBy, setAt, previousValueSnapshot JSON?).
- Append-only by convention; no triggers needed (app enforces).
- Index: `(companyId, key, setAt DESC)` for current-value lookup.
- Seed: PolicyService (Stream C) loads default values per closure §3.6 catalogue on first run; no INSERT in this migration (schema-only PR).

**Migration C — Notification**

- Create `Notification` table (id, companyId, audienceUserId?, audienceWorkerId?, kind, channel, priority, payload JSON, scheduledAt, deliveredAt?, failedAt?, failureReason?, ackedAt?).
- Index: `(companyId, audienceUserId, deliveredAt DESC NULLS FIRST)` and `(companyId, audienceWorkerId, deliveredAt DESC NULLS FIRST)`.
- Note: keeps separate FK columns for User vs Worker because workers may not have a User row.

**Migration D — Digest**

- Create `Digest` table (id, companyId, audienceUserId, kind, periodStart, periodEnd, composedAt, body JSON, bodyText TEXT, deliveryChannel, deliveredAt?).
- Index: `(companyId, audienceUserId, composedAt DESC)`.

**Migration E — DWI additions (originContext + proposedDuringAbsence)**

- Add `DecisionWorkspaceItem.originContext JSON?` (NULL allowed; required at app layer for `tier=EMPLOYMENT`).
- Add `DecisionWorkspaceItem.proposedDuringAbsence BOOLEAN DEFAULT false`.

**Migration F — Worker.preferredLanguage**

- Add `Worker.preferredLanguage VARCHAR(8)` (default `'hi'` for now, tenant-overridable via Policy `worker.preferred_language_default`).
- Backfill existing rows from tenant default Policy value.

**Migration G — SiteSupervisorBinding.handoffPackage (folds into P1.5 binding migration if not yet shipped)**

- Add `SiteSupervisorBinding.handoffPackage JSON?` (NULL on first binding creation per site).
- If P1.5 binding migration hasn't shipped yet, fold this column into that migration. If it has, ship as a small alter.

**Migration H — QueueItem (optional table; default is projection)**

- **Default approach:** QueueItem is a VIEW / projection over (DWI WHERE status='PROPOSED') + (LeaveRequest WHERE state='REQUESTED') + (other actionable rows). No physical table at Layer 1.
- **Materialise only if performance demands** — defer the physical table until Layer 2 surfaces show pod-queue read latency issues.
- This migration creates the SQL view; no table.

**AuditEvent kinds (no migration; enum string append)**

- Add 15 new kinds to the AuditEvent.kind enum (closure §9 catalogue). String enum; no DB migration required since the column is `VARCHAR`. App-layer Zod validation extended.

## §4 Entity work — what to build per entity

For each entity below: where the code lives + what utilities are needed.

### HRPod

- Prisma model + Zod schema in `packages/shared-schema`.
- Backend routes: minimal CRUD for ops use (POST /hr-pods, PATCH /hr-pods/:id, GET /hr-pods). HR-only auth.
- No UI; admin-API only at Layer 1. Pod-CRUD UI lands at Layer 2.

### Membership.podId

- Migration adds the column. Existing `withTenantContext` queries continue to work (column is nullable).
- Add a `MembershipPodAssignmentService` utility that handles `assign(podId, membershipId)` + `reassign(podId, membershipId)` with audit emission (`MEMBERSHIP_POD_ASSIGNED` audit kind — add to enum).
- Defer auto-rebalance logic (when supervisor's portfolio crosses pod boundaries) to Layer 2.

### Policy (single append-only table; reconciled from `Policy + PolicyValue` two-table draft)

- Prisma model. Append-only writes enforced at the service layer.
- `PolicyService` utility: `get(companyId, key)` reads current value (latest row) with caching; `set(companyId, key, value, setBy)` writes a new row + emits `POLICY_CHANGED` audit.
- Cache: in-memory per-process with 60s TTL; invalidates on write within the same process; cross-process invalidation deferred (acceptable at single-instance launch).
- Seed defaults loaded by PolicyService on first run per closure §3.6 catalogue (no INSERT in PR 1 migration).

### Notification

- Prisma model.
- `NotificationService` utility: `schedule(audienceRef, kind, channel, payload, priority)` writes a row + enqueues the appropriate delivery handler.
- Delivery handlers: push (existing outbox `notifications.push`), SMS (new; uses Gupshup integration that exists for HR Updates), WhatsApp-out (new; same Gupshup), email (new; minimal SMTP wrapper). Each delivery handler updates the Notification row with `deliveredAt` / `failedAt` + audit emit.
- Channel fallback chain: app-layer wrapper attempts in order per Policy `notification.channel_fallback_chain` (default `['push', 'sms', 'whatsapp_out', 'email']`).
- Coalescing: per-kind rules in `NotificationCoalescingService`. Initial implementation handles the explicit coalescing pairs from closure §7 (multi-binding-same-supervisor-pair). Defer fancy ML-style coalescing.

### Digest

- Prisma model.
- `DigestComposerService` — per-kind composer functions (`compose_owner_monthly`, `compose_supervisor_while_you_were_out`, `compose_owner_incident`, `compose_hr_team_daily`).
- Reads source data from AuditEvent + QueueItem (view) + Notification rows.
- Renders both `body` (structured JSON) + `bodyText` (plain text for WhatsApp/SMS).
- Layer 1: stub composers that produce empty digests on a schedule (no real content). Real composers land in Layers 3 + 4 alongside the surfaces that need them.

### DWI additions

- Add fields via migration. Update `propose_*` chat tool extractors to populate `originContext` when `tier=EMPLOYMENT`.
- `proposedDuringAbsence` set via app-layer check at row creation (consult active acting bindings for the originating supervisor).

### Worker.preferredLanguage

- Migration + Zod schema update.
- Add to Worker invitation flow (HR sets at invite, or worker confirms on first login).
- Notification rendering picks language from this field.

### HandoffPackage

- Composed synchronously in the same transaction as Binding row creation.
- `HandoffPackageComposer.generate(outgoingSupervisorId, incomingSupervisorId, siteId, kind)` returns the JSON blob.
- Reads source data: outgoing supervisor's LivingDoc (filter by site), recent Complaints (90d), active Assignments at site, recent Visits + FLAGS, open DWI + CalendarEntry rows.
- Size cap per Policy `handoff.max_size_bytes` (default 100KB); truncation strategy per closure §3.7.
- Layer 1 lands the composer + the column. Layer 3 lands the surface to display it.

### AuditEvent enum extension

- Add the 15 new kinds (closure §9 catalogue) to the existing enum string.
- Update Zod schema for AuditEvent.kind.
- Add audit-emit helper functions for each kind (e.g., `auditBindingCreated(tx, ...)`, `auditHRFallbackInvoked(tx, ...)`).

## §5 Parallel work streams

7 streams, mostly parallelizable. Stream A is foundational; B–G can start once A's migrations are applied.

| Stream | Owner area                                          | Depends on                                              | Can start when                            | What it ships                                                                                                                                                          |
| ------ | --------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A**  | Schema migrations + AuditEvent enum + audit helpers | —                                                       | Day 0                                     | Migrations A–H applied; new audit emit helpers; Zod schemas                                                                                                            |
| **B**  | HRPod CRUD + Membership.podId service               | A                                                       | A is in main                              | HRPod model in shared-schema; admin-API routes; pod-assignment service                                                                                                 |
| **C**  | PolicyService + defaults seed (single Policy table) | A                                                       | A is in main                              | PolicyService with cache; seed defaults loaded on first run; admin-API for value reads                                                                                 |
| **D**  | Notification entity + delivery handlers             | A                                                       | A is in main                              | NotificationService; 4 delivery channels; coalescing service                                                                                                           |
| **E**  | Digest entity + stub composers                      | A, D                                                    | A + D in main                             | Digest model; stub composer functions; cron skeleton                                                                                                                   |
| **F**  | Cron framework + 4 shell jobs                       | A                                                       | A is in main                              | Cron framework (extending existing reset-ai-spend pattern); shell jobs for binding-expire-sweep, decision-expire-sweep, hr-queue-age-escalation, hr-availability-sweep |
| **G**  | HandoffPackage composer + DWI additions             | A, F (for SiteSupervisorBinding if P1.5 not yet merged) | A in main; P1.5 binding migration applied | HandoffPackageComposer; DWI.originContext + proposedDuringAbsence wiring in propose\_\* extractors                                                                     |

Streams B–G can run concurrently after A. The team can split B/C/D/E/F/G across 2–3 engineers.

## §6 Founder-pick gates

What's blocked by `[founder pick required]` items vs what proceeds.

| F-P                                          | Closure-spec item                                   | Blocks at Layer 1?                                      | Blocks at Layer 2+ |
| -------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------- | ------------------ |
| **F-P-1** Pod-size target (200/4 default)    | No — schema accepts any size                        | Yes — pod-aging / split-merge UI in Layer 2             |
| **F-P-2** SLA durations (2h / 24h / 7d)      | No — seed Policy values use defaults; rebal on pick | Partially — queue surfaces in Layer 2 use Policy values |
| **F-P-3** Termination appeal window (7 days) | No — Layer 4 only                                   | Yes — Layer 4 worker termination surface                |
| **F-P-4** Reverse window (5/30 hybrid)       | No — Layer 1 unaffected                             | Yes — D.1 implementation in Layer 3                     |
| **F-P-5** AI overage marketing language      | No — alert templates not in Layer 1                 | Yes — Layer 4 owner alerts                              |
| **F-P-6** Site-level HR Updates routing      | No — Policy structure accepts it; default disabled  | Yes — Layer 3+ if enabled                               |
| **F-P-7** Worker preferred-language default  | No — schema accepts; defaults to `'hi'` initially   | Optional refinement                                     |
| **F-P-8** Secondary owner emergency contact  | No — Layer 1 unaffected                             | Yes — Layer 4 owner emergency override                  |

**Verdict: Layer 1 has no founder-pick blockers.** Founder picks become gates for Layers 2–4 only. Layer 1 can start immediately on closure-spec approval; founder picks can resolve in parallel with Layer 1 build.

## §7 First implementation branch

**Branch name:** `feat/layer-1-core-primitives`

**Initial commit sequence (suggested PR breakdown):**

1. **PR 1 — schema-only.** All 8 migrations (A–H) + Prisma model changes in `packages/shared-schema` + Zod schema updates + AuditEvent kind enum extension. No business logic. Aim: green CI + Railway dev apply.
2. **PR 2 — Stream A complete.** Audit-emit helpers for all 15 new kinds. Tests for each helper (real-DB).
3. **PR 3 — Stream B (HRPod CRUD).** HRPod admin-API + pod-assignment service + tests.
4. **PR 4 — Stream C (Policy).** PolicyService + cache + seed defaults + admin-API for reads + tests.
5. **PR 5 — Stream D (Notification).** NotificationService + 4 delivery handlers + coalescing service + tests against real Gupshup test endpoint where available.
6. **PR 6 — Stream E (Digest).** Digest model + stub composers + cron wiring (cron jobs are shells; emit empty digests).
7. **PR 7 — Stream F (Cron framework).** Cron framework + 4 shell jobs. Jobs run on schedule and emit telemetry; no business logic yet (closure §10 logic lands in later layers).
8. **PR 8 — Stream G (HandoffPackage + DWI).** HandoffPackageComposer + DWI.originContext + proposedDuringAbsence wiring in chat extractors.

After PR 8: Layer 1 exit criteria met. Open a draft PR for Layer 2 plan (separate kickoff memo).

**Test approach:**

- **Real-DB tests** (existing pattern) for every service. Mock-only tests forbidden per feedback memory: real integration is the regression-safety primitive.
- **AuditEvent emission tests:** every new audit kind has a "fired correctly + payload shape correct" test.
- **Cron tests:** shell jobs verified to run on schedule + emit telemetry; no business logic to test yet.
- **Migration tests:** apply migrations to a fresh test DB + verify schema state; rollback path tested.

**Migration plan:**

- Develop migrations against dev Railway DB.
- After PR 1 merges to main, apply to staging Railway DB.
- Backfill steps (Membership.podId NULL for non-HR; Worker.preferredLanguage default) verified.
- Production migration window: scheduled after Layer 1 PRs are all merged + tested in staging. Founder approves the production migration window.

## §8 Out of scope for this kickoff

- Any Layer 2 / 3 / 4 work — separate kickoff memos.
- UI / surface work — Layer 1 is data + plumbing only.
- Founder picks resolution — proceeds in parallel; doesn't block Layer 1.
- Production rollout schedule — separate ops decision.
- Migration of existing tenants' HR users into pods — that's a Layer 2 one-time migration.

## §9 What "Layer 1 done" looks like

- All 8 migrations applied to staging + verified.
- All 15 new AuditEvent kinds emit correctly in real-DB integration tests.
- `PolicyService.get` / `set` works against staging.
- `HRPod` CRUD works via admin-API; pod-assignment service can move a Membership.podId.
- `NotificationService.schedule` produces a Notification row + delivery is attempted via the 4 channels.
- `Digest` rows can be inserted (stub composers); cron emits telemetry on schedule.
- `HandoffPackageComposer.generate` produces correctly-shaped JSON for a synthetic binding scenario.
- `DecisionWorkspaceItem.originContext` populates correctly on chat-tool extraction for EMPLOYMENT-tier proposals.
- `DecisionWorkspaceItem.proposedDuringAbsence` sets correctly when originator is inside an active acting window.
- 4 cron shell jobs run on schedule + emit telemetry.

**No surfaces. No worker app. No supervisor UI changes. No HR portal pages. No owner dashboard.** All of that is Layer 2+ work.

Once Layer 1 done, kickoff memo for Layer 2 (HR coordination surfaces) gets written.

---

_End of Layer 1 implementation kickoff memo. Source of truth for picks + entities + rules: `docs/specs/2026-05-15-workflow-design-closure.md`. This memo is purely about sequencing; design decisions are not reopened here._
