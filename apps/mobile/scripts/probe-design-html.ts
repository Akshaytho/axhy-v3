import { chromium } from '@playwright/test';

const HTML = 'file:///Users/thotaakshay/Downloads/Axhy%20Worker%20App%20_standalone_.html';

async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 4000 } });
  const page = await ctx.newPage();

  page.on('console', (msg) => console.log('  [page]', msg.type(), msg.text().slice(0, 200)));
  page.on('pageerror', (err) => console.log('  [page-err]', err.message.slice(0, 200)));

  await page.goto(HTML, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForTimeout(8_000);

  const meta = await page.evaluate(() => {
    const body = document.body?.innerText?.slice(0, 200) ?? '';
    const screens = Array.from(
      document.querySelectorAll(
        '[data-screen], [class*="screen"], [id*="screen"], [class*="frame"]',
      ),
    )
      .slice(0, 30)
      .map((el) => ({
        tag: el.tagName,
        id: el.id,
        cls: (el.className || '').toString().slice(0, 80),
        rect: {
          w: Math.round(el.getBoundingClientRect().width),
          h: Math.round(el.getBoundingClientRect().height),
        },
      }));
    const iframes = Array.from(document.querySelectorAll('iframe')).map((i) => ({
      src: i.src.slice(0, 80),
      w: i.clientWidth,
      h: i.clientHeight,
    }));
    const w = document.documentElement.scrollWidth;
    const h = document.documentElement.scrollHeight;
    return { bodySnippet: body, screens, iframes, page: { w, h } };
  });

  console.log(JSON.stringify(meta, null, 2));
  await page.screenshot({ path: '/tmp/design-overview.png', fullPage: true });
  console.log('full-page screenshot at /tmp/design-overview.png');

  await browser.close();
}

main().catch((err) => {
  console.error('probe crashed:', err);
  process.exit(1);
});
