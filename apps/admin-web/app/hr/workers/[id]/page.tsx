/**
 * Worker detail route — /hr/workers/[id] (id is Worker.id). Thin: fetch the
 * worker, render the feature component; 404 → Next not-found. Auth via layout.
 * @derives(master-plan §G)
 */
import { notFound } from 'next/navigation';

import { getWorker } from '../../../../features/hr/data';
import { WorkerDetail } from '../../../../features/hr/workers/WorkerDetail';
import { ApiError } from '../../../../lib/api';

export default async function WorkerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const w = await getWorker(id);
    return <WorkerDetail w={w} />;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
}
