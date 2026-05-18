/**
 * capture-r6-target.mjs — capture R6 prototype's rendered Today artboard
 * for side-by-side comparison with my RN port. Compare reference, not code.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface design ref
 */

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const URL = 'http://localhost:8090/Supervisor%20mobile.html';
const DIR = './screenshots-r6-reference';
mkdirSync(DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1400, height: 1800 }, deviceScaleFactor: 2 });
const page = await context.newPage();
await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);

// Full canvas — shows all 5 tab artboards.
await page.screenshot({ path: `${DIR}/r6-full.png`, fullPage: true });
console.log(`📸 r6-full.png — full canvas`);

// Today artboard: locate first PhoneFrame containing "Today's plan" title.
const todayPhone = page.locator('text=Today\'s plan').first().locator('xpath=ancestor::div[contains(@style, "390")]').first();
if (await todayPhone.count() > 0) {
  await todayPhone.screenshot({ path: `${DIR}/r6-today.png` });
  console.log(`📸 r6-today.png — Today artboard`);
} else {
  console.log('⚠️ Could not isolate Today artboard via xpath, using full canvas only');
}

await browser.close();
console.log('Done.');
