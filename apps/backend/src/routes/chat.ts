/**
 * Chat routes — POST /chat/messages and POST /chat/apply.
 * Wave 2a vertical slice: ONE tool wired (propose_create_assignment) + read tools.
 *
 * @derives(master-plan §G)
 */

import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { CreateChatMessageInput, ApplyDecisionCardInput } from '@axhy/shared-schema';
import {
  openaiToolLoop,
  AICostBudgetError,
  findWorkersTool,
  findSitesTool,
  proposeCreateAssignmentTool,
  proposeMarkAbsentTool,
  proposeLeaveTool,
  proposeSwapTool,
  proposeTerminationTool,
} from '@axhy/ai-tools';
import { detectConflicts } from '@axhy/state-machines';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
import { recordAuditEvent } from '../lib/audit-event.js';
import { checkIdempotency, recordIdempotency } from '../lib/chat-idempotency.js';
import { tryAcquireChatSlot, releaseChatSlot } from '../lib/chat-concurrency.js';

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

/** Number of prior chat turns to load for continuity. */
const HISTORY_TURN_WINDOW = 10;

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
    take: HISTORY_TURN_WINDOW,
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
}): Promise<{
  chatMessageId: string;
  assistantText: string;
  decisionCard: Record<string, unknown> | null;
  decisionCards: Array<Record<string, unknown>> | null;
}> {
  const result = await prisma.$transaction(async (tx) => {
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
      },
    });

    await recordAuditEvent(tx, {
      companyId: input.companyId,
      kind: 'CHAT_MESSAGE_CREATED',
      actorId: input.supervisorId,
      targetId: assistantMsg.id,
      payload: {
        textLen: input.userText.length,
        decisionCardCount: input.decisionCards.length,
        modelUsed: input.modelUsed,
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
        proposeSwapTool,
        proposeTerminationTool,
      ];

      // Load last N turns from this supervisor's chat thread so the model
      // sees prior context (otherwise every message is zero-shot).
      const priorMessages = await loadPriorMessages(auth.companyId, auth.userId);

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
        modelUsed: 'gpt-5.4-nano',
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
    if (parsed.data.toolName === 'propose_create_assignment') {
      const inner = await app.inject({
        method: 'POST',
        url: '/assignments',
        headers: { authorization: req.headers.authorization! },
        payload: parsed.data.toolInput,
      });
      reply.code(inner.statusCode).send(inner.json());
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
      reply.code(inner.statusCode).send(inner.json());
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
      reply.code(inner.statusCode).send(inner.json());
      return;
    }

    if (parsed.data.toolName === 'propose_swap') {
      const inner = await app.inject({
        method: 'POST',
        url: '/swap-requests',
        headers: { authorization: req.headers.authorization! },
        payload: parsed.data.toolInput,
      });
      reply.code(inner.statusCode).send(inner.json());
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
      const out = await withTenantContext(prisma, auth.companyId, async (tx) => {
        const w = await tx.worker.findFirst({
          where: { id: wid, companyId: auth.companyId },
        });
        if (!w) return { kind: 'NOT_FOUND' as const };
        if (w.state === 'TERMINATED' || w.state === 'TERMINATION_PENDING') {
          return { kind: 'ALREADY' as const };
        }
        // Per Worker state machine (packages/state-machines/src/worker.ts):
        // ACTIVE on TERMINATE → TERMINATION_PENDING. Wave 2b ChangeRequest
        // workflow handles the TERMINATION_PENDING → TERMINATED finalization.
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

    reply
      .code(501)
      .send({ error: 'NOT_IMPLEMENTED', message: `Unknown toolName: ${parsed.data.toolName}` });
  });
}
