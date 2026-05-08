/**
 * Singleton QueryClient for the mobile app.
 *
 * @derives(ADR-0011)
 */

import { QueryClient } from '@tanstack/react-query';

/** @derives(ADR-0011) */

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});
