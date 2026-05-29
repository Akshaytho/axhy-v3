// @ts-expect-error — @playwright/test installed by operator at run-time. See e2e/README.md.
import { test, expect, type Page } from '@playwright/test';

/**
 * @derives(spec §7.3 — HR A1 water-flow)
 *
 * Pre-seeded HR account required. Set:
 *   E2E_HR_PHONE                       — HR account phone (with country code)
 *   E2E_SEEDED_SUPERVISOR_USER_ID      — User.id of a SUPERVISOR in same tenant (optional)
 *   E2E_SEEDED_LEAVE_REQUEST_ID        — LeaveRequest.id PENDING for an HR-scoped worker (optional)
 *
 * Backend must run with AXHY_OTP_BYPASS=1 so OTP "000000" is accepted.
 */

const HR_PHONE = process.env.E2E_HR_PHONE;
const STAMP = Date.now().toString().slice(-7);

test.describe.serial('HR A1 water-flow', () => {
  test.skip(!HR_PHONE, 'E2E_HR_PHONE not set — seed an HR account and export E2E_HR_PHONE to run');

  async function loginAsHr(page: Page): Promise<void> {
    await page.goto('/login');
    await page.fill('input[name="phone"]', HR_PHONE!);
    await page.click('button:has-text("Send OTP")');
    // Backend AXHY_OTP_BYPASS=1 accepts code "000000" in dev/test envs.
    await page.fill('input[name="otp"]', '000000');
    await page.click('button:has-text("Verify")');
    await expect(page).toHaveURL(/\/hr$/);
  }

  test('login lands on /hr dashboard', async ({ page }) => {
    await loginAsHr(page);
    await expect(page.locator('h1')).toContainText('HR dashboard');
  });

  test('invite SUPERVISOR membership', async ({ page }) => {
    await loginAsHr(page);
    await page.goto('/hr/memberships/new');
    const phone = `+155500${STAMP}1`;
    await page.fill('input[name="phone"]', phone);
    await page.fill('input[name="name"]', `Supervisor ${STAMP}`);
    await page.selectOption('select[name="role"]', 'SUPERVISOR');
    await page.fill('input[name="baseSalaryPaise"]', '5000000');
    await page.click('button[type="submit"]');
    await page.goto('/hr/memberships');
    await expect(page.locator('table')).toContainText(phone);
  });

  test('invite WORKER + see in list', async ({ page }) => {
    await loginAsHr(page);
    await page.goto('/hr/workers/new');
    const phone = `+155500${STAMP}2`;
    await page.fill('input[name="phone"]', phone);
    await page.fill('input[name="name"]', `Worker ${STAMP}`);
    await page.fill('input[name="baseSalaryPaise"]', '3000000');
    await page.click('button[type="submit"]');
    await page.goto('/hr/workers');
    await expect(page.locator('table')).toContainText(phone);
  });

  test('worker detail → anonymize', async ({ page }) => {
    await loginAsHr(page);
    await page.goto('/hr/workers');
    const row = page.locator('table tr', { hasText: `Worker ${STAMP}` });
    await row.locator('a:has-text("View")').click();
    await page.click('button:has-text("Anonymize")');
    await page.fill('textarea[name="reason"]', 'E2E test cleanup');
    await page.click('button:has-text("Confirm")');
    await expect(page.locator('text=Resigned')).toBeVisible();
  });

  test('create site + see in list', async ({ page }) => {
    await loginAsHr(page);
    await page.goto('/hr/sites/new');
    const name = `Site ${STAMP}`;
    await page.fill('input[name="name"]', name);
    await page.fill('textarea[name="address"]', '123 Test Lane');
    await page.click('button[type="submit"]');
    await page.goto('/hr/sites');
    await expect(page.locator('table')).toContainText(name);
  });

  test('add binding to site', async ({ page }) => {
    await loginAsHr(page);
    await page.goto('/hr/sites');
    const row = page.locator('table tr', { hasText: `Site ${STAMP}` });
    await row.locator('a:has-text("View")').click();
    await page.click('a:has-text("Add binding")');
    // Note: SupervisorUserId must be the User.id of the supervisor invited
    // earlier. Production E2E should fetch this via API; for now operator
    // copies from DB after seed.
    const supervisorUserId = process.env.E2E_SEEDED_SUPERVISOR_USER_ID;
    test.skip(!supervisorUserId, 'E2E_SEEDED_SUPERVISOR_USER_ID not set');
    await page.fill('input[name="supervisorUserId"]', supervisorUserId!);
    const now = new Date().toISOString().slice(0, 16);
    await page.fill('input[name="effectiveFrom"]', now);
    await page.fill('textarea[name="reason"]', 'E2E binding test');
    await page.click('button[type="submit"]');
    await expect(page.locator('table')).toContainText(supervisorUserId!);
  });

  test('approve seeded leave request', async ({ page }) => {
    test.skip(!process.env.E2E_SEEDED_LEAVE_REQUEST_ID, 'no seeded leave request');
    await loginAsHr(page);
    await page.goto('/hr/leave-requests');
    const rowSelector = `table tr:has-text("${process.env.E2E_SEEDED_LEAVE_REQUEST_ID!.slice(0, 8)}")`;
    await page.locator(rowSelector).locator('a:has-text("Decide")').click();
    await page.fill('textarea[name="decisionNote"]', 'E2E approval');
    await page.click('button:has-text("Approve")');
    await page.goto('/hr/leave-requests');
    await expect(page.locator(rowSelector)).toHaveCount(0);
  });

  test('logout returns to /login', async ({ page }) => {
    await loginAsHr(page);
    await page.click('button:has-text("Log out")');
    await expect(page).toHaveURL(/\/login$/);
  });
});
