/**
 * Focused diagnostic: what's actually in the DOM at /(supervisor)/today
 * after a successful sign-in? Captures the body innerText + element
 * counts + a non-throttled screenshot at 2× DPI (no CPU throttle, no
 * 3G) so we can tell if the blank-screen is a render bug vs. just slow
 * paint.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { chromium } from '@playwright/test';

const WEB_URL = process.env.AXHY_WEB_URL ?? 'http://172.20.10.6:8081';
const API_URL = process.env.AXHY_API_URL ?? 'http://172.20.10.6:4000';
const PHONE = '+919999999999';
const OTP = '123456';

const OUT = path.resolve(__dirname, '..', 'screenshots-sprint-2/qa-walkthrough/diagnose');

async function main(): Promise<void> {
  await fs.mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    colorScheme: 'light',
  });
  const page = await context.newPage();

  const allText: Array<{ step: string; text: string; html: string }> = [];

  // 1. Get tokens via backend
  await fetch(`${API_URL}/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: PHONE }),
  });
  const verifyResp = await fetch(`${API_URL}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: PHONE, code: OTP }),
  });
  const data = (await verifyResp.json()) as {
    accessToken: string;
    refreshToken: string;
    memberships: Array<{ role: string }>;
  };

  // 2. Visit root, inject tokens, visit again
  await page.goto(WEB_URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ({ a, r, ro }) => {
      localStorage.setItem('axhy_access_token', a);
      localStorage.setItem('axhy_refresh_token', r);
      localStorage.setItem('axhy_active_role', ro);
    },
    { a: data.accessToken, r: data.refreshToken, ro: data.memberships[0]?.role ?? 'SUPERVISOR' },
  );

  const screens = [
    '/(auth)/phone',
    '/(supervisor)/today',
    '/(supervisor)/decisions',
    '/(supervisor)/activity',
    '/(supervisor)/chat',
    '/(supervisor)/profile',
    '/(supervisor)/sites',
    '/(supervisor)/memory',
    '/(supervisor)/summary',
    '/(supervisor)/updates',
    '/(supervisor)/replacement-picker',
  ];

  for (const s of screens) {
    const stepName = s.replace(/[()/]/g, '_');
     
    console.log(`\n--- ${s} ---`);
    await page.goto(`${WEB_URL}${s}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    // Wait a generous 6s for hydration + first paint
    await page.waitForTimeout(6000);
    const text = (await page.evaluate(() => document.body.innerText)).slice(0, 1200);
    const html = (await page.evaluate(() => document.body.innerHTML)).slice(0, 2000);
    const counts = await page.evaluate(() => ({
      div: document.querySelectorAll('div').length,
      span: document.querySelectorAll('span').length,
      input: document.querySelectorAll('input, textarea').length,
      button: document.querySelectorAll('button, [role="button"]').length,
      img: document.querySelectorAll('img').length,
    }));
     
    console.log(
      `  div=${counts.div} span=${counts.span} input=${counts.input} button=${counts.button} img=${counts.img}`,
    );
     
    console.log(`  text(80): ${text.slice(0, 80).replace(/\s+/g, ' ')}`);
    allText.push({ step: stepName, text, html });
    await page.screenshot({ path: path.join(OUT, `${stepName}.png`), fullPage: true });
  }

  await fs.writeFile(path.join(OUT, 'dom-snapshots.json'), JSON.stringify(allText, null, 2));

   
  console.log(`\n[done] ${OUT}`);

  await context.close();
  await browser.close();
}

main().catch((err) => {
   
  console.error('[fatal]', err);
  process.exit(1);
});
