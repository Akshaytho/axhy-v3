/**
 * HR Complaints route — /hr/complaints. Fetch the name-enriched complaints list
 * + the HR's active sites (for the "Log complaint" dropdown), render the v6
 * ComplaintsScreen. Reply / resolve / log run through server actions over the
 * real complaint endpoints. Auth enforced by the /hr layout.
 * @derives(master-plan §G)
 */
import { getComplaints, listSites } from '../../../features/hr/data';
import { ComplaintsScreen } from '../../../features/hr/complaints/ComplaintsScreen';

export default async function HrComplaintsPage() {
  const [{ complaints }, { items: sites }] = await Promise.all([getComplaints(), listSites()]);
  const activeSites = sites
    .filter((s) => s.state === 'ACTIVE')
    .map((s) => ({ id: s.id, name: s.name }));
  return <ComplaintsScreen complaints={complaints} sites={activeSites} />;
}
