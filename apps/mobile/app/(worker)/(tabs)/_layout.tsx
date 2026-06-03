/**
 * Worker bottom-tab navigator — 3 tabs (Today / Capture / You) wrapped in
 * WorkerDrawerProvider. Sits inside the outer (worker) Stack so that
 * full-flow routes (capture, visit) replace the tab tree entirely rather than
 * overlaying it as hidden tabs.
 *
 * @derives(MVP_V2_ALIGNED_PLAN.md §2)
 * @derives(docs/design/worker-app-canon/GAP_ANALYSIS.md)
 * @derives(F-006b — worker shell)
 */

import { StyleSheet, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';

import { WorkerDrawerProvider } from '../../../components/worker/WorkerDrawer';

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
export default function WorkerTabsLayout() {
  return (
    <WorkerDrawerProvider>
      <View style={s.root}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarStyle: {
              backgroundColor: tokens.color.surface.card,
              borderTopColor: tokens.color.surface.paper3,
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
              title: 'Today',
              tabBarIcon: tabIcon('home'),
              tabBarLabel: tabLabel('Today'),
            }}
          />
          <Tabs.Screen
            name="capture-launcher"
            options={{
              title: 'Capture',
              tabBarIcon: tabIcon('camera'),
              tabBarLabel: tabLabel('Capture'),
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              title: 'You',
              tabBarIcon: tabIcon('user'),
              tabBarLabel: tabLabel('You'),
            }}
          />
          <Tabs.Screen name="history" options={{ href: null }} />
        </Tabs>
      </View>
    </WorkerDrawerProvider>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
  },
});
