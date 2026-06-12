/**
 * audit-summary — shared AuditEvent kind → plain-English summary helper.
 *
 * Extracted from `activity-service.ts` so both the Activity feed and the
 * Summary timeline can produce consistent human-readable lines without
 * duplicating the switch. Any new kind added to `activity-service.ts`
 * MUST also be reflected here (or vice versa — this is the canonical copy).
 *
 * `activity-service.ts` now re-exports `summarizeAuditKind` from this
 * module so there is one source of truth.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 * @derives(panel-2026-05-17) — Activity + Summary slices
 */

/**
 * Convert an AuditEvent kind + payload into a plain-English line.
 * Falls back to humanizing the kind for any taxonomy we don't yet handle —
 * so a newly-added audit kind doesn't break either the Activity feed or
 * the Summary timeline.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */
export function summarizeAuditKind(kind: string, payload: unknown): string {
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
    case 'DWI_EXPIRED':
      return 'A proposed decision expired unanswered after 48 hours.';
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
