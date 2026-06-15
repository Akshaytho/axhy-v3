/**
 * Today board route — /hr/today. Thin: fetch live coverage, render the feature
 * component. Auth enforced by the /hr layout.
 * @derives(master-plan §G)
 */
import { getToday } from '../../../features/hr/data';
import { TodayBoard } from '../../../features/hr/today/TodayBoard';

export default async function TodayPage() {
  const data = await getToday();
  return <TodayBoard data={data} />;
}
