/**
 * HR memberships list page — /hr/memberships.
 *
 * [ORCHESTRATOR_EXCEPTION] sub-agent dispatched for HR A1 task 15
 *
 * Server component. Gates on HR role, then fetches /admin/memberships with
 * an optional cursor from the URL search params (?cursor=…). Renders a
 * read-only table (Name, Phone, Role, Status, PodId) plus an Invite link
 * to /hr/memberships/new and a "Next" pagination link when nextCursor is
 * present in the backend response.
 *
 * No row actions: per the HR A1 thin-portal scope, mutations live on the
 * /hr/memberships/new page only. Backend already filters by companyId from
 * the session token, so this list is naturally tenant-scoped.
 *
 * @derives(master-plan §G)
 */

import Link from 'next/link';

import { fetchJson } from '../../../lib/api';
import { requireRole } from '../../../lib/auth';

import styles from './styles.module.css';

type MembershipDTO = {
  id: string;
  userId: string;
  role: string;
  status: string;
  podId: string | null;
  name: string;
  phone: string;
  createdAt: string;
};

type Listing<T> = { items: T[]; nextCursor: string | null };

/**
 * HR memberships list server component. Reads `cursor` from searchParams and
 * paginates through /admin/memberships.
 *
 * @derives(master-plan §G)
 */
export default async function HrMembershipsPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  await requireRole('HR');
  const { cursor } = await searchParams;
  const query = `/admin/memberships?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
  const data = await fetchJson<Listing<MembershipDTO>>(query);
  return (
    <section>
      <header className={styles.header}>
        <h1>Memberships</h1>
        <Link href="/hr/memberships/new" className={styles.primaryLink}>
          Invite member
        </Link>
      </header>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Phone</th>
            <th>Role</th>
            <th>Status</th>
            <th>Pod</th>
          </tr>
        </thead>
        <tbody>
          {data.items.length === 0 ? (
            <tr>
              <td colSpan={5} className={styles.empty}>
                No memberships yet.
              </td>
            </tr>
          ) : (
            data.items.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.phone}</td>
                <td>{item.role}</td>
                <td>{item.status}</td>
                <td>{item.podId ?? '—'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {data.nextCursor ? (
        <div className={styles.pagination}>
          <Link
            href={`/hr/memberships?cursor=${encodeURIComponent(data.nextCursor)}`}
            className={styles.pageLink}
          >
            Next
          </Link>
        </div>
      ) : null}
    </section>
  );
}
