/**
 * Supervisor tab shell — R6 5-tab bottom navigator with Feather icons.
 *
 * Per R6 prototype (shell.jsx TabBar) and main.jsx canvas:
 *   Today (calendar) / Decisions (bell w/badge) / Activity (bar chart) /
 *   Chat (message square) / Profile (user)
 *
 * Active tab: label in --accent + filled-style icon. Inactive: --ink-3.
 *
 * Overlays rendered at this level (above Tabs, below OS chrome):
 *   - MicFAB: shown on all tabs except Profile; taps navigate to Chat.
 *   - Drawer: left slide-in panel; opened via DrawerContext consumed by
 *     every tab's TopAppBar without prop-drilling.
 *
 * DrawerContext approach: this layout wraps children in
 * `<DrawerContext.Provider value={{ openDrawer }}>`. TopAppBar defaults
 * `onMenu` to `useDrawer().openDrawer` so every tab gets the behaviour
 * without any per-tab wiring.
 *
 * Locale: tab labels are derived from `useLocaleStrings()` so they
 * re-render whenever the Profile language picker calls `setLocale()`.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Tabs, router, usePathname } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Text } from 'react-native';
import { tokens } from '@axhy/ui-tokens';

import { MicFAB } from '../../components/MicFAB';
import { Drawer, DrawerContext } from '../../components/Drawer';
import { DecisionsBadgeIcon } from '../../components/DecisionsBadgeIcon';
import { useLocaleStrings } from '../../lib/i18n/use-locale';

type TabIcon = React.ComponentProps<typeof Feather>['name'];

function tabIcon(name: TabIcon) {
  return ({ focused }: { focused: boolean }) => (
    <Feather
      name={name}
      size={20}
      color={focused ? tokens.color.brand.accent : tokens.color.ink.tertiary}
    />
  );
}

function tabLabel(label: string) {
  return ({ focused }: { focused: boolean }) => (
    <Text style={focused ? labelS.active : labelS.inactive}>{label}</Text>
  );
}

const labelS = StyleSheet.create({
  active: {
    fontSize: 11,
    fontWeight: '600',
    color: tokens.color.brand.accent,
    letterSpacing: 0.2,
    marginTop: 2,
  },
  inactive: {
    fontSize: 11,
    fontWeight: '500',
    color: tokens.color.ink.tertiary,
    letterSpacing: 0.2,
    marginTop: 2,
  },
});

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export default function SupervisorLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  const strings = useLocaleStrings();

  // MicFAB hides on Profile (R6: `showMic = tab !== 'profile'`) AND on Chat (the
  // current Wave 4a chat has its own Send button at bottom-right which the FAB
  // would overlap; once Chat is rebuilt to R6's centered voice-waveform shape,
  // re-enable the FAB on Chat).
  const showMic = !pathname.endsWith('profile') && !pathname.endsWith('chat');

  function openDrawer() {
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  function handleMicPress() {
    router.push('/(supervisor)/chat');
  }

  return (
    <DrawerContext.Provider value={{ openDrawer }}>
      <View style={s.root}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              backgroundColor: tokens.color.surface.paper,
              borderTopColor: tokens.color.surface.cardEdge,
              borderTopWidth: 1,
              height: 72,
              paddingTop: 8,
              paddingBottom: 12,
            },
          }}
        >
          <Tabs.Screen
            name="today"
            options={{
              title: strings.tabs.today,
              tabBarIcon: tabIcon('calendar'),
              tabBarLabel: tabLabel(strings.tabs.today),
            }}
          />
          <Tabs.Screen
            name="decisions"
            options={{
              title: strings.tabs.decisions,
              tabBarIcon: ({ focused }: { focused: boolean }) => (
                <DecisionsBadgeIcon focused={focused} />
              ),
              tabBarLabel: tabLabel(strings.tabs.decisions),
            }}
          />
          <Tabs.Screen
            name="activity"
            options={{
              title: strings.tabs.activity,
              tabBarIcon: tabIcon('bar-chart-2'),
              tabBarLabel: tabLabel(strings.tabs.activity),
            }}
          />
          <Tabs.Screen
            name="chat"
            options={{
              title: strings.tabs.chat,
              tabBarIcon: tabIcon('message-square'),
              tabBarLabel: tabLabel(strings.tabs.chat),
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              title: strings.tabs.profile,
              tabBarIcon: tabIcon('user'),
              tabBarLabel: tabLabel(strings.tabs.profile),
            }}
          />
          {/* Secondary surfaces — reachable, not tab-bar items. */}
          <Tabs.Screen name="summary" options={{ href: null }} />
          <Tabs.Screen name="updates" options={{ href: null }} />
          {/* Drawer-only surfaces — not shown in the tab bar. */}
          <Tabs.Screen name="memory" options={{ href: null }} />
          <Tabs.Screen name="sites" options={{ href: null }} />
        </Tabs>

        {/* MicFAB — overlays tab content; hidden on Profile. */}
        {showMic && <MicFAB onPress={handleMicPress} />}

        {/* Drawer — layout-level so it covers the full screen including tab bar. */}
        <Drawer open={drawerOpen} onClose={closeDrawer} />
      </View>
    </DrawerContext.Provider>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
  },
});
