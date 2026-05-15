/**
 * Swap-request service — tx-callable domain function for SwapRequest creation.
 *
 * Extracted from `apps/backend/src/routes/swap-requests.ts` for F-002.b
 * (round-2 R2b-iii). Largest of the 4 ex-inject services: 3 lookups + 1
 * create + 1 audit + 2 outbox (one per affected worker).
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G)
 * Linked specs:
 *   - F-002.b — round-2 R2b-iii service extraction
 *   - production-grade-rulebook P3 + P8 — atomic workflow
 *   - data-flow §5 — swap worker OPERATIONAL tier
 */

import type { Prisma, SwapRequest } from '@prisma/client';

import { recordAuditEvent } from '../audit-event.js';
import { enqueueOutbox } from '../outbox.js';

/** @derives(F-002.b) */
export type CreateSwapRequestServiceInput = {
  fromWorkerId: string;
  toWorkerId: string;
  siteId: string;
  /** ISO datetime string; caller validates that this is in the future. */
  effectiveAt: string;
  reason: string | null;
};

/** @derives(F-002.b) */
export type CreateSwapRequestServiceAuth = {
  companyId: string;
  userId: string;
};

/** @derives(F-002.b) */
export type CreateSwapRequestServiceResult =
  | { kind: 'OK'; swap: SwapRequest }
  | { kind: 'WORKER_NOT_FOUND'; which: 'fromWorker' | 'toWorker' }
  | { kind: 'SITE_NOT_FOUND' };

/**
 * Creates a SwapRequest row in SENT state inside the caller's tx. Verifies
 * both workers + the site exist within the caller's tenant. Emits
 * SWAP_REQUEST_SENT audit + two `gupshup.send` outbox messages (one per
 * affected worker).
 *
 * Caller is responsible for: same-worker check (Zod parser does this in the
 * route) + future-effectiveAt validation (route does this before calling).
 *
 * @derives(F-002.b — service extraction)
 */
export async function createSwapRequestService(
  tx: Prisma.TransactionClient,
  input: CreateSwapRequestServiceInput,
  auth: CreateSwapRequestServiceAuth,
): Promise<CreateSwapRequestServiceResult> {
  const fromWorker = await tx.worker.findFirst({
    where: { id: input.fromWorkerId, companyId: auth.companyId },
  });
  if (!fromWorker) return { kind: 'WORKER_NOT_FOUND', which: 'fromWorker' };

  const toWorker = await tx.worker.findFirst({
    where: { id: input.toWorkerId, companyId: auth.companyId },
  });
  if (!toWorker) return { kind: 'WORKER_NOT_FOUND', which: 'toWorker' };

  const site = await tx.site.findFirst({
    where: { id: input.siteId, companyId: auth.companyId },
  });
  if (!site) return { kind: 'SITE_NOT_FOUND' };

  const effectiveDate = new Date(input.effectiveAt);

  const swap = await tx.swapRequest.create({
    data: {
      companyId: auth.companyId,
      supervisorId: auth.userId,
      fromWorkerId: input.fromWorkerId,
      toWorkerId: input.toWorkerId,
      siteId: input.siteId,
      effectiveAt: effectiveDate,
      reason: input.reason,
      state: 'SENT',
    },
  });

  await recordAuditEvent(tx, {
    companyId: auth.companyId,
    kind: 'SWAP_REQUEST_SENT',
    actorId: auth.userId,
    targetId: swap.id,
    payload: {
      fromWorkerId: input.fromWorkerId,
      fromWorkerName: fromWorker.name,
      toWorkerId: input.toWorkerId,
      toWorkerName: toWorker.name,
      siteId: input.siteId,
      siteName: site.name,
      effectiveAt: input.effectiveAt,
      reason: input.reason,
    },
  });

  // Notify both workers via WhatsApp (Phase C — stubbed in dispatcher today).
  await enqueueOutbox(tx, {
    companyId: auth.companyId,
    topic: 'gupshup.send',
    payload: {
      kind: 'swap_request_sent',
      recipient: {
        workerId: input.fromWorkerId,
        phone: fromWorker.phone,
        name: fromWorker.name,
      },
      site: { id: input.siteId, name: site.name },
      counterparty: { workerId: input.toWorkerId, name: toWorker.name },
      swapRequestId: swap.id,
      effectiveAt: input.effectiveAt,
    },
  });
  await enqueueOutbox(tx, {
    companyId: auth.companyId,
    topic: 'gupshup.send',
    payload: {
      kind: 'swap_request_sent',
      recipient: { workerId: input.toWorkerId, phone: toWorker.phone, name: toWorker.name },
      site: { id: input.siteId, name: site.name },
      counterparty: { workerId: input.fromWorkerId, name: fromWorker.name },
      swapRequestId: swap.id,
      effectiveAt: input.effectiveAt,
    },
  });

  return { kind: 'OK', swap };
}
