/**
 * HR Updates route — /hr/updates. Fetches the caller's published updates
 * (GET /hr/updates) and the supervisors on their sites (GET /hr/team, for the
 * targeting dropdown + ack-report preview) and renders the v6 UpdatesScreen.
 * Publishing is live (POST /hr/updates); supervisor read + 5-word ack already
 * existed. Auth enforced by the /hr layout.
 * @derives(master-plan §G)
 */
import { getUpdates, getTeam } from '../../../features/hr/data';
import { UpdatesScreen } from '../../../features/hr/updates/UpdatesScreen';

export default async function HrUpdatesPage() {
  const [{ updates }, { members }] = await Promise.all([getUpdates(), getTeam()]);
  const supervisors = members
    .filter((m) => m.role === 'SUPERVISOR')
    .map((m) => ({ userId: m.userId, name: m.name }));
  return <UpdatesScreen updates={updates} supervisors={supervisors} />;
}
