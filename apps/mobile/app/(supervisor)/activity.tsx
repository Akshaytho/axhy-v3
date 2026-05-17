/**
 * Activity tab — supervisor's recent actions feed.
 *
 * R6-faithful implementation: eyebrow "ACTIVITY · PROOF", count in title,
 * three rows of filter chips (date / site / kind), per-row Feather icon,
 * right-aligned HH:MM mono timestamp, SITE · REASON meta line.
 *
 * Tapping a row expands an action drawer with two buttons:
 *   - Share to WhatsApp — opens wa.me deeplink with composed message text.
 *   - Reverse — enabled within 30 min; beyond that, greyed + "Window closed"
 *     subtext. Tapping when fresh shows an honest placeholder modal.
 *
 * Filter chips are wired to the backend: tapping any chip updates the
 * query key + URL params, triggering a TanStack Query refetch for the
 * new filter combination.
 *
 * Site chips: populated from `useTodayQuery` (supervisor's bound sites).
 * If Today data is not yet loaded, only "All sites" is shown. Real UUIDs
 * from the Today response are used as siteId filter values — no hardcoded
 * names. A follow-up slice can add a dedicated site-list endpoint.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */

import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
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
import { useTodayQuery } from '../../lib/queries/use-today';
import { useLocaleStrings } from '../../lib/i18n/use-locale';

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

/** Returns the Feather icon name for a given activity kind. */
function iconForKind(kind: string): FeatherName {
  return KIND_ICON[kind] ?? 'activity';
}

// ---------------------------------------------------------------------------
// Timestamp formatter — HH:MM 24-hour
// ---------------------------------------------------------------------------

/** Formats an ISO timestamp as HH:MM in 24-hour notation. */
function formatHHMM(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

// ---------------------------------------------------------------------------
// Reverse-window helper
// ---------------------------------------------------------------------------

/** Returns true when the row is within the 30-minute reversal window. */
function isWithinReverseWindow(isoWhen: string): boolean {
  return Date.now() - new Date(isoWhen).getTime() < 30 * 60 * 1000;
}

// ---------------------------------------------------------------------------
// WhatsApp share helper
// ---------------------------------------------------------------------------

/**
 * Builds a WhatsApp deeplink for the given activity row.
 * Works on iOS, Android, and web (opens WhatsApp Web).
 */
function buildWhatsAppUrl(row: ActivityRowT): string {
  const text = `[Axhy · ${row.kind.replaceAll('_', ' ').toLowerCase()}] ${row.summary} (${new Date(row.when).toLocaleString()})`;
  const encoded = encodeURIComponent(text);
  return `https://wa.me/?text=${encoded}`;
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

/** Pill-shaped filter chip used in the three chip rows above the feed. */
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
// ActionDrawer — shown when a row is expanded
// ---------------------------------------------------------------------------

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
type ActionDrawerProps = {
  row: ActivityRowT;
  onSharePress: () => void;
  onReversePress: () => void;
};

/**
 * Two-button drawer that appears below an expanded activity row.
 * Share is always active; Reverse is greyed when the 30-min window has closed.
 */
function ActionDrawer({ row, onSharePress, onReversePress }: ActionDrawerProps) {
  const canReverse = isWithinReverseWindow(row.when);

  return (
    <View style={drawerS.container}>
      {/* Share to WhatsApp */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Share to WhatsApp"
        onPress={onSharePress}
        style={({ pressed }) => [drawerS.btn, pressed && drawerS.btnPressed]}
      >
        <Feather name="share-2" size={13} color={tokens.color.brand.accent} />
        <Text style={drawerS.btnLabel}>SHARE TO WHATSAPP</Text>
      </Pressable>

      <View style={drawerS.divider} />

      {/* Reverse */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={canReverse ? 'Reverse this action' : 'Reverse window closed'}
        onPress={onReversePress}
        style={({ pressed }) => [
          drawerS.btn,
          pressed && drawerS.btnPressed,
          !canReverse && drawerS.btnDisabled,
        ]}
      >
        <Feather
          name="rotate-ccw"
          size={13}
          color={canReverse ? tokens.color.semantic.warn : tokens.color.ink.placeholder}
        />
        <View style={drawerS.reverseLabelWrap}>
          <Text
            style={[
              drawerS.btnLabel,
              canReverse ? drawerS.reverseLabelActive : drawerS.reverseLabelDisabled,
            ]}
          >
            REVERSE
          </Text>
          {!canReverse && (
            <Text style={drawerS.reverseSubtext}>Window closed · soft-flag for HR</Text>
          )}
        </View>
      </Pressable>
    </View>
  );
}

const drawerS = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: tokens.color.surface.cardEdge,
    backgroundColor: tokens.color.surface.paper3,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 5,
  },
  btnPressed: {
    opacity: 0.65,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  btnLabel: {
    fontSize: 11,
    fontWeight: String(tokens.weight.semibold) as '600',
    fontFamily: tokens.font.mono,
    letterSpacing: 0.5,
  },
  reverseLabelWrap: {
    alignItems: 'center',
  },
  reverseLabelActive: {
    color: tokens.color.semantic.warn,
  },
  reverseLabelDisabled: {
    color: tokens.color.ink.placeholder,
  },
  reverseSubtext: {
    fontSize: 9,
    color: tokens.color.ink.placeholder,
    marginTop: 1,
    fontFamily: tokens.font.mono,
  },
  divider: {
    width: 1,
    backgroundColor: tokens.color.surface.cardEdge,
  },
});

// ---------------------------------------------------------------------------
// EventRow — tappable row with optional expand drawer
// ---------------------------------------------------------------------------

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
type EventRowProps = {
  row: ActivityRowT;
  expanded: boolean;
  onToggle: () => void;
  onShare: () => void;
  onReverse: () => void;
};

/**
 * Single activity feed row. Tapping toggles the action drawer.
 * A chevron indicator rotates 90° when expanded.
 */
function EventRow({ row, expanded, onToggle, onShare, onReverse }: EventRowProps) {
  const icon = iconForKind(row.kind);
  const time = formatHHMM(row.when);
  const meta = row.kind.replaceAll('_', ' ');

  return (
    <View style={rowS.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={({ pressed }) => [rowS.row, pressed && rowS.rowPressed]}
      >
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

        {/* Right: timestamp + chevron */}
        <View style={rowS.rightCol}>
          <Text style={rowS.time}>{time}</Text>
          <Feather
            name="chevron-right"
            size={14}
            color={tokens.color.ink.placeholder}
            style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}
          />
        </View>
      </Pressable>

      {expanded && <ActionDrawer row={row} onSharePress={onShare} onReversePress={onReverse} />}
    </View>
  );
}

const rowS = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface.card,
    borderColor: tokens.color.surface.cardEdge,
    borderWidth: 1,
    borderRadius: tokens.radius.r3,
    marginBottom: 8,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    gap: 10,
  },
  rowPressed: {
    opacity: 0.8,
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
  rightCol: {
    flexShrink: 0,
    alignItems: 'flex-end',
    gap: 6,
    marginTop: 2,
  },
  time: {
    fontSize: tokens.type.monoSm.size,
    fontFamily: tokens.font.mono,
    color: tokens.color.ink.tertiary,
  },
});

// ---------------------------------------------------------------------------
// ReverseModal — honest placeholder until routing slice ships
// ---------------------------------------------------------------------------

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
type ReverseModalProps = {
  row: ActivityRowT | null;
  onClose: () => void;
};

/**
 * Placeholder confirmation modal for the Reverse action.
 * Shown when supervisor taps Reverse on a fresh (≤30 min) row.
 * No mutation is performed — routing slice wires this up next.
 */
function ReverseModal({ row, onClose }: ReverseModalProps) {
  return (
    <Modal
      visible={row !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={modalS.backdrop} onPress={onClose} accessibilityLabel="Close modal">
        <Pressable
          style={modalS.sheet}
          onPress={() => {
            /* absorb tap */
          }}
        >
          <Text style={modalS.title}>Reverse coming with routing slice</Text>
          <Text style={modalS.body}>
            Full reversal logic ships with the routing slice. Tap OK to dismiss.
          </Text>
          <View style={modalS.btnRow}>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [modalS.btn, modalS.btnCancel, pressed && modalS.btnPressed]}
            >
              <Text style={modalS.btnCancelLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [modalS.btn, modalS.btnOk, pressed && modalS.btnPressed]}
            >
              <Text style={modalS.btnOkLabel}>OK</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const modalS = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(26,22,18,0.50)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    backgroundColor: tokens.color.surface.card,
    borderRadius: tokens.radius.r4,
    padding: 20,
    borderWidth: 1,
    borderColor: tokens.color.surface.cardEdge,
  },
  title: {
    fontSize: 16,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    color: tokens.color.ink.secondary,
    lineHeight: 14 * 1.45,
    marginBottom: 20,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 10,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: tokens.radius.r3,
    alignItems: 'center',
  },
  btnCancel: {
    backgroundColor: tokens.color.surface.paper3,
    borderWidth: 1,
    borderColor: tokens.color.surface.cardEdge,
  },
  btnOk: {
    backgroundColor: tokens.color.brand.accent,
  },
  btnPressed: {
    opacity: 0.75,
  },
  btnCancelLabel: {
    fontSize: 14,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.secondary,
  },
  btnOkLabel: {
    fontSize: 14,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.surface.card,
  },
});

// ---------------------------------------------------------------------------
// Filter chip label constants + maps to backend param values
// ---------------------------------------------------------------------------

const DATE_CHIPS = ['Today', 'Yesterday', 'This week'] as const;
type DateChip = (typeof DATE_CHIPS)[number];

const KIND_CHIPS = ['All actions', 'Absences', 'Lates', 'Leaves'] as const;
type KindChip = (typeof KIND_CHIPS)[number];

/**
 * Maps a DateChip label to the `?date=` param value expected by the backend.
 *
 * @derives(ADR-0003)
 */
const DATE_CHIP_TO_PARAM: Record<DateChip, string> = {
  Today: 'today',
  Yesterday: 'yesterday',
  'This week': 'this-week',
};

/**
 * Maps a KindChip label to the `?kind=` param value expected by the backend.
 *
 * @derives(ADR-0003)
 */
const KIND_CHIP_TO_PARAM: Record<KindChip, string> = {
  'All actions': 'all',
  Absences: 'absences',
  Lates: 'lates',
  Leaves: 'leaves',
};

// ---------------------------------------------------------------------------
// ActivityScreen
// ---------------------------------------------------------------------------

/**
 * Activity feed screen — the "ACTIVITY · PROOF" surface for supervisors.
 *
 * Row tap → expand action drawer (Share to WhatsApp + Reverse).
 * Share taps open a WhatsApp deeplink with composed message text.
 * Reverse shows a placeholder modal; full reversal ships with routing slice.
 *
 * Filter chips are fully wired to the backend via `useActivityQuery`.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */
export default function ActivityScreen() {
  const strings = useLocaleStrings();

  // ---------------------------------------------------------------------------
  // Filter chip controlled state
  // ---------------------------------------------------------------------------

  const [dateChip, setDateChip] = useState<DateChip>('Today');
  // siteChipId holds 'all' or a real siteId UUID from Today data.
  const [siteChipId, setSiteChipId] = useState<string>('all');
  const [kindChip, setKindChip] = useState<KindChip>('All actions');

  // Map chip selections to backend param values.
  const dateParam = DATE_CHIP_TO_PARAM[dateChip];
  const kindParam = KIND_CHIP_TO_PARAM[kindChip];

  // ---------------------------------------------------------------------------
  // Data hooks
  // ---------------------------------------------------------------------------

  // Today data — used to populate site chips with real names + UUIDs.
  const todayQ = useTodayQuery();

  // Site chip options: [{ id: 'all', name: 'All sites' }, ...bound sites].
  const siteChipOptions = useMemo(() => {
    const base: { id: string; name: string }[] = [{ id: 'all', name: 'All sites' }];
    if (todayQ.data?.sites) {
      for (const site of todayQ.data.sites) {
        base.push({ id: site.id, name: site.name });
      }
    }
    return base;
  }, [todayQ.data?.sites]);

  // Main activity query — refetches automatically when any param changes.
  const q = useActivityQuery({ date: dateParam, siteId: siteChipId, kind: kindParam });

  const onRefresh = useCallback(() => {
    void q.refetch();
  }, [q]);

  // Expanded row id — null means all rows collapsed.
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Reverse modal — holds the row whose modal is open, null means closed.
  const [reverseModalRow, setReverseModalRow] = useState<ActivityRowT | null>(null);

  const rows = q.data?.rows ?? [];
  const count = rows.length;
  const titleText = count === 1 ? '1 event' : `${count} events`;

  /** Toggles the expanded state for a row. Tapping same row collapses it. */
  const handleRowToggle = useCallback((id: string) => {
    setExpandedRowId((prev) => (prev === id ? null : id));
  }, []);

  /**
   * Opens WhatsApp (or WhatsApp Web on web) with the composed message
   * pre-filled. Uses `Linking` from react-native — works on iOS, Android,
   * and Expo Go web preview.
   */
  const handleShare = useCallback((row: ActivityRowT) => {
    void Linking.openURL(buildWhatsAppUrl(row));
  }, []);

  /**
   * Handles a Reverse tap.
   * Within the 30-min window → open placeholder modal.
   * Beyond window → the button is greyed, but tapping is still allowed for
   * soft-flag behaviour (not yet wired; modal is honest no-op for now).
   */
  const handleReverse = useCallback((row: ActivityRowT) => {
    setReverseModalRow(row);
  }, []);

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <TopAppBar title={titleText} subtitle={strings.activity.title.toUpperCase() + ' · PROOF'} />

      {/* Filter chip panel */}
      <View style={s.filterPanel}>
        {/* Row 1: date */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipRow}
        >
          {DATE_CHIPS.map((d) => (
            <FilterChip key={d} label={d} active={dateChip === d} onPress={() => setDateChip(d)} />
          ))}
        </ScrollView>

        {/* Row 2: site — populated from Today data; falls back to "All sites" only
            while Today is still loading. Real siteId UUIDs are used as filter values. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipRow}
        >
          {siteChipOptions.map((opt) => (
            <FilterChip
              key={opt.id}
              label={opt.name}
              active={siteChipId === opt.id}
              onPress={() => setSiteChipId(opt.id)}
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
            <FilterChip key={k} label={k} active={kindChip === k} onPress={() => setKindChip(k)} />
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
              <EventRow
                key={row.id}
                row={row}
                expanded={expandedRowId === row.id}
                onToggle={() => handleRowToggle(row.id)}
                onShare={() => handleShare(row)}
                onReverse={() => handleReverse(row)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <ReverseModal row={reverseModalRow} onClose={() => setReverseModalRow(null)} />
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
