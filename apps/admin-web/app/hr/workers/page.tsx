/**
 * HR workers list page — /hr/workers.
 *
 * [ORCHESTRATOR_EXCEPTION] sub-agent dispatched for HR A1 task 16
 *
 * Server component. Gates on HR role, then fetches /admin/workers with
 * an optional cursor from the URL search params (?cursor=…). Renders a
 * read-only table (Name, Phone, Status, PodId) with a per-row View link
 * to /hr/workers/[workerId], an Invite link to /hr/workers/new, and a
 * "Next" pagination link when nextCursor is present.
 *
 * Backend already filters by companyId from the session token; this list
 * is naturally tenant-scoped.
 *
 * @derives(master-plan §G)
 */

import Link from 'next/link';

import { fetchJson } from '../../../lib/api';
import { requireRole } from '../../../lib/auth';

import styles from './styles.module.css';

type WorkerListItem = {
  workerId: string;
  userId: string;
  membershipId: string;
  status: string;
  podId: string | null;
  name: string;
  phone: string;
  anonymizedPhone: boolean;
  createdAt: string;
};

type Listing<T> = { items: T[]; nextCursor: string | null };

/**
 * HR workers list server component. Reads `cursor` from searchParams and
 * paginates through /admin/workers.
 *
 * @derives(master-plan §G)
 */
export default async function HrWorkersPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  await requireRole('HR');
  const { cursor } = await searchParams;
  const query = `/admin/workers?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
  const data = await fetchJson<Listing<WorkerListItem>>(query);
  return (
    <section>
      <header className={styles.header}>
        <h1>Workers</h1>
        <Link href="/hr/workers/new" className={styles.primaryLink}>
          Invite worker
        </Link>
      </header>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Phone</th>
            <th>Status</th>
            <th>Pod</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {data.items.length === 0 ? (
            <tr>
              <td colSpan={5} className={styles.empty}>
                No workers yet.
              </td>
            </tr>
          ) : (
            data.items.map((item) => (
              <tr key={item.workerId}>
                <td>{item.name}</td>
                <td>{item.phone}</td>
                <td>{item.status}</td>
                <td>{item.podId ?? '—'}</td>
                <td>
                  <Link href={`/hr/workers/${item.workerId}`} className={styles.viewLink}>
                    View
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
            href={`/hr/workers?cursor=${encodeURIComponent(data.nextCursor)}`}
            className={styles.pageLink}
          >
            Next
          </Link>
        </div>
      ) : null}
    </section>
  );
}
