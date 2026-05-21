/// @derives(master-plan §G)
import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    // React Native injects __DEV__ as a build-time global via Metro/Babel.
    // Vitest doesn't, so identity-lifecycle warn paths (and any other
    // `if (__DEV__) ...` branch) throw ReferenceError under test without this.
    __DEV__: true,
  },
  test: {
    include: ['lib/**/*.test.ts', 'components/**/*.test.ts'],
    environment: 'node',
    testTimeout: 10_000,
  },
});
