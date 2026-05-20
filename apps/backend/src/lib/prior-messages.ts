/**
 * Shared module for the blind-window prior-message loader.
 *
 * Extracted from routes/chat.ts so that:
 *   1. lib/semantic-context.ts can import it as the fallback path.
 *   2. chat.ts can import it instead of defining it locally.
 *
 * The function body and JSDoc are copied verbatim from chat.ts. Opus will
 * remove the local definition from chat.ts and add the import in a follow-up
 * pass (per task spec §T1.3 — this subagent does NOT modify chat.ts).
 *
 * @derives(docs/locked/vector-rag-context-assembly.md §10.3)
 * @derives(ADR-0004) — prisma singleton pattern
 */

import type { Prisma } from '@prisma/client';
import { CHAT_HISTORY_TURN_WINDOW } from '@axhy/business-rules';

/**
 * Load the active ChatThread's last N turns. Per the Wave A 3-window
 * migration, ChatThread is no longer @@unique([companyId, supervisorId])
 * — supervisors may have up to 3 ACTIVE threads. This helper picks the
 * most-recent ACTIVE thread (lastMessageAt DESC, then createdAt DESC) for
 * chat history. The chat-threads route (future) lets the supervisor
 * choose which thread to send into; absent that param, "most recent"
 * is the right default.
 *
 * Wave A refactor (close GAP 1 hole): accepts a tx so the read happens
 * inside withTenantContext, enforcing Company.status='ACTIVE' at the
 * Postgres GUC + RLS layer.
 *
 * Loads the active ChatThread's last N turns, oldest → newest, formatted
 * for openaiToolLoop's `priorMessages`. Returns [] when there is no prior
 * thread (first message ever from this supervisor).
 *
 * Each row is mapped: ChatMessage.role → 'user' | 'assistant' (database
 * already stores role as string); content = transcript (user) OR
 * aiResponseText (assistant). Empty content is filtered out.
 */
export async function loadPriorMessages(
  tx: Prisma.TransactionClient,
  companyId: string,
  supervisorId: string,
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const thread = await tx.chatThread.findFirst({
    where: { companyId, supervisorId, archivedAt: null },
    orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
  });
  if (!thread) return [];
  const rows = await tx.chatMessage.findMany({
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
