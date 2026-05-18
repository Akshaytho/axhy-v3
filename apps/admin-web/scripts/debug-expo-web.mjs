import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const URL = process.env.EXPO_URL || 'http://localhost:8081';
const SCREENSHOT_DIR =
  process.env.SCREENSHOT_DIR ||
  '/Users/thotaakshay/eclean_workspace/axhy-v3/apps/mobile/screenshots-wave-4a';
mkdirSync(SCREENSHOT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
});
const page = await context.newPage();

const allLogs = [];
page.on('console', (msg) => {
  allLogs.push(`[${msg.type()}] ${msg.text()}`);
});
page.on('pageerror', (err) => {
  allLogs.push(`[PAGE ERROR] ${err.message}\n${err.stack}`);
});
page.on('requestfailed', (req) => {
  allLogs.push(`[FAILED REQUEST] ${req.url()} — ${req.failure()?.errorText}`);
});

console.log(`Loading ${URL}...`);
// Use domcontentloaded first so we can see early errors
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(8000); // give the JS bundle time to execute

// Dump the DOM content
const bodyText = await page.evaluate(() => document.body?.innerHTML?.slice(0, 3000));
console.log('\n--- BODY INNER HTML (first 3000 chars) ---');
console.log(bodyText);

// Dump page title and any visible text
const visibleText = await page.evaluate(() => {
  const els = document.querySelectorAll('*');
  const texts = [];
  els.forEach(el => {
    if (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3) {
      const t = el.textContent?.trim();
      if (t && t.length > 0 && t.length < 200) texts.push(t);
    }
  });
  return [...new Set(texts)].slice(0, 30);
});
console.log('\n--- VISIBLE TEXT NODES ---');
console.log(JSON.stringify(visibleText, null, 2));

// Check inputs
const inputs = await page.locator('input').count();
const buttons = await page.locator('button').count();
console.log(`\nInputs found: ${inputs}, Buttons found: ${buttons}`);

await page.screenshot({ path: `${SCREENSHOT_DIR}/debug-page.png`, fullPage: true });
console.log('\n✓ debug-page.png saved');

console.log('\n--- ALL CONSOLE LOGS ---');
allLogs.forEach(l => console.log(l));

await browser.close();
