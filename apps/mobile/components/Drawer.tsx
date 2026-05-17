/**
 * Drawer — left slide-in navigation panel.
 *
 * Contains 8 items covering profile, memory rules, sites, language,
 * notifications, help, temporary mode, and sign-out.
 *
 * Sign-out wires to `onAppLogout` from identity-lifecycle and then
 * redirects to `/(auth)/phone`.
 *
 * All other items are honest no-ops (close drawer only — no fake toasts,
 * per `feedback_real_life_scenarios_before_implementation`).
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

import { createContext, useContext, useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { tokens } from '@axhy/ui-tokens';

import { onAppLogout } from '../lib/identity-lifecycle';

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

const DRAWER_ITEMS: DrawerItem[] = [
  { icon: 'user', label: 'My profile', sub: 'Stats · streaks · prefs' },
  { icon: 'zap', label: 'Memory & rules', sub: '23 rules · 12 aliases · 8 site notes' },
  { icon: 'map', label: 'My sites', sub: '{N} sites · {M} with active rules' },
  { icon: 'globe', label: 'Language', sub: 'English · हिन्दी · తెలుగు' },
  { icon: 'bell', label: 'Notifications', sub: 'Push · WhatsApp · Email' },
  { icon: 'help-circle', label: 'How to use Axhy', sub: '60-sec video · examples' },
  { icon: 'pause', label: 'Temporary mode', sub: 'Pause AI for the day' },
  { icon: 'log-out', label: 'Sign out', sub: null },
];

const DRAWER_WIDTH = 280;
const SLIDE_DURATION = 220;

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

  async function handleSignOut() {
    onClose();
    await onAppLogout();
    router.replace('/(auth)/phone');
  }

  function handleItemPress(item: DrawerItem) {
    if (item.label === 'Sign out') {
      void handleSignOut();
      return;
    }
    // Honest no-op: close drawer, no further action until surface is built.
    onClose();
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
          {DRAWER_ITEMS.map((item, index) => {
            const isSignOut = item.label === 'Sign out';
            return (
              <Pressable
                key={item.label}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                onPress={() => handleItemPress(item)}
                style={({ pressed }) => [
                  s.item,
                  isSignOut && s.itemSignOut,
                  index === DRAWER_ITEMS.length - 2 && s.itemBeforeSignOut,
                  pressed && s.itemPressed,
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

        {/* Footer build stamp */}
        <View style={s.footer}>
          <Text style={s.footerText}>AXHY · v3 · BUILD 2026.05.08</Text>
        </View>
      </Animated.View>
    </Modal>
  );
}

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
