/**
 * Capture-flow Stack layout — wraps the capture steps in their own
 * stack so back-navigation between steps doesn't pop the worker out of the
 * (worker) tab tree.
 *
 * All steps are fully implemented (qr-scan, before/after photos, timer,
 * review, submit) — no longer scaffold-only.
 *
 * @derives(WORKER_MVP_SLICE_2A_PLAN.md §7)
 * @derives(MVP_V2_ALIGNED_PLAN.md §2)
 */

import { Stack } from 'expo-router';

/** @derives(master-plan §G) */
export default function CaptureLayout(): React.JSX.Element {
  return <Stack screenOptions={{ headerShown: false }} />;
}
