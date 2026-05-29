/**
 * HR leave-requests inbox page — /hr/leave-requests.
 *
 * [ORCHESTRATOR_EXCEPTION] sub-agent dispatched for HR A1 task 19
 *
 * Server component. Gates on HR role, then fetches /leave-requests with an
 * optional cursor from the URL search params (?cursor=…). The backend
 * already filters to the HR's pod-scoped requests; this list is naturally
 * pod-scoped. Renders a read-only table (Worker ID truncated, From, To,
 * Reason, Created, State) with a per-row "Decide" link to
 * /hr/leave-requests/[id] and a "Next" pagination link when nextCursor
 * is present.
 *
 * Worker name is not part of the inbox payload (backend deliberately keeps
 * it light); the detail page resolves it. The list shows a short workerId
 * prefix so HR can still cross-reference if multiple requests stack up.
 *
 * @derives(master-plan §G)
 */

import Link from 'next/link';

import { fetchJson } from '../../../lib/api';
import { requireRole } from '../../../lib/auth';

import styles from './styles.module.css';

type LeaveRequestSummary = {
  id: string;
  workerId: string;
  fromDate: string;
  toDate: string;
  reason: string;
  state: string;
  createdAt: string;
};

type Listing<T> = { items: T[]; nextCursor: string | null };

/**
 * HR leave-requests inbox server component. Reads `cursor` from searchParams
 * and paginates through /leave-requests.
 *
 * @derives(master-plan §G)
 */
export default async function HrLeaveRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  await requireRole('HR');
  const { cursor } = await searchParams;
  const query = `/leave-requests?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
  const data = await fetchJson<Listing<LeaveRequestSummary>>(query);
  return (
    <section>
      <header className={styles.header}>
        <h1>Leave requests</h1>
      </header>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Worker</th>
            <th>From</th>
            <th>To</th>
            <th>Reason</th>
            <th>State</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {data.items.length === 0 ? (
            <tr>
              <td colSpan={7} className={styles.empty}>
                No leave requests in your pod.
              </td>
            </tr>
          ) : (
            data.items.map((item) => (
              <tr key={item.id}>
                <td>{item.workerId.slice(0, 8)}…</td>
                <td>{item.fromDate}</td>
                <td>{item.toDate}</td>
                <td>{item.reason}</td>
                <td>{item.state}</td>
                <td>{new Date(item.createdAt).toISOString().slice(0, 10)}</td>
                <td>
                  <Link href={`/hr/leave-requests/${item.id}`} className={styles.viewLink}>
                    Decide
                  </Link>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {data.nextCursor ? (
        <div className={styles.pagination}>
          <Link
            href={`/hr/leave-requests?cursor=${encodeURIComponent(data.nextCursor)}`}
            className={styles.pageLink}
          >
            Next
          </Link>
        </div>
      ) : null}
    </section>
  );
}
