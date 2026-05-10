/**
 * Wave 4a-PRO comprehensive Playwright capture.
 * Exercises the 5 propose_* tools + conflict + chip picker + batch + EmptyState + SkeletonBubble.
 *
 * Run: HEADLESS=1 node scripts/screenshot-wave-4a-pro.mjs
 * Expects: backend at :4000, Expo web at :8081, sandbox seeded with
 *   Ravi Kumar, Sundeep, Pradeep, Suresh workers + Hospital A, Apollo, Westfield sites
 *   + ACTIVE Assignment Suresh @ Apollo Mon-Sat 9-5 (conflict trigger).
 *
 * @derives(master-plan §G — Wave 4a-PRO panel review)
 */

import { chromium } from '@playwright/test';
import { mkdirSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';

const URL = process.env.EXPO_URL || 'http://localhost:8081';
const SCREENSHOT_DIR = './screenshots-wave-4a-pro';
mkdirSync(SCREENSHOT_DIR, { recursive: true });

// Auto-clear stale PNGs.
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
const slowMo = headless ? 0 : 500;
const browser = await chromium.launch({ headless, slowMo });
console.log(`🎭 Playwright (${headless ? 'headless' : 'headed'}, slowMo=${slowMo}ms)`);

const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
});
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(`PAGE: ${e.message}`));

// Expo web bundle resolves API_BASE to LAN IP (192.168.x.x:4000). Backend
// listens on *:4000 but macOS firewall blocks LAN connections to that port.
// Rewrite all requests so they hit localhost:4000 from inside chromium.
await context.route('**/*', async (route) => {
  const u = route.request().url();
  if (u.match(/^http:\/\/192\.168\.\d+\.\d+:4000\//)) {
    const rewritten = u.replace(/^http:\/\/192\.168\.\d+\.\d+:4000\//, 'http://localhost:4000/');
    await route.continue({ url: rewritten });
  } else {
    await route.continue();
  }
});

// Network log — show ALL requests to backend so we can see what fired and what didn't
page.on('request', (req) => {
  const u = req.url();
  if (u.includes(':4000')) console.log(`→  ${req.method()} ${u.replace('http://localhost:4000', '')}`);
});
page.on('requestfailed', (req) => {
  const u = req.url();
  if (u.includes(':4000') || u.includes(':8081')) {
    console.log(`✗  REQ FAILED ${req.method()} ${u} — ${req.failure()?.errorText}`);
  }
});
page.on('response', async (res) => {
  const u = res.url();
  if (u.includes(':4000')) console.log(`📡 ${res.status()} ${res.request().method()} ${u.replace('http://localhost:4000', '')}`);
});

const captures = [];
function ok(name, note = '') {
  captures.push({ name, status: 'ok', note });
  console.log(`✅ ${name} ${note}`);
}
function warn(name, note = '') {
  captures.push({ name, status: 'warn', note });
  console.log(`⚠️  ${name} ${note}`);
}
function fail(name, note = '') {
  captures.push({ name, status: 'fail', note });
  console.log(`❌ ${name} ${note}`);
}

async function shot(file, label) {
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${file}`, fullPage: true });
  ok(file, label || '');
}

async function pollForCard(label, maxSec = 90) {
  for (let i = 0; i < maxSec / 5; i++) {
    await page.waitForTimeout(5000);
    const applyN = await page.getByText(/^apply$/i).count();
    const applyAllN = await page.getByText(/^apply \d+ changes/i).count();
    if (applyN > 0 || applyAllN > 0) return { ok: true, sec: (i + 1) * 5 };
  }
  return { ok: false };
}

async function send(text) {
  const input = page.locator('input').last();
  await input.fill(text);
  await page.waitForTimeout(300);
  const sendBtn = page.getByText(/^send$/i).first();
  await sendBtn.click({ timeout: 5000 });
  await page.waitForTimeout(2000);
}

// ── 1. Login ────────────────────────────────────────────────────────────────
console.log(`\n→ Loading ${URL}`);
await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
// Clear any previous-session auth in localStorage so we always hit login screen.
await page.evaluate(() => {
  try { localStorage.clear(); } catch (e) {}
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(3500);
await shot('00a-loaded.png', '— after fresh load');

const phoneInput = page.locator('input').first();
await phoneInput.fill('9999999999');
await page.waitForTimeout(500);
const continueBtn = page.getByText('Get OTP').first();
await continueBtn.click({ timeout: 5000 });
// Up to 30s for OTP screen.
const otpScreenAppeared = await page
  .waitForSelector('input[placeholder="------"]', { timeout: 30000 })
  .catch(() => null);
console.log(`  OTP screen appeared: ${otpScreenAppeared ? 'YES' : 'NO'}`);
await page.waitForTimeout(2000);
await shot('00b-after-otp-request.png', '— after Get OTP click');

const otpInput = page.getByPlaceholder('------').first();
await otpInput.fill('123456', { timeout: 15000 });
await page.waitForTimeout(500);
const verifyBtn = page.getByText('Verify').first();
await verifyBtn.click({ timeout: 5000 });
// Wait for navigation to supervisor shell.
await page.waitForTimeout(5000);
await shot('00c-after-verify.png', '— after Verify (should be supervisor shell)');

// ── 2. Navigate to Chat → EmptyState capture ────────────────────────────────
const chatTab = page.getByText(/^chat$/i).first();
await chatTab.click({ timeout: 5000 });
await page.waitForTimeout(1500);
await shot('01-empty-state.png', '— EmptyState welcome');

// ── 3. propose_mark_absent ──────────────────────────────────────────────────
console.log('\n→ Test mark_absent: "Sundeep is absent today, called in sick"');
await send('Sundeep is absent today, called in sick');
await page.waitForTimeout(1500);
await shot('02a-mark-absent-thinking.png', '— SkeletonBubble during AI thinking');

const ma = await pollForCard('mark_absent');
if (ma.ok) {
  await shot('02b-mark-absent-card.png', `— DecisionCard arrived in ${ma.sec}s`);
} else {
  await shot('02b-mark-absent-timeout.png', '— timed out >90s');
  fail('02b-mark-absent', 'no card in 90s');
}

// Don't tap Apply (we want to keep the card visible for review). Cancel instead.
const cancelBtns = await page.getByText(/^cancel$/i).count();
if (cancelBtns > 0) {
  await page.getByText(/^cancel$/i).first().click({ timeout: 5000 });
  await page.waitForTimeout(1000);
}

// ── 4. propose_leave ────────────────────────────────────────────────────────
console.log('\n→ Test leave: "Pradeep needs sick leave from May 12 to May 14 2026"');
await send('Pradeep needs sick leave from May 12 to May 14 2026');
await page.waitForTimeout(1500);

const lv = await pollForCard('leave');
if (lv.ok) {
  await shot('03-leave-card.png', `— DecisionCard in ${lv.sec}s`);
} else {
  await shot('03-leave-timeout.png', '— timed out');
  fail('03-leave', 'no card in 90s');
}
const cancelLv = await page.getByText(/^cancel$/i).count();
if (cancelLv > 0) {
  await page.getByText(/^cancel$/i).first().click({ timeout: 5000 });
  await page.waitForTimeout(1000);
}

// ── 5. propose_swap ─────────────────────────────────────────────────────────
console.log('\n→ Test swap: "Swap Ravi Kumar and Sundeep at Hospital A tomorrow at 9am"');
const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
await send(`Swap Ravi Kumar and Sundeep at Hospital A on ${tomorrow} at 9am`);
await page.waitForTimeout(1500);

const sw = await pollForCard('swap');
if (sw.ok) {
  await shot('04-swap-card.png', `— DecisionCard in ${sw.sec}s`);
} else {
  await shot('04-swap-timeout.png', '— timed out');
  fail('04-swap', 'no card in 90s');
}
const cancelSw = await page.getByText(/^cancel$/i).count();
if (cancelSw > 0) {
  await page.getByText(/^cancel$/i).first().click({ timeout: 5000 });
  await page.waitForTimeout(1000);
}

// ── 6. propose_termination — should render WARN orange severity ─────────────
console.log('\n→ Test termination: "Fire Pradeep effective May 31 2026, performance issues"');
await send('Fire Pradeep effective May 31 2026, performance issues');
await page.waitForTimeout(1500);

const tm = await pollForCard('termination');
if (tm.ok) {
  await shot('05-termination-card.png', `— DecisionCard (WARN) in ${tm.sec}s`);
} else {
  await shot('05-termination-timeout.png', '— timed out');
  fail('05-termination', 'no card in 90s');
}
const cancelTm = await page.getByText(/^cancel$/i).count();
if (cancelTm > 0) {
  await page.getByText(/^cancel$/i).first().click({ timeout: 5000 });
  await page.waitForTimeout(1000);
}

// ── 7. propose_create_assignment WITH conflict — Suresh has ACTIVE @ Apollo ─
console.log('\n→ Test conflict: "Add Suresh to Westfield Mon-Sat 12pm to 4pm starting May 12 2026"');
await send('Add Suresh to Westfield Mon-Sat 12pm to 4pm starting May 12 2026');
await page.waitForTimeout(1500);

const cf = await pollForCard('conflict');
if (cf.ok) {
  await shot('06a-conflict-card.png', `— WARN card with ChipPicker in ${cf.sec}s`);

  // Try tapping a chip
  const chip = page.getByText(/split shift/i).first();
  if ((await chip.count()) > 0) {
    await chip.click({ timeout: 5000 });
    await page.waitForTimeout(800);
    await shot('06b-conflict-chip-selected.png', '— "Split shift" chip selected, Apply enabled');
  } else {
    warn('06b-chip-picker', 'Split shift chip not found in DOM');
  }
} else {
  await shot('06a-conflict-timeout.png', '— timed out');
  fail('06-conflict', 'no card in 90s');
}
const cancelCf = await page.getByText(/^cancel$/i).count();
if (cancelCf > 0) {
  await page.getByText(/^cancel$/i).first().click({ timeout: 5000 });
  await page.waitForTimeout(1000);
}

// ── 8. propose_create_assignment WITHOUT conflict — humanized dayMask ───────
console.log('\n→ Test create + humanizer: "Add Ravi Kumar to Hospital A Mon-Sat 9-5 starting May 13 2026"');
await send('Add Ravi Kumar to Hospital A Mon-Sat 9-5 starting May 13 2026');
await page.waitForTimeout(1500);

const ca = await pollForCard('create_assignment');
if (ca.ok) {
  await shot('07-create-assignment-humanized.png', `— "Mon-Sat" not "MTWTFS_", "Open-ended" for null validUntil`);
} else {
  await shot('07-create-timeout.png', '— timed out');
  fail('07-create', 'no card in 90s');
}
const cancelCa = await page.getByText(/^cancel$/i).count();
if (cancelCa > 0) {
  await page.getByText(/^cancel$/i).first().click({ timeout: 5000 });
  await page.waitForTimeout(1000);
}

// ── 9. Batch DecisionCard — compound utterance ──────────────────────────────
console.log('\n→ Test batch: "Sundeep is absent today, and also Pradeep is sick today"');
await send('Sundeep is absent today, and also Pradeep is sick today');
await page.waitForTimeout(1500);

const ba = await pollForCard('batch');
if (ba.ok) {
  await shot('08-batch-cards.png', `— stacked under "Apply N changes?" in ${ba.sec}s`);
} else {
  await shot('08-batch-timeout.png', '— timed out');
  fail('08-batch', 'no batch in 90s');
}

// ── Summary ─────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('CAPTURE SUMMARY');
console.log('═══════════════════════════════════════════════════════════════');
for (const c of captures) {
  console.log(`${c.status === 'ok' ? '✅' : c.status === 'warn' ? '⚠️ ' : '❌'} ${c.name} ${c.note ?? ''}`);
}
console.log(`\nConsole errors during run: ${consoleErrors.length}`);
if (consoleErrors.length > 0) {
  console.log(consoleErrors.slice(0, 5).map((e) => `  - ${e.slice(0, 200)}`).join('\n'));
}

await browser.close();
console.log('\n✓ Done. Screenshots in', SCREENSHOT_DIR);
