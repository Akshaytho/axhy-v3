/**
 * Sites list route — /hr/sites. Thin: fetch HR-owned sites, render the feature
 * component. Auth enforced by the /hr layout.
 * @derives(master-plan §G)
 */
import { listSites } from '../../../features/hr/data';
import { SitesList } from '../../../features/hr/sites/SitesList';

export default async function SitesPage() {
  const { items } = await listSites();
  return <SitesList sites={items} />;
}
