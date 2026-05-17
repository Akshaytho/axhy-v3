/**
 * SupervisorDecision kind registry — single source of truth.
 *
 * The chat writer (TOOL_TO_DWI), the read-side routing predicate (WORKER_TARGETED
 * / SITE_TARGETED), and the apply/dismiss authorization predicate all derive
 * from this one registry. Adding a new kind in one place automatically wires
 * it through all 3 layers — rule P5 (new kinds wire all 4 layers) by design.
 *
 * Refactor history: pre-F-002.6 there were three parallel constant tables
 * (TOOL_TO_DWI in supervisor-decision-writer.ts + WORKER_TARGETED_KINDS in
 * decisions.ts + the same set duplicated in the writer). Friend's
 * 2026-05-15 evening review surfaced this as F3 ("new decision kinds do not
 * follow the new supervisor-routing logic"); the parallel-list shape was
 * the drift hazard. This file consolidates.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / responsibility model
 */

import { z } from 'zod';

/** SupervisorDecision.tier enum.
 * @derives(workflow-design-closure §3.2)
 */
export const DwiTierSchema = z.enum(['NOTE', 'OPERATIONAL', 'PERSONNEL', 'EMPLOYMENT']);

/** @derives(workflow-design-closure §3.2) */
export type DwiTier = z.infer<typeof DwiTierSchema>;

/**
 * Routing mode — how the apply/dismiss authorization predicate chooses
 * which supervisor is "currently responsible" for a decision.
 *
 *   - `worker-targeted` — targetId is a Worker; derive primary site via
 *     F-001's deriveWorkerPrimarySiteId, then look up effective binding.
 *   - `site-targeted`   — targetId is a Site; look up effective binding directly.
 *   - `origin-only`     — no binding-routing applies; only the original
 *     supervisorId on the row can apply/dismiss.
 *
 * @derives(supervisor-responsibility-model §5.5 + §5.8 + §5.9)
 */
export type RoutingMode = 'worker-targeted' | 'site-targeted' | 'origin-only';

/**
 * One entry per SupervisorDecision kind the platform recognises. Friend's
 * 2026-05-15 evening rule P5 ("new workflow kinds must update all 4 layers
 * together") is enforced by having a single registry; missing fields here
 * surface at the type level instead of producing silent fall-backs.
 *
 * @derives(F-002.1 — unified registry refactor)
 * @derives(workflow-design-closure §3.2)
 */
export type DecisionKindSpec = {
  /** The SupervisorDecision.kind string. */
  kind: string;
  /** Tier — drives the EMPLOYMENT ack gate. */
  tier: DwiTier;
  /** How read/apply/dismiss authorize the actor. */
  routingMode: RoutingMode;
  /**
   * Chat tool name that produces this kind via the propose stage. Optional
   * because some kinds (e.g. LOG_COMPLAINT today) aren't chat-writeable yet
   * but ARE readable / routable.
   */
  toolName?: string;
  /** ackRequired on the SupervisorDecision row. Derived from tier (EMPLOYMENT)
   * but kept explicit so a future kind can override (e.g. an OPERATIONAL kind
   * that nevertheless needs an HR ack). */
  ackRequired: boolean;
};

/**
 * The canonical registry. Adding a kind here automatically:
 *   - Lets the chat writer accept it (if toolName is set).
 *   - Routes it correctly on the read side (per routingMode).
 *   - Authorizes apply/dismiss per the same routingMode.
 *
 * @derives(F-002.1)
 */
export const DECISION_KIND_REGISTRY: readonly DecisionKindSpec[] = [
  {
    kind: 'MARK_ABSENT',
    tier: 'OPERATIONAL',
    routingMode: 'worker-targeted',
    toolName: 'propose_mark_absent',
    ackRequired: false,
  },
  {
    kind: 'APPROVE_LEAVE',
    tier: 'OPERATIONAL',
    routingMode: 'worker-targeted',
    toolName: 'propose_leave',
    ackRequired: false,
  },
  {
    kind: 'LOG_COMPLAINT',
    tier: 'OPERATIONAL',
    routingMode: 'site-targeted',
    // No toolName: complaints are not chat-writeable today; readable via F-001
    // for site-bound supervisors. When complaint-writing lands, add a toolName.
    ackRequired: false,
  },
  {
    kind: 'SWAP_WORKER',
    tier: 'OPERATIONAL',
    routingMode: 'site-targeted',
    toolName: 'propose_swap',
    ackRequired: false,
  },
  {
    kind: 'TERMINATE_WORKER',
    tier: 'EMPLOYMENT',
    routingMode: 'worker-targeted',
    toolName: 'propose_termination',
    ackRequired: true,
  },
  {
    kind: 'CREATE_ASSIGNMENT',
    tier: 'OPERATIONAL',
    routingMode: 'worker-targeted',
    toolName: 'propose_create_assignment',
    ackRequired: false,
  },
  {
    kind: 'LIVING_DOC_RULE',
    tier: 'NOTE',
    routingMode: 'origin-only',
    toolName: 'propose_living_doc_update',
    ackRequired: false,
  },
  // ── Wave 2 (2026-05-18) — UNION-ALL virtual decision sources ────────────
  //
  // The four kinds below are NOT stored as SupervisorDecision rows. They are
  // projected by `buildDecisionsForSupervisor` from their canonical domain
  // tables (LeaveRequest, SwapRequest, ReplacementInvite, ComplaintMessage)
  // into the same DecisionRow shape via the plug-in `DecisionSource` pattern.
  //
  // They appear in the registry so:
  //   - tier mapping is in ONE place (no parallel switch in the builder)
  //   - the Decisions queue UI can dispatch to the right card variant by kind
  //   - new sources added later (replacement-invite, complaint) inherit the
  //     same registry-driven tier mapping with zero builder churn.
  //
  // routingMode for virtual rows is informational only — the source's own
  // SQL `WHERE` clause is the binding-routing predicate. We mark them
  // 'site-targeted' or 'worker-targeted' to mirror the domain.
  //
  // ackRequired = false for all four; EMPLOYMENT typed-phrase confirm is
  // reserved for TERMINATE_WORKER-class actions only per master-plan §G
  // (no_self_service_resign_or_terminate lock).
  //
  // @derives(Wave 2 plan §3 + drawer-redesign §B.2)
  {
    kind: 'LEAVE_APPROVAL_PENDING',
    tier: 'PERSONNEL',
    routingMode: 'worker-targeted',
    // No toolName: created by LeaveRequest POST (worker app or admin), not chat.
    ackRequired: false,
  },
  {
    kind: 'SWAP_REQUEST_PENDING',
    tier: 'OPERATIONAL',
    routingMode: 'site-targeted',
    // No toolName: created when worker submits a swap via worker app.
    ackRequired: false,
  },
  {
    kind: 'REPLACEMENT_INVITE_OUTCOME',
    tier: 'OPERATIONAL',
    routingMode: 'site-targeted',
    // No toolName: created by dispatcher when broadcast resolves
    // (ACCEPTED-this-turn / EXPIRED-no-accept). Source plug-in lands in
    // Sprint 2 when Wave 1's ReplacementInvite model is integrated.
    ackRequired: false,
  },
  {
    kind: 'COMPLAINT_HR_REPLY',
    tier: 'NOTE',
    routingMode: 'site-targeted',
    // No toolName: created when HR posts a reply on a Complaint thread.
    // Source plug-in lands in Sprint 2 when Wave 3's Complaint/ComplaintMessage
    // schema is integrated.
    ackRequired: false,
  },
] as const;

// ===========================================================================
// Derived lookup maps — built ONCE at module load. Both readers + writers
// consume these. No parallel sets to drift.
// ===========================================================================

/** Lookup by SupervisorDecision.kind string. */
export const decisionSpecByKind = new Map<string, DecisionKindSpec>(
  DECISION_KIND_REGISTRY.map((spec) => [spec.kind, spec]),
);

/** Lookup by chat tool name (only for chat-writeable kinds). */
export const decisionSpecByToolName = new Map<string, DecisionKindSpec>(
  DECISION_KIND_REGISTRY.filter((spec) => spec.toolName !== undefined).map((spec) => [
    spec.toolName!,
    spec,
  ]),
);

/**
 * Returns true iff the kind's routingMode is binding-routable (i.e., the apply
 * /dismiss authorization should be the currently responsible supervisor, not
 * the original supervisorId). Replaces the old `WORKER_TARGETED_KINDS.has(k)
 * || SITE_TARGETED_KINDS.has(k)` parallel-set pattern.
 *
 * @derives(F-002.1)
 */
export function isBindingRoutable(kind: string): boolean {
  const spec = decisionSpecByKind.get(kind);
  if (!spec) return false;
  return spec.routingMode === 'worker-targeted' || spec.routingMode === 'site-targeted';
}

/**
 * Returns the routing mode for a kind, or `'origin-only'` for unknown kinds.
 * Unknown-as-origin-only is the conservative default: the original supervisor
 * is the only authorized actor. Tests will catch a missing-from-registry kind.
 *
 * @derives(F-002.1)
 */
export function routingModeFor(kind: string): RoutingMode {
  return decisionSpecByKind.get(kind)?.routingMode ?? 'origin-only';
}
