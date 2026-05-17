/**
 * F-006a — Pre-prompt explainer modal for OneSignal push permission.
 *
 * Renders after first successful OTP verify. The user picks Continue
 * (→ OS native prompt) or Skip (no OS prompt this session). Either way,
 * navigation to the supervisor shell fires EXACTLY ONCE — friend's v2 Fix 3
 * locked the contract.
 *
 * The contract is the load-bearing part. The visual treatment is intentionally
 * minimal in F-006a; Sara-type design pass + copy refinement land in F-006b.
 *
 * @derives(F-006a scope round-2 v6 Pick 5)
 * @derives(ADR-0009)
 * @derives(master-plan §G)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { tokens } from '@axhy/ui-tokens';

import { shouldCallOneSignal, _resolveOneSignal } from '../lib/identity-lifecycle';

/**
 * The exactly-once-navigation contract per Pick 5 v2.
 *
 * Pure helper testable in isolation. Implements the navigation rule for all
 * five branches:
 *   1. Continue + OS prompt grant → onComplete()
 *   2. Continue + OS prompt deny → onComplete()
 *   3. Skip (no OS prompt) → onComplete()
 *   4. requestPermission throws → onComplete()
 *   5. Web or no App ID (modal does not render) → onComplete() directly
 *
 * Whichever branch fires first wins; the `outcomeFiredRef` guard prevents
 * any subsequent state change from re-firing navigation.
 *
 * @derives(F-006a scope round-2 v6 Pick 5)
 */
export type PromptOutcomeRunner = {
  /** Should the modal render at all? False on web / no App ID — caller fires onComplete directly. */
  shouldRenderModal: boolean;
  /** Handler for the user tapping Continue inside the modal. */
  onContinueTap: () => Promise<void>;
  /** Handler for the user tapping Skip inside the modal. */
  onSkipTap: () => void;
};

/**
 * Pure factory that builds the prompt-outcome runner around a navigation
 * callback. Exported for unit tests; the React component below wraps it.
 *
 * Guarantees `onComplete` is called EXACTLY ONCE regardless of which branch
 * fires (or how many times any of the handlers is tapped).
 *
 * @derives(F-006a scope round-2 v6 Pick 5)
 */
export function buildPromptOutcomeRunner(args: {
  onComplete: () => void;
  /** Override for tests; defaults to `shouldCallOneSignal()`. */
  enabled?: boolean;
  /** Override for tests; defaults to the real SDK requestPermission via _resolveOneSignal. */
  requestPermission?: () => Promise<boolean>;
  /** Optional outcome-fired flag (for tests that want to inspect the ref). */
  outcomeFiredRef?: { current: boolean };
}): PromptOutcomeRunner {
  const enabled = args.enabled ?? shouldCallOneSignal();
  const firedRef = args.outcomeFiredRef ?? { current: false };

  const fireOnce = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    args.onComplete();
  };

  const onContinueTap = async () => {
    try {
      const request =
        args.requestPermission ??
        (async () => {
          const sdk = await _resolveOneSignal();
          if (!sdk) return false;
          // The real SDK exposes `OneSignal.Notifications.requestPermission(fallbackToSettings?: boolean)`.
          // Resolve it dynamically so tests can mock the surface cleanly.
          const mod = (await import('react-native-onesignal')) as unknown as {
            OneSignal?: {
              Notifications?: { requestPermission?: (b?: boolean) => Promise<boolean> };
            };
          };
          const fn = mod.OneSignal?.Notifications?.requestPermission;
          if (typeof fn !== 'function') return false;
          return await fn(false);
        });
      await request();
    } catch (err) {
      if (__DEV__) {
        console.warn('[PushPermissionPrompt] requestPermission threw — navigating anyway', err);
      }
    } finally {
      fireOnce();
    }
  };

  const onSkipTap = () => {
    fireOnce();
  };

  return {
    shouldRenderModal: enabled,
    onContinueTap,
    onSkipTap,
  };
}

/**
 * React component: renders the explainer modal when OneSignal is enabled
 * on this build; otherwise fires `onComplete` immediately and renders nothing.
 *
 * The component is intentionally thin — all contract logic lives in
 * `buildPromptOutcomeRunner` for testability.
 *
 * @derives(F-006a scope round-2 v6 Pick 5)
 */
export type PushPermissionPromptProps = {
  /** Called EXACTLY ONCE when the prompt flow completes (any branch). */
  onComplete: () => void;
};

export default function PushPermissionPrompt({ onComplete }: PushPermissionPromptProps) {
  const firedRef = useRef(false);
  const runnerRef = useRef<PromptOutcomeRunner | null>(null);
  if (runnerRef.current === null) {
    runnerRef.current = buildPromptOutcomeRunner({ onComplete, outcomeFiredRef: firedRef });
  }
  const runner = runnerRef.current;

  const [visible, setVisible] = useState(runner.shouldRenderModal);

  useEffect(() => {
    if (!runner.shouldRenderModal) {
      // Web or no App ID — modal does not render; fire onComplete directly.
      if (!firedRef.current) {
        firedRef.current = true;
        onComplete();
      }
    }
    // Only depends on initial render; runner is stable via the ref above.
  }, []);

  const handleContinue = useCallback(async () => {
    setVisible(false);
    await runner.onContinueTap();
  }, [runner]);

  const handleSkip = useCallback(() => {
    setVisible(false);
    runner.onSkipTap();
  }, [runner]);

  if (!runner.shouldRenderModal) return null;

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={handleSkip}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <Text style={s.title}>Stay in the loop</Text>
          <Text style={s.body}>
            We&apos;ll let you know when your supervisor changes for a site you&apos;re on, or when
            a decision needs you.
          </Text>
          <Pressable
            onPress={handleContinue}
            accessibilityRole="button"
            accessibilityLabel="Continue"
            style={s.primaryBtn}
          >
            <Text style={s.primaryBtnText}>Continue</Text>
          </Pressable>
          <Pressable
            onPress={handleSkip}
            accessibilityRole="button"
            accessibilityLabel="Skip for now"
            style={s.secondaryBtn}
          >
            <Text style={s.secondaryBtnText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.space[4],
  },
  card: {
    backgroundColor: tokens.color.surface.card,
    borderRadius: tokens.radius.r3,
    padding: tokens.space[5],
    width: '100%',
    maxWidth: 360,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: tokens.color.ink.primary,
    marginBottom: tokens.space[2],
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: tokens.color.ink.secondary,
    marginBottom: tokens.space[4],
  },
  primaryBtn: {
    backgroundColor: tokens.color.brand.accent,
    paddingVertical: tokens.space[3],
    paddingHorizontal: tokens.space[4],
    borderRadius: tokens.radius.r2,
    alignItems: 'center',
    marginBottom: tokens.space[2],
  },
  primaryBtnText: {
    color: tokens.color.surface.paper,
    fontWeight: '600',
    fontSize: 16,
  },
  secondaryBtn: {
    paddingVertical: tokens.space[3],
    paddingHorizontal: tokens.space[4],
    borderRadius: tokens.radius.r2,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: tokens.color.ink.secondary,
    fontSize: 15,
  },
});
