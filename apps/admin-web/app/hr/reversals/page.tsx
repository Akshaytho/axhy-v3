/**
 * HR Reversals route — /hr/reversals. Preview (v6 marks the whole HR reversal
 * surface as new). Auth enforced by the /hr layout.
 * @derives(master-plan §G)
 */
import { ReversalsScreen } from '../../../features/hr/oversight/ReversalsScreen';

export default function HrReversalsPage() {
  return <ReversalsScreen />;
}
