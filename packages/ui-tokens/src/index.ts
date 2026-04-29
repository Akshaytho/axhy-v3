/**
 * @axhy/ui-tokens
 *
 * Single source of truth for brand tokens. Generators emit Tailwind theme
 * (web) and RN StyleSheet (mobile). Both surfaces stay in lockstep.
 *
 * @derives(ADR-0014)
 */

export const tokens = {
  color: {
    brand: {
      gold: '#D4AF37',
      goldDim: '#A88928',
      goldHi: '#F0CB52',
    },
    surface: {
      base: '#000000',
      raised: '#0A0A0A',
      sunken: '#050505',
      gray2: '#141414',
      gray3: '#1F1F1F',
    },
    text: {
      primary: '#FFFFFF',
      secondary: '#A0A0A0',
      muted: '#606060',
      onBrand: '#000000',
    },
    semantic: {
      success: '#10B981',
      warning: '#F59E0B',
      danger: '#EF4444',
      info: '#3B82F6',
    },
    border: {
      subtle: '#1A1A1A',
      strong: '#2A2A2A',
    },
  },
  /**
   * Web surface uses alpha-on-black grays (panel-locked 2026-04-30: glassy
   * premium feel, single ramp that auto-adjusts on background shifts).
   * Native surface keeps solid hex from `color.text` / `color.border` for
   * OLED battery + sun-readability.
   *
   * Generator emits these as `rgba(255,255,255,<alpha>)` in tokens.css.
   */
  alphaOnBlack: {
    textDim: 0.62,
    textMute: 0.42,
    borderSubtle: 0.08,
    borderStrong: 0.14,
  },
  font: {
    body: 'Inter',
    mono: 'JetBrains Mono',
  },
  weight: {
    body: 700,
    headline: 800,
  },
  space: { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 },
  radius: { none: 0, sm: 4, md: 8, lg: 12, xl: 16, full: 9999 },
  tap: { minMobile: 48, minWeb: 40 },
} as const;

export type Tokens = typeof tokens;
