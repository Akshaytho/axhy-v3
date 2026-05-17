/**
 * Supervisor tab shell — R6 5-tab bottom navigator with Feather icons.
 *
 * Per R6 prototype (shell.jsx TabBar) and main.jsx canvas:
 *   Today (calendar) / Decisions (bell w/badge) / Activity (bar chart) /
 *   Chat (message square) / Profile (user)
 *
 * Active tab: label in --accent + filled-style icon. Inactive: --ink-3.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */

import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Text, StyleSheet } from 'react-native';
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

export default function SupervisorLayout() {
  return (
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
          title: 'Today',
          tabBarIcon: tabIcon('calendar'),
          tabBarLabel: tabLabel('Today'),
        }}
      />
      <Tabs.Screen
        name="decisions"
        options={{
          title: 'Decisions',
          tabBarIcon: tabIcon('bell'),
          tabBarLabel: tabLabel('Decisions'),
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
          tabBarIcon: tabIcon('bar-chart-2'),
          tabBarLabel: tabLabel('Activity'),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: tabIcon('message-square'),
          tabBarLabel: tabLabel('Chat'),
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
      {/* Secondary surfaces — reachable, not tab-bar items. */}
      <Tabs.Screen name="summary" options={{ href: null }} />
      <Tabs.Screen name="updates" options={{ href: null }} />
    </Tabs>
  );
}
