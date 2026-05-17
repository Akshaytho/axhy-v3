/**
 * activity-service — composes the `GET /supervisor/activity` response.
 *
 * Reads AuditEvent rows authored by the calling supervisor (scoped to
 * tenant via `withTenantContext`), sorted newest-first, capped at a
 * pagination limit. Composes a plain-English `summary` line per row from
 * the kind taxonomy + payload — so the client doesn't have to know the
 * payload shape.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — HR control plane / supervisor surface
 * @derives(panel-2026-05-17) — Activity slice
 */

import type { Prisma } from '@prisma/client';
import { ActivityResponse, type ActivityResponseT } from '@axhy/shared-schema';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** @derives(ADR-0003) @derives(master-plan §G) — Activity slice */
export type BuildActivityArgs = {
  companyId: string;
  userId: string;
  /** Page size, capped at MAX_LIMIT. */
  limit?: number;
};

/**
 * Build the `GET /supervisor/activity` response for the caller.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */
export async function buildActivityForSupervisor(
  tx: Prisma.TransactionClient,
  args: BuildActivityArgs,
): Promise<ActivityResponseT> {
  const limit = Math.min(Math.max(args.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  const rows = await tx.auditEvent.findMany({
    where: { companyId: args.companyId, actorId: args.userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      kind: true,
      targetId: true,
      payload: true,
      createdAt: true,
    },
  });

  const composed = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    when: r.createdAt.toISOString(),
    targetId: r.targetId ?? null,
    summary: summarize(r.kind, r.payload),
  }));

  return ActivityResponse.parse({ rows: composed });
}

/**
 * Convert an AuditEvent kind + payload into a plain-English line.
 * Falls back to humanizing the kind for any taxonomy we don't yet handle —
 * so a newly-added audit kind doesn't break the Activity feed.
 */
function summarize(kind: string, payload: unknown): string {
  const p = (payload ?? {}) as Record<string, unknown>;
  const workerName = typeof p.workerName === 'string' ? p.workerName : null;
  const reason = typeof p.reason === 'string' ? p.reason : null;
  const date = typeof p.date === 'string' ? p.date : null;
  const status = typeof p.status === 'string' ? p.status : null;
  const siteName = typeof p.siteName === 'string' ? p.siteName : null;

  switch (kind) {
    case 'WORKER_MARKED_ABSENT': {
      const who = workerName ?? 'a worker';
      const when = date ? ` for ${date}` : '';
      const why = reason ? ` (${reason})` : '';
      const st = status ? ` — ${status.replaceAll('_', ' ').toLowerCase()}` : '';
      return `Marked ${who} absent${when}${st}${why}.`;
    }
    case 'LEAVE_REQUESTED':
      return `Requested leave${workerName ? ` for ${workerName}` : ''}.`;
    case 'LEAVE_APPROVED':
      return `Approved leave${workerName ? ` for ${workerName}` : ''}.`;
    case 'LEAVE_REJECTED':
      return `Rejected leave${workerName ? ` for ${workerName}` : ''}.`;
    case 'ASSIGNMENT_CREATED':
      return `Created an assignment${workerName ? ` for ${workerName}` : ''}${siteName ? ` at ${siteName}` : ''}.`;
    case 'SWAP_REQUEST_SENT':
      return `Sent a swap request${workerName ? ` for ${workerName}` : ''}.`;
    case 'SITE_COMPLAINT_LOGGED':
      return `Logged a complaint${siteName ? ` at ${siteName}` : ''}.`;
    case 'BINDING_CREATED':
      return `Took responsibility for a site${siteName ? ` (${siteName})` : ''}.`;
    case 'BINDING_ENDED_MANUAL':
      return `Stepped off a site${siteName ? ` (${siteName})` : ''}.`;
    case 'BINDING_ENDED_AUTO':
      return `Acting cover ended automatically${siteName ? ` for ${siteName}` : ''}.`;
    case 'BINDING_ENDED_SUPERSEDED_BY_PERMANENT':
      return `Cover handed back to permanent supervisor${siteName ? ` at ${siteName}` : ''}.`;
    case 'HANDOFF_PACKAGE_GENERATED':
      return `Handoff context written${siteName ? ` for ${siteName}` : ''}.`;
    case 'CHAT_MESSAGE_CREATED':
      return 'Captured a chat message.';
    case 'VISIT_ENDED':
      return 'Closed a visit.';
    case 'DWI_PROPOSED':
      return 'A new decision was proposed.';
    case 'DWI_APPLIED':
      return 'Applied a decision.';
    case 'DWI_DISMISSED':
      return 'Dismissed a decision.';
    default:
      return humanizeKind(kind);
  }
}

function humanizeKind(kind: string): string {
  const words = kind
    .replaceAll('_', ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
  return `${words}.`;
}
