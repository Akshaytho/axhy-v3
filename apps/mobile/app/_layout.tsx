/**
 * Root layout — boots the mobile app, mounts QueryClientProvider +
 * SafeAreaProvider for the entire tree. Auth gating lives in
 * `app/index.tsx` so the navigator mounts immediately (expo-router v6
 * requires the navigator present before imperative navigation
 * resolves).
 *
 * SafeAreaProvider is required by every SafeAreaView / useSafeAreaInsets
 * call downstream — without it, content under notches / home-indicators
 * / on-screen Android nav bars would render incorrectly across phone
 * form factors.
 *
 * F-006a: also fires `initializeOneSignal()` once on mount as a WARM-UP.
 * The load-bearing init-before-use guarantee lives inside `_resolveOneSignal()`
 * in `lib/identity-lifecycle.ts` — every lifecycle path (`onIdentifiedLogin`
 * / `onAppLogout` / `onColdStartReady` / the prompt's default
 * `requestPermission`) awaits init before its first SDK call. The warm-up
 * here pre-pays the cost so the first lifecycle call doesn't pay the SDK-init
 * latency. React useEffect mount order is child-before-parent, so child
 * routes' effects could otherwise hit the lifecycle chokepoint before this
 * parent useEffect fires — that's exactly why the guarantee lives inside
 * the chokepoint, not here. `initializeOneSignal()` is idempotent, so the
 * double-call (warm-up + chokepoint) is safe.
 *
 * @derives(ADR-0007)
 * @derives(ADR-0021)
 * @derives(F-006a CODE-phase friend P1 fix 2026-05-17)
 */

import { useEffect } from 'react';
import { Slot } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';

import { queryClient } from '../lib/query-client';
import { initializeOneSignal } from '../lib/identity-lifecycle';

export default function RootLayout() {
  useEffect(() => {
    initializeOneSignal();
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <Slot />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
