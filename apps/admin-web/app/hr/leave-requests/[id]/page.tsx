/**
 * HR leave-request detail page — /hr/leave-requests/[id].
 *
 * [ORCHESTRATOR_EXCEPTION] sub-agent dispatched for HR A1 task 19
 *
 * Server component. Gates on HR role, then fetches /leave-requests/:id.
 * The backend enforces HR-pod or supervisor-pod scoping; an ApiError(404)
 * here also covers the "not in your pod" case (backend hides cross-pod
 * rows behind 404 to avoid leaking existence).
 *
 * Renders a <dl> with the request fields. If state === 'REQUESTED' the
 * DecideButtons client component is mounted; otherwise the page shows a
 * read-only decision summary (decidedAt, decisionNote) and no buttons —
 * a leave can only be decided once.
 *
 * Next 15: params is a Promise — awaited at start.
 *
 * @derives(master-plan §G)
 */

import { notFound } from 'next/navigation';

import { fetchJson, ApiError } from '../../../../lib/api';
import { requireRole } from '../../../../lib/auth';
import styles from '../styles.module.css';

import { DecideButtons } from './DecideButtons';

type LeaveRequestDetail = {
  id: string;
  workerId: string;
  workerName: string;
  workerPhone: string;
  fromDate: string;
  toDate: string;
  reason: string;
  state: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
};

/**
 * Fetch one leave request; translate 404 into Next.js notFound().
 *
 * @derives(master-plan §G)
 */
async function loadLeaveRequest(id: string): Promise<LeaveRequestDetail> {
  try {
    return await fetchJson<LeaveRequestDetail>(`/leave-requests/${encodeURIComponent(id)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
}

/**
 * Leave-request detail server component.
 *
 * @derives(master-plan §G)
 */
export default async function HrLeaveRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole('HR');
  const { id } = await params;
  const leave = await loadLeaveRequest(id);
  const isPending = leave.state === 'REQUESTED';
  return (
    <section>
      <h1>Leave request</h1>
      <div className={styles.badge}>{leave.state}</div>
      <dl className={styles.detail}>
        <dt>Worker</dt>
        <dd>{leave.workerName}</dd>
        <dt>Phone</dt>
        <dd>{leave.workerPhone}</dd>
        <dt>From</dt>
        <dd>{leave.fromDate}</dd>
        <dt>To</dt>
        <dd>{leave.toDate}</dd>
        <dt>Reason</dt>
        <dd>{leave.reason}</dd>
        <dt>Requested</dt>
        <dd>{new Date(leave.createdAt).toISOString()}</dd>
        {leave.decidedAt ? (
          <>
            <dt>Decided</dt>
            <dd>{new Date(leave.decidedAt).toISOString()}</dd>
          </>
        ) : null}
        {leave.decisionNote ? (
          <>
            <dt>Decision note</dt>
            <dd>{leave.decisionNote}</dd>
          </>
        ) : null}
      </dl>
      {isPending ? <DecideButtons leaveId={leave.id} /> : null}
    </section>
  );
}
