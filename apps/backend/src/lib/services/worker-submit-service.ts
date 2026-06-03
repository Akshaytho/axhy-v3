/**
 * Worker Submit service — writes VisitPhoto rows + transitions visit state.
 *
 * Called by POST /worker/visits/:visitId/submit after the worker confirms
 * all photos are uploaded to R2. The service:
 *   1. Verifies the visit exists and belongs to the requesting worker.
 *   2. Guards the PHOTOS_PENDING → AWAITING_VERIFICATION transition.
 *   3. Reconstructs R2 object keys server-side (buildObjectKey) so the
 *      client never supplies arbitrary key paths (2b-2 deferred #3).
 *   4. Bulk-inserts VisitPhoto rows with companyId for tenant isolation.
 *   5. Atomically updates Visit.state + photosBefore/photosAfter counts.
 *
 * @derives(master-plan §G)
 * @derives(WORKER_MVP_SLICE_2B_3_PLAN.md §T3)
 */

import type { Prisma } from '@prisma/client';
import type { WorkerSubmitPhoto } from '@axhy/shared-schema';

import { buildObjectKey } from '../r2-presign.js';
import { enqueueOutbox } from '../outbox.js';

type SubmitArgs = {
  workerId: string;
  visitId: string;
  companyId: string;
  photos: ReadonlyArray<WorkerSubmitPhoto>;
};

export type SubmitVisitResult =
  | {
      kind: 'OK';
      visitId: string;
      visitState: 'AWAITING_VERIFICATION';
      photosBefore: number;
      photosAfter: number;
    }
  | { kind: 'NOT_FOUND' }
  | { kind: 'WRONG_WORKER' }
  | { kind: 'WRONG_STATE'; currentState: string };

/**
 * @derives(master-plan §G)
 */
export async function submitVisit(
  tx: Prisma.TransactionClient,
  args: SubmitArgs,
): Promise<SubmitVisitResult> {
  const { workerId, visitId, companyId, photos } = args;

  const visit = await tx.visit.findUnique({
    where: { id: visitId },
    select: { id: true, workerId: true, state: true, companyId: true },
  });

  if (!visit || visit.companyId !== companyId) return { kind: 'NOT_FOUND' };
  if (visit.workerId !== workerId) return { kind: 'WRONG_WORKER' };
  if (visit.state !== 'PHOTOS_PENDING') return { kind: 'WRONG_STATE', currentState: visit.state };

  const photoRows = photos.map((p) => ({
    companyId,
    visitId,
    // Zod schema uses lowercase 'before'/'after'; Prisma column is 'BEFORE'/'AFTER'
    side: p.phase === 'before' ? 'BEFORE' : 'AFTER',
    r2Key: buildObjectKey(workerId, visitId, p),
    aiVerifyStatus: 'PENDING',
  }));

  await tx.visitPhoto.createMany({ data: photoRows });

  const photosBefore = photos.filter((p) => p.phase === 'before').length;
  const photosAfter = photos.filter((p) => p.phase === 'after').length;

  await tx.visit.update({
    where: { id: visitId },
    data: {
      state: 'AWAITING_VERIFICATION',
      photosBefore,
      photosAfter,
    },
  });

  // Emit ai.verify in the same transaction as the state transition so either
  // both commit or neither does. The dispatcher (ai.ts handler) picks this up
  // on its next tick (~2s) and runs the OpenAI multimodal verification.
  await enqueueOutbox(tx, {
    companyId,
    topic: 'ai.verify',
    payload: { visitId, companyId },
  });

  return {
    kind: 'OK',
    visitId,
    visitState: 'AWAITING_VERIFICATION',
    photosBefore,
    photosAfter,
  };
}
