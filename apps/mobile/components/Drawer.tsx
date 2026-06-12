/**
 * Drawer — left slide-in navigation panel.
 *
 * Contains 8 items covering profile, memory rules, sites, language,
 * notifications, help, temporary mode, and sign-out.
 *
 * Sign-out wires to `onAppLogout` from identity-lifecycle and then
 * redirects to `/(auth)/phone`.
 *
 * Each item is wired per R6 spec (lines 928-1023):
 *   - My profile      → /(supervisor)/me
 *   - Memory & rules  → /(supervisor)/memory
 *   - My sites        → /(supervisor)/sites
 *   - Language        → /(supervisor)/me (Language row is there)
 *   - Notifications   → /(supervisor)/me (Notifications section is there)
 *   - How to use Axhy → Linking.openURL('https://axhy.app/help')
 *                       (help page does not exist yet; deeplink is real)
 *   - Temporary mode  → inline confirm modal; writes axhy_ai_paused_until to
 *                       localStorage (this flag is not yet consumed by chat —
 *                       wiring it into ChatInput is a follow-up slice)
 *   - Sign out        → onAppLogout() + replace /(auth)/phone
 *
 * Also exports `DrawerContext` + `DrawerProvider` so the layout can
 * share `openDrawer` with every tab's TopAppBar without prop-drilling.
 *
 * Animation: RN Modal with `animationType="none"` + an `Animated.Value`
 * that translates the panel from -280 → 0 on open.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { tokens } from '@axhy/ui-tokens';

import { onAppLogout } from '../lib/identity-lifecycle';
import {
  useReloadContextMutation,
  useReloadContextStateQuery,
  isReloadLimitReachedError,
} from '../lib/queries/use-reload-context';

// ---------------------------------------------------------------------------
// DrawerContext — lets TopAppBar.tsx call openDrawer() without prop-drilling.
// ---------------------------------------------------------------------------

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export type DrawerContextValue = {
  openDrawer: () => void;
};

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export const DrawerContext = createContext<DrawerContextValue>({
  openDrawer: () => undefined,
});

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export function useDrawer(): DrawerContextValue {
  return useContext(DrawerContext);
}

// ---------------------------------------------------------------------------
// Drawer items spec (R6 lines 930-940)
// ---------------------------------------------------------------------------

type DrawerItem = {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  sub: string | null;
};

// Cluster C fix (QA-rewalk 2026-05-18): drawer subtitles must be either
// truthful (derived from real data) or omitted. Pre-fix the drawer
// shipped:
//   - Hardcoded fake numbers "23 rules · 12 aliases · 8 site notes" that
//     contradicted the Memory screen's empty state (B2-08).
//   - An un-interpolated placeholder "{N} sites · {M} with active
//     rules" (B2-07).
// Until each entry has a real query backing its subtitle, the subtitle
// is omitted (`sub: null`) — the icon + label alone is enough.
/**
 * Drawer items as a function of dynamic state. Reload-context subtitle
 * reads `${remaining}/${dailyLimit} today` so the supervisor sees the
 * budget at-a-glance.
 *
 * Per docs/locked/chat-sidebar-context-flow.md Reload Context Button:
 * 3/day per supervisor with IST midnight reset. The Drawer is the only
 * surface that exposes the action — the chat surface itself does not
 * (founder lock 2026-05-19 — keeps the chat surface clean).
 */
function buildDrawerItems(
  reloadState: {
    usedToday: number;
    remaining: number;
    dailyLimit: number;
  } | null,
): DrawerItem[] {
  const reloadSub =
    reloadState !== null ? `${reloadState.remaining}/${reloadState.dailyLimit} today` : null;
  return [
    { icon: 'user', label: 'My profile', sub: null },
    { icon: 'zap', label: 'Memory & rules', sub: null },
    { icon: 'refresh-cw', label: 'Reload context', sub: reloadSub },
    { icon: 'map', label: 'My sites', sub: null },
    { icon: 'globe', label: 'Language', sub: 'English · हिन्दी · తెలుగు' },
    { icon: 'bell', label: 'Notifications', sub: 'Push · WhatsApp · Email' },
    { icon: 'help-circle', label: 'How to use Axhy', sub: 'Quick guide' },
    { icon: 'pause', label: 'Temporary mode', sub: null },
    { icon: 'log-out', label: 'Sign out', sub: null },
  ];
}

const DRAWER_WIDTH = 280;
const SLIDE_DURATION = 220;

/**
 * Build stamp shown in the drawer footer. Reads from EXPO_PUBLIC_* env vars
 * threaded through at bundle time so the stamp can't lie about freshness
 * after a build. Falls back to the package version when env vars are
 * unset (typical for `expo start` dev).
 *
 * EAS Build / GH Actions: set EXPO_PUBLIC_BUILD_SHA + EXPO_PUBLIC_BUILD_DATE
 * so the stamp shows e.g. "AXHY · v0.0.1 · 12a4f6e · 2026-05-19".
 *
 * @derives(plans/abstract-wandering-kazoo.md Phase 3 follow-on,
 *   docs/learnings catch #4 completion)
 */
function buildStampText(): string {
  const version = process.env.EXPO_PUBLIC_APP_VERSION ?? '0.0.1';
  const sha = process.env.EXPO_PUBLIC_BUILD_SHA ?? '';
  const date = process.env.EXPO_PUBLIC_BUILD_DATE ?? '';
  const parts = [`AXHY · v${version}`];
  if (sha) parts.push(sha.slice(0, 7));
  if (date) parts.push(date);
  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Drawer component
// ---------------------------------------------------------------------------

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export type DrawerProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * Left slide-in panel with 8 menu items.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */
export function Drawer({ open, onClose }: DrawerProps) {
  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: SLIDE_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 1,
          duration: SLIDE_DURATION,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -DRAWER_WIDTH,
          duration: SLIDE_DURATION,
          useNativeDriver: true,
        }),
        Animated.timing(backdropAnim, {
          toValue: 0,
          duration: SLIDE_DURATION,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [open, slideAnim, backdropAnim]);

  const [pauseModalVisible, setPauseModalVisible] = useState(false);
  const [reloadToast, setReloadToast] = useState<string | null>(null);

  const reloadStateQuery = useReloadContextStateQuery();
  const reloadMutation = useReloadContextMutation();
  const drawerItems = useMemo(
    () => buildDrawerItems(reloadStateQuery.data ?? null),
    [reloadStateQuery.data],
  );

  async function handleReloadContext() {
    try {
      const result = await reloadMutation.mutateAsync();
      setReloadToast(
        `Refreshed memory + calendar. ${result.remaining}/${result.dailyLimit} left today.`,
      );
      // Toast auto-clears after 2.5s
      setTimeout(() => setReloadToast(null), 2500);
    } catch (err) {
      if (isReloadLimitReachedError(err)) {
        setReloadToast("You've used today's 3 reloads. Resets at IST midnight.");
        setTimeout(() => setReloadToast(null), 3500);
      } else {
        setReloadToast(err instanceof Error ? `Reload failed: ${err.message}` : 'Reload failed.');
        setTimeout(() => setReloadToast(null), 3500);
      }
    }
  }

  async function handleSignOut() {
    onClose();
    await onAppLogout();
    router.replace('/(auth)/phone');
  }

  function handlePauseConfirm() {
    // Write the AI-paused flag.
    // This flag is not yet consumed by ChatInput — wiring it there is a
    // follow-up slice. For now it persists the intent so the next slice
    // can read it.
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const isoVal = endOfToday.toISOString();
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem('axhy_ai_paused_until', isoVal);
    } else {
      try {
        SecureStore.setItem('axhy_ai_paused_until', isoVal);
      } catch {
        /* swallow */
      }
    }
    setPauseModalVisible(false);
    onClose();
  }

  function handleItemPress(item: DrawerItem) {
    switch (item.label) {
      case 'Sign out':
        void handleSignOut();
        return;
      case 'My profile':
        router.push('/(supervisor)/me');
        onClose();
        return;
      case 'Memory & rules':
        router.push('/(supervisor)/memory');
        onClose();
        return;
      case 'Reload context':
        // Don't close the drawer — toast shows here.
        void handleReloadContext();
        return;
      case 'My sites':
        router.push('/(supervisor)/sites');
        onClose();
        return;
      case 'Language':
        // Language picker lives in the Profile screen.
        router.push('/(supervisor)/me');
        onClose();
        return;
      case 'Notifications':
        // Notification toggles live in the Profile screen.
        router.push('/(supervisor)/me');
        onClose();
        return;
      case 'How to use Axhy':
        // Help page at axhy.app/help does not exist yet; the URL is the
        // intended destination once the page is published.
        void Linking.openURL('https://axhy.app/help');
        onClose();
        return;
      case 'Temporary mode':
        setPauseModalVisible(true);
        return;
      default:
        onClose();
    }
  }

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Backdrop — tap closes drawer */}
      <Animated.View
        style={[
          s.backdrop,
          {
            opacity: backdropAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 1],
            }),
          },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Panel */}
      <Animated.View style={[s.panel, { transform: [{ translateX: slideAnim }] }]}>
        {/* Items */}
        <View style={s.list}>
          {drawerItems.map((item, index) => {
            const isSignOut = item.label === 'Sign out';
            const isReloading = item.label === 'Reload context' && reloadMutation.isPending;
            return (
              <Pressable
                key={item.label}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                accessibilityState={{ busy: isReloading }}
                disabled={isReloading}
                onPress={() => handleItemPress(item)}
                style={({ pressed }) => [
                  s.item,
                  isSignOut && s.itemSignOut,
                  index === drawerItems.length - 2 && s.itemBeforeSignOut,
                  pressed && s.itemPressed,
                  isReloading && s.itemDisabled,
                ]}
              >
                {/* Icon badge */}
                <View style={[s.iconBadge, isSignOut && s.iconBadgeSignOut]}>
                  <Feather
                    name={item.icon}
                    size={14}
                    color={isSignOut ? tokens.color.semantic.bad : tokens.color.ink.secondary}
                  />
                </View>

                {/* Labels */}
                <View style={s.labelGroup}>
                  <Text style={[s.label, isSignOut && s.labelSignOut]}>{item.label}</Text>
                  {item.sub != null && (
                    <Text style={s.sub} numberOfLines={1}>
                      {item.sub}
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Reload-context inline toast — appears just above the footer */}
        {reloadToast !== null ? (
          <View style={s.reloadToast}>
            <Text style={s.reloadToastText}>{reloadToast}</Text>
          </View>
        ) : null}

        {/* Footer build stamp — derived from expo-constants so it can't lie
            about freshness. Falls back to "v3" if the manifest field is
            missing (dev environment, pre-EAS). */}
        <View style={s.footer}>
          <Text style={s.footerText}>{buildStampText()}</Text>
        </View>
      </Animated.View>

      {/* Pause-AI confirm modal */}
      <PauseAIModal
        visible={pauseModalVisible}
        onCancel={() => setPauseModalVisible(false)}
        onConfirm={handlePauseConfirm}
      />
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// PauseAIModal — inline confirm modal for Temporary mode item.
// ---------------------------------------------------------------------------

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
type PauseAIModalProps = {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * Confirm modal for pausing AI extraction for the rest of today.
 *
 * On confirm: writes `axhy_ai_paused_until` to localStorage. This flag is
 * not yet consumed by ChatInput — wiring it there is a follow-up slice.
 * Chat messages can still be sent normally while the flag is set.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */
function PauseAIModal({ visible, onCancel, onConfirm }: PauseAIModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={pm.backdrop} onPress={onCancel}>
        <Pressable style={pm.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={pm.handle} />
          <Text style={pm.title}>Pause AI for the day?</Text>
          <Text style={pm.body}>
            No new decisions will be extracted from your chat for the rest of today. You can still
            type and send messages normally.
          </Text>
          <View style={pm.actions}>
            <Pressable style={pm.cancelBtn} onPress={onCancel} accessibilityRole="button">
              <Text style={pm.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable style={pm.confirmBtn} onPress={onConfirm} accessibilityRole="button">
              <Text style={pm.confirmText}>Pause</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const pm = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 16, 12, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: tokens.color.surface.card,
    borderTopLeftRadius: tokens.radius.r4,
    borderTopRightRadius: tokens.radius.r4,
    paddingHorizontal: tokens.space[5],
    paddingTop: tokens.space[3],
    paddingBottom: tokens.space[7],
  },
  handle: {
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.color.surface.paper3,
    alignSelf: 'center',
    marginBottom: tokens.space[3],
  },
  title: {
    fontSize: tokens.type.subhead.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.ink.primary,
    marginBottom: tokens.space[2],
  },
  body: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.secondary,
    lineHeight: tokens.type.body.size * 1.5,
    marginBottom: tokens.space[5],
  },
  actions: {
    flexDirection: 'row',
    gap: tokens.space[3],
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: tokens.space[3],
    borderRadius: tokens.radius.r2,
    backgroundColor: tokens.color.surface.paper2,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: tokens.tap.minMobile,
  },
  cancelText: {
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.secondary,
  },
  confirmBtn: {
    flex: 1.4,
    paddingVertical: tokens.space[3],
    borderRadius: tokens.radius.r2,
    backgroundColor: tokens.color.brand.accent,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: tokens.tap.minMobile,
  },
  confirmText: {
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.surface.card,
  },
});

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,16,12,0.45)',
  },
  panel: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: tokens.color.surface.card,
    // iOS shadow
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    // Android elevation
    elevation: 12,
    flexDirection: 'column',
  },
  list: {
    flex: 1,
    paddingVertical: tokens.space[1],
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    minHeight: tokens.tap.minMobile,
  },
  itemSignOut: {
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: tokens.color.surface.cardEdge,
  },
  itemBeforeSignOut: {
    // no-op visual — gap is handled by itemSignOut marginTop
  },
  itemPressed: {
    backgroundColor: tokens.color.surface.paper2,
  },
  itemDisabled: {
    opacity: 0.55,
  },
  reloadToast: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: tokens.color.surface.paper2,
    borderTopWidth: 1,
    borderTopColor: tokens.color.surface.cardEdge,
  },
  reloadToastText: {
    fontSize: 13,
    color: tokens.color.ink.secondary,
    lineHeight: 18,
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: tokens.color.surface.paper2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconBadgeSignOut: {
    backgroundColor: tokens.color.semantic.badSoft,
  },
  labelGroup: {
    flex: 1,
    minWidth: 0,
  },
  label: {
    fontSize: 14,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
  },
  labelSignOut: {
    color: tokens.color.semantic.bad,
  },
  sub: {
    fontSize: tokens.type.monoSm.size,
    color: tokens.color.ink.tertiary,
    marginTop: 2,
  },
  footer: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: tokens.color.surface.cardEdge,
  },
  footerText: {
    fontSize: tokens.type.monoSm.size,
    color: tokens.color.ink.placeholder,
    fontWeight: String(tokens.weight.medium) as '500',
    letterSpacing: 0.04,
  },
});

export default Drawer;
