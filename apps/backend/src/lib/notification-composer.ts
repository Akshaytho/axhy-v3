/**
 * F-007 round-2 v11 — `composeSupervisorChangeNotifications`
 *
 * Read-only audience resolver for `supervisor_change` Notification rows.
 * Returns the audience structure the dispatcher handler INSERTs against.
 *
 * **Scope:** F-007 ships the canonical persistence layer for
 * `supervisor_change` events. F-011 (OneSignal SDK + delivery adapter)
 * delivers; F-006 (worker mobile in-app panel) consumes the in_app_banner
 * rows. F-007 round 1 does NOT wire real delivery.
 *
 * **Invariants the composer respects:**
 *   1. Read-only — no writes, no audit emits.
 *   2. Point-in-time audience — workers ACTIVE on site at `effectiveAt`;
 *      `getEffectiveBinding`-style semantics for outgoing/incoming supervisors.
 *   3. Single flat payload shape — no discriminated union; recipient kind is
 *      already encoded by which audience FK is set on the Notification row.
 *
 * @derives(F-007 scope round-2 v11 §3 picks 1–4)
 * @derives(workflow-design-closure §7 Notification rules)
 * @derives(ADR-0009)
 * @derives(master-plan §G)
 */

import type { Prisma } from '@prisma/client';

import type { EventKind } from './notification-payload.js';

/**
 * One audience entry returned by the composer. The dispatcher handler turns
 * each entry into 1 or 2 Notification rows (per pick 5 — push + in_app_banner,
 * with `Worker.userId IS NULL` exception).
 *
 * @derives(F-007 scope round-2 v11 §3 pick 4)
 */
export type SupervisorChangeAudienceEntry =
  | {
      kind: 'worker';
      /** Worker.id — written to `audienceWorkerId` on the Notification row. */
      workerId: string;
      /** Worker.userId — null if worker has no linked User. Drives the push-skip exception. */
      userId: string | null;
      /** Locale code for template rendering. Falls back to 'hi' if unset. */
      lang: string;
      workerName: string;
    }
  | {
      kind: 'supervisor';
      /** User.id — written to `audienceUserId` on the Notification row. */
      userId: string;
      /** Locale code for template rendering. */
      lang: string;
      userName: string | null;
      /** 'outgoing' or 'incoming' for messageKey selection. */
      role: 'outgoing' | 'incoming';
    };

/** @derives(F-007 scope round-2 v11 §3 picks 1 + 4) */
export type ComposeSupervisorChangeNotificationsInput = {
  companyId: string;
  siteId: string;
  /** Point-in-time at which audience is resolved (the binding-event timestamp). */
  effectiveAt: Date;
  /** From the source AuditEvent payload. May be NULL on first-ever binding. */
  outgoingSupervisorId: string | null;
  /** From the source AuditEvent payload. Never NULL on the events F-007 subscribes to. */
  incomingSupervisorId: string;
  /** Acting-end specifically may end up with no permanent supervisor at effectiveUntil. */
  eventKind: EventKind;
};

/** @derives(F-007 scope round-2 v11 §3 pick 4) */
export type ComposedSupervisorChangeAudience = {
  workers: Extract<SupervisorChangeAudienceEntry, { kind: 'worker' }>[];
  outgoing: Extract<SupervisorChangeAudienceEntry, { kind: 'supervisor' }> | null;
  incoming: Extract<SupervisorChangeAudienceEntry, { kind: 'supervisor' }> | null;
};

const DEFAULT_LANG = 'hi';

/**
 * Resolve the audience for a single `supervisor_change` source event.
 *
 * Returns a structure the handler INSERTs against. Does NOT write any rows
 * or emit any audits. The handler decides how to materialise rows per pick 5
 * (channel set + `Worker.userId IS NULL` exception) and pick 7 (idempotent
 * INSERT via the partial unique index).
 *
 * Multi-site bursts (e.g. 8 sites bound to one acting supervisor in one HR
 * session) produce N source events → N independent composer calls. F-007 does
 * NOT coalesce; supervisor burst grouping is presentation-side (F-006 UI or
 * optional future F-007b digest).
 *
 * @derives(F-007 scope round-2 v11 §3 picks 1–4)
 * @derives(workflow-design-closure §7 Notification rules audience)
 */
export async function composeSupervisorChangeNotifications(
  tx: Prisma.TransactionClient,
  input: ComposeSupervisorChangeNotificationsInput,
): Promise<ComposedSupervisorChangeAudience> {
  // (a) Workers ACTIVE on this site at effectiveAt — grouped by worker so we
  //     emit one entry per distinct worker (a worker with multiple shifts on
  //     the same site is still one notification target per site per event).
  const assignments = await tx.assignment.findMany({
    where: {
      companyId: input.companyId,
      siteId: input.siteId,
      state: 'ACTIVE',
    },
    select: {
      worker: {
        select: {
          id: true,
          name: true,
          userId: true,
          preferredLanguage: true,
        },
      },
    },
  });

  const byWorker = new Map<string, Extract<SupervisorChangeAudienceEntry, { kind: 'worker' }>>();
  for (const a of assignments) {
    if (!a.worker) continue;
    if (byWorker.has(a.worker.id)) continue;
    byWorker.set(a.worker.id, {
      kind: 'worker',
      workerId: a.worker.id,
      userId: a.worker.userId,
      lang: a.worker.preferredLanguage || DEFAULT_LANG,
      workerName: a.worker.name,
    });
  }

  // (b) Outgoing supervisor — may be null on first-ever-binding HANDOFF_PACKAGE_GENERATED
  //     (no prior supervisor to notify).
  let outgoing: Extract<SupervisorChangeAudienceEntry, { kind: 'supervisor' }> | null = null;
  if (input.outgoingSupervisorId) {
    const user = await tx.user.findUnique({
      where: { id: input.outgoingSupervisorId },
      select: { id: true, name: true, locale: true },
    });
    if (user) {
      outgoing = {
        kind: 'supervisor',
        userId: user.id,
        lang: user.locale || DEFAULT_LANG,
        userName: user.name,
        role: 'outgoing',
      };
    }
  }

  // (c) Incoming supervisor — never null on the events F-007 subscribes to
  //     (HANDOFF_PACKAGE_GENERATED always has the new supervisor; BINDING_ENDED_AUTO
  //     resolves the resuming permanent supervisor via getEffectiveBinding upstream).
  //
  //     EXCEPT acting-end edge case (Open Q4 — documented in F-007 scope §4):
  //     if no permanent binding exists at effectiveUntil + 1ms, the upstream
  //     handler skips the entire notification (warning logged; no rows). The
  //     composer treats this as a missing-incoming-user case by returning null,
  //     and the handler decides.
  let incoming: Extract<SupervisorChangeAudienceEntry, { kind: 'supervisor' }> | null = null;
  const incomingUser = await tx.user.findUnique({
    where: { id: input.incomingSupervisorId },
    select: { id: true, name: true, locale: true },
  });
  if (incomingUser) {
    incoming = {
      kind: 'supervisor',
      userId: incomingUser.id,
      lang: incomingUser.locale || DEFAULT_LANG,
      userName: incomingUser.name,
      role: 'incoming',
    };
  }

  return {
    workers: [...byWorker.values()],
    outgoing,
    incoming,
  };
}
