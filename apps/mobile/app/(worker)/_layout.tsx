// [ORCHESTRATOR_EXCEPTION] canon redesign — worker shell

/**
 * Worker tab shell — 3-tab bottom navigator wrapped in WorkerDrawerProvider.
 *
 * Tabs: Today / Capture / You. Drawer is a left slide-in providing access to
 * worker utilities that live outside the bottom bar.
 *
 * Canon (docs/design/worker-app-canon/) keeps the bottom-tab bar but introduces
 * a hamburger in each tab's header. This shell exposes WorkerDrawerContext via
 * WorkerDrawerProvider; screens read it via useWorkerDrawer().
 *
 * @derives(MVP_V2_ALIGNED_PLAN.md §2)
 * @derives(docs/design/worker-app-canon/GAP_ANALYSIS.md)
 * @derives(F-006b — worker shell)
 */

import { useEffect } from 'react';
import { AppState, Platform, StyleSheet, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { jwtDecode } from 'jwt-decode';
import { tokens } from '@axhy/ui-tokens';

import { getTokens } from '../../lib/auth-store';
import { r2UploadQueue } from '../../lib/r2-upload-queue';
import { loadQueueState, saveQueueState } from '../../lib/storage/queue-persistence';
import { rehydrateFromPartition } from '../../lib/storage/reinstall-rehydration';
import { maybeSweepOldPhotos } from '../../lib/storage/photo-sweep';
import { WorkerDrawerProvider } from '../../components/worker/WorkerDrawer';
// [ORCHESTRATOR_EXCEPTION] DEV-only screenshot debug FAB import
// import { SendToClaudeButton } from '../../components/dev/SendToClaudeButton';

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
  useEffect(() => {
    let workerId: string | null = null;

    const init = async () => {
      try {
        const tokens = await getTokens();
        if (!tokens) return;
        const payload = jwtDecode<{ userId?: string; sub?: string }>(tokens.accessToken);
        workerId = payload.userId ?? payload.sub ?? null;
        if (!workerId) return;

        const persisted = await loadQueueState();
        r2UploadQueue.hydrate(persisted);
        await rehydrateFromPartition(workerId);
        await maybeSweepOldPhotos(workerId);
      } catch (err) {
        console.error(
          '[worker-layout] init failed',
          err instanceof Error ? err.message : String(err),
        );
      }
    };

    void init();

    const unsubQueue = r2UploadQueue.onChange((snap) => {
      void saveQueueState(snap);
    });

    const appStateSub =
      Platform.OS !== 'web'
        ? AppState.addEventListener('change', (nextState) => {
            if (nextState !== 'active' || !workerId) return;
            void maybeSweepOldPhotos(workerId);
          })
        : null;

    return () => {
      unsubQueue();
      appStateSub?.remove();
    };
  }, []);

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
          {/* [ORCHESTRATOR_EXCEPTION] DIVERGENCE-10 fix: hide tab bar during full-flow capture + visit detail */}
          <Tabs.Screen name="visit" options={{ href: null, tabBarStyle: { display: 'none' } }} />
          <Tabs.Screen name="capture" options={{ href: null, tabBarStyle: { display: 'none' } }} />
        </Tabs>
        {/* [ORCHESTRATOR_EXCEPTION] DEV-only: tap-to-send-screenshot debug FAB. Renders null in production. */}
        {/* {__DEV__ ? <SendToClaudeButton /> : null} */}
      </View>
    </WorkerDrawerProvider>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
  },
});
