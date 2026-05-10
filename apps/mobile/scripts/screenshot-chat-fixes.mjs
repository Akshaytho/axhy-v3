/**
 * Targeted Playwright capture for the 4 chat fixes shipped in commit 80ba614.
 * Cost ceiling: ₹15. Designed to use ≤6 AI calls (~₹0.60 with gpt-5.4-nano).
 *
 * Tests:
 *   1. /help short-circuit — should render static menu, ZERO AI tokens
 *   2. Single-turn mark-absent (basic happy path post prompt-strip)
 *   3. Multi-turn fragment completion — turn 1 partial info, turn 2 fills in
 *   4. EmptyState welcome (carries over from Wave 4a-PRO)
 *
 * Run: cd apps/mobile && pnpm exec node scripts/screenshot-chat-fixes.mjs
 *
 * @derives(panel-2026-05-10 — chat-fixes review per founder lock)
 */

import { chromium } from '@playwright/test';
import { mkdirSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';

const URL = process.env.EXPO_URL || 'http://localhost:8081';
const SCREENSHOT_DIR = './screenshots-chat-fixes';
mkdirSync(SCREENSHOT_DIR, { recursive: true });

if (!process.env.KEEP_SCREENSHOTS) {
  let cleared = 0;
  for (const name of readdirSync(SCREENSHOT_DIR)) {
    if (!name.endsWith('.png')) continue;
    const p = join(SCREENSHOT_DIR, name);
    if (statSync(p).isFile()) {
      unlinkSync(p);
      cleared++;
    }
  }
  if (cleared > 0) console.log(`🧹 Cleared ${cleared} stale screenshots`);
}

const headless = process.env.CI === 'true' || process.env.HEADLESS === '1';
const slowMo = headless ? 0 : 300;
const browser = await chromium.launch({ headless, slowMo });
console.log(`🎭 Playwright (${headless ? 'headless' : 'headed'}, slowMo=${slowMo}ms)`);

const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
});
const page = await context.newPage();

const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
page.on('pageerror', (e) => errors.push(`PAGE: ${e.message}`));

// Mac firewall blocks LAN port; rewrite 192.168.* → localhost inside chromium.
await context.route('**/*', async (route) => {
  const u = route.request().url();
  if (u.match(/^http:\/\/192\.168\.\d+\.\d+:4000\//)) {
    const rewritten = u.replace(/^http:\/\/192\.168\.\d+\.\d+:4000\//, 'http://localhost:4000/');
    await route.continue({ url: rewritten });
  } else {
    await route.continue();
  }
});

let aiCallCount = 0;
page.on('response', (res) => {
  const u = res.url();
  if (u.includes('/chat/messages') && res.request().method() === 'POST') {
    aiCallCount++;
    console.log(`📡 ${res.status()} POST /chat/messages (count=${aiCallCount})`);
  }
});

async function shot(file, label) {
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${file}`, fullPage: true });
  console.log(`📸 ${file} ${label || ''}`);
}

async function send(text) {
  const input = page.locator('input').last();
  await input.fill(text);
  await page.waitForTimeout(200);
  const sendBtn = page.getByText(/^send$/i).first();
  await sendBtn.click({ timeout: 5000 });
}

async function waitForAssistantTurn(maxSec = 60) {
  const start = Date.now();
  let last = 0;
  for (let i = 0; i < maxSec / 2; i++) {
    await page.waitForTimeout(2000);
    // count assistant-style text bubbles or DecisionCards
    const cardCount = await page.getByText(/^(apply|cancel)$/i).count();
    if (cardCount > 0) return { ok: true, sec: Math.round((Date.now() - start) / 1000) };
    last = cardCount;
  }
  return { ok: false };
}

// ── Login ───────────────────────────────────────────────────────────────────
console.log(`\n→ Loading ${URL}`);
await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
await page.evaluate(() => {
  try { localStorage.clear(); } catch (e) {}
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(3500);

const phoneInput = page.locator('input').first();
await phoneInput.fill('9999999999');
await page.waitForTimeout(400);
await page.getByText('Get OTP').first().click({ timeout: 5000 });
await page.waitForSelector('input[placeholder="------"]', { timeout: 30000 });
await page.waitForTimeout(1500);

const otpInput = page.getByPlaceholder('------').first();
await otpInput.fill('123456');
await page.waitForTimeout(400);
await page.getByText('Verify').first().click({ timeout: 5000 });
await page.waitForTimeout(4000);

// ── Navigate to Chat ────────────────────────────────────────────────────────
const chatTab = page.getByText(/^chat$/i).first();
await chatTab.click({ timeout: 5000 });
await page.waitForTimeout(1500);
await shot('01-empty-state.png', '— EmptyState welcome (post fixes)');

// ── 1. /help short-circuit (should NOT increment aiCallCount-from-AI) ───────
console.log(`\n→ TEST 1: /help (should render static, NO AI burn)`);
const beforeHelp = aiCallCount;
await send('/help');
await page.waitForTimeout(2500);
const afterHelp = aiCallCount;
await shot('02-help-response.png', `— /help static response (calls: ${beforeHelp} → ${afterHelp})`);
console.log(`  /chat/messages calls during help: ${afterHelp - beforeHelp} (should be 1 round-trip but with model='static' so no OpenAI burn)`);

// ── 2. Single-turn mark-absent ──────────────────────────────────────────────
console.log(`\n→ TEST 2: single-turn mark-absent`);
await send('Mukesh absent today');
await page.waitForTimeout(1500);
await shot('03a-absent-thinking.png', '— SkeletonBubble while AI thinks');
const r2 = await waitForAssistantTurn(45);
if (r2.ok) {
  await shot('03b-absent-card.png', `— DecisionCard arrived in ${r2.sec}s`);
} else {
  await shot('03b-absent-timeout.png', '— TIMED OUT >45s');
}
const cancelN = await page.getByText(/^cancel$/i).count();
if (cancelN > 0) {
  await page.getByText(/^cancel$/i).first().click({ timeout: 5000 });
  await page.waitForTimeout(1000);
}

// ── 3. Multi-turn fragment completion ───────────────────────────────────────
console.log(`\n→ TEST 3: multi-turn — "Ravi ko Hospital A kal" → "subah 9 baje"`);
await send('Ravi ko Hospital A bhej kal');
await page.waitForTimeout(2500);
await shot('04a-turn1.png', '— turn 1 response (incomplete info)');

await send('subah 9 baje');
await page.waitForTimeout(2500);
const r3 = await waitForAssistantTurn(45);
if (r3.ok) {
  await shot('04b-turn2-stitched.png', `— turn 2 stitched continuity in ${r3.sec}s`);
} else {
  await shot('04b-turn2-timeout.png', '— TIMED OUT >45s');
}
const cancelN2 = await page.getByText(/^cancel$/i).count();
if (cancelN2 > 0) {
  await page.getByText(/^cancel$/i).first().click({ timeout: 5000 });
  await page.waitForTimeout(1000);
}

// ── Done ────────────────────────────────────────────────────────────────────
console.log(`\n=== SUMMARY ===`);
console.log(`Total /chat/messages POSTs: ${aiCallCount}`);
console.log(`Console errors: ${errors.length}`);
errors.slice(0, 8).forEach((e) => console.log(`  ! ${e}`));

await browser.close();
console.log(`\n✓ Screenshots in ${SCREENSHOT_DIR}/`);
