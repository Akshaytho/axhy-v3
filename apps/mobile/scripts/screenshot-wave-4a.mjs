import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';

const URL = process.env.EXPO_URL || 'http://localhost:8081';
const SCREENSHOT_DIR = './screenshots-wave-4a';
mkdirSync(SCREENSHOT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, // iPhone 14 Pro
  deviceScaleFactor: 3,
  isMobile: true,
});
const page = await context.newPage();

// Capture console errors for reporting
const consoleErrors = [];
page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', err => consoleErrors.push(`PAGE ERROR: ${err.message}`));

console.log(`Loading ${URL}...`);
await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(3000);

// 1. Login screen
await page.screenshot({ path: `${SCREENSHOT_DIR}/01-login.png`, fullPage: true });
console.log('✓ 01-login.png');

// Fill phone — the phone screen accepts 10 raw digits (no +91 prefix, which is shown as static UI)
// Button label is "Get OTP" and is disabled until exactly 10 digits are entered.
const phoneInput = page.locator('input').first();
await phoneInput.fill('9999999999');
await page.waitForTimeout(500);
await page.screenshot({ path: `${SCREENSHOT_DIR}/02-login-filled.png`, fullPage: true });
console.log('✓ 02-login-filled.png');

// RN Web renders TouchableOpacity as div[role=button], not <button> — use getByText
const continueBtn = page.getByText('Get OTP').first();
await continueBtn.click({ timeout: 5000 });
await page.waitForTimeout(2000);

// 2. OTP screen
await page.screenshot({ path: `${SCREENSHOT_DIR}/03-otp.png`, fullPage: true });
console.log('✓ 03-otp.png');

// Fill OTP code — target by placeholder (------) because expo-router keeps the
// previous screen's phone input in the DOM off-screen, so .first() grabs the wrong one.
const otpInput = page.getByPlaceholder('------');
await otpInput.fill('123456');
await page.waitForTimeout(500);
await page.screenshot({ path: `${SCREENSHOT_DIR}/04-otp-filled.png`, fullPage: true });
console.log('✓ 04-otp-filled.png');

// RN Web: TouchableOpacity renders as div[role=button], use getByText
const verifyBtn = page.getByText('Verify').first();
await verifyBtn.click({ timeout: 5000 });
await page.waitForTimeout(3000);

// 3. Today tab (default landing)
await page.screenshot({ path: `${SCREENSHOT_DIR}/05-today.png`, fullPage: true });
console.log('✓ 05-today.png');

// Navigate to Chat tab — try clicking by text
const chatTab = page.getByText(/^chat$/i).first();
try {
  await chatTab.click({ timeout: 3000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/06-chat-empty.png`, fullPage: true });
  console.log('✓ 06-chat-empty.png');

  // Type a message
  const chatInput = page.locator('input').last();
  await chatInput.fill('Add Ravi Kumar to Hospital A, Monday to Saturday 9am to 5pm starting May 12 2026');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/07-chat-typed.png`, fullPage: true });
  console.log('✓ 07-chat-typed.png');

  // Tap Send — RN Web renders as div[role=button], use getByText
  const sendBtn = page.getByText(/^send$/i).first();
  await sendBtn.click({ timeout: 5000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/08-chat-thinking.png`, fullPage: true });
  console.log('✓ 08-chat-thinking.png (with thinking indicator)');

  // Poll for DecisionCard — up to 70s to accommodate real Anthropic latency (15-30s typical)
  let cardFound = false;
  for (let i = 0; i < 7; i++) { // 7 × 10s = 70s max
    await page.waitForTimeout(10000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/08-chat-wait-${(i + 1) * 10}s.png`, fullPage: true });
    console.log(`  polling... ${(i + 1) * 10}s elapsed`);
    // Check if DecisionCard rendered — RN Web uses div[role=button], match by text
    const cardVisible = await page.getByText(/apply/i).count() > 0;
    if (cardVisible) {
      console.log(`✓ DecisionCard arrived after ${(i + 1) * 10}s`);
      await page.screenshot({ path: `${SCREENSHOT_DIR}/09-chat-card.png`, fullPage: true });
      console.log('✓ 09-chat-card.png (DecisionCard arrived)');
      cardFound = true;
      break;
    }
  }
  if (!cardFound) {
    await page.screenshot({ path: `${SCREENSHOT_DIR}/09-chat-card-timeout.png`, fullPage: true });
    console.warn('⚠ DecisionCard did NOT appear within 70s — screenshot saved as 09-chat-card-timeout.png');
  }
} catch (err) {
  console.warn(`Chat tab navigation failed: ${err.message}`);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/06-chat-failed.png`, fullPage: true });
}

await browser.close();

if (consoleErrors.length > 0) {
  console.log('\n--- Console/Page errors captured ---');
  consoleErrors.slice(0, 20).forEach(e => console.log('  ERROR:', e));
}

console.log('\n✓ Screenshots saved to', SCREENSHOT_DIR);
