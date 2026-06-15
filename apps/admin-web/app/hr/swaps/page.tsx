/**
 * HR Swaps route — /hr/swaps. Read-only oversight preview (v6 marks this
 * not-live: no HR swap read endpoint yet). Auth enforced by the /hr layout.
 * @derives(master-plan §G)
 */
import { SwapsScreen } from '../../../features/hr/oversight/SwapsScreen';

export default function HrSwapsPage() {
  return <SwapsScreen />;
}
