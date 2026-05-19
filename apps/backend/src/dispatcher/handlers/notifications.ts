/**
 * F-007 round-2 v11 — `notification.supervisor_change` outbox handler.
 *
 * Pattern A — outbox emit inside source tx; this handler runs on the
 * dispatcher tick AFTER F-003's `binding-expire-sweep` or F-004's
 * `writeHandoffPackage` already committed the source binding write + audit
 * emit + outbox row.
 *
 * **Logic (v11 simple INSERT-or-skip):**
 *   1. Parse outbox payload.
 *   2. Look up source AuditEvent + binding row.
 *   3. Derive effectiveAt from the binding (event-time, not handler-time).
 *   4. Resolve audience via `composeSupervisorChangeNotifications`.
 *   5. For each (recipient × channel) pair, INSERT one Notification row.
 *      Catch P2002 from the partial unique index → log idempotent_skip,
 *      continue. No FOR UPDATE, no merge logic, no event-time math.
 *
 * **Out of scope (deferred):**
 *   * Real push delivery → F-011 (OneSignal SDK + delivery adapter).
 *   * In-app banner UI → F-006 (our own panel; reads OUR Notification table).
 *   * SMS/WhatsApp → F-012 (paid).
 *   * `WORKER_SUPERVISOR_CHANGE_NOTIFIED` audit emit → F-011 (at delivery
 *     time, not at persistence time).
 *
 * @derives(F-007 scope round-2 v11 §3 picks 1–8)
 * @derives(workflow-design-closure Decision 4 — worker supervisor-change)
 * @derives(ADR-0009)
 * @derives(master-plan §G)
 */

import type { FastifyBaseLogger } from 'fastify';
import { Prisma, PrismaClient } from '@prisma/client';

import {
  composeSupervisorChangeNotifications,
  type ComposedSupervisorChangeAudience,
  type SupervisorChangeAudienceEntry,
} from '../../lib/notification-composer.js';
import {
  SupervisorChangeOutboxPayloadSchema,
  escapeMessageVar,
  type EventKind,
  type SupervisorChangeNotificationPayload,
} from '../../lib/notification-payload.js';

const prisma = new PrismaClient();

/** v11 round-1 channel set per pick 5. */
const ALL_CHANNELS: ReadonlyArray<'push' | 'in_app_banner'> = ['push', 'in_app_banner'];

/**
 * Compute the channels for one audience entry per pick 5.
 *   * Supervisors: push + in_app_banner.
 *   * Workers with linked User: push + in_app_banner.
 *   * Workers without linked User (`Worker.userId IS NULL`): in_app_banner only.
 */
function channelsFor(
  entry: SupervisorChangeAudienceEntry,
): ReadonlyArray<'push' | 'in_app_banner'> {
  if (entry.kind === 'worker' && entry.userId === null) {
    return ['in_app_banner'];
  }
  return ALL_CHANNELS;
}

/** messageKey: `supervisor_change.<eventKind>.<recipientRole>`. */
function deriveMessageKey(eventKind: EventKind, entry: SupervisorChangeAudienceEntry): string {
  if (entry.kind === 'worker') {
    return `supervisor_change.${eventKind}.worker`;
  }
  return `supervisor_change.${eventKind}.supervisor_${entry.role}`;
}

function buildMessageVars(
  entry: SupervisorChangeAudienceEntry,
  context: {
    outgoingName: string | null;
    incomingName: string;
    siteName: string;
    effectiveAt: string;
  },
): Record<string, string> {
  const vars: Record<string, string> = {
    outgoingName: escapeMessageVar(context.outgoingName ?? ''),
    incomingName: escapeMessageVar(context.incomingName),
    siteName: escapeMessageVar(context.siteName),
    effectiveAt: context.effectiveAt,
    lang: entry.lang,
  };
  if (entry.kind === 'worker') {
    vars.workerName = escapeMessageVar(entry.workerName);
  } else if (entry.userName) {
    vars.userName = escapeMessageVar(entry.userName);
  }
  return vars;
}

function audienceUserIdFor(entry: SupervisorChangeAudienceEntry): string | null {
  return entry.kind === 'supervisor' ? entry.userId : null;
}

function audienceWorkerIdFor(entry: SupervisorChangeAudienceEntry): string | null {
  return entry.kind === 'worker' ? entry.workerId : null;
}

/**
 * Outbox handler for `notification.supervisor_change`.
 *
 * @derives(F-007 scope round-2 v11 §3 picks 1, 2, 5, 7)
 * @derives(workflow-design-closure §7 Notification rules)
 */
export async function handleNotificationSupervisorChange(
  payload: unknown,
  log: FastifyBaseLogger,
): Promise<void> {
  const parsed = SupervisorChangeOutboxPayloadSchema.parse(payload);

  // (1) Load source AuditEvent + binding (read-only outside tx).
  const audit = await prisma.auditEvent.findUnique({
    where: { id: parsed.sourceAuditId },
    select: { id: true, companyId: true, kind: true, createdAt: true },
  });
  if (!audit) {
    log.warn({ payload: parsed }, 'notification.supervisor_change: source audit not found');
    return;
  }

  const binding = await prisma.siteSupervisorBinding.findUnique({
    where: { id: parsed.bindingId },
    select: {
      id: true,
      companyId: true,
      siteId: true,
      effectiveFrom: true,
      effectiveUntil: true,
    },
  });
  if (!binding) {
    log.warn({ payload: parsed }, 'notification.supervisor_change: source binding not found');
    return;
  }

  // (2) Cross-tenant safety: source audit + binding must share companyId.
  //     Defensive — should be guaranteed by upstream emit logic, but cheap to assert.
  if (audit.companyId !== binding.companyId) {
    log.error(
      { payload: parsed, auditCompanyId: audit.companyId, bindingCompanyId: binding.companyId },
      'notification.supervisor_change: cross-tenant audit/binding mismatch — refusing to dispatch',
    );
    return;
  }

  // (3) Derive effectiveAt per eventKind:
  //     - acting_start / permanent_rebind (HANDOFF_PACKAGE_GENERATED) → effectiveFrom.
  //     - acting_end (BINDING_ENDED_AUTO) → effectiveUntil.
  let effectiveAt: Date;
  if (parsed.eventKind === 'acting_end') {
    if (!binding.effectiveUntil) {
      log.error(
        { payload: parsed },
        'notification.supervisor_change: acting_end event but binding.effectiveUntil is null',
      );
      return;
    }
    effectiveAt = binding.effectiveUntil;
  } else {
    effectiveAt = binding.effectiveFrom;
  }

  // (4) Read source-audit payload to derive outgoing / incoming supervisor ids.
  //     For HANDOFF_PACKAGE_GENERATED: payload has outgoingSupervisorId + incomingSupervisorId.
  //     For BINDING_ENDED_AUTO: the binding's userId is outgoing; incoming is the resuming
  //     permanent supervisor at effectiveUntil + 1ms (resolved via getEffectiveBinding upstream).
  //     We re-read the audit row's payload here to get whatever the producer wrote.
  const auditRow = await prisma.auditEvent.findUnique({
    where: { id: parsed.sourceAuditId },
    select: { payload: true, kind: true },
  });
  if (!auditRow) {
    log.warn(
      { payload: parsed },
      'notification.supervisor_change: source audit not found on re-read',
    );
    return;
  }

  let outgoingSupervisorId: string | null = null;
  let incomingSupervisorId: string | null = null;
  const auditPayload = auditRow.payload as Record<string, unknown> | null;
  if (auditPayload) {
    if (auditRow.kind === 'HANDOFF_PACKAGE_GENERATED') {
      outgoingSupervisorId =
        typeof auditPayload.outgoingSupervisorId === 'string'
          ? auditPayload.outgoingSupervisorId
          : null;
      incomingSupervisorId =
        typeof auditPayload.incomingSupervisorId === 'string'
          ? auditPayload.incomingSupervisorId
          : null;
    } else if (auditRow.kind === 'BINDING_ENDED_AUTO') {
      // BINDING_ENDED_AUTO payload uses `userId` for the supervisor whose acting cover ended.
      outgoingSupervisorId = typeof auditPayload.userId === 'string' ? auditPayload.userId : null;
      // Incoming permanent supervisor — derive via point-in-time read at effectiveUntil + 1ms.
      const afterCutover = new Date(effectiveAt.getTime() + 1);
      const permanent = await prisma.siteSupervisorBinding.findFirst({
        where: {
          companyId: binding.companyId,
          siteId: binding.siteId,
          endedAt: null,
          actingForUserId: null,
          effectiveFrom: { lte: afterCutover },
          OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: afterCutover } }],
        },
        select: { userId: true },
      });
      incomingSupervisorId = permanent?.userId ?? null;
    }
  }

  if (!incomingSupervisorId) {
    // Open Q4 edge case — no permanent supervisor at acting-end. Skip notification entirely.
    log.warn(
      { payload: parsed, siteId: binding.siteId },
      'notification.supervisor_change: no incoming supervisor at effectiveAt — skipping (Open Q4)',
    );
    return;
  }

  // (5) Read siteName for messageVars. Cheap, cached at the DB.
  const site = await prisma.site.findUnique({
    where: { id: binding.siteId },
    select: { name: true },
  });
  const siteName = site?.name ?? '';

  // (6) Resolve audience.
  let audience: ComposedSupervisorChangeAudience;
  try {
    audience = await prisma.$transaction(async (tx) =>
      composeSupervisorChangeNotifications(tx, {
        companyId: binding.companyId,
        siteId: binding.siteId,
        effectiveAt,
        outgoingSupervisorId,
        incomingSupervisorId,
        eventKind: parsed.eventKind,
      }),
    );
  } catch (err) {
    log.error(
      { err, payload: parsed },
      'notification.supervisor_change: audience resolution failed',
    );
    throw err;
  }

  // (7) Materialise rows. For each (recipient × channel) → one INSERT.
  //     Catch P2002 → log idempotent_skip, continue.
  const recipients: SupervisorChangeAudienceEntry[] = [
    ...audience.workers,
    ...(audience.outgoing ? [audience.outgoing] : []),
    ...(audience.incoming ? [audience.incoming] : []),
  ];

  const outgoingName = audience.outgoing?.userName ?? null;
  const incomingName = audience.incoming?.userName ?? '';

  let inserted = 0;
  let skipped = 0;

  for (const entry of recipients) {
    const channels = channelsFor(entry);
    for (const channel of channels) {
      const notificationPayload: SupervisorChangeNotificationPayload = {
        schemaVersion: 1,
        messageKey: deriveMessageKey(parsed.eventKind, entry),
        messageVars: buildMessageVars(entry, {
          outgoingName,
          incomingName,
          siteName,
          effectiveAt: effectiveAt.toISOString(),
        }),
        eventKind: parsed.eventKind,
        bindingId: parsed.bindingId,
        outgoingSupervisorId,
        incomingSupervisorId,
        siteId: binding.siteId,
        sourceAuditId: parsed.sourceAuditId,
        effectiveAt: effectiveAt.toISOString(),
      };

      try {
        await prisma.notification.create({
          // raw-ok: dispatcher handler, not a route — no tenant tx
          data: {
            companyId: binding.companyId,
            audienceUserId: audienceUserIdFor(entry),
            audienceWorkerId: audienceWorkerIdFor(entry),
            kind: 'supervisor_change',
            channel,
            priority: 'STANDARD',
            payload: notificationPayload as unknown as Prisma.InputJsonValue,
            // scheduledAt defaults to now() in schema.
            // deliveredAt / failedAt / failureReason / ackedAt remain null (F-007 persistence-only).
          },
        });
        inserted += 1;
      } catch (err) {
        if (isPrismaUniqueViolation(err)) {
          log.info(
            {
              payload: parsed,
              recipient: entry,
              channel,
            },
            'notification.supervisor_change: idempotent_skip (P2002 on partial unique index)',
          );
          skipped += 1;
          continue;
        }
        throw err;
      }
    }
  }

  log.info(
    {
      payload: parsed,
      siteId: binding.siteId,
      effectiveAt: effectiveAt.toISOString(),
      audienceSize: recipients.length,
      inserted,
      skipped,
    },
    'notification.supervisor_change: handled',
  );
}

function isPrismaUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
