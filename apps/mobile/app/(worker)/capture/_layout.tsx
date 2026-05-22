/**
 * Capture-flow Stack layout — wraps the six placeholder steps in their own
 * stack so back-navigation between steps doesn't pop the worker out of the
 * (worker) tab tree.
 *
 * Scaffold-only this slice. Real step contents land in 2b-2/2b-3.
 *
 * @derives(WORKER_MVP_SLICE_2A_PLAN.md §7)
 * @derives(MVP_V2_ALIGNED_PLAN.md §2)
 */

import { Stack } from 'expo-router';

/** @derives(master-plan §G) */
export default function CaptureLayout(): React.JSX.Element {
  return <Stack screenOptions={{ headerShown: false }} />;
}
