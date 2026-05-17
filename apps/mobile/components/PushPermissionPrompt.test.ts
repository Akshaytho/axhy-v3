/**
 * F-006a — PushPermissionPrompt exactly-once-navigation contract (5 cases).
 *
 * Vitest include glob is `components/**\/*.test.ts`, so this file tests the
 * pure `buildPromptOutcomeRunner` factory directly (no React renderer). The
 * factory owns the entire exactly-once contract; the component is a thin
 * wrapper around it.
 *
 * Cases (Pick 5 v2 — 5 branches, exactly-once each):
 *  1. Continue + OS prompt → grant   → onComplete() fires once
 *  2. Continue + OS prompt → deny    → onComplete() fires once
 *  3. Skip (no OS prompt)            → onComplete() fires once
 *  4. requestPermission throws       → onComplete() fires once
 *  5. Web or no App ID (skip render) → caller still gets exactly-once onComplete
 *
 * @derives(F-006a scope round-2 v6 Pick 5)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock react-native — node test env doesn't have RN runtime.
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Modal: () => null,
  Pressable: () => null,
  StyleSheet: { create: (s: unknown) => s },
  Text: () => null,
  View: () => null,
}));

// ui-tokens module is loaded by the component import path; provide a stub
// so the import chain doesn't crash on node.
vi.mock('@axhy/ui-tokens', () => ({
  tokens: {
    space: [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64],
    radius: { r2: 8, r3: 12 },
    color: {
      surface: { card: '#fff', paper: '#fff' },
      brand: { accent: '#000' },
      ink: { primary: '#000', secondary: '#666' },
    },
  },
}));

// auth-store unused here; stub anyway so identity-lifecycle import succeeds.
vi.mock('../lib/auth-store', () => ({
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
}));

vi.mock('jwt-decode', () => ({
  jwtDecode: vi.fn(() => ({ userId: 'user-uuid-123' })),
}));

import { buildPromptOutcomeRunner } from './PushPermissionPrompt';

beforeEach(() => {
  process.env.EXPO_PUBLIC_ONESIGNAL_APP_ID = 'test-app-id';
});

describe('buildPromptOutcomeRunner — exactly-once contract', () => {
  // Case 1: Continue + grant
  it('Continue → requestPermission resolves true → onComplete() fires exactly once', async () => {
    const onComplete = vi.fn();
    const requestPermission = vi.fn(async () => true);
    const runner = buildPromptOutcomeRunner({
      onComplete,
      enabled: true,
      requestPermission,
    });

    await runner.onContinueTap();
    await runner.onContinueTap(); // re-tap should be ignored

    expect(requestPermission).toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  // Case 2: Continue + deny
  it('Continue → requestPermission resolves false → onComplete() fires exactly once', async () => {
    const onComplete = vi.fn();
    const requestPermission = vi.fn(async () => false);
    const runner = buildPromptOutcomeRunner({
      onComplete,
      enabled: true,
      requestPermission,
    });

    await runner.onContinueTap();

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  // Case 3: Skip
  it('Skip path fires onComplete() exactly once; repeated taps ignored', () => {
    const onComplete = vi.fn();
    const runner = buildPromptOutcomeRunner({
      onComplete,
      enabled: true,
      requestPermission: vi.fn(),
    });

    runner.onSkipTap();
    runner.onSkipTap();
    runner.onSkipTap();

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  // Case 4: requestPermission throws
  it('Continue → requestPermission throws → onComplete() still fires exactly once', async () => {
    const onComplete = vi.fn();
    const requestPermission = vi.fn(async () => {
      throw new Error('OS prompt unavailable');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const runner = buildPromptOutcomeRunner({
      onComplete,
      enabled: true,
      requestPermission,
    });

    await runner.onContinueTap();

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  // Case 5: Web or no App ID — modal does NOT render, caller fires onComplete
  it('when enabled=false (web or no App ID): shouldRenderModal is false; skip+continue still fire onComplete at most once', async () => {
    const onComplete = vi.fn();
    const requestPermission = vi.fn();
    const runner = buildPromptOutcomeRunner({
      onComplete,
      enabled: false,
      requestPermission,
    });

    expect(runner.shouldRenderModal).toBe(false);

    // Even if a misbehaving caller invokes the handlers, the contract holds.
    runner.onSkipTap();
    await runner.onContinueTap();

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
