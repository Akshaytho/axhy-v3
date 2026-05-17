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
  MarkAbsentInput,
  CreateLeaveRequestInput,
  CreateSwapRequestInput,
} from '@axhy/shared-schema';
import { z } from 'zod';
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
  proposeLogComplaintTool,
  proposeClarifyTool,
} from '@axhy/ai-tools';
import { ProposeLogComplaintInput, ProposeClarifyInput } from '@axhy/shared-schema';
import { detectConflicts } from '@axhy/state-machines';
import { CreateAssignmentInput as CreateAssignmentInputSchema } from '@axhy/shared-schema';

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
 * Map a service-domain failure code to HTTP status. Most are 404 (resource
 * not found in the caller's tenant); a few are 400 (input validation failure
 * inside the service).
 * @derives(F-002.15)
 */
function httpStatusForServiceDomainCode(code: string): number {
  if (code === 'WORKER_NOT_FOUND' || code === 'SITE_NOT_FOUND') return 404;
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
  translate; HR portal users may need the original phrasing to follow up.`;

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
        // Wave 3 — photo attachments persisted on the user-row's
        // `toolCalls` JSON under `attachments`. See `userAttachments`
        // docstring above for rationale.
        toolCalls:
          input.userAttachments.length > 0
            ? ({ attachments: input.userAttachments } as Prisma.InputJsonValue)
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
        userAttachments: parsed.data.attachments ?? [],
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
        proposeLogComplaintTool,
        proposeClarifyTool,
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

      // Wave 3 — if the supervisor attached photos, append a brief note to
      // the user message so the AI knows they exist. The Whisper / gpt-5.4-nano
      // surface is text-only; we do not stream image bytes (Vision pipeline
      // is out of scope). The note is enough to bias the intent classifier
      // toward `log_complaint` when a photo is attached.
      const attachmentCount = parsed.data.attachments?.length ?? 0;
      const userMessageWithAttachmentHint =
        attachmentCount > 0
          ? `${parsed.data.text}\n\n[Supervisor attached ${attachmentCount} photo${attachmentCount === 1 ? '' : 's'}. Treat as evidence supporting a possible complaint.]`
          : parsed.data.text;

      const loopResult = await openaiToolLoop({
        apiKey,
        systemPrompt: SYSTEM_PROMPT,
        userMessage: userMessageWithAttachmentHint,
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
        userAttachments: parsed.data.attachments ?? [],
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
        date: ti.date ?? new Date().toISOString().slice(0, 10),
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
        reply.code(400).send({ error: 'BAD_INPUT', message: 'effectiveAt must be in the future' });
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
