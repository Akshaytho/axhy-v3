/**
 * HR Policies route — /hr/policies. Fetches current value per policy key
 * (GET /admin/policy) and renders the v6 PoliciesScreen. History loads on
 * demand per row; edits append via POST /admin/policy. Auth enforced by the
 * /hr layout.
 * @derives(master-plan §G)
 */
import { getPolicies } from '../../../features/hr/data';
import { PoliciesScreen } from '../../../features/hr/policies/PoliciesScreen';

export default async function HrPoliciesPage() {
  const { policies } = await getPolicies();
  return <PoliciesScreen policies={policies} />;
}
