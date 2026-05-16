/**
 * SupervisorDecision lifecycle writer — single source of truth for transitions.
 *
 * Three operations:
 *   - `createProposedDecision`  — chat extractor writes a PROPOSED row inside
 *                                  the same tx as the assistant chat message
 *   - `applyProposedDecision`   — `/chat/apply` transitions PROPOSED → APPLIED
 *                                  via race-safe conditional updateMany
 *   - `dismissProposedDecision` — `POST /decisions/:id/dismiss` transitions
 *                                  PROPOSED → DISMISSED via race-safe updateMany
 *
 * State discriminator (per F-002 scope Q4=(b), no state ENUM yet):
 *   PROPOSED  → (appliedAt IS NULL  AND dismissedAt IS NULL)
 *   APPLIED   → (appliedAt IS NOT NULL)
 *   DISMISSED → (dismissedAt IS NOT NULL)
 *   appliedAt + dismissedAt mutually exclusive — enforced by DB CHECK
 *   constraint (migration 20260518) AND by conditional updateMany (this file).
 *
 * Concurrency model (rule P2, F-002.3 race fix):
 *   The transition operations DO NOT do `findUnique → check → update`. They
 *   use a SINGLE `updateMany` with the precondition in the WHERE clause:
 *     UPDATE WHERE id=? AND companyId=? AND appliedAt IS NULL AND dismissedAt IS NULL
 *   PostgreSQL row-level locking ensures only one of two concurrent UPDATEs
 *   for the same row matches the predicate (the second waits for the first
 *   to commit, then re-evaluates the WHERE — which now fails because the
 *   first transaction set one of the columns). The Prisma return `count` is
 *   the race-detection signal: count=1 means we won, count=0 means we lost.
 *   Research: https://www.postgresql.org/docs/current/transaction-iso.html
 *
 * Authorization (per F-002 scope §3b + §3c):
 *   Driven by DECISION_KIND_REGISTRY's routingMode:
 *     - 'worker-targeted' or 'site-targeted' → currently responsible supervisor
 *       at the routed site via F-001's helpers.
 *     - 'origin-only' → original supervisorId on the row.
 *   Single source of truth: shared-schema's DECISION_KIND_REGISTRY (F-002.1).
 *
 * SINGLE SOURCE OF TRUTH for SupervisorDecision lifecycle. Do not write to the
 * row directly outside this module unless you are writing this module.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / responsibility model
 * Linked specs (not parsed by the require-derives ESLint rule):
 *   - F-002 scope §3a + §3b + §3c
 *   - F-002 remediation §Fix 3 + §Fix 4 (race-safe + registry-driven)
 *   - workflow-design-closure §3.2 — SupervisorDecision lifecycle
 *   - supervisor-responsibility-model §5.4 — PROPOSED follows new responsible
 *   - production-grade-rulebook P1 (invariants enforced) + P2 (no check-then-act)
 */

import type { Prisma } from '@prisma/client';
import {
  decisionSpecByKind,
  decisionSpecByToolName,
  isBindingRoutable,
  type DwiTier,
  type RoutingMode,
} from '@axhy/shared-schema';

import { recordDwiProposed, recordDwiApplied, recordDwiDismissed } from './audit-event.js';
import {
  deriveWorkerPrimarySiteId,
  getEffectiveBinding,
  getEffectiveResponsibleUserId,
} from './effective-responsibility.js';

export type { DwiTier } from '@axhy/shared-schema';

// ===========================================================================
// createProposedDecision — F-002 §3a (unchanged from pre-remediation except
// for registry-driven tool lookup)
// ===========================================================================

/** @derives(F-002 scope §3a) */
export type CreateProposedDecisionInput = {
  /** Pre-generated UUID; flows back into the client's decisionCard so /chat/apply can find it. */
  decisionId: string;
  companyId: string;
  /** The originator user-id (req.auth.userId). */
  supervisorId: string;
  /** The propose_* tool name produced by the chat AI loop. */
  toolName: string;
  /** The tool's input fields, persisted on the row as `payload`. */
  fields: Record<string, unknown>;
  /** Chat thread + message that produced this proposal — for originContext + audit. */
  threadId: string;
  assistantMessageId: string;
};

/** @derives(F-002 scope §3a) */
export type CreateProposedDecisionResult = {
  decisionId: string;
  kind: string;
  tier: DwiTier;
  targetId: string | null;
  proposedDuringAbsence: boolean;
};

/**
 * Creates a PROPOSED SupervisorDecision row inside the caller's transaction.
 *
 * Tool → kind mapping is sourced from DECISION_KIND_REGISTRY (F-002.1). Unknown
 * tool names return null (caller may log; no row, no audit, no throw).
 *
 * proposedDuringAbsence (Q5): true iff effective binding for the routed site
 * is ACTING with actingForUserId === originator.
 *
 * originContext (Q1=b best-effort): chat ids + tool fields + capturedAt. Open
 * shape; consumers must defensive-parse.
 *
 * @derives(F-002 scope §3a, §7-Q1, §7-Q5)
 * @derives(F-002.1 — registry-driven tool lookup)
 * @derives(workflow-design-closure §3.2)
 */
export async function createProposedDecision(
  tx: Prisma.TransactionClient,
  input: CreateProposedDecisionInput,
): Promise<CreateProposedDecisionResult | null> {
  const spec = decisionSpecByToolName.get(input.toolName);
  if (!spec) return null;

  // Determine target field based on routing mode (drives both targetId pull
  // and proposedDuringAbsence detection).
  const targetField: 'workerId' | 'siteId' | null =
    spec.routingMode === 'worker-targeted'
      ? 'workerId'
      : spec.routingMode === 'site-targeted'
        ? 'siteId'
        : null;
  const targetId =
    targetField === null ? null : ((input.fields[targetField] as string | undefined) ?? null);

  // proposedDuringAbsence — only meaningful when we can route to a site.
  let proposedDuringAbsence = false;
  let routedSiteId: string | null = null;
  if (targetId) {
    if (targetField === 'workerId') {
      routedSiteId = await deriveWorkerPrimarySiteId(tx, {
        companyId: input.companyId,
        workerId: targetId,
      });
    } else if (targetField === 'siteId') {
      routedSiteId = targetId;
    }
  }
  if (routedSiteId) {
    const binding = await getEffectiveBinding(tx, {
      companyId: input.companyId,
      siteId: routedSiteId,
    });
    if (binding?.kind === 'ACTING' && binding.actingForUserId === input.supervisorId) {
      proposedDuringAbsence = true;
    }
  }

  const originContext = {
    sourceChatThreadId: input.threadId,
    sourceChatMessageId: input.assistantMessageId,
    fields: input.fields,
    capturedAt: new Date().toISOString(),
  };

  await tx.supervisorDecision.create({
    data: {
      id: input.decisionId,
      companyId: input.companyId,
      supervisorId: input.supervisorId,
      kind: spec.kind,
      tier: spec.tier,
      targetId,
      payload: input.fields as Prisma.InputJsonValue,
      ackRequired: spec.ackRequired,
      proposedDuringAbsence,
      originContext: originContext as Prisma.InputJsonValue,
      appliedAt: null,
    },
  });

  await recordDwiProposed(tx, {
    companyId: input.companyId,
    actorId: input.supervisorId,
    payload: {
      decisionId: input.decisionId,
      kind: spec.kind,
      tier: spec.tier,
      targetId,
      proposedDuringAbsence,
      ackRequired: spec.ackRequired,
      sourceChatThreadId: input.threadId,
      sourceChatMessageId: input.assistantMessageId,
    },
  });

  return {
    decisionId: input.decisionId,
    kind: spec.kind,
    tier: spec.tier,
    targetId,
    proposedDuringAbsence,
  };
}

// ===========================================================================
// Shared error type for apply + dismiss
// ===========================================================================

/** @derives(F-002 scope §3b + §3c) */
export type LifecycleErrorCode =
  | 'NOT_FOUND'
  | 'CROSS_TENANT'
  | 'ALREADY_APPLIED'
  | 'ALREADY_DISMISSED'
  | 'NOT_RESPONSIBLE';

/** @derives(F-002 scope §3b + §3c) */
export class LifecycleError extends Error {
  constructor(
    public code: LifecycleErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'LifecycleError';
  }
}

// ===========================================================================
// TEST-ONLY hook for deterministic stale-authority tests (F-002 R3.2-a)
// ===========================================================================
//
// commitApply has a window between preCheckApply (which ran earlier in the
// caller's tx) and the conditional UPDATE: the binding/authority can change
// in another connection during that window. To test that R2a's auth re-check
// catches this race deterministically (not probabilistically via timing),
// tests set this hook to a function that commits a binding change on a
// side-channel connection. commitApply awaits the hook BEFORE the auth
// re-check, so the race condition is forced.
//
// The hook is gated on `process.env.NODE_ENV === 'test'`. In production
// (NODE_ENV undefined / 'production'), the hook is never read — even if
// __setCommitApplyTestHook was called. Defense-in-depth against accidental
// activation.
//
// Tests MUST reset the hook to null in afterEach/afterAll to avoid leaking
// across cases.
//
// @derives(F-002 R3.2-a — deterministic stale-auth route-level test)

let __commitApplyTestHook: (() => Promise<void>) | null = null;

/** TEST-ONLY. See module-level comment above. */
export function __setCommitApplyTestHook(fn: (() => Promise<void>) | null): void {
  __commitApplyTestHook = fn;
}

// ===========================================================================
// Authorization helper — derives from DECISION_KIND_REGISTRY routingMode
// ===========================================================================

/**
 * Returns true iff `actorUserId` is allowed to transition this row.
 *
 *   - routingMode 'worker-targeted' → resolve worker → primary site → effective binding
 *   - routingMode 'site-targeted'   → effective binding on targetId directly
 *   - routingMode 'origin-only'     → original supervisorId equals actor
 *
 * For binding-routable kinds with a worker that has no derivable site, falls
 * back to origin-supervisor — matches F-001's read-side fallback (the row
 * couldn't be routed, so the original supervisor is the only available actor).
 */
async function isCallerAuthorized(
  tx: Prisma.TransactionClient,
  row: { kind: string; supervisorId: string; targetId: string | null },
  actorUserId: string,
  companyId: string,
): Promise<boolean> {
  const spec = decisionSpecByKind.get(row.kind);
  const routingMode: RoutingMode = spec?.routingMode ?? 'origin-only';

  if (routingMode === 'worker-targeted' && row.targetId) {
    const siteId = await deriveWorkerPrimarySiteId(tx, {
      companyId,
      workerId: row.targetId,
    });
    if (!siteId) {
      // Can't derive site → fall back to origin.
      return row.supervisorId === actorUserId;
    }
    const responsible = await getEffectiveResponsibleUserId(tx, { companyId, siteId });
    return responsible === actorUserId;
  }

  if (routingMode === 'site-targeted' && row.targetId) {
    const responsible = await getEffectiveResponsibleUserId(tx, {
      companyId,
      siteId: row.targetId,
    });
    return responsible === actorUserId;
  }

  // 'origin-only' or no targetId on a binding-routable kind → origin supervisor.
  return row.supervisorId === actorUserId;
}

// ===========================================================================
// Race-safe state transitions via conditional updateMany
// ===========================================================================

/**
 * Discriminator query when a conditional UPDATE returns 0 rows. Reads the
 * current row state ONCE to map to the right LifecycleErrorCode. Called
 * only on the failure path, so the extra read is amortised.
 */
async function discriminateFailure(
  tx: Prisma.TransactionClient,
  companyId: string,
  decisionId: string,
): Promise<LifecycleErrorCode> {
  const row = await tx.supervisorDecision.findUnique({ where: { id: decisionId } });
  if (!row) return 'NOT_FOUND';
  if (row.companyId !== companyId) return 'CROSS_TENANT';
  if (row.appliedAt) return 'ALREADY_APPLIED';
  if (row.dismissedAt) return 'ALREADY_DISMISSED';
  // Row is still PROPOSED but UPDATE-count was 0 — only remaining cause is
  // an authorization mismatch (the WHERE included a tenant+precondition; if
  // we got here without one of the above, the row passed those checks).
  // Note: in the current implementation we run the authorization check BEFORE
  // the conditional UPDATE, so an unauthorized actor returns 'NOT_RESPONSIBLE'
  // up there. If we ever inline auth into the WHERE, this default catches it.
  return 'NOT_RESPONSIBLE';
}

// ===========================================================================
// applyProposedDecision — F-002 §3b + race-safe rewrite (F-002.3)
// ===========================================================================

/** @derives(F-002 scope §3b) */
export type ApplyProposedDecisionInput = {
  companyId: string;
  decisionId: string;
  actorUserId: string;
};

/** @derives(F-002 scope §3b) */
export type ApplyProposedDecisionResult = {
  decisionId: string;
  kind: string;
  tier: DwiTier;
  targetId: string | null;
  appliedAt: Date;
  originalSupervisorId: string;
  payload: Prisma.JsonValue;
};

/**
 * Pre-check result that callers thread through `commitApply` so the audit
 * payload uses the row state observed at auth-check time (not a fresh read
 * after the conditional UPDATE).
 * @derives(F-002.4 — apply-after-domain split)
 */
export type ApplyPreCheckResult = {
  decisionId: string;
  kind: string;
  tier: DwiTier;
  targetId: string | null;
  originalSupervisorId: string;
  payload: Prisma.JsonValue;
};

/**
 * Pre-check half of applyProposedDecision: reads the row, verifies tenant +
 * lifecycle guards + authorization. Throws LifecycleError on any failure;
 * returns the row's auditable fields on success.
 *
 * Used by `/chat/apply` inject-style branches for apply-after-domain:
 *   1. preCheckApply (tx 1)
 *   2. domain inject (no tx)
 *   3. commitApply (tx 2) only if domain returned 2xx
 *
 * NOTE: there is a logical race window between preCheckApply (tx 1) and
 * commitApply (tx 2). A concurrent dismiss could transition the row to
 * DISMISSED in that window. commitApply's race-safe conditional UPDATE
 * detects that case (count=0) and refuses to set appliedAt — the lifecycle
 * audit will only have the winner's DWI_DISMISSED, not a stale DWI_APPLIED.
 * The domain effect from step 2 already happened though; that asymmetry is
 * intentional under apply-after-domain. The domain side has its own audit
 * trail (e.g., WORKER_MARKED_ABSENT) which records the domain effect
 * independently. Manual reconciliation surfaces if needed.
 *
 * @derives(F-002 scope §3b)
 * @derives(F-002.4 — apply-after-domain split)
 * @derives(production-grade-rulebook P3)
 */
export async function preCheckApply(
  tx: Prisma.TransactionClient,
  input: ApplyProposedDecisionInput,
): Promise<ApplyPreCheckResult> {
  const row = await tx.supervisorDecision.findUnique({
    where: { id: input.decisionId },
  });
  if (!row) throw new LifecycleError('NOT_FOUND');
  if (row.companyId !== input.companyId) throw new LifecycleError('CROSS_TENANT');
  if (row.appliedAt) throw new LifecycleError('ALREADY_APPLIED');
  if (row.dismissedAt) throw new LifecycleError('ALREADY_DISMISSED');

  const authorized = await isCallerAuthorized(
    tx,
    { kind: row.kind, supervisorId: row.supervisorId, targetId: row.targetId },
    input.actorUserId,
    input.companyId,
  );
  if (!authorized) throw new LifecycleError('NOT_RESPONSIBLE');

  return {
    decisionId: row.id,
    kind: row.kind,
    tier: row.tier as DwiTier,
    targetId: row.targetId,
    originalSupervisorId: row.supervisorId,
    payload: row.payload as Prisma.JsonValue,
  };
}

/**
 * Commit half of applyProposedDecision: race-safe conditional UPDATE + audit
 * emit. Throws LifecycleError on race-lost (count === 0).
 *
 * Callers passing `preCheck` skip the read; they thread the auditable fields
 * captured at preCheckApply time. This is the path used by `/chat/apply`
 * after a successful domain inject.
 *
 * @derives(F-002.4 — apply-after-domain split)
 * @derives(production-grade-rulebook P2)
 */
export async function commitApply(
  tx: Prisma.TransactionClient,
  input: ApplyProposedDecisionInput & { preCheck: ApplyPreCheckResult },
): Promise<{ appliedAt: Date }> {
  // R3.2-a test-only hook (no-op in production). Lets the route-level
  // stale-auth test inject a binding change on a side-channel connection
  // RIGHT BEFORE the auth re-check, so the race is deterministic.
  if (process.env.NODE_ENV === 'test' && __commitApplyTestHook) {
    await __commitApplyTestHook();
  }

  // F-002.10 (R2a): re-check authorization at commit time, not just at
  // preCheck time. The auth state could have changed between preCheckApply
  // (tx 1) and commitApply (tx 2 — for the apply-after-domain path used by
  // round-1 F-002.4) OR within a long-running tx where another connection
  // committed a SiteSupervisorBinding change. Under R2b-iii (round 2) all
  // three steps share ONE tx, so the binding read here sees a fresh snapshot
  // — and any stale-auth case rolls back the entire tx (including the
  // domain service call that already ran inside it).
  //
  // Lesson L2 in memory: when authorization is checked in tx 1 and state is
  // committed in tx 2, the authority can change between the two. Always
  // re-check inside the commit tx.
  const authorized = await isCallerAuthorized(
    tx,
    {
      kind: input.preCheck.kind,
      supervisorId: input.preCheck.originalSupervisorId,
      targetId: input.preCheck.targetId,
    },
    input.actorUserId,
    input.companyId,
  );
  if (!authorized) {
    throw new LifecycleError('NOT_RESPONSIBLE');
  }

  const appliedAt = new Date();
  const result = await tx.supervisorDecision.updateMany({
    where: {
      id: input.decisionId,
      companyId: input.companyId,
      appliedAt: null,
      dismissedAt: null,
    },
    data: { appliedAt },
  });
  if (result.count === 0) {
    const code = await discriminateFailure(tx, input.companyId, input.decisionId);
    throw new LifecycleError(code);
  }
  await recordDwiApplied(tx, {
    companyId: input.companyId,
    actorId: input.actorUserId,
    payload: {
      decisionId: input.preCheck.decisionId,
      kind: input.preCheck.kind,
      tier: input.preCheck.tier,
      appliedAt: appliedAt.toISOString(),
      appliedBy: input.actorUserId,
      originalSupervisorId: input.preCheck.originalSupervisorId,
    },
  });
  return { appliedAt };
}

/**
 * Transitions PROPOSED → APPLIED via race-safe conditional updateMany.
 *
 * Sequence (rule P2 — no check-then-act):
 *   1. Read row once for authorization + payload return. Throw early on
 *      NOT_FOUND / CROSS_TENANT / ALREADY_APPLIED / ALREADY_DISMISSED /
 *      NOT_RESPONSIBLE — these are observable from a stale read and avoid
 *      a needless UPDATE round-trip.
 *   2. Issue updateMany with the FULL precondition in WHERE: `id`, `companyId`,
 *      `appliedAt IS NULL`, `dismissedAt IS NULL`. PG row-level locking
 *      guarantees exactly one of N concurrent transactions wins.
 *   3. If count === 0: another transaction got there first. Discriminate the
 *      cause via a single re-read.
 *   4. If count === 1: emit DWI_APPLIED audit and return.
 *
 * Callers may run this inside their own outer transaction (propose_termination
 * does this — its tx wraps applyProposedDecision + the worker.update). The
 * race-safety property is per-row, so outer-tx vs no-outer-tx both work.
 *
 * @derives(F-002 scope §3b)
 * @derives(F-002.3 — race-safe rewrite via updateMany)
 * @derives(production-grade-rulebook P2)
 * @derives(workflow-design-closure §3.2)
 */
export async function applyProposedDecision(
  tx: Prisma.TransactionClient,
  input: ApplyProposedDecisionInput,
): Promise<ApplyProposedDecisionResult> {
  // Composed from preCheckApply + commitApply. Both halves run in the same
  // transaction; the conditional UPDATE in commitApply still has its own
  // race-safety guarantee because the row predicate is re-evaluated by
  // PG under concurrent writers (see module docstring).
  const preCheck = await preCheckApply(tx, input);
  const { appliedAt } = await commitApply(tx, { ...input, preCheck });
  return {
    decisionId: preCheck.decisionId,
    kind: preCheck.kind,
    tier: preCheck.tier,
    targetId: preCheck.targetId,
    appliedAt,
    originalSupervisorId: preCheck.originalSupervisorId,
    payload: preCheck.payload,
  };
}

// ===========================================================================
// dismissProposedDecision — F-002 §3c + race-safe rewrite (F-002.3)
// ===========================================================================

/** @derives(F-002 scope §3c) */
export type DismissProposedDecisionInput = {
  companyId: string;
  decisionId: string;
  actorUserId: string;
  reason: string;
};

/** @derives(F-002 scope §3c) */
export type DismissProposedDecisionResult = {
  decisionId: string;
  kind: string;
  tier: DwiTier;
  dismissedAt: Date;
  originalSupervisorId: string;
};

/**
 * Transitions PROPOSED → DISMISSED via race-safe conditional updateMany.
 * Identical race-safety mechanism to applyProposedDecision.
 *
 * @derives(F-002 scope §3c)
 * @derives(F-002.3 — race-safe rewrite via updateMany)
 * @derives(production-grade-rulebook P2)
 */
export async function dismissProposedDecision(
  tx: Prisma.TransactionClient,
  input: DismissProposedDecisionInput,
): Promise<DismissProposedDecisionResult> {
  const row = await tx.supervisorDecision.findUnique({
    where: { id: input.decisionId },
  });
  if (!row) throw new LifecycleError('NOT_FOUND');
  if (row.companyId !== input.companyId) throw new LifecycleError('CROSS_TENANT');
  if (row.appliedAt) throw new LifecycleError('ALREADY_APPLIED');
  if (row.dismissedAt) throw new LifecycleError('ALREADY_DISMISSED');

  const authorized = await isCallerAuthorized(
    tx,
    { kind: row.kind, supervisorId: row.supervisorId, targetId: row.targetId },
    input.actorUserId,
    input.companyId,
  );
  if (!authorized) throw new LifecycleError('NOT_RESPONSIBLE');

  const dismissedAt = new Date();

  const result = await tx.supervisorDecision.updateMany({
    where: {
      id: row.id,
      companyId: input.companyId,
      appliedAt: null,
      dismissedAt: null,
    },
    data: { dismissedAt, dismissedReason: input.reason },
  });

  if (result.count === 0) {
    const code = await discriminateFailure(tx, input.companyId, input.decisionId);
    throw new LifecycleError(code);
  }

  await recordDwiDismissed(tx, {
    companyId: input.companyId,
    actorId: input.actorUserId,
    payload: {
      decisionId: row.id,
      kind: row.kind,
      tier: row.tier as DwiTier,
      dismissedAt: dismissedAt.toISOString(),
      dismissedBy: input.actorUserId,
      dismissedReason: input.reason,
      originalSupervisorId: row.supervisorId,
    },
  });

  return {
    decisionId: row.id,
    kind: row.kind,
    tier: row.tier as DwiTier,
    dismissedAt,
    originalSupervisorId: row.supervisorId,
  };
}

// Re-export for callers that need the predicate (kept here for legacy importers;
// new code should import directly from @axhy/shared-schema).
export { isBindingRoutable };
