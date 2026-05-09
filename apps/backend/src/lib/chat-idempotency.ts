/**
 * Chat request idempotency dedup helpers.
 * ChatRequestLog table stores (companyId, idempotencyKey) → cached responseJson with 24h TTL.
 *
 * @derives(master-plan §G)
 */

import type { PrismaClient } from '@prisma/client';

export async function checkIdempotency(
  prisma: PrismaClient,
  companyId: string,
  idempotencyKey: string,
): Promise<{ cached: true; responseJson: unknown } | { cached: false }> {
  const row = await prisma.chatRequestLog.findUnique({
    where: { companyId_idempotencyKey: { companyId, idempotencyKey } },
  });
  if (!row) return { cached: false };
  if (row.expiresAt < new Date()) {
    await prisma.chatRequestLog.delete({
      where: { companyId_idempotencyKey: { companyId, idempotencyKey } },
    });
    return { cached: false };
  }
  return { cached: true, responseJson: row.responseJson };
}

export async function recordIdempotency(
  prisma: PrismaClient,
  companyId: string,
  idempotencyKey: string,
  responseJson: object,
  chatMessageId: string | null,
): Promise<void> {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await prisma.chatRequestLog.create({
    data: { companyId, idempotencyKey, responseJson, chatMessageId, expiresAt },
  });
}
