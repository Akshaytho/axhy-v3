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
} from '@axhy/ai-tools';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
import { recordAuditEvent } from '../lib/audit-event.js';
import { checkIdempotency, recordIdempotency } from '../lib/chat-idempotency.js';
import { tryAcquireChatSlot, releaseChatSlot } from '../lib/chat-concurrency.js';

const SYSTEM_PROMPT = `You are Axhy's AI assistant for cleaning-company supervisors in India.
When the supervisor asks to add a worker to a site, FIRST call find_workers and find_sites to
resolve names → IDs, THEN call propose_create_assignment with the resolved IDs.
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

      const tools = [findWorkersTool, findSitesTool, proposeCreateAssignmentTool];

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
            return {
              output: { proposed: true, fields: input },
              decisionCardData: {
                title: 'Confirm assignment',
                description: 'Create assignment with these fields?',
                fields: input,
                severity: 'CONFIRM',
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
              loopResult.decisionCards[0] != null
                ? (loopResult.decisionCards[0] as Prisma.InputJsonValue)
                : Prisma.JsonNull,
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
        decisionCard: loopResult.decisionCards[0] ?? null,
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
    if (parsed.data.toolName !== 'propose_create_assignment') {
      reply
        .code(501)
        .send({ error: 'NOT_IMPLEMENTED', message: 'Only propose_create_assignment in Wave 2a' });
      return;
    }
    const inner = await app.inject({
      method: 'POST',
      url: '/assignments',
      headers: { authorization: req.headers.authorization! },
      payload: parsed.data.toolInput,
    });
    reply.code(inner.statusCode).send(inner.json());
  });
}
