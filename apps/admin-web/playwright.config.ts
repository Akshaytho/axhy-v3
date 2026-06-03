// @ts-expect-error — @playwright/test installed by operator at run-time per e2e/README.md
import { defineConfig } from '@playwright/test';

/**
 * @derives(master-plan §G)
 *
 * Playwright config for HR A1 water-flow.
 * Authored ahead-of-install: @playwright/test is not in devDependencies this
 * session. Operator runs `pnpm --filter admin-web add -D @playwright/test`
 * + `pnpm --filter admin-web exec playwright install --with-deps chromium`
 * before executing the spec. See apps/admin-web/e2e/README.md.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3001',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://localhost:3001',
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
