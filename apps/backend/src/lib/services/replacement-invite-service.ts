/**
 * ReplacementInvite (F28) domain service — Wave 1 backend.
 *
 * Single-recipient cover request. Supervisor sends ONE invite to ONE
 * worker; 2-minute TTL; on terminal state (ACCEPTED / DECLINED / EXPIRED /
 * CANCELLED) supervisor may send a fresh invite to the same worker or a
 * different one. NOT a multi-worker broadcast — see
 * `feedback_replacement_invite_single_recipient.md` (locked 2026-05-18).
 *
 * The single-recipient model is the production-grade design here: the only
 * race-safety needed is the conditional UPDATE on `status='PENDING'` for
 * accept / decline / cancel, which Postgres serialises naturally at the
 * row level. No advisory lock, no partial unique index, no sibling-expire
 * logic — that machinery is only needed for broadcast designs and would
 * be over-engineered noise here.
 *
 * Functions:
 *   - `createReplacementInvite`
 *       Validate site + visit + candidate (linked Worker in tenant) →
 *       insert one row → emit `REPLACEMENT_INVITE_SENT` audit → enqueue
 *       one `replacement_invite` Notification (push). All in one tx.
 *
 *   - `acceptReplacementInvite`
 *       Conditional UPDATE on (id, companyId, toWorkerId, status='PENDING').
 *       updatedCount=0 → classify (NOT_FOUND / NOT_YOURS / ALREADY_DECIDED)
 *       on a follow-up read. On success: find the Worker row, create an
 *       ACTIVE one-day Assignment, emit audit + push to supervisor.
 *
 *   - `declineReplacementInvite`
 *       Conditional UPDATE → DECLINED. Emit audit + push supervisor.
 *
 *   - `cancelReplacementInvite`
 *       Supervisor cancels their own PENDING invite. Conditional UPDATE
 *       → CANCELLED. Push the worker.
 *
 *   - `sweepExpiredReplacementInvites`
 *       Cron-style sweep. UPDATE all PENDING past expiresAt to EXPIRED;
 *       for each emit a `REPLACEMENT_INVITE_OUTCOME` SupervisorDecision
 *       row + push the supervisor.
 *
 * Cross-tenant isolation:
 *   Every function requires `companyId` and filters all WHERE clauses on
 *   it. Defense in depth: routes wrap calls in `withTenantContext` so the
 *   RLS GUC fires if a future query slips through.
 *
 * @derives(master-plan §P.4 — ReplacementInvite)
 * @derives(master-plan §G — supervisor surface)
 * @derives(feedback_replacement_invite_single_recipient.md, 2026-05-18)
 * @derives(supervisor-30day-scenarios.md scenarios #39–46 — swaps + emergency cover)
 */

import type { Prisma, PrismaClient } from '@prisma/client';
import {
  CreateReplacementInviteInput,
  type CreateReplacementInviteInputT,
  ReplacementInviteStatusSchema,
  REPLACEMENT_INVITE_TIMING,
  type ReplacementInviteRowT,
} from '@axhy/shared-schema';

import { recordAuditEvent } from '../audit-event.js';

const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Cron sweep per-tick batch cap. The cron runs every 30s; anything past
 * this limit rolls to the next tick. Chosen to comfortably exceed
 * realistic per-tick expiry volume (founder said 38 workers / supervisor,
 * worst case ~5 simultaneous outstanding invites per supervisor at a
 * given moment) without risking per-row tx pile-up on a slow shard.
 */
const BATCH_LIMIT = 100;

/** Local DB-row shape so we don't depend on the generated Prisma type at every callsite. */
type ReplacementInviteDbRow = {
  id: string;
  companyId: string;
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

// ─── createReplacementInvite ───────────────────────────────────────────────

/** @derives(master-plan §P.4) */
export type CreateInput = CreateReplacementInviteInputT & {
  companyId: string;
  fromSupervisorId: string;
};

/** @derives(master-plan §P.4) */
export type CreateResult =
  | { kind: 'OK'; invite: ReplacementInviteRowT }
  | { kind: 'SITE_NOT_FOUND' }
  | { kind: 'VISIT_NOT_FOUND' }
  | { kind: 'CANDIDATE_NOT_FOUND' }
  | { kind: 'CANDIDATE_NOT_LINKED_TO_WORKER' };

/**
 * @derives(master-plan §P.4)
 * Create a single-recipient invite in one tx. Either the row inserts AND
 * the push enqueues AND the audit fires, or none do.
 */
export async function createReplacementInvite(
  tx: Prisma.TransactionClient,
  input: CreateInput,
): Promise<CreateResult> {
  CreateReplacementInviteInput.parse({
    siteId: input.siteId,
    scheduledStart: input.scheduledStart,
    candidateUserId: input.candidateUserId,
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

  // Candidate must (a) be a User with a Membership in this tenant and
  // (b) have a Worker row linked. Workers without a User row cannot
  // receive invites; that surface lights up when the worker mobile lands
  // in Phase D.
  const candidate = await tx.user.findFirst({
    where: { id: input.candidateUserId },
    select: {
      id: true,
      name: true,
      memberships: { where: { companyId: input.companyId }, select: { id: true } },
      workerProfile: { select: { id: true, companyId: true } },
    },
  });
  if (!candidate || candidate.memberships.length === 0) {
    return { kind: 'CANDIDATE_NOT_FOUND' };
  }
  if (!candidate.workerProfile || candidate.workerProfile.companyId !== input.companyId) {
    return { kind: 'CANDIDATE_NOT_LINKED_TO_WORKER' };
  }

  const sentAt = new Date();
  const expiresInSec = input.expiresInSec ?? REPLACEMENT_INVITE_TIMING.DEFAULT_EXPIRES_IN_SEC;
  const expiresAt = new Date(sentAt.getTime() + expiresInSec * 1000);
  const scheduledStart = new Date(input.scheduledStart);

  const row = await tx.replacementInvite.create({
    data: {
      companyId: input.companyId,
      fromSupervisorId: input.fromSupervisorId,
      toWorkerId: input.candidateUserId,
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
      toWorkerUserId: input.candidateUserId,
      siteId: input.siteId,
      siteName: site.name,
      scheduledStart: scheduledStart.toISOString(),
      expiresAt: expiresAt.toISOString(),
    },
  });

  // Push to candidate. Existing dispatcher fans Notification rows to
  // OneSignal — we just enqueue here.
  await tx.notification.create({
    data: {
      companyId: input.companyId,
      audienceUserId: input.candidateUserId,
      kind: 'replacement_invite',
      channel: 'push',
      priority: 'URGENT',
      payload: {
        inviteId: row.id,
        fromSupervisorUserId: input.fromSupervisorId,
        siteId: input.siteId,
        siteName: site.name,
        scheduledStart: scheduledStart.toISOString(),
        expiresAt: expiresAt.toISOString(),
      },
    },
  });

  return {
    kind: 'OK',
    invite: toRow(row as ReplacementInviteDbRow, site.name, candidate.name ?? null),
  };
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
  | { kind: 'OK'; invite: ReplacementInviteRowT; assignmentId: string }
  | { kind: 'INVITE_NOT_FOUND' }
  | { kind: 'NOT_YOUR_INVITE' }
  | { kind: 'ALREADY_DECIDED'; status: string }
  | { kind: 'WORKER_ROW_MISSING' };

/**
 * @derives(master-plan §P.4)
 * Conditional UPDATE on (id, companyId, toWorkerId, status='PENDING').
 * Postgres serialises row-level access — no advisory lock or partial
 * unique index needed because there's exactly one row per invite.
 */
export async function acceptReplacementInvite(
  tx: Prisma.TransactionClient,
  input: AcceptInput,
): Promise<AcceptResult> {
  const updated = await tx.replacementInvite.updateMany({
    where: {
      id: input.inviteId,
      companyId: input.companyId,
      toWorkerId: input.workerUserId,
      status: 'PENDING',
    },
    data: { status: 'ACCEPTED', respondedAt: new Date(), respondReason: 'accept' },
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

  // Refetch with site + worker names for the response envelope.
  const invite = await tx.replacementInvite.findFirstOrThrow({
    where: { id: input.inviteId, companyId: input.companyId },
    select: {
      id: true,
      companyId: true,
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

  // Worker row required to materialise the Assignment. Verified at send
  // time; re-checked here defensively in case the worker was unlinked
  // between send and accept.
  const worker = await tx.worker.findFirst({
    where: { companyId: input.companyId, userId: input.workerUserId },
    select: { id: true },
  });
  if (!worker) return { kind: 'WORKER_ROW_MISSING' };

  // One-day cover assignment. State=ACTIVE: the supervisor confirmed the
  // swap by accepting; no further approval needed.
  //
  // All time-zone math runs in UTC to keep the day-of-week, validFrom,
  // validUntil, and shiftStart/shiftEnd computations on the same clock.
  // Earlier version mixed local-TZ `getDay()` + `setHours()` with UTC
  // `getUTCHours()` — review caller flagged it as a "bug-magnet" because
  // a scheduledStart at 23:30 UTC on Mon would compute a Mon dayMask but
  // local-TZ validFrom could fall on Tue, leaving the Assignment's
  // validity window inconsistent with its day-of-week.
  const dayOfWeekUtc = invite.scheduledStart.getUTCDay(); // 0=Sun..6=Sat
  const mondayFirstIndex = (dayOfWeekUtc + 6) % 7;
  const DAY_CHARS = 'MTWTFSS';
  const dayMask = DAY_CHARS.split('')
    .map((c, idx) => (idx === mondayFirstIndex ? c : '_'))
    .join('');

  // UTC-aligned validity window for the same UTC day as scheduledStart.
  const validFrom = new Date(
    Date.UTC(
      invite.scheduledStart.getUTCFullYear(),
      invite.scheduledStart.getUTCMonth(),
      invite.scheduledStart.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );
  const validUntil = new Date(
    Date.UTC(
      invite.scheduledStart.getUTCFullYear(),
      invite.scheduledStart.getUTCMonth(),
      invite.scheduledStart.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );

  const pad2 = (n: number): string => n.toString().padStart(2, '0');
  const shiftStart = `${pad2(invite.scheduledStart.getUTCHours())}:${pad2(invite.scheduledStart.getUTCMinutes())}`;
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
      assignmentId: assignment.id,
      fromSupervisorId: invite.fromSupervisorId,
      siteId: invite.siteId,
      siteName: invite.site.name,
      scheduledStart: invite.scheduledStart.toISOString(),
    },
  });

  // Push supervisor — accepted notification.
  await tx.notification.create({
    data: {
      companyId: input.companyId,
      audienceUserId: invite.fromSupervisorId,
      kind: 'replacement_invite',
      channel: 'push',
      priority: 'URGENT',
      payload: {
        outcome: 'accepted',
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

  return {
    kind: 'OK',
    invite: toRow(invite as ReplacementInviteDbRow, invite.site.name, invite.toWorker.name ?? null),
    assignmentId: assignment.id,
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
  | { kind: 'OK' }
  | { kind: 'INVITE_NOT_FOUND' }
  | { kind: 'NOT_YOUR_INVITE' }
  | { kind: 'ALREADY_DECIDED'; status: string };

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

  // Refetch supervisor + site so we can push the supervisor.
  const declined = await tx.replacementInvite.findFirstOrThrow({
    where: { id: input.inviteId, companyId: input.companyId },
    select: {
      fromSupervisorId: true,
      siteId: true,
      scheduledStart: true,
      site: { select: { name: true } },
    },
  });

  await recordAuditEvent(tx, {
    companyId: input.companyId,
    kind: 'REPLACEMENT_INVITE_DECLINED',
    actorId: input.workerUserId,
    targetId: input.inviteId,
    payload: { reason: input.reason ?? 'decline' },
  });

  await tx.notification.create({
    data: {
      companyId: input.companyId,
      audienceUserId: declined.fromSupervisorId,
      kind: 'replacement_invite',
      channel: 'push',
      priority: 'URGENT',
      payload: {
        outcome: 'declined',
        inviteId: input.inviteId,
        siteId: declined.siteId,
        siteName: declined.site.name,
        scheduledStart: declined.scheduledStart.toISOString(),
        reason: input.reason ?? null,
      },
    },
  });

  return { kind: 'OK' };
}

// ─── cancelReplacementInvite ───────────────────────────────────────────────

/** @derives(master-plan §P.4) */
export type CancelInput = {
  companyId: string;
  inviteId: string;
  fromSupervisorId: string;
};

/** @derives(master-plan §P.4) */
export type CancelResult =
  | { kind: 'OK' }
  | { kind: 'INVITE_NOT_FOUND' }
  | { kind: 'NOT_YOUR_INVITE' }
  | { kind: 'ALREADY_DECIDED'; status: string };

/** @derives(master-plan §P.4) */
export async function cancelReplacementInvite(
  tx: Prisma.TransactionClient,
  input: CancelInput,
): Promise<CancelResult> {
  const updated = await tx.replacementInvite.updateMany({
    where: {
      id: input.inviteId,
      companyId: input.companyId,
      fromSupervisorId: input.fromSupervisorId,
      status: 'PENDING',
    },
    data: {
      status: 'CANCELLED',
      respondedAt: new Date(),
      respondReason: 'supervisor_cancelled',
    },
  });

  if (updated.count === 0) {
    const existing = await tx.replacementInvite.findFirst({
      where: { id: input.inviteId, companyId: input.companyId },
      select: { id: true, fromSupervisorId: true, status: true },
    });
    if (!existing) return { kind: 'INVITE_NOT_FOUND' };
    if (existing.fromSupervisorId !== input.fromSupervisorId) return { kind: 'NOT_YOUR_INVITE' };
    return { kind: 'ALREADY_DECIDED', status: existing.status };
  }

  const cancelled = await tx.replacementInvite.findFirstOrThrow({
    where: { id: input.inviteId, companyId: input.companyId },
    select: {
      toWorkerId: true,
      siteId: true,
      scheduledStart: true,
      site: { select: { name: true } },
    },
  });

  await recordAuditEvent(tx, {
    companyId: input.companyId,
    kind: 'REPLACEMENT_INVITE_CANCELLED',
    actorId: input.fromSupervisorId,
    targetId: input.inviteId,
    payload: {
      siteId: cancelled.siteId,
      scheduledStart: cancelled.scheduledStart.toISOString(),
    },
  });

  // Push the candidate so their pending banner disappears.
  await tx.notification.create({
    data: {
      companyId: input.companyId,
      audienceUserId: cancelled.toWorkerId,
      kind: 'replacement_invite',
      channel: 'push',
      priority: 'STANDARD',
      payload: {
        outcome: 'supervisor_cancelled',
        inviteId: input.inviteId,
        siteId: cancelled.siteId,
        siteName: cancelled.site.name,
        scheduledStart: cancelled.scheduledStart.toISOString(),
      },
    },
  });

  return { kind: 'OK' };
}

// ─── sweepExpiredReplacementInvites ────────────────────────────────────────

/** @derives(master-plan §P.4) */
export type SweepResult = {
  expiredCount: number;
  outcomeDecisionsEmitted: number;
};

/**
 * @derives(master-plan §P.4) — cron sweep entry point
 * @derives(2026-05-18-sprint-1-deep-review.md Cluster D)
 *
 * Per-invite atomicity (Cluster D fix, 2026-05-18): each candidate row
 * has its three side effects — UPDATE to EXPIRED, outcome
 * `SupervisorDecision`, supervisor Notification — committed in one
 * `prisma.$transaction`. A crash mid-sweep leaves overdue rows still
 * PENDING (recovered on the next tick) rather than EXPIRED-without-
 * outcome-or-push. Mirrors the `binding-expire-sweep` gold-standard
 * pattern in `jobs/binding-expire-sweep.ts`.
 *
 * Multi-replica safe: each row's UPDATE is `WHERE id=? AND status='PENDING'`
 * so only the first replica's UPDATE returns count=1; subsequent
 * replicas see count=0 and skip the audit + notification cleanly.
 *
 * Outcome SupervisorDecision rows are deduped by a findFirst cheap-skip
 * keyed on (kind, targetId) inside the tx as defense in depth (after
 * the UPDATE wins-by-count check is the primary mechanism).
 */
export async function sweepExpiredReplacementInvites(
  client: PrismaClient,
  now: Date = new Date(),
): Promise<SweepResult> {
  // Step 1 — find candidate rows. SELECT-only, no mutation yet. The
  // per-row tx in step 2 re-asserts `status='PENDING'` in the UPDATE
  // WHERE so multi-replica is naturally safe.
  //
  // `take: BATCH_LIMIT` caps the number of rows processed in one tick
  // so a backlog from a failed previous sweep (or a thundering-herd
  // mistake) can't blow the per-transaction time budget. Anything left
  // over rolls to the next tick — the cron runs every 30s.
  const candidates = await client.replacementInvite.findMany({
    where: { status: 'PENDING', expiresAt: { lt: now } },
    select: {
      id: true,
      companyId: true,
      fromSupervisorId: true,
      siteId: true,
      scheduledStart: true,
    },
    take: BATCH_LIMIT,
    orderBy: { expiresAt: 'asc' },
  });

  if (candidates.length === 0) {
    return { expiredCount: 0, outcomeDecisionsEmitted: 0 };
  }

  let expiredCount = 0;
  let outcomeDecisionsEmitted = 0;

  for (const row of candidates) {
    // Per-row tx — UPDATE + outcome + notification commit together.
    // Failure of any step inside rolls back ALL three for this row;
    // the next sweep tick re-picks the row up because it's still
    // PENDING (and still past expiresAt).
    //
    // Explicit timeout: each tx does 3 small DB ops; 10s is generous
    // even on a slow Railway shard. Prisma's default is 5s which we
    // observed hitting during a backlog-recovery test run.
    const perRowResult = await client.$transaction(
      async (tx) => {
        const updateResult = await tx.replacementInvite.updateMany({
          where: { id: row.id, companyId: row.companyId, status: 'PENDING' },
          data: { status: 'EXPIRED', respondedAt: now, respondReason: 'cron_expired' },
        });
        if (updateResult.count === 0) {
          // Another replica beat us, OR the row transitioned out of
          // PENDING (worker accepted/declined in the window between our
          // SELECT and our UPDATE). Either way, no side effects from us.
          return { expired: false, outcomeEmitted: false };
        }

        const outcomeEmitted = await emitInviteOutcomeDecision(tx, {
          companyId: row.companyId,
          inviteId: row.id,
          supervisorId: row.fromSupervisorId,
          outcome: 'expired_no_accept',
          siteId: row.siteId,
          scheduledStart: row.scheduledStart,
        });

        await tx.notification.create({
          data: {
            companyId: row.companyId,
            audienceUserId: row.fromSupervisorId,
            kind: 'replacement_invite',
            channel: 'push',
            priority: 'URGENT',
            payload: {
              outcome: 'expired_no_accept',
              inviteId: row.id,
              siteId: row.siteId,
              scheduledStart: row.scheduledStart.toISOString(),
            },
          },
        });

        return { expired: true, outcomeEmitted };
      },
      { timeout: 10_000, maxWait: 5_000 },
    );

    if (perRowResult.expired) expiredCount++;
    if (perRowResult.outcomeEmitted) outcomeDecisionsEmitted++;
  }

  return { expiredCount, outcomeDecisionsEmitted };
}

// ─── Internal: emit REPLACEMENT_INVITE_OUTCOME SupervisorDecision row ──────

type EmitOutcomeInput = {
  companyId: string;
  inviteId: string;
  supervisorId: string;
  outcome: 'expired_no_accept';
  siteId: string;
  scheduledStart: Date;
};

/**
 * Idempotent emit — skip if outcome already exists for this (kind, inviteId).
 * Lets Wave 2's Decisions queue surface the outcome (Sprint 2 mobile wires
 * the `additionalDecisionSources` plug-in for ReplacementInvite).
 */
async function emitInviteOutcomeDecision(
  client: Prisma.TransactionClient | PrismaClient,
  input: EmitOutcomeInput,
): Promise<boolean> {
  const existing = await client.supervisorDecision.findFirst({
    where: {
      companyId: input.companyId,
      supervisorId: input.supervisorId,
      kind: 'REPLACEMENT_INVITE_OUTCOME',
      targetId: input.inviteId,
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
      targetId: input.inviteId,
      payload: {
        inviteId: input.inviteId,
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
    targetId: input.inviteId,
    payload: { supervisorId: input.supervisorId, outcome: input.outcome },
  });

  return true;
}
