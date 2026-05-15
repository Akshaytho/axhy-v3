/**
 * Chat routes — POST /chat/messages and POST /chat/apply.
 * Wave 2a vertical slice: ONE tool wired (propose_create_assignment) + read tools.
 *
 * @derives(master-plan §G)
 */

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import {
  CreateChatMessageInput,
  ApplyDecisionCardInput,
  LIVING_DOC_SECTION_TO_COLUMN,
  ProposeLivingDocUpdateInput,
} from '@axhy/shared-schema';
import { CHAT_HISTORY_TURN_WINDOW } from '@axhy/business-rules';
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
} from '@axhy/ai-tools';
import { detectConflicts } from '@axhy/state-machines';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
import { recordAuditEvent } from '../lib/audit-event.js';
import { checkIdempotency, recordIdempotency } from '../lib/chat-idempotency.js';
import { tryAcquireChatSlot, releaseChatSlot } from '../lib/chat-concurrency.js';
import { getLivingDoc } from '../lib/living-doc.js';
import { formatLivingDocPrompt } from '../lib/living-doc-prompt.js';
import { loadCalendarTier3 } from '../lib/calendar-context.js';
import {
  createProposedDecision,
  applyProposedDecision,
  preCheckApply,
  commitApply,
  LifecycleError,
  type ApplyPreCheckResult,
  type LifecycleErrorCode,
} from '../lib/supervisor-decision-writer.js';

/**
 * Map a LifecycleError code to its HTTP status. Shared between the apply
 * pre-check failure (before domain inject) and the commit failure (after
 * domain inject, race-lost).
 * @derives(F-002.4 — apply-after-domain HTTP mapping)
 */
function httpStatusForLifecycleCode(code: LifecycleErrorCode): number {
  if (code === 'NOT_FOUND' || code === 'CROSS_TENANT') return 404;
  if (code === 'NOT_RESPONSIBLE') return 403;
  return 409;
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
Match the language the supervisor used (English, Hindi, Telugu, or mixed). Keep replies short.`;

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

/**
 * Load the last N turns of the supervisor's chat thread, oldest → newest,
 * formatted for openaiToolLoop's `priorMessages`. Returns [] when there
 * is no prior thread (first message ever from this supervisor).
 *
 * Each row is mapped: ChatMessage.role → 'user' | 'assistant' (database
 * already stores role as string); content = transcript (user) OR
 * aiResponseText (assistant). Empty content is filtered out.
 */
async function loadPriorMessages(
  companyId: string,
  supervisorId: string,
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const thread = await prisma.chatThread.findUnique({
    where: { companyId_supervisorId: { companyId, supervisorId } },
  });
  if (!thread) return [];
  const rows = await prisma.chatMessage.findMany({
    where: { companyId, threadId: thread.id },
    orderBy: { createdAt: 'desc' },
    take: CHAT_HISTORY_TURN_WINDOW,
  });
  return rows
    .reverse()
    .map((m) => ({
      role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
      content: m.role === 'assistant' ? (m.aiResponseText ?? '') : (m.transcript ?? ''),
    }))
    .filter((m) => m.content.length > 0);
}

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
}): Promise<{
  chatMessageId: string;
  assistantText: string;
  decisionCard: Record<string, unknown> | null;
  decisionCards: Array<Record<string, unknown>> | null;
}> {
  // Wave 4b Phase 2.5 — wrap in withTenantContext so the Postgres GUC
  // `axhy.current_company_id` is set inside the tx → RLS policies fire.
  // persistChatTurn runs on every chat call; this is the hot path.
  // Panel-flagged Tier-1 fix.
  const result = await withTenantContext(prisma, input.companyId, async (tx) => {
    const thread = await tx.chatThread.upsert({
      where: {
        companyId_supervisorId: {
          companyId: input.companyId,
          supervisorId: input.supervisorId,
        },
      },
      create: {
        companyId: input.companyId,
        supervisorId: input.supervisorId,
        lastMessageAt: new Date(),
      },
      update: { lastMessageAt: new Date() },
    });

    await tx.chatMessage.create({
      data: {
        companyId: input.companyId,
        threadId: thread.id,
        role: 'user',
        transcript: input.userText,
        voiceConfidence: input.voiceConfidence,
        idempotencyKey: input.idempotencyKey,
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
      },
    });

    // Spec 2 §9.2 — atomic UPDATE … SET col=col+x inside the same tx as
    // the ChatMessage write. Race-free at the 50-concurrent semaphore
    // because the increment is a single DB statement, no app-level
    // read-modify-write. Zero-cost paths short-circuit inside incrementSpend.
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

    return assistantMsg.id;
  });

  return {
    chatMessageId: result,
    assistantText: input.assistantText,
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

export async function registerChatRoutes(app: FastifyInstance): Promise<void> {
  app.post('/chat/messages', { preHandler: requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) {
      reply.code(401).send({ error: 'AUTH_REQUIRED' });
      return;
    }

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

    const dedup = await checkIdempotency(prisma, auth.companyId, idempotencyKey);
    if (dedup.cached) {
      reply.code(200).send(dedup.responseJson);
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
        // Help short-circuit makes no AI call — zero cost, no cache tokens.
        costInr: 0,
        cacheTokens: null,
      });
      await recordIdempotency(
        prisma,
        auth.companyId,
        idempotencyKey,
        helpResponse,
        helpResponse.chatMessageId,
      );
      reply.code(200).send(helpResponse);
      return;
    }

    if (!tryAcquireChatSlot()) {
      reply.code(503).header('Retry-After', '5').send({ error: 'CHAT_BUSY' });
      return;
    }

    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
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
      ];

      // Load last N turns from this supervisor's chat thread so the model
      // sees prior context (otherwise every message is zero-shot).
      const priorMessages = await loadPriorMessages(auth.companyId, auth.userId);

      // Spec 2 §3.5 + §6.1 + §8.1 — Tier 2 + Tier 3 prompt context.
      // getLivingDoc upserts on first read so chat path always has a doc;
      // formatter returns empty string when all 5 sections empty (no
      // wasted system-message slot). loadCalendarTier3 returns empty
      // string when no entries in last 30 days.
      const livingDoc = await getLivingDoc(prisma, auth.companyId, auth.userId);
      const livingDocBlock = formatLivingDocPrompt(livingDoc);
      const calendarBlock = await loadCalendarTier3(prisma, auth.companyId, auth.userId);

      const loopResult = await openaiToolLoop({
        apiKey,
        systemPrompt: SYSTEM_PROMPT,
        userMessage: parsed.data.text,
        priorMessages,
        tools,
        maxIterations: 6,
        timeoutMs: 50000,
        // Spec 2 §9 — chat surface routes through `voice_change_parse` per
        // ADR-0023 model-policy entry (gpt-5.4-nano). Tenant ctx enables
        // the daily-budget gate; AICostBudgetError → 429 below.
        surface: 'voice_change_parse',
        tenantCtx: { companyId: auth.companyId, prisma },
        // Spec 2 §8 — 3-tier prompt cache. livingDocVersion + (companyId,
        // supervisorId) form the prompt_cache_key for routing consistency
        // and busts cache when supervisor adds a new rule (version bump).
        livingDocBlock,
        calendarBlock,
        livingDocVersion: livingDoc.version,
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
            const worker = await withTenantContext(prisma, auth.companyId, async (tx) =>
              tx.worker.findFirst({ where: { id: wid, companyId: auth.companyId } }),
            );
            if (!worker) return { output: { error: 'WORKER_NOT_FOUND' } };
            const dateStr = date ?? new Date().toISOString().slice(0, 10);
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
      });

      await recordIdempotency(
        prisma,
        auth.companyId,
        idempotencyKey,
        response,
        response.chatMessageId,
      );

      reply.code(200).send(response);
    } catch (err) {
      // Spec 2 §9.4 — daily AI budget exceeded. Friendly 429 with stable
      // error code so the mobile client maps to its `AIBudgetExceededError`
      // banner. NO retry-after header; cap clears at next UTC midnight.
      // The CAP outbox alert already fired inside `assertWithinBudget`.
      if (err instanceof AICostBudgetError) {
        reply.code(429).send({
          error: 'AI_BUDGET_EXCEEDED',
          message: 'Daily AI usage limit reached. Try again tomorrow.',
        });
        return;
      }
      throw err;
    } finally {
      releaseChatSlot();
    }
  });

  app.post('/chat/apply', { preHandler: requireAuth }, async (req, reply) => {
    const auth = req.auth;
    if (!auth) {
      reply.code(401).send({ error: 'AUTH_REQUIRED' });
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

    // F-002.4 — apply-after-domain (production-grade rule P3).
    //
    // For inject-style tools (mark_absent / leave / swap / create_assignment /
    // living_doc_update), the apply flow is:
    //   1. preCheckApply (tx 1) — auth + early-fail observable guards. If this
    //      throws, no domain side-effect happens. Returns 4xx; row stays PROPOSED.
    //   2. Domain inject — the existing `app.inject` to the route.
    //   3. If inject returned 2xx → commitApply (tx 2) — race-safe conditional
    //      UPDATE to set appliedAt. If a concurrent dismiss won the race in the
    //      window between (1) and (3), commitApply throws ALREADY_DISMISSED;
    //      the lifecycle audit only contains DWI_DISMISSED (the winner). The
    //      domain effect from step 2 already happened and is recorded in the
    //      domain's own audit trail (e.g., WORKER_MARKED_ABSENT). This
    //      asymmetry is intentional under apply-after-domain (rule P3 trade-off).
    //   4. If inject returned non-2xx → no commit; row stays PROPOSED. Caller
    //      sees the domain error and can retry or dismiss.
    //
    // propose_termination is special — its tx wraps both the lifecycle update
    // (via applyProposedDecision) and the worker.update, so it's fully atomic
    // in a single transaction. We do NOT use the split pattern for it.
    let applyPreCheck: ApplyPreCheckResult | null = null;
    if (parsed.data.toolName !== 'propose_termination') {
      try {
        applyPreCheck = await withTenantContext(prisma, auth.companyId, async (tx) =>
          preCheckApply(tx, {
            companyId: auth.companyId,
            decisionId: parsed.data.decisionId,
            actorUserId: auth.userId,
          }),
        );
      } catch (err) {
        if (err instanceof LifecycleError) {
          reply.code(httpStatusForLifecycleCode(err.code)).send({ error: err.code });
          return;
        }
        throw err;
      }
    }

    /**
     * After a successful (2xx) domain inject, commit the lifecycle UPDATE
     * race-safely. If the conditional UPDATE returns 0 rows, a concurrent
     * dismiss won — we return 409. The inject's response body is still
     * available to the caller via the domain audit trail.
     */
    async function commitAfterDomain(): Promise<
      { ok: true } | { ok: false; httpStatus: number; error: string }
    > {
      if (!applyPreCheck) return { ok: true }; // never happens for non-termination; guard for type-narrowing
      try {
        await withTenantContext(prisma, auth!.companyId, async (tx) =>
          commitApply(tx, {
            companyId: auth!.companyId,
            decisionId: body.decisionId,
            actorUserId: auth!.userId,
            preCheck: applyPreCheck!,
          }),
        );
        return { ok: true };
      } catch (err) {
        if (err instanceof LifecycleError) {
          return { ok: false, httpStatus: httpStatusForLifecycleCode(err.code), error: err.code };
        }
        throw err;
      }
    }

    /**
     * Helper: forward an inject response, and on 2xx run the lifecycle commit.
     * If commit fails (race lost), return the commit error instead of the
     * domain response. The domain effect already happened; the audit trail
     * reflects that separately.
     */
    async function forwardWithCommit(inner: Awaited<ReturnType<typeof app.inject>>): Promise<void> {
      const isSuccess = inner.statusCode >= 200 && inner.statusCode < 300;
      if (!isSuccess) {
        // Domain failed → no lifecycle commit; row stays PROPOSED.
        reply.code(inner.statusCode).send(inner.json());
        return;
      }
      const commit = await commitAfterDomain();
      if (!commit.ok) {
        reply.code(commit.httpStatus).send({ error: commit.error });
        return;
      }
      reply.code(inner.statusCode).send(inner.json());
    }

    if (parsed.data.toolName === 'propose_create_assignment') {
      const inner = await app.inject({
        method: 'POST',
        url: '/assignments',
        headers: { authorization: req.headers.authorization! },
        payload: parsed.data.toolInput,
      });
      await forwardWithCommit(inner);
      return;
    }

    if (parsed.data.toolName === 'propose_mark_absent') {
      const ti = parsed.data.toolInput as {
        workerId: string;
        date?: string;
        reason?: string;
        reasonDetail?: string;
      };
      // POST /workers/:id/mark-absent accepts { date, status, reason } per
      // packages/shared-schema/src/zod/supervisor.ts:71-78. status defaults to
      // 'ABSENT_NO_CALL'. Merge reason+reasonDetail into a single freeform string.
      const reasonStr = [ti.reason, ti.reasonDetail].filter(Boolean).join(': ') || undefined;
      const inner = await app.inject({
        method: 'POST',
        url: `/workers/${ti.workerId}/mark-absent`,
        headers: { authorization: req.headers.authorization! },
        payload: {
          date: ti.date ?? new Date().toISOString().slice(0, 10),
          ...(reasonStr ? { reason: reasonStr } : {}),
        },
      });
      await forwardWithCommit(inner);
      return;
    }

    if (parsed.data.toolName === 'propose_leave') {
      const ti = parsed.data.toolInput as {
        workerId: string;
        fromDate: string;
        toDate: string;
        reason?: string;
        reasonDetail?: string;
      };
      // POST /leave-requests accepts { workerId, fromDate, toDate, reason } per
      // packages/shared-schema/src/zod/supervisor.ts (CreateLeaveRequestInput).
      // Merge reason+reasonDetail into a single freeform string.
      const reasonStr = [ti.reason, ti.reasonDetail].filter(Boolean).join(': ') || 'other';
      const inner = await app.inject({
        method: 'POST',
        url: '/leave-requests',
        headers: { authorization: req.headers.authorization! },
        payload: {
          workerId: ti.workerId,
          fromDate: ti.fromDate,
          toDate: ti.toDate,
          reason: reasonStr,
        },
      });
      await forwardWithCommit(inner);
      return;
    }

    if (parsed.data.toolName === 'propose_swap') {
      const inner = await app.inject({
        method: 'POST',
        url: '/swap-requests',
        headers: { authorization: req.headers.authorization! },
        payload: parsed.data.toolInput,
      });
      await forwardWithCommit(inner);
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
      // F-002.9 — reorder: validate worker FIRST (before applyProposedDecision),
      // then lifecycle commit, then worker.update. Returning sentinels from the
      // tx callback COMMITS the tx (lesson L1 in production-grade-rulebook
      // memory), so validation failures must happen BEFORE any state-changing
      // write. After this reorder, the early-return paths still commit but with
      // no state change since no write has happened yet.
      //
      // F-002 §3b: lifecycle transition + worker.update share the same tx —
      // fully atomic. If either throws, both roll back.
      // F-002.5: decisionId is required (Zod-enforced).
      const out = await withTenantContext(prisma, auth.companyId, async (tx) => {
        // Step 1: validate worker FIRST (no writes happen on validation failure).
        const w = await tx.worker.findFirst({
          where: { id: wid, companyId: auth.companyId },
        });
        if (!w) return { kind: 'NOT_FOUND' as const };
        if (w.state === 'TERMINATED' || w.state === 'TERMINATION_PENDING') {
          return { kind: 'ALREADY' as const };
        }

        // Step 2: lifecycle commit (applyProposedDecision uses race-safe
        // conditional UPDATE + emits DWI_APPLIED). Throws on lifecycle guard
        // failure; tx rolls back if so.
        try {
          await applyProposedDecision(tx, {
            companyId: auth.companyId,
            decisionId: parsed.data.decisionId,
            actorUserId: auth.userId,
          });
        } catch (err) {
          if (err instanceof LifecycleError) {
            return { kind: 'LIFECYCLE_ERROR' as const, code: err.code };
          }
          throw err;
        }

        // Step 3: worker.update + WORKER_TERMINATION_REQUESTED audit.
        // Per Worker state machine (packages/state-machines/src/worker.ts):
        // ACTIVE on TERMINATE → TERMINATION_PENDING. Wave 2b ChangeRequest
        // workflow handles the TERMINATION_PENDING → TERMINATED finalization.
        // If this throws, the tx (including the lifecycle commit) rolls back.
        const updated = await tx.worker.update({
          where: { id: wid },
          data: { state: 'TERMINATION_PENDING' },
        });
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
        return { kind: 'OK' as const, worker: updated };
      });
      if (out.kind === 'LIFECYCLE_ERROR') {
        const httpStatus =
          out.code === 'NOT_FOUND' || out.code === 'CROSS_TENANT'
            ? 404
            : out.code === 'NOT_RESPONSIBLE'
              ? 403
              : 409;
        reply.code(httpStatus).send({ error: out.code });
        return;
      }
      if (out.kind === 'NOT_FOUND') {
        reply.code(404).send({ error: 'WORKER_NOT_FOUND' });
        return;
      }
      if (out.kind === 'ALREADY') {
        reply.code(409).send({ error: 'ALREADY_TERMINATING' });
        return;
      }
      reply.code(200).send({ workerId: out.worker.id, state: out.worker.state });
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
      // Panel-flagged Tier-1 fix; `persistChatTurn` (line ~146) was wrapped
      // in the same commit so every chat-route transaction is now scoped.
      //
      // F-002.4 — fully atomic apply for living-doc: the DWI lifecycle
      // transition and the LivingDoc write share one transaction. Same
      // atomicity guarantee as propose_termination. If applyProposedDecision
      // throws (lifecycle guard failure) or the LivingDoc write throws, the
      // whole tx rolls back; neither effect happens.
      const out = await withTenantContext(prisma, auth.companyId, async (tx) => {
        try {
          await applyProposedDecision(tx, {
            companyId: auth.companyId,
            decisionId: body.decisionId,
            actorUserId: auth.userId,
          });
        } catch (err) {
          if (err instanceof LifecycleError) {
            return { kind: 'LIFECYCLE_ERROR' as const, code: err.code };
          }
          throw err;
        }
        // Upsert ensures the row exists (matches getLivingDoc behavior;
        // first-time supervisors won't have a row yet).
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
        const existing = (doc[column] as unknown as Array<Record<string, unknown>>) ?? [];
        const updated = await tx.livingDoc.update({
          where: { id: doc.id },
          data: {
            [column]: [...existing, newRule] as Prisma.InputJsonValue,
            version: { increment: 1 },
          },
          select: { version: true },
        });
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
        return { kind: 'OK' as const, ruleId, version: updated.version };
      });
      if (out.kind === 'LIFECYCLE_ERROR') {
        reply.code(httpStatusForLifecycleCode(out.code)).send({ error: out.code });
        return;
      }
      reply.code(200).send({ ruleId: out.ruleId, version: out.version });
      return;
    }

    reply
      .code(501)
      .send({ error: 'NOT_IMPLEMENTED', message: `Unknown toolName: ${parsed.data.toolName}` });
  });
}
