/**
 * HR home (Dashboard) route. Thin: fetch real data + identity, render the
 * feature component. Auth is enforced by the /hr layout.
 * @derives(master-plan §G)
 */
import { HrDashboard } from '../../features/hr/dashboard/Dashboard';
import { getOverview } from '../../features/hr/data';
import { getMe } from '../../lib/me';

export default async function HrHomePage() {
  const [me, data] = await Promise.all([getMe().catch(() => null), getOverview()]);
  const firstName = (me?.user?.name ?? 'there').split(' ')[0] ?? 'there';
  return <HrDashboard firstName={firstName} data={data} />;
}
