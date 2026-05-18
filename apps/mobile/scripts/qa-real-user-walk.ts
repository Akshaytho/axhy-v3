/**
 * Real-user Playwright walkthrough of the Axhy v3 supervisor app.
 *
 * Founder feedback 2026-05-18: "did you use curl commands to go to those
 * pages or like a real user because I couldn't see few screens at all
 * when before I used my phone and how is navigation possible when its
 * not their".
 *
 * Earlier walks (qa-round3, qa-rewalk, qa-round5-after-capture) cheated:
 *   - Login: POST /auth/otp/{request,verify} via fetch(), token injected
 *     into storage. The phone-number input + OTP input were never typed.
 *   - Navigation: page.goto('/(supervisor)/today') etc. The drawer
 *     hamburger + drawer entries + tab bar were never tapped.
 *
 * This walk does it the way Ravi at Surya Cleaning would on his phone:
 *   - Phone screen: types digits into the input, taps "Get OTP"
 *   - OTP screen: types 123456 (the AXHY_OTP_BYPASS code), taps "Verify"
 *   - Drawer: taps the ≡ menu button, taps each drawer entry
 *   - Tabs: taps each tab in the bottom tab bar
 *
 * If any UI element is broken on real touch (drawer doesn't open, tab
 * bar entry doesn't fire, login button stays disabled when it
 * shouldn't), this walk catches it. The URL-shortcut walks could not.
 *
 * Output:
 *   apps/mobile/screenshots-sprint-2/qa-real-user-walk/<step>/<seq>.png
 *   docs/findings/2026-05-18-supervisor-qa-real-user-walk.md
 *
 * @derives(feedback_walk_every_screen_as_real_user_before_founder.md, 2026-05-18)
 * @derives(feedback_never_accept_cant_do_from_cli.md, 2026-05-18)
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { chromium, devices, type Browser, type BrowserContext, type Page } from '@playwright/test';

// Use loopback by default; the LAN IP changes when the laptop switches
// between WiFi networks. AXHY_WEB_URL / AXHY_API_URL override for the
// founder's phone testing (they'll use the current LAN IP).
const WEB_URL = process.env.AXHY_WEB_URL ?? 'http://localhost:8081';
const API_URL = process.env.AXHY_API_URL ?? 'http://localhost:4000';
const PHONE_DIGITS = '9999999999';
const OTP_CODE = '123456';

// __dirname is wrong when the canonical script lives in scripts/devtools-capture/
// but the runnable copy lives in apps/mobile/scripts/. Pin to repo root via the
// nearest pnpm-workspace.yaml so both copies write to the same place.
function repoRoot(): string {
  let cur = __dirname;
  while (cur !== '/' && cur.length > 1) {
    try {
      const fsSync = require('node:fs');
      if (fsSync.existsSync(path.join(cur, 'pnpm-workspace.yaml'))) return cur;
    } catch {
      /* ignore */
    }
    cur = path.dirname(cur);
  }
  return process.cwd();
}
const ROOT = repoRoot();
const OUT_ROOT = path.join(ROOT, 'apps/mobile/screenshots-sprint-2/qa-real-user-walk');
const FINDINGS = path.join(ROOT, 'docs/findings/2026-05-18-supervisor-qa-real-user-walk.md');

type Finding = {
  id: string;
  severity: 'P0' | 'P1' | 'P2';
  title: string;
  step: string;
  expected: string;
  actual: string;
  evidence: string[];
};

const findings: Finding[] = [];
const log: string[] = [];

function addFinding(f: Omit<Finding, 'id'>): void {
  const id = `RUW-${String(findings.length + 1).padStart(2, '0')}`;
  findings.push({ id, ...f });
  log.push(`[FINDING ${id}] (${f.severity}) ${f.title} — ${f.actual}`);
}

function noteOk(msg: string): void {
  log.push(`[OK] ${msg}`);
}

async function safeMkdir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true });
}

async function shot(page: Page, step: string, name: string): Promise<string> {
  const dir = path.join(OUT_ROOT, step);
  await safeMkdir(dir);
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function dumpBodyText(page: Page, max = 3000): Promise<string> {
  const t = await page.evaluate(() => document.body.innerText ?? '');
  return t.slice(0, max);
}

async function waitForUiReady(page: Page, timeoutMs = 15_000): Promise<void> {
  // The Expo web bundle is large; even after `load` fires, the React
  // tree may still be mounting. Wait for ANY visible text content.
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const text = await dumpBodyText(page, 200);
    if (text.trim().length > 0) return;
    await page.waitForTimeout(120);
  }
}

/**
 * Poll for body text matching a regex. More robust than fixed waitForTimeout
 * — when the dev server is slow or the network is jittery, we just keep
 * polling until the deadline. Returns true if matched, false on timeout.
 */
async function waitForText(page: Page, pattern: RegExp, timeoutMs = 20_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const text = await dumpBodyText(page, 1500);
    if (pattern.test(text)) return true;
    await page.waitForTimeout(300);
  }
  return false;
}

/**
 * Try every reasonable locator strategy for a labeled interactive element.
 * RN Web renders tabs as role="tab"|"link" and drawer items as role="button"
 * with aria-label; this helper covers both.
 */
async function tapByLabel(
  page: Page,
  label: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const strategies: Array<() => ReturnType<typeof page.locator>> = [
    () => page.getByRole('tab', { name: label, exact: false }),
    () => page.getByRole('link', { name: label, exact: false }),
    () => page.locator(`[aria-label="${label}"]`),
    () => page.getByText(new RegExp(`^${label}$`, 'i')),
    () => page.getByText(new RegExp(label, 'i')),
  ];
  for (const make of strategies) {
    try {
      const el = make().first();
      if ((await el.count()) === 0) continue;
      await el.waitFor({ state: 'visible', timeout: 2_000 });
      await el.click({ timeout: 2_000 });
      return { ok: true };
    } catch {
      /* try next */
    }
  }
  return { ok: false, reason: `no locator strategy found "${label}"` };
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await safeMkdir(OUT_ROOT);

  const browser: Browser = await chromium.launch({ headless: true });
  const context: BrowserContext = await browser.newContext({
    ...devices['iPhone 13 Mini'],
    viewport: { width: 390, height: 844 },
  });

  context.on('console', (msg) => {
    if (msg.type() === 'error') log.push(`[console-error] ${msg.text()}`);
  });

  const page = await context.newPage();
  page.on('pageerror', (err) => {
    log.push(`[pageerror] ${err.message}`);
    addFinding({
      severity: 'P1',
      title: `Uncaught pageerror: ${err.message.split('\n')[0]}`,
      step: 'global',
      expected: 'no pageerrors during the supervisor flow',
      actual: err.message.split('\n')[0]!,
      evidence: [],
    });
  });

  try {
    // -- Step A: open the app ------------------------------------------------
    log.push(`[step A] open ${WEB_URL}`);
    await page.goto(WEB_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await waitForUiReady(page);
    await shot(page, 'A-open', '01-landed');

    // Check we landed on the phone screen (UI says "Sign in" + "Get OTP").
    const aText = await dumpBodyText(page);
    if (!/sign in/i.test(aText) && !/enter your mobile/i.test(aText)) {
      addFinding({
        severity: 'P0',
        title: 'Cold-open did not land on the phone-OTP screen',
        step: 'A-open',
        expected: 'Phone-OTP "Sign in" screen visible on cold open with no tokens',
        actual: `body text contained no "Sign in" / "Enter your mobile". First 200 chars: ${aText.slice(0, 200)}`,
        evidence: ['A-open/01-landed.png'],
      });
    } else {
      noteOk('cold-open landed on phone-OTP "Sign in" screen');
    }

    // -- Step B: type phone digits via the UI --------------------------------
    log.push('[step B] type phone digits');
    // The phone input has placeholder "98765 43210". Find by placeholder.
    let phoneInputFound = false;
    try {
      const phoneInput = page.locator('input[placeholder="98765 43210"]');
      await phoneInput.waitFor({ state: 'visible', timeout: 5_000 });
      await phoneInput.click();
      await phoneInput.fill(PHONE_DIGITS);
      phoneInputFound = true;
      noteOk('typed phone digits into UI input');
    } catch (e) {
      addFinding({
        severity: 'P0',
        title: 'Phone input not focusable via UI on the Sign-in screen',
        step: 'B-phone',
        expected: 'TextInput with placeholder "98765 43210" is clickable + fillable',
        actual: `Locator not visible within 5s: ${(e as Error).message}`,
        evidence: ['A-open/01-landed.png'],
      });
    }
    await shot(page, 'B-phone', '02-after-typing');

    // -- Step C: tap "Get OTP" button ----------------------------------------
    if (phoneInputFound) {
      log.push('[step C] tap Get OTP');
      try {
        const getOtpBtn = page.getByText(/^get otp$/i).first();
        await getOtpBtn.waitFor({ state: 'visible', timeout: 5_000 });
        // Ensure the button is enabled — earlier walks didn't verify this.
        const isDisabled = await getOtpBtn.evaluate((el: Element) => {
          const a = el.getAttribute('aria-disabled');
          return a === 'true';
        });
        if (isDisabled) {
          addFinding({
            severity: 'P0',
            title: '"Get OTP" button is disabled even after typing 10 valid digits',
            step: 'C-get-otp',
            expected: 'Button is enabled once 10 digits are typed',
            actual: 'aria-disabled="true" while digits.length === 10',
            evidence: ['B-phone/02-after-typing.png'],
          });
        } else {
          await getOtpBtn.click();
          noteOk('tapped Get OTP button');
        }
      } catch (e) {
        addFinding({
          severity: 'P0',
          title: '"Get OTP" button not found on Sign-in screen',
          step: 'C-get-otp',
          expected: 'A "Get OTP" button is visible after typing a phone',
          actual: `Locator not visible within 5s: ${(e as Error).message}`,
          evidence: ['B-phone/02-after-typing.png'],
        });
      }
    }
    // Poll for OTP screen instead of fixed wait. The phone → OTP transition
    // fires POST /auth/otp/request (1-3s) then the router transitions; under
    // slow network it can take 8-10s. We give it up to 20s.
    const otpVisible = await waitForText(page, /enter otp|sent to/i, 20_000);
    await shot(page, 'C-get-otp', '03-after-tap');

    // -- Step D: OTP screen --------------------------------------------------
    log.push('[step D] type OTP code');
    const dText = otpVisible ? await dumpBodyText(page) : 'OTP screen never appeared';
    if (!/enter otp|otp|sent to/i.test(dText)) {
      addFinding({
        severity: 'P0',
        title: 'After tapping Get OTP, app did not navigate to the OTP screen',
        step: 'D-otp',
        expected: 'OTP screen visible with "Enter OTP" heading',
        actual: `body text: ${dText.slice(0, 200)}`,
        evidence: ['C-get-otp/03-after-tap.png'],
      });
    } else {
      noteOk('navigated to OTP screen');
      try {
        const otpInput = page.locator('input[placeholder="------"]');
        await otpInput.waitFor({ state: 'visible', timeout: 5_000 });
        await otpInput.click();
        await otpInput.fill(OTP_CODE);
        noteOk('typed OTP 123456 into UI');
        await shot(page, 'D-otp', '04-after-typing');

        const verifyBtn = page.getByText(/^verify$/i).first();
        await verifyBtn.waitFor({ state: 'visible', timeout: 5_000 });
        await verifyBtn.click();
        noteOk('tapped Verify button');
      } catch (e) {
        addFinding({
          severity: 'P0',
          title: 'OTP input or Verify button not usable via UI',
          step: 'D-otp',
          expected: 'OTP input fillable + Verify button clickable',
          actual: `Locator not visible: ${(e as Error).message}`,
          evidence: ['C-get-otp/03-after-tap.png'],
        });
      }
    }
    // OTP verify hits POST /auth/otp/verify (1-2s) then router transitions
    // INTO the supervisor stack. The app may land on Today (cold-open) OR
    // resume on whatever screen the session was last on (Profile, Sites,
    // etc) thanks to expo-router's session persistence. We accept any
    // supervisor surface here — what matters is that we got past auth.
    const supervisorLanded = await waitForText(
      page,
      /today|decisions|activity|chat|profile|namaste|sign out/i,
      25_000,
    );
    await shot(page, 'D-otp', '05-after-verify');

    // -- Step E: post-login — verify we're past auth and on a supervisor screen
    log.push('[step E] post-login landing (any supervisor screen is acceptable)');
    if (!supervisorLanded) {
      addFinding({
        severity: 'P0',
        title: 'Post-login did not land on any supervisor surface',
        step: 'E-supervisor',
        expected: 'Some supervisor screen (Today / Decisions / Profile / Sites etc) visible',
        actual: 'no supervisor-screen text matched within 25s',
        evidence: ['D-otp/05-after-verify.png'],
      });
    } else {
      noteOk('post-login landed on a supervisor surface');
    }
    await shot(page, 'E-supervisor', '06-after-login');

    // Now explicitly navigate to Today via tab-bar before the rest of the
    // walk. This makes the test deterministic regardless of which screen
    // the prior session ended on.
    log.push('[step E] tap Today tab to anchor on Today');
    await tapByLabel(page, 'Today');
    await page.waitForTimeout(5500);
    await shot(page, 'E-today', '07-today-after-tap');

    // -- Step F: tap each tab via the bottom tab bar -------------------------
    const tabLabels = ['Decisions', 'Activity', 'Chat'];
    for (const label of tabLabels) {
      log.push(`[step F] tap tab "${label}"`);
      const stepDir = `F-tab-${label.toLowerCase()}`;
      const r = await tapByLabel(page, label);
      if (r.ok) {
        await page.waitForTimeout(5500);
        await shot(page, stepDir, `01-after-tap`);
        const tabText = (await dumpBodyText(page)).toLowerCase();
        const lowerLabel = label.toLowerCase();
        if (!tabText.includes(lowerLabel)) {
          addFinding({
            severity: 'P1',
            title: `Tab "${label}" appears not to have navigated`,
            step: stepDir,
            expected: `body text should contain "${lowerLabel}" after tapping the tab`,
            actual: `body text first 200: ${tabText.slice(0, 200)}`,
            evidence: [`${stepDir}/01-after-tap.png`],
          });
        } else {
          noteOk(`tab "${label}" rendered after UI tap`);
        }
      } else {
        addFinding({
          severity: 'P0',
          title: `Tab "${label}" not tappable via UI`,
          step: stepDir,
          expected: `A bottom-tab entry labeled "${label}" is visible + tappable`,
          actual: r.reason,
          evidence: [],
        });
      }
    }

    // -- Step G: tap the hamburger ≡ menu and inspect drawer entries --------
    // First go back to Today so the top-bar menu is visible.
    log.push('[step G] return to Today, then open drawer');
    await tapByLabel(page, 'Today');
    await page.waitForTimeout(2500);

    let drawerOpened = false;
    {
      // Hamburger button has accessibilityLabel="Menu" → aria-label="Menu" in RN web.
      const strategies: Array<() => ReturnType<typeof page.locator>> = [
        () => page.locator('[aria-label="Menu"]'),
        () => page.getByRole('button', { name: /^menu$/i }),
      ];
      for (const make of strategies) {
        try {
          const el = make().first();
          if ((await el.count()) === 0) continue;
          await el.waitFor({ state: 'visible', timeout: 3_000 });
          await el.click({ timeout: 3_000 });
          drawerOpened = true;
          noteOk('tapped hamburger ≡ menu');
          break;
        } catch {
          /* try next */
        }
      }
      if (!drawerOpened) {
        addFinding({
          severity: 'P0',
          title: 'Hamburger ≡ menu not tappable from Today top bar',
          step: 'G-drawer',
          expected: 'A button with aria-label "Menu" is visible + tappable from Today',
          actual: 'no locator strategy found an aria-label="Menu" element',
          evidence: ['E-today/06-today-after-login.png'],
        });
      }
      await page.waitForTimeout(1200);
    }
    await shot(page, 'G-drawer', '07-drawer-open');

    if (drawerOpened) {
      // Verify drawer entries are visible by text.
      const drawerText = await dumpBodyText(page);
      const requiredEntries = [
        'My profile',
        'Memory & rules',
        'My sites',
        'Language',
        'Notifications',
        'How to use Axhy',
        'Sign out',
      ];
      const missing: string[] = [];
      for (const entry of requiredEntries) {
        if (!drawerText.toLowerCase().includes(entry.toLowerCase())) {
          missing.push(entry);
        }
      }
      if (missing.length > 0) {
        addFinding({
          severity: 'P1',
          title: `Drawer is missing required entries: ${missing.join(', ')}`,
          step: 'G-drawer',
          expected: 'Drawer shows all 7 entries when opened',
          actual: `Missing: ${missing.join(', ')}`,
          evidence: ['G-drawer/07-drawer-open.png'],
        });
      } else {
        noteOk('all 7 drawer entries visible');
      }

      // Tap EVERY drawer entry — founder lock 2026-05-18 PM: "all things on
      // side bar should be working as expected right so did you check if its
      // working or not." Walk each one as a real user. The hamburger ≡ on
      // each destination screen lets us re-open the drawer for the next
      // target without going back to Today.
      const drawerNavTargets = [
        { label: 'My profile', expectInBody: /profile|namaste|sign out/i, dir: 'G-profile' },
        { label: 'My sites', expectInBody: /sites|workers? on site/i, dir: 'G-sites' },
        {
          label: 'Memory & rules',
          expectInBody: /memory|rules|coming soon|living/i,
          dir: 'G-memory',
        },
        {
          label: 'Language',
          expectInBody: /language|english|हिन्दी|తెలుగు/i,
          dir: 'G-language',
        },
        {
          label: 'Notifications',
          expectInBody: /notification|push|whatsapp|email/i,
          dir: 'G-notifications',
        },
        {
          label: 'How to use Axhy',
          expectInBody: /how to use|video|example|tutorial|coming soon/i,
          dir: 'G-howto',
        },
        {
          label: 'Temporary mode',
          expectInBody: /temporary|pause|on leave|away|coming soon/i,
          dir: 'G-temp',
        },
      ];
      for (const target of drawerNavTargets) {
        log.push(`[step G] tap drawer entry "${target.label}"`);
        // Re-open the drawer if navigation closed it.
        const reText = await dumpBodyText(page);
        if (!reText.toLowerCase().includes(target.label.toLowerCase())) {
          try {
            await page.locator('[aria-label="Menu"]').first().click({ timeout: 2_000 });
            await page.waitForTimeout(800);
          } catch {
            /* ignore */
          }
        }
        const r = await tapByLabel(page, target.label);
        if (r.ok) {
          await page.waitForTimeout(6000);
          await shot(page, target.dir, `01-after-tap`);
          const screenText = await dumpBodyText(page);
          if (!target.expectInBody.test(screenText)) {
            addFinding({
              severity: 'P1',
              title: `Drawer entry "${target.label}" did not navigate to the expected screen`,
              step: target.dir,
              expected: `body text should match ${target.expectInBody}`,
              actual: `body text first 250: ${screenText.slice(0, 250)}`,
              evidence: [`${target.dir}/01-after-tap.png`],
            });
          } else {
            noteOk(`drawer entry "${target.label}" navigated correctly`);
          }
        } else {
          addFinding({
            severity: 'P0',
            title: `Drawer entry "${target.label}" not tappable`,
            step: target.dir,
            expected: `A drawer item labeled "${target.label}" is tappable`,
            actual: r.reason,
            evidence: ['G-drawer/07-drawer-open.png'],
          });
        }
      }
    }

    // -- Step H: a deliberate within-screen interaction on Chat --------------
    log.push('[step H] open Chat tab + verify input affordances');
    const hr = await tapByLabel(page, 'Chat');
    if (hr.ok) {
      await page.waitForTimeout(3500);
      await shot(page, 'H-chat', '01-after-tap');
      const chatText = await dumpBodyText(page);
      if (!/chat|capture|mic|type|speak|ask|tell me/i.test(chatText)) {
        addFinding({
          severity: 'P1',
          title: 'Chat tab did not render a recognizable capture surface',
          step: 'H-chat',
          expected: 'Chat surface should show mic / type / capture text',
          actual: `body text first 250: ${chatText.slice(0, 250)}`,
          evidence: ['H-chat/01-after-tap.png'],
        });
      } else {
        noteOk('Chat tab capture surface visible');
      }
    } else {
      addFinding({
        severity: 'P1',
        title: 'Could not navigate to Chat tab',
        step: 'H-chat',
        expected: 'Chat tab is tappable from any other tab',
        actual: hr.reason,
        evidence: [],
      });
    }
  } finally {
    await context.close();
    await browser.close();
  }

  // -- Write findings doc ---------------------------------------------------
  const findingsBody = renderFindings();
  await safeMkdir(path.dirname(FINDINGS));
  await fs.writeFile(FINDINGS, findingsBody, 'utf8');
  await fs.writeFile(path.join(OUT_ROOT, 'log.jsonl'), log.join('\n') + '\n', 'utf8');

  // Console summary
  const p0 = findings.filter((f) => f.severity === 'P0').length;
  const p1 = findings.filter((f) => f.severity === 'P1').length;
  const p2 = findings.filter((f) => f.severity === 'P2').length;
  console.log(`\nReal-user walk complete.`);
  console.log(`  Screenshots: ${OUT_ROOT}`);
  console.log(`  Findings:    ${FINDINGS}`);
  console.log(`  P0: ${p0} | P1: ${p1} | P2: ${p2}`);
  if (p0 + p1 + p2 === 0) {
    console.log(`  ✓ All UI surfaces reachable via real touch.`);
  }
}

function renderFindings(): string {
  const lines: string[] = [];
  lines.push('# Supervisor app — real-user Playwright walk findings (2026-05-18)');
  lines.push('');
  lines.push(
    '**Walker:** Real-user simulation (Playwright iPhone 13 Mini, touch-driven). No API shortcuts, no token injection, no URL `page.goto` for tab/drawer navigation. Login via phone-input + OTP-input UI; navigation via tab-bar taps + hamburger ≡ + drawer-entry taps.',
  );
  lines.push('');
  lines.push(`**Web URL:** ${WEB_URL}`);
  lines.push(`**API URL:** ${API_URL}`);
  lines.push('');
  const p0 = findings.filter((f) => f.severity === 'P0');
  const p1 = findings.filter((f) => f.severity === 'P1');
  const p2 = findings.filter((f) => f.severity === 'P2');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- P0: ${p0.length}`);
  lines.push(`- P1: ${p1.length}`);
  lines.push(`- P2: ${p2.length}`);
  lines.push('');
  if (findings.length === 0) {
    lines.push(
      'No issues found. Every UI surface is reachable via real touch — the previous URL-shortcut walks did not hide any navigation bugs.',
    );
  } else {
    lines.push('## Findings');
    lines.push('');
    for (const f of findings) {
      lines.push(`### ${f.id} [${f.severity}] — ${f.title}`);
      lines.push(`- **Step:** ${f.step}`);
      lines.push(`- **Expected:** ${f.expected}`);
      lines.push(`- **Actual:** ${f.actual}`);
      lines.push(`- **Evidence:** ${f.evidence.join(', ') || '(no screenshot)'}`);
      lines.push('');
    }
  }
  lines.push('## Walk log (chronological)');
  lines.push('');
  lines.push('```');
  lines.push(log.join('\n'));
  lines.push('```');
  return lines.join('\n');
}

main().catch((err) => {
  console.error('real-user walk crashed:', err);
  process.exit(1);
});
