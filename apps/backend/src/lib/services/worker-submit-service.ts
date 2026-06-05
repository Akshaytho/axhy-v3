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
import { recordAuditEvent } from '../audit-event.js';

type SubmitArgs = {
  workerId: string;
  visitId: string;
  companyId: string;
  photos: ReadonlyArray<WorkerSubmitPhoto>;
  /** JWT user id of the submitting worker (AuditEvent actor). */
  actorUserId: string;
};

/**
 * Minimum photos required per phase. Mirrors the client floor
 * (lib/capture-flow.ts MIN_PHOTOS_PER_PHASE = 3) and the anti-gaming contract in
 * docs/capture-submission_flow/07-final-review.md ("Submit is disabled if
 * fewer than 3 before-photos / fewer than 3 after-photos"). Enforced
 * server-side so a bypassed/buggy client can never land a thin evidence set.
 */
const MIN_PHOTOS_PER_PHASE = 3;

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
  | { kind: 'WRONG_STATE'; currentState: string }
  | { kind: 'INSUFFICIENT_PHOTOS'; photosBefore: number; photosAfter: number };

/**
 * @derives(master-plan §G)
 */
export async function submitVisit(
  tx: Prisma.TransactionClient,
  args: SubmitArgs,
): Promise<SubmitVisitResult> {
  const { workerId, visitId, companyId, photos, actorUserId } = args;

  const visit = await tx.visit.findUnique({
    where: { id: visitId },
    select: { id: true, workerId: true, state: true, companyId: true },
  });

  if (!visit || visit.companyId !== companyId) return { kind: 'NOT_FOUND' };
  if (visit.workerId !== workerId) return { kind: 'WRONG_WORKER' };
  if (visit.state !== 'PHOTOS_PENDING') return { kind: 'WRONG_STATE', currentState: visit.state };

  // Minimum-photo evidence floor (BUG-01 fix). Reject BEFORE any VisitPhoto
  // write or state transition so a thin evidence set never gets persisted or
  // sent to AI verification. This is the authoritative server-side guard; the
  // client review/submit screens gate the same rule for UX.
  const photosBefore = photos.filter((p) => p.phase === 'before').length;
  const photosAfter = photos.filter((p) => p.phase === 'after').length;
  if (photosBefore < MIN_PHOTOS_PER_PHASE || photosAfter < MIN_PHOTOS_PER_PHASE) {
    return { kind: 'INSUFFICIENT_PHOTOS', photosBefore, photosAfter };
  }

  // RCA-C race guard: claim the PHOTOS_PENDING → AWAITING_VERIFICATION transition
  // with a conditional updateMany BEFORE inserting photos. Two concurrent submits
  // serialize on the row lock; the loser sees state != PHOTOS_PENDING (count 0) and
  // bails out, so it never writes duplicate VisitPhoto rows / audit / ai.verify.
  // Same first-writer-wins pattern as visit-flagged-review-service.ts:111.
  const claim = await tx.visit.updateMany({
    where: { id: visitId, companyId, state: 'PHOTOS_PENDING' },
    data: {
      state: 'AWAITING_VERIFICATION',
      photosBefore,
      photosAfter,
    },
  });
  if (claim.count === 0) {
    // Lost the race (or the visit moved out of PHOTOS_PENDING). Re-read for a
    // precise error envelope; do NOT insert photos.
    const fresh = await tx.visit.findUnique({
      where: { id: visitId },
      select: { state: true },
    });
    return { kind: 'WRONG_STATE', currentState: fresh?.state ?? 'UNKNOWN' };
  }

  const photoRows = photos.map((p) => ({
    companyId,
    visitId,
    // Zod schema uses lowercase 'before'/'after'; Prisma column is 'BEFORE'/'AFTER'
    side: p.phase === 'before' ? 'BEFORE' : 'AFTER',
    r2Key: buildObjectKey(workerId, visitId, p),
    aiVerifyStatus: 'PENDING',
  }));

  await tx.visitPhoto.createMany({ data: photoRows });

  // BUG-13 / D9: append-only audit of the worker's submit transition, in the
  // same transaction as the state change (commits together or not at all).
  await recordAuditEvent(tx, {
    companyId,
    kind: 'VISIT_SUBMITTED',
    actorId: actorUserId,
    targetId: visitId,
    payload: { photosBefore, photosAfter },
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
