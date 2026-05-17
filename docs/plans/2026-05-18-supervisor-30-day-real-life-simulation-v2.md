# 30-Day Real-Life Supervisor Simulation — Plan v2 (REVISED)

**Date:** 2026-05-18
**Author:** Claude (Opus 4.7, 1M ctx) under founder direction
**Status:** DRAFT — awaiting founder approval before any code change
**Supersedes:** `2026-05-18-supervisor-30-day-real-life-simulation-v1-DRAFT.md` (kept for trace)
**Master plan §:** §G (supervisor surface) + §H (open questions) + §P.4 (replacement-invite)
**Composes with locks:**

- `feedback_40_year_team_world_domination_quality_bar.md` (2026-05-18)
- `feedback_testing_method_devtools_railway_logs.md` (2026-05-18)
- `feedback_root_cause_first_walkthrough_pattern.md` (2026-05-18)
- `feedback_play_store_quality_no_lag_no_jank.md` (2026-05-18)
- `feedback_no_self_service_resign_or_terminate.md` (2026-05-18)
- `feedback_make_it_exist_dont_defer.md`
- `feedback_production_grade_workflow_rules.md` (P1–P10)
- `feedback_confidence_score_before_acting.md` (≥90% own / ≥95% research)

---

## 1. Goal (recap)

End the simulation with **zero "coming soon" placeholders, zero no-op buttons, zero empty editor screens, zero missing workflows** that a 30-day Hyderabad supervisor would hit. Target customer: 2,000-employee FM companies; the seed must reflect that scale even if the sim is run from one supervisor's POV.

## 2. Inputs (now 4 research artefacts on disk)

- `docs/research/supervisor-30day-scenarios.md` — 70 numbered scenarios, Day 1-30 chaos calendar
- `docs/research/supervisor-feature-matrix.md` — original audit (4 visible gaps)
- `docs/research/supervisor-deep-gap-audit.md` — **47 gaps**, P0=18, P1=17, P2=12, 5 cluster themes
- `docs/research/replacement-invite-feature-spec.md` — full spec for F28 (the PUBG-invite pattern)
- `docs/research/supervisor-drawer-and-decisions-redesign.md` — drawer 3-band redesign + Decisions queue UNION ALL builder + chat-to-complaint flow

## 3. The five root clusters → five build waves

Per `feedback_root_cause_first_walkthrough_pattern.md`: fix at the root, not the symptom. Each wave below corresponds to ONE root cluster. Symptoms unblock as a side effect.

### Wave 1 — Replacement Picker (F28) — root cluster #1

**The single highest-leverage build in the codebase.** Unblocks 8 features (SiteActionSheet "Send replacement", multi-day leave, swap decide, push wakeup, festival planner, skill-mismatch flow, chat-amend "send replacement", Today→worker-row "find cover").

Backend:

- New Prisma model `ReplacementInvite` per master plan §P.4 (id, fromSupervisorId, toWorkerId, visitId, siteId, scheduledStart, status [PENDING/ACCEPTED/DECLINED/EXPIRED], sentAt, expiresAt, respondedAt, respondReason). Index on (status, expiresAt) for cron sweep.
- Migration `008_replacement_invite.sql` with rollback note.
- New routes: `POST /supervisor/replacement-invites` (creates N invites, one per candidate, all linked to same `groupId`); `POST /worker/replacement-invites/:id/accept` (atomic `UPDATE … WHERE status='PENDING'` so only first-accept wins); `POST /worker/replacement-invites/:id/decline`; `GET /supervisor/replacement-invites?status=…`
- State-machine transitions in `packages/state-machines/`
- Cron sweep `replacement-invite-expiry` every 30s (cheap), marks `PENDING → EXPIRED` past `expiresAt`. Owner + on-call alert threshold in doc.
- OneSignal push on invite-sent (fan-out to N candidates) + on first-accept (notify supervisor + non-winners).

Mobile:

- `(supervisor)/replacement-picker.tsx` (R6 reference: `replacement-picker.jsx` 235 LOC)
- `(supervisor)/multi-day-leave.tsx` (R6 reference: `multi-day-leave-screen.jsx` 190 LOC)
- `lib/queries/use-replacement-invites.ts` (list + send + cancel mutations)
- Live 2-minute countdown timer on the supervisor side (Reanimated, no JS-thread blocking)
- Wire into: Today worker-row long-press → "Find replacement", SiteActionSheet "Send replacement", Swap decide "Reject + auto-broadcast"
- Drawer entry: "Replacement Invites" with badge count of `PENDING` outcomes

Quality:

- Race condition tests (3 workers tap Accept within 100 ms — exactly one wins)
- 2-min countdown verified at 4× CPU throttle + Slow 3G
- Push fanout latency < 5 s P95 via OneSignal
- Confidence 95% spec, 85% state machines, 75% UI (R6 prototypes are 235 LOC of detail)

### Wave 2 — Decisions queue full spec — root cluster #2

**Foundational.** Every approve/reject/decide in the app passes through Decisions. Currently a stub of its locked 4-tier spec.

Backend:

- `buildDecisionsForSupervisor` becomes a `UNION ALL` across 5 sources:
  - `SupervisorDecision` (existing)
  - `LeaveRequest WHERE state='REQUESTED'`
  - `SwapRequest WHERE state='SENT'`
  - `ReplacementInvite` open outcomes (PENDING / ACCEPTED-this-turn / EXPIRED-no-accept)
  - `ComplaintMessage` rows where `authorRole='HR' AND readByActor IS NULL`
- Return shape: `actions[]` array per row drives mobile button rendering (TwoButton / TwoButtonWithWarning / InfoOnly / InfoOnlyWithAck5 / TypedPhraseConfirm)
- 4 new `decisionKind` values in `packages/shared-schema/src/zod/supervisor-decision.ts`: `LEAVE_APPROVAL_PENDING`, `SWAP_REQUEST_PENDING`, `REPLACEMENT_INVITE_OUTCOME`, `COMPLAINT_HR_REPLY`
- Wire each to its existing POST endpoint (`/leave-requests/:id/approve`, `/swap-requests/:id/decide`, etc.)

Mobile:

- `DecisionCard.tsx` extended with 4 new footer variants
- Tier-specific patterns (per audit cluster #2): NOTE-tier "site rule vs working note" radio, PERSONNEL-tier multi-day sub-card, AmbiguousDecisionCard radio variant, HeavySummaryCard "Open to decide" pattern, Amend-mode banner
- Deep-link support: `/(supervisor)/decisions?focus=<id>` scrolls + flash-highlights matching card (driven from drawer entries)
- EMPLOYMENT typed-phrase confirm stays only for `TERMINATE_WORKER`-class actions

Six open panel questions raised in drawer-redesign doc (top: merge `APPROVE_LEAVE` SupervisorDecision with new `LEAVE_APPROVAL_PENDING`? — recommend YES; chat-fired complaints also create a SupervisorDecision row? — recommend YES for amend-ability).

Confidence 92%. Composes with replacement-invite (Wave 1 must land first).

### Wave 3 — Chat surface upgrade — root cluster #3

Voice-text-only today. Adds intent classifier + tool-loop expansion.

Backend `apps/backend/src/routes/chat.ts`:

- OpenAI tool-loop gains `propose_log_complaint(siteId, severity, kind, description)` tool
- System prompt extended with intent-classifier rubric: distinguish `mark_absent` (existing) vs `log_complaint` (new) vs `request_leave_decision` (new wrapper for leave-request decisions invoked via chat) vs `general`
- `log_complaint` flow: tool extracts site/severity/kind/description → backend creates `Complaint` row → outbox `hr.site_complaint` fires (existing) → returns confirmation bubble: _"Logged complaint at Aparna · LOW · photo mismatch · sent to HR for review."_
- New `propose_amend(targetDecisionId, …)` tool for chat-driven amendments
- Photo attach: `POST /chat/messages` accepts `attachments: { type: 'image', url }[]` (uses existing S3-signed-URL pipeline; CDN slice still deferred but signed-URL fetch works)
- Live transcription overlay (Whisper streaming) — partial transcripts as user holds mic
- AI-paused-until consumer state for long async tools

Mobile `apps/mobile/app/(supervisor)/chat.tsx`:

- Photo attach button → `expo-image-picker` → uploads to S3
- Amend mode banner ("Editing decision: Mark Anjali absent — replace?")
- Live transcript shimmer while recording
- Complaint confirmation bubble renders inline with deep-link to drawer Complaints tab

Schema additions (Prisma):

- `Complaint`: add `kind` (enum: photo_mismatch / missed_area / attitude / theft_accusation / hygiene / noise / damage / gate_pass / other), `state` (OPEN / IN_HR / RESOLVED / DISMISSED), `unreadHrReplies` (int)
- new `ComplaintMessage` model (id, complaintId, authorUserId, authorRole, body, attachments, createdAt, readByActorAt)
- Migration `009_complaint_threading.sql`

Confidence 88% (AI intent classification has language-mix risk — Hindi/Telugu/English mix in supervisor speech).

### Wave 4 — Compliance / proof flow — root cluster #4

Small + high-visibility fixes.

Mobile:

- FlaggedReviewSheet: remove `disabled`, wire Resolve → `POST /visits/:id/resolve`; Reject → `POST /visits/:id/reject` (typed-phrase confirm)
- Activity Reverse: within 30 min → `POST /activity/:id/reverse`; beyond → `POST /activity/:id/soft-flag`
- Soft-flag becomes a real `COMPLAINT_HR_REPLY`-style decision card for HR (no longer silent-fail)

Backend:

- `POST /visits/:id/resolve` and `/reject` (likely partial — verify, complete if needed)
- `POST /activity/:id/reverse` — compensating AuditEvent + undoes underlying state for supported kinds (WORKER_MARKED_ABSENT, LEAVE_APPROVED, ASSIGNMENT_CREATED)
- `POST /activity/:id/soft-flag` — creates `SupervisorDecision` of new kind `LATE_REVERSAL_REQUEST` visible to HR (when HR portal lands)

Out of scope (explicit deferral with sunset):

- Photo CDN slice (sunset: Wave 8, by 2026-06-15) — Resolve/Reject works without inline thumbnails
- Offline queue (sunset: separate engineering effort, no calendar date)

Voice waveform duration + transcription confidence wired to real metadata in the same wave (small).

Confidence 94%.

### Wave 5 — Editor surfaces (the unusable cluster) — root cluster #5

The biggest scope of the v2 plan. The audit's finding — "supervisor can OBSERVE the day but cannot CONFIGURE the world" — explains your "most features unusable" instinct.

Mobile + backend:

- **Drawer redesign** (per `supervisor-drawer-and-decisions-redesign.md`): 3 bands — INBOX (Leave Requests, Swap Requests, Replacement Invites, Complaints — all NEW; each is a read-only feed screen with badge count, deep-links into Decisions queue), WORKSPACE (Sites, Memory & Rules, Summary, Updates), PERSONAL (Profile, Language, Notifications, Sign Out).
- **Memory & Rules** → real CRUD: add/edit/delete site-scoped rules, worker-scoped notes, global supervisor reminders. Backend: `POST /memory`, `PATCH /memory/:id`, `DELETE /memory/:id`, `GET /memory?siteId=…&workerId=…`. New `MemoryEntry` Prisma model.
- **Calendar route**: wire `GET /supervisor/calendar` to mobile (per master-plan §G). Month + week view, festivals overlay, leave overlay, expected client audits.
- **Site rules CRUD**: list rules per site, add/edit (e.g., "No mopping past 10 PM on floor 4"), enforce client by client.
- **Gate-pass / ban list schema**: new `WorkerSiteBan` model + `GatePassExpiry` field on Membership.
- **5 new read-only INBOX feed screens**: each `(supervisor)/inbox/leave.tsx`, `/swap.tsx`, `/replacement.tsx`, `/complaints.tsx`, plus an existing `/sites.tsx` reused.
- **Push permission deep-tune**: prompt-state stored in backend not local (so device switch retains the answer).

Confidence 87% (multi-screen scope; some sub-builds will surface follow-ups during build).

### Wave 6 — Multi-tenant scale seed

Founder direction: "we sell this for minimum 2k employee company only."

Seed strategy for the sim:

- **3 tenant Companies**, each modelling a different FM-company archetype:
  - **Tenant 1 — "Surya FM Services Pvt Ltd"** (Suresh's company, sim's primary POV): 12 supervisors, 3 HR, 1 admin, 500 workers, 25 sites, west Hyderabad. Suresh is supervisor #1; he sees 38 workers across 10 sites (the chaos-calendar persona).
  - **Tenant 2 — "BVI Facilities Bangalore"** (mid-scale): 8 supervisors, 2 HR, 1 admin, 320 workers, 18 sites, Bangalore. Used to verify cross-tenant isolation (Suresh should NEVER see BVI data).
  - **Tenant 3 — "Zenith FM Mumbai"** (target customer scale): 50 supervisors, 8 HR, 3 admins, 2,100 workers, 140 sites, Mumbai. Used to verify scale-list performance (Decisions queue with 200 pending items, Today with 50 sites, Activity with 10k events).
- **Workers, sites, supervisors, HR, admins** named with realistic Indian first+last names per region.
- **30-day deterministic event stream** seeded under Suresh-on-Tenant-1 per the chaos calendar (Day 1 = 2026-05-19 Mon). All 70 scenarios fire on their scheduled day.
- Idempotent script `apps/backend/prisma/seed-30day-sim.ts`. Single transaction. Re-run resets to Day 0.
- Runs against Railway sandbox DB.

Validations:

- Cross-tenant SELECT for Suresh's `/supervisor/today` returns 0 rows from Tenant 2 + Tenant 3 (real-DB test, P0 from prior multi-tenant locks)
- Tenant 3 Decisions queue load time < 800ms P95 at 200 pending items
- Today list FPS ≥ 55 at 50 sites with FlatList + React.memo

Confidence 95% on design, 80% on perf targets (will tune during walkthrough).

### Wave 7 — Walkthrough (root-cause-first per `feedback_root_cause_first_walkthrough_pattern.md`)

**Phase 1 — Full pass, no fixes:**

- Days 1-30 sequentially via Chrome DevTools at iPhone 14 mini (390×844), 4× CPU throttle, Slow 3G half the days.
- Every screen / button / sheet that the scenario calendar invokes on that day.
- DevTools surfaces in active use per `feedback_testing_method_devtools_railway_logs.md` (Elements / Console / Network / Sources logpoints / Performance / Memory / Application / Rendering / Lighthouse).
- Railway logs streaming in parallel.
- Every bug / ugly state / unexpected behaviour logged to `docs/findings/2026-05-18-walkthrough-symptoms.md` — `Day · Screen · Action · Symptom · Severity`. NO fix-as-found.

**Phase 2 — Cluster:**

- Sort symptoms by likely shared root cause. Apply the common cluster patterns:
  - null-data crashes → shared empty-state contract
  - no-op button family → prop-drilling / route gap
  - hardcoded copy storm → missing i18n keys
  - slow scroll → FlatList / memo missing
  - wrong data after refresh → query-invalidation key missing
  - state persists across role switch → on-app-logout cleanup hook
  - decisions don't update → optimistic-update / event-source wiring

**Phase 3 — Fix at root:**

- One root-level fix per cluster. Verify by re-running the affected screens. Document each cluster: "shared root cause + one fix → resolved N symptoms".
- Single-symptom bugs fixed last.

### Wave 8 — Adversarial panel + findings memo + ship

Per `feedback_adversarial_panel_at_wave_end.md` + `feedback_done_memo_requires_spec_coverage_matrix.md`:

- Adversarial panel: surface every "what if" we missed.
- Findings memo `docs/findings/2026-05-18-supervisor-30-day-sim.md` — cluster analysis + spec coverage matrix.
- One commit per wave; one PR per wave. Final PR ties them together.

## 4. Parallelization plan

Sonnet subagents for execution per `feedback_token_efficiency_delegate_sonnet.md`; Opus orchestrates.

**Sprint 1 (parallel batch 1) — heavy backends in parallel:**

- Subagent W1-back: Wave 1 backend (ReplacementInvite model + migration + 4 routes + state machine + cron)
- Subagent W2-back: Wave 2 backend (Decisions UNION-ALL builder + 4 new kinds + actions[] array)
- Subagent W3-back: Wave 3 backend (chat intent classifier + propose_log_complaint tool + Complaint/ComplaintMessage schema + outbox wiring)

**Sprint 2 (parallel batch 2) — mobile screens in parallel, after Sprint 1's contracts land:**

- Subagent W1-mob: Wave 1 mobile (ReplacementPicker + MultiDayLeave + Today wiring)
- Subagent W2-mob: Wave 2 mobile (DecisionCard footer variants + deep-link)
- Subagent W3-mob: Wave 3 mobile (chat amend + photo attach + live-transcript)
- Subagent W4: Wave 4 (Compliance flow — small enough to one-shot)

**Sprint 3 (sequential) — bigger scope:**

- Wave 5 (editor surfaces) — too large for one subagent; split into drawer/Memory/Calendar/Site-rules/Gate-pass sub-agents in parallel
- Wave 6 seed
- Wave 7 walkthrough (linear single agent, can't parallelise the bug-collection phase)
- Wave 8 panel + memo

Opus integrates between sprints, runs typechecks + lint + DevTools smoke + Railway-log check, fixes conflicts.

## 5. Discipline gates per wave

- **Confidence score ≥90%** stated in commit message; **≥95%** for research-derived choices
- **Typecheck clean** on apps/mobile + apps/backend + packages/shared-schema + packages/state-machines
- **Real-DB tests pass** for every new backend route (`pnpm --filter @axhy/backend test:db`)
- **DevTools-verified** for every UI change (screenshot of DevTools surface proving the fix in PR description)
- **Railway-log-verified** for every backend change (log excerpt in commit message)
- **No new `any`. No new TODO. No new "coming soon". No new no-op buttons. No abbreviated names.**
- **Spec coverage matrix** in each wave's done-memo
- **Panel review** end of Wave 2, Wave 5, Wave 7
- **Cross-tenant isolation test** for any new backend route (Suresh on Tenant 1 cannot see Tenant 2/3 data)

## 6. Out of scope (explicit, with sunset dates)

- **Photo CDN slice** — Resolve/Reject works without inline thumbnails. Sunset: 2026-06-15.
- **Offline queue** — supervisor sim runs online. No calendar date; flagged in findings.
- **GPS-spoof velocity check** — scenario #76 stays as a note. No calendar date.
- **Advance request** — founder deferred 2026-05-18. Backlog.
- **SOS/Crisis escalation** — founder deferred 2026-05-18. Backlog.
- **Worker mobile** — Phase D, separate sprint.
- **HR portal** — separate sprint. Chat-routed complaints + decisions sit in the queue; HR sees them when their app ships.
- **Owner mobile** — Phase E.
- **OneSignal delivery webhooks** — we trust delivery for sim purposes.

## 7. Risk register

| Risk                                                                | Likelihood             | Mitigation                                                                                                                                                           |
| ------------------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wave 1 race condition not bulletproof (3-worker tap-Accept)         | medium                 | DB-level `UPDATE … WHERE status='PENDING' RETURNING` for atomicity; load test in CI                                                                                  |
| AI intent misclassifies Hinglish "absent kar do" vs "complaint hai" | high                   | Few-shot prompt with 30 real Hyderabad supervisor phrases; clarifying-question fallback; confidence < 0.7 → ask supervisor "you mean: mark absent OR log complaint?" |
| Tenant 3 scale seed slow (2,100 workers + 140 sites + 10k events)   | medium                 | Bulk-insert via Prisma `createMany`; chunk to 1k rows                                                                                                                |
| Wave 5 scope (editor surfaces) > 1 sprint                           | high                   | Split into 5 parallel sub-agents; defer gate-pass if needed                                                                                                          |
| Cross-tenant data leak via new routes                               | low (covered by tests) | Multi-tenant isolation test mandatory in every wave                                                                                                                  |
| Walkthrough turns up bug that has no clean root cause               | medium                 | Single-symptom fix is fine; document why no cluster                                                                                                                  |
| 30-day sim exposes UX so broken founder loses confidence            | low                    | Cluster-first fix pattern means surface looks more broken mid-pass than at end — communicate this expectation up front                                               |

## 8. Decisions for founder

1. **Approve this v2 plan** — or ask for changes.
2. **Wave 5 scope** — build ALL of (Drawer + Memory&Rules + Calendar + Site-rules + Gate-pass), or cut Gate-pass / Calendar to a Wave 9?
3. **Multi-tenant seed scale** — 3 tenants as proposed, or only Tenant 1 (Suresh's) for sim simplicity? (Tenant 2 + 3 still useful for isolation tests even if Suresh's POV doesn't touch them.)
4. **AI intent-classifier clarifying-question UX** — confidence <0.7 surfaces a "did you mean…?" chip in chat, OR proceeds with best guess + supervisor can amend?
5. **Sprint cadence** — three sprints back-to-back (~2-3 weeks of build), or pause for founder review between each sprint?

---

**Recommended go path:**

- Approve Waves 1-7 inline.
- Run Sprint 1 backends in parallel (3 subagents) **now**.
- Pause after Sprint 1 for backend-contract review.
- Then Sprint 2 mobile parallel.
- Then Sprint 3 sequential (seed → walkthrough → memo).
- Single 2-3 week build; review between sprints; ship at end as one consolidated release.
