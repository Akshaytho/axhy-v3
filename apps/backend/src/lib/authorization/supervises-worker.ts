/**
 * `assertCallerSupervisesWorker` — read-only authorization helper for worker-targeted DWIs.
 *
 * Single source of truth for the question "is `callerUserId` the responsible
 * supervisor for `workerId` right now?" Composes the three Layer-1 routing
 * primitives at `apps/backend/src/lib/effective-responsibility.ts`:
 *
 *   1. `deriveWorkerPrimarySiteId` (§5.9) — worker → primary site at T.
 *   2. `getEffectiveBinding` (§5.5 + §5.8) — site → effective supervisor at T,
 *      applying ACTING-over-PERMANENT precedence.
 *   3. Compare `binding.userId === callerUserId`.
 *
 * Zero new SQL. Zero new state. Wraps existing primitives so every
 * worker-targeted DWI inherits the same routing decision the supervisor-app
 * read paths use — no drift between "Today says this is my worker" and
 * "mark-absent says you're not the supervisor."
 *
 * Discipline notes (per `feedback_planning_decision_rules.md` 2026-05-17):
 *   - This is a READ helper. It MUST NOT mutate, audit, or log. Caller logs
 *     after inspecting the typed result.
 *   - Lives inside any caller's tx. Safe under concurrent invocation.
 *   - Callers allowed: `markAbsentService` (Q2=B, this slice); future
 *     worker-targeted DWI services (approve_leave, terminate, swap_request).
 *     NOT for cross-aggregate authorization (site-scoped routes, HR-portal
 *     binding CRUD, payroll-scoped reads — those have different policy
 *     surfaces).
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / responsibility model
 * @derives(supervisor-responsibility-model §5.5 + §5.8 + §5.9)
 * @derives(panel-2026-05-17) — Q2=B mark-absent hardening
 */

import type { Prisma } from '@prisma/client';

import { deriveWorkerPrimarySiteId, getEffectiveBinding } from '../effective-responsibility.js';

/** @derives(ADR-0003) @derives(master-plan §G) — Q2=B mark-absent hardening */
export type AssertCallerSupervisesWorkerArgs = {
  companyId: string;
  callerUserId: string;
  workerId: string;
  /** Defaults to `new Date()`. Drives both derivation tiers + binding effective-at-T. */
  at?: Date;
};

/** @derives(ADR-0003) @derives(master-plan §G) — Q2=B mark-absent hardening */
export type AssertCallerSupervisesWorkerResult =
  | { kind: 'OK' }
  /** Worker has no derivable primary site (no Assignment row at any state). */
  | { kind: 'NO_PRIMARY_SITE' }
  /** Site has no effective binding (PERMANENT or ACTING) at the supplied instant. */
  | { kind: 'NO_EFFECTIVE_BINDING' }
  /** Some other user is the effective supervisor. */
  | { kind: 'FORBIDDEN'; effectiveUserId: string };

/**
 * Returns OK when `callerUserId` is the §5.8-winning supervisor for
 * `workerId`'s primary site at `at`. Otherwise returns a typed failure
 * the caller translates into its domain-appropriate result kind.
 *
 * Three distinct failure shapes so callers (or future telemetry) can
 * distinguish operational states even though external surfaces typically
 * collapse them all to 403 (avoid leaking unassigned-worker / no-binding
 * state to the caller).
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / responsibility model
 * @derives(supervisor-responsibility-model §5.5 + §5.8 + §5.9)
 * @derives(panel-2026-05-17) — Q2=B mark-absent hardening
 */
export async function assertCallerSupervisesWorker(
  tx: Prisma.TransactionClient,
  args: AssertCallerSupervisesWorkerArgs,
): Promise<AssertCallerSupervisesWorkerResult> {
  const at = args.at ?? new Date();

  const siteId = await deriveWorkerPrimarySiteId(tx, {
    companyId: args.companyId,
    workerId: args.workerId,
    at,
  });
  if (siteId === null) return { kind: 'NO_PRIMARY_SITE' };

  const binding = await getEffectiveBinding(tx, {
    companyId: args.companyId,
    siteId,
    at,
  });
  if (binding === null) return { kind: 'NO_EFFECTIVE_BINDING' };

  if (binding.userId === args.callerUserId) return { kind: 'OK' };
  return { kind: 'FORBIDDEN', effectiveUserId: binding.userId };
}
