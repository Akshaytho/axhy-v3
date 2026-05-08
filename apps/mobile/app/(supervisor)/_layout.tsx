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
      <Text style={focused ? iconS.textActive : iconS.text}>{label.slice(0, 1)}</Text>
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
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: tabIcon('Chat'),
        }}
      />
      <Tabs.Screen
        name="today"
        options={{
          title: 'Today',
          tabBarIcon: tabIcon('Today'),
        }}
      />
      <Tabs.Screen
        name="summary"
        options={{
          title: 'Summary',
          tabBarIcon: tabIcon('Summary'),
        }}
      />
      <Tabs.Screen
        name="updates"
        options={{
          title: 'Updates',
          tabBarIcon: tabIcon('Updates'),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: tabIcon('Profile'),
        }}
      />
    </Tabs>
  );
}
