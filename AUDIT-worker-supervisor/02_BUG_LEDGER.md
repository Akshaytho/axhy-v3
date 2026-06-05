# 02 — Bug Ledger (adversarially verified)

> 109 distinct candidate bugs from fresh code reads. Aggregate skeptic pass over 99 verdicts: **63 CONFIRMED, 35 REFUTED, 1 uncertain** (the skeptic killed ~35% as false positives). Per-bug verdict below is a best-effort title match (read agents reused ids across slices, so a few tags are approximate — **open the cited file:line before fixing**, which you'd do anyway).

**Severity counts (all candidate bugs):** {'P0': 5, 'P1': 23, 'P2': 53, 'P3': 28}

---

### [P0] POST /hr-updates route completely missing — HR admins cannot create updates at all `[CONFIRMED]`

- **Slice:** S6-updates
- **Where:** `apps/backend/src/routes/supervisor-updates.ts (entire file; no POST /hr-updates handler)`
- **What:** Spec §2.1 requires 'POST /hr-updates — HR creates an update' as the only way to post new HRUpdates to supervisors. Implementation has zero implementation of this route. Only GET and POST acknowledge exist, both supervisor-side (read + ack). There is no route for HR admins to POST updates.
- **Fix:** Implement POST /hr-updates handler: requireAuth + role check (HR_ADMIN), parse body (title, body, rules?), validate title length 1-200, body ≤5000, rules each ≤200 title/5000 body. If rules present, assert all share same tier (forbid mixed per §5). Create HRUpdate + child HRUpdateRule rows in one tx. Write audit HR_UPDATE_POSTED. Enqueue outbox topic 'hr_update.posted' with payload (hrUpdateId). Return 201 + created row. Optionally return X-HR-Update-Warning header if rules.length > 10.

### [P0] Outbox topic never enqueued on POST /hr-updates — push notifications completely broken `[CONFIRMED]`

- **Slice:** S6-updates
- **Where:** `apps/backend/src/routes/supervisor-updates.ts + apps/backend/src/lib/outbox.ts (no calls)`
- **What:** Spec §2.1 step 7 requires: 'Fire outbox topic `hr_update.posted` for fan-out'. Spec §3.2 defines dispatcher consumer. Current code (supervisor-updates.ts) has no enqueueOutbox() import or call. Even after POST /hr-updates is implemented, the notification fan-out will remain broken unless outbox is enqueued.
- **Fix:** In future POST /hr-updates handler, after HRUpdate + HRUpdateRule creation: import enqueueOutbox. Call `await enqueueOutbox(tx, { companyId: auth.companyId, topic: 'hr_update.posted', payload: { hrUpdateId: newUpdate.id, companyId: auth.companyId } })` inside the withTenantContext transaction. This ensures both the domain row and the notification intent commit together.

### [P0] No dispatcher handler for 'hr_update.posted' topic — notification chain incomplete `[CONFIRMED]`

- **Slice:** S6-updates
- **Where:** `apps/backend/src (no dispatcher/ or jobs/ directory visible)`
- **What:** Spec §3.2 describes: 'Loads HRUpdate, resolves audience (all supervisors in companyId), looks up push tokens, enqueues push sends.' The current codebase structure has lib/outbox.ts for enqueueing but no dispatcher process to consume topics. Even if outbox topics are enqueued, nothing processes them.
- **Fix:** Create apps/backend/src/dispatcher/handlers/hr_update_posted.ts. Handler function: load HRUpdate(id), resolve audience via query `Membership(companyId=hrUpdate.companyId, role=SUPERVISOR, status=active)`, for each supervisor in audience look up push subscription token (via Device table or similar), enqueue push notification via existing notification service (e.g., Gupshup). Title: 'New HR update: {title}' (truncate to 60 chars). Body: '{rules.length} rules · needs your ack' or 'needs your ack' (non-digest). Deep link to mobile app Updates tab + this HRUpdateId.

### [P0] REJECTED state not in VisitStateValue union but used in visit-flagged-review-service `[unmatched]`

- **Slice:** X2-db-statemachines
- **Where:** `packages/state-machines/src/visit.ts:17-29 vs apps/backend/src/lib/services/visit-flagged-review-service.ts:176`
- **What:** The rejectFlaggedVisit service writes state='REJECTED' to Visit rows, but VisitStateValue union only includes 12 states (SCHEDULED, NOTIFIED, EN_ROUTE, ON_SITE, IN_PROGRESS, PHOTOS_PENDING, AWAITING_VERIFICATION, VERIFIED, FLAGGED, CANCELLED, NO_SHOW, ARCHIVED). REJECTED is not in this list.
- **Fix:** Either add REJECTED to VisitStateValue union in visit.ts:17-29 AND add transitions to the visitMachine that lead to REJECTED, OR change visit-flagged-review-service.ts to use a state that IS in the union (e.g., CANCELLED) and update the business logic. The comment at visit-flagged-review-service.ts:42 claims the machine 'allows REJECTED' but it doesn't exist.

### [P0] COMPLETED and NEEDS_REVIEW states referenced but not defined in VisitStateValue `[unmatched]`

- **Slice:** X2-db-statemachines
- **Where:** `apps/backend/src/lib/services/visit-flagged-review-service.ts:46 references COMPLETED, NEEDS_REVIEW which do not exist in visit.ts:17-29`
- **What:** REJECTABLE_VISIT_STATES constant at line 46 includes 'COMPLETED' and 'NEEDS_REVIEW' as valid source states for rejection, but these states are not in the VisitStateValue union.
- **Fix:** Add COMPLETED and NEEDS_REVIEW to VisitStateValue if they are valid operational states. If they're not supposed to exist, remove them from REJECTABLE_VISIT_STATES and audit for any other code writing to these states.

### [P1] FlaggedReviewSheet Resolve/Reject code comments claim 'fully wired' but backend routes do not exist `[REFUTED]`

- **Slice:** S1-supervisor-today
- **Where:** `apps/mobile/components/today/FlaggedReviewSheet.tsx:1-10 (misleading comment); no /visits/:id/resolve or /visits/:id/reject routes in apps/backend/src/routes/`
- **What:** Code comments at FlaggedReviewSheet.tsx lines 7-10 state: 'Both Resolve and Reject buttons are fully wired to the backend (POST /visits/:id/resolve, POST /visits/:id/reject).' However, neither route exists on the backend. The mutations call hooks (useResolveFlaggedVisit, useRejectFlaggedVisit) that attempt to hit non-existent endpoints.
- **Fix:** Either (a) implement the backend routes /visits/:id/resolve and /visits/:id/reject with proper Visit state transitions, or (b) update FlaggedReviewSheet.tsx comments to state: 'Buttons render as UI placeholders; write paths deferred to a future routing slice.' Consider adding a disabled-state message 'Coming with P1 routing' to match the done-memo intent.

### [P1] Mobile dismiss mutation passes empty body, violating server schema requirement for reason field `[unmatched]`

- **Slice:** S2-decisions
- **Where:** `apps/mobile/lib/queries/use-decisions.ts:39-42`
- **What:** useDismissDecision calls `/supervisor/decisions/${id}/dismiss` with `body: {}`. The backend route expects DismissDecisionInput which per the pattern in decisions.ts requires reason: z.string().min(1).max(2000). Sending empty body means req.body.reason is undefined.
- **Fix:** Update mobile to collect a dismiss reason via bottom-sheet before calling the API, or change the server to explicitly handle optional reason with a placeholder recorded in audit.

### [P1] Semantic context retrieval happens BEFORE message persistence; continuity turn omits current message; first-thread messages get no semantic context `[unmatched]`

- **Slice:** S3-chat-ai-livingdoc
- **Where:** `chat.ts:794 vs chat.ts:1331`
- **What:** Pre-flight calls assembleSemanticContext at line 794, which loads continuity turn via loadContinuityTurn (semantic-context.ts:335) BEFORE persistChatTurn writes message at line 1331. Current message never appears in its own semantic context; continuity is one message behind.
- **Fix:** Move assembleSemanticContext into next request, or add current turns after persistChatTurn+embeddings complete.

### [P1] Backfill of existing ChatMessage embeddings not executed on production; vector RAG only works for NEW messages `[unmatched]`

- **Slice:** S3-chat-ai-livingdoc
- **Where:** `handoff-done-memo-vector-rag-wave-a3-phase-1.md:143; backfill-turn-embeddings.ts exists but not run`
- **What:** Phase 1 shipped embedTurnAsync (fire-and-forget after persistChatTurn). New turns get embeddings. Existing ChatMessage rows before Phase 1 have NO embeddings. Backfill script (275 LOC) exists but marked 'awaiting founder review'. Until backfill runs, semantic retrieval only works for recent messages.
- **Fix:** Execute backfill script on production or defer until Phase 3.

### [P1] Reverse operation inverse-notification topics not registered in dispatcher `[unmatched]`

- **Slice:** S4-activity
- **Where:** `apps/backend/src/lib/services/activity-reverse-service.ts:204-216, 257-271, 318-331, 390-404 vs apps/backend/src/dispatcher/handlers/registry.ts:29-46`
- **What:** When a supervisor reverses an action, the code enqueues Outbox rows with topics: worker.absence_cleared, worker.leave_reverted, worker.assignment_terminated_by_supervisor, worker.cover_invite_reversed. These topics are NOT in the HANDLERS registry, so dispatcher will reject with UNKNOWN_TOPIC and quarantine after 5 attempts.
- **Fix:** Add four handlers to registry.ts and implement in gupshup.ts or notifications.ts to notify affected workers that their status changed (absence cleared, leave reverted, assignment terminated, cover invite reversed).

### [P1] LeaveRequest approval allows SUPERVISOR direct approval without HR ratification `[unmatched]`

- **Slice:** S5-coverage-people-ops
- **Where:** `apps/backend/src/routes/leave-requests.ts:159, 247-262`
- **What:** The leave-request approval route allows any authenticated SUPERVISOR to approve leave for a worker in their portfolio without HR involvement. Line 159 checks `auth.role !== 'SUPERVISOR' && auth.role !== 'HR'` which permits supervisor approval. Lines 247-262 gate on portfolio only, not requiring HR ratification.
- **Fix:** Implement HR-only approval at the direct route OR add a two-step workflow where supervisor pre-approves (creates a pre-approval note) and HR must explicitly ratify before LeaveRequest transitions to APPROVED. The pod-scope gates (line 165-203) show HR infrastructure exists; ensure supervisors can only request/comment, not decide.

### [P1] Idempotency broken on ack: different text overwrites prior ack without error `[CONFIRMED]`

- **Slice:** S6-updates
- **Where:** `apps/backend/src/routes/supervisor-updates.ts:139-145`
- **What:** Spec §2.2 steps 4-5: 'If HRUpdate.ackedAt IS NOT NULL AND HRUpdate.ackText === $ackText (same content), return cached success (idempotent retry). If HRUpdate.ackedAt IS NOT NULL AND HRUpdate.ackText !== $ackText (different content), reject with `ALREADY_ACKED`.' Code (lines 139-145) calls `tx.hRUpdate.update({ ... acknowledgedBy, acknowledgedAt, acknowledgmentPhrase: text })` unconditionally, overwriting any prior ack.
- **Fix:** Before update (line 139), check: if (update.acknowledgedAt !== null) { if (update.acknowledgmentPhrase === text) { return reply.code(200).send({ok: true, acknowledged: true}); } else { return reply.code(409).send({error: 'ALREADY_ACKED', message: 'This update was already acknowledged with different text'}); } } Then proceed to update only if acknowledgedAt is null. This makes the endpoint idempotent.

### [P1] HR_ADMIN role not validated on POST /hr-updates — any user could create updates `[unmatched]`

- **Slice:** S6-updates
- **Where:** `apps/backend/src/routes/supervisor-updates.ts (future POST handler, not yet written)`
- **What:** Spec §2.1 step 1: 'Validate caller is HR admin (`Membership.role = HR_ADMIN` or equivalent).' When the POST /hr-updates route is implemented, it must load Membership(companyId, userId) and assert role === 'HR_ADMIN'. Current placeholder has only requireAuth check.
- **Fix:** In POST /hr-updates handler, after requireAuth (line 89 pattern in POST acknowledge): load Membership and check role. `const member = await tx.membership.findFirst({ where: { companyId: auth.companyId, userId: auth.userId, role: 'HR_ADMIN' } }); if (!member) return reply.code(403).send({error: 'PERMISSION_DENIED', message: 'Only HR admins can post updates'});` Reject with 403 PERMISSION_DENIED if role !== HR_ADMIN.

### [P1] Schema mismatch: Prisma HRUpdate is flat single-row; spec requires digest with HRUpdateRule children `[CONFIRMED]`

- **Slice:** S6-updates
- **Where:** `packages/shared-schema/prisma/schema.prisma:1034-1064`
- **What:** Spec §2.1 describes: HRUpdate parent + N HRUpdateRule child rows. Each rule has id, title, body, tier. Digest validation (§5) forbids mixing tiers across rules in one digest. Prisma schema (lines 1034-1064) defines HRUpdate with single content field, no rules table, no tier enum, no foreign key. This is a v0 flat design, not the spec's hierarchical digest model.
- **Fix:** Either: (a) Add HRUpdateRule model to schema.prisma: `model HRUpdateRule { id String @id @default(uuid()) @db.Uuid; hrUpdateId String @db.Uuid; order Int; title String; body String; tier String; // NOTE | OPERATIONAL | PERSONNEL | EMPLOYMENT createdAt DateTime @default(now()); hrUpdate HRUpdate @relation(fields: [hrUpdateId], references: [id], onDelete: Cascade); @@index([hrUpdateId]); }` Add migration. Update HRUpdate relation. Or (b) Clarify this is v0 single-rule only, remove digest/rules from spec or lock spec as Draft with digest deferred to v3.1. If (b), simplify Zod schema to remove rules array.

### [P1] Memory & rules screen shows only empty state; backend endpoint missing entirely `[unmatched]`

- **Slice:** S7-summary-memory
- **Where:** `apps/mobile/app/(supervisor)/memory.tsx:1-101 + backend routes/`
- **What:** The Memory screen (memory.tsx lines 29-37) renders only an EmptyRulesCard. The design spec calls for displaying supervisor's living-doc rules (23 rules, 12 aliases, 8 site notes per drawer subtitle). No GET /supervisor/living-doc endpoint exists on the backend, and no useLivingDocQuery hook exists on mobile.
- **Fix:** Create apps/backend/src/routes/supervisor-living-doc.ts with GET /supervisor/living-doc endpoint using getLivingDoc(). Create useLivingDocQuery() hook in mobile/lib/queries/. Update memory.tsx to fetch and render the rule list instead of the empty state.

### [P1] Cold-start routing does not await all token setup before returning route; race with app mount `[CONFIRMED]`

- **Slice:** W1-auth-identity
- **Where:** `apps/mobile/app/index.tsx:32-42`
- **What:** onColdStartReady is awaited (line 38), but it internally awaits OneSignal re-link which can time out and fall through (identity-lifecycle.ts line 329). If OneSignal.login is still in-flight when onColdStartReady returns, the returned route is navigated to before the SDK identity is confirmed linked.
- **Fix:** This is by design (timeout fallback for networks that hang OneSignal); document in code that OneSignal linkage is best-effort and cover with integration tests on slow networks.

### [P1] R2 key mismatch: presign uses User.id, submit reconstructs with Worker.id `[CONFIRMED]`

- **Slice:** W3-capture
- **Where:** `worker-captures.ts:84; worker-submit.ts:60-62; worker-submit-service.ts:88`
- **What:** worker-captures.ts:84 passes auth.userId (User.id from JWT) to generateBatchUploadUrls. Presigned URL path: v3-captures/{auth.userId}/... But worker-submit.ts:60-62 resolves Worker.id and worker-submit-service.ts:88 buildObjectKey(workerId) uses Worker.id. Paths don't match. Mobile uploads to path A (User.id), VisitPhoto.r2Key points to path B (Worker.id) → orphaned R2 objects.
- **Fix:** In worker-captures.ts:84, resolve Worker.id from auth.userId+companyId (pattern in worker-submit.ts:60-62, worker-lifecycle.ts:71), then pass Worker.id to generateBatchUploadUrls instead of auth.userId.

### [P1] No idempotency on presigned URL: retried uploads land at different R2 keys `[REFUTED]`

- **Slice:** W3-capture
- **Where:** `r2-upload-queue.ts:157-199; line 170`
- **What:** uploadOne() calls requestUploadUrls for every upload attempt (line 170). If first PUT succeeds but response is dropped, retry requests new presign → new objectKey. First upload at key A, retry at key B, both succeed, but VisitPhoto row created only once → orphaned R2.
- **Fix:** Cache presigned URLs by (visitId, phase, index) in UploadQueueItem. Only request fresh presign if entry expired or missing. Retry reuses same objectKey.

### [P1] withTenantContext in worker-history breaks reads when company is SUSPENDED `[CONFIRMED]`

- **Slice:** W4-history-profile
- **Where:** `apps/backend/src/routes/worker-history.ts:45-46`
- **What:** Commit 33a4b88 changed worker-history.ts to wrap getWorkerHistory() inside withTenantContext(prisma, auth.companyId, ...). The withTenantContext middleware (middleware/tenant-context.ts:21-26) enforces Company.status==='ACTIVE', causing all history queries to fail with 403 FORBIDDEN if the company is suspended.
- **Fix:** Revert to bare prisma.$transaction(tx => getWorkerHistory(...), {timeout: 15_000, maxWait: 10_000}) matching the pattern in worker-today.ts:60-63. The @unique(Worker.userId) column-level index provides the cross-tenant safety guarantee documented in worker-today.ts:16-26.

### [P1] Inconsistent transaction timeout after worker-history refactor (30s vs 15s) `[CONFIRMED]`

- **Slice:** W4-history-profile
- **Where:** `apps/backend/src/routes/worker-history.ts:45-46 vs apps/backend/src/routes/worker-today.ts:60-63`
- **What:** worker-today.ts uses prisma.$transaction with timeout: 15_000, maxWait: 10_000 (line 60-63). The recent commit changed worker-history.ts to use withTenantContext, which internally uses timeout: 30_000, maxWait: 10_000 (middleware/tenant-context.ts line ~14). This creates silent timeout divergence for semantically identical read operations.
- **Fix:** Restore the 15_000ms, 10_000ms timeout pattern used in worker-today.ts. If Company.status safety is needed for some reason, solve it at a different layer (e.g., a pre-check before calling getWorkerHistory) rather than wrapping the entire transaction.

### [P1] StateBadge crashes on unknown visit state `[CONFIRMED]`

- **Slice:** W5-worker-leave-notif
- **Where:** `apps/mobile/components/worker/StateBadge.tsx:57-58`
- **What:** StateBadge reads from STATE_MAP[state] without fallback, causing TypeError when state is not in the 12-entry hardcoded map. This crashes the entire badge rendering for that visit.
- **Fix:** Add fallback: const meta = STATE_MAP[state] ?? { label: state, tone: neutral };

### [P1] R2 key path mismatch between capture upload and submit `[unmatched]`

- **Slice:** W5-worker-leave-notif
- **Where:** `apps/backend/src/routes/worker-captures.ts:67 vs worker-submit-service.ts buildObjectKey`
- **What:** Upload uses auth.userId in path (User.id); submit uses workerId (Worker.id, different UUID). Mobile uploads photo to path A, submit creates VisitPhoto row pointing to path B. Orphaned R2 object, VisitPhoto.r2Key 404s.
- **Fix:** In worker-captures.ts, resolve Worker.id from auth.userId and pass to generateBatchUploadUrls instead of auth.userId.

### [P1] Redis fallback env var declared in ADR-0024 but Postgres fallback path not wired for rate limiting `[unmatched]`

- **Slice:** X1-connections-plumbing
- **Where:** `apps/backend/src/lib/redis-rate-limit.ts:115-133`
- **What:** ADR-0024 Rollback §1: 'Set AXHY_REDIS_FALLBACK_TO_POSTGRES=1 to short-circuit each consumer to its Postgres backup.' However, checkAndConsumeRateLimit only checks AXHY_RATE_LIMIT_FAIL_CLOSED (line 120). No Postgres-backed rate-limit check exists; the function only offers fail-open (allow all, line 132) or fail-closed (deny all). This contradicts the ADR's explicit fallback promise.
- **Fix:** Either: (a) Implement Postgres fallback rate-limit logic (store checks in a rate_limit_log table, compute sliding window in SQL), OR (b) update ADR-0024 Rollback to document the actual behavior: fail-open or fail-closed, with per-route env vars to override.

### [P1] Visit state transitions bypass state machine validation entirely `[unmatched]`

- **Slice:** X2-db-statemachines
- **Where:** `apps/backend/src/lib/services/visit-flagged-review-service.ts:176 and ai.ts:381 write Visit.state directly without using visitMachine`
- **What:** Both rejectFlaggedVisit (line 176) and the AI verification handler applyOutcome (line 381) write Visit.state directly using Prisma update(), never consulting or validating against visitMachine.canTransition or createActor. This violates the discipline stated in worker-otp-verified-service.ts:10-15.
- **Fix:** Refactor rejectFlaggedVisit and applyOutcome to use createActor + send event pattern from worker-otp-verified-service.ts:82-97. Compute the next state from visitMachine before writing, never hardcode.

### [P1] AI verification handler does not emit audit events on state transition `[unmatched]`

- **Slice:** X2-db-statemachines
- **Where:** `apps/backend/src/dispatcher/handlers/ai.ts:358-395 (applyOutcome function)`
- **What:** When the AI handler transitions Visit from AWAITING_VERIFICATION to VERIFIED or FLAGGED, no AuditEvent row is created. Compare to worker-submit-service.ts:105-111 which correctly records VISIT_SUBMITTED, and visit-flagged-review-service.ts:125 + 194 which record VISIT_RESOLVED/VISIT_REJECTED. AI verification is a critical state transition but leaves no audit trail.
- **Fix:** Inside the applyOutcome transaction at ai.ts:377-395, add recordAuditEvent call (imported from audit-event.js) with kind='AI_VERIFICATION', actorId set to a system identifier, and payload containing the AI recommendation and verification score.

### [P1] AI verification handler does not enqueue side-effect topics after state transition `[unmatched]`

- **Slice:** X2-db-statemachines
- **Where:** `apps/backend/src/dispatcher/handlers/ai.ts:377-395 (applyOutcome function)`
- **What:** After transitioning Visit to VERIFIED or FLAGGED, no outbox topics are enqueued. Compare to worker-submit-service.ts:116-120 which enqueues ai.verify topic after state change. The AI handler must trigger downstream consumers (billing, notifications, supervisor queue, etc.) via outbox.
- **Fix:** Inside the applyOutcome transaction, call enqueueOutbox(tx, { companyId, topic: 'visit.verified' or 'visit.flagged', payload: { visitId, ...} }) to notify downstream consumers. Determine which topics are needed from the data-flow §5 diagram.

### [P1] R2 key mismatch: upload presign uses User.id, submit reconstructs with Worker.id → orphaned objects + 404'ing VisitPhoto rows `[CONFIRMED]`

- **Slice:** X3-doc-vs-reality (capture-submission, submit, worker evidence lifecycle)
- **Where:** `apps/backend/src/routes/worker-captures.ts:84 vs apps/backend/src/lib/services/worker-submit-service.ts:88`
- **What:** POST /worker/captures/upload-urls passes auth.userId (User.id UUID) to generateBatchUploadUrls, generating R2 presign paths like v3-captures/{userId}/{visitId}/... Mobile uploads to those paths. But POST /worker/visits/:id/submit calls buildObjectKey(workerId, ...) where workerId is the Worker.id (different UUID). The VisitPhoto.r2Key column points to a non-existent R2 path.
- **Fix:** In worker-captures.ts:84, look up Worker.id from auth.userId (use resolveWorkerFromAuth helper per the code review) and pass Worker.id to generateBatchUploadUrls instead of auth.userId. Ensures upload paths match what submit reconstructs.

### [P1] Direct prisma.visit.update() setting state outside visitMachine (state-machine discipline violation) `[CONFIRMED]`

- **Slice:** X3-doc-vs-reality (capture-submission, submit, worker evidence lifecycle)
- **Where:** `apps/backend/src/lib/services/worker-submit-service.ts:94-101`
- **What:** The submitVisit service writes `state: 'AWAITING_VERIFICATION'` directly via tx.visit.update() instead of firing the PHOTOS_UPLOADED event through visitMachine.transition(). This violates the locked E5 rule (State Machine Discipline) that all state changes must go through the machine.
- **Fix:** Drive the state through visitMachine: createActor(visitMachine), send PHOTOS_UPLOADED event, then write the resulting state. See worker-otp-verified-service.ts:88-117 as the canonical pattern.

### [P2] Activity tab filter chips are visual-only; backend filtering not implemented `[REFUTED]`

- **Slice:** S1-supervisor-today
- **Where:** `apps/mobile/app/(supervisor)/activity.tsx:1-50 (renders filter chips); no GET /supervisor/activity backend route with query params`
- **What:** The Activity tab renders date/site/kind filter chips matching R6 design but tapping chips has no effect. The backend has no GET /supervisor/activity route that accepts ?date=today|yesterday|thisweek or ?siteId=UUID query parameters.
- **Fix:** Add GET /supervisor/activity backend route accepting ?date= and ?siteId= query params. Wire the mobile query hook to include these in the queryKey so TanStack Query invalidates on selection. Implement WHERE clauses in the activity data fetch to filter by date range and site.

### [P2] LAST SYNCED stale-cache banner missing from Activity tab `[CONFIRMED]`

- **Slice:** S1-supervisor-today
- **Where:** `apps/mobile/app/(supervisor)/activity.tsx (no weak-network banner implementation)`
- **What:** R6 design specifies Activity should render a weak-network banner 'LAST SYNCED {N} MIN AGO — REVERSE DISABLED' but this is not implemented in the mobile code. The audit marks this as FAIL.
- **Fix:** On Activity query stale (TanStack Query `isStale` flag set), compute minutes-since-last-successful-fetch and render the banner. Gate the REVERSE button disabled state based on this timestamp.

### [P2] Chat R6 surface not fully ported: older bubbles not dimmed 55% opacity `[REFUTED]`

- **Slice:** S1-supervisor-today
- **Where:** `apps/mobile/app/(supervisor)/chat.tsx (no 55% opacity styling on older messages)`
- **What:** R6 design calls for older chat bubbles to be dimmed at 55% opacity (per r5 design iteration). Current chat.tsx does not apply this styling. Audit scene 73 marks as FAIL.
- **Fix:** In chat message list rendering, apply `opacity: 0.55` to messages beyond a time threshold (e.g., > 1 hour old). Ensure the threshold logic aligns with R6 prototype visual inspection.

### [P2] Decisions tab renders as honest shell but backend data route missing `[REFUTED]`

- **Slice:** S1-supervisor-today
- **Where:** `apps/mobile/app/(supervisor)/decisions.tsx (renders shell); no GET /supervisor/decisions route in apps/backend/src/routes/`
- **What:** Decisions tab code renders an empty-state shell with 'All caught up' messaging and 'Coming next' copy per R6 design, but the backend has no GET /supervisor/decisions route to serve the actual decision list when the routing slice is unpaused.
- **Fix:** No immediate fix needed (deferred feature). When resuming the routing slice, wire GET /supervisor/decisions backend route that composes the DecisionWorkspaceItem list grouped by section (NEEDS_YOU_NOW / ROUTINE / FAILED_REVIEW) per the Workflow Design Closure spec.

### [P2] LeaveRequest approve/reject and SwapRequest decide endpoints referenced but existence not verified `[unmatched]`

- **Slice:** S2-decisions
- **Where:** `apps/backend/src/lib/services/decisions-service.ts:620, 630, 730`
- **What:** leaveRequestSource constructs actions with endpoints `/leave-requests/${lr.id}/approve` and `/leave-requests/${lr.id}/reject`. swapRequestSource uses `/swap-requests/${sw.id}/decide`. These strings are hardcoded with no existence check. If the routes are not registered elsewhere in the backend, supervisor taps on these actions will 404.
- **Fix:** Either (a) grep codebase to verify routes exist and are registered, or (b) add a boot-time registration sanity check that validates all hardcoded endpoint strings against the Fastify router state.

### [P2] FAILED_REVIEW section declared in schema but no source populates it — supervisors will never see flagged visits `[unmatched]`

- **Slice:** S2-decisions
- **Where:** `apps/backend/src/lib/services/decisions-service.ts:49, 177-181, 851-859`
- **What:** DecisionSectionSchema includes FAILED_REVIEW. The builder counts failedReview rows (line 420). But no DecisionSource loads FAILED_REVIEW rows. supervisorDecisionSource assigns NEEDS_YOU_NOW or ROUTINE via assignSectionForTier() (line 856). leaveRequestSource assigns NEEDS_YOU_NOW or ROUTINE via leaveSection(). swapRequestSource assigns NEEDS_YOU_NOW or ROUTINE via swapSection(). No visitFlaggedSource exists.
- **Fix:** Deferred. Future Sprint 3 must implement visitFlaggedSource that loads Visit WHERE flagged=true and projects rows into FAILED_REVIEW section with [Resolve, Reject] actions. Until then, failedReview count will always be 0.

### [P2] /decisions/:id/apply adapter does not pre-validate payload schema before forwarding to /chat/apply `[unmatched]`

- **Slice:** S2-decisions
- **Where:** `apps/backend/src/routes/supervisor-decisions.ts:243-246`
- **What:** The adapter reads SupervisorDecision.payload and forwards it as toolInput to /chat/apply without validating it matches the tool's ApplyDecisionCardInput schema. If a row has malformed payload (e.g., missing required fields), the downstream /chat/apply will fail with a cryptic validation error instead of the adapter returning a clear error.
- **Fix:** Pre-validate toolInput against decisionSpecByKind[row.kind]'s input schema before forwarding. Or add detailed error logging so operators can debug malformed decision rows.

### [P2] Kill switch only controls retrieval, not embedding; embeddings continuously collected when kill switch disables semantic path `[unmatched]`

- **Slice:** S3-chat-ai-livingdoc
- **Where:** `chat.ts:1362 (embedTurnAsync unconditional) vs semantic-context.ts:481 (kill switch checked inside)`
- **What:** SEMANTIC_CONTEXT_KILL_SWITCH controls assembleSemanticContext fallback (semantic-context.ts:481) but embedTurnAsync fires UNCONDITIONALLY at chat.ts:1362 regardless. If ops disables semantic retrieval, embeddings keep getting created, wasting cost and DB I/O.
- **Fix:** Check kill switch before line 1362: `if (process.env.SEMANTIC_CONTEXT_KILL_SWITCH !== 'true') { embedTurnAsync(...) }`

### [P2] Entity hints return generic placeholder text, not actual entity names; Phase 4 work shipped in Phase 2 `[unmatched]`

- **Slice:** S3-chat-ai-livingdoc
- **Where:** `semantic-context.ts:423-441`
- **What:** extractEntityHints detects find_workers calls but returns 'Workers recently discussed (see prior messages)' (line 437), placeholder. Full entity resolution deferred to Phase 4 per comment (line 414). Current implementation provides no context savings.
- **Fix:** Either implement full entity name resolution, return null (defer to Phase 4), or update JSDoc to clarify stub status.

### [P2] LivingDoc.version assumed to increment on rule update, but write path not verified in chat flow `[unmatched]`

- **Slice:** S3-chat-ai-livingdoc
- **Where:** `chat.ts:952 (livingDocVersion read) vs living-doc.ts (write path unclear)`
- **What:** Chat.ts passes livingDocVersion to openaiToolLoop (line 952) to bust OpenAI cache. Version supposed to increment when supervisor saves rule via propose_living_doc_update. But code path for writing new version after applying rule not visible in chat flow.
- **Fix:** Trace applyProposedDecision→domain-write for propose_living_doc_update; verify it calls `livingDoc.update({ version: { increment: 1 } })`. If not, add increment.

### [P2] Race condition: reverse window timeout between tap and modal submit `[unmatched]`

- **Slice:** S4-activity
- **Where:** `apps/mobile/app/(supervisor)/activity.tsx:961-969 (handleReverse tap) vs apps/backend/src/lib/services/activity-reverse-service.ts:140-143 (backend check)`
- **What:** When supervisor taps Reverse near 30-min boundary, handleReverse checks isWithinReverseWindow and routes to ReverseConfirmModal. If window closes while modal is open (user typing), submit fails with WINDOW_CLOSED, but supervisor is in wrong modal (Reverse instead of Soft-Flag).
- **Fix:** On ReverseConfirmModal submit error with WINDOW_CLOSED code, automatically close reverse modal and open soft-flag modal with same row. Or handle 422 WINDOW_CLOSED from mutation and route appropriately.

### [P2] No UX feedback when reverse/soft-flag succeeds `[unmatched]`

- **Slice:** S4-activity
- **Where:** `apps/mobile/lib/queries/use-activity-reverse.ts:72-84 (onSuccess) vs apps/mobile/app/(supervisor)/activity.tsx:976-979 (closeReverseModal)`
- **What:** When reverse/soft-flag succeeds, mutation invalidates feed and modal closes without displaying success. Supervisor doesn't know if operation succeeded or just refreshed — feels like glitch not completion.
- **Fix:** Add success toast when mutation succeeds with message like 'Action reversed. The change has been recorded.' Consider brief summary of what was undone.

### [P2] Binding expiry sweep cron not wired; only read-time check implemented `[unmatched]`

- **Slice:** S5-coverage-people-ops
- **Where:** `apps/backend/src/jobs/binding-expire-sweep.ts (exists but not registered); effective-responsibility.ts:72-74 (read-time only)`
- **What:** The responsibility-model §5.3 specifies both cron sweep AND read-time check for 'defense in depth'. The code implements only read-time: getEffectiveBinding checks `(effectiveUntil IS NULL OR effectiveUntil > T)` and silently excludes expired rows. The binding-expire-sweep.ts file exists but is not registered as a periodic cron job in any dispatcher or job-queue handler.
- **Fix:** Register binding-expire-sweep as a cron job (e.g., every 30 seconds or hourly per P1.5 plan). The file exists; wire it into the dispatcher or scheduled-jobs handler. Emit BINDING_ENDED_AUTO audit events for each expired row closed. Verify in integration tests that expired rows are swept regardless of whether supervisors query APIs.

### [P2] Replacement invite expiry sweep not registered as cron; only manual test coverage `[unmatched]`

- **Slice:** S5-coverage-people-ops
- **Where:** `apps/backend/src/lib/services/replacement-invite-service.ts:36-39 (function defined); no cron registration found`
- **What:** The sweepExpiredReplacementInvites function is documented (line 36-39) but the function body is not shown. The comment says the cron should 'UPDATE all PENDING past expiresAt to EXPIRED' and emit SupervisorDecision rows. However, grep shows no cron job registers this sweep in the dispatcher.
- **Fix:** Register a sweepExpiredReplacementInvites cron job (e.g., every 30 seconds) that: (1) finds all PENDING invites where expiresAt < now; (2) updates status to EXPIRED; (3) emits REPLACEMENT_INVITE_OUTCOME audit; (4) pushes supervisor with outcome. Add test case for cron behavior separate from app-poll behavior.

### [P2] Swap request decide route missing 'initiator can also decide' logic per spec `[unmatched]`

- **Slice:** S5-coverage-people-ops
- **Where:** `apps/backend/src/routes/swap-requests.ts:185-196`
- **What:** The POST /swap-requests/:id/decide route (lines 185-196) implements a portfolio check: only the supervisor currently responsible for the site can decide. However, the logic at line 192 also checks `const isInitiator = swap.supervisorId === auth.userId` but this is only used as a local variable and never appears in the authorization decision. The route rejects with 403 NOT_RESPONSIBLE if the caller is neither the initiator NOR the current responsible supervisor, but the condition at line 194 only checks `isResponsibleSupervisor`, not `isInitiator`.
- **Fix:** Change line 194-195 logic from `if (!isInitiator && !isResponsibleSupervisor)` to `if (!isInitiator && !isResponsibleSupervisor)` to include the isInitiator check in the final authorization. Verify in tests that an initiator can always decide on their own swap, even if they're no longer responsible for the site.

### [P2] No validation of mixed-tier digest constraint — spec forbids mixing `[REFUTED]`

- **Slice:** S6-updates
- **Where:** `apps/backend/src/routes/supervisor-updates.ts (future POST handler)`
- **What:** Spec §5.1: 'An `HRUpdate` digest MUST have all child `HRUpdateRule` rows sharing the same `tier`. If HR tries to post a digest with mixed tiers (e.g., 4 OPERATIONAL + 1 EMPLOYMENT rule), `POST /hr-updates` rejects with `MIXED_TIER_NOT_ALLOWED`.' Schema has no tier field (BUG-006), so this check is impossible today. When tier is added, the POST handler must validate.
- **Fix:** In POST /hr-updates handler, after parsing rules array: if (rules.length > 1) { const tiers = new Set(rules.map(r => r.tier)); if (tiers.size > 1) { return reply.code(400).send({error: 'MIXED_TIER_NOT_ALLOWED', message: 'All rules in a digest must share the same tier'}); } } Emit this check before creating rows.

### [P2] X-HR-Update-Warning header never sent on soft cap > 10 rules `[REFUTED]`

- **Slice:** S6-updates
- **Where:** `apps/backend/src/routes/supervisor-updates.ts (future POST handler)`
- **What:** Spec §7: 'if `rules.length > 10`, return a warning header (`X-HR-Update-Warning: SOFT_CAP_EXCEEDED`) but do NOT reject. Soft cap, per Phase B pick.' The POST /hr-updates handler must check rule count and emit header if > 10.
- **Fix:** In POST /hr-updates, after rules validation: if (rules && rules.length > 10) { reply.header('X-HR-Update-Warning', 'SOFT_CAP_EXCEEDED'); } Proceed to create normally. Optionally log this event for observability (HR admin may want to know when soft cap is hit).

### [P2] Wages This Week card is a non-functional placeholder `[unmatched]`

- **Slice:** S7-summary-memory
- **Where:** `apps/mobile/app/(supervisor)/summary.tsx:113-120`
- **What:** The WAGES THIS WEEK section displays only a placeholder message 'Wages computed at end of week' with a clock icon. The design spec calls for an actual card showing '₹1,24,300 etc. with stacked bar — worked/OT/final percentages'.
- **Fix:** Add wages computation to buildSummaryForSupervisor in summary-service.ts; extend SummaryResponseT schema with wage fields; update summary.tsx to display the computed wages breakdown in a stacked bar component.

### [P2] Summary screen lacks 'Refresh from server' button per design spec `[unmatched]`

- **Slice:** S7-summary-memory
- **Where:** `apps/mobile/app/(supervisor)/summary.tsx:44-135`
- **What:** The design spec (2026-05-12 line 38) specifies a 'Refresh from server' button on the Summary surface. The implementation has no such button; users cannot manually trigger a summary refresh.
- **Fix:** Add a Pressable button (e.g., with Feather 'refresh-cw' icon) that calls summary.refetch() from the useQuery hook result.

### [P2] Drawer item subtitles are omitted (intentional regression from design spec) `[unmatched]`

- **Slice:** S7-summary-memory
- **Where:** `apps/mobile/components/Drawer.tsx:85-124`
- **What:** The design spec (lines 65-74) calls for drawer items to show descriptive subtitles like 'Memory & rules · 23 rules · 12 aliases · 8 site notes', 'My sites · 8 sites · 3 with active rules'. The current implementation sets sub: null for most items (lines 114-117, 121-122), showing only icons + labels.
- **Fix:** Query data sources for each drawer item: (1) LivingDoc total rule count, (2) Site count + rule count per site, (3) Reload context budget (already done at line 112). Wire these queries into buildDrawerItems() and conditionally render sub only when data is available and not placeholder.

### [P2] AI pause flag is set but never consumed by chat input `[unmatched]`

- **Slice:** S7-summary-memory
- **Where:** `apps/mobile/components/Drawer.tsx:235-255 (sets flag), no consumer`
- **What:** The 'Temporary mode' drawer item (design-doc:65, item #7) opens a PauseAIModal that sets 'axhy_ai_paused_until' in secure storage (Drawer.tsx:246). The design spec calls for this to 'Pause AI for the day'. However, no code in ChatInput or chat capture path reads this flag to suppress decision extraction.
- **Fix:** In chat-api.ts or the chat input handler, check 'axhy_ai_paused_until' before sending messages to the AI decision-extraction backend. Skip extraction if current time is before the stored deadline.

### [P2] Profile screen documentation claims Resign button but implementation is absent `[unmatched]`

- **Slice:** S7-summary-memory
- **Where:** `apps/mobile/app/(supervisor)/me.tsx:1-8 (claim) vs 388-603 (no button)`
- **What:** The file header comment (lines 4-7) states 'A Resign button is shown at the bottom (below Sign out). Tap opens a confirmation modal requiring the user to type "RESIGN" before POST /me/resign fires. On success: onAppLogout() + router.replace(/(auth)/phone).' The actual ProfileScreen implementation has no Resign button or confirmation modal.
- **Fix:** Add POST /me/resign endpoint in backend/src/routes/me.ts. Add a ConfirmResignModal component in me.tsx that requires the user to type 'RESIGN' to confirm. Wire the Resign button (added after Sign Out) to open the modal and call the endpoint.

### [P2] Summary timeline does not support filtering by tier; design calls for DecisionsTodaySheet `[unmatched]`

- **Slice:** S7-summary-memory
- **Where:** `apps/mobile/app/(supervisor)/summary.tsx:92-111 + shared-schema src/zod/summary.ts:36-47`
- **What:** The design spec (2026-05-12 line 38) calls for 'TIMELINE list → DecisionsTodaySheet (filter by tier)'. The implementation shows a flat, non-interactive timeline list. Users cannot filter by decision tier (note/operational/personnel/employment/review_required).
- **Fix:** Extend SummaryTimelineEntry to include a tier field. Add a DecisionsTodaySheet modal (similar to FlaggedReviewSheet design) that shows the timeline with tier-based filter chips. Make TimelineRow tappable to open the sheet filtered to that row's tier.

### [P2] Notification preferences persist locally but never sync to backend `[unmatched]`

- **Slice:** S7-summary-memory
- **Where:** `apps/mobile/app/(supervisor)/me.tsx:423-443 + 540-585`
- **What:** The NOTIFICATIONS section (lines 541-585) has three toggles (Push, WhatsApp, Email). Line 540 comment states 'Local-only this slice; backend membership.notificationPrefs wire-up is a follow-up.' Changes persist to SecureStore but are never sent to the backend.
- **Fix:** Create PATCH /me/notification-prefs endpoint in backend. In me.tsx, add an async function that POSTs preference changes after updating local state. Ensure the API response is validated before confirming the toggle.

### [P2] OTP verify 401 response on already-consumed code lacks clarity for retry logic `[CONFIRMED]`

- **Slice:** W1-auth-identity
- **Where:** `apps/backend/src/routes/auth.ts:75-79`
- **What:** When OTP is invalid, expired, or already consumed, the route returns 401 OTP_INVALID with the same message regardless of the reason. The mobile OTP screen (apps/mobile/app/(auth)/otp.tsx:99) shows a generic 'Wrong code' error without distinguishing whether the user should resend or try typing again.
- **Fix:** Extend the error response to include a reason code (e.g., EXPIRED, CONSUMED, INVALID) so mobile can show contextual messaging.

### [P2] Worker OTP transition fires best-effort without blocking auth; failure is silent to user `[CONFIRMED]`

- **Slice:** W1-auth-identity
- **Where:** `apps/backend/src/routes/auth.ts:134-160`
- **What:** When a WORKER's OTP is verified, the workerOtpVerifiedService is called inside a transaction with a 15s timeout. If the transition fails (worker not found, machine error, etc.), the error is logged as a warning (line 155-158) but the JWT is still issued. The user sees no indication the transition failed.
- **Fix:** Either (1) make the transition synchronous and required (block token issue on failure), or (2) expose the transition result in the VerifyOTPOutput so mobile can warn the user and retry if needed.

### [P2] No explicit verification that WORKER role accounts have valid Worker row on first auth `[CONFIRMED]`

- **Slice:** W1-auth-identity
- **Where:** `apps/backend/src/routes/auth.ts:134-145`
- **What:** When a user with WORKER membership passes OTP verify, the backend looks up a Worker row (line 142) only to fire the transition, but does not verify one exists or validate the userId-Worker link before issuing the JWT. If a Worker row is missing, the lookup returns null (line 145) and the service is skipped, but the JWT is issued anyway.
- **Fix:** Either (1) ensure Worker rows exist before membership is created, or (2) add a 400/403 error if WORKER role but no valid Worker row found, before issuing the JWT.

### [P2] WorkerHome greeting does not use worker name despite component having access to workerState `[REFUTED]`

- **Slice:** W2-worker-today
- **Where:** `apps/mobile/app/(worker)/(tabs)/index.tsx:112-117`
- **What:** getGreeting() returns time-based greeting ('Good morning/afternoon/evening') without worker name. WorkerTodayOutput includes workerState but not name. Memo (line 67) explicitly defers name hydration to slice 3. The greeting on line 267 is `{greeting}` alone, not personalized.
- **Fix:** Slice 3 should add Worker.name to WorkerTodayOutput and pass to getGreeting() as a parameter for '{name}, {greeting}' pattern.

### [P2] NextSiteCard distance prop always null; location feature stubbed `[CONFIRMED]`

- **Slice:** W2-worker-today
- **Where:** `apps/mobile/app/(worker)/(tabs)/index.tsx:298`
- **What:** NextSiteCard is always passed `distance={null}` (line 298). Component accepts optional distance and renders it (lines 86-90), but home never computes it. Memo (line 71) lists 'Map preview — Placeholder. Needs `expo-location` permission — slice 2b'.
- **Fix:** Slice 2b should integrate expo-location, compute client-side distance, and pass to NextSiteCard. No action needed for 2a-2.

### [P2] Catch block swallows polling errors silently forever `[REFUTED]`

- **Slice:** W3-capture
- **Where:** `submit.tsx:213-217`
- **What:** Polling catch block (line 213) only checks if count >= POLL_MAX to exit. Network errors are swallowed. If all polls fail but count < POLL_MAX, worker sees 'Verifying photos...' spinning forever.
- **Fix:** Track consecutive-error count. After N failures (e.g., 3), exit polling and set state='error' with retry button.

### [P2] setInterval with overlapping async callback fragile pattern `[REFUTED]`

- **Slice:** W3-capture
- **Where:** `submit.tsx:176-222`
- **What:** setInterval with async fetchVerifyStatus callback. If poll takes >3s, next tick fires while previous still in-flight. CRIT-5 (lines 186-188) mitigates with pollInFlightRef but pattern is fragile.
- **Fix:** Replace setInterval with recursive setTimeout: call setTimeout at poll completion, not setInterval at start. Guarantees no overlap.

### [P2] StateBadge crashes on unknown visit state `[CONFIRMED]`

- **Slice:** W3-capture
- **Where:** `components/worker/StateBadge.tsx:57-58`
- **What:** StateBadge accesses STATE_MAP[state] without fallback. Unknown state → undefined.tone → TypeError. React boundary catches but badge breaks.
- **Fix:** Add fallback: `const meta = STATE_MAP[state] ?? { label: state, tone: 'neutral' };`

### [P2] VisitPhoto bulk-insert not idempotent; duplicate submit creates multiple rows `[CONFIRMED]`

- **Slice:** W3-capture
- **Where:** `worker-submit-service.ts:92`
- **What:** createMany({ data: photoRows }) has no deduplication. Submit called twice on PHOTOS_PENDING → duplicate VisitPhoto rows. No unique constraint on (visitId, side, r2Key).
- **Fix:** Add unique constraint @@unique([visitId, side, r2Key]) or use createMany({ ..., skipDuplicates: true }).

### [P2] Timer elapsed resets on app kill if startedAt query hasn't loaded `[REFUTED]`

- **Slice:** W3-capture
- **Where:** `timer.tsx:81-82, 104-117`
- **What:** Timer shows elapsed from startedAt when query has data, else local count-up. App kill + slow query reload → startedAt null → timer resets to 00:00. Worker reopens and sees 00:00 instead of actual elapsed.
- **Fix:** Persist visit.startedAt to localStorage on first clock-in. On cold-start, restore from localStorage as fallback.

### [P2] captureMachine defined but unused in submit.tsx `[CONFIRMED]`

- **Slice:** W3-capture
- **Where:** `capture.ts:1-106; submit.tsx:55-82`
- **What:** captureMachine (IDLE/CAPTURING/SUBMITTED) fully specified but submit.tsx uses local ScreenState enum. No dispatch to machine. Machine is unused by the flow it was designed for.
- **Fix:** Delete captureMachine (if premature) OR migrate submit.tsx to captureMachine.send() + state snapshots.

### [P2] History screen query lacks startedAt/completedAt cleaning duration timestamps `[CONFIRMED]`

- **Slice:** W4-history-profile
- **Where:** `apps/backend/src/lib/services/worker-today-service.ts:243-252 vs apps/mobile/app/(worker)/(tabs)/history.tsx:153`
- **What:** WorkerHistoryOutput type (worker-today.d.ts:160-178) intentionally omits startedAt and completedAt fields, while WorkerTodayOutput (lines 46-49) includes them. The History screen displays 'Recent verified and closed work' but cannot show when the worker clocked in/out or how long they worked, despite these fields existing in the Visit table and being fetched by the same service.
- **Fix:** Add startedAt and completedAt (as ISO timestamps or null) to WorkerHistoryOutput schema (worker-today.d.ts + source worker-today.ts) and the history response mapping (worker-today-service.ts:243-252). Update history.tsx to optionally display duration if available.

### [P2] Profile 'Verified' badge doesn't reflect actual worker state (ON_SUSPENSION/BLOCKED/etc) `[CONFIRMED]`

- **Slice:** W4-history-profile
- **Where:** `apps/mobile/app/(worker)/(tabs)/profile.tsx:132-135`
- **What:** The Profile screen hardcodes a 'Verified' badge with shield icon (lines 132-135) regardless of the worker's actual state. WorkerTodayOutput includes workerState (can be INVITED, PENDING_ACTIVATION, ACTIVE, ON_LEAVE, ON_SUSPENSION, BLOCKED, DOC_PENDING, INACTIVE, etc. per worker-today.d.ts:34), but the profile never reads or displays it. A suspended worker sees 'Verified' — misleading.
- **Fix:** Update the badge logic to check data.workerState and conditionally render based on worker state: ACTIVE → 'Verified'; BLOCKED/ON_SUSPENSION → 'Account paused' or 'Under review'; etc. See home screen's PAUSED_STATES set (home/index.tsx:66) for the pattern.

### [P2] LeaveRequest/SwapRequest bypass state machines; use raw enum updates `[unmatched]`

- **Slice:** W5-worker-leave-notif
- **Where:** `leave-requests.ts:269-276, swap-requests.ts:203-208`
- **What:** State columns updated directly via Prisma without machine transitions. Plan rule 1 says every state mutation must go through machine function.
- **Fix:** Create leaveRequestMachine, swapRequestMachine, grievanceMachine with .test.ts. Refactor to use machine transitions instead of direct updates.

### [P2] No worker-callable POST /worker/leave-requests endpoint `[unmatched]`

- **Slice:** W5-worker-leave-notif
- **Where:** `routes/leave-requests.ts line 85-133 is NOT wired; only approve/reject routes exist`
- **What:** Service exists but endpoint not exposed to workers. Only supervisor approval/rejection routes registered. Workers cannot file leave requests.
- **Fix:** Add worker-callable POST /worker/leave-requests route gating on requireWorkerRole, calling createLeaveRequestService. Wire to mobile API_ROUTES.

### [P2] No worker-callable POST /worker/swaps endpoint for Cant make this action `[unmatched]`

- **Slice:** W5-worker-leave-notif
- **Where:** `swap-requests.ts:44-124 (supervisor-only, no worker variant)`
- **What:** POST /swap-requests requires SUPERVISOR role. Plan specifies worker Cant make this sheet should fire POST /worker/swaps. Doesnt exist.
- **Fix:** Create POST /worker/swaps endpoint with different authorization + semantics from supervisor variant.

### [P2] Notifications feature completely missing; no /worker/notifications endpoint `[unmatched]`

- **Slice:** W5-worker-leave-notif
- **Where:** `No GET /worker/notifications route; no mobile useWorkerNotificationsQuery`
- **What:** Plan specifies Day 3 Notifications list (bell icon) with replacement invites, supervisor decisions, system notices. Completely absent.
- **Fix:** Implement GET /worker/notifications with cursor pagination. Create useWorkerNotificationsQuery. Create notifications list screen with Accept/Decline actions.

### [P2] IdempotencyKey cache lacks automatic cleanup; relies on application reads for expiry detection `[CONFIRMED]`

- **Slice:** X1-connections-plumbing
- **Where:** `apps/backend/src/lib/idempotency-key.ts:80-108, schema.prisma:485-486`
- **What:** The `checkIdempotencyKey` function detects stale rows (expiresAt < now) and treats them as cache miss (line 96) but does NOT delete them. The comment (97-101) explicitly states this avoids concurrent-delete races. The schema has an expiresAt index (supporting 'future cleanup job') but no sweep job exists. Stale rows accumulate indefinitely in the IdempotencyKey table.
- **Fix:** Implement a periodic sweep job (once per hour, off-peak) that deletes idempotency rows where expiresAt < NOW(). Run via an outbox topic 'idempotency.sweep' + handler, or as a cron job outside the dispatcher.

### [P2] Idempotency cleanup handler not registered; stale IdempotencyKey rows never auto-expire `[CONFIRMED]`

- **Slice:** X1-connections-plumbing
- **Where:** `apps/backend/src/dispatcher/handlers/registry.ts:29-47`
- **What:** The registry has handlers for hr.worker*absent, payroll.recompute, ai.verify, owner.ai_budget*\*, and notification.supervisor_change, but NO handler for idempotency cleanup. The IdempotencyKey table schema assumes a cleanup job (expiresAt column + index), and idempotency-key.ts:37 mentions 'future cleanup job', but the job is never enqueued or dispatched.
- **Fix:** Create an outbox topic 'idempotency.sweep' with a handler that executes: DELETE FROM IdempotencyKey WHERE expiresAt < NOW() AND companyId = $1 (per-company, bounded) Add it to the registry at line 47. Enqueue via a scheduled outbox emit from the dispatcher loop or a cron job.

### [P2] Transient network error on /auth/refresh doesn't retry; user sees frozen app on brief outages `[CONFIRMED]`

- **Slice:** X1-connections-plumbing
- **Where:** `apps/mobile/lib/api.ts:206-216`
- **What:** When /auth/refresh fails with a network timeout or 5xx error (line 206-216), the code throws the error WITHOUT retrying the refresh itself. The only retry is on the original request (line 202 does ONE retry). If the backend is down for 30-60s, the user's session appears broken because refresh fails, original request fails, and the mutex prevents further refresh attempts until the next 401.
- **Fix:** Implement exponential backoff retry on the refresh endpoint itself (not just the original request). Wait 2s, retry; on failure wait 4s, retry; on failure wait 8s, retry. Or show a 'reconnecting...' banner instead of throwing immediately.

### [P2] Token epoch revocation race: membership epoch incremented but old token may still be valid if checked before refresh `[REFUTED]`

- **Slice:** X1-connections-plumbing
- **Where:** `apps/backend/src/middleware/tenant-context.ts:112-139`
- **What:** When an HR admin revokes a membership (incrementing tokenEpoch), the next access token presented to the backend is checked against the DB (line 124). But if the worker's access token was already issued with epoch N, and admin increments to N+1, the worker can still use their old token until it naturally expires (15min) or until they refresh (which re-reads epoch). The revocation is NOT instant; it's revocation-on-refresh or revocation-on-expiry.
- **Fix:** Document this grace period in onboarding/ops docs. Consider adding optional membership-status polling to the mobile app if instant revocation is contractually required.

### [P2] Redis namespace defaults to NODE_ENV; staging/prod both using NODE_ENV='production' will collide `[CONFIRMED]`

- **Slice:** X1-connections-plumbing
- **Where:** `apps/backend/src/lib/redis-keys.ts:21`
- **What:** The namespace is computed as `AXHY_REDIS_NAMESPACE ?? process.env.NODE_ENV ?? 'development'`. If both staging and production deploy with NODE_ENV='production' (common in IaC configs), they use the same 'production:' prefix. If both environments point to the same Redis instance (cost-saving or migration scenario), keys collide: rate-limit for user A in staging overwrites rate-limit for user A in prod.
- **Fix:** Default AXHY_REDIS_NAMESPACE to a more unique value (e.g., hostname, Railway_ENVIRONMENT, or a per-stage UUID). Or add a startup assertion that requires AXHY_REDIS_NAMESPACE to be explicitly set in production (fail fast if unset).

### [P2] AI handler visit update missing companyId in where clause `[unmatched]`

- **Slice:** X2-db-statemachines
- **Where:** `apps/backend/src/dispatcher/handlers/ai.ts:378-379`
- **What:** The applyOutcome function updates Visit using only visitId in the where clause: `where: { id: visitId }`. The VisitPhoto update at line 387-388 correctly includes both visitId and companyId, but the Visit update does not. If another tenant happens to have a Visit row with the same UUID (cryptographically unlikely but possible), the update could affect the wrong tenant's data.
- **Fix:** Change the Visit update where clause at line 378 to: `where: { id: visitId, companyId }` to match the pattern used in VisitPhoto update at line 387. This adds belt-and-suspenders multi-tenant safety.

### [P2] visit-flagged-review-service comment claims non-existent states are in the 12-state machine `[unmatched]`

- **Slice:** X2-db-statemachines
- **Where:** `apps/backend/src/lib/services/visit-flagged-review-service.ts:42-45`
- **What:** The comment states: 'The 12-state VisitState v1.1 machine (schema.prisma line 227) allows REJECTED from any state where the worker has actually submitted evidence.' This is incorrect: REJECTED is not in the 12-state machine's VisitStateValue union at all. The state values are: SCHEDULED, NOTIFIED, EN_ROUTE, ON_SITE, IN_PROGRESS, PHOTOS_PENDING, AWAITING_VERIFICATION, VERIFIED, FLAGGED, CANCELLED, NO_SHOW, ARCHIVED.
- **Fix:** Audit the actual machine definition, update or add the missing states/transitions, and update the comment to match the truth of what the machine actually allows. Or admit that this service does not use the machine and remove the false claim.

### [P2] Activity tab filter chips wired to UI but not backend `[unmatched]`

- **Slice:** X3-doc-vs-reality
- **Where:** `apps/mobile/app/(supervisor)/activity.tsx (chip tap handlers)`
- **What:** Filter chips (Today/Yesterday/This week, All sites) render and appear tappable but don't wire filterState to the activity API query; backend activity-service.ts has no filter input parameters
- **Fix:** Add queryParam filters to GET /supervisor/activity route; update activity-service.ts signature to accept {dateFilter?, siteId?, kindFilter?}; wire chip tap handlers to call apiFetch with updated params

### [P2] Stale-cache refresh banner missing `[unmatched]`

- **Slice:** X3-doc-vs-reality
- **Where:** `apps/mobile/app/(supervisor) and (worker) screens: no staleness UI`
- **What:** R6 spec includes 'LAST SYNCED N MIN AGO' banner with pull-to-refresh affordance; mobile Today, Activity, Chat have no ReactQuery staleness indicator or refresh timestamp display
- **Fix:** Add useIsFetching() hook to Today/Activity; render '<span>Last synced {formatRelative(queryTime)}</span>' below content; wire pull-to-refresh via RefreshControl on ScrollView

### [P2] Chat missing voice waveform recorder and transcription metadata `[unmatched]`

- **Slice:** X3-doc-vs-reality
- **Where:** `apps/mobile/app/(supervisor)/chat.tsx: text input only`
- **What:** R6 spec shows voice waveform recorder pill with mic icon, live waveform, duration, and transcription metadata ('te → en · transcribed · ⚠ MEDIUM confidence'). Mobile chat only has text input + OS dictation emoji
- **Fix:** Integrate expo-av + create VoiceRecorder component with waveform (react-native-waveform); emit transcription metadata from /chat/messages backend; render overlay bubble with language/confidence tags above message

### [P2] Activity row shape and icons don't match R6 `[unmatched]`

- **Slice:** X3-doc-vs-reality
- **Where:** `apps/mobile/app/(supervisor)/activity.tsx: ActivityRow rendering`
- **What:** R6 shows per-row Feather icons, proper 'HH:MM' timestamp format on right, 3 separate filter rows (date/site/kind), and active-chip terracotta highlighting. Mobile shows single chip row, relative-time 'Xd ago' format, no row icons, no active-chip color
- **Fix:** Add kindToIcon map (CLOCKED_IN→'clock', SUBMITTED→'check', etc); render Feather icon + event.kind label per row; change timestamp to toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'}); reorganize filters into 3 rows with terracotta highlight on active chip

### [P2] StateBadge crashes on unknown visit state (defensive missing) `[CONFIRMED]`

- **Slice:** X3-doc-vs-reality (capture-submission, submit, worker evidence lifecycle)
- **Where:** `apps/mobile/components/worker/StateBadge.tsx:57-58`
- **What:** StateBadge has a hardcoded STATE_MAP with 12 entries. If any visit has a state not in the map (new state added to machine, or typo), accessing STATE_MAP[state] returns undefined, causing 'Cannot read properties of undefined (reading tone)' crash. React error boundary recovers but the badge breaks for that visit.
- **Fix:** Replace hardcoded map lookup with: `const meta = STATE_MAP[state] ?? { label: state, tone: 'neutral' };`. Broken-state visits then render raw label in neutral pill instead of crashing.

### [P3] Profile language picker and notification prefs toggle not wired `[REFUTED]`

- **Slice:** S1-supervisor-today
- **Where:** `apps/mobile/app/(supervisor)/me.tsx:156 (TODO comment); no setLocale() call on selection; no POST /me/notification-prefs backend route`
- **What:** Profile tab renders UI for language selection and notification prefs toggle but neither feature is functional. Selecting a language does not call setLocale(). Toggling notification prefs does not POST to the backend.
- **Fix:** Language picker: on selection, call `setLocale()` from useLocaleStrings and persist to auth-store. Notification prefs: wire toggle to POST /me/notification-prefs on backend with preference payload.

### [P3] Profile switch-company flow is a stub; no multi-tenant supervisor support `[REFUTED]`

- **Slice:** S1-supervisor-today
- **Where:** `apps/mobile/app/(supervisor)/me.tsx (skeleton only, no route or logic implemented)`
- **What:** Profile renders a switch-company button/menu but no actual flow exists to let a supervisor with memberships at multiple companies pick which to supervise. Audit marks scenes 80, 119 as FAIL.
- **Fix:** Implement GET /me/companies to fetch user's memberships. Render a company picker modal on Profile. On selection, update auth-store context and navigate app to the selected company's supervisor surface.

### [P3] 30-site portfolio pagination not measured; perf at scale unverified `[CONFIRMED]`

- **Slice:** S1-supervisor-today
- **Where:** `apps/mobile/app/(supervisor)/today.tsx:92 (ScrollView with no explicit virtualisation); no 30-site test fixture in sandbox`
- **What:** Today screen uses plain ScrollView to render site cards. At high portfolio counts (30+ sites), performance has not been measured. Audit scene 7 marks as DEFERRED with no 30-site sandbox to test against.
- **Fix:** Create a 30-site test fixture in the sandbox. Measure p95 latency on `/supervisor/today` request and Today screen render. If render time exceeds 300ms, implement FlatList with initialNumToRender or consider windowed rendering with FlashList.

### [P3] DecisionCard actions fallback (Dismiss-only) will silently hide bugs in action[] population `[unmatched]`

- **Slice:** S2-decisions
- **Where:** `apps/mobile/components/decisions/DecisionCard.tsx:378-397`
- **What:** Line 378 checks `row.actions.length > 0`. If false, line 384-396 renders Dismiss-only button. Comment says this is for Wave-1 backwards compat, but all Wave 2 sources guarantee non-empty actions[]. If a future source accidentally returns empty actions[], the mobile UI will not warn — it will just show Dismiss, silently masking the bug.
- **Fix:** Either (a) add a non-empty constraint to the schema so empty actions[] cannot be sent, or (b) add a console.warn / logError when the fallback fires in development, or (c) explicitly reject empty actions[] in mobile query validation with a clear error.

### [P3] Two dismiss routes with inconsistent reason requirement — /decisions/:id/dismiss requires reason, /supervisor/decisions/:id/dismiss accepts optional `[unmatched]`

- **Slice:** S2-decisions
- **Where:** `apps/backend/src/routes/decisions.ts:49-53 vs supervisor-decisions.ts:113-118, 129`
- **What:** POST /decisions/:id/dismiss (decisions.ts line 143) parses body with DismissDecisionBody schema (lines 49-53) which has `reason: z.string().min(1).max(2000)` — REQUIRED. POST /supervisor/decisions/:id/dismiss (supervisor-decisions.ts line 97) parses with DismissDecisionInput which appears to accept optional reason (line 129 shows fallback). This creates an inconsistent API contract.
- **Fix:** Harmonize: decide if reason should be optional globally (and record 'dismissed without reason' consistently in both routes), or required in both. Recommend making both accept optional reason for user experience.

### [P3] Amend target not validated for chat-origin; can amend decisions made by direct forms `[unmatched]`

- **Slice:** S3-chat-ai-livingdoc
- **Where:** `chat.ts:761-773`
- **What:** Supervisor amend lookup validates companyId+supervisorId match (line 766) but not decision ORIGIN. Decision from attendance form (origin != 'CHAT') can be amended via chat, semantically wrong because no prior chat context existed.
- **Fix:** Add check: `if (target.origin !== 'CHAT') throw Error('Can only amend decisions made via chat')`

### [P3] Site filter uses targetId but some events lack site association `[unmatched]`

- **Slice:** S4-activity
- **Where:** `apps/backend/src/lib/services/activity-service.ts:151`
- **What:** Site filter at line 151 checks AuditEvent.targetId == siteId. But targetId is overloaded (site/worker/decision IDs). Some kinds (CHAT_MESSAGE_CREATED, DWI_PROPOSED, ACTIVITY_REVERSED) have no site — filtering by site may incorrectly include/exclude unrelated events.
- **Fix:** Refine query to check both kind (site-bound: BINDING\_\*, SITE_COMPLAINT_LOGGED) and validate targetId is actually a site UUID by joining Site table, or store siteId in payload JSON and filter there.

### [P3] Non-reversible kind routes to soft-flag but UI doesn't explain why `[unmatched]`

- **Slice:** S4-activity
- **Where:** `apps/mobile/app/(supervisor)/activity.tsx:247-248 (subtext) vs lines 961-968 (routing logic)`
- **What:** When supervisor taps Reverse on non-reversible kind (CHAT_MESSAGE_CREATED), routed to SoftFlagConfirmModal. Subtext says 'Window closed · soft-flag for HR', but real reason is kind not reversible. Supervisor may think they waited too long.
- **Fix:** Vary modal text based on why soft-flag triggered: 'This action type can't be reversed — soft-flag for HR to review' (non-reversible) vs 'Window closed · soft-flag for HR' (past deadline). Or add explanatory note in SoftFlagConfirmModal body.

### [P3] ReplacementInvite acceptance does not verify supervisor is responsible for the site `[unmatched]`

- **Slice:** S5-coverage-people-ops
- **Where:** `apps/backend/src/lib/services/replacement-invite-service.ts:238-350+ (acceptReplacementInvite)`
- **What:** The acceptReplacementInvite function accepts an invite and auto-creates a 1-day Assignment for the worker. However, the function does not verify that the supervisor who SENT the invite (fromSupervisorId) is currently the responsible supervisor for the site. The invite.siteId is read but not used to verify responsibility.
- **Fix:** Inside acceptReplacementInvite, after reading the invite, verify via getEffectiveBinding(tx, { companyId, siteId: invite.siteId, at: new Date() }) that the binding.userId === invite.fromSupervisorId. If the supervisor is no longer responsible, return a SUPERVISOR_NO_LONGER_RESPONSIBLE result and reject the accept with 403. Update test coverage.

### [P3] Worker primary site derivation uses `createdAt DESC` but Assignment.createdAt may not reflect actual assignment date `[unmatched]`

- **Slice:** S5-coverage-people-ops
- **Where:** `apps/backend/src/lib/effective-responsibility.ts:289-300, 303-308, 311-316`
- **What:** The deriveWorkerPrimarySiteId function uses `orderBy { createdAt: 'desc' }` to determine 'most-recent' assignments. However, Assignment rows can be created in bulk via batch operations or migrations, and createdAt may not reflect the actual operational date. An older assignment created 'today' in a bulk import could have a newer createdAt and overshadow a real active assignment created 'yesterday'.
- **Fix:** For Tier 1 (effective-at-T match), additionally sort by validFrom DESC to prefer the most-recently-starting assignment. Alternatively, use a 'operational assignment date' field (e.g., validFrom) as the tiebreaker instead of createdAt. Document the assumption in comments. Add test case with back-dated assignments.

### [P3] Sites screen and replacement picker do not show 'acting' indicator for supervisors `[unmatched]`

- **Slice:** S5-coverage-people-ops
- **Where:** `apps/mobile/app/(supervisor)/sites.tsx:50-74, replacement-picker.tsx:180-200`
- **What:** The sites.tsx SiteRow component renders site name, workers-on/due ratio, and flagged indicator, but does NOT show whether the supervisor is ACTING (temporary) vs PERMANENT (portfolio) responsible for the site. The replacement picker likewise shows candidate workers but not their ACTING vs PERMANENT site assignments, making it ambiguous whether a candidate is from the supervisor's portfolio or is temporarily filling cover.
- **Fix:** Add a small badge or icon (e.g., 'ACTING' or a clock icon) next to site names when the supervisor's binding is TEMPORARY (actingForUserId != null). In replacement picker, show binding kind next to candidate current-site. Query getEffectiveBinding for each site to get the binding kind, pass through Today query or fetch separately in mobile. Low priority but high UX value.

### [P3] Leave request approval/rejection does not check if worker is already on leave during the requested period `[unmatched]`

- **Slice:** S5-coverage-people-ops
- **Where:** `apps/backend/src/routes/leave-requests.ts:237-262`
- **What:** When a supervisor or HR approves a leave request, the code updates LeaveRequest.state to APPROVED but does NOT verify that the worker is not already APPROVED for an overlapping leave period. If two supervisors approve overlapping leaves for the same worker (one from day 1-5, another from day 3-7), both will be marked APPROVED, creating a conflicting state in attendance.
- **Fix:** Before updating LeaveRequest state to APPROVED, query for any other APPROVED leaves with overlapping date ranges: `state='APPROVED' AND workerId=? AND ((fromDate <= ? AND toDate >= ?) OR ...)`. Reject with 409 LEAVE_OVERLAP if found. Add test case with concurrent overlapping leave approvals.

### [P3] Missing runtime validation of consent policy version on accept `[CONFIRMED]`

- **Slice:** W1-auth-identity
- **Where:** `apps/backend/src/routes/worker-consent.ts:67`
- **What:** The consent route accepts any policyVersion string from the client request body (SubmitConsentInput.safeParse at line 57) and writes it verbatim to ConsentLog without validating it matches a known policy release.
- **Fix:** Add a const KNOWN_POLICY_VERSIONS or similar on backend; reject 400 if the provided version is not in the list.

### [P3] Consent endpoint does not prevent double-consent or check if user already accepted same policy version `[CONFIRMED]`

- **Slice:** W1-auth-identity
- **Where:** `apps/backend/src/routes/worker-consent.ts:60-68`
- **What:** Every call to POST /worker/consent appends a new ConsentLog row, even if the user already accepted the same policyVersion. The mobile consent.tsx line 52-55 treats 409 (already consented) as success, but the backend has no 409 logic — it always appends.
- **Fix:** Check if ConsentLog exists for (userId, policyVersion) with a recent acceptedAt timestamp; return 409 ALREADY_CONSENTED instead of creating a duplicate row.

### [P3] Identity lifecycle does not guard against concurrent onIdentifiedLogin or onAppLogout calls `[CONFIRMED]`

- **Slice:** W1-auth-identity
- **Where:** `apps/mobile/lib/identity-lifecycle.ts:264-308, 324-366`
- **What:** onIdentifiedLogin and onAppLogout are async functions with no locking mechanism. If a rapid sequence of OTP verifications or logout requests fire in parallel (race on weak network), both could execute their token mutations and OneSignal calls concurrently.
- **Fix:** Add a module-level Mutex or Deferred latch (similar to inFlightRefresh in api.ts:95) that serializes concurrent login/logout calls.

### [P3] No audit log for OTP request or verify calls `[CONFIRMED]`

- **Slice:** W1-auth-identity
- **Where:** `apps/backend/src/routes/auth.ts:39-191`
- **What:** POST /auth/otp/request and /auth/otp/verify do not write AuditEvent rows. User login attempts are not logged, making security audit and fraud tracking impossible.
- **Fix:** Call recordAuditEvent in both /auth/otp/request (kind: OTP_REQUESTED) and /auth/otp/verify (kind: OTP_VERIFIED if no worker, or let workerOtpVerifiedService handle it).

### [P3] NextSiteCard visitState parameter has default fallback, masking state-passing errors `[CONFIRMED]`

- **Slice:** W2-worker-today
- **Where:** `apps/mobile/components/worker/NextSiteCard.tsx:70`
- **What:** Parameter visitState is optional with default value 'SCHEDULED' (line 70). If an upstream call site passes undefined or omits the prop, the card will render 'Scan QR · check in' CTA regardless of actual visit state. Home screen does pass real state (index.tsx:299), so no current bug, but the design is fragile.
- **Fix:** Remove the default. Make visitState required. This forces call sites to be explicit. Current call site (index.tsx:299) already passes state, so change is safe.

### [P3] AssignmentCard duration parameter defined but never used or populated `[CONFIRMED]`

- **Slice:** W2-worker-today
- **Where:** `apps/mobile/components/worker/AssignmentCard.tsx:48-52`
- **What:** Parameter duration?: string (line 48) is accepted and conditionally rendered (line 83), but Home screen never passes it (index.tsx:335). Backend WorkerTodayOutput has no duration field. The component is wired for a feature that doesn't exist.
- **Fix:** Either (1) remove the duration param entirely to reduce API surface, or (2) add duration to WorkerTodayOutput schema + populate in service. Option 1 is preferred for 2a-2 cleanup.

### [P3] StateBadge STATE_MAP manually defined; no sync guarantee with VisitStateValue enum `[REFUTED]`

- **Slice:** W2-worker-today
- **Where:** `apps/mobile/components/worker/StateBadge.tsx:29-42`
- **What:** StateBadge defines hardcoded STATE_MAP (lines 29-42) with 12 state→label mappings. The VisitStateValue type is imported from zod schema (line 13), but the map is maintained as separate object literal. If visitMachine or schema adds a state, the map will diverge unless manually updated.
- **Fix:** Add a TypeScript assertion `const _: Record<VisitStateValue, ...> = STATE_MAP;` to catch missing keys at compile time. Or generate the map from Zod schema at build time.

### [P3] Web stub gap: submit.tsx reads empty r2UploadQueue on web `[REFUTED]`

- **Slice:** W3-capture
- **Where:** `submit.tsx:60; r2-upload-queue.ts:49-55`
- **What:** On Expo Web, uploadQueue is empty (no camera/file capture). submit.tsx:60 reads snapshot() → zero items → 'No uploaded photos found' generic error. No 'Capture not supported on web' surface.
- **Fix:** Add Platform.OS === 'web' check in submit.tsx: render 'Capture not supported on web. Use mobile device.' instead of generic 'no photos' error.

### [P3] Grievance table and endpoints completely missing `[unmatched]`

- **Slice:** W5-worker-leave-notif
- **Where:** `schema.prisma (no Grievance model), no /worker/grievances route, no mobile UI`
- **What:** Plan specifies 4-category grievance form (WAGES/WORKING_CONDITIONS/SUPERVISOR/OTHER) → POST /worker/grievances. Table doesnt exist.
- **Fix:** Add Grievance table to schema. Create grievanceMachine. Implement POST /worker/grievances. Create mobile form screen.

### [P3] State machines for leave/swap/grievance dont exist in packages/state-machines/src `[unmatched]`

- **Slice:** W5-worker-leave-notif
- **Where:** `packages/state-machines/src/index.ts (exports 3 machines, plan lists 4 NEW machines)`
- **What:** Plan rule 6 No machine without a .test.ts. No machines created despite plan listing them as needs build.
- **Fix:** Create 3 machine files + tests: leave-request.ts, swap-request.ts, grievance.ts. Export from index.ts. Cover legal/illegal transitions in tests.

### [P3] Master plan §L cascade depth ≤ 3 mentioned as enforced but no code enforces it `[CONFIRMED]`

- **Slice:** X1-connections-plumbing
- **Where:** `apps/backend/src/dispatcher/index.ts:19-21`
- **What:** The comment states 'master-plan §L — cascade depth ≤ 3 (enforced when a handler first emits a downstream outbox row; today all handlers are stubs and cascade depth is always 1)'. However, the Outbox table has no depth field, enqueueOutbox has no depth check, and there is no guard in processOnce. Handlers are free to enqueue unlimited downstream rows.
- **Fix:** Either: (a) Add a depth field to Outbox, increment in enqueueOutbox, guard against depth > 3 with a 400 error, OR (b) update the comment to clarify this is a design constraint (not runtime-enforced) and rely on code review to prevent depth violations.

### [P3] Discipline lock on setTokens/clearTokens bypassed if called directly; no compile-time guard `[CONFIRMED]`

- **Slice:** X1-connections-plumbing
- **Where:** `apps/mobile/lib/auth-store.ts:11-21`
- **What:** The comment at lines 11-21 states: 'Do NOT call setTokens/clearTokens directly from identified-login or logout flows — go through identity-lifecycle.ts instead'. This is a discipline lock, not a language-level guard. Any developer can import and call setTokens directly, bypassing the OneSignal lifecycle sync. There is no TypeScript `private` modifier or opaque type preventing it.
- **Fix:** Refactor auth-store.ts exports: export only getTokens + clearTokens; hide setTokens + replaceTokens as non-exports. Have identity-lifecycle.ts call them directly (same module or via a special friend export). Or mark setTokens as @internal and add a linter rule to forbid direct calls outside identity-lifecycle.ts.

### [P3] MicFAB floating button globally missing `[unmatched]`

- **Slice:** X3-doc-vs-reality
- **Where:** `apps/mobile/app/(supervisor)/_layout.tsx and (worker)/_layout.tsx`
- **What:** Red MicFAB (floating mic button) is spec'd on all non-Profile tabs but not implemented anywhere; icon present on some routes but no actual FAB component or press handler
- **Fix:** Create components/MicFAB.tsx with Animated.View + FAB styling; mount in supervisor/\_(tabs)/layout and worker/\_layout; bind onPress to voiceRecorderModal entry point

### [P3] Decisions tab badge count not rendered `[unmatched]`

- **Slice:** X3-doc-vs-reality
- **Where:** `apps/mobile/app/(supervisor)/_layout.tsx: tab bar icon definition`
- **What:** R6 shows a count badge (e.g. '6') on Decisions tab icon; implementation renders plain icon without badge circle
- **Fix:** Query pending decisions count via useSuspenseQuery(decisions); render <Badge>{count}</Badge> overlay on tab icon in \_layout.tsx using Feather icons

### [P3] Chat bubbles older than 1h not visually dimmed `[unmatched]`

- **Slice:** X3-doc-vs-reality
- **Where:** `apps/mobile/app/(supervisor)/chat.tsx: ChatBubble component styling`
- **What:** R6 spec shows older chat bubbles with 55% opacity; mobile renders all bubbles at 100% opacity regardless of age
- **Fix:** Add opacity rule in ChatBubble: const bubbleOpacity = (now - createdAt) > 3600000 ? 0.55 : 1; apply to message container

### [P3] Chat missing decision-link pill component `[unmatched]`

- **Slice:** X3-doc-vs-reality
- **Where:** `apps/mobile/app/(supervisor)/chat.tsx: no DecisionLink rendering`
- **What:** When AI generates decisions in chat, R6 shows '✷ N decisions added — review in Decisions' tappable pill; mobile doesn't render this link inside AI message bubbles
- **Fix:** In ChatBubble, detect DecisionCard payloads; render <Pressable onPress={() => router.push(Decisions)}><Text>✷ {count} decisions added</Text></Pressable>
