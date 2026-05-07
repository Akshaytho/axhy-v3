#!/usr/bin/env node
/**
 * Generator for `@axhy/ui-tokens`. Emits per-platform outputs from the
 * single source of truth in `src/index.ts`:
 *
 *   - `src/generated/tokens.css`   — web (terracotta + paper system)
 *   - `src/generated/tailwind.ts`  — Tailwind theme
 *   - `src/generated/native.ts`    — RN StyleSheet for mobile
 *
 * Run via: pnpm --filter @axhy/ui-tokens generate
 *
 * @derives(ADR-0014)
 * @derives(panel-2026-05-07 — terracotta+paper system locked, friend's design)
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
const c = tokens.color;
const css = `${HEADER}:root {
  /* surface — warm paper family */
  --paper: ${c.surface.paper};
  --paper-2: ${c.surface.paper2};
  --paper-3: ${c.surface.paper3};
  --card: ${c.surface.card};
  --card-edge: ${c.surface.cardEdge};

  /* ink — carbon, warm-tinted near-black */
  --ink: ${c.ink.primary};
  --ink-2: ${c.ink.secondary};
  --ink-3: ${c.ink.tertiary};
  --ink-4: ${c.ink.placeholder};

  /* terracotta accent */
  --accent: ${c.brand.accent};
  --accent-2: ${c.brand.accent2};
  --accent-soft: ${c.brand.accentSoft};
  --accent-ink: ${c.brand.accentInk};

  /* semantic */
  --ok: ${c.semantic.ok};
  --ok-soft: ${c.semantic.okSoft};
  --warn: ${c.semantic.warn};
  --warn-soft: ${c.semantic.warnSoft};
  --bad: ${c.semantic.bad};
  --bad-soft: ${c.semantic.badSoft};
  --info-ink: ${c.semantic.infoInk};
  --info-soft: ${c.semantic.infoSoft};

  /* type — Inter for Latin, Noto Sans Devanagari + Telugu for Indic, JetBrains Mono for tabular.
     Variables (--font-inter etc) are injected by next/font with hashed family names; the
     literal fallbacks ('Inter', 'Noto Sans Devanagari'…) only matter outside Next. */
  --font-body: var(--font-inter, '${tokens.font.body}'), var(--font-noto-devanagari, '${tokens.font.devanagari}'), var(--font-noto-telugu, '${tokens.font.telugu}'), system-ui, -apple-system, sans-serif;
  --font-display: var(--font-inter, '${tokens.font.body}'), var(--font-noto-devanagari, '${tokens.font.devanagari}'), var(--font-noto-telugu, '${tokens.font.telugu}'), system-ui, -apple-system, sans-serif;
  --font-mono: var(--font-jetbrains-mono, '${tokens.font.mono}'), ui-monospace, 'SF Mono', Menlo, monospace;

  /* radii — slightly less rounded than typical web */
  --r-1: ${tokens.radius.r1}px;
  --r-2: ${tokens.radius.r2}px;
  --r-3: ${tokens.radius.r3}px;
  --r-4: ${tokens.radius.r4}px;

  /* shadows — warm-tinted, sparingly used */
  --sh-1: ${tokens.shadow.sh1};
  --sh-2: ${tokens.shadow.sh2};
  --sh-3: ${tokens.shadow.sh3};

  /* motion */
  --dur-fast: ${tokens.motion.durFast}ms;
  --dur: ${tokens.motion.dur}ms;
  --dur-slow: ${tokens.motion.durSlow}ms;
  --ease-natural: ${tokens.motion.easeNatural};
  --ease-paper: ${tokens.motion.easePaper};

  /* container */
  --max: 1120px;
  --gutter: 24px;
}

/* dark mode (opt-in, surface-only flip; brand accent unchanged) */
:root[data-theme='dark'] {
  --paper: #1A1815;
  --paper-2: #221F1A;
  --paper-3: #2A2620;
  --card: #1F1C18;
  --card-edge: rgba(255, 240, 220, 0.06);
  --ink: #F5F0E1;
  --ink-2: #C8BFA5;
  --ink-3: #8A8268;
  --ink-4: #5A5340;
  --accent: #D4583A;
  --accent-soft: #4A1E10;
}

/* ── compatibility aliases ──
   Maps old gold-on-black token names to the new terracotta+paper system
   so existing components keep working without manual rewrites. New code
   should use the canonical names above. */
:root {
  /* surface aliases */
  --black: var(--paper);          /* old --black bg becomes paper bg */
  --gray-1: var(--paper-2);
  --gray-2: var(--paper-2);
  --gray-3: var(--paper-3);
  --gray-4: var(--card-edge);
  --surface-sunken: var(--paper-2);

  /* text aliases */
  --text: var(--ink);
  --text-dim: var(--ink-2);
  --text-mute: var(--ink-3);

  /* brand aliases */
  --gold: var(--accent);
  --gold-dim: var(--accent-2);
  --gold-hi: var(--accent);

  /* border aliases */
  --border: var(--card-edge);
  --border-strong: var(--ink-4);

  /* semantic aliases */
  --success: var(--ok);
  --warning: var(--warn);
  --danger: var(--bad);
  --info: var(--info-ink);

  /* type aliases */
  --display: var(--font-display);
  --body: var(--font-body);
  --mono: var(--font-mono);
}
`;
await writeFile(resolve(OUT_DIR, 'tokens.css'), css);

/* ────────────── tailwind.ts ────────────── */
const tailwind = `${HEADER}export const tailwindTheme = ${JSON.stringify(
  {
    colors: {
      paper: c.surface.paper,
      'paper-2': c.surface.paper2,
      'paper-3': c.surface.paper3,
      card: c.surface.card,
      ink: c.ink.primary,
      'ink-2': c.ink.secondary,
      'ink-3': c.ink.tertiary,
      'ink-4': c.ink.placeholder,
      accent: c.brand.accent,
      'accent-2': c.brand.accent2,
      'accent-soft': c.brand.accentSoft,
      'accent-ink': c.brand.accentInk,
      ok: c.semantic.ok,
      'ok-soft': c.semantic.okSoft,
      warn: c.semantic.warn,
      'warn-soft': c.semantic.warnSoft,
      bad: c.semantic.bad,
      'bad-soft': c.semantic.badSoft,
      'info-ink': c.semantic.infoInk,
      'info-soft': c.semantic.infoSoft,
    },
    fontFamily: {
      body: [tokens.font.body, tokens.font.devanagari, tokens.font.telugu, 'system-ui', '-apple-system', 'sans-serif'],
      mono: [tokens.font.mono, 'ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
    },
    fontWeight: {
      regular: tokens.weight.regular,
      medium: tokens.weight.medium,
      semibold: tokens.weight.semibold,
      bold: tokens.weight.bold,
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
    type: tokens.type,
    space: tokens.space,
    radius: tokens.radius,
    shadow: tokens.shadow,
    motion: tokens.motion,
    tap: tokens.tap,
  },
  null,
  2,
)} as const;
`;
await writeFile(resolve(OUT_DIR, 'native.ts'), native);

console.log('@axhy/ui-tokens — generated tokens.css, tailwind.ts, native.ts (terracotta+paper)');
