/**
 * Chat routes — POST /chat/messages and POST /chat/apply.
 * Wave 2a vertical slice: ONE tool wired (propose_create_assignment) + read tools.
 *
 * @derives(master-plan §G)
 */

import { createHash, randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import {
  CreateChatMessageInput,
  ApplyDecisionCardInput,
  LIVING_DOC_SECTION_TO_COLUMN,
  ProposeLivingDocUpdateInput,
  MarkAbsentInput,
  CreateLeaveRequestInput,
  CreateSwapRequestInput,
} from '@axhy/shared-schema';
import { z } from 'zod';
// CHAT_HISTORY_TURN_WINDOW now imported by `lib/prior-messages.ts` (the
// fallback path inside assembleSemanticContext) — chat.ts no longer
// uses it directly after the Wave A.3 Phase 2 semantic-retrieval swap.
import {
  openaiToolLoop,
  AICostBudgetError,
  incrementSpend,
  findWorkersTool,
  findSitesTool,
  proposeCreateAssignmentTool,
  proposeMarkAbsentTool,
  proposeLeaveTool,
  proposeLivingDocUpdateTool,
  proposeSwapTool,
  proposeTerminationTool,
  proposeLogComplaintTool,
  proposeClarifyTool,
} from '@axhy/ai-tools';
import { ProposeLogComplaintInput, ProposeClarifyInput } from '@axhy/shared-schema';
import { detectConflicts } from '@axhy/state-machines';
import { CreateAssignmentInput as CreateAssignmentInputSchema } from '@axhy/shared-schema';

import { prisma } from '../lib/prisma.js';
import { isoDateIST } from '../lib/ist-date.js';
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
import { requireRole } from '../middleware/role-gates.js';
import { recordAuditEvent } from '../lib/audit-event.js';
import {
  checkIdempotency,
  recordIdempotency,
  reserveIdempotency,
  releaseIdempotency,
} from '../lib/chat-idempotency.js';
import { tryAcquireChatSlot, releaseChatSlot } from '../lib/chat-concurrency.js';
import { checkAndConsumeRateLimit } from '../lib/redis-rate-limit.js';
import {
  assertCircuitClosed,
  recordSuccess as recordCircuitSuccess,
  recordFailure as recordCircuitFailure,
  CircuitOpenError,
} from '../lib/openai-circuit-breaker.js';
import { getLivingDoc } from '../lib/living-doc.js';
import { assertCallerSupervisesWorker } from '../lib/authorization/supervises-worker.js';
import { formatLivingDocPrompt } from '../lib/living-doc-prompt.js';
import { loadCalendarTier3 } from '../lib/calendar-context.js';
import { loadCompanyRules, loadHrRules } from '../lib/policy-rules-loader.js';
import { checkSupervisorTokenCap } from '../lib/supervisor-token-cap.js';
import { enforceLivingDocCap, emitAutoExpireAudits, readSections } from '../lib/living-doc-cap.js';
import { embedTurnAsync } from '../lib/turn-embedder.js';
import { assembleSemanticContext, type SemanticContextResult } from '../lib/semantic-context.js';
import {
  composeCompanyRulesBlock,
  composeHrRulesBlock,
  composeAmendBlock,
  PROMPT_INJECTION_DEFENSE_SENTENCE,
} from '../lib/prompt-composer.js';
import {
  createProposedDecision,
  applyProposedDecision,
  preCheckApply,
  commitApply,
  LifecycleError,
  type LifecycleErrorCode,
} from '../lib/supervisor-decision-writer.js';
import {
  createAssignmentService,
  type CreateAssignmentServiceInput,
} from '../lib/services/assignment-service.js';
import { createLeaveRequestService } from '../lib/services/leave-request-service.js';
import { markAbsentService } from '../lib/services/attendance-service.js';
import { createSwapRequestService } from '../lib/services/swap-request-service.js';
import { createComplaintWithInitialMessage } from '../lib/services/complaint-service.js';

/**
 * Map a LifecycleError code to its HTTP status.
 * @derives(F-002.4 — apply HTTP mapping)
 */
function httpStatusForLifecycleCode(code: LifecycleErrorCode): number {
  if (code === 'NOT_FOUND' || code === 'CROSS_TENANT') return 404;
  if (code === 'NOT_RESPONSIBLE') return 403;
  return 409;
}

/**
 * Thrown inside a /chat/apply tx callback when a service returns a domain
 * failure (e.g. WORKER_NOT_FOUND). Causes the entire tx (preCheck + lifecycle
 * + domain) to roll back. The outer catch maps the code to HTTP.
 *
 * Used by F-002.15 to surface service-discriminant failures as throwable so
 * Prisma rolls back the tx (lesson L1: early-return commits partial state).
 *
 * @derives(F-002.15 — service-domain failure mapping)
 */
class ServiceDomainError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = 'ServiceDomainError';
  }
}

/**
 * Thrown inside the chat-route pre-flight tx when the supervisor's
 * amend.targetDecisionId references a row that doesn't exist OR isn't
 * owned by the caller. Outer catch maps to HTTP 404.
 * Friend review #7 — module-scope so it's not re-allocated per request
 * and observability tools can reference it.
 */
class AmendTargetNotFoundError extends Error {
  constructor() {
    super('Amend target not found');
    this.name = 'AmendTargetNotFoundError';
  }
}

/**
 * Thrown inside the chat-route pre-flight tx when the supervisor has
 * burned their daily AI token budget. Outer catch maps to HTTP 429.
 * Friend review #7 — module-scope.
 */
class TokenCapReachedError extends Error {
  constructor(
    public readonly usedTodayTokens: number,
    public readonly dailyLimitTokens: number,
    public readonly nextResetAt: Date,
  ) {
    super('Daily token limit reached');
    this.name = 'TokenCapReachedError';
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Map a service-domain failure code to HTTP status. Most are 404 (resource
 * not found in the caller's tenant); a few are 400 (input validation failure
 * inside the service).
 * @derives(F-002.15)
 */
function httpStatusForServiceDomainCode(code: string): number {
  if (code === 'WORKER_NOT_FOUND' || code === 'SITE_NOT_FOUND') return 404;
  // Worker already in a terminal/in-flight termination state — same shape
  // the legacy propose_termination route returned (409) before the L1
  // sentinel-pattern refactor (audit P1 — chat-path audit 2026-05-18).
  if (code === 'ALREADY_TERMINATING') return 409;
  // One worker = one HR (site-anchored ownership) — assigning across HRs conflicts.
  if (code === 'WORKER_DIFFERENT_HR') return 409;
  return 400;
}

/**
 * Stripped system prompt — moved per-tool guidance into each tool's
 * `description` field where the model actually picks tools. Cross-call
 * behavior (one missing piece at a time, language matching) stays here.
 *
 * Founder-locked 2026-05-10 (panel: Aanya/Sara/Eric/Naina/Suresh persona):
 *   "less context but detailed" + supervisors learn-by-doing + day-365 view.
 * Old prompt was ~500 tokens of training-wheels duplication of the tool
 * descriptions. New prompt is ~60 tokens.
 */
const SYSTEM_PROMPT = `You help cleaning-company supervisors in India run their day. Use the tools to resolve names and propose actions; the supervisor confirms.
If a required field is missing, ask the supervisor for ONLY that one missing piece — never demand multiple fields at once.
Match the language the supervisor used (English, Hindi, Telugu, or mixed). Keep replies short.

INTENT CLASSIFIER (Wave 3 — Hyderabad supervisor phrasings)

Classify each supervisor message into ONE of these intents and act accordingly:

  mark_absent           Worker did not show up to work today.
                        Examples: "Mukesh absent today" · "Mukesh nahi aaya" ·
                          "Anjali ne phone kiya, kahi nahi aayi today" ·
                          "Pradeep ko bukhar hai, off today"
                        → call propose_mark_absent

  request_leave_decision Worker wants leave for a date range (existing tool).
                        Examples: "Suresh leave Monday to Wednesday" ·
                          "Lakshmi 3 din chuti chahiye"
                        → call propose_leave

  log_complaint         Work-quality issue, client complaint, damage, theft
                        accusation, missed area, attitude / rudeness, hygiene,
                        noise, photo mismatch, gate-pass issue AT A SPECIFIC
                        SITE.
                        Examples:
                          "lobby missed at Aparna A-block 11 AM today" → missed_area
                          "Anjali rude to resident's child Bhooja Mar 13" → attitude
                          "phenyl smell complaint from KIMS infection control" → hygiene
                          "client says her gold chain is missing from her flat at My Home Avatar" → theft_accusation
                          "broken tile, worker dropped bucket at Prestige Falcon City" → damage
                          "client called — terrace not done yesterday at Aparna Sarovar" → missed_area
                          "vacuum running 6 AM, residents complained at Lansum" → noise
                          "gate pass expired, Ramesh turned back at My Home Bhooja" → gate_pass
                          "photo of mopped floor doesn't match what the client saw at Aparna Cyber Life" → photo_mismatch
                        → call propose_log_complaint

  general               Greetings, status questions, anything else.
                        → no tool call; respond conversationally.

DISAMBIGUATION RULES (CRITICAL)

  * Worker absence vs site complaint:
      "<Worker> did not come today"           → mark_absent (about the worker)
      "lobby was not cleaned today at <Site>" → log_complaint (about the work)
      "<Worker> did not clean <Area> at <Site>" → log_complaint (missed_area)
        — log the complaint; do NOT also mark the worker absent unless
          supervisor explicitly says they did not come.

  * General venting:
      "everything is bad today" / "kuch bhi theek nahi hai" → general
        — DO NOT call propose_log_complaint without a CONCRETE site AND
          a CONCRETE event.

  * Ambiguous site name:
      Supervisor says "Aparna" but find_sites returns multiple matches
      (Aparna A-block, Aparna B-block, Aparna Sarovar, …)
        → call propose_clarify with options including each candidate site.

  * Ambiguous intent (≤0.7 confidence):
      "Mukesh issue at Aparna" — could be mark_absent OR log_complaint
        → call propose_clarify with options ["Mark absent", "Log complaint",
          "Something else"].
        — DO NOT guess when intent is genuinely unclear.

  * High-stakes complaint vs general:
      "client threatening to cancel because of cleanliness at <Site>"
        → log_complaint with severity=HIGH.
      "client cancelled <Site>"
        → general (this is news, not a complaint to log).

LANGUAGE NOTE

  Hinglish / Telugu-English / pure Hindi all common. Preserve the
  supervisor's wording in the complaint description field. Do NOT
  translate; HR portal users may need the original phrasing to follow up.

PROMPT INJECTION DEFENSE (Wave A 2026-05-19 — docs/locked/chat-abuse-prevention.md)

  ${PROMPT_INJECTION_DEFENSE_SENTENCE}

RULE HIERARCHY (docs/locked/rule-hierarchy-three-layers.md)

  When a request from the supervisor conflicts with a rule in <company_rules>
  (Layer 1), explain the rule and refuse the action. When it conflicts with
  <hr_rules> (Layer 2), explain the policy and offer to request an exception.
  When it conflicts with <supervisor_rules> (Layer 3), the higher-priority
  rule wins. Layer 1 beats Layer 2 beats Layer 3.

BREVITY (Phase 4 cost-reduction — docs/locked/vector-rag-context-assembly.md §7)

You are a supervisor's AI assistant. Be direct and brief.
- Action responses: state what you did in 1-2 sentences, then show the decision card.
- Informational responses: answer in 2-3 sentences max.
- Never restate the supervisor's request back to them.
- Never explain how tools work. Just use them.`;

/** Static help response — returned without any AI call when supervisor types help/menu. */
const HELP_TEXT = `I can help with:
• Mark a worker absent — say "Mukesh absent today"
• Request leave — say "Suresh leave Monday to Wednesday"
• Swap two workers — say "swap Ravi and Lakshmi at Hospital A tomorrow"
• Add a worker to a site — say "put Lakshmi at IT Park C from Monday"
• Terminate a worker — say "fire Pradeep, performance"
You can speak in Hindi, Telugu, English, or mix. I'll match.`;

const HELP_TRIGGERS = new Set([
  '/help',
  '/menu',
  'help',
  'menu',
  '?',
  'what can you do',
  'what can you do?',
  'kya kar sakte ho',
  'kya kar sakte ho?',
]);

// Number of prior chat turns to load for continuity is the
// CHAT_HISTORY_TURN_WINDOW constant from @axhy/business-rules
// (centralized Wave 4b Phase 2.5 cleanup).

// Wave A.3 Phase 2 — `loadPriorMessages` was extracted to
// `../lib/prior-messages.ts` and is now the fallback path inside
// `assembleSemanticContext` (semantic retrieval; see
// docs/locked/vector-rag-context-assembly.md §10.3). The route below
// calls `assembleSemanticContext` instead of `loadPriorMessages` directly.

/**
 * Persist a user-message + assistant-response turn. Used by both the
 * help short-circuit and the AI loop path so the on-disk shape is
 * identical regardless of whether AI was invoked.
 */
async function persistChatTurn(input: {
  companyId: string;
  supervisorId: string;
  userText: string;
  voiceConfidence: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  idempotencyKey: string;
  assistantText: string;
  toolCalls: ReadonlyArray<unknown>;
  decisionCards: ReadonlyArray<Record<string, unknown>>;
  modelUsed: string;
  /**
   * Cost in INR for the AI call that produced this turn. 0 for non-AI
   * paths (help short-circuit). Persisted to ChatMessage.costInr AND
   * atomically added to Company.aiSpendDailyInr inside this same tx.
   * @derives(spec-2 §9.2)
   */
  costInr: number;
  /**
   * OpenAI prompt_tokens_details.cached_tokens from the response (or null
   * for help short-circuit / non-cache paths). Used by ai_cost_daily view
   * for cache-hit ratio.
   * @derives(spec-2 §8.3)
   */
  cacheTokens: number | null;
  /**
   * Raw OpenAI input + output token counts from the final usage block.
   * Persisted to ChatMessage.tokensIn / tokensOut so the per-supervisor
   * daily token cap (supervisor-token-cap.ts) can sum them. Null when
   * the AI was bypassed (help short-circuit).
   * @derives(plans/abstract-wandering-kazoo.md Wave A follow-on)
   */
  tokensIn: number | null;
  tokensOut: number | null;
  /**
   * Wave 3 — optional photo attachments uploaded by mobile via the existing
   * S3 signed-URL pipeline. Persisted on the USER ChatMessage row's
   * `toolCalls` JSON under the key `attachments` (the field is unused on
   * user-rows today; piggy-backing avoids an additive schema migration this
   * wave). Mobile reads it back via `loadPriorMessages` callers in v3.1.
   *
   * Each entry is { type:'image', url }.
   */
  userAttachments: ReadonlyArray<{ type: 'image'; url: string }>;
  /**
   * Cluster A fix (P0, deep-review 2026-05-18). When present, the supervisor
   * is amending the named SupervisorDecision via chat. The id is persisted
   * on the user-row's `toolCalls` JSON under `amendTargetDecisionId` so the
   * audit trail records the intent. The route also surfaces this back to
   * mobile as `didAmend: true` so the client can gate its "amend complete"
   * celebration on actual amendment, not just any successful tool call.
   *
   * @derives(2026-05-18-sprint-2-deep-review.md Cluster A)
   */
  amendTargetDecisionId: string | null;
}): Promise<{
  chatMessageId: string;
  /** Wave A.3 Phase 1 — surfaced so the route can fire embedTurnAsync for semantic retrieval. */
  threadId: string;
  /** Wave A.3 Phase 1 — distinguishes the user-side message ID from the assistant-side `chatMessageId`. */
  userMessageId: string;
  assistantText: string;
  decisionCard: Record<string, unknown> | null;
  decisionCards: Array<Record<string, unknown>> | null;
  /** True iff the caller supplied a validated amend.targetDecisionId. */
  didAmend: boolean;
}> {
  // Wave 4b Phase 2.5 — wrap in withTenantContext so the Postgres GUC
  // `axhy.current_company_id` is set inside the tx → RLS policies fire.
  // persistChatTurn runs on every chat call; this is the hot path.
  // Panel-flagged Tier-1 fix.
  //
  // Wave A 2026-05-19 — 3-window refactor: ChatThread is no longer
  // @@unique([companyId, supervisorId]) per docs/locked/security-gaps-to-
  // fix.md GAP 8. Upsert-by-composite-key replaced with "find most-recent
  // active OR create new" so persistChatTurn picks the same thread that
  // loadPriorMessages did. If the supervisor has no ACTIVE thread (first
  // message ever, or all archived), this auto-creates one — the supervisor
  // never needs to tap "New thread" before their first send.
  const result = await withTenantContext(prisma, input.companyId, async (tx) => {
    const now = new Date();
    const existing = await tx.chatThread.findFirst({
      where: {
        companyId: input.companyId,
        supervisorId: input.supervisorId,
        archivedAt: null,
      },
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
    });
    const thread = existing
      ? await tx.chatThread.update({
          where: { id: existing.id },
          data: { lastMessageAt: now },
        })
      : await tx.chatThread.create({
          data: {
            companyId: input.companyId,
            supervisorId: input.supervisorId,
            lastMessageAt: now,
          },
        });

    // Cluster A fix (P0): build the user-row's `toolCalls` JSON to carry
    // BOTH attachments (Wave 3) AND amendTargetDecisionId (Sprint 2 deep-
    // review). Both piggyback on this field to avoid a schema migration
    // for opaque payload metadata.
    const userToolCallsJson: Record<string, unknown> = {};
    if (input.userAttachments.length > 0) {
      userToolCallsJson.attachments = input.userAttachments;
    }
    if (input.amendTargetDecisionId) {
      userToolCallsJson.amendTargetDecisionId = input.amendTargetDecisionId;
    }
    const userMsg = await tx.chatMessage.create({
      data: {
        companyId: input.companyId,
        threadId: thread.id,
        role: 'user',
        transcript: input.userText,
        voiceConfidence: input.voiceConfidence,
        idempotencyKey: input.idempotencyKey,
        toolCalls:
          Object.keys(userToolCallsJson).length > 0
            ? (userToolCallsJson as Prisma.InputJsonValue)
            : Prisma.JsonNull,
      },
    });

    const assistantMsg = await tx.chatMessage.create({
      data: {
        companyId: input.companyId,
        threadId: thread.id,
        role: 'assistant',
        aiResponseText: input.assistantText,
        toolCalls: input.toolCalls as Prisma.InputJsonValue,
        decisionCard:
          input.decisionCards.length === 0
            ? Prisma.JsonNull
            : ((input.decisionCards.length === 1
                ? input.decisionCards[0]
                : input.decisionCards) as Prisma.InputJsonValue),
        modelUsed: input.modelUsed,
        idempotencyKey: input.idempotencyKey,
        // Spec 2 §9.2 — per-turn AI cost in INR. 0 for non-AI paths
        // (help short-circuit). Number serializes to Decimal(12,4) via Prisma.
        costInr: input.costInr,
        // Spec 2 §8.3 — OpenAI prompt_tokens_details.cached_tokens for
        // ai_cost_daily view cache-hit-ratio aggregation.
        cacheTokens: input.cacheTokens,
        // Wave A follow-on — raw token counts feed the per-supervisor
        // daily token cap (supervisor-token-cap.ts).
        tokensIn: input.tokensIn,
        tokensOut: input.tokensOut,
      },
    });

    // Spec 2 §9.2 — atomic UPDATE via $executeRaw inside incrementSpend().
    // Single-statement col=col+x, no app-level read-modify-write race.
    await incrementSpend(input.companyId, input.costInr, tx);

    // F-002 §3a: write PROPOSED SupervisorDecision rows for each decision card
    // emitted by the AI loop. Done inside the SAME tx as the assistant message
    // so a partial-success state (chat message persisted but DWI row missing,
    // or vice versa) cannot exist. Cards without a `decisionId` are pre-F-002
    // shapes; skip them silently. Cards with an unmapped `toolName` (e.g., new
    // propose_* tools that haven't been added to TOOL_TO_DWI yet) also skip —
    // createProposedDecision returns null in that case.
    for (const card of input.decisionCards) {
      const decisionId = (card as { decisionId?: unknown }).decisionId;
      const toolName = (card as { toolName?: unknown }).toolName;
      const fields = (card as { fields?: unknown }).fields;
      if (typeof decisionId !== 'string') continue;
      if (typeof toolName !== 'string') continue;
      if (typeof fields !== 'object' || fields === null) continue;
      await createProposedDecision(tx, {
        decisionId,
        companyId: input.companyId,
        supervisorId: input.supervisorId,
        toolName,
        fields: fields as Record<string, unknown>,
        threadId: thread.id,
        assistantMessageId: assistantMsg.id,
      });
    }

    await recordAuditEvent(tx, {
      companyId: input.companyId,
      kind: 'CHAT_MESSAGE_CREATED',
      actorId: input.supervisorId,
      targetId: assistantMsg.id,
      payload: {
        textLen: input.userText.length,
        decisionCardCount: input.decisionCards.length,
        modelUsed: input.modelUsed,
        costInr: input.costInr,
      },
    });

    return {
      assistantMessageId: assistantMsg.id,
      userMessageId: userMsg.id,
      threadId: thread.id,
    };
  });

  return {
    chatMessageId: result.assistantMessageId,
    threadId: result.threadId,
    userMessageId: result.userMessageId,
    assistantText: input.assistantText,
    // Cluster A fix (P0, deep-review 2026-05-18): didAmend is the signal
    // mobile uses to decide whether to fire the "amend complete → nav to
    // /decisions?focus=<id>" celebration. Before this fix the celebration
    // fired on ANY successful tool call regardless of whether amendment
    // happened — see the deep-review findings doc.
    didAmend: input.amendTargetDecisionId !== null,
    ...(input.decisionCards.length > 1
      ? {
          decisionCard: null,
          decisionCards: [...input.decisionCards],
        }
      : {
          decisionCard: input.decisionCards[0] ?? null,
          decisionCards: null,
        }),
  };
}

// ─── Per-supervisor rate limit constants ────────────────────────────────────
// docs/locked/chat-abuse-prevention.md: max 30 messages per supervisor per
// 60-second window. The actual enforcement now goes through Redis-backed
// `checkAndConsumeRateLimit` (lib/redis-rate-limit.ts) so multi-replica
// deploys actually share the counter. See ADR-0024 supersession of ADR-0009.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
// /chat/apply has its own cap — same 60s window, more generous since
// applies don't burn AI tokens (they just commit DB writes).
const APPLY_RATE_LIMIT_MAX = 60;

export async function registerChatRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/chat/messages',
    { preHandler: [requireAuth, requireRole('SUPERVISOR')] },
    async (req, reply) => {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED' });
        return;
      }

      // ── ORDER OF GATES (friend review #3, CRITICAL) ──────────────────────
      // 1. Idempotency check FIRST — cached responses pay no rate-limit or
      //    circuit-breaker cost. Mobile retry on slow network must not burn
      //    5 slots for 1 actual message.
      // 2. Then rate limit (real new work).
      // 3. Then circuit breaker (real new AI call).
      // 4. Then reserve idempotency slot (commit to processing).
      // ─────────────────────────────────────────────────────────────────────
      const idempotencyKey = req.headers['idempotency-key'];
      if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8) {
        reply.code(400).send({ error: 'IDEMPOTENCY_KEY_REQUIRED' });
        return;
      }

      const parsed = CreateChatMessageInput.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
        return;
      }

      const dedup = await checkIdempotency(auth.companyId, idempotencyKey);
      if (dedup.cached === true) {
        reply.code(200).send(dedup.responseJson);
        return;
      }
      if (dedup.cached === 'in_flight') {
        reply.code(409).header('Retry-After', '2').send({
          error: 'IDEMPOTENCY_IN_FLIGHT',
          message:
            'A request with this Idempotency-Key is already being processed. Retry in a moment.',
        });
        return;
      }

      // Rate limit — only for fresh requests, not retries of cached responses.
      const rl = await checkAndConsumeRateLimit({
        route: 'chat:messages',
        subject: auth.userId,
        limit: RATE_LIMIT_MAX,
        windowMs: RATE_LIMIT_WINDOW_MS,
      });
      if (!rl.ok) {
        reply
          .code(429)
          .header('Retry-After', String(Math.ceil(rl.retryAfterMs / 1000)))
          .send({
            error: 'RATE_LIMITED',
            message: 'Too many messages. Please wait a moment.',
            retryAfterMs: rl.retryAfterMs,
          });
        return;
      }

      // OpenAI circuit breaker — fast-fail when upstream is known-bad.
      try {
        await assertCircuitClosed();
      } catch (err) {
        if (err instanceof CircuitOpenError) {
          reply
            .code(503)
            .header('Retry-After', String(Math.ceil(err.retryAfterMs / 1000)))
            .send({
              error: 'AI_TEMPORARILY_UNAVAILABLE',
              message: 'AI service is temporarily unavailable. Try again shortly.',
              retryAfterMs: err.retryAfterMs,
            });
          return;
        }
        throw err;
      }

      // Wave A — amend-target validation moved inside the consolidated
      // pre-flight withTenantContext block below so Company.status='ACTIVE'
      // is enforced for this read too.
      let validatedAmendDecisionId: string | null = null;

      // Reserve the idempotency slot AFTER passing rate-limit + circuit
      // gates — we're now committing to actual AI work for this key.
      const reserved = await reserveIdempotency(auth.companyId, idempotencyKey);
      if (!reserved) {
        // Another caller raced past us between checkIdempotency and now.
        // Re-check; if they finalised, we serve their response. If they're
        // still mid-flight, 409.
        const rechecked = await checkIdempotency(auth.companyId, idempotencyKey);
        if (rechecked.cached === true) {
          reply.code(200).send(rechecked.responseJson);
          return;
        }
        reply.code(409).header('Retry-After', '2').send({
          error: 'IDEMPOTENCY_IN_FLIGHT',
          message:
            'A request with this Idempotency-Key is already being processed. Retry in a moment.',
        });
        return;
      }

      // ── Help short-circuit ────────────────────────────────────────────────
      // Matches /help, "help", "?", "what can you do", Hindi variants. Returns
      // a static answer without burning any AI tokens. Still persists the
      // user message + assistant response so chat history stays consistent.
      const trimmed = parsed.data.text.trim().toLowerCase();
      if (HELP_TRIGGERS.has(trimmed)) {
        const helpResponse = await persistChatTurn({
          companyId: auth.companyId,
          supervisorId: auth.userId,
          userText: parsed.data.text,
          voiceConfidence: parsed.data.voiceConfidence ?? null,
          idempotencyKey,
          assistantText: HELP_TEXT,
          toolCalls: [],
          decisionCards: [],
          modelUsed: 'static',
          // Help short-circuit makes no AI call — zero cost, no cache tokens,
          // no tokens consumed.
          costInr: 0,
          cacheTokens: null,
          tokensIn: null,
          tokensOut: null,
          userAttachments: parsed.data.attachments ?? [],
          // Cluster A fix (P0, 2026-05-18): didAmend semantic is "backend
          // acknowledged the amendment intent" (validated + persisted), not
          // "tool successfully executed." Help short-circuit still persists
          // the intent on the user-row's toolCalls JSON so the audit trail
          // is complete even on the help path.
          amendTargetDecisionId: validatedAmendDecisionId,
        });
        await recordIdempotency(auth.companyId, idempotencyKey, helpResponse);
        reply.code(200).send(helpResponse);
        return;
      }

      // Distributed concurrency slot — Redis ZSET, multi-replica safe
      // (friend review #8). Caller must release in the `finally` below.
      const chatSlot = await tryAcquireChatSlot();
      if (chatSlot === null) {
        // Release the idempotency reservation so the retry is a fresh attempt
        // instead of a 120s IDEMPOTENCY_IN_FLIGHT lockout.
        await releaseIdempotency(auth.companyId, idempotencyKey).catch((cleanupErr) =>
          req.log.warn(
            { event: 'chat.cleanup.release_idempotency_failed', err: errMsg(cleanupErr) },
            'chat: releaseIdempotency failed on CHAT_BUSY early return',
          ),
        );
        reply.code(503).header('Retry-After', '5').send({ error: 'CHAT_BUSY' });
        return;
      }

      try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          await releaseIdempotency(auth.companyId, idempotencyKey).catch((cleanupErr) =>
            req.log.warn(
              { event: 'chat.cleanup.release_idempotency_failed', err: errMsg(cleanupErr) },
              'chat: releaseIdempotency failed on AI_NOT_CONFIGURED early return',
            ),
          );
          reply.code(500).send({
            error: 'AI_NOT_CONFIGURED',
            message: 'OPENAI_API_KEY missing — set it in apps/backend/.env.local',
          });
          return;
        }

        const tools = [
          findWorkersTool,
          findSitesTool,
          proposeCreateAssignmentTool,
          proposeMarkAbsentTool,
          proposeLeaveTool,
          proposeLivingDocUpdateTool,
          proposeSwapTool,
          proposeTerminationTool,
          proposeLogComplaintTool,
          proposeClarifyTool,
        ];

        // Wave A consolidated pre-flight read — one withTenantContext block
        // for ALL pre-AI reads. This (a) enforces Company.status='ACTIVE'
        // via the wrapper's GAP 1 fix, (b) loads Layer 1 + Layer 2 rules
        // from Policy table (chat-sidebar-context-flow.md step 5), (c) loads
        // LivingDoc + Calendar + prior chat history in one tx so all data
        // for this turn is consistent.
        //
        // If amend mode is active, the target lookup happens here too and
        // returns the kind/tier/targetId for the amend hint composer. A
        // missing or cross-tenant target throws AmendTargetNotFoundError
        // (defined at module scope below). Friend review #7 — error classes
        // belong at module scope so they're not re-allocated per request and
        // can be referenced by test/middleware/observability code.
        let preFlight: {
          priorMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
          /** Wave A.3 Phase 4 — entity-context hint block from semantic retrieval, or null when no entities found / fallback path. */
          entityHints: string | null;
          livingDocBlock: string;
          livingDocVersion: number;
          calendarBlock: string;
          companyRulesBlock: string;
          hrRulesBlock: string;
          amendBlock: string;
        };
        try {
          preFlight = await withTenantContext(prisma, auth.companyId, async (tx) => {
            // GAP 4 (redesigned 2026-05-19) — per-supervisor daily TOKEN cap
            // (default 50000/day, Policy-configurable, IST midnight reset).
            // Token-based instead of message-count because actual AI cost
            // scales with tokens, not message count. Checked BEFORE the AI
            // call so we never burn a budget slot on a capped supervisor.
            const cap = await checkSupervisorTokenCap(tx, {
              companyId: auth.companyId,
              supervisorId: auth.userId,
            });
            if (!cap.ok) {
              throw new TokenCapReachedError(
                cap.usedTodayTokens,
                cap.dailyLimitTokens,
                cap.nextResetAt,
              );
            }

            let amendBlock = '';
            if (parsed.data.amend?.targetDecisionId) {
              const target = await tx.supervisorDecision.findFirst({
                where: {
                  id: parsed.data.amend.targetDecisionId,
                  companyId: auth.companyId,
                  supervisorId: auth.userId,
                },
                select: { id: true, kind: true, tier: true, targetId: true },
              });
              if (!target) {
                throw new AmendTargetNotFoundError();
              }
              validatedAmendDecisionId = target.id;
              amendBlock = composeAmendBlock({
                decisionId: target.id,
                kind: target.kind,
                tier: target.tier,
                targetId: target.targetId,
              });
            }

            // Friend review #3 — Promise.allSettled so a slow/failing
            // peripheral read (calendar, LivingDoc) doesn't take down the
            // whole chat. Each piece has a safe default: empty history,
            // empty doc (with version 0 → no cache hit), empty calendar,
            // empty rule lists. Any rejection is logged so ops sees it.
            // Wave A.3 Phase 2 — `loadPriorMessages` swap. By default,
            // `assembleSemanticContext` runs pgvector similarity search.
            // The `SEMANTIC_CONTEXT_KILL_SWITCH` env var (Phase 5 — permanent
            // ops kill switch) can engage fallback to the blind 10-turn window
            // if set to 'true'. Default (unset or 'false') runs semantic.
            // @derives(docs/locked/vector-rag-context-assembly.md §5 + §9.1)
            const settled = await Promise.allSettled([
              assembleSemanticContext({
                tx,
                companyId: auth.companyId,
                supervisorId: auth.userId,
                threadId: null, // function resolves active thread internally
                userMessage: parsed.data.text,
              }),
              getLivingDoc(tx, auth.companyId, auth.userId),
              loadCalendarTier3(tx, auth.companyId, auth.userId),
              loadCompanyRules(tx, auth.companyId),
              loadHrRules(tx, auth.companyId),
            ]);
            function unwrap<T>(idx: number, label: string, fallback: T): T {
              const r = settled[idx]!;
              if (r.status === 'fulfilled') return r.value as T;
              req.log.warn(
                {
                  event: 'chat.preflight_partial_failure',
                  stream: label,
                  err: r.reason instanceof Error ? r.reason.message : String(r.reason),
                },
                `chat pre-flight: ${label} failed — using fallback`,
              );
              return fallback;
            }
            const semanticResult = unwrap<SemanticContextResult>(0, 'semanticContext', {
              priorMessages: [],
              entityHints: null,
              retrievalMeta: {
                source: 'fallback',
                semanticTurnsRetrieved: 0,
                continuityTurnsAdded: 0,
                totalTokensEstimate: 0,
                retrievalLatencyMs: 0,
                queryEmbeddingLatencyMs: 0,
                retrievalTopK: 0,
                retrievalUsedK: 0,
                maxSimilarityScore: null,
                minSimilarityScore: null,
                semanticMiss: false,
                baselineWindowTokens: 0,
                costDeltaVsBaseline: 0,
              },
            });
            const priorMessages = semanticResult.priorMessages;
            const entityHints = semanticResult.entityHints;
            const livingDoc = unwrap<Awaited<ReturnType<typeof getLivingDoc>>>(1, 'livingDoc', {
              id: '',
              companyId: auth.companyId,
              supervisorId: auth.userId,
              version: 0,
              siteRules: [],
              workerNotes: [],
              clientPreferences: [],
              recurringTasks: [],
              freeNotes: [],
            });
            const calendarBlock = unwrap<string>(2, 'calendar', '');
            const companyRules = unwrap<Awaited<ReturnType<typeof loadCompanyRules>>>(
              3,
              'companyRules',
              [],
            );
            const hrRules = unwrap<Awaited<ReturnType<typeof loadHrRules>>>(4, 'hrRules', []);

            return {
              priorMessages,
              entityHints,
              livingDocBlock: formatLivingDocPrompt(livingDoc),
              livingDocVersion: livingDoc.version,
              calendarBlock,
              companyRulesBlock: composeCompanyRulesBlock(companyRules),
              hrRulesBlock: composeHrRulesBlock(hrRules),
              amendBlock,
            };
          });
        } catch (err) {
          if (err instanceof TokenCapReachedError) {
            reply.code(429).header('X-Token-Cap-Reset-At', err.nextResetAt.toISOString());
            reply.send({
              error: 'TOKEN_LIMIT_REACHED',
              message: `You've used today's AI budget (${err.dailyLimitTokens} tokens). Resets at IST midnight.`,
              dailyLimitTokens: err.dailyLimitTokens,
              usedTodayTokens: err.usedTodayTokens,
              remainingTokens: 0,
              nextResetAt: err.nextResetAt.toISOString(),
            });
            return;
          }
          if (err instanceof AmendTargetNotFoundError) {
            reply.code(404).send({
              error: 'AMEND_TARGET_NOT_FOUND',
              message:
                'Decision being amended was not found in your tenant or is not owned by you.',
            });
            return;
          }
          // withTenantContext throws { statusCode: 403 } when Company is not ACTIVE.
          if (err && typeof err === 'object' && 'statusCode' in err && err.statusCode === 403) {
            reply.code(403).send({
              error: 'COMPANY_NOT_ACTIVE',
              message: 'Your company account is not active. Contact your administrator.',
            });
            return;
          }
          throw err;
        }

        // Wave 3 — if the supervisor attached photos, append a brief note to
        // the user message so the AI knows they exist. The Whisper / gpt-5.4-nano
        // surface is text-only; we do not stream image bytes (Vision pipeline
        // is out of scope). The note is enough to bias the intent classifier
        // toward `log_complaint` when a photo is attached. The attachment
        // hint is user-message context (it describes the supervisor's own
        // turn), not external data — no DATA-block wrapping needed. Amend
        // context, by contrast, comes from a prior decision row and IS now
        // wrapped as `<amend_context>` per docs/locked/chat-abuse-prevention.md.
        const attachmentCount = parsed.data.attachments?.length ?? 0;
        const userMessageWithAttachmentHint =
          attachmentCount > 0
            ? `${parsed.data.text}\n\n[Supervisor attached ${attachmentCount} photo${attachmentCount === 1 ? '' : 's'}. Treat as evidence supporting a possible complaint.]`
            : parsed.data.text;

        // Wave A.3 Phase 4 — prepend semantic-retrieval entity hints (if
        // any) so the model can skip find_workers / find_sites lookups
        // when the entity is already known from past turns. Spec §6 calls
        // for a separate Tier 5b system message; this minimal Phase 4
        // ships as a prefix on the user message (same model effect, less
        // openai-tool-loop surface area). Promoted to a proper system
        // block in a follow-up if measurement shows quality regressions.
        // @derives(docs/locked/vector-rag-context-assembly.md §6)
        const userMessageWithHints = preFlight.entityHints
          ? `${preFlight.entityHints}\n\n${userMessageWithAttachmentHint}`
          : userMessageWithAttachmentHint;

        // Concurrency slot already acquired above; no per-process counter needed.
        const loopResult = await openaiToolLoop({
          apiKey,
          systemPrompt: SYSTEM_PROMPT,
          userMessage: userMessageWithHints,
          priorMessages: preFlight.priorMessages,
          tools,
          maxIterations: 6,
          timeoutMs: 50000,
          // Spec 2 §9 — chat surface routes through `voice_change_parse` per
          // ADR-0023 model-policy entry (gpt-5.4-nano). Tenant ctx enables
          // the daily-budget gate; AICostBudgetError → 429 below.
          surface: 'voice_change_parse',
          tenantCtx: { companyId: auth.companyId, prisma },
          // docs/locked/chat-sidebar-context-flow.md step 6 — 6-tier prompt
          // composition. Layer 1 (company) + Layer 2 (HR) injected as DATA
          // blocks before Layer 3 (LivingDoc) so the rule hierarchy is
          // visible to the model in priority order. amendBlock replaces the
          // pre-Wave-A raw-string concat per chat-abuse-prevention.md.
          companyRulesBlock: preFlight.companyRulesBlock,
          hrRulesBlock: preFlight.hrRulesBlock,
          livingDocBlock: preFlight.livingDocBlock,
          calendarBlock: preFlight.calendarBlock,
          amendBlock: preFlight.amendBlock,
          livingDocVersion: preFlight.livingDocVersion,
          companyId: auth.companyId,
          supervisorId: auth.userId,
          handler: async (name, input) => {
            if (name === 'find_workers') {
              const workers = await withTenantContext(prisma, auth.companyId, async (tx) =>
                tx.worker.findMany({
                  where: {
                    companyId: auth.companyId,
                    name: { contains: String(input.query), mode: 'insensitive' },
                  },
                  take: 10,
                }),
              );
              return {
                output: {
                  exact: workers.length === 1 ? workers : [],
                  ambiguous: workers.length > 1 ? workers : [],
                  none: workers.length === 0,
                },
              };
            }
            if (name === 'find_sites') {
              const sites = await withTenantContext(prisma, auth.companyId, async (tx) =>
                tx.site.findMany({
                  where: {
                    companyId: auth.companyId,
                    name: { contains: String(input.query), mode: 'insensitive' },
                  },
                  take: 10,
                }),
              );
              return {
                output: {
                  exact: sites.length === 1 ? sites : [],
                  ambiguous: sites.length > 1 ? sites : [],
                  none: sites.length === 0,
                },
              };
            }
            if (name === 'propose_create_assignment') {
              // RULE 4 (docs/locked/chat-behavior-rules.md): never surface a
              // decision card for a worker/site that doesn't exist in the tenant.
              const exists = await withTenantContext(prisma, auth.companyId, async (tx) => {
                const w = await tx.worker.findFirst({
                  where: { id: input.workerId as string, companyId: auth.companyId },
                  select: { id: true },
                });
                const s = await tx.site.findFirst({
                  where: { id: input.siteId as string, companyId: auth.companyId },
                  select: { id: true },
                });
                return { worker: !!w, site: !!s };
              });
              if (!exists.worker) return { output: { error: 'WORKER_NOT_FOUND' } };
              if (!exists.site) return { output: { error: 'SITE_NOT_FOUND' } };

              // Plumb detectConflicts — Wave 4a-PRO Task 9
              const conflicts = await withTenantContext(prisma, auth.companyId, async (tx) => {
                const activeAssignments = await tx.assignment.findMany({
                  where: {
                    companyId: auth.companyId,
                    workerId: input.workerId as string,
                    state: 'ACTIVE',
                  },
                });
                return detectConflicts(
                  {
                    workerId: input.workerId as string,
                    dateRange: {
                      from: new Date(input.validFrom as string),
                      to: input.validUntil ? new Date(input.validUntil as string) : null,
                    },
                    newShift: {
                      shiftStart: input.shiftStart as string,
                      shiftEnd: input.shiftEnd as string,
                      dayMask: input.dayMask as string,
                    },
                  },
                  { activeAssignments, visits: [], calendarEntries: [], changeRequests: [] },
                );
              });

              const hasHard = conflicts.some((c) => c.severity === 'HARD');
              const hasSoft = conflicts.some((c) => c.severity === 'SOFT');
              const severity: 'CONFIRM' | 'WARN' | 'BLOCKED' = hasHard
                ? 'BLOCKED'
                : hasSoft
                  ? 'WARN'
                  : 'CONFIRM';
              const chips = hasSoft
                ? [
                    { label: 'Split shift', value: 'split-shift' },
                    { label: 'Covering for someone', value: 'covering' },
                    { label: 'Mistake — cancel', value: 'mistake' },
                    { label: 'Other', value: 'other' },
                  ]
                : undefined;

              return {
                output: { proposed: true, fields: input, conflicts },
                decisionCardData: {
                  decisionId: randomUUID(),
                  toolName: name,
                  title: 'Confirm assignment',
                  description: 'Create assignment with these fields?',
                  fields: input,
                  severity,
                  ...(conflicts.length > 0 ? { conflicts } : {}),
                  ...(chips ? { presets: { chips } } : {}),
                },
              };
            }
            if (name === 'propose_mark_absent') {
              const {
                workerId: wid,
                date,
                reason,
                reasonDetail,
              } = input as {
                workerId: string;
                date?: string;
                reason?: string;
                reasonDetail?: string;
              };
              // Walk 2026-06-11 bug #10: the apply path refuses workers the
              // caller doesn't supervise (attendance-service Q2=B), so check
              // the SAME authz at propose time — otherwise the AI says
              // "marked absent" and writes a decision that can never apply.
              const proposeCheck = await withTenantContext(prisma, auth.companyId, async (tx) => {
                const w = await tx.worker.findFirst({
                  where: { id: wid, companyId: auth.companyId },
                });
                if (!w) return { worker: null, roster: null } as const;
                const roster = await assertCallerSupervisesWorker(tx, {
                  companyId: auth.companyId,
                  callerUserId: auth.userId,
                  workerId: wid,
                });
                return { worker: w, roster } as const;
              });
              const worker = proposeCheck.worker;
              if (!worker) return { output: { error: 'WORKER_NOT_FOUND' } };
              if (proposeCheck.roster && proposeCheck.roster.kind !== 'OK') {
                return {
                  output: {
                    error: 'WORKER_NOT_ON_CALLER_ROSTER',
                    workerName: worker.name,
                    detail:
                      proposeCheck.roster.kind === 'FORBIDDEN'
                        ? 'Another supervisor is responsible for this worker.'
                        : 'This worker is not assigned to any of your sites, so you cannot mark them absent. Ask HR to add them to a site roster first.',
                  },
                };
              }
              // C1: "today" default must be the IST day, not UTC — at 4 AM IST
              // the UTC date is still yesterday and "Mukesh absent today" would
              // record the wrong day (findings 2026-06-10 C1).
              const dateStr = date ?? isoDateIST();
              return {
                output: {
                  proposed: true,
                  fields: { workerId: wid, date: dateStr, reason, reasonDetail },
                },
                decisionCardData: {
                  decisionId: randomUUID(),
                  toolName: name,
                  title: 'Mark absent',
                  description: `Mark ${worker.name} absent on ${dateStr}?`,
                  fields: {
                    workerId: wid,
                    date: dateStr,
                    reason: reason ?? 'unknown',
                    ...(reasonDetail ? { reasonDetail } : {}),
                  },
                  severity: 'CONFIRM',
                },
              };
            }
            if (name === 'propose_leave') {
              const {
                workerId: wid,
                fromDate,
                toDate,
                reason,
                reasonDetail,
              } = input as {
                workerId: string;
                fromDate: string;
                toDate: string;
                reason?: string;
                reasonDetail?: string;
              };
              const worker = await withTenantContext(prisma, auth.companyId, async (tx) =>
                tx.worker.findFirst({ where: { id: wid, companyId: auth.companyId } }),
              );
              if (!worker) return { output: { error: 'WORKER_NOT_FOUND' } };
              return {
                output: {
                  proposed: true,
                  fields: { workerId: wid, fromDate, toDate, reason, reasonDetail },
                },
                decisionCardData: {
                  decisionId: randomUUID(),
                  toolName: name,
                  title: 'Leave request',
                  description: `Submit leave for ${worker.name} from ${fromDate} to ${toDate}?`,
                  fields: {
                    workerId: wid,
                    fromDate,
                    toDate,
                    reason: reason ?? 'other',
                    ...(reasonDetail ? { reasonDetail } : {}),
                  },
                  severity: 'CONFIRM',
                },
              };
            }
            if (name === 'propose_swap') {
              const { fromWorkerId, toWorkerId, siteId, effectiveAt, reason } = input as {
                fromWorkerId: string;
                toWorkerId: string;
                siteId: string;
                effectiveAt: string;
                reason?: string;
              };
              if (fromWorkerId === toWorkerId) {
                return { output: { error: 'SAME_WORKER' } };
              }
              const out = await withTenantContext(prisma, auth.companyId, async (tx) => {
                const fw = await tx.worker.findFirst({
                  where: { id: fromWorkerId, companyId: auth.companyId },
                });
                const tw = await tx.worker.findFirst({
                  where: { id: toWorkerId, companyId: auth.companyId },
                });
                const site = await tx.site.findFirst({
                  where: { id: siteId, companyId: auth.companyId },
                });
                return { fw, tw, site };
              });
              if (!out.fw || !out.tw) return { output: { error: 'WORKER_NOT_FOUND' } };
              if (!out.site) return { output: { error: 'SITE_NOT_FOUND' } };
              return {
                output: {
                  proposed: true,
                  fields: { fromWorkerId, toWorkerId, siteId, effectiveAt, reason },
                },
                decisionCardData: {
                  decisionId: randomUUID(),
                  toolName: name,
                  title: 'Swap workers',
                  description: `Swap ${out.fw.name} → ${out.tw.name} at ${out.site.name}, effective ${effectiveAt}?`,
                  fields: {
                    fromWorkerId,
                    toWorkerId,
                    siteId,
                    effectiveAt,
                    ...(reason ? { reason } : {}),
                  },
                  severity: 'CONFIRM',
                },
              };
            }
            if (name === 'propose_termination') {
              const {
                workerId: wid,
                effectiveDate,
                reason,
                reasonDetail,
              } = input as {
                workerId: string;
                effectiveDate: string;
                reason: string;
                reasonDetail?: string;
              };
              const worker = await withTenantContext(prisma, auth.companyId, async (tx) =>
                tx.worker.findFirst({ where: { id: wid, companyId: auth.companyId } }),
              );
              if (!worker) return { output: { error: 'WORKER_NOT_FOUND' } };
              if (worker.state === 'TERMINATED' || worker.state === 'TERMINATION_PENDING') {
                return { output: { error: 'ALREADY_TERMINATING' } };
              }
              return {
                output: {
                  proposed: true,
                  fields: { workerId: wid, effectiveDate, reason, reasonDetail },
                },
                decisionCardData: {
                  decisionId: randomUUID(),
                  toolName: name,
                  title: 'Terminate worker',
                  description: `Terminate ${worker.name} effective ${effectiveDate}? Reason: ${reason}.`,
                  fields: {
                    workerId: wid,
                    effectiveDate,
                    reason,
                    ...(reasonDetail ? { reasonDetail } : {}),
                  },
                  severity: 'WARN',
                },
              };
            }
            if (name === 'propose_log_complaint') {
              // Wave 3 — chat-driven complaint flow. Validate via the shared
              // Zod schema (same one used by the future mobile complaint form
              // when it ships) so the tool path and the future direct-form
              // path cannot drift. Creates the Complaint + initial
              // ComplaintMessage + audit + outbox in ONE tx via the service.
              // Unlike `propose_create_assignment` (which proposes, supervisor
              // applies via /chat/apply), complaints are fire-and-display per
              // the design (`supervisor-drawer-and-decisions-redesign.md` §D);
              // the confirmation bubble IS the confirmation.
              const parsedTool = ProposeLogComplaintInput.safeParse(input);
              if (!parsedTool.success) {
                return { output: { error: 'BAD_TOOL_INPUT', message: parsedTool.error.message } };
              }
              const p = parsedTool.data;
              const observedAt = p.observedAt ? new Date(p.observedAt) : null;
              // H6: idempotency key for this complaint. Stable across request retries
              // (the request idempotencyKey) and unique per complaint content
              // (siteId|kind|text), so a replayed turn dedups to the same Complaint
              // even if the LLM re-emits the tool call with a fresh tool_call_id.
              const complaintDedupKey = `${idempotencyKey}:${createHash('sha256')
                .update(`${p.siteId}|${p.kind}|${p.description.trim()}`)
                .digest('hex')
                .slice(0, 16)}`;
              const result = await withTenantContext(prisma, auth.companyId, async (tx) =>
                createComplaintWithInitialMessage(tx, {
                  companyId: auth.companyId,
                  siteId: p.siteId,
                  supervisorUserId: auth.userId,
                  createdByUserId: auth.userId,
                  text: p.description,
                  severity: p.severity,
                  kind: p.kind,
                  observedAt,
                  origin: 'CHAT',
                  dedupKey: complaintDedupKey,
                }),
              );
              if (result.kind === 'SITE_NOT_FOUND') {
                return { output: { error: 'SITE_NOT_FOUND' } };
              }
              const kindLabel = p.kind.replace(/_/g, ' ');
              const confirmationText = `Logged complaint at ${result.siteName} · ${p.severity} · ${kindLabel} · sent to HR for review.`;
              return {
                output: {
                  proposed: false,
                  applied: true,
                  complaintId: result.complaintId,
                  initialMessageId: result.initialMessageId,
                  siteName: result.siteName,
                  confirmationText,
                  fields: {
                    siteId: p.siteId,
                    severity: p.severity,
                    kind: p.kind,
                    description: p.description,
                  },
                },
                decisionCardData: {
                  decisionId: randomUUID(),
                  toolName: name,
                  title: 'Complaint logged',
                  description: confirmationText,
                  fields: {
                    complaintId: result.complaintId,
                    siteId: p.siteId,
                    severity: p.severity,
                    kind: p.kind,
                  },
                  severity: 'CONFIRM',
                  origin: 'CHAT',
                },
              };
            }
            if (name === 'propose_clarify') {
              // Wave 3 — confidence-gated fallback. No domain write; just
              // surfaces the question + chips back to mobile. Mobile renders
              // the options as tappable chips; selecting a chip enqueues a
              // follow-up user message back through this same loop.
              const parsedTool = ProposeClarifyInput.safeParse(input);
              if (!parsedTool.success) {
                return { output: { error: 'BAD_TOOL_INPUT', message: parsedTool.error.message } };
              }
              const p = parsedTool.data;
              return {
                output: {
                  proposed: false,
                  clarify: true,
                  question: p.question,
                  options: p.options,
                },
                decisionCardData: {
                  decisionId: randomUUID(),
                  toolName: name,
                  title: p.question,
                  description: 'Tap an option to continue.',
                  fields: { question: p.question, options: p.options },
                  severity: 'CONFIRM',
                  clarify: true,
                },
              };
            }
            if (name === 'propose_living_doc_update') {
              // Spec 2 §6.2 — supervisor codifies a rule. AI emits this as
              // part of the main turn; we just validate + surface as a
              // DecisionCard. Actual write happens on /chat/apply.
              const parsedTool = ProposeLivingDocUpdateInput.safeParse(input);
              if (!parsedTool.success) {
                return { output: { error: 'BAD_TOOL_INPUT', message: parsedTool.error.message } };
              }
              const p = parsedTool.data;
              return {
                output: { proposed: true, fields: p },
                decisionCardData: {
                  decisionId: randomUUID(),
                  toolName: name,
                  // Wave 4b Phase 2.5 — Sara panel: 'Save rule for AI' is
                  // engineer-speak. Suresh-day-365 mental model is "I'm
                  // saving a note for next time."
                  title: 'Remember this for next time',
                  description: `${p.ruleText}`,
                  fields: p,
                  severity: 'CONFIRM',
                },
              };
            }
            return { output: { error: 'UNKNOWN_TOOL' } };
          },
        });

        const response = await persistChatTurn({
          companyId: auth.companyId,
          supervisorId: auth.userId,
          userText: parsed.data.text,
          voiceConfidence: parsed.data.voiceConfidence ?? null,
          idempotencyKey,
          assistantText: loopResult.finalText,
          toolCalls: loopResult.toolCalls,
          decisionCards: loopResult.decisionCards,
          modelUsed: loopResult.modelUsed,
          // Spec 2 §9.2 — costInr computed by openai-tool-loop from
          // finalUsage tokens × per-1K rate from model-policy.
          costInr: loopResult.costInr,
          // Spec 2 §8.3 — cached_tokens captured by openai-tool-loop from
          // response.usage.prompt_tokens_details (null when SDK omits).
          cacheTokens: loopResult.cacheTokens,
          // Wave A follow-on — feed the per-supervisor token cap.
          tokensIn: loopResult.usage.inputTokens,
          tokensOut: loopResult.usage.outputTokens,
          userAttachments: parsed.data.attachments ?? [],
          // Cluster A fix (P0, deep-review 2026-05-18): persist the
          // validated amend target so the audit trail records intent
          // AND the response carries `didAmend: true` for mobile.
          amendTargetDecisionId: validatedAmendDecisionId,
        });

        await recordIdempotency(auth.companyId, idempotencyKey, response);

        // Wave A.3 Phase 1 — fire-and-forget embedding for future semantic
        // retrieval. MUST NOT block the reply; failures logged, never thrown.
        // @derives(docs/locked/vector-rag-context-assembly.md §9.2 + §11)
        void embedTurnAsync({
          companyId: auth.companyId,
          supervisorId: auth.userId,
          threadId: response.threadId,
          userMessageId: response.userMessageId,
          assistantMessageId: response.chatMessageId,
          userText: parsed.data.text,
          assistantText: loopResult.finalText,
          toolCalls: loopResult.toolCalls.map((tc) => ({
            name: tc.toolName,
            input: tc.input,
          })),
          decisionCards: loopResult.decisionCards,
        }).catch((err) => {
          req.log.warn(
            { err: err instanceof Error ? err.message : String(err) },
            'turn embedding failed',
          );
        });

        // Successful OpenAI call → reset circuit breaker counter
        // (friend review #5).
        await recordCircuitSuccess();

        reply.code(200).send(response);
      } catch (err) {
        // Spec 2 §9.4 — daily AI budget exceeded. Friendly 429 with stable
        // error code so the mobile client maps to its `AIBudgetExceededError`
        // banner. NO retry-after header; cap clears at next UTC midnight.
        // The CAP outbox alert already fired inside `assertWithinBudget`.
        if (err instanceof AICostBudgetError) {
          // Release the reservation BEFORE returning — this branch returns
          // ahead of the Promise.allSettled cleanup below, so without this the
          // supervisor stays IDEMPOTENCY_IN_FLIGHT-locked for the full TTL.
          await releaseIdempotency(auth.companyId, idempotencyKey).catch((cleanupErr) =>
            req.log.warn(
              { event: 'chat.cleanup.release_idempotency_failed', err: errMsg(cleanupErr) },
              'chat: releaseIdempotency failed on AI_BUDGET_EXCEEDED early return',
            ),
          );
          reply.code(429).send({
            error: 'AI_BUDGET_EXCEEDED',
            message: 'Daily AI usage limit reached. Try again tomorrow.',
          });
          // OpenAI budget cap isn't an OpenAI outage — don't tick the circuit.
          return;
        }
        // #19: do NOT release the idempotency reservation in this general
        // (unexpected / transient) error path. It can be reached AFTER the AI tool
        // loop committed side effects (AI spend, audit, livingdoc; log_complaint is
        // already H6-dedup'd). Releasing would defeat the in-flight guard and let a
        // mobile retry storm re-run the turn → duplicate side effects. We instead let
        // the reservation expire on its own 120s TTL (#18), so a retry within that
        // window gets the in-flight signal (CHAT_BUSY) rather than re-executing.
        // The provably-pre-write branches above (AI_BUDGET_EXCEEDED /
        // AI_NOT_CONFIGURED / CHAT_BUSY) still release explicitly — no side effect
        // can have committed there. recordCircuitFailure still runs (own .catch).
        await recordCircuitFailure().catch((cleanupErr) => {
          req.log.warn(
            { event: 'chat.cleanup.circuit_record_failed', err: errMsg(cleanupErr) },
            'chat: recordCircuitFailure failed during error cleanup',
          );
        });
        throw err;
      } finally {
        await releaseChatSlot(chatSlot).catch((cleanupErr) => {
          req.log.warn(
            { event: 'chat.cleanup.release_slot_failed', err: errMsg(cleanupErr) },
            'chat: releaseChatSlot failed in finally',
          );
        });
      }
    },
  );

  app.post(
    '/chat/apply',
    { preHandler: [requireAuth, requireRole('SUPERVISOR')] },
    async (req, reply) => {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED' });
        return;
      }
      // Friend review #7 — rate limit /chat/apply too. Same Redis sliding
      // window, more generous cap since /apply commits DB writes but burns
      // no AI tokens.
      const applyRl = await checkAndConsumeRateLimit({
        route: 'chat:apply',
        subject: auth.userId,
        limit: APPLY_RATE_LIMIT_MAX,
        windowMs: RATE_LIMIT_WINDOW_MS,
      });
      if (!applyRl.ok) {
        reply
          .code(429)
          .header('Retry-After', String(Math.ceil(applyRl.retryAfterMs / 1000)))
          .send({
            error: 'RATE_LIMITED',
            message: 'Too many apply requests. Please wait a moment.',
            retryAfterMs: applyRl.retryAfterMs,
          });
        return;
      }
      const parsed = ApplyDecisionCardInput.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400).send({ error: 'BAD_INPUT', message: parsed.error.message });
        return;
      }

      // Capture the parsed payload at the outer scope so inner closures keep
      // the discriminated-union narrowing on `parsed.success === true`.
      const body = parsed.data;

      // F-002.15 — apply path uses tx-callable services for true atomicity
      // (round-2 R2b-iii, supersedes F-002.4's apply-after-domain trade-off).
      //
      // For the 4 ex-inject tools (propose_create_assignment, propose_mark_absent,
      // propose_leave, propose_swap), the apply flow is:
      //   1. Inside ONE withTenantContext(tx) callback:
      //      a. preCheckApply(tx, ...) — auth + observable guards; throws on
      //         failure so the tx rolls back cleanly (no state change).
      //      b. <service>(tx, input, auth) — domain write (e.g.
      //         markAbsentService); returns { kind: 'OK' | 'WORKER_NOT_FOUND' | ... }.
      //         On non-OK, throw ServiceDomainError → tx rolls back.
      //      c. commitApply(tx, ...) — race-safe conditional UPDATE + auth
      //         re-check (R2a). On race-lost or stale-auth, throws → rollback.
      //   2. If all three succeed, the tx commits. Lifecycle + domain happen
      //      atomically — neither succeeds alone.
      //
      // This eliminates the apply-after-domain trade-off: no path where the
      // domain side effect happens but the lifecycle is rejected.
      //
      // propose_termination + propose_living_doc_update already follow the same
      // atomic pattern (their own withTenantContext block calls
      // applyProposedDecision alongside the domain write). Kept unchanged.

      if (body.toolName === 'propose_create_assignment') {
        // The chat tool input may use oneOffDate (Zod accepts both shapes).
        // CreateAssignmentInput parses + normalises via expandOneOffToRecurring
        // in the route. We do the same here so the service sees a normalised
        // recurring shape.
        const parsedTool = CreateAssignmentInputSchema.safeParse(body.toolInput);
        if (!parsedTool.success) {
          reply.code(400).send({ error: 'BAD_INPUT', message: parsedTool.error.message });
          return;
        }
        let normalized: CreateAssignmentServiceInput;
        if ('oneOffDate' in parsedTool.data) {
          const { expandOneOffToRecurring } = await import('@axhy/state-machines');
          normalized = expandOneOffToRecurring(parsedTool.data);
        } else {
          normalized = {
            workerId: parsedTool.data.workerId,
            siteId: parsedTool.data.siteId,
            dayMask: parsedTool.data.dayMask,
            shiftStart: parsedTool.data.shiftStart,
            shiftEnd: parsedTool.data.shiftEnd,
            validFrom: parsedTool.data.validFrom,
            validUntil: parsedTool.data.validUntil ?? null,
          };
        }

        try {
          const result = await withTenantContext(prisma, auth.companyId, async (tx) => {
            const preCheck = await preCheckApply(tx, {
              companyId: auth.companyId,
              decisionId: body.decisionId,
              actorUserId: auth.userId,
            });
            const sr = await createAssignmentService(tx, normalized, {
              companyId: auth.companyId,
              userId: auth.userId,
            });
            if (sr.kind !== 'OK') throw new ServiceDomainError(sr.kind);
            await commitApply(tx, {
              companyId: auth.companyId,
              decisionId: body.decisionId,
              actorUserId: auth.userId,
              preCheck,
            });
            return sr.assignment;
          });
          reply.code(200).send({
            id: result.id,
            state: result.state,
            dayMask: result.dayMask,
            validFrom: result.validFrom.toISOString().slice(0, 10),
            validUntil: result.validUntil?.toISOString().slice(0, 10) ?? null,
          });
        } catch (err) {
          if (err instanceof LifecycleError) {
            reply.code(httpStatusForLifecycleCode(err.code)).send({ error: err.code });
            return;
          }
          if (err instanceof ServiceDomainError) {
            reply.code(httpStatusForServiceDomainCode(err.code)).send({ error: err.code });
            return;
          }
          throw err;
        }
        return;
      }

      if (body.toolName === 'propose_mark_absent') {
        const ti = body.toolInput as {
          workerId?: unknown;
          date?: unknown;
          reason?: unknown;
          reasonDetail?: unknown;
        };
        // R3.1 — validate via the SAME schemas the direct route uses (closes the
        // round-2 P1 regression where chat path skipped Zod). workerId lives in
        // the URL path on the direct route; we validate it as a UUID here.
        const workerIdParsed = z.string().uuid().safeParse(ti.workerId);
        if (!workerIdParsed.success) {
          reply.code(400).send({ error: 'BAD_INPUT', message: 'workerId must be a uuid' });
          return;
        }
        const reasonRaw =
          [ti.reason, ti.reasonDetail]
            .filter((v) => typeof v === 'string' && v.length > 0)
            .join(': ') || undefined;
        const parsedTool = MarkAbsentInput.safeParse({
          // C1: IST day default — see the propose_mark_absent handler note.
          date: ti.date ?? isoDateIST(),
          status: 'ABSENT_NO_CALL',
          ...(reasonRaw ? { reason: reasonRaw } : {}),
        });
        if (!parsedTool.success) {
          reply.code(400).send({ error: 'BAD_INPUT', message: parsedTool.error.message });
          return;
        }
        const workerId = workerIdParsed.data;
        const validatedInput = parsedTool.data;

        try {
          const result = await withTenantContext(prisma, auth.companyId, async (tx) => {
            const preCheck = await preCheckApply(tx, {
              companyId: auth.companyId,
              decisionId: body.decisionId,
              actorUserId: auth.userId,
            });
            const sr = await markAbsentService(
              tx,
              {
                workerId,
                date: validatedInput.date,
                status: validatedInput.status,
                reason: validatedInput.reason ?? null,
              },
              { companyId: auth.companyId, userId: auth.userId },
            );
            if (sr.kind !== 'OK') throw new ServiceDomainError(sr.kind);
            await commitApply(tx, {
              companyId: auth.companyId,
              decisionId: body.decisionId,
              actorUserId: auth.userId,
              preCheck,
            });
            return sr.attendance;
          });
          reply.code(200).send({
            ok: true,
            attendanceId: result.id,
            workerId: result.workerId,
            date: result.date.toISOString().slice(0, 10),
            status: result.status,
            payDeductPaise: result.payDeductPaise,
          });
        } catch (err) {
          if (err instanceof LifecycleError) {
            reply.code(httpStatusForLifecycleCode(err.code)).send({ error: err.code });
            return;
          }
          if (err instanceof ServiceDomainError) {
            reply.code(httpStatusForServiceDomainCode(err.code)).send({ error: err.code });
            return;
          }
          throw err;
        }
        return;
      }

      if (body.toolName === 'propose_leave') {
        const ti = body.toolInput as {
          workerId?: unknown;
          fromDate?: unknown;
          toDate?: unknown;
          reason?: unknown;
          reasonDetail?: unknown;
        };
        // R3.1 — validate via the SAME schema the direct route uses.
        const reasonStr =
          [ti.reason, ti.reasonDetail]
            .filter((v) => typeof v === 'string' && v.length > 0)
            .join(': ') || 'other';
        const parsedTool = CreateLeaveRequestInput.safeParse({
          workerId: ti.workerId,
          fromDate: ti.fromDate,
          toDate: ti.toDate,
          reason: reasonStr,
        });
        if (!parsedTool.success) {
          reply.code(400).send({ error: 'BAD_INPUT', message: parsedTool.error.message });
          return;
        }
        // fromDate <= toDate is route-only (not in the schema); preserve it.
        if (new Date(parsedTool.data.fromDate) > new Date(parsedTool.data.toDate)) {
          reply.code(400).send({ error: 'BAD_RANGE', message: 'fromDate must be ≤ toDate' });
          return;
        }
        const validatedInput = parsedTool.data;

        try {
          const result = await withTenantContext(prisma, auth.companyId, async (tx) => {
            const preCheck = await preCheckApply(tx, {
              companyId: auth.companyId,
              decisionId: body.decisionId,
              actorUserId: auth.userId,
            });
            const sr = await createLeaveRequestService(
              tx,
              {
                workerId: validatedInput.workerId,
                fromDate: validatedInput.fromDate,
                toDate: validatedInput.toDate,
                reason: validatedInput.reason,
              },
              { companyId: auth.companyId, userId: auth.userId },
            );
            if (sr.kind !== 'OK') throw new ServiceDomainError(sr.kind);
            await commitApply(tx, {
              companyId: auth.companyId,
              decisionId: body.decisionId,
              actorUserId: auth.userId,
              preCheck,
            });
            return sr.leave;
          });
          reply.code(201).send({
            ok: true,
            leaveRequestId: result.id,
            workerId: result.workerId,
            fromDate: result.fromDate.toISOString().slice(0, 10),
            toDate: result.toDate.toISOString().slice(0, 10),
            state: result.state,
          });
        } catch (err) {
          if (err instanceof LifecycleError) {
            reply.code(httpStatusForLifecycleCode(err.code)).send({ error: err.code });
            return;
          }
          if (err instanceof ServiceDomainError) {
            reply.code(httpStatusForServiceDomainCode(err.code)).send({ error: err.code });
            return;
          }
          throw err;
        }
        return;
      }

      if (body.toolName === 'propose_swap') {
        const ti = body.toolInput as {
          fromWorkerId?: unknown;
          toWorkerId?: unknown;
          siteId?: unknown;
          effectiveAt?: unknown;
          reason?: unknown;
        };
        // R3.1 — validate via the SAME schema the direct route uses (includes
        // the .refine that rejects fromWorkerId === toWorkerId — the regression
        // case friend's P1 flagged).
        const parsedTool = CreateSwapRequestInput.safeParse({
          fromWorkerId: ti.fromWorkerId,
          toWorkerId: ti.toWorkerId,
          siteId: ti.siteId,
          effectiveAt: ti.effectiveAt,
          ...(typeof ti.reason === 'string' ? { reason: ti.reason } : {}),
        });
        if (!parsedTool.success) {
          reply.code(400).send({ error: 'BAD_INPUT', message: parsedTool.error.message });
          return;
        }
        // effectiveAt-future check is route-only (schema only validates ISO format).
        if (new Date(parsedTool.data.effectiveAt).getTime() <= Date.now()) {
          reply
            .code(400)
            .send({ error: 'BAD_INPUT', message: 'effectiveAt must be in the future' });
          return;
        }
        const validatedInput = parsedTool.data;

        try {
          const result = await withTenantContext(prisma, auth.companyId, async (tx) => {
            const preCheck = await preCheckApply(tx, {
              companyId: auth.companyId,
              decisionId: body.decisionId,
              actorUserId: auth.userId,
            });
            const sr = await createSwapRequestService(
              tx,
              {
                fromWorkerId: validatedInput.fromWorkerId,
                toWorkerId: validatedInput.toWorkerId,
                siteId: validatedInput.siteId,
                effectiveAt: validatedInput.effectiveAt,
                reason: validatedInput.reason ?? null,
              },
              { companyId: auth.companyId, userId: auth.userId },
            );
            if (sr.kind !== 'OK') throw new ServiceDomainError(sr.kind);
            await commitApply(tx, {
              companyId: auth.companyId,
              decisionId: body.decisionId,
              actorUserId: auth.userId,
              preCheck,
            });
            return sr.swap;
          });
          reply.code(200).send({
            ok: true,
            swapRequestId: result.id,
            fromWorkerId: result.fromWorkerId,
            toWorkerId: result.toWorkerId,
            siteId: result.siteId,
            state: result.state,
            effectiveAt: result.effectiveAt.toISOString(),
            createdAt: result.createdAt.toISOString(),
          });
        } catch (err) {
          if (err instanceof LifecycleError) {
            reply.code(httpStatusForLifecycleCode(err.code)).send({ error: err.code });
            return;
          }
          if (err instanceof ServiceDomainError) {
            reply.code(httpStatusForServiceDomainCode(err.code)).send({ error: err.code });
            return;
          }
          throw err;
        }
        return;
      }

      if (parsed.data.toolName === 'propose_termination') {
        const {
          workerId: wid,
          effectiveDate,
          reason,
          reasonDetail,
        } = parsed.data.toolInput as {
          workerId: string;
          effectiveDate: string;
          reason: string;
          reasonDetail?: string;
        };
        // Audit P1 refactor (2026-05-18): replaced the L1-fragile
        // sentinel-return-from-tx-callback pattern with throw + outer catch,
        // matching the 4 modern apply branches above. Returning sentinels
        // from inside withTenantContext(tx) COMMITS the tx — safe today
        // (each early-return runs before any write) but one careless reorder
        // would land a partial commit. Throw + rollback is the production-
        // grade shape per production-grade-rulebook L1.
        //
        // F-002 §3b: lifecycle transition + worker.update share one tx —
        // fully atomic. If anything throws, the whole tx rolls back.
        // F-002.5: decisionId is required (Zod-enforced).
        try {
          const out = await withTenantContext(prisma, auth.companyId, async (tx) => {
            // Step 1: validate worker FIRST.
            const w = await tx.worker.findFirst({
              where: { id: wid, companyId: auth.companyId },
            });
            if (!w) throw new ServiceDomainError('WORKER_NOT_FOUND');
            if (w.state === 'TERMINATED' || w.state === 'TERMINATION_PENDING') {
              throw new ServiceDomainError('ALREADY_TERMINATING');
            }

            // Step 2: lifecycle commit. LifecycleError throws bubble out to
            // the outer catch; the tx rolls back automatically.
            await applyProposedDecision(tx, {
              companyId: auth.companyId,
              decisionId: parsed.data.decisionId,
              actorUserId: auth.userId,
            });

            // Step 3: worker.update + audit.
            // Race-safe + machine-correct: only transition from a state the
            // workerMachine has a TERMINATE edge from (worker.ts) — first-writer-wins,
            // so an illegal source state (TRANSFER_PENDING, DOC_PENDING, INVITED…)
            // or a concurrent change cannot land an invalid TERMINATION_PENDING.
            const TERMINATE_LEGAL_FROM = [
              'ACTIVE',
              'ON_LEAVE',
              'ON_SUSPENSION',
              'ABSENT',
              'AT_RISK',
              'BLOCKED',
              'INACTIVE',
            ];
            const updated = await tx.worker.updateMany({
              where: { id: wid, state: { in: TERMINATE_LEGAL_FROM } },
              data: { state: 'TERMINATION_PENDING' },
            });
            if (updated.count === 0) {
              throw new ServiceDomainError('WORKER_NOT_TERMINABLE');
            }
            await recordAuditEvent(tx, {
              companyId: auth.companyId,
              kind: 'WORKER_TERMINATION_REQUESTED',
              actorId: auth.userId,
              targetId: wid,
              payload: {
                effectiveDate,
                reason,
                reasonDetail: reasonDetail ?? null,
                previousState: w.state,
              },
            });
            return { worker: { id: wid, state: 'TERMINATION_PENDING' as const } };
          });
          reply.code(200).send({ workerId: out.worker.id, state: out.worker.state });
        } catch (err) {
          if (err instanceof LifecycleError) {
            reply.code(httpStatusForLifecycleCode(err.code)).send({ error: err.code });
            return;
          }
          if (err instanceof ServiceDomainError) {
            reply.code(httpStatusForServiceDomainCode(err.code)).send({ error: err.code });
            return;
          }
          throw err;
        }
        return;
      }

      if (parsed.data.toolName === 'propose_living_doc_update') {
        // Spec 2 §6.1 + §6.2 — supervisor confirmed; append rule to the
        // matching LivingDoc section + bump version (busts prompt cache so
        // next chat sees the new rule). Atomic in $transaction with the
        // AuditEvent write.
        const parsedTool = ProposeLivingDocUpdateInput.safeParse(parsed.data.toolInput);
        if (!parsedTool.success) {
          reply.code(400).send({ error: 'BAD_INPUT', message: parsedTool.error.message });
          return;
        }
        const p = parsedTool.data;
        const column = LIVING_DOC_SECTION_TO_COLUMN[p.section];
        const ruleId = randomUUID();
        const newRule = {
          id: ruleId,
          ruleText: p.ruleText,
          description: p.description,
          visibility: p.visibility,
          scope: p.scope,
          createdAt: new Date().toISOString(),
          createdBy: 'supervisor' as const,
          state: 'ACTIVE' as const,
          source: { chatMessageId: undefined as string | undefined },
        };

        // Wave 4b Phase 2.5 — wrap in withTenantContext so the Postgres GUC
        // `axhy.current_company_id` is set inside the tx → RLS policies fire.
        //
        // F-002.4 — fully atomic apply for living-doc: the DWI lifecycle
        // transition and the LivingDoc write share one transaction. If
        // applyProposedDecision throws (lifecycle guard failure) or the
        // LivingDoc write throws, the whole tx rolls back; neither effect
        // happens.
        //
        // Audit P1 refactor (2026-05-18): removed the sentinel-return
        // pattern. LifecycleError now bubbles out of the tx callback so
        // Postgres rolls the tx back; the outer catch translates to HTTP.
        try {
          const out = await withTenantContext(prisma, auth.companyId, async (tx) => {
            await applyProposedDecision(tx, {
              companyId: auth.companyId,
              decisionId: body.decisionId,
              actorUserId: auth.userId,
            });
            // Upsert ensures the row exists (first-time supervisor has no row).
            const doc = await tx.livingDoc.upsert({
              where: {
                companyId_supervisorId: {
                  companyId: auth.companyId,
                  supervisorId: auth.userId,
                },
              },
              create: { companyId: auth.companyId, supervisorId: auth.userId },
              update: {},
            });

            // GAP 5 — enforce the 100-active-rule cap BEFORE appending the new
            // rule. enforceLivingDocCap returns a new sections object with the
            // oldest ACTIVE rules auto-EXPIRED until count + 1 (the rule we're
            // about to add) is <= MAX_ACTIVE_RULES_PER_LIVING_DOC.
            const currentSections = readSections({
              siteRules: doc.siteRules,
              workerNotes: doc.workerNotes,
              clientPreferences: doc.clientPreferences,
              recurringTasks: doc.recurringTasks,
              freeNotes: doc.freeNotes,
            });
            const enforced = enforceLivingDocCap(currentSections, { expectedAddCount: 1 });
            // Append the new rule to its destination section (post-cap).
            enforced.sections[column as keyof typeof enforced.sections].push(newRule as never);

            const updated = await tx.livingDoc.update({
              where: { id: doc.id },
              data: {
                siteRules: enforced.sections.siteRules as unknown as Prisma.InputJsonValue,
                workerNotes: enforced.sections.workerNotes as unknown as Prisma.InputJsonValue,
                clientPreferences: enforced.sections
                  .clientPreferences as unknown as Prisma.InputJsonValue,
                recurringTasks: enforced.sections
                  .recurringTasks as unknown as Prisma.InputJsonValue,
                freeNotes: enforced.sections.freeNotes as unknown as Prisma.InputJsonValue,
                version: { increment: 1 },
              },
              select: { version: true },
            });

            // Emit the LIVING_DOC_RULE_ADDED audit FIRST so audit-trail readers
            // see the add before the auto-expire cascade (chronological clarity).
            await recordAuditEvent(tx, {
              companyId: auth.companyId,
              kind: 'LIVING_DOC_RULE_ADDED',
              actorId: auth.userId,
              targetId: ruleId,
              payload: {
                section: p.section,
                visibility: p.visibility,
                ruleText: p.ruleText,
                version: updated.version,
              },
            });
            if (enforced.expiries.length > 0) {
              await emitAutoExpireAudits(tx, {
                companyId: auth.companyId,
                actorUserId: auth.userId,
                livingDocVersionBeforeBump: updated.version - 1,
                expiries: enforced.expiries,
                triggeredBy: 'cap_overflow',
              });
            }
            return {
              ruleId,
              version: updated.version,
              autoExpiredCount: enforced.expiries.length,
            };
          });
          reply.code(200).send({
            ruleId: out.ruleId,
            version: out.version,
            autoExpiredCount: out.autoExpiredCount,
          });
        } catch (err) {
          if (err instanceof LifecycleError) {
            reply.code(httpStatusForLifecycleCode(err.code)).send({ error: err.code });
            return;
          }
          throw err;
        }
        return;
      }

      reply
        .code(501)
        .send({ error: 'NOT_IMPLEMENTED', message: `Unknown toolName: ${parsed.data.toolName}` });
    },
  );
}
