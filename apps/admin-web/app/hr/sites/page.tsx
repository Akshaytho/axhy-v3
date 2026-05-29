/**
 * HR sites list page — /hr/sites.
 *
 * [ORCHESTRATOR_EXCEPTION] sub-agent dispatched for HR A1 task 17
 *
 * Server component. Gates on HR role, then fetches /admin/sites with an
 * optional cursor from the URL search params (?cursor=…). Renders a read-only
 * table (Name, State, Address, View) plus a "New site" link to /hr/sites/new
 * and a "Next" pagination link when nextCursor is present in the backend
 * response.
 *
 * Addresses are truncated to 60 characters for table density. Mutations live
 * on dedicated pages (/hr/sites/new, /hr/sites/[id]/bindings/new). Backend
 * filters by companyId from the session token, so this list is naturally
 * tenant-scoped.
 *
 * @derives(master-plan §G)
 */

import Link from 'next/link';

import { fetchJson } from '../../../lib/api';
import { requireRole } from '../../../lib/auth';

import styles from './styles.module.css';

type SiteDTO = {
  id: string;
  name: string;
  state: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  workdays: string | null;
  createdAt: string;
};

type Listing<T> = { items: T[]; nextCursor: string | null };

/**
 * Truncate a string to `max` chars with a trailing ellipsis when clipped.
 *
 * @derives(master-plan §G)
 */
function truncate(value: string | null, max: number): string {
  if (!value) return '—';
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

/**
 * HR sites list server component. Reads `cursor` from searchParams and
 * paginates through /admin/sites.
 *
 * @derives(master-plan §G)
 */
export default async function HrSitesPage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string }>;
}) {
  await requireRole('HR');
  const { cursor } = await searchParams;
  const query = `/admin/sites?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
  const data = await fetchJson<Listing<SiteDTO>>(query);
  return (
    <section>
      <header className={styles.header}>
        <h1>Sites</h1>
        <Link href="/hr/sites/new" className={styles.primaryLink}>
          New site
        </Link>
      </header>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Name</th>
            <th>State</th>
            <th>Address</th>
            <th>View</th>
          </tr>
        </thead>
        <tbody>
          {data.items.length === 0 ? (
            <tr>
              <td colSpan={4} className={styles.empty}>
                No sites yet.
              </td>
            </tr>
          ) : (
            data.items.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.state}</td>
                <td>
                  <span className={styles.truncate}>{truncate(item.address, 60)}</span>
                </td>
                <td>
                  <Link href={`/hr/sites/${item.id}`} className={styles.pageLink}>
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
            href={`/hr/sites?cursor=${encodeURIComponent(data.nextCursor)}`}
            className={styles.pageLink}
          >
            Next
          </Link>
        </div>
      ) : null}
    </section>
  );
}
