/**
 * Vitest configuration for @axhy/knowledge-graph.
 * Tests live in test/ (not src/) to keep test fixtures separate from
 * the builder source that gets published.
 *
 * @derives(ADR-0002)
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
