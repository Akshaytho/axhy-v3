---
Status: Shipped to feat branch (NOT yet merged to main)
Phase: Wave A.3 — Phase 1 of 6 (Foundation: embedding pipeline)
Branch: feat/vector-rag-wave-a3-phase-1 (pushed to origin)
Commits: df3c78d (core), fecd546 (pino ride-along), 407d357 (docs + learnings)
Spec: docs/locked/vector-rag-context-assembly.md (LOCKED 2026-05-20)
Plan: docs/plans/2026-05-20-vector-rag-wave-a3-phase-1.md
Author: Claude Opus 4.7
Date: 2026-05-20
---

# Done Memo — Vector RAG Wave A.3 Phase 1

## TL;DR

Embedding pipeline + locked-docs ride-along **shipped to feat branch**. Migration applied to Railway. 9/9 turn-embedder tests pass against real DB. Audit MEDIUM violations went from 12 → 4 (the 8 console.warn ones are gone). User sees zero behavior change because retrieval (Phase 2) hasn't shipped yet — Phase 1 only collects embeddings for Phase 2 to retrieve from.

**Awaiting founder review before merge to main.**

## What shipped

### Schema (1 migration)

- `packages/shared-schema/prisma/migrations/20260526_016_turn_embeddings/migration.sql`
  - New schema `axhy_chat` (parallel to existing `axhy_brain`)
  - New table `axhy_chat.turn_embeddings` with 14 columns
  - 5 indexes: PK + HNSW cosine + tenant + thread + decisions partial
  - Idempotency via `UNIQUE (user_message_id)` constraint
  - **Applied to Railway 2026-05-20** via `prisma migrate deploy`. Verified: 6 indexes (the 5 above + UNIQUE), 14 columns.

### Backend modules (2 new + 1 modified + 1 script + 1 test file)

- `apps/backend/src/lib/openai-embeddings.ts` (NEW, 131 LOC) — `embedText()` via `modelFor('embed_general')`. 3 typed error classes (`OpenAIEmbeddingError`, `OpenAIEmbeddingMissingKeyError`, `OpenAIEmbeddingMalformedError`). 5s `AbortSignal.timeout`.
- `apps/backend/src/lib/turn-embedder.ts` (NEW, 185 LOC) — `prepareTurnText()`, `embedTurnAsync()`, `anonymizeTurnEmbeddings()` (DPDP erasure stub per Eric Chen panel finding).
- `apps/backend/src/routes/chat.ts` (MODIFIED, 5 edits totaling +20/-1 LOC):
  1. Added import for `embedTurnAsync` (line 65)
  2. Extended `persistChatTurn` return type with `threadId` + `userMessageId` (line 391-402)
  3. Captured `userMsg = await tx.chatMessage.create(...)` (line 445)
  4. Changed inner `withTenantContext` callback return to object with 3 IDs (line 530-534)
  5. Updated outer return statement to surface new fields (line 537-541)
  6. Added `void embedTurnAsync(...).catch(...)` after `recordIdempotency` (line 1334-1352)
- `apps/backend/scripts/backfill-turn-embeddings.ts` (NEW, 275 LOC) — one-time backfill of existing ChatMessage pairs. Rate-limited (50/batch, 1s gap), resumable (ON CONFLICT DO NOTHING), `--dry-run` flag. Sandbox dry-run: 93 candidate turns, ₹0.0135 est cost.
- `apps/backend/test/turn-embedder.test.ts` (NEW, 249 LOC) — 9 real-DB integration tests against Railway sandbox. All passing in 21.8s.

### Locked-docs ride-along (pino sweep, 5 lib files)

- `apps/backend/src/lib/chat-concurrency.ts` (lines 122, 145) — 2 sites
- `apps/backend/src/lib/openai-circuit-breaker.ts` (lines 148, 180, 194) — 3 sites
- `apps/backend/src/lib/redis-rate-limit.ts` (line 125) — 1 site
- `apps/backend/src/lib/living-doc.ts` (line 29) — 1 site; defaultLog shim arg-order corrected to pino's `(obj, msg)` convention (external surface unchanged)
- `apps/backend/src/lib/redis.ts` (line 60) — 1 site

**8 sites total. console.\* in executable code: 0. (1 hit remains in living-doc.ts:87 JSDoc — intentional documentation.)**

### Docs + Learnings (3 new + 1 plan)

- `docs/plans/2026-05-20-vector-rag-wave-a3-phase-1.md` (NEW) — full implementation plan with verified spec drift, real-life scenarios, 9-voice production-readiness panel, cost projection, spec coverage matrix preview
- `docs/learnings/2026-05-20-all-supervisor-token-cap-replaces-message-count.md` (NEW) — suppresses false-positive audit warning. The 200-msg/day cap was replaced by 50K-tokens/day cap on 2026-05-19 (migration 015).
- `docs/learnings/2026-05-20-all-50-concurrent-semaphore-via-chat-concurrency.md` (NEW) — suppresses false-positive audit warning. The semaphore IS enforced via `tryAcquireChatSlot()` at chat.ts:704.
- 3 pre-existing learning files received regex-escape refinements to their `check_pattern` fields.

## Spec coverage matrix

Source spec: `docs/locked/vector-rag-context-assembly.md` (LOCKED 2026-05-20)

| Spec section | Feature                                                     | Status                                                                                                         | Notes                                                                                               |
| ------------ | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| §3.1         | `axhy_chat.turn_embeddings` schema + indexes                | ✅ shipped                                                                                                     | migration 016, commit df3c78d                                                                       |
| §3.2         | Separate schema vs reuse axhy_brain                         | ✅ shipped                                                                                                     | raw-SQL only, no Prisma model — matches axhy_brain pattern                                          |
| §3.3         | Row-Level Security policy                                   | ❌ deferred — Phase 2 / pre-launch                                                                             | per spec                                                                                            |
| §4.1         | When to embed (fire-and-forget after persistChatTurn)       | ✅ shipped                                                                                                     | chat.ts:1334-1352, commit df3c78d                                                                   |
| §4.2         | What to embed (combined user+assistant + tools + decisions) | ✅ shipped                                                                                                     | `prepareTurnText()` in turn-embedder.ts                                                             |
| §4.3         | Embedding model (`text-embedding-3-small`)                  | ✅ shipped                                                                                                     | via `modelFor('embed_general')`, openai-embeddings.ts                                               |
| §4.4         | Text preparation + 8000-char cap                            | ✅ shipped                                                                                                     | `prepareTurnText` clamps at 8000                                                                    |
| §4.5         | Backfill strategy                                           | ✅ shipped                                                                                                     | scripts/backfill-turn-embeddings.ts                                                                 |
| §5           | Semantic Context Assembly                                   | ❌ deferred — Phase 2                                                                                          | retrieval lands next                                                                                |
| §6           | Entity hints                                                | ❌ deferred — Phase 4                                                                                          | per spec                                                                                            |
| §7           | Output optimization (system prompt brevity)                 | ❌ deferred — Phase 4                                                                                          | per spec                                                                                            |
| §9.1         | `loadPriorMessages → assembleSemanticContext` swap          | ❌ deferred — Phase 2                                                                                          | per spec                                                                                            |
| §9.2         | `embedTurnAsync` after `persistChatTurn`                    | ✅ shipped                                                                                                     | chat.ts wire-in                                                                                     |
| §10          | `lib/semantic-context.ts`                                   | ❌ deferred — Phase 2                                                                                          | per spec                                                                                            |
| §11          | `lib/turn-embedder.ts`                                      | ✅ shipped                                                                                                     | per spec                                                                                            |
| §12          | Failure-mode handling                                       | ⚠️ partial — embed-API failure handled (timeout, `.catch()`, idempotent); query-side failures land in Phase 2  | per scope                                                                                           |
| §13          | Migration plan                                              | ⚠️ partial — Phase 1 done; Phases 2-6 pending                                                                  | per scope                                                                                           |
| §14          | Monitoring                                                  | ❌ deferred — Phase 3                                                                                          | per spec                                                                                            |
| §15          | Testing strategy (Phase 1 cases only)                       | ✅ shipped                                                                                                     | 9/9 tests passing on real DB                                                                        |
| §16          | GDPR/DPDP cascade delete + anonymization                    | ⚠️ partial — `anonymizeTurnEmbeddings()` stub shipped (Eric Chen panel); cascade-delete FK deferred to Phase 2 | panel-augmented                                                                                     |
| §17          | Things this design does NOT change                          | ✅ verified                                                                                                    | no changes to prompt structure, tool schemas, tier order, openaiToolLoop, persistChatTurn semantics |

**Coverage: 9 ✅ / 9 ❌ deferred / 3 ⚠️ partial of 21 named spec items.**

**Headline status: "Phase 1 (foundation) shipped to feat branch; Phases 2-6 pending per spec §13." This is the PLANNED phasing, not "shipped with known gaps."**

## Locked-docs ride-along coverage

- ✅ Pino sweep on 5 chat.ts-imported lib files (8 sites): done
- ✅ Conformance verification on chat.ts/persistChatTurn against chat-behavior-rules.md (RULES 1-10) + operational-invariants.md (INVARIANTS 5, 9, 12): VERIFIED — all hold (RULE 8 50-concurrent at line 704, RULE 10 idempotency at lines 593/651/1332, RULE 5 budget at line 764, INVARIANT 5 atomic spend at line 490)
- ✅ 2 conformance-verification learning files written
- ⚠️ Schema.prisma:968 `ChatThread @@unique` drift surfaced (NOT fixed — pre-existing, needs founder decision)
- ❌ `notifications.ts:293` + `auth.ts:79` raw-prisma audit MEDIUMs — out of scope (unrelated paths)
- ❌ Update to `session-audit.ts` to recognize `checkSupervisorTokenCap` + `tryAcquireChatSlot` patterns — separate session, learnings document the false positives until then

## Adversarial panel checkpoint (end-of-wave)

Per `feedback_adversarial_panel_at_wave_end.md` — names voices, asks "what's missing from spec?":

- **Maya Krishnan (architect):** "What in Phase 1 creates 6-month tech debt?" → Raw-SQL access pattern (no Prisma model for `axhy_chat`). Acceptable parity with `axhy_brain`. Revisit in Phase 2 if JOINs cross schemas.
- **Aanya Mehta (AI/voice):** "What spec'd AI surface promise is incomplete?" → ₹0.20/message target NOT delivered by Phase 1 alone. That's Phase 2. Coverage matrix is explicit about deferrals.
- **Naina Bansal (pricing):** "Could a runaway tenant burn unbounded?" → No. Embedding cost ~₹0.001/msg × token cap → max ~₹20/day platform-wide. 5s timeout caps event-loop exposure.
- **Suresh persona (day 365):** "What in Phase 1 makes my Tuesday morning worse?" → Nothing. Phase 1 is invisible to supervisors.
- **Mr. Reddy persona (day 365):** "Will I see value from this on my dashboard?" → Not in Phase 1. Phase 2 must follow within 7-10 days for moat to compound.
- **Vikram Shah (multi-tenant security):** "What tenant-isolation gap is deferred?" → RLS not on `turn_embeddings` in Phase 1. App-layer `WHERE company_id = $X` only. Tenant-isolation test in Phase 1 asserts row-level isolation. RLS lands in Phase 2.
- **Eric Chen (10-year arc):** "Of the deferrals, which compound badly?" → Anonymization. Mitigated: `anonymizeTurnEmbeddings()` 10-LOC stub shipped in Phase 1 per his panel finding. Cascade-delete FK still deferred to Phase 2.
- **Sara Park (UX):** "What rendered surface shows the new state?" → None. Phase 1 doesn't change UI. Phase 2 retrieval will need Playwright walkthrough.
- **Karthik (founder voice):** "Does this serve the supervisor brain principle?" → Yes — substrate for "strong memory" pillar.

**Gaps surfaced: 2 (RLS deferred + cascade-delete FK deferred). Both per spec phasing. No surprise gaps.**

## Orchestrator pre-merge 6-gate check (per `feedback_orchestrator_pre_merge_gate.md`)

1. **Cross-surface payload grep:** ✅ Only JSDoc-comment mentions in `openai-embeddings.ts`. No functional leakage.
2. **Race tests:** N/A — Phase 1 adds no state-changing routes. The `embedTurnAsync` fire-and-forget is idempotent via UNIQUE constraint + ON CONFLICT DO NOTHING.
3. **Inverse-notification check:** N/A — Phase 1 doesn't change notifications.
4. **Done-memo grep-against-code:** ✅ Every file:line claim in this memo verified against current code (e.g., chat.ts:704 contains `Distributed concurrency slot`; chat.ts:764 contains `checkSupervisorTokenCap`; chat.ts:1334 contains `void embedTurnAsync`).
5. **Routes-registered-in-server.ts:** N/A — Phase 1 adds no routes.
6. **Mobile↔backend HTTP method parity:** N/A — Phase 1 doesn't change any API surface.

**2 of 6 gates apply (1 + 4); both pass. Other 4 N/A because Phase 1 is purely additive on the embedding side.**

## Cost impact

- Embedding cost per chat message: ~₹0.001 (text-embedding-3-small at ~50 input tokens)
- Daily platform-wide overhead at projected scale (50 supervisors, 100 msgs/day): **~₹5/day**
- Backfill one-time cost (sandbox): **₹0.0135** (93 turns)
- Total Phase 1 ongoing cost: **negligible** (<0.1% of chat AI spend)

The cost-reduction win (₹38/day → ₹20/day per supervisor) lands in Phase 2, not Phase 1.

## What's pending (founder decisions)

1. **Merge feat branch to main?** Phase 1 is on `feat/vector-rag-wave-a3-phase-1`. Merging means Railway redeploys and live chat traffic starts collecting embeddings. Per `feedback_no_push_merge_without_review.md`, this needs explicit founder review.

2. **Run backfill live?** Sandbox backfill dry-run identified 93 candidate turns at ₹0.0135 cost. Live run is the founder's call to trigger.

3. **Spec amendment for the 3 file-claim drifts?** Per `feedback_locked_docs_founder_authored.md`, locked docs are founder-authored. The vector-rag-context-assembly.md has 3 file claims that don't match current code (chat-reload-context.ts not in scope, me.ts `learned-ok` not honored, etc.). Surfaced in plan §0 — separate amendment session needed.

4. **Schema.prisma:968 `ChatThread @@unique` drift?** Pre-existing drift between Prisma DSL and DB state after migrations 014+014b. Out of scope for Phase 1.

5. **Update session-audit.ts to recognize new patterns?** The 2 false-positive learnings document the issue but don't update the audit code. Separate session.

## Audit state after Phase 1

- BEFORE: 12 MEDIUM (8 console.warn + 2 unrelated + 2 false positives)
- AFTER: 4 MEDIUM (2 unrelated + 2 false positives)
- All BLOCKERS / HIGH: 0
- Audit verdict: "Safe to proceed"

## Next steps

Phase 2 — semantic retrieval (the actual cost win). New module `lib/semantic-context.ts`. Replace `loadPriorMessages` call with `assembleSemanticContext` in chat.ts. Feature flag `SEMANTIC_CONTEXT_ENABLED` for safe rollout. RLS policy on `turn_embeddings`. Cascade-delete FK.

Per spec §13 Phase 2 estimate: ~1 day of work. Recommended to follow within 7-10 days so the moat starts compounding.
