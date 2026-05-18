/**
 * capture-r6-all-tabs.mjs — capture R6 prototype's rendered artboards
 * for side-by-side comparison with my RN port. One PNG per tab.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface design ref
 */

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const URL = 'http://localhost:8090/Supervisor%20mobile.html';
const DIR = './screenshots-r6-reference';
mkdirSync(DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1700, height: 1900 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3500);

// Save the full canvas for context.
await page.screenshot({ path: `${DIR}/r6-canvas.png`, fullPage: true });
console.log(`📸 r6-canvas.png — full canvas`);

// Locate each artboard via the PhoneFrame label text.
const labels = [
  { label: 'TODAY — SCAN LAYER', file: 'r6-today.png' },
  { label: 'DECISIONS — SCAN LAYER', file: 'r6-decisions.png' },
  { label: 'ACTIVITY — SCAN LAYER', file: 'r6-activity.png' },
  { label: 'CHAT — CAPTURE ONLY', file: 'r6-chat.png' },
];

for (const { label, file } of labels) {
  try {
    // The label is a sibling above the 390-wide phone div. PhoneFrame
    // wraps both in a flex column container; take the container,
    // bounding-box it, then screenshot just the phone portion (which
    // starts ~40px below the label).
    const labelLocator = page.getByText(label).first();
    await labelLocator.waitFor({ state: 'visible', timeout: 5000 });
    // Label sits inside `<div>` inside `<div className="phoneframe">`.
    // Two `..` reaches the PhoneFrame outer wrapper that holds both
    // label + phone.
    const container = labelLocator.locator('xpath=../..').first();
    const box = await container.boundingBox();
    if (!box) {
      console.log(`⚠️ no bounding box for ${label}`);
      continue;
    }
    await page.screenshot({
      path: `${DIR}/${file}`,
      clip: { x: box.x, y: box.y, width: box.width, height: box.height },
    });
    console.log(`📸 ${file} — ${label} @ ${Math.round(box.width)}x${Math.round(box.height)}`);
  } catch (e) {
    console.log(`⚠️ ${label}: ${e.message}`);
  }
}

await browser.close();
console.log('\nDone.');
