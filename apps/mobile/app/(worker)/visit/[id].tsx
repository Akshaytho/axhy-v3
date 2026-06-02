/**
 *
 * Visit Detail — the "I'm about to start work at this site" screen.
 *
 * Worker taps a visit on Home and lands here. Shows site info + a single
 * clear primary action keyed off the visit's machine state.
 *
 * Consumes `GET /worker/visits/:id` via `useWorkerVisitQuery`.
 *
 * Layout:
 *   • Top app bar with back chevron.
 *   • State pill + site name (h1) + address + scheduled day/time.
 *   • Optional small "Call supervisor" button — shown only when phone exists.
 *   • Bottom-pinned primary CTA (state-driven label + destination).
 *
 * State machine discipline: read-only on this screen. No transitions fire here;
 * transitions happen inside the capture flow.
 *
 * @derives(WORKER_MVP_SLICE_2A_PLAN.md §1)
 * @derives(master-plan §G)
 */

import { useMemo } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { tokens } from '@axhy/ui-tokens';
import type { WorkerVisitDetailOutput } from '@axhy/shared-schema';

import { useWorkerVisitQuery } from '../../../lib/queries/use-worker-visit';
import { NAV_ROUTES } from '../../../lib/api-routes';
import { StateBadge } from '../../../components/worker/StateBadge';

const BACK_CHEVRON_SIZE = 24;
const META_GLYPH_SIZE = 16;
const CALL_GLYPH_SIZE = 16;
const TOP_BAR_SPACER = 24;
const CTA_MIN_HEIGHT = 56;
const CTA_BOTTOM_PAD = tokens.space[4];

type VisitState = WorkerVisitDetailOutput['state'];

type PrimaryAction =
  | { kind: 'navigate'; label: string; href: string }
  | { kind: 'disabled'; label: string }
  | null;

/** Worker-friendly CTA derived from visit state.
 *  @derives(master-plan §G) */
function primaryActionFor(state: VisitState, visitId: string): PrimaryAction {
  switch (state) {
    case 'SCHEDULED':
    case 'NOTIFIED':
    case 'EN_ROUTE':
    case 'ON_SITE':
      return {
        kind: 'navigate',
        label: 'Start cleaning',
        href: NAV_ROUTES.workerCaptureEntry(visitId),
      };
    case 'IN_PROGRESS':
    case 'PHOTOS_PENDING':
      return {
        kind: 'navigate',
        label: 'Resume cleaning',
        href: NAV_ROUTES.workerCaptureEntry(visitId),
      };
    case 'AWAITING_VERIFICATION':
      return { kind: 'disabled', label: 'Waiting for verification' };
    case 'VERIFIED':
    case 'FLAGGED':
    case 'CANCELLED':
    case 'NO_SHOW':
    case 'ARCHIVED':
      return null;
    default:
      return null;
  }
}

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
export default function VisitDetail(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const visitId = typeof id === 'string' ? id : '';
  const { data, isLoading, isError, error } = useWorkerVisitQuery(visitId);
  const insets = useSafeAreaInsets();

  const primary = useMemo<PrimaryAction>(
    () => (data ? primaryActionFor(data.state, visitId) : null),
    [data, visitId],
  );

  const onBack = (): void => {
    if (router.canGoBack()) router.back();
    else router.replace('/(worker)');
  };

  const onPrimary = (): void => {
    if (primary?.kind === 'navigate') {
      router.push(primary.href);
    }
  };

  const onCall = (): void => {
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
            <Feather
              name="chevron-left"
              size={BACK_CHEVRON_SIZE}
              color={tokens.color.ink.primary}
            />
          </Pressable>
        </View>
        <View style={s.center}>
          <Text style={s.errorTitle}>Couldn&apos;t load this visit.</Text>
          <Text style={s.errorBody}>{error?.message ?? 'Try again from Home.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const showCall = Boolean(data.supervisorPhone);

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <View style={s.topBar}>
        <Pressable
          onPress={onBack}
          hitSlop={tokens.space[3]}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Feather name="chevron-left" size={BACK_CHEVRON_SIZE} color={tokens.color.ink.primary} />
        </Pressable>
        <Text style={s.title}>Visit</Text>
        <View style={s.spacer} />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.stateRow}>
          <StateBadge state={data.state} />
        </View>

        <Text style={s.siteName}>{data.siteName}</Text>

        {data.siteAddress ? <Text style={s.address}>{data.siteAddress}</Text> : null}

        <View style={s.metaBlock}>
          <View style={s.metaRow}>
            <Feather name="calendar" size={META_GLYPH_SIZE} color={tokens.color.ink.tertiary} />
            <Text style={s.metaText}>{formatDateLine(data.scheduledFor)}</Text>
          </View>
          <View style={s.metaRow}>
            <Feather name="clock" size={META_GLYPH_SIZE} color={tokens.color.ink.tertiary} />
            <Text style={s.metaTextAccent}>{formatTime(data.scheduledFor)}</Text>
          </View>
        </View>

        {showCall ? (
          <Pressable
            onPress={onCall}
            accessibilityRole="button"
            accessibilityLabel="Call supervisor"
            style={s.callBtn}
          >
            <Feather name="phone" size={CALL_GLYPH_SIZE} color={tokens.color.brand.accentInk} />
            <Text style={s.callBtnText}>Call supervisor</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {primary ? (
        <View
          style={[
            s.ctaWrap,
            { paddingBottom: Math.max(insets.bottom, tokens.space[3]) + CTA_BOTTOM_PAD },
          ]}
        >
          <Pressable
            onPress={primary.kind === 'navigate' ? onPrimary : undefined}
            disabled={primary.kind === 'disabled'}
            accessibilityRole="button"
            accessibilityLabel={primary.label}
            style={[s.primaryBtn, primary.kind === 'disabled' && s.primaryBtnDisabled]}
          >
            <Text style={s.primaryBtnText}>{primary.label}</Text>
          </Pressable>
        </View>
      ) : null}
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
    width: TOP_BAR_SPACER,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: tokens.space[5],
    paddingTop: tokens.space[4],
    paddingBottom: tokens.space[6],
  },
  stateRow: {
    marginBottom: tokens.space[3],
  },
  siteName: {
    fontSize: tokens.type.heading.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    marginBottom: tokens.space[2],
  },
  address: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.secondary,
    marginBottom: tokens.space[5],
  },
  metaBlock: {
    marginBottom: tokens.space[5],
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: tokens.space[2],
  },
  metaText: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.secondary,
    marginLeft: tokens.space[2],
  },
  metaTextAccent: {
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    marginLeft: tokens.space[2],
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    backgroundColor: tokens.color.brand.accentSoft,
    borderRadius: tokens.radius.r2,
    paddingHorizontal: tokens.space[3],
    paddingVertical: tokens.space[2],
  },
  callBtnText: {
    color: tokens.color.brand.accentInk,
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    marginLeft: tokens.space[2],
  },
  ctaWrap: {
    paddingHorizontal: tokens.space[5],
    paddingTop: tokens.space[3],
    backgroundColor: tokens.color.surface.paper,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: tokens.color.surface.cardEdge,
  },
  primaryBtn: {
    minHeight: CTA_MIN_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.brand.accent,
    borderRadius: tokens.radius.r3,
    paddingHorizontal: tokens.space[4],
  },
  primaryBtnDisabled: {
    backgroundColor: tokens.color.surface.paper3,
  },
  primaryBtnText: {
    color: tokens.color.surface.paper,
    fontSize: tokens.type.subhead.size,
    fontWeight: String(tokens.weight.semibold) as '600',
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
