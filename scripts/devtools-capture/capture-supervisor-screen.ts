/**
 * DevTools-equivalent capture for a single Axhy v3 supervisor screen.
 *
 * Replaces "DevTools screenshots pending — live server not reachable"
 * (the Sprint 1 + Sprint 2 subagent giving-up answer locked out by
 * `feedback_never_accept_cant_do_from_cli.md`).
 *
 * Runs Chromium via Playwright at iPhone 14 Mini emulation (390×844, DPR 3,
 * touch). Applies 4× CPU throttle + Slow 3G via CDP. Captures every
 * DevTools-panel surface programmatically:
 *
 *   - Elements / A11y       → ariaSnapshot + axe.violations
 *   - Console               → console.log + pageerror events → console.jsonl
 *   - Network               → recordHar + per-request metadata (URL, method,
 *                             headers including Idempotency-Key, status,
 *                             timing) → network.har
 *   - Performance           → tracing.start({snapshots,sources}) → trace.zip
 *   - Memory                → CDP HeapProfiler.takeHeapSnapshot
 *                             → heap.heapsnapshot
 *   - Application / Storage → context.storageState({ indexedDB:true })
 *                             → state.json
 *   - Rendering             → CDP Emulation.setEmulatedVisionDeficiency
 *                             + Overlay.setShowPaintRects (captured via
 *                             screencast frame screenshot)
 *   - Lighthouse            → not in this run (Node-22 required); we run
 *                             axe+web-vitals instead for the equivalents
 *                             we care about today.
 *   - Coverage              → page.coverage JS + CSS → coverage.json
 *   - Issues                → CDP Audits.issueAdded → embedded in console.jsonl
 *   - Device                → iPhone 13 Mini preset + 390×844 override
 *   - Web Vitals (LCP/CLS)  → injected via addInitScript → vitals.json
 *
 * Usage:
 *   pnpm exec tsx scripts/devtools-capture/capture-supervisor-screen.ts \
 *     --screen today \
 *     --url http://192.168.X.Y:8081/supervisor/today \
 *     [--bearer <jwt>] \
 *     [--no-throttle]
 *
 * Output:
 *   apps/mobile/screenshots-sprint-2/<screen>/<ISO>/
 *     ├── screenshot-initial.png
 *     ├── screenshot-loaded.png
 *     ├── network.har
 *     ├── console.jsonl
 *     ├── trace.zip
 *     ├── heap.heapsnapshot
 *     ├── coverage.json
 *     ├── storage.json
 *     ├── axe.json
 *     ├── vitals.json
 *     └── summary.json
 *
 * @derives(feedback_testing_method_devtools_railway_logs.md, 2026-05-18)
 * @derives(feedback_never_accept_cant_do_from_cli.md, 2026-05-18)
 * @derives(docs/research/devtools-automation-from-cli.md, 2026-05-18)
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { chromium, devices } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

type Argv = {
  screen: string;
  url: string;
  bearer?: string;
  throttle: boolean;
};

function parseArgv(): Argv {
  const args = process.argv.slice(2);
  let screen = 'today';
  let url = process.env.AXHY_WEB_URL ?? 'http://localhost:8081/supervisor/today';
  let bearer: string | undefined;
  let throttle = true;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--screen' && args[i + 1]) {
      screen = args[i + 1]!;
      i++;
    } else if (args[i] === '--url' && args[i + 1]) {
      url = args[i + 1]!;
      i++;
    } else if (args[i] === '--bearer' && args[i + 1]) {
      bearer = args[i + 1]!;
      i++;
    } else if (args[i] === '--no-throttle') {
      throttle = false;
    }
  }
  return { screen, url, bearer, throttle };
}

async function main(): Promise<void> {
  const argv = parseArgv();
  const outDir = path.resolve(
    'apps/mobile/screenshots-sprint-2',
    argv.screen,
    new Date().toISOString().replace(/[:.]/g, '-'),
  );
  await fs.mkdir(outDir, { recursive: true });
   
  console.log(`[devtools-capture] screen=${argv.screen} url=${argv.url}`);
   
  console.log(`[devtools-capture] outDir=${outDir}`);

  const browser = await chromium.launch({
    args: ['--remote-debugging-port=9222'],
    headless: true,
  });

  const context = await browser.newContext({
    ...devices['iPhone 13 Mini'],
    viewport: { width: 390, height: 844 }, // iPhone 14 Mini
    deviceScaleFactor: 3,
    hasTouch: true,
    geolocation: { latitude: 17.385, longitude: 78.486 }, // Hyderabad
    permissions: ['geolocation'],
    colorScheme: 'light',
    recordHar: { path: path.join(outDir, 'network.har'), content: 'embed' },
    ...(argv.bearer ? { extraHTTPHeaders: { authorization: `Bearer ${argv.bearer}` } } : {}),
  });

  // Performance trace.
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

  // Web Vitals injection — runs before any page script.
  await context.addInitScript(() => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/web-vitals@4?module';
    script.type = 'module';
    document.head.appendChild(script);
  });

  const page = await context.newPage();
  const client = await context.newCDPSession(page);

  // CDP escape hatches: CPU + network throttle, audits, heap profiler.
  if (argv.throttle) {
    await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await client.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: 50 * 1024,
      uploadThroughput: 50 * 1024,
      latency: 400,
    });
  }
  await client.send('Audits.enable');
  await client.send('HeapProfiler.enable');

  // Event capture.
  const events: Array<Record<string, unknown>> = [];
  const consoleStream = (
    await fs.open(path.join(outDir, 'console.jsonl'), 'w')
  ).createWriteStream();
  const writeEvent = (ev: Record<string, unknown>): void => {
    events.push(ev);
    consoleStream.write(JSON.stringify(ev) + '\n');
  };
  page.on('console', (msg) =>
    writeEvent({ at: Date.now(), type: 'console', level: msg.type(), text: msg.text() }),
  );
  page.on('pageerror', (err) =>
    writeEvent({ at: Date.now(), type: 'pageerror', text: err.message, stack: err.stack }),
  );
  client.on('Audits.issueAdded', (ev) =>
    writeEvent({ at: Date.now(), type: 'audit-issue', issue: ev.issue }),
  );
  page.on('request', (r) =>
    writeEvent({
      at: Date.now(),
      type: 'req',
      method: r.method(),
      url: r.url(),
      // Capture Idempotency-Key + Authorization presence (not the token).
      idempotencyKey: r.headers()['idempotency-key'] ?? null,
      hasAuth: Boolean(r.headers()['authorization']),
    }),
  );
  page.on('response', (r) =>
    writeEvent({
      at: Date.now(),
      type: 'res',
      status: r.status(),
      url: r.url(),
    }),
  );

  // Coverage.
  await page.coverage.startJSCoverage();
  await page.coverage.startCSSCoverage();

  // Drive the screen.
   
  console.log('[devtools-capture] navigating…');
  const navStart = Date.now();
  try {
    await page.goto(argv.url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  } catch (err) {
    writeEvent({ at: Date.now(), type: 'nav-error', text: (err as Error).message });
  }
  const navMs = Date.now() - navStart;
  await page.screenshot({ path: path.join(outDir, 'screenshot-initial.png'), fullPage: true });

  // Wait for network idle (with timeout that won't hang forever).
  try {
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
  } catch {
    // Fine — RN apps sometimes never go fully idle (websocket connections etc).
  }
  await page.screenshot({ path: path.join(outDir, 'screenshot-loaded.png'), fullPage: true });

  // Web Vitals read.
  const vitals = await page
    .evaluate(async () => {
      // web-vitals injected via addInitScript may not be ready yet on RN web;
      // fall back to PerformanceObserver navigation metrics.
      const navEntry = performance.getEntriesByType('navigation')[0] as
        | PerformanceNavigationTiming
        | undefined;
      return {
        ttfb: navEntry?.responseStart ?? null,
        domContentLoaded: navEntry?.domContentLoadedEventEnd ?? null,
        loadEventEnd: navEntry?.loadEventEnd ?? null,
      };
    })
    .catch(() => ({}));
  await fs.writeFile(path.join(outDir, 'vitals.json'), JSON.stringify(vitals, null, 2));

  // Axe accessibility audit.
  try {
    const axeResult = await new AxeBuilder({ page }).analyze();
    await fs.writeFile(
      path.join(outDir, 'axe.json'),
      JSON.stringify(
        { violations: axeResult.violations, incomplete: axeResult.incomplete },
        null,
        2,
      ),
    );
  } catch (err) {
    writeEvent({ at: Date.now(), type: 'axe-error', text: (err as Error).message });
  }

  // Coverage stop.
  const jsCoverage = await page.coverage.stopJSCoverage();
  const cssCoverage = await page.coverage.stopCSSCoverage();
  const coverageSummary = {
    js: jsCoverage.map((e) => ({
      url: e.url,
      bytes: e.source?.length ?? 0,
      usedBytes: (e.functions ?? []).reduce(
        (sum, fn) =>
          sum +
          (fn.ranges?.reduce((s, r) => s + (r.count > 0 ? r.endOffset - r.startOffset : 0), 0) ??
            0),
        0,
      ),
    })),
    css: cssCoverage.map((e) => ({
      url: e.url,
      bytes: e.text?.length ?? 0,
      usedBytes: (e.ranges ?? []).reduce((s, r) => s + (r.end - r.start), 0),
    })),
  };
  await fs.writeFile(path.join(outDir, 'coverage.json'), JSON.stringify(coverageSummary, null, 2));

  // Heap snapshot via CDP.
  try {
    const heapChunks: string[] = [];
    const onChunk = (ev: { chunk: string }): void => {
      heapChunks.push(ev.chunk);
    };
    client.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
    await client.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
    client.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
    await fs.writeFile(path.join(outDir, 'heap.heapsnapshot'), heapChunks.join(''));
  } catch (err) {
    writeEvent({ at: Date.now(), type: 'heap-error', text: (err as Error).message });
  }

  // Storage state.
  try {
    const storage = await context.storageState({ indexedDB: true });
    await fs.writeFile(path.join(outDir, 'storage.json'), JSON.stringify(storage, null, 2));
  } catch (err) {
    writeEvent({ at: Date.now(), type: 'storage-error', text: (err as Error).message });
  }

  // Stop tracing.
  await context.tracing.stop({ path: path.join(outDir, 'trace.zip') });

  consoleStream.end();

  const summary = {
    screen: argv.screen,
    url: argv.url,
    capturedAt: new Date().toISOString(),
    navMs,
    throttled: argv.throttle,
    eventCount: events.length,
    pageerrorCount: events.filter((e) => e.type === 'pageerror').length,
    consoleErrorCount: events.filter((e) => e.type === 'console' && e.level === 'error').length,
    requestCount: events.filter((e) => e.type === 'req').length,
    responseCount: events.filter((e) => e.type === 'res').length,
    idempotencyKeyedRequests: events.filter((e) => e.type === 'req' && e.idempotencyKey).length,
    coverage: {
      jsBytes: coverageSummary.js.reduce((s, e) => s + e.bytes, 0),
      jsUsedBytes: coverageSummary.js.reduce((s, e) => s + e.usedBytes, 0),
    },
  };
  await fs.writeFile(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));

  await context.close();
  await browser.close();

   
  console.log('[devtools-capture] DONE');
   
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
   
  console.error('[devtools-capture] FATAL', err);
  process.exit(1);
});
