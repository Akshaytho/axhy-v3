/**
 * HR dashboard — landing page for the HR persona at /hr.
 *
 * [ORCHESTRATOR_EXCEPTION] sub-agent dispatched for HR A1 task 14
 *
 * Server component. Gates on HR role, then issues four parallel
 * read-only fetches to the backend:
 *   - /admin/memberships?limit=1
 *   - /admin/workers?limit=1
 *   - /admin/sites?limit=1
 *   - /leave-requests?limit=50
 *
 * Each endpoint returns `{ items, nextCursor }`. The dashboard shows a
 * definition list of visible counts. When `nextCursor` is non-null we
 * suffix "+" to indicate "there are more" — a real count endpoint can
 * be added later if HR ever needs it. For the dashboard "1+" is enough.
 *
 * @derives(master-plan §G)
 */

import { fetchJson } from '../../lib/api';
import { requireRole } from '../../lib/auth';

type Listing<T> = { items: T[]; nextCursor: string | null };

/**
 * HR dashboard server component.
 *
 * @derives(master-plan §G)
 */
export default async function HrDashboard() {
  await requireRole('HR');
  const [members, workers, sites, leaves] = await Promise.all([
    fetchJson<Listing<unknown>>('/admin/memberships?limit=1'),
    fetchJson<Listing<unknown>>('/admin/workers?limit=1'),
    fetchJson<Listing<unknown>>('/admin/sites?limit=1'),
    fetchJson<Listing<unknown>>('/leave-requests?limit=50'),
  ]);
  return (
    <section>
      <h1>HR dashboard</h1>
      <dl>
        <dt>Memberships visible</dt>
        <dd>
          {members.items.length}
          {members.nextCursor ? '+' : ''}
        </dd>
        <dt>Workers visible</dt>
        <dd>
          {workers.items.length}
          {workers.nextCursor ? '+' : ''}
        </dd>
        <dt>Sites visible</dt>
        <dd>
          {sites.items.length}
          {sites.nextCursor ? '+' : ''}
        </dd>
        <dt>Pending leave requests</dt>
        <dd>
          {leaves.items.length}
          {leaves.nextCursor ? '+' : ''}
        </dd>
      </dl>
    </section>
  );
}
