/**
 * GET /chat/history — restore the supervisor's most-recent ACTIVE chat thread.
 *
 * Without this the mobile chat screen starts with an empty message list and the
 * AI conversation looks wiped on every open (violates the locked decision that
 * chat history persists across sessions). Returns the active thread's messages
 * oldest→newest, mapped to the client's renderable shape so chat.tsx can seed
 * `messages` on mount.
 *
 * Caller: SUPERVISOR — their OWN thread only (scoped by auth.userId inside
 * withTenantContext). Thread selection + window mirror prior-messages.ts (the
 * AI-context loader): most-recent ACTIVE thread, last CHAT_HISTORY_TURN_WINDOW
 * turns (user + assistant are separate rows, so the row cap is doubled).
 *
 * @derives(docs/locked/vector-rag-context-assembly.md §10.3)
 * @derives(ADR-0004) — prisma singleton
 */

import type { FastifyInstance } from 'fastify';
import { CHAT_HISTORY_TURN_WINDOW } from '@axhy/business-rules';

import { prisma } from '../lib/prisma.js';
import { requireAuth, withTenantContext } from '../middleware/tenant-context.js';
import { requireRole } from '../middleware/role-gates.js';

export async function registerChatHistoryRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/chat/history',
    { preHandler: [requireAuth, requireRole('SUPERVISOR')] },
    async (req, reply) => {
      const auth = req.auth;
      if (!auth) {
        reply.code(401).send({ error: 'AUTH_REQUIRED' });
        return;
      }

      const messages = await withTenantContext(prisma, auth.companyId, async (tx) => {
        const thread = await tx.chatThread.findFirst({
          where: { companyId: auth.companyId, supervisorId: auth.userId, archivedAt: null },
          orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
          select: { id: true },
        });
        if (!thread) return [];

        const rows = await tx.chatMessage.findMany({
          where: { companyId: auth.companyId, threadId: thread.id },
          orderBy: { createdAt: 'desc' },
          take: CHAT_HISTORY_TURN_WINDOW * 2,
          select: {
            id: true,
            role: true,
            transcript: true,
            aiResponseText: true,
            decisionCard: true,
          },
        });

        return rows
          .reverse() // oldest → newest for rendering
          .map((m) => {
            const role: 'user' | 'assistant' = m.role === 'assistant' ? 'assistant' : 'user';
            const text = role === 'assistant' ? (m.aiResponseText ?? '') : (m.transcript ?? '');
            return {
              id: m.id,
              role,
              text,
              chatMessageId: m.id,
              decisionCard: m.decisionCard ?? null,
            };
          })
          .filter((m) => m.text.length > 0 || m.decisionCard !== null);
      });

      reply.send({ messages });
    },
  );
}
