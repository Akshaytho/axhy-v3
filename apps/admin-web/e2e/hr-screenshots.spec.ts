// [ORCHESTRATOR_EXCEPTION] HR A1 screenshot probe v2; networkidle->domcontentloaded to fix timeouts
/**
 * Screenshot-capture probe for HR A1 visual verification.
 *
 * Drives the real /login -> /hr flow using the seeded HR account and the
 * production-safe operator OTP bypass code '123456'. Writes screenshots of
 * every HR screen to docs/evidence/2026-05-30/ for EVID-HR-A1-PLAYWRIGHT.md.
 *
 * Env required:
 *   E2E_HR_PHONE                  - seeded HR phone (e.g. +919900001111)
 *   E2E_SEEDED_LEAVE_REQUEST_ID   - pending LeaveRequest id
 *
 * Reality notes:
 *   - login uses id="phone"/"otp"; verify button "Verify and continue"
 *   - bypass code '123456' (operator allowlist); dev runs on port 3000
 *   - /hr first-compile in Next.js dev takes ~10s; waitForURL budget 60s
 *   - leave-request detail page polls and never reaches networkidle in dev
 *     so we use domcontentloaded + a short settle instead
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test, expect, type Page } from '@playwright/test';

const HR_PHONE = process.env.E2E_HR_PHONE;
const LEAVE_REQUEST_ID = process.env.E2E_SEEDED_LEAVE_REQUEST_ID;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EVID_DIR = path.resolve(__dirname, '../../../docs/evidence/2026-05-30');

function shot(page: Page, name: string) {
  return page.screenshot({ path: path.join(EVID_DIR, `hr-${name}.png`), fullPage: true });
}

async function settle(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  // Give server components + first paint a moment; cheaper than networkidle.
  await page.waitForTimeout(800);
}

test.describe.serial('HR A1 screenshot capture', () => {
  test.skip(!HR_PHONE, 'E2E_HR_PHONE not set');
  test.use({ baseURL: 'http://localhost:3000' });

  test('login + dashboard + all HR screens', async ({ page }) => {
    test.setTimeout(360_000);
    // --- login ---
    await page.goto('/login');
    await shot(page, '00-login-phone');
    await page.locator('#phone').fill(HR_PHONE!);
    await page.getByRole('button', { name: /Send OTP/i }).click();
    await page.locator('#otp').waitFor({ timeout: 15_000 });
    await shot(page, '01-login-otp');
    await page.locator('#otp').fill('123456');
    await page.getByRole('button', { name: /Verify and continue/i }).click();
    // First-time HR route compile in Next.js dev can take 10-15s.
    await page.waitForURL(/\/hr(\/|$)/, { timeout: 60_000 });

    // --- dashboard ---
    await expect(page.locator('h1')).toContainText(/HR dashboard/i);
    await shot(page, '02-dashboard');

    // --- memberships list ---
    await page.goto('/hr/memberships');
    await settle(page);
    await shot(page, '03-memberships-list');

    // --- memberships invite form ---
    await page.goto('/hr/memberships/new');
    await settle(page);
    await shot(page, '04-memberships-new');

    // --- workers list ---
    await page.goto('/hr/workers');
    await settle(page);
    await shot(page, '05-workers-list');

    // --- workers invite form ---
    await page.goto('/hr/workers/new');
    await settle(page);
    await shot(page, '06-workers-new');

    // --- worker detail (pick first row's link; fall back to list shot if none) ---
    await page.goto('/hr/workers');
    await settle(page);
    const workerLinks = page.locator('a[href^="/hr/workers/"]');
    const wCount = await workerLinks.count();
    let detailHref: string | null = null;
    for (let i = 0; i < wCount; i++) {
      const href = await workerLinks.nth(i).getAttribute('href');
      if (href && href !== '/hr/workers/new') {
        detailHref = href;
        break;
      }
    }
    if (detailHref) {
      await page.goto(detailHref);
      await settle(page);
      await shot(page, '07-worker-detail');
    } else {
      // No worker rows seeded — capture the empty-list state so EVID is complete.
      await shot(page, '07-worker-detail-empty');
    }

    // --- sites list ---
    await page.goto('/hr/sites');
    await settle(page);
    await shot(page, '08-sites-list');

    // --- sites new ---
    await page.goto('/hr/sites/new');
    await settle(page);
    await shot(page, '09-sites-new');

    // --- site detail / bindings ---
    await page.goto('/hr/sites');
    await settle(page);
    const siteLinks = page.locator('a[href^="/hr/sites/"]');
    const sCount = await siteLinks.count();
    let siteHref: string | null = null;
    for (let i = 0; i < sCount; i++) {
      const href = await siteLinks.nth(i).getAttribute('href');
      if (href && href !== '/hr/sites/new') {
        siteHref = href;
        break;
      }
    }
    if (siteHref) {
      await page.goto(siteHref);
      await settle(page);
      await shot(page, '10-site-detail');
      await page.goto(siteHref + '/bindings');
      await settle(page);
      await shot(page, '11-site-bindings');
    }

    // --- leave-requests list ---
    await page.goto('/hr/leave-requests');
    await settle(page);
    await shot(page, '12-leave-requests-list');

    // --- leave-requests detail (if seeded id available) ---
    if (LEAVE_REQUEST_ID) {
      await page.goto(`/hr/leave-requests/${LEAVE_REQUEST_ID}`);
      await settle(page);
      await shot(page, '13-leave-request-detail');
    }
  });
});
