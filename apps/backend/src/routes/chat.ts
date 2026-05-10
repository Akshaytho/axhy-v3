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
  sonnetToolLoop,
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

const SYSTEM_PROMPT = `You are Axhy's AI assistant for cleaning-company supervisors in India.
When the supervisor asks to add a worker to a site, FIRST call find_workers and find_sites to
resolve names → IDs, THEN call propose_create_assignment with the resolved IDs.
When the supervisor says a worker is absent / did not show up / called sick / "X is off today",
call find_workers first, then propose_mark_absent with the resolved worker UUID.
When the supervisor says a worker needs leave / is sick for X days / "Pradeep off Mon-Wed" / "needs leave from <date> to <date>",
call find_workers first, then propose_leave with the resolved worker UUID and the date range.
When the supervisor wants to swap two workers between sites/shifts ("Swap Ravi and Lakshmi at Hospital A tomorrow"),
FIRST call find_workers for each name (separate calls) AND find_sites for the site, THEN call propose_swap with
two DIFFERENT worker UUIDs (fromWorkerId !== toWorkerId), the site UUID, and an ISO datetime for effectiveAt
(must be in the future).
When the supervisor wants to fire / terminate / let-go a worker, FIRST call find_workers,
THEN call propose_termination with the worker UUID, an effectiveDate (YYYY-MM-DD), and a
reason from this enum: performance, attendance, misconduct, mutual, redundancy, other.
Speak in the same language(s) the supervisor used (English, Hindi, Telugu).
Keep responses concise — supervisors are busy.`;

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

    if (!tryAcquireChatSlot()) {
      reply.code(503).header('Retry-After', '5').send({ error: 'CHAT_BUSY' });
      return;
    }

    try {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        reply.code(500).send({ error: 'AI_NOT_CONFIGURED' });
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

      const loopResult = await sonnetToolLoop({
        apiKey,
        systemPrompt: SYSTEM_PROMPT,
        userMessage: parsed.data.text,
        tools: tools as never,
        maxIterations: 6,
        timeoutMs: 50000,
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

      const chatMessageId = await withTenantContext(prisma, auth.companyId, async (tx) => {
        const thread = await tx.chatThread.upsert({
          where: {
            companyId_supervisorId: { companyId: auth.companyId, supervisorId: auth.userId },
          },
          create: {
            companyId: auth.companyId,
            supervisorId: auth.userId,
            lastMessageAt: new Date(),
          },
          update: { lastMessageAt: new Date() },
        });

        await tx.chatMessage.create({
          data: {
            companyId: auth.companyId,
            threadId: thread.id,
            role: 'user',
            transcript: parsed.data.text,
            voiceConfidence: parsed.data.voiceConfidence ?? null,
            idempotencyKey,
          },
        });

        const assistantMsg = await tx.chatMessage.create({
          data: {
            companyId: auth.companyId,
            threadId: thread.id,
            role: 'assistant',
            aiResponseText: loopResult.finalText,
            toolCalls: loopResult.toolCalls as Prisma.InputJsonValue,
            decisionCard:
              loopResult.decisionCards.length === 0
                ? Prisma.JsonNull
                : ((loopResult.decisionCards.length === 1
                    ? loopResult.decisionCards[0]
                    : loopResult.decisionCards) as Prisma.InputJsonValue),
            modelUsed: 'claude-sonnet-4-6',
            idempotencyKey,
          },
        });

        await recordAuditEvent(tx, {
          companyId: auth.companyId,
          kind: 'CHAT_MESSAGE_CREATED',
          actorId: auth.userId,
          targetId: assistantMsg.id,
          payload: {
            textLen: parsed.data.text.length,
            decisionCardCount: loopResult.decisionCards.length,
          },
        });

        return assistantMsg.id;
      });

      const response = {
        chatMessageId,
        assistantText: loopResult.finalText,
        ...(loopResult.decisionCards.length > 1
          ? {
              decisionCard: null,
              decisionCards: loopResult.decisionCards,
            }
          : {
              decisionCard: loopResult.decisionCards[0] ?? null,
              decisionCards: null,
            }),
      };

      await recordIdempotency(prisma, auth.companyId, idempotencyKey, response, chatMessageId);

      reply.code(200).send(response);
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
