/**
 * Supervisor tab shell — 5-tab navigator.
 * @derives(ADR-0021)
 */

import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';
import { tokens } from '@axhy/ui-tokens';

type TabIconProps = {
  focused: boolean;
  label: string;
};

function tabIcon(label: string) {
  return ({ focused }: { focused: boolean }) => <TabIconView focused={focused} label={label} />;
}

function TabIconView({ focused, label }: TabIconProps) {
  return (
    <View style={focused ? iconS.dotActive : iconS.dot}>
      <Text style={focused ? iconS.textActive : iconS.text}>{label}</Text>
    </View>
  );
}

const iconS = StyleSheet.create({
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActive: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: tokens.color.brand.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 13,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.tertiary,
  },
  textActive: {
    fontSize: 13,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.brand.accentInk,
  },
});

export default function SupervisorLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: tokens.color.surface.card,
          borderTopColor: tokens.color.surface.cardEdge,
          borderTopWidth: 1,
          paddingBottom: 18,
          paddingTop: 8,
          height: 68,
        },
        tabBarActiveTintColor: tokens.color.brand.accent,
        tabBarInactiveTintColor: tokens.color.ink.tertiary,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      {/* R6 tab order locked 2026-05-11 + founder-confirmed 2026-05-17 PM:
          Today / Decisions / Activity / Chat / Profile.
          Summary + Updates are secondary surfaces (reachable via deep link
          or contextual entry from Today / Profile) but hidden from the
          tab bar — `href: null`. */}
      <Tabs.Screen
        name="today"
        options={{
          title: 'Today',
          tabBarIcon: tabIcon('Today'),
        }}
      />
      <Tabs.Screen
        name="decisions"
        options={{
          title: 'Decisions',
          tabBarIcon: tabIcon('Decisions'),
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: 'Activity',
          tabBarIcon: tabIcon('Activity'),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: tabIcon('Chat'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: tabIcon('Profile'),
        }}
      />
      {/* Secondary surfaces — reachable, not tab-bar items. */}
      <Tabs.Screen name="summary" options={{ href: null }} />
      <Tabs.Screen name="updates" options={{ href: null }} />
    </Tabs>
  );
}
