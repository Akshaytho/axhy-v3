/**
 * Worker root layout — Stack that hosts the bottom-tab subtree and the
 * full-screen capture/visit subtrees as siblings. This guarantees that when
 * the worker enters /capture/* or /visit/*, the Stack swaps to that screen
 * and the Tabs subtree (including Home content) is fully unmounted/hidden
 * rather than remaining visible underneath — which is what happened when
 * those routes were registered as hidden tabs inside the navigator.
 *
 * Owns the worker-session warm-up (queue rehydrate, partition rehydrate,
 * photo sweep) so it runs once on entry to the (worker) tree regardless of
 * which child route is active.
 *
 * @derives(MVP_V2_ALIGNED_PLAN.md §2)
 * @derives(F-006b — worker shell)
 */

import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { jwtDecode } from 'jwt-decode';

import { getTokens } from '../../lib/auth-store';
import { r2UploadQueue } from '../../lib/r2-upload-queue';
import { loadQueueState, saveQueueState } from '../../lib/storage/queue-persistence';
import { rehydrateFromPartition } from '../../lib/storage/reinstall-rehydration';
import { maybeSweepOldPhotos } from '../../lib/storage/photo-sweep';

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
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="capture" />
      <Stack.Screen name="visit" />
      <Stack.Screen name="leave-request" />
    </Stack>
  );
}
