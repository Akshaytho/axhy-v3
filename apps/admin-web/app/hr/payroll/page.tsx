/**
 * HR Payroll route — /hr/payroll. Fetch the month's per-worker pay (base −
 * deductions), render the v6 PayrollScreen. Auth enforced by the /hr layout.
 * @derives(master-plan §G)
 */
import { getPayroll } from '../../../features/hr/data';
import { PayrollScreen } from '../../../features/hr/payroll/PayrollScreen';

export default async function HrPayrollPage() {
  const data = await getPayroll();
  return <PayrollScreen data={data} />;
}
