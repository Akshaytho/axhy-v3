/**
 * Manual QA walk for Axhy v3 supervisor app.
 *
 * Drives every supervisor surface as Suresh Kumar (+919999999999, Reddy
 * Cleaning Services tenant). Captures: full-page screenshots, console
 * (log/warn/error/pageerror), every fetch (URL, status, latency, error
 * body), time-to-interactive, and per-step bug evidence.
 *
 * Does NOT modify source. Pure QA pass — finds bugs only. Fixes happen
 * in a separate session.
 *
 * Output:
 *   apps/mobile/screenshots-sprint-2/qa-walkthrough/<step>/<artifacts>
 *   docs/findings/2026-05-18-supervisor-qa-walkthrough.md (appended)
 *
 * @derives(feedback_never_accept_cant_do_from_cli.md, 2026-05-18)
 * @derives(feedback_root_cause_first_walkthrough_pattern.md, 2026-05-18)
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { chromium, devices, type Page, type BrowserContext } from '@playwright/test';

const WEB_URL = process.env.AXHY_WEB_URL ?? 'http://172.20.10.6:8081';
const API_URL = process.env.AXHY_API_URL ?? 'http://172.20.10.6:4000';
const PHONE = '+919999999999';
const OTP = '123456';

const OUT_ROOT = path.resolve(
  __dirname,
  '..',
  '..',
  'apps/mobile/screenshots-sprint-2/qa-walkthrough',
);

type NetEv = {
  at: number;
  step: string;
  type: 'req' | 'res' | 'reqfail';
  method?: string;
  url: string;
  status?: number;
  latencyMs?: number;
  errorText?: string;
  bodyExcerpt?: string;
};

type ConsoleEv = {
  at: number;
  step: string;
  type: 'console' | 'pageerror';
  level?: string;
  text: string;
};

type Bug = {
  id: string;
  title: string;
  screen: string;
  steps: string[];
  expected: string;
  actual: string;
  evidence: string[];
  severity: 'P0' | 'P1' | 'P2';
  confidence: number;
};

const netEvents: NetEv[] = [];
const consoleEvents: ConsoleEv[] = [];
const bugs: Bug[] = [];
const stepTimings: Array<{ step: string; ms: number }> = [];

let currentStep = 'init';
const reqStarts = new Map<string, number>();

function setStep(s: string): void {
  currentStep = s;
   
  console.log(`\n[step] ${s}`);
}

function addBug(b: Omit<Bug, 'id'>): void {
  const id = `B-${String(bugs.length + 1).padStart(2, '0')}`;
  bugs.push({ id, ...b });
   
  console.log(`  [BUG ${id} ${b.severity}] ${b.title}`);
}

async function safeMkdir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true });
}

async function shot(page: Page, step: string, name: string): Promise<string> {
  const dir = path.join(OUT_ROOT, step);
  await safeMkdir(dir);
  const filePath = path.join(dir, `${name}.png`);
  try {
    await page.screenshot({ path: filePath, fullPage: true });
  } catch (err) {
    // Fall back to viewport screenshot if fullPage fails.
    try {
      await page.screenshot({ path: filePath, fullPage: false });
    } catch {
      return `<screenshot failed: ${(err as Error).message}>`;
    }
  }
  return filePath;
}

function attachListeners(page: Page): void {
  page.on('console', (msg) => {
    consoleEvents.push({
      at: Date.now(),
      step: currentStep,
      type: 'console',
      level: msg.type(),
      text: msg.text(),
    });
  });
  page.on('pageerror', (err) => {
    consoleEvents.push({
      at: Date.now(),
      step: currentStep,
      type: 'pageerror',
      text: `${err.name}: ${err.message}\n${err.stack ?? ''}`,
    });
  });
  page.on('request', (r) => {
    const key = `${r.method()} ${r.url()}`;
    reqStarts.set(key, Date.now());
    netEvents.push({
      at: Date.now(),
      step: currentStep,
      type: 'req',
      method: r.method(),
      url: r.url(),
    });
  });
  page.on('requestfailed', (r) => {
    netEvents.push({
      at: Date.now(),
      step: currentStep,
      type: 'reqfail',
      method: r.method(),
      url: r.url(),
      errorText: r.failure()?.errorText ?? '',
    });
  });
  page.on('response', async (r) => {
    const key = `${r.request().method()} ${r.url()}`;
    const start = reqStarts.get(key);
    const latencyMs = start ? Date.now() - start : undefined;
    let bodyExcerpt: string | undefined;
    if (r.status() >= 400) {
      try {
        const b = await r.text();
        bodyExcerpt = b.slice(0, 600);
      } catch {
        /* ignore */
      }
    }
    netEvents.push({
      at: Date.now(),
      step: currentStep,
      type: 'res',
      method: r.request().method(),
      url: r.url(),
      status: r.status(),
      latencyMs,
      bodyExcerpt,
    });
  });
}

async function timeStep<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    const ms = Date.now() - start;
    stepTimings.push({ step: name, ms });
     
    console.log(`  (${ms}ms)`);
  }
}

async function tryClickByText(
  page: Page,
  text: string | RegExp,
  opts: { timeout?: number } = {},
): Promise<boolean> {
  try {
    const loc = page.getByText(text, { exact: false }).first();
    await loc.click({ timeout: opts.timeout ?? 3000 });
    return true;
  } catch {
    return false;
  }
}

async function waitQuiet(page: Page, ms = 1500): Promise<void> {
  await page.waitForTimeout(ms);
}

async function gotoSafe(page: Page, urlPath: string, step: string): Promise<number> {
  setStep(step);
  const t0 = Date.now();
  try {
    await page.goto(`${WEB_URL}${urlPath}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
  } catch (err) {
    addBug({
      title: `Navigation failed: ${urlPath}`,
      screen: urlPath,
      steps: [`page.goto(${urlPath})`],
      expected: 'Route loads within 30s',
      actual: (err as Error).message,
      evidence: [`error: ${(err as Error).message}`],
      severity: 'P0',
      confidence: 95,
    });
  }
  // Wait for some idle. RN-web rarely goes fully networkidle (websockets, etc.)
  try {
    await page.waitForLoadState('networkidle', { timeout: 8000 });
  } catch {
    /* ok */
  }
  const ttiMs = Date.now() - t0;
  if (ttiMs > 4000) {
    addBug({
      title: `Slow load: ${urlPath} took ${ttiMs}ms`,
      screen: urlPath,
      steps: [`Navigate to ${urlPath}`],
      expected: 'Load within 2s on Fast 3G + 4× CPU throttle baseline (and under 4s as soft cap)',
      actual: `Took ${ttiMs}ms`,
      evidence: [],
      severity: ttiMs > 8000 ? 'P1' : 'P2',
      confidence: 80,
    });
  }
  return ttiMs;
}

async function main(): Promise<void> {
  await safeMkdir(OUT_ROOT);

  const browser = await chromium.launch({ headless: true });
  const context: BrowserContext = await browser.newContext({
    ...devices['iPhone 13 Mini'],
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    hasTouch: true,
    geolocation: { latitude: 17.385, longitude: 78.486 },
    permissions: ['geolocation'],
    colorScheme: 'light',
    recordHar: { path: path.join(OUT_ROOT, 'network.har'), content: 'embed' },
  });

  const page = await context.newPage();
  attachListeners(page);

  // CDP throttling
  const cdp = await context.newCDPSession(page);
  try {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: 200 * 1024,
      uploadThroughput: 100 * 1024,
      latency: 200,
    });
  } catch (err) {
     
    console.log(`[warn] CDP throttle failed: ${(err as Error).message}`);
  }

  // ====== STEP 1: Initial load ======
  setStep('01-initial-load');
  const initTti = await timeStep('initial-load', async () => {
    await page.goto(WEB_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    try {
      await page.waitForLoadState('networkidle', { timeout: 10_000 });
    } catch {
      /* ok */
    }
  });
  void initTti;
  await waitQuiet(page, 1500);
  await shot(page, '01-initial-load', 'initial');

  // ====== STEP 2: Phone entry ======
  setStep('02-phone-entry');
  await timeStep('phone-entry', async () => {
    // Find a numeric text input
    const input = page.locator('input').first();
    let inputCount = 0;
    try {
      inputCount = await page.locator('input').count();
    } catch {
      /* ignore */
    }
    if (inputCount === 0) {
      addBug({
        title: 'Phone input not found on initial load',
        screen: '/(auth)/phone',
        steps: ['Open app at /'],
        expected: 'Phone input visible',
        actual: `0 <input> elements present`,
        evidence: [],
        severity: 'P0',
        confidence: 90,
      });
      return;
    }
    await input.fill('9999999999', { timeout: 5000 }).catch((e) => {
      addBug({
        title: 'Phone input not fillable',
        screen: '/(auth)/phone',
        steps: ['Fill 10 digits in phone input'],
        expected: 'Accepts digits',
        actual: (e as Error).message,
        evidence: [],
        severity: 'P0',
        confidence: 85,
      });
    });
    await shot(page, '02-phone-entry', 'filled');
    const clicked =
      (await tryClickByText(page, /get otp|request otp|continue|send otp|next/i)) ||
      (await tryClickByText(page, /otp/i));
    if (!clicked) {
      addBug({
        title: 'Could not find OTP request button',
        screen: '/(auth)/phone',
        steps: ['Type phone', 'Look for OTP request button'],
        expected: 'A visible "Get OTP" / "Request OTP" CTA',
        actual: 'No matching button text found',
        evidence: [],
        severity: 'P0',
        confidence: 70,
      });
    }
    await waitQuiet(page, 2500);
  });
  await shot(page, '02-phone-entry', 'after-submit');

  // ====== STEP 3: OTP entry ======
  setStep('03-otp-entry');
  await timeStep('otp-entry', async () => {
    // OTP screen — might be single 6-digit input or 6 separate boxes.
    const inputs = page.locator('input');
    let count = 0;
    try {
      count = await inputs.count();
    } catch {
      /* ignore */
    }
    if (count === 0) {
      addBug({
        title: 'OTP input not found after requesting OTP',
        screen: '/(auth)/otp',
        steps: ['Submit phone', 'Look for OTP input'],
        expected: 'OTP input visible',
        actual: 'No <input> elements',
        evidence: [],
        severity: 'P0',
        confidence: 80,
      });
      return;
    }
    if (count === 1) {
      await inputs
        .first()
        .fill(OTP)
        .catch(() => {
          /* ignore */
        });
    } else {
      for (let i = 0; i < Math.min(count, 6); i++) {
        await inputs
          .nth(i)
          .fill(OTP[i] ?? '')
          .catch(() => {
            /* ignore */
          });
      }
    }
    await shot(page, '03-otp-entry', 'filled');
    const clicked =
      (await tryClickByText(page, /verify|continue|sign in|submit/i)) ||
      (await tryClickByText(page, /otp/i));
    if (!clicked) {
      // Try pressing Enter on the input
      await page.keyboard.press('Enter').catch(() => {
        /* ignore */
      });
    }
    await waitQuiet(page, 3500);
  });
  await shot(page, '03-otp-entry', 'after-verify');

  // Check token landed
  const tokens = await page
    .evaluate(() => ({
      access: localStorage.getItem('axhy_access_token'),
      refresh: localStorage.getItem('axhy_refresh_token'),
      role: localStorage.getItem('axhy_active_role'),
    }))
    .catch(() => ({ access: null, refresh: null, role: null }));
  if (!tokens.access) {
    addBug({
      title: 'JWT did not land in localStorage after OTP verify',
      screen: '/(auth)/otp',
      steps: ['Type +91 9999999999', 'Verify OTP 123456'],
      expected: 'axhy_access_token populated; nav to /(supervisor)/...',
      actual: `localStorage.axhy_access_token=${tokens.access}`,
      evidence: [`localStorage snapshot at end of OTP step`],
      severity: 'P0',
      confidence: 95,
    });
    // Manually inject tokens via backend call so we can keep walking.
    try {
      const resp = await fetch(`${API_URL}/auth/otp/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: PHONE }),
      });
      void resp;
      const verify = await fetch(`${API_URL}/auth/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: PHONE, code: OTP }),
      });
      const data = (await verify.json()) as {
        accessToken: string;
        refreshToken: string;
        memberships: Array<{ role: string }>;
      };
      const role = data.memberships?.[0]?.role ?? 'SUPERVISOR';
      await page.evaluate(
        ({ a, r, ro }) => {
          localStorage.setItem('axhy_access_token', a);
          localStorage.setItem('axhy_refresh_token', r);
          localStorage.setItem('axhy_active_role', ro);
        },
        { a: data.accessToken, r: data.refreshToken, ro: role },
      );
       
      console.log('[recovery] Injected tokens via backend for continued walk.');
    } catch (e) {
       
      console.log(`[recovery] Token inject failed: ${(e as Error).message}`);
    }
  }

  // ====== STEP 4: Today tab ======
  await gotoSafe(page, '/(supervisor)/today', '04-today');
  await waitQuiet(page, 2000);
  await shot(page, '04-today', 'main');

  // Try pull-to-refresh (web: swipe down)
  await timeStep('today-interactions', async () => {
    // Tap a site card if any
    const siteCards = page.getByText(/site|aparna|building/i);
    const cardCount = await siteCards.count().catch(() => 0);
    if (cardCount === 0) {
      addBug({
        title: 'Today tab: zero site cards rendered',
        screen: '/(supervisor)/today',
        steps: ['Sign in', 'Open Today'],
        expected: 'At least 1 site card for Reddy Cleaning Services sandbox tenant',
        actual: 'No site-like text found',
        evidence: ['screenshot 04-today/main.png'],
        severity: 'P1',
        confidence: 60,
      });
    } else {
      await siteCards
        .first()
        .click({ timeout: 3000 })
        .catch(() => {
          /* ignore */
        });
      await waitQuiet(page, 1200);
      await shot(page, '04-today', 'site-expanded');
    }

    // Try worker row tap
    const workerRows = page.locator('[role="button"], [data-testid*="worker"]').first();
    await workerRows.click({ timeout: 2000 }).catch(() => {
      /* ignore */
    });
    await waitQuiet(page, 1000);
    await shot(page, '04-today', 'after-worker-tap');

    // Close any sheet if open (back/esc)
    await page.keyboard.press('Escape').catch(() => {
      /* ignore */
    });
    await waitQuiet(page, 500);
  });

  // ====== STEP 5: Decisions tab ======
  await gotoSafe(page, '/(supervisor)/decisions', '05-decisions');
  await waitQuiet(page, 2000);
  await shot(page, '05-decisions', 'main');

  await timeStep('decisions-interactions', async () => {
    // Look for section headers
    const needsYou = await page
      .getByText(/needs you now|needs_you/i)
      .count()
      .catch(() => 0);
    const routine = await page
      .getByText(/routine/i)
      .count()
      .catch(() => 0);
    const failedReview = await page
      .getByText(/failed review|failed_review/i)
      .count()
      .catch(() => 0);
    if (needsYou === 0 && routine === 0 && failedReview === 0) {
      addBug({
        title: 'Decisions tab: section headers (NEEDS_YOU_NOW/ROUTINE/FAILED_REVIEW) not visible',
        screen: '/(supervisor)/decisions',
        steps: ['Open Decisions tab'],
        expected: 'Section group headers per Sprint 2 spec',
        actual: 'None of NEEDS_YOU_NOW / ROUTINE / FAILED_REVIEW text rendered',
        evidence: ['screenshot 05-decisions/main.png'],
        severity: 'P1',
        confidence: 55,
      });
    }

    // Tap first card if visible
    const anyCard = page
      .locator('div')
      .filter({ hasText: /approve|reject|accept/i })
      .first();
    await anyCard.click({ timeout: 2000 }).catch(() => {
      /* ignore */
    });
    await waitQuiet(page, 1000);
    await shot(page, '05-decisions', 'card-tapped');
    await page.keyboard.press('Escape').catch(() => {
      /* ignore */
    });
  });

  // Deep-link with focus param
  await gotoSafe(page, '/(supervisor)/decisions?focus=test-id', '05b-decisions-deeplink');
  await waitQuiet(page, 1500);
  await shot(page, '05b-decisions-deeplink', 'deeplink');

  // ====== STEP 6: Activity tab ======
  await gotoSafe(page, '/(supervisor)/activity', '06-activity');
  await waitQuiet(page, 2000);
  await shot(page, '06-activity', 'main');

  await timeStep('activity-interactions', async () => {
    // Filter chips
    for (const label of ['Today', 'Yesterday', 'This week']) {
      const ok = await tryClickByText(page, label, { timeout: 1500 });
      if (ok) {
        await waitQuiet(page, 700);
        await shot(page, '06-activity', `chip-${label.toLowerCase().replace(/\s+/g, '-')}`);
      }
    }
  });

  // ====== STEP 7: Chat tab ======
  await gotoSafe(page, '/(supervisor)/chat', '07-chat');
  await waitQuiet(page, 2000);
  await shot(page, '07-chat', 'main');

  await timeStep('chat-interactions', async () => {
    // Find text input. Chat typically uses a TextInput at bottom.
    const chatInput = page.locator('input, textarea').last();
    const c = await page
      .locator('input, textarea')
      .count()
      .catch(() => 0);
    if (c === 0) {
      addBug({
        title: 'Chat input not found',
        screen: '/(supervisor)/chat',
        steps: ['Open Chat tab', 'Look for text composer'],
        expected: 'A text input at bottom',
        actual: '0 input/textarea elements',
        evidence: ['screenshot 07-chat/main.png'],
        severity: 'P0',
        confidence: 80,
      });
    } else {
      await chatInput.fill('mark Suresh absent').catch(() => {
        /* ignore */
      });
      await shot(page, '07-chat', 'typed');
      // Press Enter to send (or look for send button)
      const sent = await tryClickByText(page, /send/i, { timeout: 1500 });
      if (!sent) {
        await page.keyboard.press('Enter').catch(() => {
          /* ignore */
        });
      }
      await waitQuiet(page, 3000);
      await shot(page, '07-chat', 'after-send');

      // /help
      await chatInput.fill('/help').catch(() => {
        /* ignore */
      });
      const sent2 = await tryClickByText(page, /send/i, { timeout: 1200 });
      if (!sent2) {
        await page.keyboard.press('Enter').catch(() => {
          /* ignore */
        });
      }
      await waitQuiet(page, 1500);
      await shot(page, '07-chat', 'after-help');
    }
  });

  // Amend deep-link
  await gotoSafe(page, '/(supervisor)/chat?amendDecisionId=test-decision', '07b-chat-amend');
  await waitQuiet(page, 1500);
  await shot(page, '07b-chat-amend', 'amend-deeplink');

  // ====== STEP 8: Profile tab ======
  await gotoSafe(page, '/(supervisor)/profile', '08-profile');
  await waitQuiet(page, 2000);
  await shot(page, '08-profile', 'main');

  await timeStep('profile-interactions', async () => {
    for (const lang of ['English', 'हिंदी', 'తెలుగు', 'hi', 'te', 'en']) {
      const ok = await tryClickByText(page, lang, { timeout: 1000 });
      if (ok) {
        await waitQuiet(page, 600);
        await shot(page, '08-profile', `lang-${lang}`);
      }
    }
  });

  // ====== STEP 9: Drawer routes ======
  for (const r of ['sites', 'memory', 'summary', 'updates', 'replacement-picker']) {
    await gotoSafe(page, `/(supervisor)/${r}`, `09-${r}`);
    await waitQuiet(page, 1800);
    await shot(page, `09-${r}`, 'main');
  }

  // ====== STEP 10: Sign-out (try) ======
  await gotoSafe(page, '/(supervisor)/profile', '10-signout');
  await waitQuiet(page, 1500);
  await tryClickByText(page, /sign out|log out|logout/i, { timeout: 2000 });
  await waitQuiet(page, 2000);
  await shot(page, '10-signout', 'after-signout');

  // ====== Diagnose page-render emptiness ======
  // Quickly check on each route if the DOM body has any visible text content
  // (catches the "blank white screen" failure mode common to RN-web).
  setStep('99-final');
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 200)).catch(() => '');
  if (!bodyText.trim()) {
    addBug({
      title: 'Final page shows blank body (no text content)',
      screen: 'final',
      steps: ['Complete walk', 'Inspect document.body.innerText'],
      expected: 'Some text content',
      actual: 'Empty',
      evidence: [],
      severity: 'P1',
      confidence: 70,
    });
  }

  // ====== Persist artifacts ======
  await fs.writeFile(
    path.join(OUT_ROOT, 'network.jsonl'),
    netEvents.map((e) => JSON.stringify(e)).join('\n'),
  );
  await fs.writeFile(
    path.join(OUT_ROOT, 'console.jsonl'),
    consoleEvents.map((e) => JSON.stringify(e)).join('\n'),
  );

  // ====== Heuristic post-pass: scan captured evidence for bug signals ======
  // 1. 4xx/5xx responses
  const errResponses = netEvents.filter(
    (e) => e.type === 'res' && e.status !== undefined && e.status >= 400,
  );
  const errByUrl = new Map<string, NetEv[]>();
  for (const e of errResponses) {
    const key = `${e.method ?? ''} ${e.url}`;
    if (!errByUrl.has(key)) errByUrl.set(key, []);
    errByUrl.get(key)!.push(e);
  }
  for (const [key, evs] of errByUrl) {
    if (evs.length === 0) continue;
    const first = evs[0]!;
    addBug({
      title: `API ${first.status}: ${key} (${evs.length}× during walk)`,
      screen: first.step,
      steps: [`API call to ${first.url}`],
      expected: '2xx',
      actual: `HTTP ${first.status} (×${evs.length}). Body: ${first.bodyExcerpt?.slice(0, 200) ?? '<empty>'}`,
      evidence: [`network.jsonl`, `step=${first.step}`, `latencyMs=${first.latencyMs}`],
      severity: first.status === 401 || first.status === 403 ? 'P0' : 'P1',
      confidence: 95,
    });
  }

  // 2. Console errors
  const consoleErrors = consoleEvents.filter(
    (e) => e.type === 'pageerror' || (e.type === 'console' && e.level === 'error'),
  );
  // Group by first 80 chars of text
  const errByText = new Map<string, ConsoleEv[]>();
  for (const e of consoleErrors) {
    const key = e.text.slice(0, 80);
    if (!errByText.has(key)) errByText.set(key, []);
    errByText.get(key)!.push(e);
  }
  for (const [key, evs] of errByText) {
    if (evs.length === 0) continue;
    const first = evs[0]!;
    addBug({
      title: `Console ${first.type}: ${key}…`,
      screen: first.step,
      steps: ['(emitted during step)'],
      expected: 'No console errors / page errors',
      actual: first.text.slice(0, 400),
      evidence: [`console.jsonl`, `step=${first.step}`, `count=${evs.length}`],
      severity: first.type === 'pageerror' ? 'P0' : 'P1',
      confidence: 90,
    });
  }

  // 3. Slow API calls (>3s)
  const slow = netEvents.filter((e) => e.type === 'res' && (e.latencyMs ?? 0) > 3000);
  for (const e of slow.slice(0, 10)) {
    addBug({
      title: `Slow API: ${e.method} ${e.url} took ${e.latencyMs}ms`,
      screen: e.step,
      steps: [`Trigger ${e.url}`],
      expected: '<2s on Fast 3G + 4× CPU baseline',
      actual: `${e.latencyMs}ms`,
      evidence: [`network.jsonl`, `step=${e.step}`],
      severity: 'P1',
      confidence: 85,
    });
  }

  // 4. Failed requests (DNS, abort, etc.)
  const failed = netEvents.filter((e) => e.type === 'reqfail');
  for (const e of failed.slice(0, 10)) {
    addBug({
      title: `Request failed: ${e.method} ${e.url}`,
      screen: e.step,
      steps: [`Trigger ${e.url}`],
      expected: 'Request completes',
      actual: `Failed: ${e.errorText}`,
      evidence: [`network.jsonl`, `step=${e.step}`],
      severity: 'P0',
      confidence: 95,
    });
  }

  // ====== Write findings markdown ======
  const findingsPath = path.resolve(
    __dirname,
    '..',
    '..',
    'docs/findings/2026-05-18-supervisor-qa-walkthrough.md',
  );
  const lines: string[] = [];
  lines.push(`# Axhy v3 supervisor app — QA walk findings (2026-05-18)`);
  lines.push('');
  lines.push(`**Walker:** Suresh Kumar @ Reddy Cleaning Services (\`+919999999999\`)`);
  lines.push(`**Web URL:** ${WEB_URL}`);
  lines.push(`**API URL:** ${API_URL}`);
  lines.push(`**Throttle:** 4× CPU + Slow 3G via CDP`);
  lines.push(`**Device:** iPhone 13 Mini (390×844)`);
  lines.push('');
  lines.push(`## Step timings`);
  for (const t of stepTimings) lines.push(`- ${t.step}: ${t.ms}ms`);
  lines.push('');
  lines.push(`## Network summary`);
  lines.push(`- Total requests: ${netEvents.filter((e) => e.type === 'req').length}`);
  lines.push(`- Total responses: ${netEvents.filter((e) => e.type === 'res').length}`);
  lines.push(`- 4xx/5xx: ${errResponses.length}`);
  lines.push(`- Failed (network): ${failed.length}`);
  lines.push(`- Slow (>3s): ${slow.length}`);
  lines.push('');
  lines.push(`## Console summary`);
  lines.push(`- Total console events: ${consoleEvents.length}`);
  lines.push(
    `- Console errors: ${consoleEvents.filter((e) => e.type === 'console' && e.level === 'error').length}`,
  );
  lines.push(`- Page errors: ${consoleEvents.filter((e) => e.type === 'pageerror').length}`);
  lines.push('');
  lines.push(`## Bugs found (${bugs.length})`);
  lines.push('');
  for (const b of bugs) {
    lines.push(`### ${b.id} — ${b.title}`);
    lines.push(`- **Screen**: ${b.screen}`);
    lines.push(`- **Steps**: ${b.steps.map((s, i) => `${i + 1}. ${s}`).join(' ')}`);
    lines.push(`- **Expected**: ${b.expected}`);
    lines.push(`- **Actual**: ${b.actual}`);
    lines.push(`- **Evidence**: ${b.evidence.join('; ')}`);
    lines.push(`- **Severity**: ${b.severity}`);
    lines.push(`- **Confidence**: ${b.confidence}%`);
    lines.push('');
  }
  await safeMkdir(path.dirname(findingsPath));
  await fs.writeFile(findingsPath, lines.join('\n'));
   
  console.log(`\n[done] Wrote ${findingsPath}`);
   
  console.log(
    `[done] ${bugs.length} bugs. ${netEvents.length} net events. ${consoleEvents.length} console events.`,
  );

  await context.close();
  await browser.close();
}

main().catch((err) => {
   
  console.error('[fatal]', err);
  process.exit(1);
});
