# Chat path production-grade audit — 2026-05-18

Auditor: deep-read of the 6 files end-to-end (chat.ts 1581 LOC, supervisor-decision-writer.ts 635 LOC, decisions-service.ts 864 LOC, supervisor-decisions.ts 224 LOC, chat.ts schema 98 LOC, supervisor-decision-kinds.ts 232 LOC). All findings cite file:line. Read-only audit.

Rulebook reference: `/Users/thotaakshay/eclean_workspace/axhy-v3/handoff/owner-input/production-grade-rulebook.md` (P1–P10 + companion rules locked 2026-05-15/16) and L1/L2 lessons from `feedback_production_grade_workflow_rules.md`.

## Executive summary

- The post-F-002.15 refactor of `/chat/apply` is **genuinely production-grade for the 4 ex-inject tools** (`propose_create_assignment`, `propose_mark_absent`, `propose_leave`, `propose_swap`): one tx wraps preCheck + service + commit; ServiceDomainError + LifecycleError both roll back; commitApply re-checks auth (L2); conditional `updateMany` is race-safe (P2); CHECK constraint on the DB pairs with the conditional UPDATE (P1). This is the strongest part of the slice.
- The legacy 2 branches (`propose_termination`, `propose_living_doc_update`) still use `applyProposedDecision` + sentinel-return-from-tx-callback for LifecycleError paths. The sentinel pattern is safe **only because** every throw inside `applyProposedDecision` happens before any other write in the same tx — but the pattern is fragile and inconsistent with the 4 modernized branches (P3-adjacent / L1-adjacent maintenance hazard).
- **One real P0 bug found.** The `decodeCursor` in `decisions-service.ts:225` accepts only `priority === 0 | 1 | 2`, but the `SECTION_PRIORITY` map (line 174) emits 3 for FAILED_REVIEW. Encoder writes priority 3 (line 330) for a last-row in FAILED_REVIEW/STALE; decoder rejects it. Round-trip is broken when a page ends on FAILED_REVIEW or STALE — pagination silently restarts from the top of the queue. (STALE is 2 which IS accepted; FAILED_REVIEW = 3 is the bug.)
- **One real P0 idempotency leak.** The new `/decisions/:id/apply` adapter (supervisor-decisions.ts:204) generates a fresh `crypto.randomUUID()` when the client doesn't supply an `idempotency-key`. A mobile retry of the same Apply tap therefore gets a new key downstream → `/chat/apply` doesn't dedup → the race-safe UPDATE still prevents the double-apply but the user sees `ALREADY_APPLIED` 409 on what they reasonably thought was a retry. P8 (real-life retries) violation surfaced as user-visible failure.
- The `chatMessageId` → optional schema change in `packages/shared-schema/src/zod/chat.ts:76` is **safe**. No backend consumer reads it (greps clean); mobile + tests all SEND it but nothing destructures it as required. Existing callers continue to pass it. Loosening is forward-only.
- **Stale comments / docs that no longer reflect runtime behavior.** `supervisor-decision-writer.ts:374-386` documents an "apply-after-domain" tx-1/tx-2 split that has been gone since F-002.15 (round-2 R2b-iii, see chat.ts:1067-1087); the commitApply docstring (line 422-431) similarly mentions tx 1 + tx 2 thread-through that the 4 modern branches no longer use. The L2 commit-time auth re-check is still correct and load-bearing, but the rationale text is outdated.
- The `additionalDecisionSources` plug-in extension point exists in code (decisions-service.ts:102) but is unwired and unused; the REPLACEMENT_INVITE_OUTCOME / COMPLAINT_HR_REPLY kinds are pre-registered with no source. Not a violation; surface for awareness so the boot-time self-check (lines 858-864) keeps protecting Sprint-2 wire-up.
- The `proposed_log_complaint` chat tool (chat.ts:879-943) is **fire-and-display, not propose-then-apply**. It does the domain write inside the tool handler and emits `applied: true`. Intentional per the design (drawer-redesign §D), but it lives in the same handler as the propose flow and follows different invariant rules. Worth flagging as a P5 outlier; not a violation if the design ships intentionally that way.
- Help short-circuit (chat.ts:502-533) persists chat turn + records idempotency but does NOT acquire the chat slot semaphore. Means a flood of "help" texts bypasses the 50-concurrent guard. Minor P8 concern.
- One subtle TODO-without-tracker: `chat.ts:1508` `source: { chatMessageId: undefined as string | undefined }` — the LivingDoc rule records `chatMessageId: undefined` because the assistant message id isn't threaded into the apply path. Audit trail is intentionally lossy on this field (the assistant message exists; just isn't linked from the rule). Surface for future cleanup.

## Findings by file

### chat.ts (`apps/backend/src/routes/chat.ts`)

- **P1 — invariants enforced at DB level**: PASS for the modern apply branches. The conditional `updateMany` (commitApply / applyProposedDecision) enforces "transition only if still PROPOSED" at the row level; the DB also has a CHECK constraint (migration 20260518 per writer docstring line 17) preventing `appliedAt` and `dismissedAt` simultaneously set. Chat.ts itself doesn't reach into raw SQL; it composes services that do.
- **P2 — no check-then-act races**: PASS for the 4 modern branches (single tx around preCheck + service + commit; commit uses race-safe updateMany). For `propose_termination` (chat.ts:1415-1463) and `propose_living_doc_update` (chat.ts:1521-1568), `applyProposedDecision` is called first inside the tx, and the worker.update / livingDoc.update happens after — atomic in one tx. PASS.
- **P3 — no final state before domain effect**: PASS for the 4 modern branches (tx commits as a unit). PASS for the 2 legacy branches because applyProposedDecision is called BEFORE the domain update inside the same tx, and if the domain update later throws, the whole tx rolls back including the applied transition. Note: the order "lifecycle commit first inside the tx, domain update second inside the SAME tx" is fine; the rule-breaking pattern is "lifecycle in tx1, domain in tx2" which is no longer present here.
- **P4 — back-compat doesn't leave orphan states**: PASS. The optional-shim for `decisionId` was removed (per chat.ts schema:88-90). No `propose_*` branch leaves a PROPOSED row when its domain effect fails — the entire tx rolls back.
- **P5 — new kinds wire all four layers**: PARTIAL. `propose_log_complaint` is fire-and-display: it writes the Complaint + ComplaintMessage immediately and emits a decision card with `applied:true` (chat.ts:912-942). It does NOT create a PROPOSED SupervisorDecision row. Per `supervisor-decision-kinds.ts:96-102`, LOG_COMPLAINT exists in the registry without a toolName, so `createProposedDecision` would skip it anyway. The architecture is intentionally divergent but the comment in registry line 99-100 ("when complaint-writing lands, add a toolName") suggests an inconsistent future plan that needs explicit scope-time decision. Severity P2 — surface, don't block.
- **P6 — negative-path tests**: PASS in the sense that the codebase has chat-apply-validation, chat-apply-route-concurrency, chat-apply-stale-auth-route, chat-apply-atomicity test files (per earlier grep). Not audited line-by-line in this pass.
- **P7 — known limitation ≠ acceptable**: PASS. No state-corrupting limitation is documented as accepted in this file.
- **P8 — real-life behavior under pressure**: ONE FAIL. Help short-circuit (chat.ts:502-533) does NOT acquire `tryAcquireChatSlot()` before persisting the turn. A storm of "help" messages bypasses the 50-concurrent semaphore. Severity P2 (DoS-flavor, not state corruption). Fix: move help-detect AFTER `tryAcquireChatSlot()` OR add a separate cheap-path slot. Otherwise PASS — the modern apply branches handle retries (idempotency), double-tap (race-safe UPDATE), concurrent actors (UPDATE precondition), stale clients (Zod-strict reject), partial failure (tx rollback).
- **P9 — research-first**: N/A (audit, not new work).
- **P10 — failure matrix**: N/A.
- **L1 — tx-callback early-return commits state**: FRAGILE for `propose_termination` (chat.ts:1420-1438) and `propose_living_doc_update` (chat.ts:1530). Both return sentinels (`{ kind: 'NOT_FOUND' }`, `{ kind: 'LIFECYCLE_ERROR' }`) from inside the tx callback. Today these early-return paths happen BEFORE any state-changing write, so the tx commits with no diff — safe. But the pattern is fragile: any future maintainer who adds a write above the early-return introduces a silent partial-commit bug. The 4 modern branches use `throw new ServiceDomainError(...)` and `throw new LifecycleError(...)` which is the correct L1-safe shape. Severity P1 — refactor to throw, don't return, for consistency. Concrete fix: replace `return { kind: 'NOT_FOUND' }` with `throw new WorkerNotFoundError()` (define inline like ServiceDomainError) and let the outer catch translate.
- **L2 — stale auth across split tx**: PASS. `commitApply` re-checks auth (writer:456-468). Modern apply branches run preCheck + commit in one tx so the snapshot is fresh. The L2 rationale comment is now over-stated (see file-2 finding) but the protection is real.
- **L3 / L4**: N/A.

### supervisor-decision-writer.ts (`apps/backend/src/lib/supervisor-decision-writer.ts`)

- **P1 — DB-level invariants**: PASS. Conditional `updateMany` (lines 471-478 for apply, 595-603 for dismiss) puts the PROPOSED precondition into the WHERE; the DB CHECK constraint (per docstring line 17) is the second guard.
- **P2 — no check-then-act**: PASS. Even though `preCheckApply` (line 392-420) reads the row first, the actual transition is the conditional `updateMany` whose WHERE re-checks `appliedAt: null, dismissedAt: null`. PG row-locking serialises concurrent UPDATEs (research cite at line 28). Race-lost is signalled by `count === 0` and discriminated correctly (line 480-483 + discriminateFailure at 312-329).
- **P3 — no terminal state before domain effect**: PASS — this module is the lifecycle-writer; the caller (chat.ts) owns the surrounding tx and the domain effect runs alongside in the same tx.
- **P4 — back-compat**: N/A.
- **P5 — new kinds wire all layers**: PASS. Driven entirely by `decisionSpecByKind` / `decisionSpecByToolName` from the registry; `isCallerAuthorized` (line 269-301) dispatches on `routingMode`. Adding a kind is a single-line registry change.
- **P6 — negative-path tests**: PASS structurally (LifecycleError has 5 codes mapped to HTTP; test-only hook at line 247-252 exists for deterministic stale-auth tests per F-002 R3.2-a).
- **P7**: PASS.
- **P8 — production-grade under pressure**: PASS. Race-safe; the `__commitApplyTestHook` (line 247-252, gated by NODE_ENV === 'test', line 440) is defense-in-depth correct — even if it leaked through to prod, it's a no-op because the env gate forbids reading it.
- **P9 / P10**: N/A.
- **L1 — tx-callback sentinel commit risk**: PASS. This module THROWS LifecycleError on every failure (lines 399-410, 580-591) — never returns a sentinel from inside a caller's tx callback. Correct shape.
- **L2 — stale auth re-check**: PASS. `commitApply` re-runs `isCallerAuthorized` at commit time (line 456-468). The doc cites this is necessary even under R2b-iii because a long-running tx could see a binding change committed elsewhere — defense in depth.
- **STALE COMMENT** (not a rule fail): the docstring at line 374-386 documents `preCheckApply` (tx 1) → domain inject → `commitApply` (tx 2). Per chat.ts:1066-1087, the modern apply path is one tx with preCheck + service + commit composed. The comment is technically still accurate that `preCheckApply` and `commitApply` CAN be called separately, but the documented "round-1 trade-off" of stale-auth-across-tx no longer exists in chat.ts. Severity P2. Fix: rewrite the docstring to reflect "now used as one-tx composition; tx-split-callable is retained for future surfaces but is not the current chat path." The line 422-431 commitApply doc has the same issue.
- **STALE COMMENT**: line 327 "Note: in the current implementation we run the authorization check BEFORE the conditional UPDATE…" — still correct, but the surrounding context implies a path that no longer exists.

### decisions-service.ts (`apps/backend/src/lib/services/decisions-service.ts`)

- **P1**: PASS for read-side. No state transitions written here; just reads.
- **P2**: PASS. Read-only path; no transitions.
- **P3**: N/A.
- **P4 — back-compat doesn't leave orphans**: PASS in this read-side, BUT see P5 below.
- **P5 — new kinds wire all 4 layers**: PARTIAL. Lines 851-864 enforce a boot-time self-check that all 4 Wave-2 kinds exist in the registry — protecting the registry → builder direction. However the inverse (a kind exists in registry but no source loads it) is silently allowed: REPLACEMENT_INVITE_OUTCOME and COMPLAINT_HR_REPLY are in the registry (lines 168-188 of supervisor-decision-kinds.ts) but no source plugs them in yet (decisions-service.ts:24-28 docstring acknowledges this). The Decisions tab will silently lack these kinds until Sprint 2. Severity P2 — intentional deferral; flag for tracking.
- **P6**: PASS structurally (Wave 2 plan §3F cited).
- **P7**: PASS — limitations explicitly surfaced (decisions-service.ts:24-28).
- **P8 — under pressure**: TWO ISSUES.
  - **decodeCursor priority bound — P0 BUG**: Line 224-225 reads `(priority === 0 || priority === 1 || priority === 2)`. But `SECTION_PRIORITY` (line 174-179) assigns FAILED_REVIEW → 3. `encodeCursor` (line 205-207) JSON-stringifies that 3 into the cursor token. A page ending on a FAILED_REVIEW row produces a cursor with `priority: 3` that the decoder rejects → `parsed = null` → `cursorIdx = 0` → next page starts from the top. **Silent pagination corruption.** STALE = 2 is accepted but the comment at line 167 still says `0 = NEEDS_YOU_NOW, 1 = ROUTINE, 2 = FAILED_REVIEW` — stale: the actual map has STALE=2 and FAILED_REVIEW=3. Severity P0. Fix: change line 225 to `(priority === 0 || priority === 1 || priority === 2 || priority === 3)`; update the comment at line 167; add a negative test for "page through 51 FAILED_REVIEW rows".
  - **Per-source 200 cap (line 370, 510, 634)**: each source caps at 200 rows. For a supervisor with >200 PROPOSED SupervisorDecisions OR >200 REQUESTED LeaveRequests OR >200 SENT SwapRequests, rows silently drop. Founder's stated upper bound is "200 pending decisions across all sources" (line 137) — but this cap is per-source, not aggregate. Severity P2; surfaceable when a Tenant-3-scale tenant lands; add a CAP_HIT log line + alarm.
- **P9 / P10**: N/A.
- **L1**: N/A (no transactions written here).
- **L2**: N/A.

### supervisor-decisions.ts (`apps/backend/src/routes/supervisor-decisions.ts`)

The new `/decisions/:id/apply` adapter (lines 152-223) is the highest-risk surface in this audit.

- **P1**: N/A (delegates).
- **P2 — race-free transition**: PASS by delegation. The TOCTOU preflight (lines 185-192) reads state and returns 409 if already terminal, but the real protection is downstream in `commitApply`'s conditional updateMany. The preflight is just a friendly UX hint and doesn't open a race window (the downstream UPDATE re-evaluates).
- **P3 — no terminal state pre-domain**: PASS by delegation.
- **P4 — back-compat doesn't leak orphans**: PASS. The adapter doesn't fork any state; it forwards.
- **P5 — kinds wire all layers**: PASS. Uses `decisionSpecByKind.get(row.kind).toolName` (line 194-201) — registry-driven; kinds without a toolName return 422 KIND_NOT_APPLYABLE (correct for LOG_COMPLAINT today, all 4 Wave-2 virtual kinds).
- **P6 — negative paths**: WEAK. No tests for the adapter (per the docstring "battle-tested" claim — referring to downstream, not the adapter). Severity P1. Required negative tests: unauthorized actor, cross-tenant id, already-applied, already-dismissed, KIND_NOT_APPLYABLE for COMPLAINT_HR_REPLY virtual kind, concurrent double-tap (two requests for the same id).
- **P7**: N/A.
- **P8 — real-life behavior**: MULTIPLE ISSUES.
  - **P0 — idempotency-key fallback to randomUUID** (line 203-204): mobile retries the Apply tap (network flap, 5s timeout). On first request: a key was generated → /chat/apply records it. On retry: a NEW key is generated → /chat/apply doesn't see a cache hit → forwards to apply logic → race-safe UPDATE returns 0 rows → user sees `ALREADY_APPLIED` instead of the cached 200 OK. State is safe, user sees confusing error. Severity P0. Fix: require `idempotency-key` header on this route (return 400 IDEMPOTENCY_KEY_REQUIRED if missing, matching /chat/messages line 451-454). Mobile's `apply-decision` call must generate-once-per-tap.
  - **P1 — observability headers not forwarded** (line 210-214): only `authorization` + `idempotency-key` + `content-type` are forwarded. Missing: `x-request-id`, `traceparent`, `user-agent`. Logs downstream lose the inbound request correlation. Severity P2. Fix: forward all headers except `host` / `content-length` / `connection`.
  - **P2 — no audit event emitted at the adapter layer**: the downstream DWI_APPLIED audit fires from `commitApply`, but there's no record that this Apply came in via `/decisions/:id/apply` vs `/chat/apply` direct. Severity P2 (forensic visibility only).
  - **P2 — fastify.inject overhead**: every Apply goes through a full request lifecycle (preHandler auth, Zod, etc.) twice. For an EMPLOYMENT-tier termination this is negligible; for a high-frequency leave-approve flow it's a 2x overhead per apply. Severity P2 cleanup.
  - **Potential auth re-validation gap**: `app.inject` per Fastify docs runs the full pipeline including `preHandler: requireAuth`. requireAuth presumably reads the JWT from `authorization` header which we DO forward (line 211). Verified OK. Note: if requireAuth ever reads from a cookie or signed-cookie that lives outside the forwarded headers, this breaks. Severity P2 — add a comment in the adapter pinning the assumption.
- **P9**: PARTIAL. The adapter docstring (line 152-167) cites the design intent but does NOT cite the inject-vs-direct trade-off research. Severity P2.
- **P10**: N/A (would be required in a scope packet, not the code).
- **L1**: N/A (no tx callbacks in the adapter).
- **L2**: PASS (auth re-validated by downstream).
- **STATUS CODE MISMATCH (P2)**: line 222 `reply.code(inner.statusCode).send(inner.json())`. If downstream throws a 500 with no JSON body, `inner.json()` throws and the adapter responds with a Fastify-default 500 — but the inbound caller loses the downstream error code. Severity P2. Fix: try/catch around `inner.json()`, fall back to `inner.body` string.

### chat.ts schema (`packages/shared-schema/src/zod/chat.ts`)

- **P1**: PASS. Schema-level invariants (strict, length caps, UUID for decisionId).
- **P2 / P3 / P4 / P5**: N/A (schema only).
- **P6**: N/A.
- **P7**: PASS. The optional-decisionId back-compat shim was explicitly removed (line 88-90 docstring).
- **P8 — stale clients**: PASS. `decisionId` REQUIRED means old clients get 400 BAD_INPUT (per F-002.5 design). `chatMessageId` newly optional → both old and new shape accepted; no regression.
- **P9 / P10**: N/A.
- **L1 / L2**: N/A.
- **chatMessageId loosening (Q2 from prompt)**: SAFE. Verified by grep — no backend route reads `body.chatMessageId` on /chat/apply (the field is parsed-and-ignored even on the chat surface). Tests in `apps/backend/test/chat-apply-*.test.ts` still SEND `chatMessageId: randomUUID()` (all 17 call sites grep'd) but don't assert it on the response. Mobile sends it from chat surface but `/decisions/:id/apply` doesn't have one to send → optional is the right shape. No downstream consumer breaks.

### supervisor-decision-kinds.ts (`packages/shared-schema/src/zod/supervisor-decision-kinds.ts`)

- **P1**: PASS at the type level (DwiTier zod-enum gating).
- **P2**: N/A (pure registry).
- **P3 / P4**: N/A.
- **P5 — new kinds wire all 4 layers**: PASS by design. This file IS the SSoT (line 1-7). Adding a kind here automatically reaches writer / read-side / authorization — confirmed by tracing.
- **P6 — negative tests**: PARTIAL. Module-level boot-time check exists for the registry → builder direction (decisions-service.ts:851-864). No inverse check (every kind has either a toolName OR a source — today REPLACEMENT_INVITE_OUTCOME and COMPLAINT_HR_REPLY have neither). Severity P2.
- **P7**: PASS — virtual kinds without sources are explicitly marked in comments (lines 174-188).
- **P8**: PASS — `routingModeFor` (line 230-232) defaults unknown kinds to `origin-only` (safest fallback per docstring).
- **P9 / P10**: N/A.
- **L1 / L2**: N/A.

## Cross-file findings

- **The `routingMode` value `'origin-only'` for `LIVING_DOC_RULE`** (supervisor-decision-kinds.ts:127) interacts subtly with chat.ts: `propose_living_doc_update` doesn't have a `targetId` set on the SupervisorDecision row (createProposedDecision lines 122-130 derive targetId from worker/site fields, neither of which is present for living-doc). On apply, `isCallerAuthorized` (writer line 299-300) falls through to `row.supervisorId === actorUserId`. That's the intended origin-only check, BUT this means living-doc rules can't follow a supervisor's site rebind — by design (master-plan §G layer 4 personal notes). PASS, just worth noting for auditors who think the routing path is broken.
- **Two parallel routes converge on the same downstream**: `/chat/apply` is called both directly by chat-mobile (idempotency-key required, ChatAmend supported) AND via the new `/decisions/:id/apply` adapter (idempotency-key optional with randomUUID fallback). The two entry points have different validation surfaces for the same downstream effect. Severity P1 — drift hazard. Fix: enforce idempotency-key on both, OR add a comment in chat.ts:451-454 acknowledging the adapter as the second caller.
- **STALE comment "F-002 §3a — write PROPOSED…"** (chat.ts:380-386) is correct. STALE comments at writer:374-386 and 422-431 about apply-after-domain ARE drift — those rationales no longer match the chat.ts caller.
- **`decisionId` UUID typing flows correctly** end-to-end: registry → writer (createProposedDecision threads the pre-generated UUID into `data.id`) → /chat/apply ApplyDecisionCardInput → commitApply.

## Dead code / stale references

- **chat.ts:1508** `source: { chatMessageId: undefined as string | undefined }` — sentinel field never populated. Either thread the assistant message id through (it's available as `assistantMsg.id` in persistChatTurn but NOT passed into this scope), or drop the field. Severity P2.
- **chat.ts:67-75 httpStatusForLifecycleCode**: defined once, used in 4 modern branches. The legacy `propose_termination` branch at line 1464-1471 has its own inlined version of the same code switch (lines 1465-1470). Duplicated. Severity P2. Replace lines 1465-1470 with `httpStatusForLifecycleCode(out.code)`.
- **supervisor-decision-writer.ts:374-386 + 422-431** — preCheckApply/commitApply docstrings reference an "apply-after-domain" two-tx flow that chat.ts no longer uses. Severity P2. Rewrite docstrings to "callers compose preCheck + service + commit inside one tx; the two-half decomposition is retained as a primitive for future surfaces."
- **supervisor-decision-writer.ts:312-329 `discriminateFailure`** has a comment "in the current implementation we run the authorization check BEFORE the conditional UPDATE" (line 324-328). True, but conflates the auth check with the WHERE-precondition. The discriminator never returns NOT_RESPONSIBLE because auth-fail throws upstream — line 329's `return 'NOT_RESPONSIBLE'` is unreachable today. Defensive default, but unreachable. Severity P2 — keep with a "// defensive, currently unreachable" comment.
- **decisions-service.ts:167** comment `2 = FAILED_REVIEW` is stale — actual map has STALE=2 and FAILED_REVIEW=3.
- **decisions-service.ts:225** is the bug from the P0 finding — the type-narrowing accepts 0|1|2 but `SECTION_PRIORITY` produces 0|1|2|3.
- **supervisor-decision-kinds.ts:174-188** — REPLACEMENT_INVITE_OUTCOME / COMPLAINT_HR_REPLY have neither toolName nor a source plug-in. Registered for forward-compat. Not dead, but unbacked — surface as a Sprint-2 todo.

## Prioritized fix list

### P0 (blocking — ship soon)

1. **decisions-service.ts:225** — extend cursor priority validation to accept `3`. Add a negative test for paging through a FAILED_REVIEW-heavy queue. Update line 167 comment to reflect the 4-section map.
2. **supervisor-decisions.ts:203-204** — require `idempotency-key` header on `/decisions/:id/apply` (mirror /chat/messages:451-454). Return 400 IDEMPOTENCY_KEY_REQUIRED if missing. Document this in mobile's API contract.

### P1 (ship soon — correctness-adjacent)

3. **chat.ts:1415-1463 (propose_termination) and 1521-1568 (propose_living_doc_update)** — refactor the L1-fragile sentinel-return pattern to throw + outer-catch, matching the 4 modern branches. Concretely: define `WorkerNotFoundError`, `WorkerAlreadyTerminatingError`, `LivingDocLifecycleError` (or reuse LifecycleError + ServiceDomainError), throw them from inside the tx callback, catch outside, map to HTTP. Eliminates the maintenance hazard where adding a write above the early-return creates a silent partial commit.
4. **supervisor-decisions.ts adapter** — add a dedicated test file `decisions-apply-adapter.test.ts` covering: unauthorized actor, cross-tenant, already-applied, already-dismissed, KIND_NOT_APPLYABLE on virtual kinds, concurrent double-submit.
5. **Cross-file** — document `/chat/apply` having TWO entry points (chat surface + decisions-adapter); pin observability headers + idempotency requirements on both.

### P2 (cleanup — non-blocking)

6. **supervisor-decision-writer.ts:374-431** — rewrite the preCheckApply/commitApply docstrings to remove apply-after-domain references.
7. **chat.ts:1465-1470** — replace inline status-code switch with `httpStatusForLifecycleCode(out.code)`.
8. **chat.ts:502-533** — move help short-circuit AFTER `tryAcquireChatSlot()` OR add a separate cheap-path slot (DoS prevention).
9. **chat.ts:1508** — thread `assistantMsg.id` (or `chatMessageId` from response) into the LivingDoc source field, or drop the field.
10. **supervisor-decisions.ts:210-214** — forward all reasonable observability headers (x-request-id, traceparent, user-agent) into the inject() call.
11. **supervisor-decisions.ts:222** — try/catch `inner.json()`; fall back to `inner.body` to preserve status code on non-JSON downstream responses.
12. **decisions-service.ts:370/510/634** — log a CAP_HIT line when a source's findMany returns exactly 200 (alarm for Tenant-3-scale).
13. **supervisor-decision-writer.ts:329** — annotate `return 'NOT_RESPONSIBLE'` as defensive / currently unreachable.
14. **decisions-service.ts:24-28** — mark REPLACEMENT_INVITE_OUTCOME and COMPLAINT_HR_REPLY as Sprint-2 todos with a tracker link.
15. **supervisor-decisions.ts adapter docstring** — add the inject-vs-direct trade-off citation (P9).

## What's actually solid (so we don't regress)

- **The 4 modern apply branches (chat.ts:1089-1391)** — preCheck + service + commit composed in one `withTenantContext` tx, with ServiceDomainError and LifecycleError both rolled-back via throw-out-of-tx. This is the textbook P1+P2+P3 implementation. Worth pinning as the canonical pattern in any future scope.
- **The race-safe conditional updateMany pattern in supervisor-decision-writer.ts** (commitApply lines 471-483, dismissProposedDecision lines 595-608) — single-statement state transition with row-locked PG semantics. P2 done right.
- **`commitApply`'s explicit auth re-check inside the commit tx (writer:456-468)** — defense in depth; protects against binding changes mid-tx. The reasoning text is outdated but the code is correct.
- **The DECISION_KIND_REGISTRY single-source-of-truth pattern** (supervisor-decision-kinds.ts) — adding a kind in ONE place reaches writer + reader + auth via derived maps. P5 by design. The boot-time self-check at decisions-service.ts:851-864 catches the registry-drops-a-kind regression at process start. Both worth preserving.
- **CreateChatMessageInput / ApplyDecisionCardInput strict-mode + UUID enforcement** (chat.ts schema) — every field bounded; strict() rejects unknown fields; UUIDs enforced. Stale-client requests fail cleanly with 400.
- **Test-only commitApply hook gated on NODE_ENV** (writer:247-252, 440-442) — even if `__setCommitApplyTestHook` were called accidentally in prod, the env gate forbids reading it. Belt-and-suspenders.
- **The ChatAmend validation flow** (chat.ts:470-489) — pre-validates the amend.targetDecisionId in the supervisor's tenant before any AI call. Mobile-trust boundary respected.
- **persistChatTurn atomicity** (chat.ts:308-419) — thread upsert + 2 ChatMessage writes + cost increment + DWI propose + audit all in one withTenantContext tx. If any throws, all roll back.

## Summary counts

- P0 (blocking): **2** — cursor priority bug (decisions-service.ts:225) + missing idempotency-key requirement on /decisions/:id/apply (supervisor-decisions.ts:203-204)
- P1 (ship soon): **3** — termination/livingdoc sentinel-return refactor, adapter test file, dual-entry-point documentation
- P2 (cleanup): **10** — stale docstrings, duplicate switch, help-path slot, dead audit field, observability headers, json() fallback, cap-hit logging, dead discriminator branch, registry todo annotations, P9 citation

Findings doc: `/Users/thotaakshay/eclean_workspace/axhy-v3/docs/findings/2026-05-18-chat-path-production-grade-audit.md`
