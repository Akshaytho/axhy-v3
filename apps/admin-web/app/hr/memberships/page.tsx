/**
 * HR Team route — /hr/memberships. Fetch HR + supervisors connected to owned
 * sites (with real site counts), render the v6 TeamScreen. Invite-supervisor
 * runs through a server action over POST /admin/memberships. Auth enforced by
 * the /hr layout.
 * @derives(master-plan §G)
 */
import { getTeam } from '../../../features/hr/data';
import { TeamScreen } from '../../../features/hr/team/TeamScreen';

export default async function HrTeamPage() {
  const { members } = await getTeam();
  return <TeamScreen members={members} />;
}
