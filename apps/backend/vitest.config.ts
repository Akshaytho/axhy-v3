/// @derives(ADR-0004)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    testTimeout: 30_000,
    // Integration tests hit Railway Postgres remotely; parallel beforeAll
    // hooks across files contend for connections, occasionally exceeding
    // vitest's 10s default. Match the testTimeout.
    hookTimeout: 30_000,
  },
});
