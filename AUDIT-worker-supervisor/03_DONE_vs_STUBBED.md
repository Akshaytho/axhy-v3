# 03 — Truly Implemented vs Stubbed/Missing (per slice)

> Honest built-vs-stub inventory verified against code.

## S1-supervisor-today

**Truly implemented:**

- GET /supervisor/today backend route with full Zod validation (supervisor-today.ts:28, TodayResponse schema validated at today-service.ts:310)
- buildTodayForSupervisor service composing portfolio + worker state derivation (today-service.ts:120)
- getSitesSupervisedByUser reverse query with ACTING-over-PERMANENT precedence (effective-responsibility.ts:172, test verified in supervisor-today.test.ts:4)
- deriveWorkerState with on_site/late/no_show/on_leave/pending logic (today-service.ts:331, using ON_SITE_VISIT_STATES constant and LATE_THRESHOLD_MINUTES=15)
- Late detection: IN_PROGRESS visit startedAt > 15 min after Assignment.shiftStart (today-service.ts:337-341, verified in audit scene 10)
- dayMaskMatchesIndex honoring per-day roster masks for workersDue count (today-service.ts:318-321, locked per §5.9)
- Flagged visits derivation from Visit.flagged=true (today-service.ts:146-188, 299-308)
- UrgencyBanner renders only when pulse.late > 0 OR flagged > 0 (UrgencyBanner.tsx, verified in audit scene 1-3)
- FloorPulse 3-metric tile (ON SITE / LATE / PENDING) server-computed (today-service.ts:290-296)
- SiteCard collapsed-by-default, tap-to-expand locked per R6 (today.tsx:132-141, SiteCard.tsx:106-109)
- MarkAbsentSheet UI with 4 reason chips, POST /workers/:id/mark-absent (MarkAbsentSheet.tsx:25-136, workers.ts:38-113)
- assertCallerSupervisesWorker cross-supervisor 403 rejection Q2=B (attendance-service.ts:87-97, test verified in mark-absent.test.ts)
- Attendance upsert with payDeductPaise computed from baseSalaryPaise (attendance-service.ts:115-132, ADR-0025)
- AuditEvent recording for WORKER_MARKED_ABSENT (attendance-service.ts:134-146)
- Outbox enqueuing hr.worker_absent + payroll.recompute (attendance-service.ts:148-168)
- Query invalidation on MarkAbsentSheet success (MarkAbsentSheet.tsx:59, uses useInvalidateToday hook)
- Empty portfolio 'No sites yet' card (today.tsx:121-128, verified in audit scene 5)
- Profile view with name + role (me.tsx, verified in audit scene 77)
- Sign out functionality (me.tsx, verified in audit scene 81)
- Decisions tab honest shell with 'All caught up' empty state (decisions.tsx, verified in audit scene 25)
- Activity tab honest shell with Today/Yesterday/This week/All sites filter chips UI (activity.tsx, BUT chips not wired to backend)
- R6 5-tab order Today/Decisions/Activity/Chat/Profile (\_layout.tsx:57-155, verified in done-memo spec coverage)
- MicFAB hidden on Profile and Chat per R6 (\_layout.tsx:84, MicFAB.tsx)

**Stubbed / missing / not wired:**

- Activity tab filter chips (date/site/kind) are visual-only; no backend query params implemented (activity.tsx renders chips but no GET /supervisor/activity route with ?date=|?siteId= params exists)
- LAST SYNCED stale-cache banner missing from Activity (R6 spec line 30-31 calls for 'LAST SYNCED {N} MIN AGO'; not implemented)
- Chat R6 surface incomplete: no 55% opacity dimming on older bubbles (chat.tsx; R6 spec line 79 r5 iteration note)
- Profile language picker not wired (me.tsx:156 has TODO comment; no setLocale() call on selection)
- Profile notification prefs toggle not wired (me.tsx; no backend POST /me/notification-prefs)
- Profile switch-company flow stub only (me.tsx skeleton; no multi-tenant company picker implemented; routes to single company's context)
- FlaggedReviewSheet Resolve/Reject buttons misleadingly described as 'fully wired' in code comments (FlaggedReviewSheet.tsx:1-10) but no backend routes /visits/:id/resolve or /visits/:id/reject exist
- GET /supervisor/decisions backend route does not exist (Decisions tab is an honest shell, routing slice paused)
- Activity REVERSE write path (POST /activity/:id/reverse) missing; routes listed as pending routing slice (activity.tsx calls useRejectFlaggedVisit which maps to non-existent route)
- Offline mode / queued-action UI not implemented (audit scene 15, 116 marked FAIL; no offline cache layer)
- Worker mobile not built (Phase D; affects cross-persona ripples for mark-absent → worker SMS, binding-change banner, termination appeal)
- HR portal missing (HRPod queue, appeals, bootstrap-seed UI, KPI dashboard all deferred)
- Cron jobs not wired (binding-expire-sweep, hr-queue-age-escalation, owner-monthly-digest; affect escalation scenes)
- Schema timestamp columns for FLAGGED/CANCELLED/ARCHIVED Visit transitions missing (migration needed but out of scope per done-memo line 69)
- packages/api-client regen to pick up new routes (low-priority cleanup; mobile uses apiFetch directly)
- 2K-worker tenant scale test not run (done-memo line 71; p95 < 500ms claim unverified)

## S2-decisions

**Truly implemented:**

- Mobile Decisions tab UI — page loads, fetches /supervisor/decisions, groups by section, renders cards (decisions.tsx:90-259, DecisionCard.tsx)
- Backend GET /supervisor/decisions route — parses pagination query, calls buildDecisionsForSupervisor, returns DecisionsResponseT (supervisor-decisions.ts:48-92)
- Decisions queue builder — UNION-ALLs supervisorDecisionSource + leaveRequestSource + swapRequestSource, pagination via cursor, 48h auto-dismiss (decisions-service.ts:322-426)
- SupervisorDecision source — loads PROPOSED rows, routes by origin/portfolio/worker-primary-site (439-496)
- LeaveRequest source — loads REQUESTED leaves, projects as LEAVE_APPROVAL_PENDING with [Approve, Reject] actions (575-656)
- SwapRequest source — loads SENT swaps, projects as SWAP_REQUEST_PENDING with [Accept, Reject + Accept-anyway] actions (697-779)
- POST /supervisor/decisions/:id/dismiss route — race-safe updateMany, emits audit, returns 200 (supervisor-decisions.ts:97-152)
- POST /decisions/:id/apply adapter route — reads SupervisorDecision, reconstructs ApplyDecisionCardInput, forwards to /chat/apply via inject (supervisor-decisions.ts:172-260)
- EMPLOYMENT typed-phrase confirm — EmploymentTypedPhraseFooter input gate-keeps Apply (DecisionCard.tsx:434-482)
- Deep-link ?focus=<id> navigation — desktop-link highlights card with amber flash, scrolls to index (decisions.tsx:131-154, useFlashHighlight:213-226)
- Amend-mode banner ?amendDecisionId=<id> — renders amber 'Amending decision' banner when row.amendable=true (DecisionCard.tsx:310, 327-331)
- Server-driven actions[] contract — actions render in order, requiresConfirm gates submission, body merges user-typed reason (DecisionCard.tsx:378-380, use-decision-action.ts:56-92)
- Idempotency-Key header — generated per action tap, required for /decisions/:id/apply (use-decision-action.ts:83, supervisor-decisions.ts:215-221)

**Stubbed / missing / not wired:**

- FAILED_REVIEW section source — no visitFlaggedSource wired (decisions-service.ts:851 comment: 'no rows land there yet'); flagged Visit rows cannot surface in Decisions queue
- Visit flagged-review sheet — FlaggedReviewSheet component renders disabled (per 2026-05-17 audit doc, scene 4, 108-110); Resolve/Reject write paths not wired
- LeaveRequest approve/reject endpoints — supervisor-decisions.ts wires actions with endpoints /leave-requests/:id/approve + /reject (decisions-service.ts:620, 630), but no verification these routes exist elsewhere
- SwapRequest decide endpoint — supervisor-decisions.ts wires actions with endpoint /swap-requests/:id/decide (line 730), but route must exist in dedicated file
- Dismiss reason collection — mobile use-decisions.ts:41 passes empty body {}, violating reason: required schema; route falls back to synthetic '(no reason given)' (supervisor-decisions.ts:129)
- FAILED_REVIEW reads — no backend service loads flagged Visit rows (no visitFlaggedSource in builder)
- Flagged visit routing — no logic maps flagged visits to supervisor queues via site-binding

## S3-chat-ai-livingdoc

**Truly implemented:**

- Voice capture + transcription confidence (chat.tsx:242-246, formatDuration, toConfidenceTag)
- Photo attachments S3 signed-URL upload, MAX_ATTACHMENTS_PER_MESSAGE=4 (chat.tsx:273-352)
- Amend mode banner + intent threading (chat.tsx:204-436, passed to sendChatMessage)
- Complaint confirmation bubble origin='CHAT' (chat.tsx:627-633, ComplaintConfirmationBubble)
- Clarify chips for propose_clarify (chat.tsx:635-641, ClarifyChips)
- Idempotency-key guard, cached response short-circuit (chat.ts:563-587, checkIdempotency)
- Rate limiting 30 msgs/60s per supervisor (chat.ts:590-606, Redis-backed)
- OpenAI circuit breaker (chat.ts:609-624, assertCircuitClosed→503)
- Daily token cap 50000/day per supervisor (chat.ts:748, checkSupervisorTokenCap→429)
- Company rules Layer 1 + HR rules Layer 2 from Policy (chat.ts:803-804)
- LivingDoc ACTIVE rules filtered, version for cache bust (chat.ts:801, coerceSection filtering)
- Prompt injection defense DATA-block wrapping (chat.ts:74, composeAmendBlock, PROMPT_INJECTION_DEFENSE_SENTENCE)
- Rule hierarchy 3-tier (system > Company > HR > LivingDoc, chat.ts:942-951)
- Semantic context pgvector cosine + decision boost + recency (semantic-context.ts:463, searchSemanticTurns:240-325)
- Semantic miss threshold 0.65 (semantic-context.ts:61, maxSimilarityScore tracked)
- Entity hints stub (semantic-context.ts:423, Phase 4 deferred)
- Kill switch fallback (semantic-context.ts:481, SEMANTIC_CONTEXT_KILL_SWITCH='true')
- Embedding pipeline fire-and-forget (chat.ts:1362, embedTurnAsync non-blocking)
- Turn embeddings schema + HNSW index (migration 016, vector cosine ops)
- Backfill script for existing chat (backfill-turn-embeddings.ts, 275 LOC)
- Atomic persist (chat.ts:387, withTenantContext tx)
- Decision card batch for compound utterance (chat.ts:524-532)
- Help short-circuit (chat.ts:651-684, HELP_TRIGGERS set)
- Reload context 3/day counter IST midnight (reload-context-counter.ts, POST route)
- Concurrency semaphore 50 max (chat.ts:688, Redis ZSET)
- Policy write ACL (policy-write-acl.ts PREFIX_ACL, policy-service.ts:56)

**Stubbed / missing / not wired:**

- Entity hints full resolution deferred Phase 4 (semantic-context.ts:414, returns generic text not actual names)
- RLS policy on turn_embeddings not applied (semantic-context.ts:200, only app-layer filtering)
- Cascade-delete FK turn_embeddings→ChatMessage not wired (migration 016 has no FK constraint)
- Anonymization stub only (turn-embedder.ts:anonymizeTurnEmbeddings is 10-LOC no-op)
- Backfill not run on production (handoff memo:143 'awaiting founder review')
- Topic-hint field in turn_embeddings populated but code empty (migration 016 schema vs logic)
- LIVING_DOC_RULE_AUTO_EXPIRED audit emitted but no explicit 'EXPIRED' state (living-doc-cap.ts)
- Monitoring metrics for semantic quality deferred (vector-rag-context-assembly.md §14)

## S4-activity

**Truly implemented:**

- Activity tab renders 50 events from GET /supervisor/activity (activity.tsx:1125-1141)
- Filter chips for date (Today/Yesterday/This week) wired to backend (activity.tsx:889, use-activity.ts:49, supervisor-activity.ts:68-71)
- Filter chips for site (All sites + bound sites) wired to backend (activity.tsx:900-908, 1070, use-activity.ts:50, supervisor-activity.ts:75)
- Filter chips for kind (All actions/Absences/Lates/Leaves) wired to backend (activity.tsx:849-854, use-activity.ts:51, supervisor-activity.ts:78-81)
- Row expansion drawer with Share to WhatsApp + Reverse buttons (activity.tsx:325-374)
- Share to WhatsApp deeplink with composed message (activity.tsx:123-127, 945-947)
- 30-minute reverse window guard on client (activity.tsx:111-113) and server (activity-reverse-service.ts:140-143)
- Typed-phrase confirmation (REVERSE) for in-window reversal (activity.tsx:439-560)
- Soft-flag modal for beyond-window actions (activity.tsx:580-673)
- POST /activity/:id/reverse route with WINDOW_CLOSED, KIND_NOT_REVERSIBLE, ALREADY_REVERSED guards (activity.ts:45-142)
- POST /activity/:id/soft-flag route creating LATE_REVERSAL_REQUEST SupervisorDecision (activity.ts:145-223)
- Reverse compensation for WORKER_MARKED_ABSENT: Attendance deletion + ATTENDANCE_REVERSED audit (activity-reverse-service.ts:167-217)
- Reverse compensation for LEAVE_APPROVED: LeaveRequest revert + LEAVE_REVERSED audit (activity-reverse-service.ts:219-273)
- Reverse compensation for ASSIGNMENT_CREATED: Assignment termination + ASSIGNMENT_REVERSED audit (activity-reverse-service.ts:275-333)
- Reverse compensation for REPLACEMENT_INVITE_ACCEPTED: Assignment termination + ASSIGNMENT_REVERSED audit (activity-reverse-service.ts:335-406)
- Activity feed invalidation on reverse/soft-flag success (use-activity-reverse.ts:83, 104)

**Stubbed / missing / not wired:**

- Dispatcher handlers for inverse-notification topics (worker.absence_cleared, worker.leave_reverted, worker.assignment_terminated_by_supervisor, worker.cover_invite_reversed) — enqueued in activity-reverse-service.ts but NOT registered in dispatcher/handlers/registry.ts:29-46
- HR portal surface to review LATE_REVERSAL_REQUEST SupervisorDecision rows — backend creates them but no UI exists
- Success toast/confirmation feedback when reverse/soft-flag mutation completes — no user-facing confirmation
- LAST SYNCED stale-cache banner mentioned in scenarios doc but not implemented in activity.tsx
- Pagination beyond 50 events — supervisor-activity.ts defaults to limit=50, no cursor pagination for older activity

## S5-coverage-people-ops

**Truly implemented:**

- ReplacementInvite routes (send, accept, decline, cancel, list) with 2-min TTL and conditional UPDATE race protection (replacement-invites.ts:89-367 + replacement-invite-service.ts:133-236+)
- Swap request creation with supervisor portfolio gate via getSitesSupervisedByUser (swap-requests.ts:74-77) and decide route for receiving supervisor (line 187-191) with audit + Outbox enqueue
- Leave request approval/rejection with supervisor responsibility gate via deriveWorkerPrimarySiteId + getSitesSupervisedByUser (leave-requests.ts:247-262, 502-506) and HR pod-scope gates (line 165-203)
- getSitesSupervisedByUser 2-query O(1) reverse lookup with §5.8 ACTING-over-PERMANENT precedence applied locally (effective-responsibility.ts:172-249)
- deriveWorkerPrimarySiteId 4-tier fallback: effective-at-T ACTIVE, most-recent ACTIVE, most-recent any, null (effective-responsibility.ts:282-317)
- getEffectiveBinding point-in-time query with ACTING-over-PERMANENT precedence (effective-responsibility.ts:62-98)
- Same-day freeze policy S-001 enforced via assertNotChangingTodaysResponsibility (same-day-freeze.ts:73-90) in binding creation + reassignment paths; no responsibility changes allowed same-day
- Mobile replacement picker with 2-min countdown, live Reanimated progress bar, 5s outcome polling, candidate filtering from Today portfolio scope (replacement-picker.tsx:147-1129)
- Sites screen showing supervisor's portfolio with workers-on/due ratio + flagged indicators (sites.tsx:126-210)
- Audit events for all major actions: REPLACEMENT*INVITE_SENT, LEAVE_APPROVED, SWAP_REQUEST_SENT, BINDING*\* events (audit-event.ts integration in all services)
- Outbox enqueue for push notifications + WhatsApp: replacement_invite, worker.leave_approved, swap.accepted/rejected, gupshup.send (replacement-invite-service.ts:214-230, leave-requests.ts:310-323, swap-request-service.ts:107-134)
- Cross-tenant isolation: companyId in WHERE clauses on all queries + withTenantContext() at route layer (replacement-invites.ts:110-115, leave-requests.ts:108-114, etc.)

**Stubbed / missing / not wired:**

- Bootstrap-seed script for SiteSupervisorBinding (deferred pending real-customer-tenant data; test-only cases exist in p1_5_bootstrap_seed.test.ts)
- HR portal admin-web UI for acting-supervisor window creation + permanent portfolio reassignment (responsibility-model §10 explicitly defers to separate R-version pass; spec locks the schema/API but not the UI)
- Binding expiry sweep cron job `binding-expire-sweep` (file exists at apps/backend/src/jobs/binding-expire-sweep.ts but deferred; responsibility-model §5.3 says read-time + cron for defense-in-depth; currently only read-time implemented)
- Replacement invite expiry sweep cron (replacement-invite-service.ts:36-39 documents sweepExpiredReplacementInvites but is not registered as a cron job; manual test covers it)
- Handoff package composer + writer (site-supervisor-binding.ts:31-32 imports them; implementation exists in separate handoff-package-\* files per F-004 but integration with binding lifecycle is deferred)
- Worker app surface for replacement invite accept/decline (replacement-invites.ts:10 notes 'Phase D worker mobile'; currently only supervisor-side routes + supervisor notification)
- 'While you were out' digest UX when supervisor returns from acting-cover window (responsibility-model §5.6 + closure-spec §5.2.6 define it; implementation deferred to Phase D+)
- HR absence fallback (responsibility-model §3.2 Absent-actor notes 'deferred' for HR; today no fallback exists when HR is unreachable)
- LeaveRequest HR-only role gate enforcement at route layer (leave-requests.ts comment on line 125 says 'HR A1 Task 7'; the route today allows any authenticated SUPERVISOR/HR without explicit HR-only guard at parse-time)

## S6-updates

**Truly implemented:**

- Mobile GET /supervisor/updates endpoint (apps/backend/src/routes/supervisor-updates.ts:62-80) fetches and partitions HRUpdates by ack status
- Service partitions logic into needsAck and recentAcked with 20-row caps (apps/backend/src/lib/services/hr-updates-service.ts:82-111)
- 5-word validation on POST acknowledge (apps/backend/src/routes/supervisor-updates.ts:109-115)
- Ack write with acknowledgedBy, acknowledgedAt, acknowledgmentPhrase on HRUpdate row (apps/backend/src/routes/supervisor-updates.ts:139-145)
- Audit event HR_UPDATE_ACKED on successful ack (apps/backend/src/routes/supervisor-updates.ts:149-157)
- Mobile UI renders needsAck and recentAcked sections (apps/mobile/app/(supervisor)/updates.tsx:178-213)
- UpdateCard component with expanded/collapsed states and ack input (apps/mobile/components/updates/UpdateCard.tsx:82-182)
- Word counter client-side + server-side validation (UpdateCard.tsx:31-35, supervisor-updates.ts:46-50)
- Tenant context isolation in GET/POST routes via withTenantContext middleware (apps/backend/src/routes/supervisor-updates.ts:118)
- React Query mutation + cache invalidation on ack success (apps/mobile/lib/queries/use-hr-updates.ts:57-67)

**Stubbed / missing / not wired:**

- POST /hr-updates route for HR admin to create updates (spec §2.1) — completely absent
- HRUpdateRule child table in Prisma schema (spec §2.1, §2.9) — schema has flat HRUpdate only, no rules array support
- Digest validation: mixed-tier forbidding (spec §5) — no tier field in schema, no validation
- Outbox enqueue on POST /hr-updates for topic 'hr_update.posted' (spec §2.1 step 7) — no enqueueOutbox() calls
- Outbox enqueue on POST acknowledge for topic 'hr_update.acked' (spec §3.3) — no enqueueOutbox() in ack endpoint
- Dispatcher handler for 'hr_update.posted' topic to fan-out push notifications (spec §3.2) — no dispatcher/handlers directory or handler code
- Audience resolution query with role=SUPERVISOR + status=active filtering (spec §4.1) — audience logic stub only
- Idempotency check on ack: same text returns cached success, different text rejects ALREADY_ACKED (spec §2.2 steps 4-5) — code overwrites silently
- HR_ADMIN role validation on POST /hr-updates (spec §2.1 step 1) — will be missing when route is added
- X-HR-Update-Warning header on soft cap > 10 rules (spec §7) — no implementation
- Per-rule 'viewed' endpoint /hr-updates/:id/rules/:ruleId/viewed (spec §2.4 deferred) — correctly deferred

## S7-summary-memory

**Truly implemented:**

- Summary screen metrics display: 4 tiles (changesToday, flagged, leavePending, tomorrowRoster) computed per buildSummaryForSupervisor (summary-service.ts:69-202)
- Summary timeline rendering: AuditEvents fetched, mapped via summarizeAuditKind (audit-summary.ts:26-77) to plain-English summaries, rendered as TimelineRow list (summary.tsx:103-110)
- Summary route backend: GET /supervisor/summary (supervisor-summary.ts:27-47) validates auth, calls buildSummaryForSupervisor, returns SummaryResponseT
- Profile screen complete: Fetches GET /me, displays user.name/phone/company/role, language picker (3 locales: en/hi/te), notification toggle switches (push/whatsapp/email) with local-only persistence
- Drawer navigation wired: All 9 drawer items map to correct screens (My profile→me, Memory & rules→memory, My sites→sites, Language/Notifications→me, Temporary mode→PauseAIModal) (Drawer.tsx:257-300)
- AI pause intent captured: PauseAIModal (Drawer.tsx:406-440) opens on Temporary mode tap; handlePauseConfirm (lines 235-255) writes 'axhy_ai_paused_until' ISO timestamp to SecureStore

**Stubbed / missing / not wired:**

- GET /supervisor/living-doc endpoint: Does not exist; backend has getLivingDoc() helper (living-doc.ts:91-122) used only by chat, never exposed as public route (memory.tsx:6-8 comment confirms)
- useLivingDocQuery hook: Does not exist in mobile/lib/queries/; memory.tsx line 7 comment anticipates it but it is not implemented
- Memory screen rule list UI: Only EmptyRulesCard rendered; no FlatList or rule card components
- Summary wages computation: Placeholder text only 'Wages computed at end of week' (summary.tsx:119); SummaryResponseT has no wage fields; no calculation in summary-service.ts
- Summary refresh button: Design spec calls for 'Refresh from server' button (design-doc line 38); not implemented in summary.tsx
- Summary timeline tier filtering: Design calls for 'DecisionsTodaySheet (filter by tier)' (design-doc line 38); timeline is non-interactive, SummaryTimelineEntry has no tier field
- Notification preferences backend sync: Toggles persist only to SecureStore (me.tsx:430-443); no PATCH /me/notification-prefs endpoint; comment at line 540 says 'follow-up'
- Profile resign button: Header comment (me.tsx:4-7) documents 'Resign button is shown at the bottom'; button does not exist in code; no POST /me/resign endpoint
- AI pause consumption: handlePauseConfirm sets flag but comment at lines 244-245 confirms 'This flag is not yet consumed by ChatInput — wiring it there is a follow-up slice'
- Drawer subtitle queries: buildDrawerItems (Drawer.tsx:104-124) hard-codes sub:null for most items; comment at lines 85-93 explains: 'Until each entry has a real query backing its subtitle, the subtitle is omitted'; design calls for rule count, site count, etc.

## W1-auth-identity

**Truly implemented:**

- OTP request → WhatsApp delivery (routes/auth.ts:39-66, lib/whatsapp-otp.ts)
- OTP verify → JWT + refresh-token issue (routes/auth.ts:68-191)
- Worker OTP → workerMachine.send(OTP_VERIFIED) → DOC_PENDING state (routes/auth.ts:134-160, lib/services/worker-otp-verified-service.ts:54-132)
- Post-OTP branch on memberships[0].role: WORKER→permissions, SUPERVISOR→PushPrompt (app/(auth)/otp.tsx:86-94)
- Permissions: Camera + Location request (app/(auth)/permissions.tsx:71-103, expo-camera + expo-location)
- Consent: append-only ConsentLog write (app/(auth)/consent.tsx:42-61, routes/worker-consent.ts:60-68)
- Worker shell mount: hydrate r2UploadQueue, partition rehydration, photo sweep (app/(worker)/\_layout.tsx:30-80)
- Cold-start routing: onColdStartReady with role check + OneSignal.login (app/index.tsx:38, identity-lifecycle.ts:397-430)
- Token refresh rotation: F1-b refresh token store validate+rotate (routes/auth-refresh.ts:62-263, services/refresh-token-store.ts)
- Session sign-out: OneSignal.logout → /auth/sign-out → clearTokens → route to phone (identity-lifecycle.ts:324-366, WorkerDrawer.tsx:33-38)
- Logout timeout guard: fetchWithTimeout(8s) on /auth/sign-out call (identity-lifecycle.ts:349-357, lib/uploads/r2-put.ts:fetchWithTimeout)
- requireWorkerRole gate: auth + role === WORKER check (middleware/tenant-context.ts:requireWorkerRole)
- OneSignal lifecycle: init-before-use with latch, 3s timeout on login/logout, falls open (identity-lifecycle.ts:145-181)

**Stubbed / missing / not wired:**

- No SUPER_ADMIN or HR role acceptance in onIdentifiedLogin — only SUPERVISOR + WORKER supported per F-006b relaxation; other roles throw NonSupervisorRoleNotSupportedError (identity-lifecycle.ts:268-273)
- No explicit audit event for OTP request or verify (only WORKER_OTP_VERIFIED event if transition fires; standard login auth attempts not logged)
- No runtime validation of policyVersion in /worker/consent — accepts any string from client without checking against known policy releases
- No duplicate-consent prevention — ConsentLog is append-only, mobile treats 409 as success but backend never returns 409
- No concurrent-call guard on onIdentifiedLogin or onAppLogout — both could execute in parallel on race conditions
- No explicit verification that WORKER role has valid Worker row before JWT issue — missing Worker row → silent inconsistency, later 404 on /worker/\* routes
- No device state tracking on OTP verify (Device table exists but is not written during auth flow)
- No multi-membership role-switch UI — only memberships[0].role is used; users with multiple roles cannot switch from mobile

## W2-worker-today

**Truly implemented:**

- Worker Home screen rewrite from placeholder to real implementation consuming /worker/today — apps/mobile/app/(worker)/(tabs)/index.tsx:124-428
- Assignment Detail screen (visit detail) — apps/mobile/app/(worker)/visit/[id].tsx:121-380 with state-driven CTA logic
- ResumeCaptureBanner component for in-flight visits — apps/mobile/components/worker/ResumeCaptureBanner.tsx:31-60
- StateBadge component mapping visit.state to label+tone — apps/mobile/components/worker/StateBadge.tsx:56-79
- AssignmentCard component (list row) with NEXT pill and state styling — apps/mobile/components/worker/AssignmentCard.tsx:57-92
- NextSiteCard hero card with state-driven CTA modes — apps/mobile/components/worker/NextSiteCard.tsx:66-123
- React Query hooks useWorkerTodayQuery (with focus refetch) — apps/mobile/lib/queries/use-worker-today.ts:22-43
- React Query hook useWorkerVisitQuery (per-visit cache) — apps/mobile/lib/queries/use-worker-visit.ts:20-26
- Backend GET /worker/today route with auth + rate limit + transaction wrapper — apps/backend/src/routes/worker-today.ts:42-78
- Backend GET /worker/visits/:id route with caller-owns-visit check — apps/backend/src/routes/worker-visit.ts:38-88
- Worker today service composer reading Visit + Site + resolving supervisor — apps/backend/src/lib/services/worker-today-service.ts:108-205
- Worker visit detail service with FORBIDDEN on cross-worker access — apps/backend/src/lib/services/worker-today-service.ts:274-324
- Zod schemas WorkerTodayOutput + WorkerVisitDetailOutput — packages/shared-schema/src/zod/worker-today.ts:85-140
- API route builders for /worker/today and /worker/visits/:id — apps/mobile/lib/api-routes.ts:23-24
- Worker visit state machine with 12 states (SCHEDULED through ARCHIVED) — packages/state-machines/src/visit.ts:17-150
- Helper functions pickWorkerCaptureVisit + workerCaptureRouteForVisit — apps/mobile/lib/worker-today-helpers.ts:46-105
- Real-DB tests for GET /worker/today (4/4 cases green) — apps/backend/test/worker-today.test.ts
- Real-DB tests for GET /worker/visits/:id (4/4 cases green) — apps/backend/test/worker-visit.test.ts

**Stubbed / missing / not wired:**

- Worker name missing from WorkerTodayOutput — greeting defaults to 'Good morning/afternoon/evening' without name per memo line 67; deferred to slice 3
- Visit duration field absent from WorkerTodayOutput — AssignmentCard.tsx:48 accepts optional duration param but backend never provides it; placeholder pending slice 3
- Distance/location data not computed — NextSiteCard.tsx:33 accepts optional distance but always null on Home (line 298); needs expo-location in slice 2b
- Notification count static — HomeBellIcon.tsx red dot is static; real notification count deferred to slice 3
- Synced pill infra incomplete — SyncPill.tsx component exists but sync state derives from r2UploadQueue; background-sync infrastructure deferred to slice 3
- KPI tiles (stats) deferred — memo line 70 notes 'Stats aggregator + scoring not defined — slice 3'; only Done/Planned counts shown
- Photos summary counts placeholder — resume banner shows photosTakenSoFar but real photo count awaits capture pipeline in slice 2b

## W3-capture

**Truly implemented:**

- qr-scan.tsx: honest site check-in, map-pin icon, Continue CTA (file:1-103)
- before-photos.tsx: PhasePhotoCapture phase='before' wrapper (file:1-29)
- before-photos-review.tsx: PhaseReview with 'Start cleaning' → postWorkerClockIn (file:1-50+)
- timer.tsx: MM:SS count-up from startedAt, KeepAwake, GPS sample, Done → postWorkerClockOut, outcome-specific screens (file:1-495)
- after-photos.tsx: PhasePhotoCapture phase='after'
- after-photos-review.tsx: PhaseReview post-cleaning
- submit.tsx: submitVisit API call, polling with CRIT-5 overlapping-request guard (pollInFlightRef), outcome screens VERIFIED/FLAGGED/closed/timeout (file:1-675)
- api-capture.ts: requestUploadUrls(visitId, files) → UploadUrlsResponse (file:1-32)
- api-submit.ts: submitVisit(visitId, photos), fetchVerifyStatus(visitId) with Zod parse (file:1-49)
- api-lifecycle.ts: postWorkerClockIn/postWorkerClockOut typed responses (file:1-38)
- worker-captures.ts: POST /worker/captures/upload-urls presigns URLs via generateBatchUploadUrls, rate-limited, returns v3-captures/{userId}/... key (file:1-207)
- worker-submit.ts: POST /worker/visits/:visitId/submit with Worker.id ownership check, rate-limited, calls submitVisit service (file:1-192)
- worker-lifecycle.ts: POST /worker/visits/:visitId/clock-in IN_PROGRESS transition with ACTIVE_TIMER_EXISTS guard; POST /worker/visits/:visitId/clock-out PHOTOS_PENDING transition (file:1-180+)
- worker-submit-service.ts: validates ownership, PHOTOS_PENDING guard, >=3 photos per phase, buildObjectKey reconstruction, bulk-inserts VisitPhoto, updates state AWAITING_VERIFICATION, enqueues ai.verify Outbox, records VISIT_SUBMITTED audit (file:1-130)
- r2-presign.ts: buildObjectKey(workerId, visitId, file), generateBatchUploadUrls 1h PUT presigns, generatePresignedGetUrls 5min GET presigns (file:1-220)
- r2-upload-queue.ts: enqueue/hydrate/pump serial upload with exponential backoff [1..60]s, retries up to 7x, requestUploadUrls per attempt, onChange listener (file:1-200+)
- visit.ts state machine: SCHEDULED→NOTIFIED/EN_ROUTE/ON_SITE→IN_PROGRESS(CLOCK_IN)→PHOTOS_PENDING(CLOCK_OUT)→AWAITING_VERIFICATION(PHOTOS_UPLOADED)→VERIFIED|FLAGGED; final ARCHIVED (file:1-163)
- capture.ts captureMachine: IDLE→CAPTURING(tracks step)→SUBMITTED; wired by design but unused in submit.tsx (file:1-106)
- ai.ts dispatcher: loads visit+photos, presigned GET URLs, OpenAI gpt-5.4-nano multimodal, parses JSON response, sets visit.state+VisitPhoto.aiVerifyStatus (file:1-150+)

**Stubbed / missing / not wired:**

- PhasePhotoCapture internals: camera, retake affordance, per-user-partition storage (deferred 2b-2)
- expo-camera integration (timer.tsx has expo-location sample but camera deferred)
- Photo write to disk via per-user-partition (scaffold exists, I/O endpoints deferred)
- captureMachine wired to submit.tsx (defined capture.ts:1-106 but unused submit.tsx:55-82)
- AI verification failure retry: max 2 retries then fallback to FLAGGED (ai.ts:46 MAX_RETRIES incomplete per code review X14)
- Web flow: submit.tsx:60 reads empty uploadQueue on web; no 'Capture not supported on web' surface
- Resume jump-to-in-progress: deep-links to qr-scan step 1 instead of current step (captureMachine planned 2b-2)
- Streaming PUT: expo-file-system createUploadTask deferred; full file loaded to heap (file:1-200)
- Batch presign: requestUploadUrls called single-file per attempt (line 170), not batched (backend supports 20)

## W4-history-profile

**Truly implemented:**

- Home screen (apps/mobile/app/(worker)/(tabs)/index.tsx:1-100+) with NextSiteCard hero, stat strip (Done/Planned), ResumeCaptureBanner, and grouped visit list by state buckets (Needs attention/In progress/Submit pending/Verifying/Upcoming/Completed) — fully implemented with useWorkerTodayQuery polling on focus/mount
- History screen (history.tsx:39-180) grouping verified/flagged/cancelled/archived visits by day, summary stats (30-day window), and status tone badges (check-circle/alert-triangle/clock) — fully implemented via useWorkerHistoryQuery with 30_000ms stale time
- Visit Detail screen ([id].tsx:121-257) showing site name, address, scheduled date/time, supervisor call button, state-driven primary CTA (Start cleaning / Resume cleaning / Review work / disabled) — fully implemented via useWorkerVisitQuery with owner-only authorization check
- Worker Profile screen (profile.tsx:73-232) showing today's stats (Sites/Verified/Remaining), upload sync state from r2UploadQueue snapshot, supervisor phone tap-to-call — fully implemented with JWT decode fallback (lines 79-89)
- Backend GET /worker/today route (worker-today.ts:42-78) reading visits for today (startOfDayInTz + 24h window), deriving resume-capture pointer from IN_FLIGHT visit priority, resolving supervisor phone via effective-responsibility binding — fully implemented with 15_000ms transaction timeout
- Backend GET /worker/history route (worker-history.ts:22-62) reading window-days clamped history visits (HISTORY_STATES only, excluding IN_PROGRESS/SCHEDULED), returning summary counts and scheduledFor-DESC order — fully implemented with rate limit gate and optional windowDays query param
- Backend GET /worker/visits/:id route (worker-visit.ts:39-87) reading single visit detail with authorization check (caller userId == visit.worker.userId), returning full site address + supervisor phone — fully implemented with 403 FORBIDDEN generic error for cross-worker access
- Visit state machine (packages/state-machines/src/visit.ts:62-150) 12-state XState machine with SCHEDULED→NOTIFIED→EN_ROUTE→ON_SITE→IN_PROGRESS→PHOTOS_PENDING→AWAITING_VERIFICATION→{VERIFIED|FLAGGED}→{ARCHIVED|CANCELLED} transitions — read-only in this slice (no transitions fired)
- Rate limiting (consumeWorkerRateLimit calls in each route with per-user minute-bucket tracking) — fully implemented for today/history/visit routes
- Tenant safety via @unique(Worker.userId) column-level index (schema.prisma:188) ensuring at most one active Worker per User globally per anonymization model — documented in worker-today.ts lines 16-26

**Stubbed / missing / not wired:**

- Visit detail screen does NOT include any state transition buttons — it only shows the primary action CTA which navigates to the capture flow. No clock-in/clock-out/submit actions fire from this screen (by design: transitions happen inside capture flow per [id].tsx:17-20 comment)
- History screen does not include startedAt/completedAt timestamps for closed visits despite these fields existing in Visit table — WorkerHistoryOutput schema (worker-today.d.ts:160-178) intentionally omits them vs WorkerTodayOutput which includes them (lines 46-49)
- Profile screen 'Verified' badge is hardcoded static text (line 134: '<Text style={s.verifiedText}>Verified</Text>') rather than deriving from worker.state or visit.state — always displays even if worker is ON_SUSPENSION/BLOCKED/etc
- No integration testing of the full History screen flow (list display, grouping, filtering by state, time windows) — only unit tests for route layer (worker-history.test.ts) exist, not E2E mobile tests

## W5-worker-leave-notif

**Truly implemented:**

- Backend POST /leave-requests endpoint for supervisor approval/rejection (routes/leave-requests.ts:135-362) — gates on SUPERVISOR|HR role, validates state transitions (REQUESTED→APPROVED|REJECTED), fires AuditEvent + Outbox topics
- LeaveRequest.state raw enum field with REQUESTED|APPROVED|REJECTED values (schema.prisma:507-524)
- createLeaveRequestService in services/leave-request-service.ts (lines 51-101) — creates LeaveRequest row, enqueues hr.leave_requested outbox
- Worker home screen with visit list, grouped by state (index.tsx:154-423) — renders NEEDS_ATTENTION, IN_PROGRESS, SUBMIT_PENDING, VERIFYING, UPCOMING, COMPLETED groups
- POST /swap-requests route for supervisor-initiated swaps (swap-requests.ts:44-124) — SUPERVISOR-only, creates SwapRequest in SENT state, enqueues gupshup.send for both workers
- createSwapRequestService in services/swap-request-service.ts (lines 54-137) — creates SwapRequest row, emits SWAP_REQUEST_SENT audit + outbox topics
- SwapRequest.state raw enum field with DRAFT|SENT|ACCEPTED|DECLINED values (schema.prisma:882-893)
- WorkerDrawer component with profile/help/sign-out items (components/worker/WorkerDrawer.tsx:57-195)
- Worker profile tab screen (profile.tsx) — renders help text mentioning supervisor contact for leave/swaps
- Outbox table schema with topic+payload (schema.prisma for Outbox model)
- AuditEvent recording for leave approvals/rejections (leave-requests.ts:291-308)

**Stubbed / missing / not wired:**

- POST /worker/leave-requests endpoint (stub: service exists but no worker-facing route)
- POST /worker/swaps endpoint (stub: only supervisor POST /swap-requests exists)
- GET /worker/notifications endpoint (completely missing; Notification table exists in schema but no worker query route)
- GET /worker/leave-requests endpoint (only HR inbox route exists at line 369-441; no worker-facing list)
- Grievance table in schema.prisma (completely absent)
- POST /worker/grievances route (completely missing)
- grievanceMachine state machine (not in packages/state-machines/src)
- leaveRequestMachine state machine (not in packages/state-machines/src)
- swapRequestMachine state machine (not in packages/state-machines/src)
- useWorkerNotificationsQuery mobile hook (doesn't exist)
- GET /worker/notifications API route definition in mobile api-routes.ts (no entry)
- Notifications list screen in mobile (not implemented)
- Leave request sheet UI in mobile (not implemented)
- Swap request sheet UI in mobile (not implemented)
- Grievance form UI in mobile (not implemented)
- Drawer sheet items for leave/swap/grievance/notifications in WorkerDrawer (not implemented)
- Bell icon tap handler on home screen (icon mentioned in design but no onPress wired)
- POST /worker/replacement-invites/:id/accept endpoint (referenced in plan but no route)
- POST /worker/replacement-invites/:id/decline endpoint (referenced in plan but no route)
- replacementInviteMachine state machine (not in packages/state-machines/src)
- Dispatcher handlers for worker.leave_approved, worker.leave_rejected, swap.accepted, swap.rejected outbox topics (Phase B.6 incomplete)

## X1-connections-plumbing

**Truly implemented:**

- JWT access token (15min TTL) + refresh token (30d TTL, opaque, hashed) rotation with compromise detection (auth-refresh.ts:102-138, jwt.ts:17-80, schema.prisma:179-205)
- Bearer token injection in mobile api.ts:155-165 via secure storage (auth-store.ts:75-85)
- Module-level mutex for refresh deduplication (api.ts:90-138, named 'inFlightRefresh')
- Membership re-read on refresh to check status ACTIVE + role + tokenEpoch (auth-refresh.ts:176-212)
- Postgres GUC tenant-scoping via SET LOCAL axhy.current_company_id (tenant-context.ts:241-246)
- Company.status ACTIVE check before operation (tenant-context.ts:248-255)
- Outbox pattern for side-effect durability (outbox.ts:40-51, dispatcher/index.ts:70-121)
- Exponential backoff retry in dispatcher (dispatcher/index.ts:46-58, max 5 attempts, quarantine on failure)
- Redis Lua-script atomic rate limiting (redis-rate-limit.ts:58-70, sliding window ZSET)
- Generic HTTP idempotency cache (idempotency-key.ts:80-152, 10min TTL, Postgres-backed)
- Idempotency-Key header validation (idempotency-key.ts:171-189, 8-200 char length check)
- OTP-verified worker lifecycle trigger (auth.ts:134-150, calls workerOtpVerifiedService)
- Refresh-token grace window (auth-refresh.ts:141, 10s for network race absorption)
- Worker.userId @unique constraint (schema.prisma:247, ensures one worker per user per company)
- resolveWorkerFromAuth helper (tenant-context.ts:211-221, tenant-safe worker lookup)
- Request timeout with AbortController (api.ts:171-192, default 15s, configurable)

**Stubbed / missing / not wired:**

- Idempotency cleanup for IdempotencyKey table — comment references 'future cleanup job' (idempotency-key.ts:37, schema.prisma:485) but no sweep job implemented or outbox topic registered
- Outbox cascade-depth enforcement — comment states 'enforced when handler emits downstream row' (dispatcher/index.ts:19) but no depth tracking or guard in enqueueOutbox (outbox.ts:40-51)
- Redis Postgres fallback for rate limiting — ADR-0024 Rollback §1 promises 'AXHY_REDIS_FALLBACK_TO_POSTGRES=1 per-consumer' but code uses AXHY_RATE_LIMIT_FAIL_CLOSED (redis-rate-limit.ts:120) with only fail-open/closed modes, no Postgres bypass path
- Membership revocation enforcement during request — access token remains valid for 15min after suspension; only checked on refresh (auth-refresh.ts:188) or token expiry
- Refresh token family compromise response Slack alert — stores revokeForCompromise (auth-refresh.ts:134) but no notification to ops/security channel
- Pod-scope enforcement on HR mutations — requires pod ownership (pod-scope.ts:46-61) but no routes wire the guard (files exist but unintegrated)

## X2-db-statemachines

**Truly implemented:**

- workerMachine integration in worker-otp-verified-service.ts (lines 54-132): proper machine-driven transitions with createActor + send event
- recordAuditEvent function in audit-event.ts (lines 1-60): immutable append-only audit trail with Zod validation
- enqueueOutbox function in outbox.ts (lines 1-40): atomic side-effect queue enqueue in same transaction as domain writes
- AuditEvent records for WORKER_OTP_VERIFIED, VISIT_SUBMITTED, VISIT_RESOLVED, VISIT_REJECTED (multiple services)
- Multi-tenant scoping via companyId in most query guards (Worker.findFirst where companyId, Visit.findFirst where companyId, etc.)
- Conflict detection pure logic in conflicts.ts (lines 57-91): stateless detection of worker double-bookings
- Assignment canTransition pure function properly tested (assignment.test.ts lines 5-24)
- Visit state machine definition at visit.ts (lines 17-152) with 12 well-defined states and transitions
- BILLABLE_VISIT_STATES array at visit.ts:157-162 correctly lists billable states

**Stubbed / missing / not wired:**

- No LivingDoc state machine defined (schema.prisma line 998-1100 defines model but no machine in packages/state-machines/src)
- No visitMachine.canTransition integration in visit state writes (worker-submit-service.ts:97, ai.ts:381)
- No assignmentMachine.canTransition integration in assignment state writes (assignment-service.ts:94)
- No AuditEvent emission for AI verification transitions (ai.ts applyOutcome function line 358-395)
- No Outbox topic enqueue in AI verification handler (ai.ts applyOutcome missing enqueueOutbox call)
- .claude/rules/state-machines.md referenced in worker-otp-verified-service.ts:10 but file does not exist
- No machine integration for LeaveRequest state transitions (schema.prisma line 514 mentions '12-state LeaveRequestState machine' but not found in packages/state-machines/src)
- No machine for SiteState transitions (schema.prisma line 221-222 mentions '14-state SiteState machine' but not implemented)

## X3-doc-vs-reality

**Truly implemented:**

- Photo ceiling 3→8 with MAX_PHOTOS_PER_PHASE=8 + UI counter 'N OF 8 · MIN 3' (capture-flow.ts:11-12, PhaseReview.tsx:167)
- Dedicated Before-Review + After-Review screens (before-photos-review.tsx, after-photos-review.tsx) with tap-to-remove + '+ Add more' replacement loop (PhaseReview.tsx:133-144)
- Clock-in relocated to Before-Review 'Start cleaning' button (before-photos-review.tsx:36, clock-in fires ON_SITE → IN_PROGRESS transition)
- VISIT_CLOCKED_IN + VISIT_CLOCKED_OUT + VISIT_SUBMITTED audit events written immutably in transaction (worker-lifecycle-service.ts:122-128, worker-submit-service.ts:105-111)
- QR screen truthfully displays 'SITE CHECK-IN · Start your visit · QR check-in isn't set up for this site yet' with Continue button, no fake scan-line (qr-scan.tsx:71-88)
- fetchWithTimeout(8s) on sign-out identity-lifecycle.ts for network timeout guard (identity-lifecycle.ts uses 'lib/uploads/r2-put' fetchWithTimeout)
- Supervisor /supervisor/today route returns TodayResponseT with site portfolio bounded by getSitesSupervisedByUser (supervisor-today.ts:27-55)
- MarkAbsentSheet writes Attendance row (not Visit) on worker tap with POST /workers/:id/mark-absent and 403 cross-supervisor guard via assertCallerSupervisesWorker (supervisor-context-service.ts referenced in today-service.ts)
- R6 tab order Today / Decisions / Activity / Chat / Profile shipped in \_layout.tsx
- F1 trust model dual-mode auth: legacy mode preserves pre-2026-05-27 JWT-only; strict mode verifies Membership.token_epoch + is_platform_admin for SUPER_ADMIN (tenant-context.ts:48-139)
- Rails-style Outbox pattern for ai.verify + hr.worker_absent + payroll.recompute events, atomic with Visit state transitions (worker-submit-service.ts:116-120)
- MIN_PHOTOS_PER_PHASE floor enforced server-side in submitVisit (worker-submit-service.ts:79, echoing client floor from capture-flow.ts:11)

**Stubbed / missing / not wired:**

- Full QR scanning (qr-scan.tsx:10 defers: 'rather than animate a fake scan-line... this screen is truthful'; full QR with camera decode + qrCheckedIn/qrSkipped server event gated on site.qrRequired flag not implemented)
- Activity tab filter chips backend wiring (chips render in UI but no backend filter params in activity-service.ts; docs claim 3-row filters but only 1 row visual and tapping does nothing)
- Stale-cache 'LAST SYNCED N MIN AGO' banner (2026-05-17-scenarios-audit marks scene #11 FAIL: 'No banner'; no Pino staleness counter or ReactQuery gcTime UI anywhere)
- Chat voice waveform recorder + transcription overlay (chat.tsx only has text input with OS dictation; no expo-audio-recorder UI, no waveform visualization, no transcription metadata layer per R6 spec)
- Chat '✷ N decisions added — review in Decisions' link pill (AI decisions don't render as tappable pills in chat bubbles)
- MicFAB floating red mic button (spec'd on Today, Decisions, Activity, Chat; cross-cutting missing component)
- Decisions tab badge count (no badge on tab bar showing pending decisions count)
- Chat older bubble 55% opacity dimming (all bubbles render at 100% opacity regardless of age)
- Drawer surface (≡ menu → Profile / Memory / Sites / Language / Notifications / Help / Temp mode / Sign out; ≡ icon present but non-functional)
- Cron jobs for binding-expire-sweep, hr-queue-age-escalation, owner-monthly-digest, hr-availability-sweep, bootstrap-seed-aging-sweep (queued for follow-up, not landed)
- Dispatcher → MSG91 SMS delivery path for hr.worker_absent outbox events (Outbox enqueues topic but consumer not wired to MSG91)
- Worker mobile push notifications (OneSignal identity-lifecycle landed per NEXT_SESSION.md but actual worker notification rendering not in scope)

## X3-doc-vs-reality (capture-submission, submit, worker evidence lifecycle)

**Truly implemented:**

- Minimum 3-photo floor per phase enforced server-side + client gate (worker-submit-service.ts:73-81, review.tsx:68-70)
- Photo ceiling raised from 3 to 8 with 'Add more' UX (capture-flow.ts, PhasePhotoCapture)
- 8-step flow with dedicated Before-Review + After-Review screens (new .tsx files in [visitId]/ directory)
- Timer elapsed derives from Visit.startedAt, survives reopen (timer.tsx:82-117)
- QR screen now honest (no fake camera/decode, truthful 'Site Check-in' message at qr-scan.tsx:85-88)
- Audit events on worker lifecycle (VISIT_SUBMITTED recorded at worker-submit-service.ts:105-111)
- Final-review shows site name + cleaned duration (review.tsx:115-124 displays siteName + formatCleanedDuration)
- Specific 'missing N more' hint copy (review.tsx:29-38 missingPhotosHint function)
- Worker can leave during polling state (submit.tsx:469-477 renders 'Back to home' during state==='polling')
- Outcome-specific screens for VERIFIED/FLAGGED/closed/timeout (submit.tsx:304-427 outcome branches, no blanket 'done' lie)

**Stubbed / missing / not wired:**

- R2 key mismatch: presign uses User.id, submit uses Worker.id → paths don't match (worker-captures.ts:84 vs worker-submit-service.ts:88) — Q3-001
- Full QR camera + decode + qrSkipped server event: deferred per locked decision (qr-scan.tsx line 2-11: 'QR deferred until a site requests it')
- ON_SITE state never entered: clock-in jumps SCHEDULED→IN_PROGRESS directly (per NEXT_SESSION.md 'ON_SITE not introduced... needs locked state-machine change')
- Clock-out at Timer 'Done' instead of After-Review 'Continue' (trade-off for accurate duration + deterministic resume, per NEXT_SESSION.md)
- Streaming PUT for photos (expo-file-system createUploadTask): memory optimization deferred (not launch blocker)
- Same-class timeout issues on supervisor surfaces: identity-lifecycle sign-out + photo-upload (supervisor/chat) — flagged but not fixed in worker slice
