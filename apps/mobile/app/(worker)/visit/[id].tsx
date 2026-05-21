/**
 * Assignment Detail — single-visit screen.
 *
 * Consumes `GET /worker/visits/:id` via `useWorkerVisitQuery`. Renders:
 *   • Top app bar with back chevron.
 *   • Site card: name, address, scheduled time, visit-state badge.
 *   • Map preview placeholder (real map ships slice 2b with `expo-location`).
 *   • Photos summary placeholder ("0 of 6 required" until capture starts in 2b).
 *   • Tap-to-call supervisor button (uses `Linking.openURL('tel:...')`).
 *   • "Can't make this" disabled stub (real swap flow ships in 2c).
 *
 * The supervisor phone is NOT shown in plain text — only behind the call button —
 * per slice 1 §4 question 6 (privacy default).
 *
 * State machine discipline: the visit state is read-only on this screen. No
 * transitions fire from 2a. The "Can't make this" stub will produce
 * `swapRequestMachine` events when slice 2c lands.
 *
 * @derives(WORKER_MVP_SLICE_2A_PLAN.md §1)
 * @derives(master-plan §G)
 */

import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { tokens } from '@axhy/ui-tokens';

import { useWorkerVisitQuery } from '../../../lib/queries/use-worker-visit';
import { StateBadge } from '../../../components/worker/StateBadge';

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const hh = h % 12 === 0 ? 12 : h % 12;
  const mm = String(m).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${hh}:${mm} ${ampm}`;
}

function formatDateLine(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

/** @derives(master-plan §G) — worker surface */
export default function AssignmentDetail(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const visitId = typeof id === 'string' ? id : '';
  const { data, isLoading, isError, error } = useWorkerVisitQuery(visitId);

  const onBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(worker)');
  };

  const onCall = () => {
    if (data?.supervisorPhone) {
      Linking.openURL(`tel:${data.supervisorPhone}`);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
        <View style={s.center}>
          <ActivityIndicator color={tokens.color.brand.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (isError || !data) {
    return (
      <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
        <View style={s.topBar}>
          <Pressable
            onPress={onBack}
            hitSlop={tokens.space[3]}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Feather name="chevron-left" size={24} color={tokens.color.ink.primary} />
          </Pressable>
        </View>
        <View style={s.center}>
          <Text style={s.errorTitle}>Couldn&apos;t load this assignment.</Text>
          <Text style={s.errorBody}>{error?.message ?? 'Try again from Home.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const callDisabled = !data.supervisorPhone;

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <View style={s.topBar}>
        <Pressable
          onPress={onBack}
          hitSlop={tokens.space[3]}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Feather name="chevron-left" size={24} color={tokens.color.ink.primary} />
        </Pressable>
        <Text style={s.title}>Assignment</Text>
        <View style={s.spacer} />
      </View>

      <View style={s.body}>
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Text style={s.siteName} numberOfLines={2}>
              {data.siteName}
            </Text>
            <StateBadge state={data.state} />
          </View>
          {data.siteAddress ? (
            <Text style={s.address}>{data.siteAddress}</Text>
          ) : (
            <Text style={s.addressMuted}>Address not on file</Text>
          )}
          <View style={s.metaRow}>
            <Feather name="calendar" size={14} color={tokens.color.ink.tertiary} />
            <Text style={s.metaText}>{formatDateLine(data.scheduledFor)}</Text>
          </View>
          <View style={s.metaRow}>
            <Feather name="clock" size={14} color={tokens.color.ink.tertiary} />
            <Text style={s.metaText}>{formatTime(data.scheduledFor)}</Text>
          </View>
        </View>

        <View style={s.placeholderCard}>
          <Feather name="map" size={20} color={tokens.color.ink.tertiary} />
          <Text style={s.placeholderText}>Map preview coming with location</Text>
        </View>

        <View style={s.photosRow}>
          <Text style={s.photosLabel}>Photos</Text>
          <Text style={s.photosValue}>{data.photosBefore + data.photosAfter} of 6 required</Text>
        </View>

        <Pressable
          onPress={onCall}
          disabled={callDisabled}
          accessibilityRole="button"
          accessibilityLabel="Call supervisor"
          style={[s.primaryBtn, callDisabled && s.btnDisabled]}
        >
          <Feather name="phone" size={18} color={tokens.color.surface.paper} />
          <Text style={s.primaryBtnText}>
            {callDisabled ? 'No supervisor assigned — call HR' : 'Call supervisor'}
          </Text>
        </Pressable>

        <Pressable
          disabled
          accessibilityRole="button"
          accessibilityLabel="Can't make this — coming soon"
          style={[s.secondaryBtn, s.btnDisabled]}
        >
          <Text style={s.secondaryBtnText}>Can&apos;t make this</Text>
        </Pressable>
        <Text style={s.stubNote}>Coming with leave & swap support</Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface.paper,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.space[3],
    paddingTop: tokens.space[3],
    paddingBottom: tokens.space[2],
  },
  title: {
    fontSize: tokens.type.subhead.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
  },
  spacer: {
    width: 24,
  },
  body: {
    flex: 1,
    paddingHorizontal: tokens.space[4],
    paddingTop: tokens.space[3],
  },
  card: {
    backgroundColor: tokens.color.surface.card,
    borderRadius: tokens.radius.r3,
    borderWidth: 1,
    borderColor: tokens.color.surface.cardEdge,
    padding: tokens.space[3],
    marginBottom: tokens.space[3],
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: tokens.space[2],
  },
  siteName: {
    flex: 1,
    fontSize: tokens.type.heading.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    marginRight: tokens.space[2],
  },
  address: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.secondary,
    marginBottom: tokens.space[2],
  },
  addressMuted: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.tertiary,
    fontStyle: 'italic',
    marginBottom: tokens.space[2],
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: tokens.space[1],
  },
  metaText: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.secondary,
    marginLeft: tokens.space[2],
  },
  placeholderCard: {
    backgroundColor: tokens.color.surface.paper3,
    borderRadius: tokens.radius.r3,
    padding: tokens.space[4],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: tokens.space[3],
  },
  placeholderText: {
    fontSize: tokens.type.caption.size,
    color: tokens.color.ink.tertiary,
    marginTop: tokens.space[1],
  },
  photosRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: tokens.space[3],
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: tokens.color.surface.cardEdge,
    marginBottom: tokens.space[4],
  },
  photosLabel: {
    fontSize: tokens.type.subhead.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
  },
  photosValue: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.tertiary,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.brand.accent,
    borderRadius: tokens.radius.r3,
    paddingVertical: tokens.space[3],
    marginBottom: tokens.space[2],
  },
  primaryBtnText: {
    color: tokens.color.surface.paper,
    fontSize: tokens.type.subhead.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    marginLeft: tokens.space[2],
  },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: tokens.color.surface.cardEdge,
    borderRadius: tokens.radius.r3,
    paddingVertical: tokens.space[3],
  },
  secondaryBtnText: {
    color: tokens.color.ink.secondary,
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.semibold) as '600',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  stubNote: {
    textAlign: 'center',
    fontSize: tokens.type.caption.size,
    color: tokens.color.ink.tertiary,
    marginTop: tokens.space[1],
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.space[5],
  },
  errorTitle: {
    fontSize: tokens.type.subhead.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    marginBottom: tokens.space[1],
    textAlign: 'center',
  },
  errorBody: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.tertiary,
    textAlign: 'center',
  },
});
