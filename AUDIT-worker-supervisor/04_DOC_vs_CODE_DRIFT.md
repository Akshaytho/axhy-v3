# 04 — Doc-vs-Code Drift (where the docs claim something the code doesn't do)

> The dangerous list: build off a doc that lies about what's done and you build on sand. Each item: the claim, the code reality, where.

## S1-supervisor-today

1. **Claim:** FlaggedReviewSheet renders disabled with 'Coming with P1 routing' copy (done-memo line 53)
   - **Reality:** Code comments at FlaggedReviewSheet.tsx:7-10 claim 'Both Resolve and Reject buttons are fully wired to the backend (POST /visits/:id/resolve, POST /visits/:id/reject)' but neither route exists on the backend. The buttons DO render (line 100-101+ shows Resolve/Reject button logic) but the mutations attempt to call non-existent endpoints. The done-memo is honest ('renders disabled per scope'); the code comments are misleading.
   - **Where:** FlaggedReviewSheet.tsx:1-30 vs done-memo supervisor-sprint-2026-05-17.md:53 vs audit 2026-05-17-scenarios-actually-working-audit.md:108-110

2. **Claim:** Activity tab filter chips are wired to the backend (R6 design spec §3 Activity line 30: 'structured filter chips ONLY')
   - **Reality:** Activity tab renders filter chips for date/site/kind (activity.tsx visible in code) but the backend has no GET /supervisor/activity route accepting ?date= or ?siteId= query params. The chips do NOT filter the data; they are visual-only. Audit scene 43-44 explicitly marks these as FAIL: 'Chip exists but tapping it does not filter (no backend filter param wired).'
   - **Where:** docs/specs/2026-05-12-supervisor-mobile-r6-design.md line 30 + activity.tsx vs audit 2026-05-17-scenarios-actually-working-audit.md:43-44

3. **Claim:** Chat R6 faithful with older bubbles dimmed 55% opacity (R6 spec line 31, r5 comment line 79)
   - **Reality:** Chat tab renders (carried over from Wave 4a) but does NOT implement the 55% opacity dimming on older messages specified in R6. Audit scene 73 marks as FAIL: 'No 55% opacity dimming on older bubbles (R6 has this).' The done-memo line 180 lists this as deferred: 'R6-faithful Chat (dimmed older bubbles, …) — ⚠️ DEFERRED to a follow-up Chat-polish slice.'
   - **Where:** docs/specs/2026-05-12-supervisor-mobile-r6-design.md lines 31, 79 vs audit 2026-05-17-scenarios-actually-working-audit.md:73 vs done-memo line 180

4. **Claim:** Profile supports language switching (R6 design profile.jsx PROFILE section)
   - **Reality:** Profile tab renders a language picker UI stub but selecting a language does not call setLocale() or persist the choice. Code has a TODO comment at me.tsx:156. Audit scene 78 marks as FAIL: 'No language picker UI in profile.tsx' (should be 'UI exists but not wired').
   - **Where:** docs/specs/2026-05-12-supervisor-mobile-r6-design.md profile.jsx line 32 vs me.tsx:156 (TODO) vs audit 2026-05-17-scenarios-actually-working-audit.md:78

5. **Claim:** Profile supports notification prefs toggle (R6 design profile.jsx SETTINGS section)
   - **Reality:** Profile renders toggle skeleton but handlers are not implemented. Audit scene 79 marks as FAIL: 'TODO at profile.tsx:156; toggle handlers not implemented.' The routes to POST the preference change do not exist.
   - **Where:** docs/specs/2026-05-12-supervisor-mobile-r6-design.md profile.jsx line 32 vs audit 2026-05-17-scenarios-actually-working-audit.md:79

6. **Claim:** All scenarios depending on routing slice ('GET /decisions/proposed-for-me', REVERSE write) are DEFERRED (done-memo line 66)
   - **Reality:** Code is honest here: Decisions tab renders an empty-state shell with 'Coming next' messaging. Activity tab has the REVERSE button UI logic (activity.tsx mentions reverse-enabled within 30 min) but the backend endpoints do not exist. This is working as designed — the defer is correctly implemented.
   - **Where:** done-memo supervisor-sprint-2026-05-17.md:66 vs decisions.tsx and activity.tsx (both shells) vs audit 2026-05-17-scenarios-actually-working-audit.md:26-41, 45-47

## S2-decisions

7. **Claim:** R6 reference shows Decisions tab with 'DECISIONS WORKSPACE' eyebrow and '6 pending' title; mine shows 'PENDING' eyebrow and 'All caught up' / count (2026-05-17-r6-vs-mine-gap-audit.md, line 41-42)
   - **Reality:** decisions.tsx:172 reads titleText as count-based ('All caught up' or '$total pending'), and strings.decisions.title.toUpperCase() renders as subtitle. R6 has fixed 'WORKSPACE' text. This is a minor cosmetic drift, not a functional one.
   - **Where:** decisions.tsx:164-172; 2026-05-17-r6-vs-mine-gap-audit.md line 40-42

8. **Claim:** Scenarios doc claims Decisions slice is 'Coming next' with no data flow (2026-05-17-scenarios-actually-working-audit.md, line 56-65: '1 PASS, 16 DEFERRED')
   - **Reality:** Data flow IS fully wired as of 2026-05-18: buildDecisionsForSupervisor populates rows from three sources (supervisorDecisionSource, leaveRequestSource, swapRequestSource); mobile Decisions tab renders and fetches live. The scenarios doc predates Wave 2 shipping. **Significant drift — scenarios doc is stale.**
   - **Where:** 2026-05-17-scenarios-actually-working-audit.md lines 55-64 vs decisions-service.ts completed implementation (2026-05-18)

9. **Claim:** 'FAILED_REVIEW section is reserved; no rows land there yet' (decisions-service.ts:851, 852)
   - **Reality:** Code is accurate. No visitFlaggedSource exists; FAILED_REVIEW section is declared in schema but never populated. This matches the intent: section exists for future Wave 3 when flagged visits are routed.
   - **Where:** decisions-service.ts:851-852 (accurate reflection of current state)

10. **Claim:** Mobile Decisions tab is 'honest Coming next shell' with ~5% R6 match (2026-05-17-r6-vs-mine-gap-audit.md, line 50)

- **Reality:** This claim is from May 17 PM before the Wave 2 UNION ALL builder shipped. As of May 19, the Decisions queue is fully functional with three sources, tier-grouped UI, and action-driven footer. The tab is no longer a shell — it now has data and interactive actions. **Doc is stale.**
- **Where:** 2026-05-17-r6-vs-mine-gap-audit.md line 50 (May 17 audit, predates Wave 2 completion on May 18)

## S3-chat-ai-livingdoc

11. **Claim:** Vector RAG Phase 2 replaces loadPriorMessages call with assembleSemanticContext

- **Reality:** assembleSemanticContext CONTAINS loadPriorMessages as fallback (semantic-context.ts:483). Blind window still operational, not replaced.
- **Where:** vector-rag-context-assembly.md §5 vs semantic-context.ts:463-500

12. **Claim:** Tier 5 (prior messages) is ONLY changed; other tiers stay stable for cache hit

- **Reality:** Entity hints prepended to user message (chat.ts:924-926), changing prompt structure when detected, affecting cache prefix.
- **Where:** vector-rag-context-assembly.md §2 design principle vs chat.ts:924-926

13. **Claim:** Semantic turns loaded via pgvector similarity search

- **Reality:** Search happens BEFORE message is persisted; continuity turn doesn't include current message until next request.
- **Where:** vector-rag-context-assembly.md §5 vs semantic-context.ts:335-359 (loads before persist)

14. **Claim:** Complete rule hierarchy in prompt order

- **Reality:** Entity hints (Tier 5b) are prefixed to user message text, not inserted as tier layer, shifting position in token stream.
- **Where:** vector-rag-context-assembly.md diagram vs chat.ts:924-926

15. **Claim:** LivingDoc version bumps on rule update → busts cache automatically

- **Reality:** Version read at chat.ts:952 but write path on rule update not verified in scope; version increment assumed but not traced.
- **Where:** chat-sidebar-context-flow.md §7 vs chat.ts (version write path unclear)

## S4-activity

16. **Claim:** Scenarios doc 2026-05-17 scene 43: Filter by site does not work (no backend filter param wired)

- **Reality:** Site filter IS fully wired end-to-end: activity.tsx:911 passes siteChipId to useActivityQuery, use-activity.ts:50 includes siteId in URL params, supervisor-activity.ts:75 accepts siteId and passes to activity-service.ts:151 which filters on targetId. The 2026-05-17 audit was incorrect.
- **Where:** Scenarios doc line 73 vs activity.tsx:911, use-activity.ts:50, supervisor-activity.ts:75

17. **Claim:** Scenarios doc 2026-05-17 scene 44: Date filter chips are visual only

- **Reality:** Date filter IS fully wired: activity.tsx:889-890 passes dateParam, use-activity.ts:49 includes date in URL, supervisor-activity.ts:68-71 converts to DateFilter, activity-service.ts:149-150 computes createdAt bounds. The 2026-05-17 audit was incorrect.
- **Where:** Scenarios doc line 74 vs activity.tsx:889-890, use-activity.ts:49, supervisor-activity.ts:68-71

18. **Claim:** Scenarios doc 2026-05-17 scenes 45-47: Row expand not implemented, REVERSE write path doesn't exist, SHARE not wired

- **Reality:** ALL three fully implemented: (1) Row expand at activity.tsx:918, 936-938. (2) REVERSE POST /activity/:id/reverse at routes/activity.ts:45-142. (3) SHARE via Linking.openURL at activity.tsx:123-127, 945-947. The 2026-05-17 audit was severely incorrect.
- **Where:** Scenarios doc line 75 vs activity.tsx:336-373, 945-947, routes/activity.ts:45-142

19. **Claim:** R6 design spec: soft-flag allowed inside window with optional note for HR discretion

- **Reality:** Backend REJECTS soft-flag inside window with 422 WINDOW_OPEN (activity-reverse-service.ts:471). Route comment at activity.ts:451-455 says this is per 'founder lock — canonical soft-flag entry is the window-closed path'. Design contradicted by implementation.
- **Where:** R6 design doc activity.jsx vs activity-reverse-service.ts:471, activity.ts:190-199

## S5-coverage-people-ops

20. **Claim:** docs/specs/2026-05-14-supervisor-responsibility-model.md §4 core principle: 'origin attribution is written at row-creation time' for decisions; DWI.supervisorId immutable

- **Reality:** Code confirmed: replacement-invite-service.ts records `fromSupervisorId: input.fromSupervisorId` at creation; swap-request-service.ts records `supervisorId: auth.userId` at creation. These are the immutable origin attribution fields. No mutations applied to them post-creation. ALIGNED.
- **Where:** replacement-invite-service.ts:186-187, swap-request-service.ts:79, decision-entity (referenced in responsibility-model but implementation in chat/apply path deferred to P2)

21. **Claim:** responsibility-model §5.5 Today tab: 'shows decisions + visits for sites the calling supervisor is currently responsible for'

- **Reality:** Code confirms: supervisor-today.ts calls getSitesSupervisedByUser() at read-time (verified grep output). The Today query returns sites from the supervisor's active bindings (ACTING or PERMANENT, §5.8 precedence applied). Sites screen (sites.tsx:127-128) renders `today.data?.sites ?? []`. ALIGNED.
- **Where:** apps/backend/src/lib/services/today-service.ts:126, apps/mobile/app/(supervisor)/sites.tsx:127-128

22. **Claim:** responsibility-model §5.8 no-overlap invariant + precedence: 'at most one active binding of each kind per site'; 'ACTING overrides PERMANENT'

- **Reality:** Schema enforces via Postgres EXCLUDE constraint (schema migration 20260516:131-138, verified in schema comments). Code implements at effective-responsibility.ts:80-85: 'const acting = rows.find((r) => r.actingForUserId !== null); const permanent = rows.find((r) => r.actingForUserId === null); const winner = acting ?? permanent'. The find-many query can return both (constraint allows it); precedence applied locally. getSitesSupervisedByUser mirrors this logic lines 224-246. ALIGNED.
- **Where:** schema.prisma migration reference in site-supervisor-binding.ts comments, effective-responsibility.ts:80-98, getSitesSupervisedByUser:224-246

23. **Claim:** responsibility-model Amendments 2026-05-17 A-5: getSitesSupervisedByUser is 'one-shot, no N+1' via 2 Prisma queries

- **Reality:** Code verified: Query A (lines 179-195) fetches this user's bindings; Query B (lines 206-222) fetches all site bindings for those sites; local JS grouping + precedence (lines 224-246). Panel test Case 23 in p1_5_bootstrap_seed.test.ts instruments $on('query') counter to assert ≤2 SiteSupervisorBinding queries. ALIGNED, P2-polish-batch item #4 confirms refactor to eliminate N+1.
- **Where:** effective-responsibility.ts:172-249, p1_5_bootstrap_seed.test.ts:Case 23

24. **Claim:** responsibility-model §5.9 worker derivation: 'primary_site_id for a Worker = the siteId from Worker's most-recent active Assignment (by createdAt DESC)'

- **Reality:** deriveWorkerPrimarySiteId(lines 289-300) queries: Tier 1 = ACTIVE + validFrom ≤ at + (validUntil IS NULL OR validUntil ≥ at), orderBy createdAt DESC, take first. Tier 2 = ACTIVE regardless of validity. Tier 3 = any state. Tier 4 = null. Exactly matches the 4-tier fallback described in spec §5.9. ALIGNED.
- **Where:** effective-responsibility.ts:282-317

25. **Claim:** responsibility-model §5.3 auto-revert on effectiveUntil pass: 'cron sweep closes expired windows AND/OR read-time check at every routing computation (defense in depth)'

- **Reality:** Code shows read-time implemented: getEffectiveBinding checks `(effectiveUntil IS NULL OR effectiveUntil > T)` (line 74). Cron sweep defined in binding-expire-sweep.ts exists but is NOT registered in the job dispatcher today (no cron entry points to it). responsibility-model §5.3 explicitly says both are needed. Today: only read-time. PARTIAL — cron is deferred, read-time is implemented.
- **Where:** effective-responsibility.ts:72-74 (read-time), binding-expire-sweep.ts (cron stub)

26. **Claim:** responsibility-model S-001 same-day freeze (2026-05-16 lock): 'Once the day has started in the tenant's local timezone, no supervisor responsibility change may take effect'

- **Reality:** Code enforces: assertNotChangingTodaysResponsibility (same-day-freeze.ts:73-90) converts tenant TZ to local midnight, compares effectiveFrom against cutoff, rejects if effectiveFrom < next midnight. Called by createPermanentBinding (line 212-217) and reassignPermanentBinding (line 430+) unconditionally when tenantTimeZone is not null. Test coverage in binding-create-permanent.test.ts + binding-permanent-reassignment-basics.test.ts. ALIGNED.
- **Where:** same-day-freeze.ts:73-90, site-supervisor-binding.ts:212-217 + 430+

27. **Claim:** responsibility-model §7(ii) routing computation: 'read-time computation per locked choice; DWI.supervisorId immutable after row creation'

- **Reality:** Code does NOT yet implement DWI (DecisionWorkspaceItem) for supervisor decisions (P2). However, for existing LeaveRequest (supervisorId not present; worker decides, supervisor only decides) and SwapRequest (supervisorId stamped at creation, line 79 swap-request-service.ts, not mutable), the pattern is correct: immutable origin attribution at write. Read-time routing via getSitesSupervisedByUser confirmed above. DWI machine + apply path lands in P2. PARTIALLY IMPLEMENTED — LeaveRequest/SwapRequest follow the pattern; DWI deferred.
- **Where:** swap-request-service.ts:79, leave-requests.ts (worker PK, no supervisor origin field on LeaveRequest itself), decision-workspace-item.ts (machine file exists but routes not wired; responsibility-model §7 deferred to P2)

28. **Claim:** responsibility-model §6 replacing 2026-05-08 backup-supervisor lock: 'Account sharing forbidden; no shared credentials'

- **Reality:** Code: no account-sharing paths found in routes. Auth per User.id + Membership, no multi-user impersonation. The 'backup-supervisor' mode mentioned in old R6 is deleted/replaced. Supervision is via SiteSupervisorBinding, not account sharing. ALIGNED.
- **Where:** auth middleware requireAuth (tenant-context.ts), no account-sharing code found in routes/

29. **Claim:** operations-workflow-model §7.1 mark-worker-absent: 'Manual route (POST /workers/:id/mark-absent) writes Attendance + audit + Outbox in one tx'

- **Reality:** Post /workers/:id/mark-absent route referenced in operation-workflow but file not found in routes/. The attendance-service.ts exists (services/) but the route entry point is not located. The mark-absent logic is documented as P2 (chat-propose path) + existing manual path. The route may be in a different location or the doc is ahead of code. Manual path claim in spec is unverified by code inspection.
- **Where:** operations-workflow-model §7.1 claims route exists; no route file found; attendance-service.ts exists but unmarked as public route

30. **Claim:** operations-workflow-model §7.2 leave approval: 'HR-only role gate' + 'supervisor can pre-approve'

- **Reality:** leave-requests.ts:159 allows 'SUPERVISOR or HR' roles at route-layer guard. Line 247-262 gates SUPERVISOR on portfolio (not explicit HR-only pre-check at parsing). Line 156-203 adds HR pod-scope gate. The doc says HR-only + optional supervisor pre-approval; code allows supervisor approve without explicit HR-only enforcement at parse-time. This is documented as a gap in leave-requests.ts line 125 comment: 'HR A1 Task 7 — role gate. SUPERVISOR or HR may decide'. DRIFT: spec expects HR-only (possibly with supervisor pre-approval escalated to HR ratification), code allows direct SUPERVISOR approve.
- **Where:** leave-requests.ts:125, 159, 247-262 vs responsibility-model & operations-workflow §7.2

## S6-updates

31. **Claim:** Spec §2.1: 'POST /hr-updates — HR creates an update' with digest shape: optional rules array with title, body, tier per rule

- **Reality:** Implementation has no POST /hr-updates route. Schema (schema.prisma:1034-1064) has flat HRUpdate with single content field, no rules table, no tier field. Zod schema (packages/shared-schema/src/zod/hr-updates.ts) mirrors spec (array rules), but Prisma has no backing table.
- **Where:** docs/specs/2026-05-12-hr-updates-spec.md §2.1 vs schema.prisma + supervisor-updates.ts

32. **Claim:** Spec §2.2: 'POST /hr-updates/:id/ack' route path

- **Reality:** Implementation uses '/supervisor/updates/:id/acknowledge' instead. Route path differs (hr-updates vs supervisor/updates, ack vs acknowledge). Both are supervisor-called, but spec reserves /hr-updates for HR admin (§2.1) and this breaks that namespace separation.
- **Where:** docs/specs/2026-05-12-hr-updates-spec.md §2.1-2.2 vs apps/backend/src/routes/supervisor-updates.ts:58,85

33. **Claim:** Spec §2.3: 'GET /hr-updates' endpoint for supervisor inbox with status filters (pending|acked|all)

- **Reality:** Implementation uses 'GET /supervisor/updates' (no status param). Service always returns needsAck + recentAcked together; client-side splits. No status filter on backend query.
- **Where:** docs/specs/2026-05-12-hr-updates-spec.md §2.3 vs supervisor-updates.ts:62, hr-updates-service.ts:63-72

34. **Claim:** Spec §2.2 steps 4-5: 'If ackedAt IS NOT NULL AND ackText === $ackText (same content), return cached success (idempotent). If ackText !== $ackText (different content), reject ALREADY_ACKED.'

- **Reality:** Code (supervisor-updates.ts:139-145) unconditionally updates acknowledgedBy, acknowledgedAt, acknowledgmentPhrase on every POST. No idempotency check. No ALREADY_ACKED error for differing content.
- **Where:** docs/specs/2026-05-12-hr-updates-spec.md §2.2 vs supervisor-updates.ts:139-145

35. **Claim:** Spec §3.2-3.3: 'Fire outbox topic hr_update.posted on successful POST /hr-updates; dispatcher consumes and fans out push to all supervisors in audience.'

- **Reality:** No POST /hr-updates exists. No outbox enqueue in routes. No dispatcher/handlers directory. Notification fan-out is completely absent from implementation.
- **Where:** docs/specs/2026-05-12-hr-updates-spec.md §3 vs apps/backend/src (no dispatch handler, no outbox calls)

36. **Claim:** Spec §4.1: 'Audience = all active supervisors in companyId; resolved via Membership(role=SUPERVISOR, status=active)'

- **Reality:** No dispatcher handler exists to perform audience resolution. Service fetch is tenant-scoped but doesn't validate role or status. Push notification recipient list is undefined.
- **Where:** docs/specs/2026-05-12-hr-updates-spec.md §4.1 vs hr-updates-service.ts (no audience query shown)

## S7-summary-memory

37. **Claim:** Summary surface displays 'WAGES THIS WEEK card (₹1,24,300 etc. with stacked bar — worked/OT/final percentages)' (design-doc:38)

- **Reality:** Wages card shows only a static clock icon + text 'Wages computed at end of week'; no data, no bar chart (summary.tsx:117-120; comment at 113 labels it 'placeholder per spec (v0 deferred)')
- **Where:** design-doc 2026-05-12 line 38 vs summary.tsx:113-120

38. **Claim:** Summary surface includes 'Refresh from server button' (design-doc:38)

- **Reality:** No refresh button in summary.tsx; only 'I'm done for today' CTA (line 123-131)
- **Where:** design-doc line 38 vs summary.tsx:35-135

39. **Claim:** Drawer shows 'Memory & rules · 23 rules · 12 aliases · 8 site notes' (design-doc:65)

- **Reality:** Drawer shows only 'Memory & rules' label with sub:null (Drawer.tsx:115); no subtitle; comment at lines 85-93 explains fake numbers were removed in Cluster C fix (B2-08)
- **Where:** design-doc line 65 vs Drawer.tsx:85-124

40. **Claim:** Drawer shows 'My sites · 8 sites · 3 with active rules' (design-doc:65)

- **Reality:** Drawer shows only 'My sites' label with sub:null (Drawer.tsx:117); comment at lines 90-91 explains placeholder was un-interpolated
- **Where:** design-doc line 65 vs Drawer.tsx:85-124

41. **Claim:** Memory screen displays supervisor's site rules (design-doc: 'Memory & rules' in drawer table, secondary surfaces section)

- **Reality:** Memory screen renders only EmptyRulesCard; no GET /supervisor/living-doc endpoint exists (memory.tsx:6-8 comment); backend has getLivingDoc() but it's never exposed publicly (living-doc.ts:91-122 used only by chat)
- **Where:** design-doc 2026-05-12 implicit in drawer structure vs memory.tsx:29-37 + no supervisor-living-doc.ts in backend/src/routes/

42. **Claim:** Summary timeline supports 'DecisionsTodaySheet (filter by tier)' (design-doc:38)

- **Reality:** Timeline is a non-interactive FlatList (summary.tsx:103-110); no filter UI; SummaryTimelineEntry has no tier field (summary.ts zod schema line 36-47)
- **Where:** design-doc line 38 vs summary.tsx:92-111

43. **Claim:** Profile screen has notification preferences that sync (implicit in design)

- **Reality:** Toggles only persist to SecureStore (me.tsx:430-443); no backend sync; comment at line 540 says 'Local-only this slice; backend membership.notificationPrefs wire-up is a follow-up'
- **Where:** design-doc (no explicit claim but UI suggests sync) vs me.tsx:423-585

44. **Claim:** Temporary mode pauses AI for the day (design-doc:65, drawer item #7)

- **Reality:** Flag 'axhy_ai_paused_until' is written (Drawer.tsx:246) but never read by ChatInput; comment at lines 244-245 confirms 'This flag is not yet consumed by ChatInput — wiring it there is a follow-up slice'
- **Where:** design-doc line 65 vs Drawer.tsx:235-255 + no consumer in chat-api.ts or ChatInput

## W1-auth-identity

45. **Claim:** done-memo line 28: 'onIdentifiedLogin accepts WORKER or SUPERVISOR via RoleSchema.enum'

- **Reality:** Code at identity-lifecycle.ts:271 checks `role !== SUPERVISOR && role !== WORKER`, throwing NonSupervisorRoleNotSupportedError for any other role. Matches claim.
- **Where:** identity-lifecycle.ts:268-273

46. **Claim:** done-memo line 23: 'After onIdentifiedLogin, branch on memberships[0].role: WORKER → NAV_ROUTES.authPermissions, SUPERVISOR → existing PushPermissionPrompt path'

- **Reality:** otp.tsx:86-94 checks `if (role === 'WORKER') { router.replace(NAV_ROUTES.authPermissions); return; }` then falls through to setIdentifiedLoginComplete = true which triggers PushPermissionPrompt. Matches.
- **Where:** app/(auth)/otp.tsx:86-94

47. **Claim:** done-memo line 44: 'POST /worker/consent with requireAuth + explicit if (auth.role !== WORKER) → 403 WRONG_ROLE'

- **Reality:** worker-consent.ts uses requireWorkerRole preHandler (line 35), which calls requireAuth then checks `auth.role !== WORKER` with 403 HTTP_FORBIDDEN (tenant-context.ts line 109). Matches.
- **Where:** routes/worker-consent.ts:35, middleware/tenant-context.ts:102-110

48. **Claim:** done-memo line 49: 'audit + outbox rows written' in worker activation

- **Reality:** worker-otp-verified-service.ts:113-125 writes AuditEvent (kind WORKER_OTP_VERIFIED) and Outbox row (topic worker.activated) inside the transaction. Matches.
- **Where:** lib/services/worker-otp-verified-service.ts:113-125

49. **Claim:** NEXT_SESSION.md line 25: 'sign-out timeout — identity-lifecycle.ts uses fetchWithTimeout(8s)'

- **Reality:** identity-lifecycle.ts:349-357 calls fetchWithTimeout(..., 8_000) on the /auth/sign-out call. Matches claim.
- **Where:** identity-lifecycle.ts:349-357

## W2-worker-today

50. **Claim:** Resume-capture banner predicate is server-side

- **Reality:** Verified correct — service line 167 checks IN_FLIGHT_STATES, returns resumeCapture object; mobile never recomputes
- **Where:** done-memo-2a-2 line 44, service line 167

51. **Claim:** Account-paused banner uses worker.state IN (ON_SUSPENSION, BLOCKED)

- **Reality:** Verified correct — index.tsx line 236 checks PAUSED_STATES = Set(['ON_SUSPENSION', 'BLOCKED'])
- **Where:** done-memo-2a-2 line 45, index.tsx:66-236

52. **Claim:** nextVisitId filters out VERIFIED | CANCELLED | NO_SHOW | ARCHIVED

- **Reality:** Verified — TERMINAL_VISIT_STATES on helpers.ts line 8, pickWorkerCaptureVisit filters by HOME_PRIORITY which excludes terminals
- **Where:** done-memo-2a-2 line 46, helpers.ts:8-60

53. **Claim:** Pull-to-refresh implemented

- **Reality:** Verified — index.tsx lines 245-253 wraps ScrollView with RefreshControl, calls refetch()
- **Where:** done-memo-2a-2 line 58, index.tsx:245-253

54. **Claim:** Empty state messaging implemented

- **Reality:** Verified — index.tsx:313-322 renders 'No work today' with helpful body text when totalVisits === 0
- **Where:** done-memo-2a-2 line 59, index.tsx:312-322

55. **Claim:** Greeting falls back to 'Good morning/afternoon/evening' without fake name

- **Reality:** Verified — getGreeting() on line 112-117 returns only time-of-day greeting, no name attempted
- **Where:** done-memo-2a-2 line 26, index.tsx:112-117

56. **Claim:** Tap-to-call supervisor button hidden if phone null

- **Reality:** Verified — visit/[id].tsx line 225-235 shows call button only when showCall = Boolean(data.supervisorPhone) is true
- **Where:** done-memo-2a-2 line 55, visit/[id].tsx:225-235

57. **Claim:** Can't make this' is disabled stub per DO_NOT_BUILD_MVP.md

- **Reality:** Not found in 2a-2 scope — slice 2a does not include swap/leave flows; deferred appropriately
- **Where:** done-memo-2a-2 line 56

## W3-capture

58. **Claim:** Contract: ON_SITE state introduced; capture flow supports ON_SITE → CLOCK_IN → IN_PROGRESS

- **Reality:** visit.ts machine has ON_SITE state (line 102-106) but clockInVisit service allows SCHEDULED/NOTIFIED/EN_ROUTE/ON_SITE → IN_PROGRESS (lenient). NEXT_SESSION.md §1: 'ON_SITE not introduced. Pre-cleaning state stays SCHEDULED; clock-in goes SCHEDULED→IN_PROGRESS leniently as before.' Deviation is intentional.
- **Where:** visit.ts:102-106 ON_SITE→CLOCK_IN→IN_PROGRESS path exists but worker-lifecycle-service clockInVisit validation allows SCHEDULED directly. NEXT_SESSION.md documents deliberate deviation.

59. **Claim:** Contract: After-Review 'Continue' triggers PHOTOS_PENDING (clock-out)

- **Reality:** Clock-out fires on timer 'Done' press (timer.tsx line 150+), not after-photos-review 'Continue'. After-review just navigates. Visit stays IN_PROGRESS until timer Done → PHOTOS_PENDING before after-photos step.
- **Where:** timer.tsx line 150+ shows Done calls postWorkerClockOut. after-photos-review.tsx inferred to be PhaseReview variant with navigation only. NEXT_SESSION.md §2: 'Clock-out stays at Timer Done (not After-Review Continue). Trade-off: accurate cleaning duration + deterministic resume.'

## W4-history-profile

60. **Claim:** NEXT_SESSION.md line 23-24: 'withTenantContext...[would conflict] with "no assignments today" UX when customer's contract ends' — implies worker-history should NOT use withTenantContext due to Company.status==='ACTIVE' enforcement

- **Reality:** Commit 33a4b88 introduced withTenantContext(prisma, auth.companyId, ...) in worker-history.ts:45-46, which enforces Company.status==='ACTIVE' check (middleware/tenant-context.ts:21-26), causing history queries to fail if company is SUSPENDED — contradicts the explicit design caution
- **Where:** apps/backend/src/routes/worker-history.ts:45-46 vs NEXT_SESSION.md:23-24 vs middleware/tenant-context.ts:21-26

61. **Claim:** worker-today.ts:16-26 explicitly documents: 'withTenantContext is NOT used on this read path' due to anonymization model (at most one active Worker per User globally)

- **Reality:** worker-history.ts was changed to use withTenantContext in commit 33a4b88 despite having identical anonymization guarantees (same @unique(Worker.userId) index per schema.prisma:188). worker-today.ts still uses bare prisma.$transaction
- **Where:** apps/backend/src/routes/worker-today.ts:60-63 (unchanged) vs worker-history.ts:45-46 (changed) — inconsistent pattern for semantically identical read operation

62. **Claim:** NEXT_SESSION.md §2 claims 'Full clock-in→timer→submit lifecycle was NOT driven on-device' but 'Lifecycle correctness rests on typecheck + 123 mobile + 10 backend tests'

- **Reality:** worker-submit 10/10 tests exist (noted in NEXT_SESSION.md line 29), but History/Profile/Visit screens are read-only; no tests verify the end-to-end display flow from fresh visit to history listing. Mobile vitest 123/123 passes but likely covers capture mechanics, not history view integration
- **Where:** NEXT_SESSION.md:40 vs apps/backend/test/worker-history.test.ts (exists, integration-layer only) vs apps/mobile/ (no e2e history-screen tests found)

## W5-worker-leave-notif

63. **Claim:** WORKER_MVP_SPRINT_PLAN.md §2.3 Day 2 scope: POST /worker/leave-requests (fires leaveRequestMachine ← SUBMITTED)

- **Reality:** Endpoint exists but not as worker-callable; supervisors call POST /leave-requests/:id/approve|reject instead. No leaveRequestMachine. No worker endpoint.
- **Where:** Plan §2.3 line 156 vs routes/leave-requests.ts (no /worker/ prefix route)

64. **Claim:** Plan §0 table: leaveRequestMachine, swapRequestMachine, replacementInviteMachine, grievanceMachine listed as NEW machines needs build for Days 2-3

- **Reality:** Zero of these machines exist in packages/state-machines/src. Only workerMachine, visitMachine, captureMachine are implemented.
- **Where:** Plan §0 Machines this sprint touches table vs index.ts which exports only 3 machines

65. **Claim:** Plan §0 rule 1: No raw prisma.x.update({ data: { state } }). Every state column update goes through the machines transition function.

- **Reality:** Current code does raw updates: leave-requests.ts line 269-276 uses updateMany({ state: newState }) directly; same in swap-requests.ts line 203-208.
- **Where:** Plan §0 rules vs actual implementation in leave-requests.ts and swap-requests.ts

66. **Claim:** Plan §2.4 Day 3 scope: Notifications list screen (34_notifications_list.md MVP slice) — universal bell

- **Reality:** No GET /worker/notifications route. No Notification query in mobile. No notifications screen. Bell icon mentioned in home layout but not functional.
- **Where:** Plan §2.4 line 167 vs api-routes.ts (no notification endpoints)

67. **Claim:** Plan §2.3 line 156: Worker Home includes Leave sheet from Worker Home — POST /worker/leave-requests

- **Reality:** Home screen renders visit list with state-based grouping but no leave sheet UI. No API endpoint for worker leave creation.
- **Where:** Plan §2.3 vs index.tsx (home screen code)

68. **Claim:** Plan §2.4: Grievance form (4 categories) POST /worker/grievances fires grievanceMachine ← OPENED

- **Reality:** Grievance table doesnt exist. No grievanceMachine. No POST /worker/grievances route. No mobile UI.
- **Where:** Plan §2.4 lines 170-171 vs schema.prisma (no Grievance model)

## X1-connections-plumbing

69. **Claim:** ADR-0024 Rollback: Redis fallback via AXHY_REDIS_FALLBACK_TO_POSTGRES=1 per-consumer basis

- **Reality:** Code uses AXHY_RATE_LIMIT_FAIL_CLOSED (fail-closed=deny-all) and fail-open modes; no Postgres fallback path for rate limiter, OTP, circuit-breaker, or chat idempotency. Only OTP store has a Postgres-backed secondary (otp-store.ts line comment mentions 'TODO: Redis at 10K+ rps'), but no env var wires it.
- **Where:** ADR-0024 §Rollback vs apps/backend/src/lib/redis-rate-limit.ts:115-133, apps/backend/src/lib/otp-store.ts

70. **Claim:** ADR-0009 superseded by ADR-0024: Postgres outbox + audit stay on Postgres for durable delivery + audit

- **Reality:** Outbox is correctly Postgres-backed. BUT idempotency moved to both Postgres (IdempotencyKey generic table, no cleanup) and Redis (chat only, 120s TTL). Generic HTTP idempotency sits in Postgres with manual expiry check but no sweep job, creating table bloat debt.
- **Where:** ADR-0024 intro vs apps/backend/src/lib/idempotency-key.ts:1-41, schema.prisma:469-488

71. **Claim:** master-plan §L: cascade depth ≤ 3 enforced in dispatcher

- **Reality:** Comment exists (dispatcher/index.ts:19) but no depth field in Outbox table, no tracking in enqueueOutbox, no guard clause. Naturally depth=1 today because no handler emits downstream rows.
- **Where:** dispatcher/index.ts:19 vs outbox.ts:34-51

72. **Claim:** Mobile refresh mutation intercepts 401 and retries once with single in-flight refresh per module

- **Reality:** Correct: inFlightRefresh mutex (api.ts:90-138). BUT: transient errors (network timeout, 5xx) are NOT retried on the refresh itself—only the original request is retried once. If backend is briefly down, user sees frozen app after 1 retry.
- **Where:** ADR-0011 / master-plan vs api.ts:199-216

## X2-db-statemachines

73. **Claim:** operational-invariants.md INVARIANT 10: 'A rule can only transition: PENDING -> ACTIVE (supervisor confirms) | PENDING -> REJECTED (supervisor rejects) | ...' [refers to LivingDoc rules]

- **Reality:** No LivingDoc state machine exists in packages/state-machines/src. The LivingDoc model is defined in schema.prisma but no state transitions are enforced or guarded.
- **Where:** docs/locked/operational-invariants.md lines 65-76 vs packages/state-machines/src (no LivingDoc.ts file)

74. **Claim:** worker-otp-verified-service.ts line 10: 'Discipline (from `.claude/rules/state-machines.md`): Read worker state via tx, pass current state + event to workerMachine.transition...'

- **Reality:** The file .claude/rules/state-machines.md does not exist in the repository. This discipline document cannot be verified or maintained.
- **Where:** apps/backend/src/lib/services/worker-otp-verified-service.ts:10 references file that does not exist

75. **Claim:** visit-flagged-review-service.ts lines 42-45: 'The 12-state VisitState v1.1 machine (schema.prisma line 227) allows REJECTED from any state where the worker has actually submitted evidence.'

- **Reality:** visitMachine.ts lines 17-29 defines 12 states but REJECTED is not one of them. The state values are: SCHEDULED, NOTIFIED, EN_ROUTE, ON_SITE, IN_PROGRESS, PHOTOS_PENDING, AWAITING_VERIFICATION, VERIFIED, FLAGGED, CANCELLED, NO_SHOW, ARCHIVED.
- **Where:** apps/backend/src/lib/services/visit-flagged-review-service.ts:42-45 claims the machine allows REJECTED; packages/state-machines/src/visit.ts:17-29 does not include REJECTED

76. **Claim:** schema.prisma line 221-222: Visit model mentions '12-state VisitState v1.1 machine'

- **Reality:** The actual machine has exactly 12 states defined, which is correct. However, comments in services (visit-flagged-review-service.ts) reference states (REJECTED, COMPLETED, NEEDS_REVIEW) that are not in the machine.
- **Where:** packages/shared-schema/prisma/schema.prisma:282-283 comment matches reality, but dependent code assumes additional states

## X3-doc-vs-reality

77. **Claim:** NEXT_SESSION.md: 'ON_SITE not introduced. visit.ts only allows EN_ROUTE → WORKER_ARRIVE → ON_SITE'

- **Reality:** visit.ts visit DOES have ON_SITE state (line 19) and EN_ROUTE → ON_SITE transition (line 97), but the deferred point is correct: SCHEDULED → ON_SITE is NOT a direct transition per contract; SCHEDULED must go NOTIFIED → EN_ROUTE → ON_SITE first
- **Where:** NEXT_SESSION.md §33 vs visit.ts lines 18-100

78. **Claim:** NEXT_SESSION.md: 'Clock-out stays at Timer "Done" (not After-Review "Continue" as the contract model says)' for 'accurate cleaning duration + deterministic resume'

- **Reality:** Code confirms this: timer.tsx line 11 says 'Clock-out (→ PHOTOS_PENDING) fires on the Done press', after-photos-review.tsx line 23 shows continueToFinal() just navigates without clock-out. This is intentional deviation and correctly documented as deferred
- **Where:** NEXT_SESSION.md §36 vs timer.tsx:11-13 and after-photos-review.tsx:23-24 match

79. **Claim:** NEXT_SESSION.md: 'Full clock-in→timer→submit lifecycle was NOT driven on-device this run... Lifecycle correctness rests on typecheck + 123 mobile + 10 backend tests + relocated-but-unchanged clock-in code'

- **Reality:** Clock-in code was NOT unchanged—it was relocated from before-photos to before-photos-review (before-photos-review.tsx:36 calls postWorkerClockIn vs old before-photos.tsx never called it). This is a real migration, not just relocation. The tests (worker-submit.test.ts 10 cases) verify submit path, not full lifecycle with real visit state progression
- **Where:** NEXT_SESSION.md §38 vs before-photos-review.tsx:36 and worker-submit.test.ts test cases

80. **Claim:** 2026-05-17-scenarios-audit.md: 'Supervisor has no "mark present" action (per feedback_supervisor_no_visit_mark_button). This scene is now obsolete'

- **Reality:** Mark-absent write (POST /workers/:id/mark-absent) exists and is wired, but no 'mark PRESENT' action exists—correct per founder's lock. However, docs don't explicitly retract this scene from the audit; it's marked FAIL but the reason isn't 'scene is obsolete' in code
- **Where:** 2026-05-17-scenarios-audit.md scene #17 FAIL note vs supervisor-context-service.ts (mark-absent wired but no mark-present)

81. **Claim:** 2026-05-17-r6-vs-mine-gap-audit.md: 'Chat honest verdict: ~15% match. Data flow works against real Railway sandbox'

- **Reality:** Data flow (Wave 4a chat messages) does work end-to-end, but R6 spec is fundamentally different: voice waveform UI + decision-link pills + older-bubble dimming are architectural changes not just visual polish. The 15% is accurate but understates the gap—it's ~15% fidelity, not ~85% complete
- **Where:** 2026-05-17-r6-vs-mine-gap-audit.md §Chat vs chat.tsx architecture

## X3-doc-vs-reality (capture-submission, submit, worker evidence lifecycle)

82. **Claim:** NEXT_SESSION.md claims 'BUG-02 photo ceiling 3 → 8' + 'BUG-03 dedicated review screens' were fixed and verified with on-device shots

- **Reality:** TRUE. Code shows both fixes landed: before-photos-review.tsx + after-photos-review.tsx exist in the directory (1241 + 2777 bytes); PHOTOS_PER_PHASE is now 8; capture-flow.ts MAX_PHOTOS_PER_PHASE=8. Vitest 123/123 passing. On-device shots v2-60..62 confirm the UI.
- **Where:** NEXT_SESSION.md lines 21-22, 62-63, 63 vitest tally; confirmed by file:line evidence

83. **Claim:** NEXT_SESSION.md claims 'QR made honest — removed animated scan-line / camera pretense' (BUG-06)

- **Reality:** TRUE. qr-scan.tsx:85-88 shows the honest message 'Start your visit' with icon + continue button. No CameraView import, no decode, no animating scan-line. Code comment line 2-11 states the intent ('rather than animate a fake scan-line... this screen is truthful').
- **Where:** NEXT_SESSION.md line 24; verified by reading qr-scan.tsx:1-103

84. **Claim:** NEXT_SESSION.md claims 'BUG-13 worker audit events VISIT_CLOCKED_IN / CLOCKED_OUT / SUBMITTED written immutably'

- **Reality:** PARTIALLY TRUE. Code shows VISIT_SUBMITTED is recorded (worker-submit-service.ts:105-111). But VISIT_CLOCKED_IN / CLOCKED_OUT are NOT visible in the current code — no recordAuditEvent calls in worker-lifecycle-service.ts (the clock-in/out service). The audit commitment is incomplete.
- **Where:** NEXT_SESSION.md line 23 claims 3 audit events; code only shows 1 (VISIT_SUBMITTED)

85. **Claim:** NEXT_SESSION.md claims 'BUG-09 'Back to home' rendered during polling'

- **Reality:** TRUE. submit.tsx:469 shows `(isTerminal || state === 'polling') && <Pressable onPress={goHome}>`, which renders the button during state='polling'. Comment line 466-468 explains the fix.
- **Where:** NEXT_SESSION.md line 25; verified by reading submit.tsx:469-477

86. **Claim:** done-memo-supervisor-sprint-2026-05-17.md claims 'Clock-in relocated to Before-Review Screen'

- **Reality:** OUTDATED. The NEXT_SESSION.md (more recent, 2026-06-04) clarifies the actual state: clock-in still fires at before-photos goNext (when user taps 'Done' after capturing before-photos), NOT in Before-Review. Before-Review is a read-only review grid without a 'Start cleaning' CTA. The move described in the done-memo did not happen; the memo was overtaken by later design decisions.
- **Where:** done-memo-supervisor-sprint line 23 vs NEXT_SESSION.md line 22 clarification vs actual code (PhasePhotoCapture, timer invocation)

87. **Claim:** docs/capture-submission_flow/07-final-review.md specifies 3-stat card 'Photos / Duration / GPS'

- **Reality:** PARTIALLY TRUE. review.tsx:126-130 shows 3 stat cards: Before / After / Uploaded. The comment at line 4 claims 'Photos / Duration / GPS', but the code renders Before/After/Uploaded instead. Duration appears in the summary line (line 121) not as a stat card. GPS is absent (no column in Visit schema, no UI).
- **Where:** review.tsx:1-11 comment claims vs :126-130 actual rendering — code/comment mismatch

88. **Claim:** WORKER_QA_FINDINGS_2026-05-25.md Q3 claims R2 key mismatch is 'exactly P3.2' in code review findings

- **Reality:** TRUE. The R2 mismatch is confirmed in both docs: P3.2 in WORKER_CODE_REVIEW_FINDINGS describes the inconsistency (presign User.id vs submit Worker.id), and WORKER_QA_FINDINGS live-confirms it in production (DB row with orphaned r2Key). Not fixed in current code.
- **Where:** WORKER_QA_FINDINGS_2026-05-25.md line 138-141; WORKER_CODE_REVIEW_FINDINGS_2026-05-24.md P3.2 lines 310-312; code Q3-001
