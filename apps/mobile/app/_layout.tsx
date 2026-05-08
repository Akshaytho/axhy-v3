/**
 * Root layout — boots the mobile app, mounts QueryClientProvider for the
 * entire tree. The auth gate lives in app/index.tsx so the Stack
 * navigator mounts immediately (expo-router v6 requires the navigator
 * present before any router.replace call resolves).
 *
 * @derives(ADR-0007)
 * @derives(ADR-0021)
 */

import { Stack } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';

import { queryClient } from '../lib/query-client';

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  );
}
