/**
 * Supervisor Context — wire shape for `GET /supervisor/context`.
 *
 * Powers the Chat tab GreetingCard: `{N} sites · {M} workers active`.
 * Both counts are portfolio-scoped to the calling supervisor's effective
 * bindings at request time; derived server-side, never sent by the client.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */

import { z } from 'zod';

/**
 * Response shape for `GET /supervisor/context`.
 *
 * - `sitesActive`   — count of sites where this supervisor is the effective
 *   responsible supervisor at request time (§5.8 acting-over-permanent).
 * - `workersActive` — count of distinct workers with an ACTIVE assignment
 *   on any of those sites, valid at request time.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */
export const SupervisorContext = z
  .object({
    sitesActive: z.number().int().nonnegative(),
    workersActive: z.number().int().nonnegative(),
  })
  .strict();

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export type SupervisorContextT = z.infer<typeof SupervisorContext>;
