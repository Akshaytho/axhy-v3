import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const URL = process.env.EXPO_URL || 'http://localhost:8082';
const DIR = '/Users/thotaakshay/eclean_workspace/axhy-v3/apps/mobile/screenshots-wave-4a';
mkdirSync(DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
});
const page = await context.newPage();

const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[PAGEERROR] ${e.message}`));
page.on('request', req => {
  if (req.url().includes('/auth/') || req.url().includes('/chat/')) {
    logs.push(`[REQ] ${req.method()} ${req.url()}`);
  }
});
page.on('response', res => {
  if (res.url().includes('/auth/') || res.url().includes('/chat/')) {
    logs.push(`[RES] ${res.status()} ${res.url()}`);
  }
});

await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2000);

// --- Step 1: Fill phone ---
const phoneInput = page.locator('input[type="tel"]').first();
await phoneInput.waitFor({ timeout: 10000 });
await phoneInput.fill('9999999999');
await page.waitForTimeout(300);

// Click Get OTP
await page.getByText(/get otp/i).first().click();
await page.waitForTimeout(3000);

// --- Step 2: Dump all inputs visible on OTP screen ---
const inputs = await page.locator('input').all();
console.log(`\nInputs found after Get OTP: ${inputs.length}`);
for (let i = 0; i < inputs.length; i++) {
  const val = await inputs[i].inputValue().catch(() => '?');
  const ph = await inputs[i].getAttribute('placeholder').catch(() => '?');
  const type = await inputs[i].getAttribute('type').catch(() => '?');
  const vis = await inputs[i].isVisible().catch(() => false);
  console.log(`  input[${i}]: type=${type} placeholder="${ph}" value="${val}" visible=${vis}`);
}
await page.screenshot({ path: `${DIR}/dbg-after-getotp.png`, fullPage: true });

// Fill OTP — target the visible input with placeholder "------"
const otpInput = page.locator('input').filter({ hasNot: page.locator('[type="tel"]') }).first();
const otpInputAlt = page.getByPlaceholder(/^[-–—]+$/).first();

// Try by placeholder
let filled = false;
for (const loc of [otpInputAlt, otpInput, page.locator('input').nth(1), page.locator('input').last()]) {
  try {
    const vis = await loc.isVisible();
    if (vis) {
      await loc.fill('123456');
      const val = await loc.inputValue();
      console.log(`\nFilled OTP input (${val}) using locator`);
      filled = true;
      break;
    }
  } catch (e) {
    // try next
  }
}

if (!filled) {
  console.log('\nFailed to fill OTP input!');
}

await page.waitForTimeout(500);
await page.screenshot({ path: `${DIR}/dbg-otp-filled.png`, fullPage: true });

// Dump inputs again
const inputs2 = await page.locator('input').all();
console.log(`\nInputs after OTP fill: ${inputs2.length}`);
for (let i = 0; i < inputs2.length; i++) {
  const val = await inputs2[i].inputValue().catch(() => '?');
  const ph = await inputs2[i].getAttribute('placeholder').catch(() => '?');
  const vis = await inputs2[i].isVisible().catch(() => false);
  console.log(`  input[${i}]: placeholder="${ph}" value="${val}" visible=${vis}`);
}

// Click Verify
await page.getByText(/^Verify$/i).first().click();
await page.waitForTimeout(5000);

await page.screenshot({ path: `${DIR}/dbg-after-verify.png`, fullPage: true });

// What's visible now?
const bodyText = await page.evaluate(() => {
  const texts = [];
  document.querySelectorAll('*').forEach(el => {
    if (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3) {
      const t = el.textContent?.trim();
      if (t && t.length > 0 && t.length < 100) texts.push(t);
    }
  });
  return [...new Set(texts)].slice(0, 30);
});
console.log('\nVisible text after verify:', JSON.stringify(bodyText, null, 2));

const inputs3 = await page.locator('input').all();
console.log(`\nInputs after verify: ${inputs3.length}`);

console.log('\n--- Network logs ---');
logs.filter(l => l.startsWith('[REQ]') || l.startsWith('[RES]')).forEach(l => console.log(l));
console.log('\n--- Console errors ---');
logs.filter(l => l.startsWith('[error') || l.startsWith('[PAGEERROR')).forEach(l => console.log(l));

await browser.close();
