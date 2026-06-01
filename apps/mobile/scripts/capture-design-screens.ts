import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HTML =
  'file:///Users/thotaakshay/eclean_workspace/axhy-v3/docs/design/worker-app-canon/project/Axhy%20Worker%20App%20(standalone).html';
const OUT_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  'docs',
  'evidence',
  '2026-06-01',
  'worker-design-impl',
  'iter-2',
  'canon-screens',
);

async function main(): Promise<void> {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 5000 } });
  const page = await ctx.newPage();
  await page.goto(HTML, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForTimeout(7_000);

  const count = await page.locator('.phone-screen').count();
  console.log(`Found ${count} phone-screen elements`);

  for (let i = 0; i < count; i++) {
    const el = page.locator('.phone-screen').nth(i);
    const bb = await el.boundingBox();
    if (!bb) continue;
    const fileName = `${String(i + 1).padStart(2, '0')}-design-screen.png`;
    await el.screenshot({ path: path.join(OUT_DIR, fileName) });
    console.log(`  ${fileName}  ${Math.round(bb.width)}x${Math.round(bb.height)}`);
  }

  await browser.close();
  const files = await fs.readdir(OUT_DIR);
  console.log(`\nWrote ${files.length} design screens to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error('design capture crashed:', err);
  process.exit(1);
});
