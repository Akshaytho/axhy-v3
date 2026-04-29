#!/usr/bin/env node
/**
 * Generator for `@axhy/ui-tokens`. Emits per-platform outputs from the
 * single source of truth in `src/index.ts`:
 *
 *   - `src/generated/tokens.css`   — web (alpha-on-black grays for the
 *                                    glassy marketing-site feel)
 *   - `src/generated/tailwind.ts`  — Tailwind theme (hex throughout, the
 *                                    Tailwind config consumer maps as it
 *                                    likes)
 *   - `src/generated/native.ts`    — RN StyleSheet (solid hex for OLED +
 *                                    sun-readability per panel decision)
 *
 * Run via: pnpm --filter @axhy/ui-tokens generate
 *
 * @derives(ADR-0014)
 * @derives(panel-2026-04-30 — alpha-on-black for web, solid hex for native)
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../src/generated');

const sourceUrl = pathToFileURL(resolve(__dirname, '../src/index.ts')).href;
const { tokens } = await import(sourceUrl).catch(async () => {
  // index.ts is TS — node can't import directly. Re-read as text and
  // eval the export. Same effect as a tiny TS loader, no extra deps.
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(resolve(__dirname, '../src/index.ts'), 'utf8');
  const match = src.match(/export const tokens = (\{[\s\S]*?\}) as const;/);
  if (!match) throw new Error('Could not extract tokens export from src/index.ts');
  // eslint-disable-next-line no-new-func
  const t = new Function(`return ${match[1]};`)();
  return { tokens: t };
});

await mkdir(OUT_DIR, { recursive: true });

const HEADER = '/* AUTO-GENERATED from @axhy/ui-tokens — do not edit by hand. */\n\n';

/* ────────────── tokens.css (web) ────────────── */
const css = `${HEADER}:root {
  /* brand */
  --gold: ${tokens.color.brand.gold};
  --gold-dim: ${tokens.color.brand.goldDim};
  --gold-hi: ${tokens.color.brand.goldHi};

  /* surface */
  --black: ${tokens.color.surface.base};
  --gray-1: ${tokens.color.surface.raised};
  --gray-2: ${tokens.color.surface.gray2};
  --gray-3: ${tokens.color.surface.gray3};
  --surface-sunken: ${tokens.color.surface.sunken};

  /* text — primary uses solid white; dim/mute use alpha-on-black */
  --text: ${tokens.color.text.primary};
  --text-dim: rgba(255, 255, 255, ${tokens.alphaOnBlack.textDim});
  --text-mute: rgba(255, 255, 255, ${tokens.alphaOnBlack.textMute});

  /* borders — alpha-on-black to ride any background shade */
  --border: rgba(255, 255, 255, ${tokens.alphaOnBlack.borderSubtle});
  --border-strong: rgba(255, 255, 255, ${tokens.alphaOnBlack.borderStrong});

  /* semantic */
  --success: ${tokens.color.semantic.success};
  --warning: ${tokens.color.semantic.warning};
  --danger: ${tokens.color.semantic.danger};
  --info: ${tokens.color.semantic.info};

  /* type */
  --display: var(--font-body, '${tokens.font.body}'), system-ui, -apple-system, sans-serif;
  --body: var(--font-body, '${tokens.font.body}'), system-ui, -apple-system, sans-serif;
  --mono: var(--font-mono, '${tokens.font.mono}'), ui-monospace, 'SF Mono', Menlo, monospace;

  /* misc */
  --max: 1120px;
  --gutter: 24px;
}
`;
await writeFile(resolve(OUT_DIR, 'tokens.css'), css);

/* ────────────── tailwind.ts ────────────── */
const tailwind = `${HEADER}export const tailwindTheme = ${JSON.stringify(
  {
    colors: {
      gold: tokens.color.brand.gold,
      'gold-dim': tokens.color.brand.goldDim,
      'gold-hi': tokens.color.brand.goldHi,
      black: tokens.color.surface.base,
      'gray-1': tokens.color.surface.raised,
      'gray-2': tokens.color.surface.gray2,
      'gray-3': tokens.color.surface.gray3,
      'surface-sunken': tokens.color.surface.sunken,
      text: tokens.color.text.primary,
      'text-secondary': tokens.color.text.secondary,
      'text-muted': tokens.color.text.muted,
      'border-subtle': tokens.color.border.subtle,
      'border-strong': tokens.color.border.strong,
      success: tokens.color.semantic.success,
      warning: tokens.color.semantic.warning,
      danger: tokens.color.semantic.danger,
      info: tokens.color.semantic.info,
    },
    fontFamily: {
      body: [tokens.font.body, 'system-ui', '-apple-system', 'sans-serif'],
      mono: [tokens.font.mono, 'ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
    },
    fontWeight: {
      body: tokens.weight.body,
      headline: tokens.weight.headline,
    },
    spacing: tokens.space,
    borderRadius: tokens.radius,
  },
  null,
  2,
)} as const;
`;
await writeFile(resolve(OUT_DIR, 'tailwind.ts'), tailwind);

/* ────────────── native.ts ────────────── */
const native = `${HEADER}export const nativeTokens = ${JSON.stringify(
  {
    color: tokens.color,
    font: tokens.font,
    weight: tokens.weight,
    space: tokens.space,
    radius: tokens.radius,
    tap: tokens.tap,
  },
  null,
  2,
)} as const;
`;
await writeFile(resolve(OUT_DIR, 'native.ts'), native);

console.log('@axhy/ui-tokens — generated tokens.css, tailwind.ts, native.ts');
