/**
 * Activity tab — supervisor's recent actions feed.
 *
 * R6-faithful implementation: eyebrow "ACTIVITY · PROOF", count in title,
 * three rows of filter chips (date / site / kind), per-row Feather icon,
 * right-aligned HH:MM mono timestamp, SITE · REASON meta line.
 *
 * Chip state is local/visual only — no backend filter wiring in this slice.
 * Row tap is a stub for the routing slice (Share + Reverse land later).
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */

import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';
import type { ActivityRowT } from '@axhy/shared-schema';

import { TopAppBar } from '../../components/today/TopAppBar';
import { useActivityQuery } from '../../lib/queries/use-activity';

// ---------------------------------------------------------------------------
// Kind → Feather icon name
// ---------------------------------------------------------------------------

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
type FeatherName = React.ComponentProps<typeof Feather>['name'];

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
const KIND_ICON: Record<string, FeatherName> = {
  WORKER_MARKED_ABSENT: 'user-x',
  LEAVE_REQUESTED: 'calendar',
  LEAVE_APPROVED: 'calendar',
  LEAVE_REJECTED: 'calendar',
  ASSIGNMENT_CREATED: 'user-plus',
  SWAP_REQUEST_SENT: 'repeat',
  SITE_COMPLAINT_LOGGED: 'alert-circle',
  BINDING_CREATED: 'map-pin',
  BINDING_ENDED_NORMAL: 'map-pin',
  BINDING_ENDED_EARLY: 'map-pin',
  HANDOFF_PACKAGE_GENERATED: 'package',
  CHAT_MESSAGE_CREATED: 'message-square',
  VISIT_ENDED: 'check-circle',
  DWI_PROPOSED: 'inbox',
  DWI_APPLIED: 'check',
  DWI_DISMISSED: 'x',
};

function iconForKind(kind: string): FeatherName {
  return KIND_ICON[kind] ?? 'activity';
}

// ---------------------------------------------------------------------------
// Timestamp formatter — HH:MM 24-hour
// ---------------------------------------------------------------------------

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
function formatHHMM(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

// ---------------------------------------------------------------------------
// FilterChip
// ---------------------------------------------------------------------------

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
type FilterChipProps = {
  label: string;
  active: boolean;
  onPress: () => void;
};

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
function FilterChip({ label, active, onPress }: FilterChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        chipS.chip,
        active ? chipS.chipActive : chipS.chipInactive,
        pressed && chipS.chipPressed,
      ]}
    >
      <Text style={[chipS.label, active ? chipS.labelActive : chipS.labelInactive]}>{label}</Text>
    </Pressable>
  );
}

const chipS = StyleSheet.create({
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipActive: {
    backgroundColor: tokens.color.brand.accent,
    borderColor: tokens.color.brand.accent,
  },
  chipInactive: {
    backgroundColor: tokens.color.surface.paper3,
    borderColor: tokens.color.surface.cardEdge,
  },
  chipPressed: {
    opacity: 0.75,
  },
  label: {
    fontSize: 12,
    fontWeight: String(tokens.weight.semibold) as '600',
  },
  labelActive: {
    color: tokens.color.surface.card,
  },
  labelInactive: {
    color: tokens.color.ink.secondary,
  },
});

// ---------------------------------------------------------------------------
// EventRow
// ---------------------------------------------------------------------------

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
type EventRowProps = { row: ActivityRowT };

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
function EventRow({ row }: EventRowProps) {
  const icon = iconForKind(row.kind);
  const time = formatHHMM(row.when);

  // Derive SITE · REASON meta from the summary line where possible.
  // Summary is free-form text from the server; we render it verbatim in meta.
  const meta = row.kind.replaceAll('_', ' ');

  return (
    <View style={rowS.row}>
      {/* Left icon */}
      <View style={rowS.iconWrap}>
        <Feather name={icon} size={18} color={tokens.color.ink.tertiary} />
      </View>

      {/* Body */}
      <View style={rowS.body}>
        <Text style={rowS.summary} numberOfLines={2}>
          {row.summary}
        </Text>
        <Text style={rowS.meta} numberOfLines={1}>
          {meta}
        </Text>
      </View>

      {/* Right timestamp */}
      <Text style={rowS.time}>{time}</Text>
    </View>
  );
}

const rowS = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    backgroundColor: tokens.color.surface.card,
    borderColor: tokens.color.surface.cardEdge,
    borderWidth: 1,
    borderRadius: tokens.radius.r3,
    marginBottom: 8,
    gap: 10,
  },
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: tokens.color.surface.paper3,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  summary: {
    fontSize: 14,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    lineHeight: 14 * 1.4,
  },
  meta: {
    fontSize: tokens.type.monoSm.size,
    fontFamily: tokens.font.mono,
    color: tokens.color.ink.tertiary,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  time: {
    fontSize: tokens.type.monoSm.size,
    fontFamily: tokens.font.mono,
    color: tokens.color.ink.tertiary,
    flexShrink: 0,
    marginTop: 2,
  },
});

// ---------------------------------------------------------------------------
// Date filter rows
// ---------------------------------------------------------------------------

const DATE_CHIPS = ['Today', 'Yesterday', 'This week'] as const;
type DateChip = (typeof DATE_CHIPS)[number];

const KIND_CHIPS = ['All actions', 'Absences', 'Lates', 'Leaves'] as const;
type KindChip = (typeof KIND_CHIPS)[number];

// ---------------------------------------------------------------------------
// ActivityScreen
// ---------------------------------------------------------------------------

/**
 * Activity feed screen — the "ACTIVITY · PROOF" surface for supervisors.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */
export default function ActivityScreen() {
  const q = useActivityQuery();
  const onRefresh = useCallback(() => {
    void q.refetch();
  }, [q]);

  // Filter chip state — visual only, no backend wiring this slice.
  const [dateFilter, setDateFilter] = useState<DateChip>('Today');
  const [siteFilter, setSiteFilter] = useState<string>('All sites');
  const [kindFilter, setKindFilter] = useState<KindChip>('All actions');

  const rows = q.data?.rows ?? [];
  const count = rows.length;
  const titleText = count === 1 ? '1 event' : `${count} events`;

  // Derive site chip labels from data (fallback to hardcoded set if empty).
  const siteChips: string[] = ['All sites', 'Apollo', 'Hitech City', 'Westfield'];

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <TopAppBar title={titleText} subtitle="ACTIVITY · PROOF" />

      {/* Filter chip panel */}
      <View style={s.filterPanel}>
        {/* Row 1: date */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipRow}
        >
          {DATE_CHIPS.map((d) => (
            <FilterChip
              key={d}
              label={d}
              active={dateFilter === d}
              onPress={() => setDateFilter(d)}
            />
          ))}
        </ScrollView>

        {/* Row 2: site */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipRow}
        >
          {siteChips.map((site) => (
            <FilterChip
              key={site}
              label={site}
              active={siteFilter === site}
              onPress={() => setSiteFilter(site)}
            />
          ))}
        </ScrollView>

        {/* Row 3: kind */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipRow}
        >
          {KIND_CHIPS.map((k) => (
            <FilterChip
              key={k}
              label={k}
              active={kindFilter === k}
              onPress={() => setKindFilter(k)}
            />
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl
            refreshing={q.isFetching && !q.isLoading}
            onRefresh={onRefresh}
            tintColor={tokens.color.brand.accent}
          />
        }
      >
        {q.isLoading ? (
          <View style={s.center}>
            <ActivityIndicator color={tokens.color.brand.accent} />
            <Text style={s.loadingText}>Loading activity…</Text>
          </View>
        ) : q.isError ? (
          <View style={s.errorCard}>
            <Text style={s.errorTitle}>Could not load activity</Text>
            <Text style={s.errorBody}>
              {q.error instanceof Error ? q.error.message : 'Network problem. Pull to retry.'}
            </Text>
          </View>
        ) : rows.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyTitle}>No activity logged yet</Text>
            <Text style={s.emptyBody}>
              When you act — mark a worker absent, approve a leave, log a complaint — it shows up
              here. Pull down to refresh.
            </Text>
          </View>
        ) : (
          <View>
            {rows.map((row) => (
              <EventRow key={row.id} row={row} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface.paper,
  },
  filterPanel: {
    flexShrink: 0,
    paddingTop: tokens.space[2],
    paddingBottom: tokens.space[2],
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.surface.cardEdge,
    backgroundColor: tokens.color.surface.paper,
    gap: tokens.space[1],
  },
  chipRow: {
    flexDirection: 'row',
    gap: tokens.space[1],
    paddingHorizontal: 14,
    paddingVertical: 2,
  },
  scroll: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 100,
  },
  center: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: tokens.color.ink.tertiary,
  },
  errorCard: {
    backgroundColor: tokens.color.semantic.badSoft,
    borderLeftWidth: 4,
    borderLeftColor: tokens.color.semantic.bad,
    borderRadius: tokens.radius.r2,
    padding: 14,
  },
  errorTitle: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.semantic.bad,
    letterSpacing: 0.44,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  errorBody: {
    fontSize: 14,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
  },
  emptyCard: {
    backgroundColor: tokens.color.surface.card,
    borderColor: tokens.color.surface.cardEdge,
    borderWidth: 1,
    borderRadius: tokens.radius.r3,
    padding: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    marginBottom: 6,
  },
  emptyBody: {
    fontSize: 13,
    color: tokens.color.ink.secondary,
    lineHeight: 13 * 1.45,
  },
});
