/**
 * SiteSupervisorBinding service layer.
 *
 * P1.5 narrow scope: only the helpers + service operations actually exercised
 * by this slice's tests. Routing/query rewires, HR portal UI, bootstrap-seed,
 * cron sweep, and HandoffPackage composer are NOT here — they land in later
 * slices.
 *
 * @derives(supervisor-responsibility-model §7 + §5.8)
 * @derives(workflow-design-closure §4 + §3.1 + §3.7)
 * @derives(panel-2026-05-15) — Layer 1 P1.5 helpers
 */

import type { Prisma } from '@prisma/client';
import {
  BindingCreatedPayloadSchema,
  BindingEndedManualPayloadSchema,
  BindingEndedSupersededByPermanentPayloadSchema,
  BindingEndedAutoPayloadSchema,
  HandoffPackageGeneratedPayloadSchema,
  type BindingCreatedPayload,
  type BindingEndedManualPayload,
  type BindingEndedSupersededByPermanentPayload,
  type BindingEndedAutoPayload,
  type HandoffPackageGeneratedPayload,
  type HandoffPackagePayload,
} from '@axhy/shared-schema';

import { recordAuditEvent } from './audit-event.js';
import { assertNotChangingTodaysResponsibility } from './same-day-freeze.js';
import { composeHandoffPackage } from './handoff-package-composer.js';
import { writeHandoffPackage } from './handoff-package-writer.js';

// ---------------------------------------------------------------------------
// Typed audit-emit helpers — BINDING_* kinds
// ---------------------------------------------------------------------------

/** @derives(ADR-0003) — schema-derived; @derives(master-plan §L) — bug-prevention discipline */
export type RecordBindingCreatedInput = {
  companyId: string;
  actorId: string;
  payload: BindingCreatedPayload;
};

/** @derives(ADR-0003) — schema-derived; @derives(master-plan §L) — bug-prevention discipline */
export async function recordBindingCreated(
  tx: Prisma.TransactionClient,
  input: RecordBindingCreatedInput,
): Promise<void> {
  const payload = BindingCreatedPayloadSchema.parse(input.payload);
  await recordAuditEvent(tx, {
    companyId: input.companyId,
    kind: 'BINDING_CREATED',
    actorId: input.actorId,
    targetId: payload.bindingId,
    payload: payload as Prisma.InputJsonValue,
  });
}

/** @derives(ADR-0003) — schema-derived; @derives(master-plan §L) — bug-prevention discipline */
export type RecordBindingEndedManualInput = {
  companyId: string;
  actorId: string;
  payload: BindingEndedManualPayload;
};

/** @derives(ADR-0003) — schema-derived; @derives(master-plan §L) — bug-prevention discipline */
export async function recordBindingEndedManual(
  tx: Prisma.TransactionClient,
  input: RecordBindingEndedManualInput,
): Promise<void> {
  const payload = BindingEndedManualPayloadSchema.parse(input.payload);
  await recordAuditEvent(tx, {
    companyId: input.companyId,
    kind: 'BINDING_ENDED_MANUAL',
    actorId: input.actorId,
    targetId: payload.bindingId,
    payload: payload as Prisma.InputJsonValue,
  });
}

/**
 * Typed audit-emit helper for BINDING_ENDED_AUTO. Used by the F-003
 * `binding-expire-sweep` cron job. Validates payload via Zod before insert.
 *
 * @derives(ADR-0003) — schema-derived; @derives(master-plan §L) — bug-prevention discipline
 */
export type RecordBindingEndedAutoInput = {
  companyId: string;
  actorId: string;
  payload: BindingEndedAutoPayload;
};

/** @derives(ADR-0003) — schema-derived; @derives(master-plan §L) — bug-prevention discipline */
export async function recordBindingEndedAuto(
  tx: Prisma.TransactionClient,
  input: RecordBindingEndedAutoInput,
): Promise<{ id: string }> {
  const payload = BindingEndedAutoPayloadSchema.parse(input.payload);
  return recordAuditEvent(tx, {
    companyId: input.companyId,
    kind: 'BINDING_ENDED_AUTO',
    actorId: input.actorId,
    targetId: payload.bindingId,
    payload: payload as Prisma.InputJsonValue,
  });
}

/** @derives(ADR-0003) — schema-derived; @derives(master-plan §L) — bug-prevention discipline */
export type RecordBindingEndedSupersededByPermanentInput = {
  companyId: string;
  actorId: string;
  payload: BindingEndedSupersededByPermanentPayload;
};

/** @derives(ADR-0003) — schema-derived; @derives(master-plan §L) — bug-prevention discipline */
export async function recordBindingEndedSupersededByPermanent(
  tx: Prisma.TransactionClient,
  input: RecordBindingEndedSupersededByPermanentInput,
): Promise<void> {
  const payload = BindingEndedSupersededByPermanentPayloadSchema.parse(input.payload);
  await recordAuditEvent(tx, {
    companyId: input.companyId,
    kind: 'BINDING_ENDED_SUPERSEDED_BY_PERMANENT',
    actorId: input.actorId,
    targetId: payload.bindingId,
    payload: payload as Prisma.InputJsonValue,
  });
}

/**
 * Typed audit-emit helper for HANDOFF_PACKAGE_GENERATED. Used by the F-004
 * `writeHandoffPackage` writer. Validates payload via Zod before insert.
 *
 * @derives(ADR-0003) — schema-derived; @derives(F-004 scope round-4 v4)
 */
export type RecordHandoffPackageGeneratedInput = {
  companyId: string;
  actorId: string;
  payload: HandoffPackageGeneratedPayload;
};

/** @derives(ADR-0003) — schema-derived; @derives(F-004 scope round-4 v4) */
export async function recordHandoffPackageGenerated(
  tx: Prisma.TransactionClient,
  input: RecordHandoffPackageGeneratedInput,
): Promise<{ id: string }> {
  const payload = HandoffPackageGeneratedPayloadSchema.parse(input.payload);
  return recordAuditEvent(tx, {
    companyId: input.companyId,
    kind: 'HANDOFF_PACKAGE_GENERATED',
    actorId: input.actorId,
    targetId: payload.bindingId,
    payload: payload as Prisma.InputJsonValue,
  });
}

// ---------------------------------------------------------------------------
// Service helper: reassignPermanentBinding
//
// Atomic three-step operation:
//   (1) find the permanent binding effective at the requested cutover instant
//       (effectiveFrom <= cutover < COALESCE(effectiveUntil, +infinity),
//        endedAt IS NULL, actingForUserId IS NULL);
//   (2) bound its planned end by setting effectiveUntil = cutover instant
//       (NOT endedAt — endedAt is reserved for manual early termination /
//       correction / actual after-the-fact ending; supersession via permanent
//       reassignment uses effectiveUntil so the old row stays "active" until
//       the cutover moment, supporting future-dated handoffs);
//   (3) insert the new permanent binding with effectiveFrom = cutover instant.
// Emits BINDING_ENDED_SUPERSEDED_BY_PERMANENT on the old row +
// BINDING_CREATED on the new row, both inside the same transaction.
//
// The old + new rows are temporally adjacent but disjoint thanks to the
// EXCLUDE constraint's half-open tstzrange ([effectiveFrom, effectiveUntil)
// with the new row's [cutover, ...) starting exactly where the old row ends).
//
// Caller is responsible for opening the transaction (typically via
// withTenantContext). Throws if no permanent binding is effective at the
// requested cutover instant for the site — use the raw create path for the
// first-ever binding or for a future binding before any predecessor exists.
// ---------------------------------------------------------------------------

// ===========================================================================
// First-bind path — createPermanentBinding (P1.5b 2026-05-17)
// ===========================================================================
//
// reassignPermanentBinding (below) assumes a prior PERMANENT binding exists
// to supersede. The file's earlier comment block anticipated a first-ever-
// create path; this is it.
//
// Genuinely reusable by both bootstrap-seed (with explicit freeze bypass) and
// future HR portal first-bind UI (subject to the shipped same-day freeze).
//
// Helper contract (P1.5b plan rev-4 §S2):
//   * Idempotency: anchored to the requested binding window via $queryRaw,
//     structurally mirroring the shipped EXCLUDE constraint from migration
//     20260516 (line 131-138): both sides of the overlap use
//     COALESCE(effectiveUntil, 'infinity'::timestamptz). Returns
//     { kind: 'WINDOW_OVERLAP', conflictingBindingId } on collision; never
//     throws on collision.
//   * Freeze (Q3=C):
//       - opts.tenantTimeZone !== null  -> calls assertNotChangingTodaysResponsibility
//         unconditionally. First-bind is NOT special; HR portal callers must
//         choose effectiveFrom >= next tenant-local midnight.
//       - opts.tenantTimeZone === null  -> requires opts.bypassFreezeReason in
//         the enum ('BOOTSTRAP_SEED' | 'DATA_MIGRATION'). Otherwise throws.
//         Recorded permanently in the audit payload so the bypass is visible.
//   * Audit: exactly one BINDING_CREATED emit on CREATED (with bypassFreezeReason
//     field on payload, null when freeze was enforced). No emit on WINDOW_OVERLAP.
//   * Concurrency: catches Postgres exclusion_violation (SQLSTATE 23P01) on the
//     INSERT race-loser, re-runs the same idempotency $queryRaw, and returns
//     WINDOW_OVERLAP. If the re-read finds no conflict, the original error was
//     something else and is re-thrown.
//   * Logging: helper does NOT call any logger. Telemetry lives in the audit
//     row's bypassFreezeReason + the typed return. Callers log on their side.
//   * Skip handoff: no composeHandoffPackage / writeHandoffPackage call here.
//     No outgoing supervisor on first-bind path; Q2=(b) zero-summary applies
//     (see existing comment near reassignPermanentBinding's Mechanism Z note).
//   * Callers allowed:
//       - Bootstrap-seed script: tenantTimeZone:null + bypassFreezeReason:'BOOTSTRAP_SEED'
//       - Future HR portal first-bind route: tenantTimeZone:<tz>, no bypass
//     No route handler may pass tenantTimeZone:null — enforced by runtime
//     check + code review. This JSDoc explicitly names the rule.
// ---------------------------------------------------------------------------

/** @derives(ADR-0003) — schema-derived; @derives(master-plan §G) — HR control plane */
/** @derives(supervisor-responsibility-model §7 + Amendments 2026-05-17 A-4) */
export type CreatePermanentBindingInput = {
  companyId: string;
  siteId: string;
  userId: string;
  effectiveFrom: Date;
  /** null or omitted = open-ended (PERMANENT may be open-ended; CHECK at
   *  schema.prisma:1037 allows it). */
  effectiveUntil?: Date | null;
  reason: string;
  /** Plain UUID per the audit-trail durability convention
   *  (schema.prisma:1042 — createdBy has no FK to User so the row survives
   *  user deletes). Bootstrap uses '00000000-0000-0000-0000-000000000000'. */
  createdBy: string;
};

/** @derives(ADR-0003) @derives(master-plan §G) @derives(supervisor-responsibility-model §7 + Amendments 2026-05-17 A-3 + A-4) */
export type CreatePermanentBindingOpts = {
  /** IANA timezone (e.g. 'Asia/Kolkata'). Non-null enforces the shipped
   *  same-day freeze unconditionally — first-bind is NOT special (Q3=C).
   *  Null is the documented seed/migration bypass; requires bypassFreezeReason. */
  tenantTimeZone: string | null;
  /** REQUIRED iff tenantTimeZone is null. Enum-restricted to prevent ad-hoc
   *  bypass reasons. Recorded permanently on the BINDING_CREATED audit row. */
  bypassFreezeReason?: 'BOOTSTRAP_SEED' | 'DATA_MIGRATION';
  /** Defaults to new Date(). Tests pass a fixed Date for determinism. */
  now?: Date;
};

/** @derives(ADR-0003) @derives(master-plan §G) @derives(supervisor-responsibility-model Amendments 2026-05-17 A-4) */
export type CreatePermanentBindingResult =
  | { kind: 'CREATED'; bindingId: string }
  | { kind: 'WINDOW_OVERLAP'; conflictingBindingId: string };

/**
 * First-ever-create write path for a PERMANENT SiteSupervisorBinding.
 * See the contract block above for full lifecycle semantics.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / responsibility model
 * @derives(supervisor-responsibility-model §7 + Amendments 2026-05-17 A-4)
 */
export async function createPermanentBinding(
  tx: Prisma.TransactionClient,
  input: CreatePermanentBindingInput,
  opts: CreatePermanentBindingOpts,
): Promise<CreatePermanentBindingResult> {
  const now = opts.now ?? new Date();

  // ---- Freeze (Q3=C): non-null tz enforces; null tz requires enum bypass.
  if (opts.tenantTimeZone === null) {
    if (!opts.bypassFreezeReason) {
      throw new Error(
        'createPermanentBinding: tenantTimeZone is null but bypassFreezeReason was not provided — this path is reserved for bootstrap/migration scripts',
      );
    }
    // Null path: skip the freeze, but record the bypass reason permanently
    // in the audit payload below.
  } else {
    assertNotChangingTodaysResponsibility({
      now,
      tenantTimeZone: opts.tenantTimeZone,
      effectiveFrom: input.effectiveFrom,
      effectiveUntil: input.effectiveUntil ?? null,
    });
  }

  // ---- Idempotency check: window-overlap against requested [effectiveFrom,
  // effectiveUntil) using the same COALESCE(...,'infinity'::timestamptz) form
  // the shipped EXCLUDE constraint uses (migration 20260516 line 131-138).
  // Prisma does not model tstzrange, so this is a raw query. Both sides of
  // the && operator mirror the constraint exactly so the helper's check is
  // provably equivalent.
  const overlapRows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id::text AS id
    FROM "axhy"."SiteSupervisorBinding"
    WHERE "companyId" = ${input.companyId}::uuid
      AND "siteId" = ${input.siteId}::uuid
      AND "actingForUserId" IS NULL
      AND "endedAt" IS NULL
      AND tstzrange("effectiveFrom", COALESCE("effectiveUntil", 'infinity'::timestamptz), '[)')
          && tstzrange(${input.effectiveFrom}::timestamptz,
                       COALESCE(${input.effectiveUntil ?? null}::timestamptz, 'infinity'::timestamptz),
                       '[)')
    LIMIT 1
  `;
  const firstOverlap = overlapRows[0];
  if (firstOverlap) {
    return { kind: 'WINDOW_OVERLAP', conflictingBindingId: firstOverlap.id };
  }

  // ---- Insert. The DB EXCLUDE constraint backs up the idempotency check;
  // a concurrent caller that races between our SELECT and INSERT will lose
  // here with SQLSTATE 23P01.
  let createdRow: { id: string };
  try {
    const row = await tx.siteSupervisorBinding.create({
      data: {
        companyId: input.companyId,
        siteId: input.siteId,
        userId: input.userId,
        actingForUserId: null,
        effectiveFrom: input.effectiveFrom,
        effectiveUntil: input.effectiveUntil ?? null,
        reason: input.reason,
        createdBy: input.createdBy,
        // handoffPackage stays null on first-bind (Q2=(b) zero-summary).
      },
      select: { id: true },
    });
    createdRow = row;
  } catch (err: unknown) {
    if (isPostgresExclusionViolation(err)) {
      // Re-run the same idempotency check to find the winning row.
      const reread = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id::text AS id
        FROM "axhy"."SiteSupervisorBinding"
        WHERE "companyId" = ${input.companyId}::uuid
          AND "siteId" = ${input.siteId}::uuid
          AND "actingForUserId" IS NULL
          AND "endedAt" IS NULL
          AND tstzrange("effectiveFrom", COALESCE("effectiveUntil", 'infinity'::timestamptz), '[)')
              && tstzrange(${input.effectiveFrom}::timestamptz,
                           COALESCE(${input.effectiveUntil ?? null}::timestamptz, 'infinity'::timestamptz),
                           '[)')
        LIMIT 1
      `;
      const firstReread = reread[0];
      if (firstReread) {
        return { kind: 'WINDOW_OVERLAP', conflictingBindingId: firstReread.id };
      }
      // Re-read found nothing: the original error was not actually our overlap
      // (concurrent caller already rolled back?). Re-throw so the caller sees it.
    }
    throw err;
  }

  // ---- Audit emit on CREATED only.
  await recordBindingCreated(tx, {
    companyId: input.companyId,
    actorId: input.createdBy,
    payload: {
      bindingId: createdRow.id,
      siteId: input.siteId,
      userId: input.userId,
      actingForUserId: null,
      kind: 'PERMANENT',
      effectiveFrom: input.effectiveFrom.toISOString(),
      effectiveUntil: input.effectiveUntil ? input.effectiveUntil.toISOString() : null,
      reason: input.reason,
      createdBy: input.createdBy,
      bypassFreezeReason: opts.bypassFreezeReason ?? null,
    },
  });

  return { kind: 'CREATED', bindingId: createdRow.id };
}

/**
 * Detect Postgres exclusion_violation (SQLSTATE 23P01). Prisma surfaces
 * native Postgres errors via PrismaClientKnownRequestError with .meta.code
 * for some shapes, or raw on .code for others; check both. Also matches
 * a SQLSTATE substring in the error message as a last resort.
 *
 * Panel-polish 2026-05-17 P2 #1: SQLSTATE-only — earlier draft included a
 * textual "exclusion constraint" fallback which is too broad and could
 * false-positive on unrelated errors that happen to mention the phrase.
 */
function isPostgresExclusionViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  // Direct Postgres-driver code
  const direct = (err as { code?: unknown }).code;
  if (direct === '23P01') return true;
  // Prisma-wrapped
  const meta = (err as { meta?: { code?: unknown } }).meta;
  if (meta && meta.code === '23P01') return true;
  // Some drivers stuff the SQLSTATE into the message itself
  const msg = (err as { message?: unknown }).message;
  if (typeof msg === 'string' && msg.includes('23P01')) return true;
  return false;
}

/** @derives(ADR-0003) — schema-derived; @derives(master-plan §G) — HR control plane */
export type ReassignPermanentBindingInput = {
  companyId: string;
  siteId: string;
  newUserId: string;
  effectiveFrom: Date;
  effectiveUntil?: Date | null;
  reason: string;
  reassignedBy: string;
  /**
   * IANA timezone for the tenant. Defaults to {@link DEFAULT_TENANT_TIME_ZONE}
   * (Asia/Kolkata) inside {@link assertNotChangingTodaysResponsibility} until
   * Company.timeZone lands in the schema. Pass `null` ONLY in seed/migration
   * paths that bypass the S-001 freeze deliberately; HTTP routes must never
   * pass `null`.
   */
  tenantTimeZone?: string;
};

/** @derives(ADR-0003) — schema-derived; @derives(master-plan §G) — HR control plane */
export type ReassignPermanentBindingResult = {
  endedBindingId: string;
  newBindingId: string;
};

/** @derives(ADR-0003) — schema-derived; @derives(master-plan §G) — HR control plane */
export async function reassignPermanentBinding(
  tx: Prisma.TransactionClient,
  input: ReassignPermanentBindingInput,
): Promise<ReassignPermanentBindingResult> {
  const cutover = input.effectiveFrom;

  // S-001 same-day supervisor-freeze: the cutover instant is BOTH the new
  // binding's effectiveFrom AND the old binding's effectiveUntil. A single
  // check on `effectiveFrom` covers both sides because they are the same
  // moment. effectiveUntil on the new row (optional planned end) is naturally
  // >= effectiveFrom and therefore also after tomorrow-midnight, so does not
  // need a separate check here.
  assertNotChangingTodaysResponsibility({
    effectiveFrom: cutover,
    effectiveUntil: input.effectiveUntil ?? null,
    tenantTimeZone: input.tenantTimeZone,
  });

  const prior = await tx.siteSupervisorBinding.findFirst({
    where: {
      companyId: input.companyId,
      siteId: input.siteId,
      actingForUserId: null,
      endedAt: null,
      effectiveFrom: { lte: cutover },
      OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: cutover } }],
    },
    orderBy: { effectiveFrom: 'desc' },
  });

  if (!prior) {
    throw new Error(
      `reassignPermanentBinding: no permanent binding is effective at ${cutover.toISOString()} for site ${input.siteId}`,
    );
  }

  // Bound the old row's planned end at the cutover instant.
  // We do NOT touch endedAt — that field is reserved for manual early
  // termination / correction. The old row stays "active" (endedAt IS NULL)
  // until the cutover instant, when its effectiveUntil takes over.
  await tx.siteSupervisorBinding.update({
    where: { id: prior.id },
    data: { effectiveUntil: cutover },
  });

  // F-004 — compose the bucket-2 frozen snapshot BEFORE the new binding row
  // create so it lands in the same atomic tx that creates the row. The
  // outgoing supervisor is the prior row's userId (NOT NULL here — we
  // already errored above if no prior binding was effective at the cutover).
  const handoffPackage: HandoffPackagePayload = await composeHandoffPackage(tx, {
    companyId: input.companyId,
    siteId: input.siteId,
    outgoingSupervisorId: prior.userId,
    incomingSupervisorId: input.newUserId,
    at: cutover,
  });

  const newRow = await tx.siteSupervisorBinding.create({
    data: {
      companyId: input.companyId,
      siteId: input.siteId,
      userId: input.newUserId,
      actingForUserId: null,
      effectiveFrom: cutover,
      effectiveUntil: input.effectiveUntil ?? null,
      reason: input.reason,
      createdBy: input.reassignedBy,
      handoffPackage: handoffPackage as unknown as Prisma.InputJsonValue,
    },
  });

  // F-004 mechanism Z — permanent rebind path:
  //   1) Copy outgoing's site-scoped L3 siteRules into incoming's LivingDoc
  //      (preserving scope.siteId; source.pattern = "handover_from_<outgoingId>")
  //   2) Emit 1× HANDOFF_PACKAGE_GENERATED audit (always)
  //   3) Q2 = (b): NO freeNotes summary entry (regardless of first-ever or
  //      outgoing-exists — wait, this branch has outgoing; Q2 only governs
  //      first-ever which goes through the plain-create path elsewhere).
  //      In reassignPermanentBinding the outgoing supervisor exists by
  //      construction (we errored above if not), so Q2 = (b) doesn't
  //      kick in here. The Q2 = (b) zero-summary rule applies only to
  //      first-ever bindings, which never go through reassignPermanentBinding.
  await writeHandoffPackage(tx, {
    bindingId: newRow.id,
    companyId: input.companyId,
    siteId: input.siteId,
    outgoingSupervisorId: prior.userId,
    incomingSupervisorId: input.newUserId,
    payload: handoffPackage,
    kind: 'PERMANENT',
    actorId: input.reassignedBy,
  });

  await recordBindingEndedSupersededByPermanent(tx, {
    companyId: input.companyId,
    actorId: input.reassignedBy,
    payload: {
      bindingId: prior.id,
      siteId: input.siteId,
      previousUserId: prior.userId,
      newBindingId: newRow.id,
      newUserId: input.newUserId,
      supersededAt: cutover.toISOString(),
      reassignedBy: input.reassignedBy,
      reason: input.reason,
    },
  });

  await recordBindingCreated(tx, {
    companyId: input.companyId,
    actorId: input.reassignedBy,
    payload: {
      bindingId: newRow.id,
      siteId: input.siteId,
      userId: input.newUserId,
      actingForUserId: null,
      kind: 'PERMANENT',
      effectiveFrom: cutover.toISOString(),
      effectiveUntil: input.effectiveUntil?.toISOString() ?? null,
      reason: input.reason,
      createdBy: input.reassignedBy,
    },
  });

  return { endedBindingId: prior.id, newBindingId: newRow.id };
}
