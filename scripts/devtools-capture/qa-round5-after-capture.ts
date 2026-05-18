/**
 * Round 5 — AFTER capture for Axhy v3 supervisor app.
 *
 * Verifying visual deltas from commits:
 *   ff7a4fe + 434cdb9 + e41e296
 *
 * This script is INTENTIONALLY light: it captures one screenshot per screen
 * after data has loaded. No assertions, no bug finding. The human reviewer
 * compares vs the round-3 baseline.
 *
 * Screens captured (8):
 *   1. today.png
 *   2. decisions.png
 *   3. activity.png
 *   4. summary.png
 *   5. updates.png
 *   6. profile.png
 *   7. sites.png
 *   8. decisions-stale-zoom.png (best effort — scrolls to "STALE" header if present)
 *
 * Output dir:
 *   apps/mobile/screenshots-sprint-2/qa-round5-after/
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { chromium, devices, type Page, type BrowserContext } from '@playwright/test';

const WEB_URL = process.env.AXHY_WEB_URL ?? 'http://172.20.10.6:8081';
const API_URL = process.env.AXHY_API_URL ?? 'http://172.20.10.6:4000';
const PHONE = '+919999999999';
const OTP = '123456';

const OUT_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  'apps/mobile/screenshots-sprint-2/qa-round5-after',
);

async function safeMkdir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true });
}

async function shot(page: Page, name: string): Promise<string> {
  const filePath = path.join(OUT_DIR, `${name}.png`);
  try {
    await page.screenshot({ path: filePath, fullPage: true });
  } catch {
    try {
      await page.screenshot({ path: filePath, fullPage: false });
    } catch {
      return '<screenshot failed>';
    }
  }
  console.log(`  [shot] ${name}.png`);
  return filePath;
}

async function injectTokensViaBackend(page: Page): Promise<void> {
  console.log('[auth] requesting OTP via backend…');
  await fetch(`${API_URL}/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: PHONE }),
  });
  const r2 = await fetch(`${API_URL}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: PHONE, code: OTP }),
  });
  if (!r2.ok) throw new Error(`verify failed ${r2.status}`);
  const data = (await r2.json()) as {
    accessToken: string;
    refreshToken: string;
    memberships: Array<{ role: string }>;
  };
  const role = data.memberships?.[0]?.role ?? 'SUPERVISOR';
  await page.evaluate(
    ({ a, r, ro }) => {
      localStorage.setItem('axhy_access_token', a);
      localStorage.setItem('axhy_refresh_token', r);
      localStorage.setItem('axhy_active_role', ro);
    },
    { a: data.accessToken, r: data.refreshToken, ro: role },
  );
  console.log('[auth] tokens injected.');
}

async function gotoSafe(page: Page, urlPath: string): Promise<void> {
  console.log(`[goto] ${urlPath}`);
  try {
    await page.goto(`${WEB_URL}${urlPath}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
  } catch (err) {
    console.log(`  [goto] navigation issue: ${(err as Error).message}`);
  }
  try {
    await page.waitForLoadState('networkidle', { timeout: 8000 });
  } catch {
    /* ok */
  }
}

async function captureScreen(
  page: Page,
  urlPath: string,
  fileName: string,
  waitMs = 6000,
): Promise<void> {
  await gotoSafe(page, urlPath);
  await page.waitForTimeout(waitMs);
  await shot(page, fileName);
}

async function main(): Promise<void> {
  await safeMkdir(OUT_DIR);

  const browser = await chromium.launch({ headless: true });
  const context: BrowserContext = await browser.newContext({
    ...devices['iPhone 13 Mini'],
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    geolocation: { latitude: 17.385, longitude: 78.486 },
    permissions: ['geolocation'],
    colorScheme: 'light',
  });

  const page = await context.newPage();

  page.on('pageerror', (err) => {
    console.log(`[pageerror] ${err.name}: ${err.message}`);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log(`[console.error] ${msg.text().slice(0, 200)}`);
    }
  });

  // Initial load + token inject
  console.log('[init] loading web root…');
  await page.goto(WEB_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  try {
    await page.waitForLoadState('networkidle', { timeout: 10_000 });
  } catch {
    /* ok */
  }
  await page.waitForTimeout(800);

  try {
    await injectTokensViaBackend(page);
  } catch (err) {
    console.error('[auth] FAILED:', (err as Error).message);
    await browser.close();
    process.exit(2);
  }

  // 1. Today — needs ~6s wait, /today is slow
  await captureScreen(page, '/(supervisor)/today', 'today', 6500);

  // 2. Decisions
  await captureScreen(page, '/(supervisor)/decisions', 'decisions', 6000);

  // 2b. Decisions — try to find/scroll to the STALE section
  try {
    console.log('[stale-zoom] looking for STALE header…');
    const stale = page.locator('text=/STALE|OVER 48H|over 48h/i').first();
    const has = await stale.count();
    if (has > 0) {
      await stale.scrollIntoViewIfNeeded({ timeout: 3000 });
      await page.waitForTimeout(800);
      await shot(page, 'decisions-stale-zoom');
    } else {
      // capture lower-scroll view anyway — maybe muted card is below the fold
      await page.evaluate(() => window.scrollBy(0, 600));
      await page.waitForTimeout(500);
      await shot(page, 'decisions-stale-zoom');
      console.log('  [stale-zoom] no STALE header found — captured scrolled view as fallback');
    }
  } catch (e) {
    console.log(`  [stale-zoom] err: ${(e as Error).message}`);
  }

  // 3. Activity
  await captureScreen(page, '/(supervisor)/activity', 'activity', 4000);

  // 4. Summary
  await captureScreen(page, '/(supervisor)/summary', 'summary', 6000);

  // 5. Updates
  await captureScreen(page, '/(supervisor)/updates', 'updates', 4000);

  // 6. Profile
  await captureScreen(page, '/(supervisor)/profile', 'profile', 3000);

  // 7. Sites — wait ~6s after navigation (loader is slow)
  await captureScreen(page, '/(supervisor)/sites', 'sites', 6000);

  console.log(`\n[done] screenshots in: ${OUT_DIR}`);

  await context.close();
  await browser.close();
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
