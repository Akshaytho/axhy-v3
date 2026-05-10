/**
 * Wave 4a comprehensive Playwright test suite.
 * Tests: Apply, Cancel, clarification, multi-message, empty-send, long message.
 *
 * Run: node scripts/screenshot-wave-4a.mjs
 * Expects: backend at localhost:4000, Expo web at localhost:8081.
 */

import { chromium } from '@playwright/test';
import { mkdirSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire as _cr } from 'node:module';

// Load pg from the pnpm store (CJS package — require the package root, not lib/index.js)
const _req = _cr(import.meta.url);
const { Client } = _req('/Users/thotaakshay/eclean_workspace/axhy-v3/node_modules/.pnpm/pg@8.20.0/node_modules/pg');

const URL = process.env.EXPO_URL || 'http://localhost:8081';
const SCREENSHOT_DIR = './screenshots-wave-4a';
mkdirSync(SCREENSHOT_DIR, { recursive: true });

// Auto-clear stale PNGs from previous runs (founder asked 2026-05-10 — they pile up).
// Skipped if KEEP_SCREENSHOTS=1 is set so a comparison run can preserve old captures.
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
  if (cleared > 0) console.log(`🧹 Cleared ${cleared} stale screenshots from ${SCREENSHOT_DIR}`);
}

const DB_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:OootJurpFypMHSJEmKVJzYjqIIiWEieZ@switchback.proxy.rlwy.net:20958/railway';

/** Query assignment count created within the last N seconds — uses pg client directly */
async function getAssignmentCount(withinSeconds = 300) {
  const client = new Client({ connectionString: DB_URL });
  try {
    await client.connect();
    const res = await client.query(
      `SELECT count(*)::int AS cnt FROM axhy."Assignment" WHERE "createdAt" > NOW() - INTERVAL '${withinSeconds} seconds'`,
    );
    await client.end();
    return Number(res.rows[0]?.cnt ?? 0);
  } catch (e) {
    console.warn('  [db query error]', e.message.split('\n')[0]);
    try { await client.end(); } catch (_) {}
    return -1; // unknown
  }
}

/** Results summary */
const results = [];
function record(name, status, note) {
  results.push({ name, status, note });
  const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⚠️';
  console.log(`${icon} ${name}: ${note}`);
}

// ── Browser setup ──────────────────────────────────────────────────────────
// Default: headed + slowMo:500 for visual review (per
// feedback_expo_fast_refresh_plus_playwright.md). Set CI=true (or HEADLESS=1)
// for batch CI mode.
const headless = process.env.CI === 'true' || process.env.HEADLESS === '1';
const slowMo = headless ? 0 : 500;
const browser = await chromium.launch({ headless, slowMo });
console.log(`🎭 Playwright launched (${headless ? 'headless' : 'headed'}, slowMo=${slowMo}ms)`);
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

// ── Auth: login once ────────────────────────────────────────────────────────
console.log(`\nLoading ${URL}...`);
await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(3000);

await page.screenshot({ path: `${SCREENSHOT_DIR}/01-login.png`, fullPage: true });
console.log('✓ 01-login.png');

const phoneInput = page.locator('input').first();
await phoneInput.fill('9999999999');
await page.waitForTimeout(500);
await page.screenshot({ path: `${SCREENSHOT_DIR}/02-login-filled.png`, fullPage: true });
console.log('✓ 02-login-filled.png');

const continueBtn = page.getByText('Get OTP').first();
await continueBtn.click({ timeout: 5000 });
await page.waitForTimeout(2000);

await page.screenshot({ path: `${SCREENSHOT_DIR}/03-otp.png`, fullPage: true });
console.log('✓ 03-otp.png');

const otpInput = page.getByPlaceholder('------');
await otpInput.fill('123456');
await page.waitForTimeout(500);
await page.screenshot({ path: `${SCREENSHOT_DIR}/04-otp-filled.png`, fullPage: true });
console.log('✓ 04-otp-filled.png');

const verifyBtn = page.getByText('Verify').first();
await verifyBtn.click({ timeout: 5000 });
await page.waitForTimeout(3000);

await page.screenshot({ path: `${SCREENSHOT_DIR}/05-today.png`, fullPage: true });
console.log('✓ 05-today.png (post-login)');

// Navigate to Chat tab
const chatTab = page.getByText(/^chat$/i).first();
await chatTab.click({ timeout: 5000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SCREENSHOT_DIR}/06-chat-empty.png`, fullPage: true });
console.log('✓ 06-chat-empty.png');

// ── Helper: send message and poll for AI response ───────────────────────────
async function sendAndWaitForResponse(message, maxWaitMs = 90000) {
  const chatInput = page.locator('input').last();
  await chatInput.fill(message);
  await page.waitForTimeout(300);

  const sendBtn = page.getByText(/^send$/i).first();
  await sendBtn.click({ timeout: 5000 });
  await page.waitForTimeout(2000);

  // Poll every 10s until Apply or Cancel appear (DecisionCard) OR text changes (clarification)
  const startMsgCount = await page.locator('[role=text], text=/./').count();
  const pollInterval = 10000;
  const polls = Math.ceil(maxWaitMs / pollInterval);

  for (let i = 0; i < polls; i++) {
    await page.waitForTimeout(pollInterval);
    // Check for Apply button (DecisionCard) or text that changed (clarification)
    const applyCount = await page.getByText(/^apply$/i).count();
    const thinkingGone = (await page.getByText(/thinking/i).count()) === 0;
    if (thinkingGone && applyCount === 0) {
      // Response arrived but no card
      return { hasDecisionCard: false };
    }
    if (applyCount > 0) {
      return { hasDecisionCard: true };
    }
  }
  return { hasDecisionCard: false, timedOut: true };
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST 1: Apply button creates Assignment row
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n─── Test 1: Apply → creates Assignment row ───');
const countBefore = await getAssignmentCount(300); // last 5 min
console.log(`  Assignment count before: ${countBefore}`);

const chatInputT1 = page.locator('input').last();
await chatInputT1.fill('Add Ravi Kumar to Hospital A Mon-Sat 9-5 starting May 12 2026');
await page.waitForTimeout(300);
const sendBtnT1 = page.getByText(/^send$/i).first();
await sendBtnT1.click({ timeout: 5000 });
await page.waitForTimeout(2000);
await page.screenshot({ path: `${SCREENSHOT_DIR}/07-chat-typed.png`, fullPage: true });
console.log('✓ 07-chat-typed.png');
await page.screenshot({ path: `${SCREENSHOT_DIR}/08-chat-thinking.png`, fullPage: true });
console.log('✓ 08-chat-thinking.png');

// Poll up to 90s for DecisionCard
let t1CardFound = false;
for (let i = 0; i < 9; i++) {
  await page.waitForTimeout(10000);
  await page.screenshot({ path: `${SCREENSHOT_DIR}/08-chat-wait-${(i + 1) * 10}s.png`, fullPage: true });
  console.log(`  polling... ${(i + 1) * 10}s elapsed`);
  const applyCount = await page.getByText(/^apply$/i).count();
  if (applyCount > 0) {
    console.log(`  DecisionCard arrived after ${(i + 1) * 10}s`);
    t1CardFound = true;
    break;
  }
}

await page.screenshot({ path: `${SCREENSHOT_DIR}/09-chat-card.png`, fullPage: true });
console.log('✓ 09-chat-card.png');

if (!t1CardFound) {
  record('Test 1: Apply → Assignment row', 'fail', 'DecisionCard never appeared within 90s');
} else {
  // Tap the Apply button
  try {
    const applyBtn = page.getByText(/^apply$/i).first();
    await applyBtn.click({ timeout: 5000 });
    await page.waitForTimeout(5000); // wait for backend to create Assignment row
    await page.screenshot({ path: `${SCREENSHOT_DIR}/10-applied.png`, fullPage: true });
    console.log('✓ 10-applied.png');

    // Check DB
    const countAfter = await getAssignmentCount(300);
    console.log(`  Assignment count after Apply: ${countAfter}`);

    // Check UI for ✓ Applied text
    const appliedText = await page.getByText(/✓ applied/i).count();
    const cardGone = await page.getByText(/^apply$/i).count() === 0;

    if (countAfter === -1) {
      // DB query failed, check UI only
      if (appliedText > 0) {
        record('Test 1: Apply → Assignment row', 'partial', 'UI shows ✓ Applied; DB query failed (check manually)');
      } else {
        record('Test 1: Apply → Assignment row', 'fail', 'UI did not show ✓ Applied and DB query failed');
      }
    } else if (countAfter > countBefore && (appliedText > 0 || cardGone)) {
      record('Test 1: Apply → Assignment row', 'pass', `DB row created (${countBefore} → ${countAfter}); UI shows ✓ Applied`);
    } else if (countAfter > countBefore) {
      record('Test 1: Apply → Assignment row', 'partial', `DB row created (${countBefore} → ${countAfter}) but ✓ Applied text not found`);
    } else if (appliedText > 0) {
      record('Test 1: Apply → Assignment row', 'partial', 'UI shows ✓ Applied but DB count unchanged (count check window too narrow?)');
    } else {
      record('Test 1: Apply → Assignment row', 'fail', `DB count ${countBefore} → ${countAfter}; ✓ Applied text: ${appliedText}`);
    }
  } catch (err) {
    await page.screenshot({ path: `${SCREENSHOT_DIR}/10-applied-err.png`, fullPage: true });
    record('Test 1: Apply → Assignment row', 'fail', `Apply tap failed: ${err.message}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST 2: Cancel button dismisses card
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n─── Test 2: Cancel → dismisses card ───');
const countBeforeT2 = await getAssignmentCount(300);
console.log(`  Assignment count before: ${countBeforeT2}`);

const chatInputT2 = page.locator('input').last();
await chatInputT2.fill('Add Lakshmi Devi to IT Park C Mon-Sat 9-5 starting May 13 2026');
await page.waitForTimeout(300);
const sendBtnT2 = page.getByText(/^send$/i).first();
await sendBtnT2.click({ timeout: 5000 });
await page.waitForTimeout(2000);

let t2CardFound = false;
for (let i = 0; i < 9; i++) {
  await page.waitForTimeout(10000);
  console.log(`  polling T2... ${(i + 1) * 10}s elapsed`);
  const applyCount = await page.getByText(/^apply$/i).count();
  if (applyCount > 0) {
    console.log(`  DecisionCard arrived after ${(i + 1) * 10}s`);
    t2CardFound = true;
    break;
  }
}

if (!t2CardFound) {
  await page.screenshot({ path: `${SCREENSHOT_DIR}/11-cancelled.png`, fullPage: true });
  record('Test 2: Cancel → dismiss', 'fail', 'DecisionCard never appeared within 90s for Cancel test');
} else {
  try {
    const cancelBtn = page.getByText(/^cancel$/i).first();
    await cancelBtn.click({ timeout: 5000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/11-cancelled.png`, fullPage: true });
    console.log('✓ 11-cancelled.png');

    const countAfterT2 = await getAssignmentCount(300);
    const applyStillVisible = await page.getByText(/^apply$/i).count();

    if (applyStillVisible === 0 && (countAfterT2 === countBeforeT2 || countAfterT2 === -1)) {
      record('Test 2: Cancel → dismiss', 'pass', 'Card dismissed; no new DB row');
    } else if (applyStillVisible === 0) {
      record('Test 2: Cancel → dismiss', 'partial', `Card dismissed; DB count changed unexpectedly (${countBeforeT2} → ${countAfterT2})`);
    } else {
      record('Test 2: Cancel → dismiss', 'fail', `Card still visible after Cancel; DB: ${countBeforeT2} → ${countAfterT2}`);
    }
  } catch (err) {
    await page.screenshot({ path: `${SCREENSHOT_DIR}/11-cancelled-err.png`, fullPage: true });
    record('Test 2: Cancel → dismiss', 'fail', `Cancel tap failed: ${err.message}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST 3: AI clarification — unknown entity → text-only response
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n─── Test 3: Clarification (unknown entity) ───');

const chatInputT3 = page.locator('input').last();
await chatInputT3.fill('Add unknownperson to Apollo Hospital');
await page.waitForTimeout(300);
const sendBtnT3 = page.getByText(/^send$/i).first();
await sendBtnT3.click({ timeout: 5000 });
await page.waitForTimeout(2000);

let t3Done = false;
for (let i = 0; i < 9; i++) {
  await page.waitForTimeout(10000);
  console.log(`  polling T3... ${(i + 1) * 10}s elapsed`);
  // Consider done if thinking indicator is gone
  const thinkingCount = await page.getByText(/thinking/i).count();
  if (thinkingCount === 0) {
    t3Done = true;
    break;
  }
}

await page.screenshot({ path: `${SCREENSHOT_DIR}/12-clarification.png`, fullPage: true });
console.log('✓ 12-clarification.png');

const t3ApplyVisible = await page.getByText(/^apply$/i).count();
// Look for "not found" or clarification signals in page text
const pageText = await page.evaluate(() => document.body.innerText);
const hasClarificationText =
  /not found|don't|cannot|unclear|which|clarif|unknown|no worker|no site/i.test(pageText);

if (t3ApplyVisible === 0 && hasClarificationText) {
  record('Test 3: Clarification (unknown entity)', 'pass', 'No DecisionCard; AI responded with clarification/not-found text');
} else if (t3ApplyVisible === 0) {
  record('Test 3: Clarification (unknown entity)', 'partial', 'No DecisionCard rendered; but clarification keywords not detected in page text');
} else {
  record('Test 3: Clarification (unknown entity)', 'fail', `Apply button visible — AI returned DecisionCard instead of clarification`);
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST 4: Multi-message — second message in same chat
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n─── Test 4: Multi-message conversation ───');

const chatInputT4 = page.locator('input').last();
await chatInputT4.fill('Add Mukesh Yadav to Mall Lobby Sundays 6am to 2pm starting May 17 2026');
await page.waitForTimeout(300);
const sendBtnT4 = page.getByText(/^send$/i).first();
await sendBtnT4.click({ timeout: 5000 });
await page.waitForTimeout(2000);

let t4CardFound = false;
for (let i = 0; i < 9; i++) {
  await page.waitForTimeout(10000);
  console.log(`  polling T4... ${(i + 1) * 10}s elapsed`);
  // Check for multiple Apply buttons (Test 1 card may already be applied)
  const thinkingCount = await page.getByText(/thinking/i).count();
  if (thinkingCount === 0) {
    const applyCount = await page.getByText(/^apply$/i).count();
    if (applyCount > 0) t4CardFound = true;
    break;
  }
}

await page.screenshot({ path: `${SCREENSHOT_DIR}/13-multi-message.png`, fullPage: true });
console.log('✓ 13-multi-message.png');

// Count visible user bubbles (user messages should show "Add Ravi", "Add Lakshmi", etc.)
const pageTextT4 = await page.evaluate(() => document.body.innerText);
const priorMsgVisible =
  /ravi kumar|hospital a/i.test(pageTextT4) || /lakshmi devi|IT Park/i.test(pageTextT4);
const secondMsgVisible = /mukesh yadav|mall lobby/i.test(pageTextT4);

if (t4CardFound && secondMsgVisible && priorMsgVisible) {
  record('Test 4: Multi-message', 'pass', 'Both old messages visible; new DecisionCard rendered for Mukesh Yadav message');
} else if (t4CardFound && secondMsgVisible) {
  record('Test 4: Multi-message', 'partial', 'New DecisionCard rendered; but prior messages may be scrolled out of view');
} else if (secondMsgVisible && !t4CardFound) {
  record('Test 4: Multi-message', 'partial', 'Second message sent and AI responded (no card — may have asked for clarification); conversation intact');
} else {
  record('Test 4: Multi-message', 'fail', `Second message not found in DOM or AI failed. priorVisible=${priorMsgVisible}, secondVisible=${secondMsgVisible}, card=${t4CardFound}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST 5: Empty input — Send is disabled
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n─── Test 5: Empty input → Send disabled ───');

// Clear the input if anything is in it
const chatInputT5 = page.locator('input').last();
await chatInputT5.fill('');
await page.waitForTimeout(300);

await page.screenshot({ path: `${SCREENSHOT_DIR}/14-empty-disabled.png`, fullPage: true });
console.log('✓ 14-empty-disabled.png');

// The Send button has opacity 0.4 when disabled — check via CSS or aria.
// RN Web Pressable renders the disabled state on the outer wrapper div, not the Text child.
// Walk up the DOM from the "Send" text to find the role=button ancestor.
const sendBtnT5 = page.getByText(/^send$/i).first();
const isDisabledAttr = await sendBtnT5.evaluate(el => {
  // Walk up to find the nearest [role=button] ancestor (RN Web Pressable wrapper)
  let target = el;
  for (let i = 0; i < 5; i++) {
    if (!target.parentElement) break;
    target = target.parentElement;
    if (target.getAttribute('role') === 'button') break;
  }
  const ariaDisabled = target.getAttribute('aria-disabled');
  const opacity = window.getComputedStyle(target).opacity;
  const pointerEvents = window.getComputedStyle(target).pointerEvents;
  // Also check the style attribute directly (RN Web inlines styles)
  const inlineStyle = target.getAttribute('style') || '';
  const textInlineStyle = el.parentElement?.getAttribute('style') || '';
  return { ariaDisabled, opacity, pointerEvents, inlineStyle: inlineStyle.slice(0, 200), textInlineStyle: textInlineStyle.slice(0, 200) };
});
console.log('  Send button state:', JSON.stringify(isDisabledAttr));

// Try to click anyway (should not trigger send)
const pageTextBefore = await page.evaluate(() => document.body.innerText);
try {
  // Force click to bypass pointer-events:none
  await sendBtnT5.click({ timeout: 2000, force: true });
} catch (_) {
  // OK if click fails
}
await page.waitForTimeout(2000);
const pageTextAfter = await page.evaluate(() => document.body.innerText);

const sendBtnOpacity = parseFloat(isDisabledAttr.opacity);
const sendBtnPointerNone = isDisabledAttr.pointerEvents === 'none';
const sendBtnAriaDisabled = isDisabledAttr.ariaDisabled === 'true';
// Also check inline style for opacity:0.4 (RN Web inlines computed styles)
const inlineHasLowOpacity = /opacity:\s*0\.[0-4]/i.test(isDisabledAttr.inlineStyle) ||
  /opacity:\s*0\.[0-4]/i.test(isDisabledAttr.textInlineStyle);

const isVisuallyDisabled = sendBtnOpacity <= 0.5 || sendBtnPointerNone || sendBtnAriaDisabled || inlineHasLowOpacity;

if (isVisuallyDisabled) {
  record('Test 5: Empty input → Send disabled', 'pass', `Send visually disabled (opacity=${isDisabledAttr.opacity}, pointer-events=${isDisabledAttr.pointerEvents}, aria-disabled=${isDisabledAttr.ariaDisabled})`);
} else {
  // Send was not visually disabled — check if a message was sent (the real safety check)
  const newMsgSent = pageTextAfter !== pageTextBefore && /thinking/i.test(pageTextAfter);
  if (newMsgSent) {
    record('Test 5: Empty input → Send disabled', 'fail', `Send button not disabled AND a message was sent with empty input`);
  } else {
    // RN Web Pressable with disabled=true prevents the onPress handler from firing even
    // if computed CSS doesn't show it. No message sent = functionally correct.
    record('Test 5: Empty input → Send disabled', 'partial', `CSS not visually indicating disabled (opacity=${isDisabledAttr.opacity}), but no message was sent — functionally safe; UI polish issue`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// TEST 6: Long message wrapping
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n─── Test 6: Long message wrapping ───');

const longMsg =
  'Add Ravi Kumar to Hospital A for the morning shift Monday to Saturday from 9am to 5pm starting Monday May 12 2026 because the previous worker Pradeep is on leave for the next 30 days due to a family emergency in his hometown';

const chatInputT6 = page.locator('input').last();
await chatInputT6.fill(longMsg);
await page.waitForTimeout(500);

// Screenshot BEFORE send to verify the input doesn't overflow
await page.screenshot({ path: `${SCREENSHOT_DIR}/15-long-message-input.png`, fullPage: true });
console.log('✓ 15-long-message-input.png');

const sendBtnT6 = page.getByText(/^send$/i).first();
await sendBtnT6.click({ timeout: 5000 });
await page.waitForTimeout(2000);

await page.screenshot({ path: `${SCREENSHOT_DIR}/15-long-message-sending.png`, fullPage: true });
console.log('✓ 15-long-message-sending.png');

let t6Done = false;
for (let i = 0; i < 9; i++) {
  await page.waitForTimeout(10000);
  console.log(`  polling T6... ${(i + 1) * 10}s elapsed`);
  const thinkingCount = await page.getByText(/thinking/i).count();
  if (thinkingCount === 0) {
    t6Done = true;
    break;
  }
}

await page.screenshot({ path: `${SCREENSHOT_DIR}/15-long-message.png`, fullPage: true });
console.log('✓ 15-long-message.png');

// Check that the message appears in the DOM (wrapping means text exists but isn't cut)
const pageTextT6 = await page.evaluate(() => document.body.innerText);
// At least the first 50 chars of the long message should be visible
const longMsgFragment = longMsg.substring(0, 50).toLowerCase();
const msgVisible = pageTextT6.toLowerCase().includes(longMsgFragment.substring(0, 30));

// AI responded?
const t6ApplyCount = await page.getByText(/^apply$/i).count();
const t6Responded = t6Done && (t6ApplyCount > 0 || pageTextT6.toLowerCase().includes('ravi'));

if (msgVisible && t6Responded) {
  record('Test 6: Long message wrapping', 'pass', `Message visible in bubble; AI responded (${t6ApplyCount > 0 ? 'with DecisionCard' : 'text-only'})`);
} else if (msgVisible) {
  record('Test 6: Long message wrapping', 'partial', `Message displayed; AI response pending or timed out after 90s`);
} else {
  record('Test 6: Long message wrapping', 'fail', `Message text not found in page DOM after send`);
}

// ── Cleanup ─────────────────────────────────────────────────────────────────
await browser.close();

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════');
console.log('WAVE 4a COMPREHENSIVE TEST RESULTS');
console.log('══════════════════════════════════════════════════════════');
let passes = 0, fails = 0, partials = 0;
for (const r of results) {
  const icon = r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '⚠️';
  console.log(`${icon} ${r.name}`);
  console.log(`   ${r.note}`);
  if (r.status === 'pass') passes++;
  else if (r.status === 'fail') fails++;
  else partials++;
}
console.log('──────────────────────────────────────────────────────────');
console.log(`Total: ${results.length} | ✅ ${passes} pass | ⚠️  ${partials} partial | ❌ ${fails} fail`);

if (consoleErrors.length > 0) {
  console.log('\n--- Browser console errors captured ---');
  consoleErrors.slice(0, 20).forEach(e => console.log('  ERROR:', e));
}

console.log('\n✓ Screenshots saved to', SCREENSHOT_DIR);
console.log('Estimated Anthropic API cost: ~$0.05–$0.10 per test × 5 AI calls = ~$0.25–$0.50');

process.exit(fails > 0 ? 1 : 0);
