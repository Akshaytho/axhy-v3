/**
 * HR site detail page — /hr/sites/[id].
 *
 * [ORCHESTRATOR_EXCEPTION] sub-agent dispatched for HR A1 task 17
 *
 * Server component. Gates on HR role, then in parallel fetches the site
 * row and its supervisor bindings. Cross-tenant access yields 404 from
 * the backend → notFound() so the HR sees a clean 404 page rather than
 * a stack trace.
 *
 * Renders a definition list (Name, State, Address, Lat/Lng, Workdays) and
 * a read-only bindings table (Supervisor, Effective from, Effective until,
 * Reason, Acting-for). The "Add binding" link lives above the table.
 *
 * @derives(master-plan §G)
 */

import Link from 'next/link';
import { notFound } from 'next/navigation';

import { fetchJson, ApiError } from '../../../../lib/api';
import { requireRole } from '../../../../lib/auth';
import styles from '../styles.module.css';

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

type BindingDTO = {
  id: string;
  supervisorUserId: string;
  supervisorName: string | null;
  supervisorPhone: string | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
  actingForUserId: string | null;
  reason: string | null;
  createdAt: string;
};

type Listing<T> = { items: T[]; nextCursor: string | null };

/**
 * Format an ISO datetime for compact table display. Falls back to the raw
 * string if Date parsing fails.
 *
 * @derives(master-plan §G)
 */
function fmtDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace('T', ' ').slice(0, 16);
}

/**
 * Format the optional lat/lng pair as a "lat, lng" pair, or em-dash when
 * either coordinate is missing.
 *
 * @derives(master-plan §G)
 */
function fmtLatLng(lat: number | null, lng: number | null): string {
  if (lat === null || lng === null) return '—';
  return `${lat}, ${lng}`;
}

/**
 * HR site detail server component. Fetches site + bindings in parallel.
 *
 * @derives(master-plan §G)
 */
export default async function HrSiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole('HR');
  const { id } = await params;
  let site: SiteDTO;
  let bindings: Listing<BindingDTO>;
  try {
    [site, bindings] = await Promise.all([
      fetchJson<SiteDTO>(`/admin/sites/${id}`),
      fetchJson<Listing<BindingDTO>>(`/admin/sites/${id}/bindings?limit=50`),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }
  return (
    <section className={styles.detail}>
      <header className={styles.header}>
        <h1>{site.name}</h1>
        <Link href="/hr/sites" className={styles.pageLink}>
          Back to sites
        </Link>
      </header>

      <dl className={styles.dl}>
        <dt>Name</dt>
        <dd>{site.name}</dd>
        <dt>State</dt>
        <dd>{site.state}</dd>
        <dt>Address</dt>
        <dd>{site.address ?? '—'}</dd>
        <dt>Lat / Lng</dt>
        <dd>{fmtLatLng(site.latitude, site.longitude)}</dd>
        <dt>Workdays</dt>
        <dd>{site.workdays ?? '—'}</dd>
      </dl>

      <div>
        <div className={styles.sectionHeader}>
          <h2>Supervisor bindings</h2>
          <Link href={`/hr/sites/${id}/bindings/new`} className={styles.primaryLink}>
            Add binding
          </Link>
        </div>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Supervisor</th>
              <th>Effective from</th>
              <th>Effective until</th>
              <th>Reason</th>
              <th>Acting for</th>
            </tr>
          </thead>
          <tbody>
            {bindings.items.length === 0 ? (
              <tr>
                <td colSpan={5} className={styles.empty}>
                  No bindings yet.
                </td>
              </tr>
            ) : (
              bindings.items.map((b) => (
                <tr key={b.id}>
                  <td>
                    {b.supervisorName ?? b.supervisorUserId}
                    {b.supervisorPhone ? ` (${b.supervisorPhone})` : ''}
                  </td>
                  <td>{fmtDateTime(b.effectiveFrom)}</td>
                  <td>{fmtDateTime(b.effectiveUntil)}</td>
                  <td>{b.reason ?? '—'}</td>
                  <td>{b.actingForUserId ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
