/**
 * SupervisorDecision lifecycle writer — single source of truth for transitions.
 *
 * Three operations:
 *   - `createProposedDecision`  — chat extractor writes a PROPOSED row inside
 *                                  the same tx as the assistant chat message
 *   - `applyProposedDecision`   — `/chat/apply` transitions PROPOSED → APPLIED
 *   - `dismissProposedDecision` — `POST /decisions/:id/dismiss` transitions
 *                                  PROPOSED → DISMISSED
 *
 * State discriminator (per F-002 scope Q4=(b), no state ENUM yet):
 *   PROPOSED  → (appliedAt IS NULL  AND dismissedAt IS NULL)
 *   APPLIED   → (appliedAt IS NOT NULL)
 *   DISMISSED → (dismissedAt IS NOT NULL)
 *   appliedAt + dismissedAt are mutually exclusive — enforced at the
 *   application layer via guards in apply/dismiss.
 *
 * Authorization (per F-002 scope §3b + §3c):
 *   - Binding-routable kinds (MARK_ABSENT, APPROVE_LEAVE, LOG_COMPLAINT) → the
 *     **currently responsible supervisor** at the routed site/worker, derived
 *     via F-001's `getEffectiveResponsibleUserId` + `deriveWorkerPrimarySiteId`.
 *   - All other kinds → the **original supervisor** (`SupervisorDecision.supervisorId`).
 *
 * SINGLE SOURCE OF TRUTH for SupervisorDecision lifecycle. Do not write to the
 * row directly outside this module unless you are writing this module.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / responsibility model
 * Linked specs (not parsed by the require-derives ESLint rule):
 *   - F-002 scope §3a + §3b + §3c
 *   - workflow-design-closure §3.2 — SupervisorDecision lifecycle
 *   - supervisor-responsibility-model §5.4 — PROPOSED follows new responsible
 */

import type { Prisma } from '@prisma/client';

import { recordDwiProposed, recordDwiApplied, recordDwiDismissed } from './audit-event.js';
import {
  deriveWorkerPrimarySiteId,
  getEffectiveBinding,
  getEffectiveResponsibleUserId,
} from './effective-responsibility.js';

/** @derives(workflow-design-closure §3.2 — SupervisorDecision.tier enum) */
export type DwiTier = 'NOTE' | 'OPERATIONAL' | 'PERSONNEL' | 'EMPLOYMENT';

/**
 * Tool name → DWI metadata mapping. The chat extractor's `propose_*` tools
 * map onto SupervisorDecision rows via this table. Unknown tool names are
 * silently skipped (createProposedDecision returns null) — this keeps the
 * chat layer forwards-compatible with new propose_* tools that may not yet
 * have a DWI semantic.
 *
 * @derives(F-002 scope §3a)
 */
const TOOL_TO_DWI: Record<
  string,
  { kind: string; tier: DwiTier; targetField: '' | 'workerId' | 'siteId' }
> = {
  propose_mark_absent: { kind: 'MARK_ABSENT', tier: 'OPERATIONAL', targetField: 'workerId' },
  propose_leave: { kind: 'APPROVE_LEAVE', tier: 'OPERATIONAL', targetField: 'workerId' },
  propose_swap: { kind: 'SWAP_WORKER', tier: 'OPERATIONAL', targetField: 'siteId' },
  propose_termination: { kind: 'TERMINATE_WORKER', tier: 'EMPLOYMENT', targetField: 'workerId' },
  propose_create_assignment: {
    kind: 'CREATE_ASSIGNMENT',
    tier: 'OPERATIONAL',
    targetField: 'workerId',
  },
  propose_living_doc_update: { kind: 'LIVING_DOC_RULE', tier: 'NOTE', targetField: '' },
};

/**
 * F-001's "kind sets" replicated here as the authorization predicate. These
 * mirror WORKER_TARGETED_KINDS + SITE_TARGETED_KINDS in
 * `apps/backend/src/routes/decisions.ts`. Kept in sync manually until a shared
 * constants module makes sense.
 */
const WORKER_TARGETED_KINDS = new Set(['MARK_ABSENT', 'APPROVE_LEAVE']);
const SITE_TARGETED_KINDS = new Set(['LOG_COMPLAINT']);

/** Returns true iff the kind is routed via the F-001 binding-aware predicate. */
function isBindingRoutable(kind: string): boolean {
  return WORKER_TARGETED_KINDS.has(kind) || SITE_TARGETED_KINDS.has(kind);
}

// ===========================================================================
// createProposedDecision — F-002 §3a
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
 * Returns `null` when `toolName` has no DWI mapping (unknown propose_* tool) —
 * callers may choose to log a warning but should not throw.
 *
 * proposedDuringAbsence detection (per F-002 scope Q5):
 *   - For binding-routable targets, derive the site, look up the effective
 *     binding via F-001's helper, and set true iff binding.kind === 'ACTING'
 *     AND binding.actingForUserId === supervisorId (i.e., the originator
 *     is currently being covered by someone else acting for them).
 *   - Otherwise false.
 *
 * originContext (per F-002 scope Q1=b, best-effort capture):
 *   Captures the chat thread/message ids + tool fields + a capture timestamp.
 *   Not a typed schema yet; HR portal + Activity tab consumers should
 *   defensive-parse. Closure §3 names richer components (recent decisions,
 *   worker history) — deferred to a separate slice.
 *
 * @derives(F-002 scope §3a, §7-Q1, §7-Q5)
 * @derives(workflow-design-closure §3.2)
 */
export async function createProposedDecision(
  tx: Prisma.TransactionClient,
  input: CreateProposedDecisionInput,
): Promise<CreateProposedDecisionResult | null> {
  const mapping = TOOL_TO_DWI[input.toolName];
  if (!mapping) return null;

  const targetId =
    mapping.targetField === ''
      ? null
      : ((input.fields[mapping.targetField] as string | undefined) ?? null);
  const ackRequired = mapping.tier === 'EMPLOYMENT';

  // proposedDuringAbsence — only meaningful when we can route to a site.
  let proposedDuringAbsence = false;
  let routedSiteId: string | null = null;
  if (targetId) {
    if (mapping.targetField === 'workerId') {
      routedSiteId = await deriveWorkerPrimarySiteId(tx, {
        companyId: input.companyId,
        workerId: targetId,
      });
    } else if (mapping.targetField === 'siteId') {
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

  // Best-effort originContext (Q1=b). Field shape is intentionally open and
  // consumers must defensive-parse. Add richer components in a later slice.
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
      kind: mapping.kind,
      tier: mapping.tier,
      targetId,
      payload: input.fields as Prisma.InputJsonValue,
      ackRequired,
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
      kind: mapping.kind,
      tier: mapping.tier,
      targetId,
      proposedDuringAbsence,
      ackRequired,
      sourceChatThreadId: input.threadId,
      sourceChatMessageId: input.assistantMessageId,
    },
  });

  return {
    decisionId: input.decisionId,
    kind: mapping.kind,
    tier: mapping.tier,
    targetId,
    proposedDuringAbsence,
  };
}

// ===========================================================================
// Shared authorization predicate for apply + dismiss
// ===========================================================================

/** @derives(F-002 scope §3b + §3c — typed error codes for apply/dismiss guards) */
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

/**
 * Returns true iff `actorUserId` is allowed to apply/dismiss this row.
 *
 * Binding-routable kinds → must be the currently responsible supervisor.
 * Non-binding-routable kinds → must be the original supervisorId.
 *
 * If a worker-targeted DWI's worker has no derivable site (deriveWorkerPrimarySiteId
 * returns null), we fall back to origin-supervisor authorization — this matches
 * F-001's behaviour on the read side.
 */
async function isCallerAuthorized(
  tx: Prisma.TransactionClient,
  row: { kind: string; supervisorId: string; targetId: string | null },
  actorUserId: string,
  companyId: string,
): Promise<boolean> {
  if (isBindingRoutable(row.kind) && row.targetId) {
    let siteId: string | null = null;
    if (WORKER_TARGETED_KINDS.has(row.kind)) {
      siteId = await deriveWorkerPrimarySiteId(tx, {
        companyId,
        workerId: row.targetId,
      });
    } else if (SITE_TARGETED_KINDS.has(row.kind)) {
      siteId = row.targetId;
    }
    if (!siteId) {
      // Can't route — fall back to origin supervisor.
      return row.supervisorId === actorUserId;
    }
    const responsibleUserId = await getEffectiveResponsibleUserId(tx, {
      companyId,
      siteId,
    });
    return responsibleUserId === actorUserId;
  }
  // Non-binding-routable kinds: origin supervisor only.
  return row.supervisorId === actorUserId;
}

// ===========================================================================
// applyProposedDecision — F-002 §3b
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
 * Transitions PROPOSED → APPLIED inside the caller's transaction. The caller
 * is expected to do the domain write (mark_absent / leave / etc.) in the
 * SAME transaction — the lifecycle update + domain write together form one
 * atomic apply.
 *
 * Throws `LifecycleError` for guard failures; caller maps error.code to HTTP.
 *
 * @derives(F-002 scope §3b)
 * @derives(workflow-design-closure §3.2)
 */
export async function applyProposedDecision(
  tx: Prisma.TransactionClient,
  input: ApplyProposedDecisionInput,
): Promise<ApplyProposedDecisionResult> {
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

  const appliedAt = new Date();
  await tx.supervisorDecision.update({
    where: { id: row.id },
    data: { appliedAt },
  });

  await recordDwiApplied(tx, {
    companyId: input.companyId,
    actorId: input.actorUserId,
    payload: {
      decisionId: row.id,
      kind: row.kind,
      tier: row.tier as DwiTier,
      appliedAt: appliedAt.toISOString(),
      appliedBy: input.actorUserId,
      originalSupervisorId: row.supervisorId,
    },
  });

  return {
    decisionId: row.id,
    kind: row.kind,
    tier: row.tier as DwiTier,
    targetId: row.targetId,
    appliedAt,
    originalSupervisorId: row.supervisorId,
    payload: row.payload as Prisma.JsonValue,
  };
}

// ===========================================================================
// dismissProposedDecision — F-002 §3c
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
 * Transitions PROPOSED → DISMISSED inside the caller's transaction. Records
 * `dismissedAt` + `dismissedReason` and emits DWI_DISMISSED.
 *
 * Authorization is identical to apply (the currently-responsible supervisor
 * for binding-routable kinds, original supervisor otherwise).
 *
 * @derives(F-002 scope §3c)
 * @derives(workflow-design-closure §3.2)
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
  await tx.supervisorDecision.update({
    where: { id: row.id },
    data: { dismissedAt, dismissedReason: input.reason },
  });

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
