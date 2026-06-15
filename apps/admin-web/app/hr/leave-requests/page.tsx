/**
 * HR Leave route — /hr/leave-requests. Thin: fetch the whole Leave aggregate
 * (pending + decided history, enriched), render the v6 LeaveScreen. Approve /
 * reject run through server actions over the real decide endpoints. Auth is
 * enforced by the /hr layout.
 * @derives(master-plan §G)
 */
import { getLeave } from '../../../features/hr/data';
import { LeaveScreen } from '../../../features/hr/leave/LeaveScreen';

export default async function HrLeaveRequestsPage() {
  const data = await getLeave();
  return <LeaveScreen data={data} />;
}
