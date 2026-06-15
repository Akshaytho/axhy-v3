/**
 * HR Site detail route — /hr/sites/[id]. Fetch the owned site + roster +
 * supervisors + today coverage, render the v6 SiteDetail. Auth enforced by the
 * /hr layout; backend 404s sites the HR doesn't own.
 * @derives(master-plan §G)
 */
import { notFound } from 'next/navigation';

import { getSiteDetail } from '../../../../features/hr/data';
import { SiteDetail } from '../../../../features/hr/sites/SiteDetail';
import { ApiError } from '../../../../lib/api';

export default async function HrSiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const data = await getSiteDetail(id);
    return <SiteDetail data={data} />;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
}
