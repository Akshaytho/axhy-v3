/**
 * ReplacementInvite (F28) domain service — Wave 1 backend.
 *
 * The PUBG-squad invite primitive: supervisor broadcasts an invite to N
 * candidate workers, first to accept wins, siblings auto-EXPIRE in the same
 * transaction. Race-safety lives here so route handlers stay thin.
 *
 * Functions:
 *   - `createReplacementInviteGroup`
 *       One transaction: validate site + candidates (all in tenant + linked
 *       to a Worker row), generate `groupId`, insert N invite rows, enqueue
 *       N push notifications, emit N `REPLACEMENT_INVITE_SENT` audit events.
 *
 *   - `acceptReplacementInvite`
 *       Atomic accept. Conditional UPDATE on `status='PENDING'` wins the
 *       row; if `updatedCount=0` the caller already lost (sibling won, or
 *       already declined / expired / cancelled). On success: expire all
 *       siblings in the same group, create the Assignment that fulfills the
 *       cover, emit audit + push to supervisor + push to losing candidates.
 *
 *   - `declineReplacementInvite`
 *       Conditional UPDATE to DECLINED. If after the decline the group has
 *       no PENDING rows remaining and no ACCEPTED row, emit an "all
 *       declined" SupervisorDecision row so the supervisor sees the outcome
 *       in the Decisions queue (Wave 2 absorbs via `additionalDecisionSources`
 *       in Sprint 2; this wave only creates the row).
 *
 *   - `cancelReplacementInviteGroup`
 *       Supervisor recalls the broadcast. Bulk-flip all PENDING in group to
 *       CANCELLED. Push each former candidate.
 *
 *   - `sweepExpiredReplacementInvites`
 *       Cron-style sweep. UPDATE all PENDING past expiresAt to EXPIRED in
 *       one statement, then per-group emit a SupervisorDecision row.
 *
 * Cross-tenant isolation:
 *   Every function requires `companyId` and filters all WHERE clauses on
 *   it. Defense in depth: routes also wrap calls in `withTenantContext` so
 *   the RLS GUC fires if a future query slips through.
 *
 * @derives(master-plan §P.4 — ReplacementInvite)
 * @derives(master-plan §G:976 — PUBG-style invite locked design)
 * @derives(replacement-invite-feature-spec.md, 2026-05-18)
 * @derives(supervisor-30day-scenarios.md scenarios #39–46 — swaps + emergency cover)
 */

import { randomUUID } from 'node:crypto';

import type { Prisma, PrismaClient } from '@prisma/client';
import {
  CreateReplacementInviteGroupInput,
  type CreateReplacementInviteGroupInputT,
  ReplacementInviteStatusSchema,
  REPLACEMENT_INVITE_TIMING,
  type ReplacementInviteRowT,
} from '@axhy/shared-schema';

import { recordAuditEvent } from '../audit-event.js';

const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Shape of a ReplacementInvite row as returned by the DB. Kept local so we
 * don't import the generated Prisma type at every callsite.
 */
type ReplacementInviteDbRow = {
  id: string;
  companyId: string;
  groupId: string;
  fromSupervisorId: string;
  toWorkerId: string;
  visitId: string | null;
  siteId: string;
  scheduledStart: Date;
  status: string;
  sentAt: Date;
  expiresAt: Date;
  respondedAt: Date | null;
  respondReason: string | null;
};

function toRow(
  r: ReplacementInviteDbRow,
  siteName: string,
  toWorkerName: string | null,
): ReplacementInviteRowT {
  return {
    id: r.id,
    groupId: r.groupId,
    fromSupervisorId: r.fromSupervisorId,
    toWorkerId: r.toWorkerId,
    toWorkerName,
    visitId: r.visitId,
    siteId: r.siteId,
    siteName,
    scheduledStart: r.scheduledStart.toISOString(),
    status: ReplacementInviteStatusSchema.parse(r.status),
    sentAt: r.sentAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    respondedAt: r.respondedAt ? r.respondedAt.toISOString() : null,
    respondReason: r.respondReason,
  };
}

// ─── createReplacementInviteGroup ──────────────────────────────────────────

/** @derives(master-plan §P.4) */
export type CreateGroupInput = CreateReplacementInviteGroupInputT & {
  companyId: string;
  fromSupervisorId: string;
};

/** @derives(master-plan §P.4) */
export type CreateGroupResult =
  | { kind: 'OK'; groupId: string; invites: ReplacementInviteRowT[] }
  | { kind: 'SITE_NOT_FOUND' }
  | { kind: 'VISIT_NOT_FOUND' }
  | { kind: 'CANDIDATE_NOT_FOUND'; missingUserId: string }
  | { kind: 'CANDIDATE_NOT_LINKED_TO_WORKER'; userId: string };

/**
 * Validate + create the full broadcast in one tx. Either every row inserts
 * + every push enqueues, or none do.
 * @derives(master-plan §P.4)
 */
export async function createReplacementInviteGroup(
  tx: Prisma.TransactionClient,
  input: CreateGroupInput,
): Promise<CreateGroupResult> {
  CreateReplacementInviteGroupInput.parse({
    siteId: input.siteId,
    scheduledStart: input.scheduledStart,
    candidateUserIds: input.candidateUserIds,
    visitId: input.visitId ?? null,
    expiresInSec: input.expiresInSec,
  });

  const site = await tx.site.findFirst({
    where: { id: input.siteId, companyId: input.companyId },
    select: { id: true, name: true },
  });
  if (!site) return { kind: 'SITE_NOT_FOUND' };

  if (input.visitId) {
    const visit = await tx.visit.findFirst({
      where: { id: input.visitId, companyId: input.companyId },
      select: { id: true },
    });
    if (!visit) return { kind: 'VISIT_NOT_FOUND' };
  }

  // Every candidate must (a) be a User in this tenant via Membership and
  // (b) have a Worker row linked. Workers without a User row cannot
  // currently receive invites; that surface lights up when the worker
  // mobile lands in Phase D.
  const candidates = await tx.user.findMany({
    where: { id: { in: input.candidateUserIds } },
    select: {
      id: true,
      name: true,
      memberships: { where: { companyId: input.companyId }, select: { id: true } },
      workerProfile: { select: { id: true, companyId: true } },
    },
  });
  const candidateById = new Map(candidates.map((c) => [c.id, c]));

  for (const uid of input.candidateUserIds) {
    const c = candidateById.get(uid);
    if (!c || c.memberships.length === 0) {
      return { kind: 'CANDIDATE_NOT_FOUND', missingUserId: uid };
    }
    if (!c.workerProfile || c.workerProfile.companyId !== input.companyId) {
      return { kind: 'CANDIDATE_NOT_LINKED_TO_WORKER', userId: uid };
    }
  }

  const groupId = randomUUID();
  const sentAt = new Date();
  const expiresInSec = input.expiresInSec ?? REPLACEMENT_INVITE_TIMING.DEFAULT_EXPIRES_IN_SEC;
  const expiresAt = new Date(sentAt.getTime() + expiresInSec * 1000);
  const scheduledStart = new Date(input.scheduledStart);

  const created: ReplacementInviteRowT[] = [];
  for (const uid of input.candidateUserIds) {
    const row = await tx.replacementInvite.create({
      data: {
        companyId: input.companyId,
        groupId,
        fromSupervisorId: input.fromSupervisorId,
        toWorkerId: uid,
        visitId: input.visitId ?? null,
        siteId: input.siteId,
        scheduledStart,
        status: 'PENDING',
        sentAt,
        expiresAt,
      },
    });

    await recordAuditEvent(tx, {
      companyId: input.companyId,
      kind: 'REPLACEMENT_INVITE_SENT',
      actorId: input.fromSupervisorId,
      targetId: row.id,
      payload: {
        groupId,
        toWorkerUserId: uid,
        siteId: input.siteId,
        siteName: site.name,
        scheduledStart: scheduledStart.toISOString(),
        expiresAt: expiresAt.toISOString(),
      },
    });

    // Push to candidate. The dispatcher will fan this out to OneSignal +
    // mark deliveredAt; we just enqueue the Notification row here.
    await tx.notification.create({
      data: {
        companyId: input.companyId,
        audienceUserId: uid,
        kind: 'replacement_invite',
        channel: 'push',
        priority: 'URGENT',
        payload: {
          inviteId: row.id,
          groupId,
          fromSupervisorUserId: input.fromSupervisorId,
          siteId: input.siteId,
          siteName: site.name,
          scheduledStart: scheduledStart.toISOString(),
          expiresAt: expiresAt.toISOString(),
        },
      },
    });

    const toWorkerName = candidateById.get(uid)?.name ?? null;
    created.push(toRow(row as ReplacementInviteDbRow, site.name, toWorkerName));
  }

  return { kind: 'OK', groupId, invites: created };
}

// ─── acceptReplacementInvite ───────────────────────────────────────────────

/** @derives(master-plan §P.4) */
export type AcceptInput = {
  companyId: string;
  inviteId: string;
  workerUserId: string;
};

/** @derives(master-plan §P.4) */
export type AcceptResult =
  | {
      kind: 'OK';
      invite: ReplacementInviteRowT;
      assignmentId: string;
      expiredSiblingCount: number;
    }
  | { kind: 'INVITE_NOT_FOUND' }
  | { kind: 'ALREADY_DECIDED'; status: string }
  | { kind: 'NOT_YOUR_INVITE' }
  | { kind: 'WORKER_ROW_MISSING' };

/**
 * Race-safe accept:
 *   1. Conditional UPDATE on (id, companyId, toWorkerId, status='PENDING').
 *      If 0 rows updated, classify why and return appropriate error.
 *   2. Expire all PENDING siblings in same groupId.
 *   3. Find Worker row for the accepting user; create one-day Assignment
 *      covering the scheduledStart date (DRAFT state — supervisor can edit
 *      after the fact if needed).
 *   4. Audit + push supervisor (winner) + push losers (sibling_accepted).
 *
 * Three concurrent calls on the same group: exactly one returns OK; the
 * other two get ALREADY_DECIDED. Verified by test.
 *
 * @derives(master-plan §P.4 — race-safety)
 */
/** @derives(master-plan §P.4) — race-safe accept entry point */
export async function acceptReplacementInvite(
  tx: Prisma.TransactionClient,
  input: AcceptInput,
): Promise<AcceptResult> {
  // Race-safety: lookup the row's groupId first, then take a Postgres
  // transaction-scoped advisory lock keyed on the groupId hash. The lock
  // serialises the per-group critical section (accept + sibling-expire +
  // assignment-create) WITHOUT a deadlock cycle that arises when two
  // concurrent transactions each hold a row-level ACCEPTED lock on
  // different rows and then attempt to UPDATE each other's row to
  // EXPIRED. Advisory locks are auto-released on tx commit/rollback.
  //
  // Defense in depth: the partial unique index
  // `ReplacementInvite_one_accepted_per_group_uniq` (groupId WHERE
  // status='ACCEPTED') is the DB-level guarantee that even if the lock
  // is bypassed (e.g. cross-replica without shared lock state — Postgres
  // advisory locks are per-instance), two ACCEPTED rows can never
  // coexist in the same group.
  const probe = await tx.replacementInvite.findFirst({
    where: { id: input.inviteId, companyId: input.companyId },
    select: { id: true, groupId: true, toWorkerId: true, status: true },
  });
  if (!probe) return { kind: 'INVITE_NOT_FOUND' };
  if (probe.toWorkerId !== input.workerUserId) return { kind: 'NOT_YOUR_INVITE' };
  if (probe.status !== 'PENDING') return { kind: 'ALREADY_DECIDED', status: probe.status };

  // Acquire the per-group advisory lock. hashtext() yields a stable int4
  // from the groupId text; pg_advisory_xact_lock(int4) is the right
  // single-arg form. Same approach as Postgres-cookbook serialisation.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${probe.groupId}::text))`;

  // Atomic accept via updateMany. After the advisory lock, only one
  // tx-per-group is in flight at a time so updatedCount=1 is the
  // expected outcome unless a prior accept already won and committed.
  let updatedCount = 0;
  try {
    const updated = await tx.replacementInvite.updateMany({
      where: {
        id: input.inviteId,
        companyId: input.companyId,
        toWorkerId: input.workerUserId,
        status: 'PENDING',
      },
      data: { status: 'ACCEPTED', respondedAt: new Date(), respondReason: 'accept' },
    });
    updatedCount = updated.count;
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'P2002') {
      // Partial unique index fired — another worker in the same group
      // beat us across the commit boundary. Look up actual state for
      // the caller-visible envelope.
      const existing = await tx.replacementInvite.findFirst({
        where: { id: input.inviteId, companyId: input.companyId },
        select: { id: true, toWorkerId: true, status: true },
      });
      if (!existing) return { kind: 'INVITE_NOT_FOUND' };
      if (existing.toWorkerId !== input.workerUserId) return { kind: 'NOT_YOUR_INVITE' };
      return { kind: 'ALREADY_DECIDED', status: existing.status };
    }
    throw err;
  }

  if (updatedCount === 0) {
    const existing = await tx.replacementInvite.findFirst({
      where: { id: input.inviteId, companyId: input.companyId },
      select: { id: true, toWorkerId: true, status: true },
    });
    if (!existing) return { kind: 'INVITE_NOT_FOUND' };
    if (existing.toWorkerId !== input.workerUserId) return { kind: 'NOT_YOUR_INVITE' };
    return { kind: 'ALREADY_DECIDED', status: existing.status };
  }

  // Refetch the row + site name + worker name (kept simple: 2 reads is fine
  // at the call rate — invite-accept is human-paced, not RPS-heavy).
  const invite = await tx.replacementInvite.findFirstOrThrow({
    where: { id: input.inviteId, companyId: input.companyId },
    select: {
      id: true,
      companyId: true,
      groupId: true,
      fromSupervisorId: true,
      toWorkerId: true,
      visitId: true,
      siteId: true,
      scheduledStart: true,
      status: true,
      sentAt: true,
      expiresAt: true,
      respondedAt: true,
      respondReason: true,
      site: { select: { name: true } },
      toWorker: { select: { name: true } },
    },
  });

  // Expire all PENDING siblings — same tx so partial state is impossible.
  const siblingExpire = await tx.replacementInvite.updateMany({
    where: {
      companyId: input.companyId,
      groupId: invite.groupId,
      status: 'PENDING',
      id: { not: invite.id },
    },
    data: { status: 'EXPIRED', respondedAt: new Date(), respondReason: 'sibling_accepted' },
  });

  // Worker row required to materialise the Assignment. By construction of
  // createReplacementInviteGroup, this row was verified at send-time. We
  // re-verify here defensively in case the worker was unlinked after send.
  const worker = await tx.worker.findFirst({
    where: { companyId: input.companyId, userId: input.workerUserId },
    select: { id: true, name: true },
  });
  if (!worker) return { kind: 'WORKER_ROW_MISSING' };

  // One-day cover assignment. ShiftStart at scheduledStart, validFrom/Until
  // bracket the same day. State=ACTIVE so the cover takes effect immediately
  // (supervisor confirmed the swap via the accept; no further approval).
  // dayMask = 7-char "MTWTFSS" mask with only the matching day kept; other
  // positions become underscore. Convention per Assignment.dayMask schema:
  // Mon = index 0, Sun = index 6.
  const dayOfWeekJs = invite.scheduledStart.getDay(); // 0=Sun..6=Sat in JS
  const mondayFirstIndex = (dayOfWeekJs + 6) % 7; // Mon=0..Sun=6
  const DAY_CHARS = 'MTWTFSS';
  const dayMask = DAY_CHARS.split('')
    .map((c, idx) => (idx === mondayFirstIndex ? c : '_'))
    .join('');

  const validFrom = new Date(invite.scheduledStart);
  validFrom.setHours(0, 0, 0, 0);
  const validUntil = new Date(validFrom);
  validUntil.setHours(23, 59, 59, 999);

  // shiftStart in "HH:mm" 24-hour. toTimeString gives "HH:MM:SS GMT…"; slice
  // the first 5 chars. Use UTC so the value is timezone-stable across server
  // boots.
  const pad2 = (n: number): string => n.toString().padStart(2, '0');
  const shiftStart = `${pad2(invite.scheduledStart.getUTCHours())}:${pad2(invite.scheduledStart.getUTCMinutes())}`;
  // shiftEnd defaults to scheduledStart + 8h (sensible default for cover);
  // supervisor can refine in the assignment view if needed.
  const shiftEndDate = new Date(invite.scheduledStart.getTime() + 8 * 60 * 60 * 1000);
  const shiftEnd = `${pad2(shiftEndDate.getUTCHours())}:${pad2(shiftEndDate.getUTCMinutes())}`;

  const assignment = await tx.assignment.create({
    data: {
      companyId: input.companyId,
      workerId: worker.id,
      siteId: invite.siteId,
      shiftStart,
      shiftEnd,
      dayMask,
      validFrom,
      validUntil,
      state: 'ACTIVE',
    },
    select: { id: true },
  });

  await recordAuditEvent(tx, {
    companyId: input.companyId,
    kind: 'REPLACEMENT_INVITE_ACCEPTED',
    actorId: input.workerUserId,
    targetId: invite.id,
    payload: {
      groupId: invite.groupId,
      assignmentId: assignment.id,
      fromSupervisorId: invite.fromSupervisorId,
      siteId: invite.siteId,
      siteName: invite.site.name,
      scheduledStart: invite.scheduledStart.toISOString(),
      siblingsExpired: siblingExpire.count,
    },
  });

  // Push supervisor — winner notification.
  await tx.notification.create({
    data: {
      companyId: input.companyId,
      audienceUserId: invite.fromSupervisorId,
      kind: 'replacement_invite',
      channel: 'push',
      priority: 'URGENT',
      payload: {
        outcome: 'accepted',
        groupId: invite.groupId,
        inviteId: invite.id,
        winnerWorkerUserId: input.workerUserId,
        winnerWorkerName: invite.toWorker.name,
        siteId: invite.siteId,
        siteName: invite.site.name,
        scheduledStart: invite.scheduledStart.toISOString(),
        assignmentId: assignment.id,
      },
    },
  });

  // Push losers — sibling_accepted notification.
  if (siblingExpire.count > 0) {
    const losers = await tx.replacementInvite.findMany({
      where: {
        companyId: input.companyId,
        groupId: invite.groupId,
        status: 'EXPIRED',
        respondReason: 'sibling_accepted',
      },
      select: { toWorkerId: true },
    });
    for (const loser of losers) {
      await tx.notification.create({
        data: {
          companyId: input.companyId,
          audienceUserId: loser.toWorkerId,
          kind: 'replacement_invite',
          channel: 'push',
          priority: 'STANDARD',
          payload: {
            outcome: 'sibling_accepted',
            groupId: invite.groupId,
            siteId: invite.siteId,
            siteName: invite.site.name,
            scheduledStart: invite.scheduledStart.toISOString(),
          },
        },
      });
    }
  }

  return {
    kind: 'OK',
    invite: toRow(
      {
        ...invite,
        respondReason: invite.respondReason,
      } as ReplacementInviteDbRow,
      invite.site.name,
      invite.toWorker.name,
    ),
    assignmentId: assignment.id,
    expiredSiblingCount: siblingExpire.count,
  };
}

// ─── declineReplacementInvite ──────────────────────────────────────────────

/** @derives(master-plan §P.4) */
export type DeclineInput = {
  companyId: string;
  inviteId: string;
  workerUserId: string;
  reason: string | null;
};

/** @derives(master-plan §P.4) */
export type DeclineResult =
  | { kind: 'OK'; allDeclined: boolean }
  | { kind: 'INVITE_NOT_FOUND' }
  | { kind: 'ALREADY_DECIDED'; status: string }
  | { kind: 'NOT_YOUR_INVITE' };

/** @derives(master-plan §P.4) */
export async function declineReplacementInvite(
  tx: Prisma.TransactionClient,
  input: DeclineInput,
): Promise<DeclineResult> {
  const updated = await tx.replacementInvite.updateMany({
    where: {
      id: input.inviteId,
      companyId: input.companyId,
      toWorkerId: input.workerUserId,
      status: 'PENDING',
    },
    data: {
      status: 'DECLINED',
      respondedAt: new Date(),
      respondReason: input.reason ?? 'decline',
    },
  });

  if (updated.count === 0) {
    const existing = await tx.replacementInvite.findFirst({
      where: { id: input.inviteId, companyId: input.companyId },
      select: { id: true, toWorkerId: true, status: true },
    });
    if (!existing) return { kind: 'INVITE_NOT_FOUND' };
    if (existing.toWorkerId !== input.workerUserId) return { kind: 'NOT_YOUR_INVITE' };
    return { kind: 'ALREADY_DECIDED', status: existing.status };
  }

  // Did everyone in the group decline? If so, surface to supervisor.
  const declined = await tx.replacementInvite.findFirstOrThrow({
    where: { id: input.inviteId, companyId: input.companyId },
    select: { groupId: true, fromSupervisorId: true, siteId: true, scheduledStart: true },
  });
  const remaining = await tx.replacementInvite.count({
    where: {
      companyId: input.companyId,
      groupId: declined.groupId,
      status: { in: ['PENDING', 'ACCEPTED'] },
    },
  });

  await recordAuditEvent(tx, {
    companyId: input.companyId,
    kind: 'REPLACEMENT_INVITE_DECLINED',
    actorId: input.workerUserId,
    targetId: input.inviteId,
    payload: {
      groupId: declined.groupId,
      reason: input.reason ?? 'decline',
      remainingNonTerminal: remaining,
    },
  });

  let allDeclined = false;
  if (remaining === 0) {
    allDeclined = true;
    await emitGroupOutcomeDecision(tx, {
      companyId: input.companyId,
      groupId: declined.groupId,
      supervisorId: declined.fromSupervisorId,
      outcome: 'all_declined',
      siteId: declined.siteId,
      scheduledStart: declined.scheduledStart,
    });
    // Push supervisor — all-declined notification.
    await tx.notification.create({
      data: {
        companyId: input.companyId,
        audienceUserId: declined.fromSupervisorId,
        kind: 'replacement_invite',
        channel: 'push',
        priority: 'URGENT',
        payload: {
          outcome: 'all_declined',
          groupId: declined.groupId,
          siteId: declined.siteId,
          scheduledStart: declined.scheduledStart.toISOString(),
        },
      },
    });
  }

  return { kind: 'OK', allDeclined };
}

// ─── cancelReplacementInviteGroup ──────────────────────────────────────────

/** @derives(master-plan §P.4) */
export type CancelInput = {
  companyId: string;
  groupId: string;
  fromSupervisorId: string;
};

/** @derives(master-plan §P.4) */
export type CancelResult =
  | { kind: 'OK'; cancelledCount: number }
  | { kind: 'GROUP_NOT_FOUND' }
  | { kind: 'NOT_YOUR_GROUP' };

/** @derives(master-plan §P.4) */
export async function cancelReplacementInviteGroup(
  tx: Prisma.TransactionClient,
  input: CancelInput,
): Promise<CancelResult> {
  // Ownership probe — any row in the group reveals fromSupervisorId.
  const probe = await tx.replacementInvite.findFirst({
    where: { companyId: input.companyId, groupId: input.groupId },
    select: { fromSupervisorId: true, siteId: true, scheduledStart: true },
  });
  if (!probe) return { kind: 'GROUP_NOT_FOUND' };
  if (probe.fromSupervisorId !== input.fromSupervisorId) {
    return { kind: 'NOT_YOUR_GROUP' };
  }

  const updated = await tx.replacementInvite.updateMany({
    where: {
      companyId: input.companyId,
      groupId: input.groupId,
      status: 'PENDING',
    },
    data: {
      status: 'CANCELLED',
      respondedAt: new Date(),
      respondReason: 'supervisor_cancelled',
    },
  });

  if (updated.count === 0) {
    // Nothing left to cancel — group already fully resolved.
    return { kind: 'OK', cancelledCount: 0 };
  }

  await recordAuditEvent(tx, {
    companyId: input.companyId,
    kind: 'REPLACEMENT_INVITE_CANCELLED',
    actorId: input.fromSupervisorId,
    targetId: input.groupId,
    payload: {
      groupId: input.groupId,
      cancelledCount: updated.count,
      siteId: probe.siteId,
      scheduledStart: probe.scheduledStart.toISOString(),
    },
  });

  // Push each cancelled candidate.
  const cancelledRows = await tx.replacementInvite.findMany({
    where: {
      companyId: input.companyId,
      groupId: input.groupId,
      status: 'CANCELLED',
      respondReason: 'supervisor_cancelled',
    },
    select: { toWorkerId: true },
  });
  for (const c of cancelledRows) {
    await tx.notification.create({
      data: {
        companyId: input.companyId,
        audienceUserId: c.toWorkerId,
        kind: 'replacement_invite',
        channel: 'push',
        priority: 'STANDARD',
        payload: {
          outcome: 'supervisor_cancelled',
          groupId: input.groupId,
          siteId: probe.siteId,
          scheduledStart: probe.scheduledStart.toISOString(),
        },
      },
    });
  }

  return { kind: 'OK', cancelledCount: updated.count };
}

// ─── sweepExpiredReplacementInvites ────────────────────────────────────────

/** @derives(master-plan §P.4) */
export type SweepResult = {
  expiredCount: number;
  outcomeDecisionsEmitted: number;
};

/**
 * Cron-style sweep. PENDING rows past expiresAt flip to EXPIRED in one
 * statement; we then re-aggregate by groupId and emit a SupervisorDecision
 * row for each fully-resolved group that has zero ACCEPTED rows.
 *
 * Multi-replica safe: the conditional UPDATE on `status='PENDING'` is
 * naturally idempotent; a second replica's UPDATE finds 0 rows. Outcome
 * decisions are deduped via a `findFirst` cheap-skip on existing rows.
 *
 * @derives(master-plan §P.4 — cron sweep)
 */
/** @derives(master-plan §P.4) — cron sweep entry point */
export async function sweepExpiredReplacementInvites(
  client: PrismaClient | Prisma.TransactionClient,
  now: Date = new Date(),
): Promise<SweepResult> {
  // Step 1 — flip every overdue PENDING to EXPIRED in one statement.
  // Returning syntax is the cleanest way to capture the affected rows for
  // step 2; we use raw SQL because Prisma's updateMany doesn't return rows.
  // The status CHECK + responded-at consistency CHECK on the table mean
  // we must set respondedAt at the same moment, which raw UPDATE does
  // atomically.
  const sweptRows: Array<{ id: string; groupId: string; companyId: string }> =
    await client.$queryRaw`
      UPDATE "axhy"."ReplacementInvite"
         SET "status" = 'EXPIRED',
             "respondedAt" = ${now},
             "respondReason" = 'cron_expired'
       WHERE "status" = 'PENDING'
         AND "expiresAt" < ${now}
      RETURNING "id", "groupId", "companyId"
    `;

  if (sweptRows.length === 0) {
    return { expiredCount: 0, outcomeDecisionsEmitted: 0 };
  }

  // Step 2 — collapse to unique groups + emit one outcome decision per group
  // that now has zero non-terminal rows AND no ACCEPTED row.
  const uniqueGroups = new Map<string, { groupId: string; companyId: string }>();
  for (const row of sweptRows) {
    uniqueGroups.set(`${row.companyId}:${row.groupId}`, {
      groupId: row.groupId,
      companyId: row.companyId,
    });
  }

  let outcomeDecisionsEmitted = 0;
  for (const { groupId, companyId } of uniqueGroups.values()) {
    const nonTerminal = await client.replacementInvite.count({
      where: { companyId, groupId, status: 'PENDING' },
    });
    if (nonTerminal > 0) continue; // still has live PENDING rows (shouldn't happen post-sweep)

    const accepted = await client.replacementInvite.findFirst({
      where: { companyId, groupId, status: 'ACCEPTED' },
      select: { id: true },
    });
    if (accepted) continue; // someone won — outcome already pushed at accept time

    // Group is fully expired with no winner. Emit outcome decision.
    const sample = await client.replacementInvite.findFirstOrThrow({
      where: { companyId, groupId },
      select: { fromSupervisorId: true, siteId: true, scheduledStart: true },
    });
    const emitted = await emitGroupOutcomeDecision(client, {
      companyId,
      groupId,
      supervisorId: sample.fromSupervisorId,
      outcome: 'expired_no_accept',
      siteId: sample.siteId,
      scheduledStart: sample.scheduledStart,
    });
    if (emitted) outcomeDecisionsEmitted++;

    // Push supervisor.
    await client.notification.create({
      data: {
        companyId,
        audienceUserId: sample.fromSupervisorId,
        kind: 'replacement_invite',
        channel: 'push',
        priority: 'URGENT',
        payload: {
          outcome: 'expired_no_accept',
          groupId,
          siteId: sample.siteId,
          scheduledStart: sample.scheduledStart.toISOString(),
        },
      },
    });
  }

  return { expiredCount: sweptRows.length, outcomeDecisionsEmitted };
}

// ─── Internal: emit a REPLACEMENT_INVITE_OUTCOME SupervisorDecision row ────

type EmitOutcomeInput = {
  companyId: string;
  groupId: string;
  supervisorId: string;
  outcome: 'expired_no_accept' | 'all_declined';
  siteId: string;
  scheduledStart: Date;
};

/**
 * Emits a SupervisorDecision row that Wave 2's Decisions queue will surface
 * (once Wave 1 is wired into `additionalDecisionSources` in Sprint 2). For
 * Wave 1 the row lives in the table; Sprint 2 makes it visible.
 *
 * Idempotency: skip if the row already exists for this (groupId, outcome).
 * Concurrent sweeps + a decline-all both calling this are safe — the
 * dedup-find avoids double-emit.
 */
async function emitGroupOutcomeDecision(
  client: Prisma.TransactionClient | PrismaClient,
  input: EmitOutcomeInput,
): Promise<boolean> {
  const existing = await client.supervisorDecision.findFirst({
    where: {
      companyId: input.companyId,
      supervisorId: input.supervisorId,
      kind: 'REPLACEMENT_INVITE_OUTCOME',
      targetId: input.groupId,
    },
    select: { id: true },
  });
  if (existing) return false;

  await client.supervisorDecision.create({
    data: {
      companyId: input.companyId,
      supervisorId: input.supervisorId,
      kind: 'REPLACEMENT_INVITE_OUTCOME',
      tier: 'OPERATIONAL',
      targetId: input.groupId,
      payload: {
        groupId: input.groupId,
        outcome: input.outcome,
        siteId: input.siteId,
        scheduledStart: input.scheduledStart.toISOString(),
      },
      ackRequired: false,
    },
  });

  await recordAuditEvent(client as Prisma.TransactionClient, {
    companyId: input.companyId,
    kind: 'REPLACEMENT_INVITE_OUTCOME_DECISION_EMITTED',
    actorId: SYSTEM_ACTOR_ID,
    targetId: input.groupId,
    payload: {
      groupId: input.groupId,
      supervisorId: input.supervisorId,
      outcome: input.outcome,
    },
  });

  return true;
}
