/**
 * Worker Profile.
 *
 * Uses only real worker data available today: JWT identity, today's visit
 * counts, current upload sync state, and supervisor contact. Placeholder score
 * and vanity stats were removed so this screen stays trustworthy.
 *
 * @derives(MVP_V2_ALIGNED_PLAN.md §2)
 * @derives(master-plan §G)
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { tokens } from '@axhy/ui-tokens';

import { WCard } from '../../../components/worker/WCard';
import { SyncPill, type SyncState } from '../../../components/worker/SyncPill';
import { useWorkerDrawer } from '../../../components/worker/WorkerDrawer';
import { r2UploadQueue, type QueueItem } from '../../../lib/r2-upload-queue';
import { useWorkerTodayQuery } from '../../../lib/queries/use-worker-today';
import { apiFetch } from '../../../lib/api';
import { API_ROUTES, NAV_ROUTES } from '../../../lib/api-routes';
import { listMyLeaveRequests, type MyLeaveRow } from '../../../lib/api-leave';

/**
 * Identity comes from GET /me (real DB values). The previous implementation
 * jwt-decoded `name`/`phone` claims that the backend never issues (JWTClaims
 * has neither), so every worker showed as "Worker / +91 ••••• •••••".
 * @derives(walk worker-screens 2026-06-10-2345 observations O1+O2)
 */
interface MeIdentity {
  phone?: string;
  name?: string;
}

function sanitizeDisplayName(name: string | undefined): string | undefined {
  if (!name) return name;
  return name.replace(/\s*\(real-phone\)\s*$/i, '').trim();
}

function initialFromName(name: string | undefined, phone: string | undefined): string {
  if (name && name.length > 0) return name[0]!.toUpperCase();
  if (phone && phone.length > 0) return phone[phone.length - 1]!;
  return 'A';
}

function useQueueSummary(): { state: SyncState; pendingCount: number } {
  const [summary, setSummary] = useState<{ state: SyncState; pendingCount: number }>({
    state: 'synced',
    pendingCount: 0,
  });

  useEffect(() => {
    const sync = (snap: ReadonlyMap<string, QueueItem>) => {
      let pending = 0;
      snap.forEach((item) => {
        if (item.status !== 'done' && item.status !== 'failed') pending += 1;
      });
      setSummary({ state: pending > 0 ? 'syncing' : 'synced', pendingCount: pending });
    };

    sync(r2UploadQueue.snapshot());
    return r2UploadQueue.onChange(sync);
  }, []);

  return summary;
}

/** @derives(master-plan §G) */
export default function WorkerProfile(): React.JSX.Element {
  const { openDrawer } = useWorkerDrawer();
  const { data, isLoading, isError, refetch, isRefetching } = useWorkerTodayQuery();
  const { state: syncState, pendingCount } = useQueueSummary();
  const [payload, setPayload] = useState<MeIdentity | null>(null);
  const [myLeaves, setMyLeaves] = useState<MyLeaveRow[] | null>(null);
  const [leavesError, setLeavesError] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await apiFetch<{ user?: { name?: string | null; phone?: string | null } }>(
          API_ROUTES.me,
        );
        if (!alive) return;
        setPayload({
          name: me.user?.name ?? undefined,
          phone: me.user?.phone ?? undefined,
        });
      } catch {
        // identity stays at the safe fallback ("Worker" / masked)
      }
    })();
    (async () => {
      try {
        const res = await listMyLeaveRequests();
        if (!alive) return;
        setMyLeaves(res.items);
      } catch {
        if (!alive) return;
        setLeavesError(true);
        setMyLeaves([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const visits = data?.visits ?? [];
  const verifiedCount = visits.filter((visit) => visit.state === 'VERIFIED').length;
  const inProgressCount = visits.filter(
    (visit) => visit.state === 'IN_PROGRESS' || visit.state === 'PHOTOS_PENDING',
  ).length;
  const upcomingCount = visits.filter((visit) =>
    ['SCHEDULED', 'NOTIFIED', 'EN_ROUTE', 'ON_SITE'].includes(visit.state),
  ).length;

  const supportLine = useMemo(() => {
    if (isLoading && !data) return 'Loading supervisor contact…';
    if (isError && !data) return 'Supervisor contact unavailable right now.';
    if (data?.supervisorPhone) return data.supervisorPhone;
    return 'Supervisor contact is not configured yet.';
  }, [data, isError, isLoading]);

  const appVersion = process.env.EXPO_PUBLIC_APP_VERSION ?? 'dev';
  const name = sanitizeDisplayName(payload?.name) ?? 'Worker';
  const phone = payload?.phone ?? '+91 ••••• •••••';

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={s.scroll}>
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

        <View style={s.headerCard}>
          <View style={s.avatar}>
            <Text style={s.avatarInitial}>{initialFromName(name, phone)}</Text>
          </View>
          <Text style={s.name}>{name}</Text>
          <Text style={s.phone}>{phone}</Text>
          {(() => {
            // Reflect the real account standing — a suspended/blocked worker must
            // NOT see "Verified" (RCA-F 2026-06-04). Paused set matches home (index.tsx:66).
            const ws = data?.workerState;
            const paused = ws === 'ON_SUSPENSION' || ws === 'BLOCKED';
            const onLeave = ws === 'ON_LEAVE';
            const label = paused ? 'Account paused' : onLeave ? 'On leave' : 'Verified';
            const icon = paused ? 'alert-triangle' : onLeave ? 'calendar' : 'shield';
            const fg = paused
              ? tokens.color.semantic.warn
              : onLeave
                ? tokens.color.ink.secondary
                : '#2e5037';
            return (
              <View
                style={[
                  s.verifiedPill,
                  paused ? { backgroundColor: tokens.color.semantic.warnSoft } : null,
                ]}
              >
                <Feather name={icon} size={12} color={fg} />
                <Text style={[s.verifiedText, { color: fg }]}>{label}</Text>
              </View>
            );
          })()}
        </View>

        <View style={s.section}>
          {isLoading && !data ? (
            <WCard padding={16}>
              <View style={s.center}>
                <ActivityIndicator color={tokens.color.brand.accent} />
                <Text style={s.cardBody}>Loading your work summary…</Text>
              </View>
            </WCard>
          ) : isError && !data ? (
            <WCard padding={16}>
              <View style={s.center}>
                <Text style={s.cardTitle}>Couldn&apos;t load today&apos;s summary.</Text>
                <Text style={s.cardBody}>Check your connection and try again.</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Try again"
                  onPress={() => {
                    void refetch();
                  }}
                  style={({ pressed }) => [s.retryBtn, pressed && { opacity: 0.9 }]}
                >
                  <Text style={s.retryText}>{isRefetching ? 'Retrying…' : 'Try again'}</Text>
                </Pressable>
              </View>
            </WCard>
          ) : (
            <WCard padding={16}>
              <Text style={s.sectionMono}>TODAY</Text>
              <View style={s.statsRow}>
                <View style={s.statCell}>
                  <Text style={s.statValue}>{visits.length}</Text>
                  <Text style={s.statLabel}>Sites</Text>
                </View>
                <View style={s.statCell}>
                  <Text style={s.statValue}>{verifiedCount}</Text>
                  <Text style={s.statLabel}>Verified</Text>
                </View>
                <View style={s.statCell}>
                  <Text style={s.statValue}>{inProgressCount + upcomingCount}</Text>
                  <Text style={s.statLabel}>Remaining</Text>
                </View>
              </View>
            </WCard>
          )}
        </View>

        <View style={s.section}>
          <WCard padding={16}>
            <Text style={s.sectionMono}>MY RECORD</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="See your past visits"
              onPress={() => router.push(NAV_ROUTES.workerHistory as never)}
              style={({ pressed }) => [s.recordRow, pressed && { opacity: 0.85 }]}
            >
              <Feather name="clock" size={18} color={tokens.color.ink.secondary} />
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>Past visits</Text>
                <Text style={s.cardBody}>Proof of the work you finished.</Text>
              </View>
              <Feather name="chevron-right" size={20} color={tokens.color.ink.tertiary} />
            </Pressable>

            <View style={s.recordDivider} />
            <Text style={s.cardTitle}>My leave</Text>
            {myLeaves === null ? (
              <Text style={s.cardBody}>Loading your leave…</Text>
            ) : leavesError ? (
              <Text style={s.cardBody}>
                Couldn&apos;t load leave right now. Pull to retry later.
              </Text>
            ) : myLeaves.length === 0 ? (
              <Text style={s.cardBody}>No leave requests yet.</Text>
            ) : (
              myLeaves.slice(0, 3).map((lv) => {
                const approved = lv.state === 'APPROVED';
                const rejected = lv.state === 'REJECTED';
                const chipBg = approved
                  ? tokens.color.semantic.okSoft
                  : rejected
                    ? tokens.color.semantic.warnSoft
                    : tokens.color.surface.paper3;
                const chipFg = approved
                  ? '#2e5037'
                  : rejected
                    ? tokens.color.semantic.warn
                    : tokens.color.ink.secondary;
                const label = approved ? 'Approved' : rejected ? 'Rejected' : 'Waiting';
                return (
                  <View key={lv.id} style={s.leaveRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.cardTitle}>
                        {lv.fromDate === lv.toDate ? lv.fromDate : `${lv.fromDate} → ${lv.toDate}`}
                      </Text>
                      <Text style={s.cardBody} numberOfLines={1}>
                        {lv.reason}
                      </Text>
                    </View>
                    <View style={[s.leaveChip, { backgroundColor: chipBg }]}>
                      <Text style={[s.leaveChipText, { color: chipFg }]}>{label}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </WCard>
        </View>

        <View style={s.section}>
          <WCard padding={16}>
            <View style={s.syncRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle}>
                  {syncState === 'syncing' ? 'Syncing photos…' : 'Synced'}
                </Text>
                <Text style={s.cardBody}>
                  {pendingCount > 0
                    ? `${pendingCount} upload${pendingCount === 1 ? '' : 's'} still in progress.`
                    : 'All queued captures are up to date.'}
                </Text>
              </View>
              <SyncPill state={syncState} />
            </View>
          </WCard>
        </View>

        <View style={s.section}>
          <WCard padding={16}>
            <Text style={s.sectionMono}>SUPPORT</Text>
            <Text style={s.cardTitle}>Need help or a schedule change?</Text>
            <Text style={s.cardBody}>
              Need time off? Use Request leave in the menu. For shift swaps or task questions,
              contact your supervisor.
            </Text>
            <View style={s.supportRow}>
              <Text style={s.supportLine}>{supportLine}</Text>
              {data?.supervisorPhone ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Call supervisor"
                  onPress={() => {
                    void Linking.openURL(`tel:${data.supervisorPhone}`);
                  }}
                  style={({ pressed }) => [s.callBtn, pressed && { opacity: 0.9 }]}
                >
                  <Feather name="phone" size={14} color={tokens.color.surface.paper} />
                  <Text style={s.callBtnText}>Call</Text>
                </Pressable>
              ) : null}
            </View>
          </WCard>
        </View>

        <Text style={s.footer}>{`Axhy v${appVersion}`}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface.paper,
  },
  scroll: {
    paddingBottom: 32,
  },
  menuBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  section: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  sectionMono: {
    fontFamily: tokens.font.mono,
    fontSize: 10,
    letterSpacing: 1,
    color: tokens.color.ink.tertiary,
    marginBottom: 10,
  },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
  },
  recordDivider: {
    height: 1,
    backgroundColor: tokens.color.surface.paper3,
    marginVertical: 12,
  },
  leaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  leaveChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  leaveChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statCell: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: tokens.color.surface.paper2,
    alignItems: 'center',
    paddingVertical: 14,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: tokens.color.ink.primary,
  },
  statLabel: {
    fontSize: 12,
    color: tokens.color.ink.tertiary,
    marginTop: 4,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.space[3],
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: tokens.color.ink.primary,
  },
  cardBody: {
    fontSize: 13,
    color: tokens.color.ink.tertiary,
    lineHeight: 19,
    marginTop: 4,
  },
  supportRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  supportLine: {
    flex: 1,
    fontSize: 13,
    color: tokens.color.ink.secondary,
  },
  callBtn: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: tokens.color.brand.accent,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: tokens.color.surface.paper,
  },
  retryBtn: {
    minHeight: tokens.tap.minMobile,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: tokens.color.brand.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    color: tokens.color.surface.card,
    fontSize: 14,
    fontWeight: '700',
  },
  footer: {
    textAlign: 'center',
    paddingTop: 20,
    fontSize: 11,
    color: tokens.color.ink.tertiary,
  },
});
