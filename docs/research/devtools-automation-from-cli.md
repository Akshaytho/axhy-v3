# DevTools-Equivalent Automation from CLI / CI

Research date: 2026-05-18.
Author: Claude (research subagent).
Audience: Axhy v3 — the founder + the panel reviewing how we verify the supervisor app from CLI.
Confidence convention: every claim is suffixed with `[Cnn%]`. ≥90% = direct doc / official source. <90% = flagged uncertain; founder should treat as advisory.

---

## Summary

**Use Playwright as the single driver, with `newCDPSession(page)` as the escape hatch into Chrome DevTools Protocol (CDP) for the surfaces Playwright doesn't expose natively (CPU throttle, vision deficiency, heap snapshots, paint flashing). Add four small dependencies on top: `@axe-core/playwright` (accessibility violations), `playwright-lighthouse` (Lighthouse audits in the same run), `web-vitals` (LCP/CLS/INP injected at runtime), and optionally `@replayio/playwright` (time-travel debugger for "what actually happened in that flaky run"). This stack covers all 13 DevTools surfaces in the founder's list. Minimal repo wiring: one `playwright.config.ts` with an iPhone-14-Mini-equivalent project, a `scripts/devtools-capture/` folder for the capture helpers, an `npm run devtools:capture` script, and an output convention of `apps/mobile/screenshots-sprint-2/<screen>/<timestamp>/`.** [C95%]

**The dev-loop is: spin up Expo Web (`expo start --web`) → run the capture script against a known supervisor screen → get a folder with screenshot.png, console.jsonl, network.har, axe.json, lighthouse.html, trace.zip, heap.heapsnapshot, coverage.json, and a `summary.json` that the founder (or panel) can read in 30 seconds.** [C92%]

---

## Per-DevTools-Surface Mapping

| #   | DevTools surface                                        | Playwright API (or equivalent)                                                                                            | Snippet                                                                                                                                                                                                                                                                                                                                                               | Source                                                                                                                                                                                                 |
| --- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Elements / DOM / A11y tree                              | `locator.ariaSnapshot()` + `@axe-core/playwright`                                                                         | `await new AxeBuilder({ page }).analyze()` returns `violations[]`. `await page.locator('main').ariaSnapshot()` returns YAML tree. [C95%]                                                                                                                                                                                                                              | [Accessibility testing](https://playwright.dev/docs/accessibility-testing)                                                                                                                             |
| 2   | Console (logs + exceptions)                             | `page.on('console')` + `page.on('pageerror')`                                                                             | `page.on('console', msg => log.push({type: msg.type(), text: msg.text()}))` and `page.on('pageerror', e => log.push({type:'pageerror', text: e.message}))`. [C95%]                                                                                                                                                                                                    | [Network guide](https://playwright.dev/docs/network)                                                                                                                                                   |
| 3   | Network — capture                                       | `recordHar` option on context, or `routeFromHAR` with `update:true`                                                       | `browser.newContext({ recordHar: { path: 'net.har', content: 'embed' }})`. Then `page.on('request'/'response')` for live metadata incl. headers like `Idempotency-Key`. [C95%]                                                                                                                                                                                        | [BrowserContext](https://playwright.dev/docs/api/class-browsercontext)                                                                                                                                 |
| 3a  | Network — throttle Slow-3G                              | CDP `Network.emulateNetworkConditions`                                                                                    | `await client.send('Network.emulateNetworkConditions', {offline:false, downloadThroughput: 50*1024, uploadThroughput: 50*1024, latency: 400})`. Built-in throttle method is not in stable PW; CDP is the supported path. [C95%]                                                                                                                                       | [PW issue #15364](https://github.com/microsoft/playwright/issues/15364)                                                                                                                                |
| 3b  | Network — block URLs                                    | `page.route(pattern, route => route.abort())`                                                                             | `await page.route('**/api/sensors/**', r => r.abort())` to simulate a 5xx storm. [C95%]                                                                                                                                                                                                                                                                               | [Network guide](https://playwright.dev/docs/network)                                                                                                                                                   |
| 4   | Sources — logpoints / conditional breakpoints           | CDP `Debugger.setBreakpointByUrl` with `condition`                                                                        | `await client.send('Debugger.enable'); await client.send('Debugger.setBreakpointByUrl', {urlRegex:'.*assignment.*\\.js', lineNumber: 42, condition: "msg.includes('overlap')"})`. Not as ergonomic as DevTools UI; for our use case, prefer console.log + capture. [C85%]                                                                                             | [CDP Debugger domain](https://chromedevtools.github.io/devtools-protocol/tot/Debugger/)                                                                                                                |
| 5   | Performance — CPU throttle + trace                      | CDP `Emulation.setCPUThrottlingRate` + `tracing.start`                                                                    | `await client.send('Emulation.setCPUThrottlingRate', { rate: 4 })` then `await context.tracing.start({ screenshots:true, snapshots:true, sources:true })`. Trace opens in `npx playwright show-trace`. [C95%]                                                                                                                                                         | [PW Tracing](https://playwright.dev/docs/trace-viewer), [Medium deep-dive](https://medium.com/@aishahsofea/automated-performance-testing-with-playwright-and-chrome-devtools-a-deep-dive-52e8b240b00d) |
| 5a  | Performance — Web Vitals (LCP/CLS/INP)                  | Inject `web-vitals` library, read via `page.evaluate`                                                                     | `await page.addInitScript({ path: require.resolve('web-vitals/dist/web-vitals.iife.js') }); const vitals = await page.evaluate(() => new Promise(r => { const o={}; webVitals.onLCP(v=>o.lcp=v.value); webVitals.onCLS(v=>o.cls=v.value); webVitals.onINP(v=>o.inp=v.value); setTimeout(()=>r(o), 4000); }))`. LCP requires user interaction to fire reliably. [C88%] | [web-vitals issue #180](https://github.com/GoogleChrome/web-vitals/issues/180)                                                                                                                         |
| 6   | Memory — heap snapshot                                  | CDP `HeapProfiler.takeHeapSnapshot`                                                                                       | `await client.send('HeapProfiler.enable'); await client.send('HeapProfiler.takeHeapSnapshot');` — frames stream via `HeapProfiler.addHeapSnapshotChunk` event; assemble + write `.heapsnapshot`, drop into chrome://inspect. [C90%]                                                                                                                                   | [CDP HeapProfiler](https://chromedevtools.github.io/devtools-protocol/tot/HeapProfiler/), [byt3bl33d3r/playwright-heap-snapshot](https://github.com/byt3bl33d3r/playwright-heap-snapshot)              |
| 7   | Application / Storage                                   | `context.storageState({ path, indexedDB: true })`, plus `page.evaluate(()=>localStorage.clear())`                         | `await context.storageState({ path: 'state.json', indexedDB: true })` writes cookies + localStorage + IDB to one JSON. [C95%]                                                                                                                                                                                                                                         | [storageState guide](https://www.browserstack.com/guide/playwright-storage-state)                                                                                                                      |
| 8   | Rendering — color scheme / reduced motion               | `page.emulateMedia()`                                                                                                     | `await page.emulateMedia({ colorScheme:'dark', reducedMotion:'reduce' })`. [C95%]                                                                                                                                                                                                                                                                                     | [Emulation docs](https://playwright.dev/docs/emulation)                                                                                                                                                |
| 8a  | Rendering — vision deficiency                           | CDP `Emulation.setEmulatedVisionDeficiency`                                                                               | `await client.send('Emulation.setEmulatedVisionDeficiency', { type:'achromatopsia' })` — types: `none`, `blurredVision`, `reducedContrast`, `achromatopsia`, `deuteranopia`, `protanopia`, `tritanopia`. [C90%]                                                                                                                                                       | [PW issue #32314](https://github.com/microsoft/playwright/issues/32314)                                                                                                                                |
| 8b  | Rendering — paint flashing / FPS / layout-shift regions | CDP `Overlay.setShowPaintRects` / `setShowFPSCounter` / `setShowLayoutShiftRegions`                                       | `await client.send('Overlay.enable'); await client.send('Overlay.setShowPaintRects', {result:true})`. Capture via `Page.startScreencast` for video. [C80% — works but undocumented in PW]                                                                                                                                                                             | [CDP Overlay domain](https://chromedevtools.github.io/devtools-protocol/tot/Overlay/)                                                                                                                  |
| 9   | Device emulation — iPhone 14 Mini                       | `devices['iPhone 13 Mini']` (closest preset, 375×812 → set custom 390×844) + `geolocation` + `hasTouch`                   | See `iPhone14Mini` config in skeleton below; PW has no exact iPhone-14-Mini preset — use the iPhone 13 Mini preset and override viewport to 390×844 + DPR 3. [C90%]                                                                                                                                                                                                   | [Emulation docs](https://playwright.dev/docs/emulation)                                                                                                                                                |
| 10  | Lighthouse                                              | `playwright-lighthouse` npm                                                                                               | `import { playAudit } from 'playwright-lighthouse'; await playAudit({ page, port: 9222, thresholds:{ performance: 80, accessibility: 90 }, reports:{ formats:{ html:true, json:true }, name:'lh-supervisor-today', directory:'./out' }})`. Requires launching Chromium with `--remote-debugging-port=9222`. [C92%]                                                    | [playwright-lighthouse npm](https://www.npmjs.com/package/playwright-lighthouse)                                                                                                                       |
| 11  | Coverage — unused JS/CSS bytes                          | `page.coverage.startJSCoverage()` / `startCSSCoverage()`                                                                  | Start before navigate, stop after, sum `entry.functions[].ranges` for usedBytes; `(usedBytes / entry.source.length) * 100`. Chromium-only. [C95%]                                                                                                                                                                                                                     | [PW Coverage API](https://playwright.dev/docs/api/class-coverage)                                                                                                                                      |
| 12  | Issues panel — A11y + deprecations                      | `@axe-core/playwright` for A11y; CDP `Audits.enable` + `issueAdded` event for deprecations / mixed content                | `await client.send('Audits.enable'); client.on('Audits.issueAdded', e => issues.push(e.issue))`. [C85%]                                                                                                                                                                                                                                                               | [CDP Audits domain](https://chromedevtools.github.io/devtools-protocol/tot/Audits/)                                                                                                                    |
| 13  | Recorder — record & replay flows                        | `npx playwright codegen` (built-in); Chrome DevTools Recorder → export to Playwright via `playwright-chrome-recorder` CLI | `npx playwright codegen http://localhost:8081` opens browser + writes test file. For DevTools Recorder JSONs: `npx playwright-chrome-recorder <recording.json>`. [C95%]                                                                                                                                                                                               | [DeploySentinel/Recorder](https://github.com/DeploySentinel/Recorder)                                                                                                                                  |

---

## Sample Skeleton: Capture All Surfaces for One Screen

Walks the supervisor "Today" tab on Expo Web, throttled to iPhone 14 Mini + Slow 3G + 4× CPU. Writes everything to `apps/mobile/screenshots-sprint-2/today/<ISO>/`.

```ts
// scripts/devtools-capture/capture-supervisor-today.ts
// Usage: npx tsx scripts/devtools-capture/capture-supervisor-today.ts
import { chromium, devices } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { playAudit } from 'playwright-lighthouse';
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve(
  'apps/mobile/screenshots-sprint-2/today',
  new Date().toISOString().replace(/[:.]/g, '-'),
);
const URL = process.env.AXHY_WEB_URL ?? 'http://localhost:8081/supervisor/today';

async function main() {
  await fs.mkdir(OUT, { recursive: true });

  // 1. Launch with remote-debugging-port so Lighthouse can attach later.
  const browser = await chromium.launch({ args: ['--remote-debugging-port=9222'] });
  const context = await browser.newContext({
    ...devices['iPhone 13 Mini'],
    viewport: { width: 390, height: 844 }, // iPhone 14 Mini ~ same
    deviceScaleFactor: 3,
    hasTouch: true,
    geolocation: { latitude: 17.385, longitude: 78.486 }, // Hyderabad
    permissions: ['geolocation'],
    colorScheme: 'light',
    recordHar: { path: path.join(OUT, 'network.har'), content: 'embed' },
  });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

  const page = await context.newPage();
  const client = await context.newCDPSession(page);

  // 2. CDP: 4× CPU + Slow 3G + audits + heap profiler + overlay paint-flash.
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: 50 * 1024,
    uploadThroughput: 50 * 1024,
    latency: 400,
  });
  await client.send('Audits.enable');
  await client.send('HeapProfiler.enable');
  await client.send('Overlay.enable');
  await client.send('Overlay.setShowPaintRects', { result: true });

  // 3. Subscribe to console + page errors + audit issues + network events.
  const logs: any[] = [];
  page.on('console', (m) => logs.push({ at: Date.now(), type: m.type(), text: m.text() }));
  page.on('pageerror', (e) => logs.push({ at: Date.now(), type: 'pageerror', text: e.message }));
  client.on('Audits.issueAdded', (e) =>
    logs.push({ at: Date.now(), type: 'issue', issue: e.issue }),
  );
  page.on('request', (r) =>
    logs.push({
      at: Date.now(),
      type: 'req',
      method: r.method(),
      url: r.url(),
      headers: r.headers(),
    }),
  );
  page.on('response', (r) =>
    logs.push({ at: Date.now(), type: 'res', status: r.status(), url: r.url() }),
  );

  // 4. Coverage.
  await page.coverage.startJSCoverage();
  await page.coverage.startCSSCoverage();

  // 5. Drive the screen.
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.screenshot({ path: path.join(OUT, 'today-initial.png'), fullPage: true });
  await page
    .getByRole('tab', { name: /Today/i })
    .click()
    .catch(() => {});
  await page.waitForTimeout(2000); // let LCP settle

  // 6. Web Vitals via injected eval (web-vitals must be bundled in app or injected via addInitScript).
  const vitals = await page
    .evaluate(async () => {
      // @ts-ignore
      const { onLCP, onCLS, onINP } = await import('https://unpkg.com/web-vitals@4?module');
      return new Promise<any>((r) => {
        const v: any = {};
        onLCP((m) => (v.lcp = m.value));
        onCLS((m) => (v.cls = m.value));
        onINP((m) => (v.inp = m.value));
        setTimeout(() => r(v), 3000);
      });
    })
    .catch(() => ({ note: 'web-vitals injection failed; bundle locally' }));

  // 7. Snapshots: A11y, ARIA YAML tree, heap.
  const axe = await new AxeBuilder({ page }).analyze();
  const aria = await page.locator('body').ariaSnapshot();
  const heapChunks: string[] = [];
  client.on('HeapProfiler.addHeapSnapshotChunk', (c) => heapChunks.push(c.chunk));
  await client.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });

  // 8. Stop coverage + tracing + storage.
  const [jsCov, cssCov] = [
    await page.coverage.stopJSCoverage(),
    await page.coverage.stopCSSCoverage(),
  ];
  await context.tracing.stop({ path: path.join(OUT, 'trace.zip') });
  await context.storageState({ path: path.join(OUT, 'storage.json'), indexedDB: true });

  // 9. Lighthouse on the same target (separate Chromium, uses port 9222).
  // Move Playwright off the page first or run Lighthouse in a sibling step.
  await playAudit({
    page,
    port: 9222,
    thresholds: { performance: 70, accessibility: 90, 'best-practices': 80 },
    reports: { formats: { html: true, json: true }, name: 'lighthouse', directory: OUT },
  }).catch((e) => logs.push({ type: 'lh-fail', text: String(e) }));

  // 10. Write everything.
  await fs.writeFile(
    path.join(OUT, 'console.jsonl'),
    logs.map((l) => JSON.stringify(l)).join('\n'),
  );
  await fs.writeFile(path.join(OUT, 'axe.json'), JSON.stringify(axe, null, 2));
  await fs.writeFile(path.join(OUT, 'aria.yaml'), aria);
  await fs.writeFile(path.join(OUT, 'heap.heapsnapshot'), heapChunks.join(''));
  await fs.writeFile(path.join(OUT, 'coverage.json'), JSON.stringify({ js: jsCov, css: cssCov }));
  await fs.writeFile(path.join(OUT, 'vitals.json'), JSON.stringify(vitals, null, 2));
  await fs.writeFile(
    path.join(OUT, 'summary.json'),
    JSON.stringify(
      {
        url: URL,
        viewport: '390x844',
        cpuThrottle: 4,
        network: 'Slow3G',
        axeViolations: axe.violations.length,
        lcp: (vitals as any).lcp,
        cls: (vitals as any).cls,
        inp: (vitals as any).inp,
        consoleErrors: logs.filter((l) => l.type === 'error' || l.type === 'pageerror').length,
        jsBundleBytes: jsCov.reduce((s, e) => s + e.source.length, 0),
      },
      null,
      2,
    ),
  );

  await context.close();
  await browser.close();
  console.log(`captured to ${OUT}`);
}
main();
```

---

## Tool Comparison

| Tool                                       | Best at                                                                                                                         | Limits                                                                                         | Verdict for Axhy v3                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Playwright**                             | Cross-browser, CDP access, tracing, codegen, mobile emulation, A11y, network capture. Microsoft-backed, weekly releases. [C95%] | No native iOS device automation; no flame-graph rendering (raw trace only).                    | **Primary driver.**                                                            |
| Puppeteer                                  | Slightly faster single-page scripts. Lower overhead. Chrome-only.                                                               | No multi-browser; smaller community; weaker test-runner.                                       | Use only if you need a single ultra-fast scrape.                               |
| Cypress                                    | Best DX for interactive watch-mode.                                                                                             | Same-origin restriction; iframe pain; weaker mobile emulation; no native CDP for CPU throttle. | Don't introduce — duplicates Playwright.                                       |
| **Maestro**                                | Native iOS/Android automation via YAML. Zero programming. [C92%]                                                                | Doesn't drive Expo Web. No DevTools.                                                           | **Pair with PW later** once we ship native; YAML for native flows, PW for web. |
| Appium                                     | Native + WebView. Mature.                                                                                                       | Heavy setup; slow; XCUITest brittleness.                                                       | Skip.                                                                          |
| **Replay.io**                              | Time-travel debugger for failed flaky PW runs. Drop-in `@replayio/playwright`. [C90%]                                           | Adds CI minutes; recordings live on their cloud (privacy review needed before merging).        | **Adopt later** when a flaky test costs >2 hr of debug.                        |
| Lighthouse CI                              | Perf / A11y / PWA score budgets in CI with PR comments. [C95%]                                                                  | Desktop-default; needs mobile preset.                                                          | **Adopt via `playwright-lighthouse`** in same run.                             |
| Storybook a11y addon                       | Per-component A11y check during dev.                                                                                            | Component-scope only; doesn't catch integration issues.                                        | Optional — only if we adopt Storybook.                                         |
| Raw CDP client (`chrome-remote-interface`) | Full protocol access; no PW abstraction tax. [C90%]                                                                             | You rebuild the wheel (selectors, waiting, retries).                                           | Skip — PW + `newCDPSession` gives you both.                                    |

---

## Minimal Repo Wiring

```
axhy-v3/
├── playwright.config.ts                        # iPhone14Mini project + base config
├── apps/mobile/screenshots-sprint-2/           # all capture output, gitignored
├── scripts/devtools-capture/
│   ├── capture-supervisor-today.ts             # the skeleton above
│   ├── capture-supervisor-updates.ts
│   ├── capture-supervisor-summary.ts
│   └── _lib.ts                                  # shared CDP helpers
└── package.json
    "scripts": {
      "devtools:capture":       "tsx scripts/devtools-capture/capture-supervisor-today.ts",
      "devtools:capture:all":   "tsx scripts/devtools-capture/run-all.ts",
      "devtools:show-trace":    "playwright show-trace apps/mobile/screenshots-sprint-2/today/*/trace.zip",
      "devtools:show-lh":       "open apps/mobile/screenshots-sprint-2/today/*/lighthouse.html"
    }
```

Dev deps to add (one install):

```
pnpm add -D @playwright/test @axe-core/playwright playwright-lighthouse tsx
# optional:
pnpm add -D @replayio/playwright web-vitals
```

CI config (GitHub Actions stub):

```yaml
- run: npx playwright install --with-deps chromium
- run: pnpm devtools:capture:all
- uses: actions/upload-artifact@v4
  with: { name: devtools-capture, path: apps/mobile/screenshots-sprint-2/ }
```

Output convention per screen run:

```
apps/mobile/screenshots-sprint-2/<screen>/<ISO-timestamp>/
  today-initial.png      console.jsonl      axe.json
  network.har            aria.yaml          coverage.json
  trace.zip              heap.heapsnapshot  storage.json
  lighthouse.html        lighthouse.json    vitals.json
  summary.json           <- the 1-screen TL;DR the founder reads
```

---

## Common Pitfalls (Expo Web + RN + iPhone Mini + Railway backend)

1. **`testID` does not survive to DOM by default.** React Native Web converts `testID` → `data-testid` only in certain bundler configs. Verify with `getByTestId('foo')` and a known component before assuming. [C90%] — see [Panto.ai guide](https://www.getpanto.ai/blog/playwright-react-native-hybrid-testing)
2. **No exact iPhone 14 Mini preset.** Closest is `devices['iPhone 13 Mini']` (375×812). Override `viewport: {width:390, height:844}`, `deviceScaleFactor: 3`. [C90%]
3. **Web Vitals (LCP) won't fire without user interaction.** Always click/tap something then wait ≥2s before reading vitals. [C95%] — [web-vitals#180](https://github.com/GoogleChrome/web-vitals/issues/180)
4. **Coverage is Chromium-only.** Don't try to gather it from Mobile Safari project. [C95%]
5. **HAR records Idempotency-Key headers ONLY if the request actually goes through Playwright's context.** Expo Web dev server sometimes uses service workers — disable SW in test mode or your network capture will miss API calls. [C82% — observed-pattern, not docs-confirmed]
6. **CPU throttle via `Emulation.setCPUThrottlingRate` is per-page, resets on navigation cross-origin.** Re-apply after every `page.goto` if you cross origins. [C85%]
7. **Lighthouse + Playwright collision on port 9222.** Either launch with `--remote-debugging-port=9222` and pass the same port to `playAudit`, OR run Lighthouse in a separate `npm script` step after capture. The skeleton above takes option 1; if it flakes, split. [C88%]
8. **Slow 3G + 4× CPU + Hyderabad geolocation reflects our actual user.** Don't test on default desktop conditions and ship — the founder explicitly wants worker-grade phones simulated. [C95%]
9. **Heap snapshots can be 50-200 MB.** `.gitignore` `apps/mobile/screenshots-sprint-2/` and upload as CI artifact with a 7-day retention. [C95%]
10. **Railway-hosted backend means tests hit a real DB.** Per project lock `feedback_prod_only_testing.md`, use the `axhy-sandbox` tenant — never seed, never reset. The capture script should auth as a sandbox supervisor before driving the screen. [C95% — project rule]
11. **`page.emulateMedia({ reducedMotion:'reduce' })` does NOT disable React Native Animated.** RN's own animation system runs JS-side and ignores CSS media query. To deterministically test reduced-motion paths you'll need a feature-flag in `useReducedMotion()` plumbing on the app side. [C80% — inferred, founder verify]
12. **Expo Web in dev mode bundles Metro HMR.** Disable HMR (`EXPO_USE_FAST_RESOLVER=0` + `--no-dev`) when capturing perf, or your Lighthouse score will be garbage. [C82% — inferred]
13. **Vision deficiency emulation via CDP affects only painted output, not the React tree.** Useful for screenshot review, not for testing whether the app _exposes_ color information non-visually — that's an `axe` rule. [C90%]

---

## What's NOT cleanly automatable

| Surface                                             | Why not                                                                                                  | Workaround                                                                                                              |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Chrome DevTools "Recorder" panel UI itself          | It's a UI; no CDP endpoint to invoke it.                                                                 | Use `playwright codegen` instead, or export DevTools Recorder JSON and run via `playwright-chrome-recorder` CLI. [C95%] |
| Live "Sources panel" UX (set breakpoint with mouse) | CDP `Debugger.setBreakpointByUrl` works but is line-number sensitive and brittle across rebuilds. [C85%] | Prefer `console.log` capture; use the debugger CDP only when reproducing a hang.                                        |
| Native iOS WKWebView debugging                      | Playwright can't drive iOS Safari natively. [C95%]                                                       | Pair with Maestro when we ship the native app; for now we're testing Expo Web only.                                     |
| Flame-graph visualization                           | PW captures CPU profile data but doesn't render flame graphs. [C95%]                                     | Open `trace.zip` in `playwright show-trace`, or convert CPU profile to FlameGraph via Brendan Gregg's tool.             |
| INP measurement in a pure-script flow               | INP requires real user interaction events; synthetic clicks don't always count. [C80%]                   | Drive with `page.tap()` (touch events) on iPhone preset; still flaky — treat INP as advisory, not gating.               |

---

## Sources

- [Playwright — Emulation](https://playwright.dev/docs/emulation)
- [Playwright — Network](https://playwright.dev/docs/network)
- [Playwright — Accessibility testing](https://playwright.dev/docs/accessibility-testing)
- [Playwright — BrowserContext (storageState, recordHar)](https://playwright.dev/docs/api/class-browsercontext)
- [Playwright — CDPSession](https://playwright.dev/docs/api/class-cdpsession)
- [Playwright — Coverage](https://playwright.dev/docs/api/class-coverage)
- [Playwright — Trace Viewer](https://playwright.dev/docs/trace-viewer)
- [Playwright issue #15364 — Network throttling via CDP](https://github.com/microsoft/playwright/issues/15364)
- [Playwright issue #32207 — CPU throttle feature request](https://github.com/microsoft/playwright/issues/32207)
- [Playwright issue #32314 — Vision deficiency simulation](https://github.com/microsoft/playwright/issues/32314)
- [Playwright issue #33861 — Performance panel in Trace Viewer](https://github.com/microsoft/playwright/issues/33861)
- [CDP — HeapProfiler domain](https://chromedevtools.github.io/devtools-protocol/tot/HeapProfiler/)
- [CDP — Audits domain](https://chromedevtools.github.io/devtools-protocol/tot/Audits/)
- [CDP — Overlay domain (paint flashing, FPS, layout shift)](https://chromedevtools.github.io/devtools-protocol/tot/Overlay/)
- [CDP — Debugger domain](https://chromedevtools.github.io/devtools-protocol/tot/Debugger/)
- [Medium — Automated Performance Testing with Playwright and CDP (Aishah Sofea)](https://medium.com/@aishahsofea/automated-performance-testing-with-playwright-and-chrome-devtools-a-deep-dive-52e8b240b00d)
- [BrowserStack — Playwright Lighthouse integration](https://www.browserstack.com/docs/automate/playwright/lighthouse-integration)
- [Unlighthouse — Lighthouse + Playwright guide](https://unlighthouse.dev/learn-lighthouse/playwright)
- [npm — playwright-lighthouse](https://www.npmjs.com/package/playwright-lighthouse)
- [Lighthouse CI (LHCI) — Unlighthouse guide](https://unlighthouse.dev/learn-lighthouse/lighthouse-ci)
- [BrowserStack — Playwright vs Puppeteer 2026](https://www.browserstack.com/guide/playwright-vs-puppeteer)
- [Panto.ai — How To Test Hybrid React Native Apps With Playwright](https://www.getpanto.ai/blog/playwright-react-native-hybrid-testing)
- [Panto.ai — Playwright vs Maestro](https://www.getpanto.ai/blog/playwright-vs-maestro)
- [QA Wolf — Best mobile E2E testing frameworks 2025](https://www.qawolf.com/blog/the-best-mobile-e2e-testing-frameworks-in-2025-strengths-tradeoffs-and-use-cases)
- [Replay docs — Playwright integration](https://docs.replay.io/test-runners/playwright/record-your-first-replay)
- [DeploySentinel/Recorder — DevTools Recorder export](https://github.com/DeploySentinel/Recorder)
- [byt3bl33d3r/playwright-heap-snapshot](https://github.com/byt3bl33d3r/playwright-heap-snapshot)
- [SDETective — Network throttling in Playwright via CDP](https://sdetective.blog/blog/qa_auto/pw-cdp/networking-throttle_en)
- [The Green Report — Supercharging Playwright with CDP](https://www.thegreenreport.blog/articles/supercharging-playwright-tests-with-chrome-devtools-protocol/supercharging-playwright-tests-with-chrome-devtools-protocol.html)
- [DEV.to — 5 Game-Changing Chrome DevTools Updates 2025](https://dev.to/henrylim96/5-game-changing-chrome-devtools-updates-you-need-to-try-in-2025-2mal)
- [Checkly — Measuring Page Performance with Playwright](https://www.checklyhq.com/docs/learn/playwright/performance/)
- [BrowserStack — storageState (cookies + localStorage + IndexedDB)](https://www.browserstack.com/guide/playwright-storage-state)
- [Currents.dev — How To Measure Code Coverage in Playwright Tests (Dec 2025)](https://currents.dev/posts/how-to-measure-code-coverage-in-playwright-tests)
- [GoogleChrome/web-vitals issue #180 — CLS/LCP flakiness in lab](https://github.com/GoogleChrome/web-vitals/issues/180)
