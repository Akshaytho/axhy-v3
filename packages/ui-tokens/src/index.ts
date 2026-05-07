/**
 * @axhy/ui-tokens
 *
 * Single source of truth for brand tokens — terracotta + paper system,
 * panel-locked 2026-05-07 (replaces gold-on-black). Generators emit
 * tokens.css for web, native.ts for RN, tailwind.ts for any consumer.
 *
 * @derives(ADR-0014)
 * @derives(panel-2026-05-07 — terracotta+paper system locked)
 */

export const tokens = {
  color: {
    /** Warm paper surface family — replaces gold-on-black surface stack */
    surface: {
      paper: '#F6F1E8', // primary canvas
      paper2: '#EFE7D8', // recessed panels
      paper3: '#E6DCC8', // dividers, chips
      card: '#FDFAF3', // elevated card
      cardEdge: 'rgba(40, 30, 20, 0.08)',
    },
    /** Carbon ink — replaces white text */
    ink: {
      primary: '#1A1612',
      secondary: '#4A3F33',
      tertiary: '#7A6B58',
      placeholder: '#A89880',
    },
    /** Terracotta — the brand accent */
    brand: {
      accent: '#C0492A',
      accent2: '#A83D20',
      accentSoft: '#F5DAC9',
      accentInk: '#6E2410',
    },
    semantic: {
      ok: '#4A7C59',
      okSoft: '#D6E5D0',
      warn: '#B8860B',
      warnSoft: '#F0E2B6',
      bad: '#A8341D',
      badSoft: '#F0C8BD',
      infoInk: '#2C4A6B',
      infoSoft: '#D5DDE6',
    },
  },
  /** Decision-tier coloring (per data-flow doc §5) — UI maps each tier to a tinted surface */
  decisionTier: {
    note: { bg: 'paper3', text: 'tertiary', border: 'none' },
    operational: { bg: 'infoSoft', text: 'infoInk', border: 'none' },
    personnel: { bg: 'accentSoft', text: 'accentInk', border: 'accent' },
    employment: { bg: 'badSoft', text: 'bad', border: 'bad' },
  },
  font: {
    body: 'Inter',
    mono: 'JetBrains Mono',
    devanagari: 'Noto Sans Devanagari',
    telugu: 'Noto Sans Telugu',
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  /**
   * Type scale (panel-locked from §3 of v3-design-system-locked.md).
   * Field-mobile bumps body+heading by 1px in the consumer (handled in CSS,
   * not in tokens).
   */
  type: {
    displayXl: { size: 56, lineHeight: 1.05, weight: 600, tracking: -1.4 },
    displayL: { size: 40, lineHeight: 1.05, weight: 600, tracking: -1.0 },
    display: { size: 28, lineHeight: 1.1, weight: 600, tracking: -0.6 },
    heading: { size: 22, lineHeight: 1.2, weight: 600, tracking: -0.3 },
    subhead: { size: 18, lineHeight: 1.3, weight: 500, tracking: -0.1 },
    body: { size: 15, lineHeight: 1.5, weight: 400, tracking: 0 },
    bodySm: { size: 13, lineHeight: 1.45, weight: 500, tracking: 0 },
    caption: { size: 11, lineHeight: 1.4, weight: 600, tracking: 0.06, uppercase: true },
    monoL: { size: 15, lineHeight: 1.4, weight: 500 },
    mono: { size: 13, lineHeight: 1.4, weight: 500 },
    monoSm: { size: 11, lineHeight: 1.4, weight: 500 },
  },
  space: {
    0: 0,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    7: 32,
    8: 40,
    9: 48,
    10: 64,
    11: 80,
    12: 128,
  },
  radius: {
    none: 0,
    r1: 6, // chips, mini badges
    r2: 10, // input fields
    r3: 14, // cards, buttons
    r4: 20, // overlays, sheets
  },
  shadow: {
    sh1: '0 1px 2px rgba(40, 30, 20, 0.06)',
    sh2: '0 1px 3px rgba(40,30,20,0.08), 0 4px 12px rgba(40,30,20,0.06)',
    sh3: '0 4px 16px rgba(40,30,20,0.12), 0 12px 32px rgba(40,30,20,0.08)',
  },
  motion: {
    durFast: 120, // ms
    dur: 200,
    durSlow: 320,
    easeNatural: 'cubic-bezier(0.32, 0.72, 0, 1)',
    easePaper: 'cubic-bezier(0.165, 0.84, 0.44, 1)',
  },
  tap: { minMobile: 48, minWeb: 44 },
} as const;

export type Tokens = typeof tokens;
