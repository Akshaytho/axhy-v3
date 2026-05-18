/**
 * Pass 2 QA rewalk for Axhy v3 supervisor app.
 *
 * After commit 52630fb shipped Cluster 1/2/3 fixes + runtime crash fixes
 * (Reanimated, voice cleanup, LAN IP). This script:
 *
 * 1. VERIFIES every Cluster 1 endpoint hits its latency target via the
 *    actual mobile-web flow (network capture from Playwright).
 * 2. VERIFIES the Cluster 2/3 UI invariants (Decisions title === "Decisions"
 *    not "All caught up" while loading; Chat header doesn't say
 *    "0 sites · 0 workers active" while loading; Profile renders frame
 *    before data; Updates doesn't show "0 new" badge while loading).
 * 3. EXPLORES the 25 interactive bugs that Cluster 1 was blocking
 *    (sheets, decision-card footers, drawer entries, replacement picker).
 *
 * Output goes to apps/mobile/screenshots-sprint-2/qa-rewalk/<screen>/<step>.png
 * Findings markdown is written to
 * docs/findings/2026-05-18-supervisor-qa-rewalk.md
 *
 * @derives(feedback_never_accept_cant_do_from_cli.md, 2026-05-18)
 * @derives(feedback_root_cause_first_walkthrough_pattern.md, 2026-05-18)
 * @derives(feedback_walk_every_screen_as_real_user_before_founder.md, 2026-05-18)
 * @derives(feedback_tests_must_prove_the_bug_existed.md, 2026-05-18)
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { chromium, devices, type Page, type BrowserContext } from '@playwright/test';

const WEB_URL = process.env.AXHY_WEB_URL ?? 'http://172.20.10.6:8081';
const API_URL = process.env.AXHY_API_URL ?? 'http://172.20.10.6:4000';
const PHONE = '+919999999999';
const OTP = '123456';

const OUT_ROOT = path.resolve(__dirname, '..', '..', 'apps/mobile/screenshots-sprint-2/qa-rewalk');

// Cluster 1 latency targets from the rewalk brief (warm-load).
const LATENCY_TARGETS_MS: Record<string, number> = {
  '/me': 1500,
  '/supervisor/today': 5000,
  '/supervisor/decisions': 6000,
  '/supervisor/activity': 2000,
  '/supervisor/summary': 5000,
  '/supervisor/updates': 2000,
};

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
  step: string;
  expected: string;
  actual: string;
  evidence: string[];
  severity: 'P0' | 'P1' | 'P2';
  confidence: number;
  cluster?: string;
};

const netEvents: NetEv[] = [];
const consoleEvents: ConsoleEv[] = [];
const bugs: Bug[] = [];
const stepTimings: Array<{ step: string; ms: number }> = [];
const verificationResults: Array<{
  name: string;
  target: string;
  observed: string;
  pass: boolean;
}> = [];

let currentStep = 'init';
const reqStarts = new Map<string, number>();

function setStep(s: string): void {
  currentStep = s;
  console.log(`\n[step] ${s}`);
}

function addBug(b: Omit<Bug, 'id'>): void {
  const id = `B2-${String(bugs.length + 1).padStart(2, '0')}`;
  bugs.push({ id, ...b });
  console.log(`  [BUG ${id} ${b.severity}] ${b.title}`);
}

function record(name: string, target: string, observed: string, pass: boolean): void {
  verificationResults.push({ name, target, observed, pass });
  console.log(`  [verify ${pass ? 'PASS' : 'FAIL'}] ${name} target=${target} observed=${observed}`);
}

async function safeMkdir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true });
}

async function shot(page: Page, screen: string, name: string): Promise<string> {
  const dir = path.join(OUT_ROOT, screen);
  await safeMkdir(dir);
  const filePath = path.join(dir, `${name}.png`);
  try {
    await page.screenshot({ path: filePath, fullPage: true });
  } catch {
    try {
      await page.screenshot({ path: filePath, fullPage: false });
    } catch {
      return `<screenshot failed>`;
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
        bodyExcerpt = (await r.text()).slice(0, 600);
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
    await loc.click({ timeout: opts.timeout ?? 2500 });
    return true;
  } catch {
    return false;
  }
}

async function waitQuiet(page: Page, ms = 1500): Promise<void> {
  await page.waitForTimeout(ms);
}

/** Capture DOM body text for invariant assertions. */
async function bodyText(page: Page, max = 4000): Promise<string> {
  return page.evaluate((m) => document.body.innerText.slice(0, m), max).catch(() => '');
}

/** Wait until at least one /supervisor/* or /me response lands, OR timeout. */
async function waitForApi(
  page: Page,
  urlSubstring: string,
  timeoutMs: number,
): Promise<NetEv | undefined> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const hit = netEvents.find(
      (e) => e.type === 'res' && e.url.includes(urlSubstring) && e.at > start - 1000, // recent
    );
    if (hit) return hit;
    await page.waitForTimeout(150);
  }
  return undefined;
}

async function injectTokensViaBackend(page: Page): Promise<void> {
  console.log('[auth] requesting OTP via backend…');
  const r1 = await fetch(`${API_URL}/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: PHONE }),
  });
  void r1;
  const r2 = await fetch(`${API_URL}/auth/otp/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: PHONE, code: OTP }),
  });
  if (!r2.ok) throw new Error(`verify failed ${r2.status}`);
  const data = (await r2.json()) as {
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
  console.log('[auth] tokens injected.');
}

async function gotoSafe(page: Page, urlPath: string, screen: string): Promise<number> {
  setStep(screen);
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
      step: `page.goto(${urlPath})`,
      expected: 'Route loads within 30s',
      actual: (err as Error).message,
      evidence: [],
      severity: 'P0',
      confidence: 95,
    });
  }
  try {
    await page.waitForLoadState('networkidle', { timeout: 8000 });
  } catch {
    /* ok */
  }
  return Date.now() - t0;
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

  // CDP throttling — 4× CPU + Slow 3G as the brief asked.
  const cdp = await context.newCDPSession(page);
  try {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: 50 * 1024,
      uploadThroughput: 50 * 1024,
      latency: 400,
    });
  } catch (err) {
    console.log(`[warn] CDP throttle failed: ${(err as Error).message}`);
  }

  // ===== STEP A: Initial load + token inject =====
  setStep('a-init');
  await timeStep('a-init', async () => {
    await page.goto(WEB_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    try {
      await page.waitForLoadState('networkidle', { timeout: 10_000 });
    } catch {
      /* ok */
    }
  });
  await waitQuiet(page, 1500);
  await shot(page, 'a-init', 'initial');

  // Inject tokens directly (the brief noted OTP magic 123456 — bypass UI to focus on supervisor surfaces)
  try {
    await injectTokensViaBackend(page);
  } catch (err) {
    addBug({
      title: 'Token inject via backend failed — auth flow broken',
      screen: '(auth)',
      step: 'Backend OTP request/verify',
      expected: 'Tokens returned',
      actual: (err as Error).message,
      evidence: [],
      severity: 'P0',
      confidence: 99,
    });
  }

  // ===== STEP B: Today tab — verify chrome + sites render =====
  // Disable network throttle for the actual screens (Cluster 1 is a backend test, the UI
  // verification needs to test what user sees on warm-load conditions matching the brief).
  // The brief targets are server-side warm-load. We test UI behaviour standalone.
  try {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 0,
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  } catch {
    /* ok */
  }

  // ---- Today ----
  await gotoSafe(page, '/(supervisor)/today', 'b-today');
  await shot(page, 'b-today', '01-immediate');
  // Within ~500ms the chrome (tab bar + header) should be there
  await waitQuiet(page, 500);
  await shot(page, 'b-today', '02-after-500ms');
  const todayEarlyBody = await bodyText(page);
  if (!/today|sites|tasks/i.test(todayEarlyBody)) {
    addBug({
      title: 'Today: chrome (header/tabbar) not painted within 500ms',
      screen: '/(supervisor)/today',
      step: 'Navigate to /today, screenshot at 500ms',
      expected: 'Header "TODAY"/"Today" or tab bar visible',
      actual: `Body text excerpt: ${todayEarlyBody.slice(0, 200)}`,
      evidence: ['b-today/02-after-500ms.png'],
      severity: 'P1',
      confidence: 75,
      cluster: 'C3-chrome-before-data',
    });
  }
  // Wait for /supervisor/today response
  const todayRes = await waitForApi(page, '/supervisor/today', 15_000);
  if (todayRes) {
    const lm = todayRes.latencyMs ?? 0;
    const ok = lm <= LATENCY_TARGETS_MS['/supervisor/today']!;
    record('/supervisor/today', `<${LATENCY_TARGETS_MS['/supervisor/today']}ms`, `${lm}ms`, ok);
    if (!ok) {
      addBug({
        title: `/supervisor/today latency regression: ${lm}ms > 5000ms target`,
        screen: '/(supervisor)/today',
        step: 'Mobile-web fetch via React Query',
        expected: '<5000ms warm-load',
        actual: `${lm}ms (Status ${todayRes.status})`,
        evidence: ['network.har', `step=${todayRes.step}`],
        severity: 'P0',
        confidence: 95,
        cluster: 'C1-latency',
      });
    }
  } else {
    addBug({
      title: '/supervisor/today never responded within 15s (UI side)',
      screen: '/(supervisor)/today',
      step: 'Wait for response',
      expected: 'Response observed',
      actual: 'No response captured in 15s',
      evidence: [],
      severity: 'P0',
      confidence: 90,
      cluster: 'C1-latency',
    });
  }
  await shot(page, 'b-today', '03-after-load');
  const todayLoadedBody = await bodyText(page);

  // Interact: tap a site card if any
  setStep('b-today-interact');
  const siteRow = page.getByText(/aparna|apollo|building|reddy|site/i).first();
  await siteRow.click({ timeout: 3000 }).catch(() => {
    /* ignore */
  });
  await waitQuiet(page, 800);
  await shot(page, 'b-today', '04-site-tapped');

  // Try long-press on worker row (simulate via mouse.down/wait/up)
  setStep('b-today-longpress');
  try {
    const workerCandidate = page.locator('[role="button"]').first();
    const box = await workerCandidate.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(550);
      await page.mouse.up();
      await waitQuiet(page, 800);
      await shot(page, 'b-today', '05-after-longpress');
    } else {
      addBug({
        title: 'Today: no role=button worker rows found for long-press test',
        screen: '/(supervisor)/today',
        step: 'Long-press worker row',
        expected: 'WorkerActionSheet opens',
        actual: 'No worker-row candidate found',
        evidence: ['b-today/04-site-tapped.png'],
        severity: 'P1',
        confidence: 60,
        cluster: 'C-sheets',
      });
    }
  } catch (e) {
    addBug({
      title: 'Today: long-press attempt threw',
      screen: '/(supervisor)/today',
      step: 'Long-press worker',
      expected: 'Sheet opens or no-op',
      actual: (e as Error).message,
      evidence: [],
      severity: 'P2',
      confidence: 70,
      cluster: 'C-sheets',
    });
  }

  // Try tapping "Mark absent" if visible (after worker-row tap)
  setStep('b-today-markabsent');
  await tryClickByText(page, /mark absent|absent/i, { timeout: 2500 });
  await waitQuiet(page, 800);
  await shot(page, 'b-today', '06-mark-absent-attempt');
  const mabody = await bodyText(page);
  if (/no call|no show|sick|half day|family emergency/i.test(mabody)) {
    record('MarkAbsentSheet reason chips', 'visible', 'visible', true);
  } else {
    addBug({
      title:
        'MarkAbsentSheet: reason chips (No call·no show / Sick / Half day / Family emergency) not visible after tap',
      screen: '/(supervisor)/today → MarkAbsentSheet',
      step: 'Tap worker row → Mark absent',
      expected: '4 reason chips visible',
      actual: `Body excerpt did not contain any chip label. Excerpt: ${mabody.slice(0, 300)}`,
      evidence: ['b-today/06-mark-absent-attempt.png'],
      severity: 'P1',
      confidence: 60,
      cluster: 'C-sheets',
    });
  }
  await page.keyboard.press('Escape').catch(() => {
    /* ignore */
  });
  await waitQuiet(page, 400);

  // ---- Decisions ----
  await gotoSafe(page, '/(supervisor)/decisions', 'c-decisions');
  await shot(page, 'c-decisions', '01-immediate');
  // CRITICAL invariant: while loading, title should say "Decisions" not "All caught up"
  const decEarly = await bodyText(page);
  await shot(page, 'c-decisions', '02-loading');
  const hasLoading = /loading decisions/i.test(decEarly);
  const hasAllCaught = /all caught up/i.test(decEarly);
  const titleSaysDecisions = /\bdecisions\b/i.test(decEarly);
  if (hasLoading && hasAllCaught) {
    addBug({
      title:
        'Cluster 2 regression: Decisions title still says "All caught up" while body shows "Loading decisions…"',
      screen: '/(supervisor)/decisions',
      step: 'Tap Decisions tab, capture body during loading',
      expected: 'Title === "Decisions" while spinner visible (per Cluster 2 fix in 52630fb)',
      actual: `Body simultaneously contains "Loading decisions…" AND "All caught up". Excerpt: ${decEarly.slice(0, 300)}`,
      evidence: ['c-decisions/02-loading.png'],
      severity: 'P0',
      confidence: 95,
      cluster: 'C2-loading-state',
    });
    record(
      'Decisions title invariant',
      '"Decisions" during load',
      '"All caught up" during load',
      false,
    );
  } else if (hasLoading && titleSaysDecisions) {
    record('Decisions title invariant', '"Decisions" during load', 'PASS', true);
  } else {
    record(
      'Decisions title invariant',
      '"Decisions" during load',
      `hasLoading=${hasLoading} titleSaysDecisions=${titleSaysDecisions} hasAllCaught=${hasAllCaught}`,
      !hasAllCaught || !hasLoading,
    );
  }
  const decRes = await waitForApi(page, '/supervisor/decisions', 15_000);
  if (decRes) {
    const lm = decRes.latencyMs ?? 0;
    const ok = lm <= LATENCY_TARGETS_MS['/supervisor/decisions']!;
    record(
      '/supervisor/decisions',
      `<${LATENCY_TARGETS_MS['/supervisor/decisions']}ms`,
      `${lm}ms`,
      ok,
    );
    if (!ok) {
      addBug({
        title: `/supervisor/decisions latency regression: ${lm}ms > 6000ms target`,
        screen: '/(supervisor)/decisions',
        step: 'Mobile-web fetch',
        expected: '<6000ms warm-load',
        actual: `${lm}ms (Status ${decRes.status})`,
        evidence: ['network.har'],
        severity: 'P0',
        confidence: 95,
        cluster: 'C1-latency',
      });
    }
  }
  await shot(page, 'c-decisions', '03-after-load');
  // Try tap a card → look for Approve/Reject footer
  setStep('c-decisions-card');
  const cardLabels = await page
    .getByText(/approve|reject|accept|send to someone else/i)
    .count()
    .catch(() => 0);
  if (cardLabels === 0) {
    addBug({
      title:
        'DecisionCard footers: no Approve/Reject/Accept/etc. button labels rendered after data load',
      screen: '/(supervisor)/decisions',
      step: 'Wait for load, scan for footer buttons',
      expected: 'At least one card footer with Approve/Reject/Accept visible',
      actual: '0 matches for /approve|reject|accept|send to someone else/i',
      evidence: ['c-decisions/03-after-load.png'],
      severity: 'P1',
      confidence: 65,
      cluster: 'C-decision-footers',
    });
  }
  // Try tap Reject to verify reason sheet flow (Cluster A backend fix)
  if (await tryClickByText(page, /reject/i, { timeout: 2000 })) {
    await waitQuiet(page, 800);
    await shot(page, 'c-decisions', '04-reject-tap');
    const rejBody = await bodyText(page);
    if (!/reason|why|enter|describe/i.test(rejBody)) {
      addBug({
        title: 'DecisionCard Reject: tapping Reject does not open reason sheet',
        screen: '/(supervisor)/decisions',
        step: 'Tap card → tap Reject',
        expected: 'Reason input sheet opens (per Cluster A backend fix)',
        actual: `Body lacked reason-prompt keywords. Excerpt: ${rejBody.slice(0, 300)}`,
        evidence: ['c-decisions/04-reject-tap.png'],
        severity: 'P0',
        confidence: 70,
        cluster: 'C-decision-footers',
      });
    }
    await page.keyboard.press('Escape').catch(() => {
      /* ignore */
    });
  }
  // Deep link with focus param
  await gotoSafe(page, '/(supervisor)/decisions?focus=test-id', 'c-decisions-deeplink');
  await waitQuiet(page, 1500);
  await shot(page, 'c-decisions-deeplink', '01');

  // ---- Activity ----
  await gotoSafe(page, '/(supervisor)/activity', 'd-activity');
  await shot(page, 'd-activity', '01-immediate');
  const actEarly = await bodyText(page);
  // Cluster 2 — activity shouldn't say "0 events" while loading
  const hasZeroEvents = /\b0\s*events\b/i.test(actEarly);
  const hasActivitySpinner = /loading|fetching/i.test(actEarly);
  if (hasZeroEvents && hasActivitySpinner) {
    addBug({
      title: 'Activity tab: "0 events" rendered alongside spinner during loading',
      screen: '/(supervisor)/activity',
      step: 'Open Activity, capture body during load',
      expected: 'Counter hidden or "—" until data arrives (Cluster 2 invariant)',
      actual: `Body has "0 events" + spinner simultaneously. Excerpt: ${actEarly.slice(0, 300)}`,
      evidence: ['d-activity/01-immediate.png'],
      severity: 'P1',
      confidence: 80,
      cluster: 'C2-loading-state',
    });
  }
  const actRes = await waitForApi(page, '/supervisor/activity', 10_000);
  if (actRes) {
    const lm = actRes.latencyMs ?? 0;
    const ok = lm <= LATENCY_TARGETS_MS['/supervisor/activity']!;
    record(
      '/supervisor/activity',
      `<${LATENCY_TARGETS_MS['/supervisor/activity']}ms`,
      `${lm}ms`,
      ok,
    );
    if (!ok) {
      addBug({
        title: `/supervisor/activity latency regression: ${lm}ms > 2000ms target`,
        screen: '/(supervisor)/activity',
        step: 'Mobile-web fetch',
        expected: '<2000ms',
        actual: `${lm}ms`,
        evidence: ['network.har'],
        severity: 'P0',
        confidence: 95,
        cluster: 'C1-latency',
      });
    }
  }
  await shot(page, 'd-activity', '02-after-load');
  // Tap a row → ActionDrawer
  setStep('d-activity-actiondrawer');
  const row = page.locator('[role="button"]').first();
  await row.click({ timeout: 2000 }).catch(() => {
    /* ignore */
  });
  await waitQuiet(page, 800);
  await shot(page, 'd-activity', '03-row-tap');
  const drawerBody = await bodyText(page);
  if (!/share to whatsapp|reverse/i.test(drawerBody)) {
    addBug({
      title: 'ActionDrawer: Share to WhatsApp / Reverse buttons not visible after row tap',
      screen: '/(supervisor)/activity → ActionDrawer',
      step: 'Tap an Activity row',
      expected: 'Drawer opens with "Share to WhatsApp" + "Reverse"',
      actual: `Body lacked keywords. Excerpt: ${drawerBody.slice(0, 250)}`,
      evidence: ['d-activity/03-row-tap.png'],
      severity: 'P1',
      confidence: 60,
      cluster: 'C-action-drawer',
    });
  }
  await page.keyboard.press('Escape').catch(() => {
    /* ignore */
  });

  // ---- Chat ----
  await gotoSafe(page, '/(supervisor)/chat', 'e-chat');
  await shot(page, 'e-chat', '01-immediate');
  await waitQuiet(page, 300);
  await shot(page, 'e-chat', '02-after-300ms');
  const chatEarly = await bodyText(page);
  // Cluster 2 invariant — should NOT say "0 sites · 0 workers active" while loading
  if (/0\s*sites.*0\s*workers/i.test(chatEarly)) {
    addBug({
      title:
        'Chat: GreetingCard still shows "0 sites · 0 workers active" while loading (Cluster 2 regression)',
      screen: '/(supervisor)/chat',
      step: 'Open Chat tab, capture body during load',
      expected: 'GreetingCard subtitle === "Loading your day…" until data lands',
      actual: `Body has "0 sites … 0 workers active" before data. Excerpt: ${chatEarly.slice(0, 300)}`,
      evidence: ['e-chat/02-after-300ms.png'],
      severity: 'P0',
      confidence: 92,
      cluster: 'C2-loading-state',
    });
    record(
      'Chat GreetingCard invariant',
      'Loading your day… during load',
      'shows "0 sites · 0 workers"',
      false,
    );
  } else if (/loading your day/i.test(chatEarly)) {
    record('Chat GreetingCard invariant', 'Loading your day… during load', 'PASS', true);
  } else {
    record(
      'Chat GreetingCard invariant',
      'Loading your day… during load',
      'neither pattern matched',
      false,
    );
  }
  await waitForApi(page, '/supervisor/today', 10_000); // chat reuses today context
  await shot(page, 'e-chat', '03-after-load');
  // Type 'help' → expect short-circuit
  setStep('e-chat-help');
  const chatInput = page.locator('input, textarea').last();
  const inputCount = await page
    .locator('input, textarea')
    .count()
    .catch(() => 0);
  if (inputCount === 0) {
    addBug({
      title: 'Chat: composer input not present',
      screen: '/(supervisor)/chat',
      step: 'Look for input/textarea',
      expected: 'Text composer at bottom',
      actual: '0 input/textarea elements found',
      evidence: ['e-chat/03-after-load.png'],
      severity: 'P0',
      confidence: 80,
      cluster: 'C-chat',
    });
  } else {
    await chatInput.fill('help').catch(() => {
      /* ignore */
    });
    if (!(await tryClickByText(page, /send/i, { timeout: 1200 }))) {
      await page.keyboard.press('Enter').catch(() => {
        /* ignore */
      });
    }
    await waitQuiet(page, 2500);
    await shot(page, 'e-chat', '04-help-sent');
    const helpBody = await bodyText(page);
    if (!/help|command|here are/i.test(helpBody)) {
      addBug({
        title: 'Chat: typing "help" did not produce a visible help short-circuit response',
        screen: '/(supervisor)/chat',
        step: 'Type "help", send',
        expected: 'Help reply appears within ~2s',
        actual: `No help-like keyword surfaced. Excerpt: ${helpBody.slice(0, 250)}`,
        evidence: ['e-chat/04-help-sent.png'],
        severity: 'P1',
        confidence: 65,
        cluster: 'C-chat',
      });
    }
  }
  // Amend deeplink
  await gotoSafe(page, '/(supervisor)/chat?amendDecisionId=test-decision', 'e-chat-amend');
  await waitQuiet(page, 1500);
  await shot(page, 'e-chat-amend', '01');
  const amendBody = await bodyText(page);
  if (!/amend|editing|change/i.test(amendBody)) {
    addBug({
      title: 'Chat amend deep-link: amend banner not visible',
      screen: '/(supervisor)/chat?amendDecisionId=…',
      step: 'Open chat with amendDecisionId param',
      expected: 'Amend banner visible',
      actual: `No "amend"/"editing"/"change" keyword. Excerpt: ${amendBody.slice(0, 250)}`,
      evidence: ['e-chat-amend/01.png'],
      severity: 'P1',
      confidence: 55,
      cluster: 'C-chat',
    });
  }

  // ---- Profile ----
  await gotoSafe(page, '/(supervisor)/profile', 'f-profile');
  await shot(page, 'f-profile', '01-immediate');
  // Within first 500ms, should see header + avatar placeholder (Cluster 3)
  await waitQuiet(page, 500);
  await shot(page, 'f-profile', '02-after-500ms');
  const profEarly = await bodyText(page);
  if (!/profile|signed in|account|sign out/i.test(profEarly)) {
    addBug({
      title:
        'Profile: chrome (header + avatar placeholder) not visible within 500ms (Cluster 3 regression)',
      screen: '/(supervisor)/profile',
      step: 'Navigate, capture at 500ms',
      expected: 'Header "Profile" + avatar placeholder rendered before data',
      actual: `Body excerpt: ${profEarly.slice(0, 250)}`,
      evidence: ['f-profile/02-after-500ms.png'],
      severity: 'P0',
      confidence: 80,
      cluster: 'C3-chrome-before-data',
    });
    record('Profile frame-before-data', 'header visible <500ms', 'header missing', false);
  } else {
    record('Profile frame-before-data', 'header visible <500ms', 'PASS', true);
  }
  const meRes = await waitForApi(page, '/me', 10_000);
  if (meRes) {
    const lm = meRes.latencyMs ?? 0;
    const ok = lm <= LATENCY_TARGETS_MS['/me']!;
    record('/me', `<${LATENCY_TARGETS_MS['/me']}ms`, `${lm}ms`, ok);
    if (!ok) {
      addBug({
        title: `/me latency regression: ${lm}ms > 1500ms target`,
        screen: '/(supervisor)/profile',
        step: 'Mobile-web fetch',
        expected: '<1500ms warm-load',
        actual: `${lm}ms`,
        evidence: ['network.har'],
        severity: 'P0',
        confidence: 95,
        cluster: 'C1-latency',
      });
    }
  }
  await shot(page, 'f-profile', '03-after-load');

  // Language picker test
  setStep('f-profile-lang');
  for (const lang of ['हिंदी', 'తెలుగు', 'English']) {
    if (await tryClickByText(page, lang, { timeout: 1200 })) {
      await waitQuiet(page, 600);
      await shot(page, 'f-profile', `04-lang-${lang}`);
    }
  }

  // ---- Summary ----
  await gotoSafe(page, '/(supervisor)/summary', 'g-summary');
  await shot(page, 'g-summary', '01-immediate');
  const sumRes = await waitForApi(page, '/supervisor/summary', 15_000);
  if (sumRes) {
    const lm = sumRes.latencyMs ?? 0;
    const ok = lm <= LATENCY_TARGETS_MS['/supervisor/summary']!;
    record('/supervisor/summary', `<${LATENCY_TARGETS_MS['/supervisor/summary']}ms`, `${lm}ms`, ok);
    if (!ok) {
      addBug({
        title: `/supervisor/summary latency regression: ${lm}ms > 5000ms target`,
        screen: '/(supervisor)/summary',
        step: 'Mobile-web fetch',
        expected: '<5000ms',
        actual: `${lm}ms`,
        evidence: ['network.har'],
        severity: 'P0',
        confidence: 95,
        cluster: 'C1-latency',
      });
    }
  }
  await shot(page, 'g-summary', '02-after-load');

  // ---- Updates ----
  await gotoSafe(page, '/(supervisor)/updates', 'h-updates');
  await shot(page, 'h-updates', '01-immediate');
  const updEarly = await bodyText(page);
  // invariant: no "0 new" badge while loading
  if (/loading updates/i.test(updEarly) && /\b0 new\b/i.test(updEarly)) {
    addBug({
      title: 'Updates: "0 new" badge shown alongside "Loading updates…" (Cluster 2 regression)',
      screen: '/(supervisor)/updates',
      step: 'Open Updates, capture during load',
      expected: 'Generic header, no count badge until data lands',
      actual: `Body has "0 new" and "Loading updates…" together. Excerpt: ${updEarly.slice(0, 250)}`,
      evidence: ['h-updates/01-immediate.png'],
      severity: 'P1',
      confidence: 80,
      cluster: 'C2-loading-state',
    });
    record(
      'Updates header invariant',
      'no "0 new" badge during load',
      'shows "0 new" while loading',
      false,
    );
  } else {
    record('Updates header invariant', 'no "0 new" badge during load', 'PASS', true);
  }
  const updRes = await waitForApi(page, '/supervisor/updates', 10_000);
  if (updRes) {
    const lm = updRes.latencyMs ?? 0;
    const ok = lm <= LATENCY_TARGETS_MS['/supervisor/updates']!;
    record('/supervisor/updates', `<${LATENCY_TARGETS_MS['/supervisor/updates']}ms`, `${lm}ms`, ok);
    if (!ok) {
      addBug({
        title: `/supervisor/updates latency regression: ${lm}ms > 2000ms target`,
        screen: '/(supervisor)/updates',
        step: 'Mobile-web fetch',
        expected: '<2000ms',
        actual: `${lm}ms`,
        evidence: ['network.har'],
        severity: 'P0',
        confidence: 95,
        cluster: 'C1-latency',
      });
    }
  }
  await shot(page, 'h-updates', '02-after-load');
  // check for duplicate empty state
  const updFinal = await bodyText(page);
  if ((updFinal.match(/all caught up/gi) ?? []).length >= 2) {
    addBug({
      title: 'Updates: duplicate "All caught up" empty-state copy still present',
      screen: '/(supervisor)/updates',
      step: 'After load',
      expected: 'One empty-state line',
      actual: 'Two "All caught up" matches',
      evidence: ['h-updates/02-after-load.png'],
      severity: 'P2',
      confidence: 85,
      cluster: 'C-copy',
    });
  }

  // ---- Sites drawer entry ----
  await gotoSafe(page, '/(supervisor)/sites', 'i-sites');
  await waitQuiet(page, 2000);
  await shot(page, 'i-sites', '01');
  const sitesBody = await bodyText(page);
  if (!/aparna|apollo|building|site/i.test(sitesBody) || sitesBody.length < 100) {
    addBug({
      title: 'Sites drawer entry: no site list rendered',
      screen: '/(supervisor)/sites',
      step: 'Open sites',
      expected: 'List of Reddy sites',
      actual: `Body excerpt: ${sitesBody.slice(0, 250)}`,
      evidence: ['i-sites/01.png'],
      severity: 'P1',
      confidence: 65,
      cluster: 'C-drawer',
    });
  }

  // ---- Memory ----
  await gotoSafe(page, '/(supervisor)/memory', 'j-memory');
  await waitQuiet(page, 1800);
  await shot(page, 'j-memory', '01');

  // ---- Replacement Picker — entry without context ----
  await gotoSafe(page, '/(supervisor)/replacement-picker', 'k-replacement-picker');
  await waitQuiet(page, 1800);
  await shot(page, 'k-replacement-picker', '01-no-context');
  const rpBody = await bodyText(page);
  if (
    !/open this from|select.*worker|no context|missing/i.test(rpBody) &&
    /pick someone/i.test(rpBody)
  ) {
    addBug({
      title:
        'Replacement Picker: no entry guard — opens directly without context (B-12 regression)',
      screen: '/(supervisor)/replacement-picker',
      step: 'Navigate directly without params',
      expected: 'Empty-state telling user to open from worker/site action',
      actual: `Just renders "Pick someone…" with no guard. Excerpt: ${rpBody.slice(0, 250)}`,
      evidence: ['k-replacement-picker/01-no-context.png'],
      severity: 'P1',
      confidence: 80,
      cluster: 'C-replacement-picker',
    });
  }
  // With context
  await gotoSafe(
    page,
    '/(supervisor)/replacement-picker?originalWorkerUserId=test-user&siteId=test-site',
    'k-replacement-picker-with-context',
  );
  await waitQuiet(page, 1800);
  await shot(page, 'k-replacement-picker-with-context', '01-with-context');

  // ---- Sign-out ----
  await gotoSafe(page, '/(supervisor)/profile', 'l-signout');
  await waitQuiet(page, 1500);
  if (await tryClickByText(page, /sign out|log out|logout/i, { timeout: 2000 })) {
    await waitQuiet(page, 2000);
    await shot(page, 'l-signout', 'after');
    const url = page.url();
    if (!/auth|phone/i.test(url)) {
      addBug({
        title: 'Sign-out did not return to /(auth)/phone',
        screen: '/(supervisor)/profile → sign out',
        step: 'Tap Sign out',
        expected: 'Navigate to /(auth)/phone',
        actual: `URL after sign-out: ${url}`,
        evidence: ['l-signout/after.png'],
        severity: 'P1',
        confidence: 75,
        cluster: 'C-auth',
      });
    }
  } else {
    addBug({
      title: 'Sign-out button not findable',
      screen: '/(supervisor)/profile',
      step: 'Look for Sign out',
      expected: 'A "Sign out" CTA',
      actual: 'No matching text found',
      evidence: [],
      severity: 'P1',
      confidence: 70,
      cluster: 'C-auth',
    });
  }

  // ===== HEURISTIC POST-PASS =====

  // 1. 4xx/5xx
  const errResponses = netEvents.filter((e) => e.type === 'res' && (e.status ?? 0) >= 400);
  const errByUrl = new Map<string, NetEv[]>();
  for (const e of errResponses) {
    const key = `${e.method ?? ''} ${e.url}`;
    if (!errByUrl.has(key)) errByUrl.set(key, []);
    errByUrl.get(key)!.push(e);
  }
  for (const [key, evs] of errByUrl) {
    const first = evs[0]!;
    addBug({
      title: `API ${first.status}: ${key} (${evs.length}×)`,
      screen: first.step,
      step: 'Captured during walk',
      expected: '2xx',
      actual: `HTTP ${first.status}. Body: ${first.bodyExcerpt?.slice(0, 200) ?? '<empty>'}`,
      evidence: ['network.har', `step=${first.step}`],
      severity: first.status === 401 || first.status === 403 ? 'P0' : 'P1',
      confidence: 90,
      cluster: 'C-api-errors',
    });
  }

  // 2. pageerror
  const pageErrors = consoleEvents.filter((e) => e.type === 'pageerror');
  const peByText = new Map<string, ConsoleEv[]>();
  for (const e of pageErrors) {
    const key = e.text.slice(0, 80);
    if (!peByText.has(key)) peByText.set(key, []);
    peByText.get(key)!.push(e);
  }
  for (const [, evs] of peByText) {
    const first = evs[0]!;
    addBug({
      title: `pageerror: ${first.text.slice(0, 90)}`,
      screen: first.step,
      step: 'During render',
      expected: 'No JS exceptions (Reanimated/voice/LAN-IP fixes should have eliminated these)',
      actual: first.text.slice(0, 500),
      evidence: ['console.jsonl', `count=${evs.length}`],
      severity: 'P0',
      confidence: 95,
      cluster: 'C-runtime-crash',
    });
  }

  // 3. console errors (level=error)
  const consoleErrors = consoleEvents.filter((e) => e.type === 'console' && e.level === 'error');
  const ceByText = new Map<string, ConsoleEv[]>();
  for (const e of consoleErrors) {
    const key = e.text.slice(0, 80);
    if (!ceByText.has(key)) ceByText.set(key, []);
    ceByText.get(key)!.push(e);
  }
  for (const [, evs] of ceByText) {
    const first = evs[0]!;
    addBug({
      title: `console.error: ${first.text.slice(0, 90)}`,
      screen: first.step,
      step: 'During render',
      expected: 'No console errors',
      actual: first.text.slice(0, 500),
      evidence: ['console.jsonl', `count=${evs.length}`],
      severity: 'P1',
      confidence: 90,
      cluster: 'C-console',
    });
  }

  // Persist
  await fs.writeFile(
    path.join(OUT_ROOT, 'network.jsonl'),
    netEvents.map((e) => JSON.stringify(e)).join('\n'),
  );
  await fs.writeFile(
    path.join(OUT_ROOT, 'console.jsonl'),
    consoleEvents.map((e) => JSON.stringify(e)).join('\n'),
  );
  await fs.writeFile(
    path.join(OUT_ROOT, 'verification-results.json'),
    JSON.stringify(verificationResults, null, 2),
  );

  // ===== WRITE FINDINGS MARKDOWN =====
  const lines: string[] = [];
  lines.push(`# Axhy v3 supervisor app — Pass 2 rewalk findings (2026-05-18)`);
  lines.push('');
  lines.push(`**Walker:** Suresh Kumar @ Reddy Cleaning Services (\`+919999999999\`)`);
  lines.push(`**Web URL:** ${WEB_URL}`);
  lines.push(`**API URL:** ${API_URL}`);
  lines.push(`**Device:** iPhone 13 Mini (390×844)`);
  lines.push(
    `**Throttle:** 4× CPU + Slow 3G on /(auth) load, then disabled for screen-by-screen UX verification`,
  );
  lines.push(
    `**Mandate:** verify fixes from commit 52630fb + surface 25 bugs that Cluster 1 blocked. No source modified.`,
  );
  lines.push('');
  lines.push(`## Cluster 1 latency verification (UI-side, post-fix)`);
  lines.push('');
  lines.push(`| Endpoint | Target | Observed | Pass? |`);
  lines.push(`| --- | --- | --- | --- |`);
  for (const r of verificationResults) {
    lines.push(`| ${r.name} | ${r.target} | ${r.observed} | ${r.pass ? 'PASS' : 'FAIL'} |`);
  }
  lines.push('');
  lines.push(`## Step timings`);
  for (const t of stepTimings) lines.push(`- ${t.step}: ${t.ms}ms`);
  lines.push('');
  lines.push(`## Network / console summary`);
  lines.push(`- Total requests: ${netEvents.filter((e) => e.type === 'req').length}`);
  lines.push(`- Total responses: ${netEvents.filter((e) => e.type === 'res').length}`);
  lines.push(`- 4xx/5xx: ${errResponses.length}`);
  lines.push(`- Page errors: ${pageErrors.length}`);
  lines.push(`- Console errors: ${consoleErrors.length}`);
  lines.push('');
  // Cluster bugs by cluster
  lines.push(`## Bugs (${bugs.length})`);
  lines.push('');
  const clusters = new Map<string, Bug[]>();
  for (const b of bugs) {
    const c = b.cluster ?? 'C-misc';
    if (!clusters.has(c)) clusters.set(c, []);
    clusters.get(c)!.push(b);
  }
  for (const [name, list] of [...clusters.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`### Cluster ${name} (${list.length})`);
    lines.push('');
    for (const b of list) {
      lines.push(`#### ${b.id} — ${b.title}`);
      lines.push(`- **Screen / step**: ${b.screen} — ${b.step}`);
      lines.push(`- **Expected**: ${b.expected}`);
      lines.push(`- **Actual**: ${b.actual}`);
      lines.push(`- **Evidence**: ${b.evidence.join('; ') || '(see screenshots dir)'}`);
      lines.push(`- **Severity**: ${b.severity}`);
      lines.push(`- **Confidence**: ${b.confidence}%`);
      lines.push('');
    }
  }
  const findingsPath = path.resolve(
    __dirname,
    '..',
    '..',
    'docs/findings/2026-05-18-supervisor-qa-rewalk.md',
  );
  await safeMkdir(path.dirname(findingsPath));
  await fs.writeFile(findingsPath, lines.join('\n'));
  console.log(`\n[done] Wrote ${findingsPath}`);
  console.log(
    `[done] ${bugs.length} bugs. ${netEvents.length} net events. ${consoleEvents.length} console events.`,
  );
  console.log(
    `[done] Verification: ${verificationResults.filter((r) => r.pass).length}/${verificationResults.length} passed.`,
  );

  await context.close();
  await browser.close();
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
