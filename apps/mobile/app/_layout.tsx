/**
 * Root layout — boots the mobile app, gates by JWT presence, mounts
 * QueryClientProvider for the entire tree.
 *
 * @derives(ADR-0007)
 * @derives(ADR-0021)
 */

import { useEffect, useState } from 'react';
import { Stack, router } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';

import { getTokens } from '../lib/auth-store';
import { queryClient } from '../lib/query-client';

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getTokens()
      .then((tokens) => {
        if (tokens) {
          router.replace('/(supervisor)/profile');
        } else {
          router.replace('/(auth)/phone');
        }
      })
      .finally(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  );
}
