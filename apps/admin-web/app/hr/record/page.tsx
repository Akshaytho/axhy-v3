/**
 * HR Record route — /hr/record. Fetch the audit ledger + flagged visits, render
 * the v6 RecordScreen. `?view=flagged` deep-links the Flagged-visits tab (the
 * dashboard's Today's-visits strip points here). Auth enforced by the /hr layout.
 * @derives(master-plan §G)
 */
import { getAudit } from '../../../features/hr/data';
import { RecordScreen } from '../../../features/hr/record/RecordScreen';

export default async function HrRecordPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const [{ events, flaggedVisits }, sp] = await Promise.all([getAudit(), searchParams]);
  return <RecordScreen data={{ events, flaggedVisits }} initial={sp.view} />;
}
