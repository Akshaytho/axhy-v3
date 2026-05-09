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
 * @derives(ADR-0007)
 * @derives(ADR-0021)
 */

import { Slot } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';

import { queryClient } from '../lib/query-client';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <Slot />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
