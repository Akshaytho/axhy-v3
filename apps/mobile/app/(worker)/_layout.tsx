/**
 * Worker tab shell — 3-tab bottom navigator with Feather icons.
 *
 * Per MVP_V2_ALIGNED_PLAN.md §2: Home / History / Profile.
 *
 * Drops MicFAB and Drawer (supervisor-only surfaces). Workers do not have
 * chat or memory surfaces in MVP (DO_NOT_BUILD_MVP.md: chat tab cut; pay tab
 * folds into History; theme picker cut).
 *
 * Tokens: @axhy/ui-tokens terracotta-paper, panel-locked 2026-05-07.
 *
 * @derives(MVP_V2_ALIGNED_PLAN.md §2)
 * @derives(F-006b — worker shell)
 */

import { StyleSheet, View, Text } from 'react-native';
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';

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

/** @derives(master-plan §G) — worker surface */
export default function WorkerLayout() {
  return (
    <View style={s.root}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: tokens.color.surface.paper,
            borderTopColor: tokens.color.surface.cardEdge,
            borderTopWidth: 1,
            height: tokens.tap.minMobile + tokens.space[3],
            paddingTop: tokens.space[2],
            paddingBottom: tokens.space[3],
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: tabIcon('home'),
            tabBarLabel: tabLabel('Home'),
          }}
        />
        <Tabs.Screen
          name="history"
          options={{
            title: 'History',
            tabBarIcon: tabIcon('clock'),
            tabBarLabel: tabLabel('History'),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: tabIcon('user'),
            tabBarLabel: tabLabel('Profile'),
          }}
        />
        {/* Hide nested directories from the tab bar — they're reachable only via
           NAV_ROUTES deep-links. Without href:null, Expo Router auto-registers
           every subdirectory under (worker) as an extra tab slot. */}
        <Tabs.Screen name="visit" options={{ href: null }} />
        <Tabs.Screen name="capture" options={{ href: null }} />
      </Tabs>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
  },
});
