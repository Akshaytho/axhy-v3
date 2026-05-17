/**
 * Complaint domain service — used by both the chat tool-loop (`/chat/messages`
 * → `propose_log_complaint`) and the supervisor reply endpoint
 * (`POST /complaints/:id/messages`). One service so the on-disk shape is
 * identical regardless of entry point, and cross-tenant isolation is enforced
 * in exactly one place.
 *
 * Functions:
 *   - `createComplaintWithInitialMessage`
 *       Creates the Complaint row + the supervisor's initial ComplaintMessage
 *       + records a SITE_COMPLAINT_LOGGED AuditEvent + enqueues
 *       `hr.site_complaint` outbox topic. Runs inside the provided tx; caller
 *       supplies the `withTenantContext` wrapper.
 *
 *   - `appendComplaintMessage`
 *       Appends a reply. If author is HR or ADMIN, atomically increments
 *       `Complaint.unreadHrRepliesCount`. Always bumps `lastReplyAt`. Returns
 *       the created ComplaintMessage row.
 *
 *   - `markComplaintMessageRead`
 *       Idempotent read receipt — composite PK on (messageId, actorUserId)
 *       means concurrent marks both succeed. When the actor is SUPERVISOR
 *       reading an HR-authored message, decrements
 *       `Complaint.unreadHrRepliesCount` (clamped at 0) in the same tx as a
 *       conditional UPDATE so the counter cannot drift below 0 under races.
 *
 *   - `resolveComplaint`
 *       Supervisor closes a complaint they own. Sets `state='RESOLVED'` and
 *       `resolvedAt`/`resolvedBy`. Conditional UPDATE on `state IN ('OPEN',
 *       'IN_HR')` returns 0 rows when the complaint was already terminal,
 *       which the caller surfaces as 409.
 *
 * @derives(supervisor-drawer-and-decisions-redesign.md §C — Chat-to-Complaint)
 * @derives(panel-2026-05-18) — Wave 3 backend
 * @derives(master-plan §G) — supervisor surface
 */

import type { Prisma } from '@prisma/client';
import {
  ComplaintKindSchema,
  ComplaintSeverityWaveThreeSchema,
  ComplaintAuthorRoleSchema,
  ComplaintAttachmentSchema,
  type ComplaintAttachment,
  type ComplaintAuthorRole,
  type ComplaintKind,
  type ComplaintSeverityWaveThree,
} from '@axhy/shared-schema';

import { recordAuditEvent } from '../audit-event.js';
import { enqueueOutbox } from '../outbox.js';

/** @derives(master-plan §G) — supervisor surface */
export type CreateComplaintInput = {
  companyId: string;
  siteId: string;
  supervisorUserId: string;
  createdByUserId: string;
  text: string;
  severity: ComplaintSeverityWaveThree;
  kind: ComplaintKind;
  observedAt: Date | null;
  origin: 'CHAT' | 'BUTTON';
};

/** @derives(master-plan §G) — supervisor surface */
export type CreateComplaintResult =
  | {
      kind: 'OK';
      complaintId: string;
      initialMessageId: string;
      siteName: string;
    }
  | { kind: 'SITE_NOT_FOUND' };

/**
 * Create a Complaint + initial supervisor ComplaintMessage + audit + outbox
 * inside one tx.
 * @derives(supervisor-drawer-and-decisions-redesign.md §C.3)
 * @derives(master-plan §G) — supervisor surface
 */
export async function createComplaintWithInitialMessage(
  tx: Prisma.TransactionClient,
  input: CreateComplaintInput,
): Promise<CreateComplaintResult> {
  // Validate enums at the service boundary too — defense in depth against
  // a caller that bypassed the route-layer Zod parse.
  ComplaintKindSchema.parse(input.kind);
  ComplaintSeverityWaveThreeSchema.parse(input.severity);

  const site = await tx.site.findFirst({
    where: { id: input.siteId, companyId: input.companyId },
    select: { id: true, name: true },
  });
  if (!site) return { kind: 'SITE_NOT_FOUND' };

  const complaint = await tx.complaint.create({
    data: {
      companyId: input.companyId,
      siteId: input.siteId,
      supervisorId: input.supervisorUserId,
      createdByUserId: input.createdByUserId,
      text: input.text,
      severity: input.severity,
      kind: input.kind,
      state: 'OPEN',
      unreadHrRepliesCount: 0,
      // First reply by the supervisor counts as lastReplyAt anchor so the
      // drawer sort works from day 1 (no NULL-sorts-last gymnastics).
      lastReplyAt: new Date(),
    },
    select: { id: true },
  });

  const initialMessage = await tx.complaintMessage.create({
    data: {
      complaintId: complaint.id,
      companyId: input.companyId,
      authorUserId: input.createdByUserId,
      authorRole: 'SUPERVISOR',
      body: input.text,
      attachments: undefined,
    },
    select: { id: true },
  });

  await recordAuditEvent(tx, {
    companyId: input.companyId,
    kind: 'SITE_COMPLAINT_LOGGED',
    actorId: input.createdByUserId,
    targetId: complaint.id,
    payload: {
      siteId: input.siteId,
      siteName: site.name,
      severity: input.severity,
      complaintKind: input.kind,
      origin: input.origin,
      observedAt: input.observedAt ? input.observedAt.toISOString() : null,
      initialMessageId: initialMessage.id,
      text: input.text,
    },
  });

  await enqueueOutbox(tx, {
    companyId: input.companyId,
    topic: 'hr.site_complaint',
    payload: {
      complaintId: complaint.id,
      siteId: input.siteId,
      siteName: site.name,
      supervisorId: input.supervisorUserId,
      createdByUserId: input.createdByUserId,
      severity: input.severity,
      complaintKind: input.kind,
      origin: input.origin,
      text: input.text,
    },
  });

  return {
    kind: 'OK',
    complaintId: complaint.id,
    initialMessageId: initialMessage.id,
    siteName: site.name,
  };
}

/** @derives(master-plan §G) — supervisor surface */
export type AppendMessageInput = {
  companyId: string;
  complaintId: string;
  authorUserId: string;
  authorRole: ComplaintAuthorRole;
  body: string;
  attachments: ReadonlyArray<ComplaintAttachment> | null;
};

/** @derives(master-plan §G) — supervisor surface */
export type AppendMessageResult =
  | {
      kind: 'OK';
      messageId: string;
      createdAt: Date;
    }
  | { kind: 'COMPLAINT_NOT_FOUND' }
  | { kind: 'COMPLAINT_TERMINAL'; state: string };

/**
 * Append a reply to a complaint thread; bumps lastReplyAt and (for HR /
 * ADMIN authors) increments the supervisor's unread counter + transitions
 * the complaint to `IN_HR`.
 * @derives(supervisor-drawer-and-decisions-redesign.md §C)
 * @derives(master-plan §G) — supervisor surface
 */
export async function appendComplaintMessage(
  tx: Prisma.TransactionClient,
  input: AppendMessageInput,
): Promise<AppendMessageResult> {
  ComplaintAuthorRoleSchema.parse(input.authorRole);
  if (input.attachments) {
    for (const a of input.attachments) ComplaintAttachmentSchema.parse(a);
  }

  const complaint = await tx.complaint.findFirst({
    where: { id: input.complaintId, companyId: input.companyId },
    select: { id: true, state: true },
  });
  if (!complaint) return { kind: 'COMPLAINT_NOT_FOUND' };
  if (complaint.state === 'RESOLVED' || complaint.state === 'DISMISSED') {
    return { kind: 'COMPLAINT_TERMINAL', state: complaint.state };
  }

  const message = await tx.complaintMessage.create({
    data: {
      complaintId: input.complaintId,
      companyId: input.companyId,
      authorUserId: input.authorUserId,
      authorRole: input.authorRole,
      body: input.body,
      attachments:
        input.attachments && input.attachments.length > 0
          ? (input.attachments as unknown as Prisma.InputJsonValue)
          : undefined,
    },
    select: { id: true, createdAt: true },
  });

  // Counter math:
  //   - HR or ADMIN reply  → supervisor has one more unread
  //   - SUPERVISOR reply   → no counter change (HR has its own portal-side
  //                          counter when that lands; out of scope here)
  // Always bump lastReplyAt regardless of author.
  if (input.authorRole === 'HR' || input.authorRole === 'ADMIN') {
    await tx.complaint.update({
      where: { id: input.complaintId },
      data: {
        unreadHrRepliesCount: { increment: 1 },
        lastReplyAt: message.createdAt,
        state: 'IN_HR',
      },
    });
  } else {
    await tx.complaint.update({
      where: { id: input.complaintId },
      data: { lastReplyAt: message.createdAt },
    });
  }

  await recordAuditEvent(tx, {
    companyId: input.companyId,
    kind: 'COMPLAINT_MESSAGE_APPENDED',
    actorId: input.authorUserId,
    targetId: message.id,
    payload: {
      complaintId: input.complaintId,
      authorRole: input.authorRole,
      bodyLen: input.body.length,
      attachmentCount: input.attachments?.length ?? 0,
    },
  });

  return { kind: 'OK', messageId: message.id, createdAt: message.createdAt };
}

/** @derives(master-plan §G) — supervisor surface */
export type MarkReadInput = {
  companyId: string;
  complaintId: string;
  messageId: string;
  actorUserId: string;
  actorRole: ComplaintAuthorRole;
};

/** @derives(master-plan §G) — supervisor surface */
export type MarkReadResult =
  | { kind: 'OK'; wasAlreadyRead: boolean }
  | { kind: 'MESSAGE_NOT_FOUND' };

/**
 * Idempotent per-(message, actor) read receipt.
 * @derives(supervisor-drawer-and-decisions-redesign.md §C)
 * @derives(master-plan §G) — supervisor surface
 */
export async function markComplaintMessageRead(
  tx: Prisma.TransactionClient,
  input: MarkReadInput,
): Promise<MarkReadResult> {
  ComplaintAuthorRoleSchema.parse(input.actorRole);

  // Verify the message belongs to the caller's complaint AND the caller's
  // tenant. Two filters because the URL exposes both IDs and we want the
  // 404 to fire on either mismatch, not just one.
  const message = await tx.complaintMessage.findFirst({
    where: {
      id: input.messageId,
      complaintId: input.complaintId,
      companyId: input.companyId,
    },
    select: { id: true, authorRole: true },
  });
  if (!message) return { kind: 'MESSAGE_NOT_FOUND' };

  // Atomic-idempotent insert: composite PK on (messageId, actorUserId) makes
  // a second concurrent insert hit a unique-violation. We catch P2002 and
  // surface as `wasAlreadyRead=true` so the caller can decide whether to
  // skip the counter decrement. This is the race-test path mandated by the
  // Wave 3 brief.
  let wasAlreadyRead = false;
  try {
    await tx.complaintMessageRead.create({
      data: {
        messageId: input.messageId,
        actorUserId: input.actorUserId,
        actorRole: input.actorRole,
        companyId: input.companyId,
      },
    });
  } catch (err) {
    // Prisma P2002 = unique constraint violation. We treat this as the
    // expected idempotency outcome rather than an error.
    const code = (err as { code?: string }).code;
    if (code === 'P2002') {
      wasAlreadyRead = true;
    } else {
      throw err;
    }
  }

  // Decrement unreadHrRepliesCount when supervisor reads an HR message,
  // but ONLY on the first successful insert (not on idempotent re-runs).
  // Use a conditional UPDATE so the counter cannot underflow:
  //   UPDATE Complaint
  //   SET unreadHrRepliesCount = unreadHrRepliesCount - 1
  //   WHERE id = $1 AND unreadHrRepliesCount > 0
  if (!wasAlreadyRead && input.actorRole === 'SUPERVISOR' && message.authorRole === 'HR') {
    await tx.$executeRaw`
      UPDATE "axhy"."Complaint"
         SET "unreadHrRepliesCount" = "unreadHrRepliesCount" - 1
       WHERE "id" = ${input.complaintId}::uuid
         AND "companyId" = ${input.companyId}::uuid
         AND "unreadHrRepliesCount" > 0
    `;
  }

  return { kind: 'OK', wasAlreadyRead };
}

/** @derives(master-plan §G) — supervisor surface */
export type ResolveComplaintInput = {
  companyId: string;
  complaintId: string;
  resolverUserId: string;
};

/** @derives(master-plan §G) — supervisor surface */
export type ResolveComplaintResult =
  | { kind: 'OK'; resolvedAt: Date }
  | { kind: 'COMPLAINT_NOT_FOUND' }
  | { kind: 'ALREADY_TERMINAL'; state: string };

/**
 * Conditional UPDATE on state IN ('OPEN','IN_HR') so a parallel resolver
 * loses cleanly.
 * @derives(supervisor-drawer-and-decisions-redesign.md §C)
 * @derives(master-plan §G) — supervisor surface
 */
export async function resolveComplaint(
  tx: Prisma.TransactionClient,
  input: ResolveComplaintInput,
): Promise<ResolveComplaintResult> {
  const complaint = await tx.complaint.findFirst({
    where: { id: input.complaintId, companyId: input.companyId },
    select: { id: true, state: true },
  });
  if (!complaint) return { kind: 'COMPLAINT_NOT_FOUND' };
  if (complaint.state === 'RESOLVED' || complaint.state === 'DISMISSED') {
    return { kind: 'ALREADY_TERMINAL', state: complaint.state };
  }

  const resolvedAt = new Date();
  // Conditional UPDATE so a parallel resolver loses the race cleanly
  // (`updateMany` returns count=0 when no row matches).
  const updated = await tx.complaint.updateMany({
    where: {
      id: input.complaintId,
      companyId: input.companyId,
      state: { in: ['OPEN', 'IN_HR'] },
    },
    data: {
      state: 'RESOLVED',
      resolvedAt,
      resolvedBy: input.resolverUserId,
    },
  });
  if (updated.count === 0) {
    // Re-read so the caller sees the actual terminal state set by the
    // winning racer.
    const after = await tx.complaint.findFirst({
      where: { id: input.complaintId, companyId: input.companyId },
      select: { state: true },
    });
    return { kind: 'ALREADY_TERMINAL', state: after?.state ?? 'UNKNOWN' };
  }

  await recordAuditEvent(tx, {
    companyId: input.companyId,
    kind: 'COMPLAINT_RESOLVED',
    actorId: input.resolverUserId,
    targetId: input.complaintId,
    payload: { resolvedAt: resolvedAt.toISOString() },
  });

  return { kind: 'OK', resolvedAt };
}
