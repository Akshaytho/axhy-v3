// [ORCHESTRATOR_EXCEPTION] canon redesign — worker Profile

/**
 * Worker Profile — canon layout from docs/design/worker-app-canon.
 *
 * Sections:
 *   - Full-bleed header card (avatar, name, phone, Verified pill)
 *   - Performance card (64px score ring + Quality score)
 *   - Stats row (Total sites / This month / Avg score)
 *   - Sync card (status pill)
 *   - APPEARANCE preset chips
 *   - Footer ("Member since … / Axhy v1.0.0")
 *
 * Data: Phone is pulled from the stored JWT via `getTokens()`. Worker name
 * is unavailable from the existing /worker/today payload so we render the
 * initial from the phone digits as a fallback until a /worker/me endpoint
 * lands. Sign out lives in the sidebar drawer; the bottom "Sign out" row
 * is also present for parity with the placeholder.
 *
 * @derives(MVP_V2_ALIGNED_PLAN.md §2)
 * @derives(docs/design/worker-app-canon/project/worker-screens.jsx > WorkerProfile)
 */

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { jwtDecode } from 'jwt-decode';
import { tokens } from '@axhy/ui-tokens';

import { getTokens } from '../../lib/auth-store';
import { onAppLogout } from '../../lib/identity-lifecycle';
import { NAV_ROUTES } from '../../lib/api-routes';
import { WCard } from '../../components/worker/WCard';
import { StatCard } from '../../components/worker/StatCard';
import { SyncPill, type SyncState } from '../../components/worker/SyncPill';
import { useWorkerDrawer } from '../../components/worker/WorkerDrawer';
import { r2UploadQueue } from '../../lib/r2-upload-queue';

interface JwtPayload {
  phone?: string;
  name?: string;
  userId?: string;
  sub?: string;
}

function initialFromName(name: string | undefined, phone: string | undefined): string {
  if (name && name.length > 0) return name[0]!.toUpperCase();
  if (phone && phone.length > 0) return phone[phone.length - 1]!;
  return 'A';
}

function useSyncState(): SyncState {
  const [state, setState] = useState<SyncState>('synced');
  useEffect(() => {
    const unsub = r2UploadQueue.onChange((snap) => {
      let inFlight = 0;
      snap.forEach((i) => {
        if (i.status !== 'done') inFlight += 1;
      });
      setState(inFlight > 0 ? 'syncing' : 'synced');
    });
    return unsub;
  }, []);
  return state;
}

/** @derives(master-plan §G) — worker surface */
export default function WorkerProfile(): React.JSX.Element {
  const { openDrawer } = useWorkerDrawer();
  const syncState = useSyncState();
  const [payload, setPayload] = useState<JwtPayload | null>(null);

  useEffect(() => {
    (async () => {
      const t = await getTokens();
      if (!t) return;
      try {
        setPayload(jwtDecode<JwtPayload>(t.accessToken));
      } catch {
        // ignore
      }
    })();
  }, []);

  async function handleLogout(): Promise<void> {
    try {
      await onAppLogout();
    } catch {
      // ignore
    }
    router.replace(NAV_ROUTES.authPhone);
  }

  const presets = ['Dim', 'Default', 'Warm', 'Bright', 'Custom'];
  const score = 87; // placeholder — will be /worker/quality-score in slice 3
  const stats = { total: 142, thisMonth: 11, avg: score };
  const name = payload?.name ?? 'Worker';
  const phone = payload?.phone ?? '+91 ••••• •••••';

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.scroll}>
        {/* Inline header for menu button (canon profile has no top-bar; keep menu reachable) */}
        <View style={s.menuBar}>
          <Pressable
            onPress={openDrawer}
            accessibilityRole="button"
            accessibilityLabel="Open menu"
            hitSlop={12}
            style={s.iconBtn}
          >
            <Feather name="menu" size={22} color={tokens.color.ink.primary} />
          </Pressable>
        </View>

        {/* Full-bleed header card */}
        <View style={s.headerCard}>
          <View style={s.avatar}>
            <Text style={s.avatarInitial}>{initialFromName(name, phone)}</Text>
          </View>
          <Text style={s.name}>{name}</Text>
          <Text style={s.phone}>{phone}</Text>
          <View style={s.verifiedPill}>
            <Feather name="shield" size={12} color="#2e5037" />
            <Text style={s.verifiedText}>Verified</Text>
          </View>
        </View>

        {/* Performance card */}
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <WCard padding={16}>
            <View style={s.perfRow}>
              <View style={s.scoreCircle}>
                <Text style={s.scoreCircleText}>{score}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.perfTitle}>Quality score</Text>
                <Text style={s.perfRating}>Great</Text>
                <Text style={s.perfSub}>Based on AI review of last 100 sites</Text>
              </View>
            </View>
          </WCard>
        </View>

        {/* Stats row */}
        <View style={s.statsRow}>
          <StatCard value={String(stats.total)} label="Total sites" padding={14} />
          <StatCard value={String(stats.thisMonth)} label="This month" padding={14} />
          <StatCard
            value={String(stats.avg)}
            label="Avg score"
            padding={14}
            valueColor={tokens.color.brand.accent}
          />
        </View>

        {/* Sync card */}
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <WCard padding={14}>
            <View style={s.syncRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.syncTitle}>{syncState === 'syncing' ? 'Syncing…' : 'Synced'}</Text>
                <Text style={s.syncSub}>
                  {syncState === 'syncing' ? 'Uploading queued photos' : 'All data is up to date'}
                </Text>
              </View>
              <SyncPill state={syncState} />
            </View>
          </WCard>
        </View>

        {/* Appearance presets — visual only; founder cut theme picker per DO_NOT_BUILD_MVP */}
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <WCard padding={14}>
            <Text style={s.sectionMono}>APPEARANCE</Text>
            <View style={s.presetRow}>
              {presets.map((p, i) => {
                const active = i === 1;
                return (
                  <View
                    key={p}
                    style={[s.preset, active && { backgroundColor: tokens.color.brand.accent }]}
                  >
                    <Text style={[s.presetText, active && { color: tokens.color.surface.card }]}>
                      {p}
                    </Text>
                  </View>
                );
              })}
            </View>
          </WCard>
        </View>

        {/* Sign out (also in drawer; mirrored here for visibility) */}
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <Pressable
            onPress={handleLogout}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            style={({ pressed }) => [s.logoutBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={s.logoutText}>Sign out</Text>
          </Pressable>
        </View>

        <Text style={s.footer}>Member since January 2024{'\n'}Axhy v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface.paper,
  },
  scroll: { paddingBottom: 32 },
  menuBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerCard: {
    backgroundColor: tokens.color.surface.card,
    paddingTop: 16,
    paddingBottom: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.surface.paper3,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: tokens.color.brand.accentSoft,
    borderWidth: 2,
    borderColor: 'rgba(192,73,42,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  avatarInitial: {
    fontSize: 30,
    fontWeight: '700',
    color: tokens.color.brand.accentInk,
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: tokens.color.ink.primary,
  },
  phone: {
    fontSize: 14,
    color: tokens.color.ink.secondary,
    marginTop: 4,
  },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: tokens.color.semantic.okSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginTop: 10,
  },
  verifiedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2e5037',
  },
  perfRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  scoreCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    borderColor: tokens.color.brand.accent,
    backgroundColor: tokens.color.surface.paper2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreCircleText: {
    fontSize: 22,
    fontWeight: '800',
    color: tokens.color.brand.accent,
  },
  perfTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: tokens.color.ink.primary,
  },
  perfRating: {
    fontSize: 13,
    fontWeight: '700',
    color: tokens.color.brand.accent,
    marginTop: 2,
  },
  perfSub: {
    fontSize: 11,
    color: tokens.color.ink.tertiary,
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  syncTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: tokens.color.ink.primary,
  },
  syncSub: {
    fontSize: 11,
    color: tokens.color.ink.tertiary,
    marginTop: 2,
  },
  sectionMono: {
    fontFamily: tokens.font.mono,
    fontSize: 10,
    letterSpacing: 1,
    color: tokens.color.ink.tertiary,
    marginBottom: 10,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  preset: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: tokens.color.surface.cardEdge,
  },
  presetText: {
    fontSize: 13,
    fontWeight: '600',
    color: tokens.color.ink.primary,
  },
  logoutBtn: {
    height: 48,
    borderRadius: tokens.radius.r3,
    borderWidth: 1,
    borderColor: tokens.color.surface.cardEdge,
    backgroundColor: tokens.color.surface.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '700',
    color: tokens.color.brand.accent,
  },
  footer: {
    textAlign: 'center',
    fontSize: 11,
    color: tokens.color.ink.tertiary,
    marginTop: 18,
  },
});
