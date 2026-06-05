/**
 * WorkerDrawer — left slide-in panel for worker-extra screens not in canon.
 *
 * Mirrors the supervisor Drawer pattern (RN Modal + Animated translation).
 * Holds the real worker utilities that exist today:
 *
 *   1. My profile     → /(worker)/profile
 *   2. Request leave  → /(worker)/leave-request (self-service time-off)
 *   3. Help / Support → Linking.openURL('https://axhy.app/help')
 *   4. Sign out       → onAppLogout() + replace /(auth)/phone
 *
 * Provides WorkerDrawerContext so any worker screen can open the drawer via
 * useWorkerDrawer().openDrawer().
 *
 * @derives(docs/design/worker-app-canon/GAP_ANALYSIS.md — sidebar pattern)
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { tokens } from '@axhy/ui-tokens';

import { onAppLogout } from '../../lib/identity-lifecycle';
import { NAV_ROUTES } from '../../lib/api-routes';

interface WorkerDrawerContextValue {
  openDrawer: () => void;
}

const WorkerDrawerContext = createContext<WorkerDrawerContextValue | null>(null);

/** @derives(master-plan §G) — worker surface */
export function useWorkerDrawer(): WorkerDrawerContextValue {
  const ctx = useContext(WorkerDrawerContext);
  if (!ctx) {
    return { openDrawer: () => {} };
  }
  return ctx;
}

const DRAWER_WIDTH = 280;

interface Item {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  onPress: () => void | Promise<void>;
  destructive?: boolean;
}

interface DrawerProps {
  open: boolean;
  onClose: () => void;
}

/** @derives(master-plan §G) — worker surface */
export function WorkerDrawer({ open, onClose }: DrawerProps) {
  const translate = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const overlay = useRef(new Animated.Value(0)).current;
  const appVersion = process.env.EXPO_PUBLIC_APP_VERSION ?? 'dev';
  const [logoutError, setLogoutError] = useState<string | null>(null);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translate, {
        toValue: open ? 0 : -DRAWER_WIDTH,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(overlay, {
        toValue: open ? 1 : 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  }, [open, translate, overlay]);

  useEffect(() => {
    if (!logoutError) return;
    const t = setTimeout(() => setLogoutError(null), 5000);
    return () => clearTimeout(t);
  }, [logoutError]);

  async function handleLogout(): Promise<void> {
    try {
      await onAppLogout();
      onClose();
      router.replace(NAV_ROUTES.authPhone);
    } catch (err) {
      if (__DEV__) {
        console.warn('[worker-drawer] onAppLogout threw', err);
      }
      setLogoutError("Couldn't sign out. Tap to try again.");
    }
  }

  const items: Item[] = useMemo(
    () => [
      {
        icon: 'user',
        label: 'My profile',
        onPress: () => {
          onClose();
          router.push('/(worker)/profile' as never);
        },
      },
      {
        icon: 'calendar',
        label: 'Request leave',
        onPress: () => {
          onClose();
          router.push(NAV_ROUTES.workerLeaveRequest as never);
        },
      },
      {
        icon: 'help-circle',
        label: 'Help & support',
        onPress: () => {
          onClose();
          void Linking.openURL('https://axhy.app/help');
        },
      },
      {
        icon: 'log-out',
        label: 'Sign out',
        onPress: handleLogout,
        destructive: true,
      },
    ],
    [onClose, translate, overlay],
  );

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={StyleSheet.absoluteFill}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: 'rgba(20,17,13,0.45)', opacity: overlay },
          ]}
        >
          <Pressable style={{ flex: 1 }} onPress={onClose} />
        </Animated.View>
        <Animated.View style={[s.panel, { transform: [{ translateX: translate }] }]}>
          <View style={s.brand}>
            <Text style={s.brandMark}>A·</Text>
            <Text style={s.brandWord}>AXHY</Text>
          </View>

          <View style={s.list}>
            {items.map((item) => (
              <Pressable
                key={item.label}
                onPress={item.onPress}
                style={({ pressed }) => [s.row, pressed && { opacity: 0.7 }]}
                accessibilityRole="button"
                accessibilityLabel={item.label}
              >
                <Feather
                  name={item.icon}
                  size={18}
                  color={item.destructive ? tokens.color.semantic.bad : tokens.color.ink.secondary}
                />
                <Text
                  style={[s.rowLabel, item.destructive && { color: tokens.color.semantic.bad }]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
            {logoutError ? (
              <View style={s.errorBanner}>
                <Text style={s.errorBannerText}>{logoutError}</Text>
              </View>
            ) : null}
          </View>

          <Text style={s.footer}>{`Axhy v${appVersion}`}</Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

interface ProviderProps {
  children: ReactNode;
}

/** @derives(master-plan §G) — worker surface */
export function WorkerDrawerProvider({ children }: ProviderProps) {
  const [open, setOpen] = useState(false);
  const value = useMemo<WorkerDrawerContextValue>(() => ({ openDrawer: () => setOpen(true) }), []);
  return (
    <WorkerDrawerContext.Provider value={value}>
      {children}
      <WorkerDrawer open={open} onClose={() => setOpen(false)} />
    </WorkerDrawerContext.Provider>
  );
}

const s = StyleSheet.create({
  panel: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    backgroundColor: tokens.color.surface.card,
    paddingTop: 56,
    paddingHorizontal: 20,
    borderRightWidth: 1,
    borderRightColor: tokens.color.surface.cardEdge,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginBottom: 28,
  },
  brandMark: {
    fontSize: 26,
    fontWeight: '800',
    color: tokens.color.ink.primary,
  },
  brandWord: {
    fontSize: 14,
    fontWeight: '600',
    color: tokens.color.ink.secondary,
    letterSpacing: 0.4,
  },
  list: { gap: 4 },
  errorBanner: {
    marginTop: 8,
    padding: 12,
    borderRadius: tokens.radius.r3,
    backgroundColor: tokens.color.semantic.badSoft,
    borderWidth: 1,
    borderColor: tokens.color.semantic.bad,
  },
  errorBannerText: {
    fontSize: 13,
    color: tokens.color.semantic.bad,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: tokens.color.ink.primary,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    fontSize: 11,
    color: tokens.color.ink.tertiary,
    textAlign: 'center',
  },
});
