/**
 * Capture step 3 — Cleaning timer (placeholder).
 *
 * Real implementation: minimum-duration timer plus GPS dwell check plus
 * accelerometer-based motion sampling, all running with the screen kept
 * awake. Anti-fraud detection lives here. Timer + sensors land in 2b-3.
 *
 * @derives(WORKER_MVP_SLICE_2A_PLAN.md §7)
 */

import { useLocalSearchParams } from 'expo-router';

import { CaptureStepShell } from '../../../../components/worker/capture/CaptureStepShell';

/** @derives(master-plan §G) */
export default function TimerStep(): React.JSX.Element {
  const { visitId } = useLocalSearchParams<{ visitId: string }>();
  return (
    <CaptureStepShell
      visitId={visitId ?? ''}
      step="timer"
      title="Cleaning timer"
      body="Start the timer when you begin cleaning. GPS and motion checks verify you're at the site and actively working. The timer and sensor logic land in slice 2b-3."
    />
  );
}
