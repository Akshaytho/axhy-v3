/**
 * Stack wrapper for the visit/[id] dynamic-route sub-tree.
 *
 * Without this file, Expo Router auto-registers [id].tsx as an extra tab
 * child of the worker Tabs (visible as a stray grey-stripe icon in the
 * bottom bar even with href:null on the Tabs.Screen). The Stack wrapper
 * makes the sub-tree a single unit Tabs.Screen name="visit" can fully hide.
 *
 * @derives(WORKER_MVP_SLICE_2A_PLAN.md §1)
 */

import { Stack } from 'expo-router';

/** @derives(master-plan §G) */
export default function VisitLayout(): React.JSX.Element {
  return <Stack screenOptions={{ headerShown: false }} />;
}
