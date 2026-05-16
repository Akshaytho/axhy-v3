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
 * F-006a: also fires `initializeOneSignal()` once on mount — the
 * `app.config.ts` plugin wires native build capabilities, but the JS SDK
 * requires an explicit `OneSignal.initialize(appId)` before any
 * `login` / `logout` / `Notifications.requestPermission` call has any
 * effect. The call is idempotent + no-ops cleanly on web / no App ID
 * (auth flow still succeeds; push lifecycle just no-ops with a warning).
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
