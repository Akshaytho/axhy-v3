/**
 * Workers list route — /hr/workers. Thin: fetch the HR-scoped worker list,
 * render the feature component. Auth enforced by the /hr layout.
 * @derives(master-plan §G)
 */
import { listWorkers } from '../../../features/hr/data';
import { WorkersList } from '../../../features/hr/workers/WorkersList';

export default async function WorkersPage() {
  const { items } = await listWorkers();
  return <WorkersList workers={items} />;
}
