/**
 * Activity tab — supervisor's recent actions feed.
 *
 * R6-faithful implementation: eyebrow "ACTIVITY · PROOF", count in title,
 * three rows of filter chips (date / site / kind), per-row Feather icon,
 * right-aligned HH:MM mono timestamp, SITE · REASON meta line.
 *
 * Tapping a row expands an action drawer with two buttons:
 *   - Share to WhatsApp — opens wa.me deeplink with composed message text.
 *   - Reverse — always tappable; the server decides if the window is open.
 *
 * Reverse flow (Wave 4 compliance, 2026-05-18; server-authority C-C 2026-06-11):
 *   - Reversible kind → typed-phrase ("REVERSE") confirmation sheet → POST
 *     /activity/:id/reverse. Backend dispatches the per-kind compensating
 *     writer (ATTENDANCE_REVERSED, LEAVE_REVERSED, …). If the backend answers
 *     WINDOW_CLOSED, the client hands off to the HR sheet for the same row.
 *   - Non-reversible kind → plain "Send to HR for review?" sheet → POST
 *     /activity/:id/soft-flag. Backend creates a LATE_REVERSAL_REQUEST
 *     SupervisorDecision row HR will surface in the HR portal once it lands.
 *   The client no longer computes the 30-min window (timezone-naive math used
 *   to false-close it on IST devices); the server is the sole authority.
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
 * @derives(2026-05-18-supervisor-30-day-real-life-simulation-v2.md §3 Wave 4)
 */

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';
import type { ActivityRowT } from '@axhy/shared-schema';
import { isReversibleActivityKind } from '@axhy/shared-schema';

import { TopAppBar } from '../../components/today/TopAppBar';
import { ApiError } from '../../lib/api';
import { useActivityQuery } from '../../lib/queries/use-activity';
import { useTodayQuery } from '../../lib/queries/use-today';
import { useReverseActivity, useSoftFlagActivity } from '../../lib/queries/use-activity-reverse';
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
// Soft-flag (HR-review) sheet — why the supervisor landed there
// ---------------------------------------------------------------------------

/**
 * Why the HR-review sheet opened. The server is the sole authority on the
 * 30-min window, so the client never decides "window closed" itself — it
 * either knows the kind has no direct undo, or it heard WINDOW_CLOSED back
 * from the reverse attempt. The reason drives honest sheet copy.
 */
type SoftFlagReason = 'window-closed' | 'needs-hr';

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
  onSharePress: () => void;
  onReversePress: () => void;
};

/**
 * Two-button drawer that appears below an expanded activity row. Both
 * buttons are always active. The server is the sole authority on whether a
 * reverse is still allowed, so the client never greys Reverse on its own —
 * timezone-naive client math used to false-grey it and dead-end the
 * supervisor (C-C, supervisor walk 2026-06-11). Tapping Reverse routes to
 * the right sheet by kind, and falls back to the HR sheet if the server
 * says the window has closed (see handleReverse / submitReverse).
 */
function ActionDrawer({ onSharePress, onReversePress }: ActionDrawerProps) {
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

      {/* Reverse — always active; the backend decides if the window is open */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Reverse this action"
        onPress={onReversePress}
        style={({ pressed }) => [drawerS.btn, pressed && drawerS.btnPressed]}
      >
        <Feather name="rotate-ccw" size={13} color={tokens.color.semantic.warn} />
        <View style={drawerS.reverseLabelWrap}>
          <Text style={[drawerS.btnLabel, drawerS.reverseLabelActive]}>REVERSE</Text>
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
 *
 * Wrapped in React.memo so FlatList cells don't re-render when a sibling
 * row's expanded state changes.
 *
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */
const EventRow = memo(function EventRow({
  row,
  expanded,
  onToggle,
  onShare,
  onReverse,
}: EventRowProps) {
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

      {expanded && <ActionDrawer onSharePress={onShare} onReversePress={onReverse} />}
    </View>
  );
});

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
// ReverseConfirmModal — typed-phrase confirmation for in-window reverse
// ---------------------------------------------------------------------------

const REVERSE_PHRASE = 'REVERSE';

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
type ReverseConfirmModalProps = {
  row: ActivityRowT | null;
  isPending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (row: ActivityRowT) => void;
};

/**
 * Typed-phrase confirmation for the in-window Reverse action.
 * The supervisor must type "REVERSE" before the submit button enables —
 * Reverse is state-destructive (undoes an Attendance, LeaveRequest,
 * Assignment, or ReplacementInvite acceptance), so the typed-phrase guard
 * mirrors the EMPLOYMENT-tier DecisionCard discipline.
 */
function ReverseConfirmModal({
  row,
  isPending,
  error,
  onClose,
  onSubmit,
}: ReverseConfirmModalProps) {
  const [phrase, setPhrase] = useState('');

  // Reset typed phrase every time the modal opens on a new row.
  useEffect(() => {
    if (row) setPhrase('');
  }, [row?.id]);

  const matches = phrase.trim().toUpperCase() === REVERSE_PHRASE;
  const canSubmit = matches && !isPending && row !== null;

  const handleSubmit = () => {
    if (!row || !canSubmit) return;
    onSubmit(row);
  };

  const handleBackdropClose = () => {
    if (isPending) return;
    onClose();
  };

  const summary = row?.summary ?? '';

  return (
    <Modal
      visible={row !== null}
      transparent
      animationType="fade"
      onRequestClose={handleBackdropClose}
      statusBarTranslucent
    >
      <Pressable style={modalS.backdrop} onPress={handleBackdropClose} accessibilityLabel="Close">
        <Pressable
          style={modalS.sheet}
          onPress={() => {
            /* absorb tap */
          }}
        >
          <Text style={modalS.eyebrowDanger}>REVERSE ACTION</Text>
          <Text style={modalS.title}>Reverse this action?</Text>
          <Text style={modalS.body}>{summary}</Text>
          <Text style={modalS.bodyMuted}>
            This undoes the underlying change (attendance, leave, assignment, or replacement
            acceptance). Audit trail records both the original action and the reversal.
          </Text>

          <Text style={modalS.fieldLabel}>Type REVERSE to confirm</Text>
          <TextInput
            value={phrase}
            onChangeText={setPhrase}
            placeholder="REVERSE"
            placeholderTextColor={tokens.color.ink.placeholder}
            autoCapitalize="characters"
            autoCorrect={false}
            style={[modalS.input, matches && modalS.inputMatches]}
            editable={!isPending}
            accessibilityLabel="Type REVERSE to confirm"
            maxLength={32}
          />

          {error !== null && (
            <View style={modalS.errorCard}>
              <Text style={modalS.errorText}>{error}</Text>
            </View>
          )}

          <View style={modalS.btnRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={handleBackdropClose}
              disabled={isPending}
              style={({ pressed }) => [modalS.btn, modalS.btnCancel, pressed && modalS.btnPressed]}
            >
              <Text style={modalS.btnCancelLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isPending ? 'Reversing…' : 'Reverse'}
              accessibilityState={{ disabled: !canSubmit }}
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={({ pressed }) => [
                modalS.btn,
                canSubmit ? modalS.btnDanger : modalS.btnDisabled,
                pressed && canSubmit && modalS.btnPressed,
              ]}
            >
              <Text style={canSubmit ? modalS.btnDangerLabel : modalS.btnDisabledLabel}>
                {isPending ? 'Reversing…' : 'Reverse'}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// SoftFlagConfirmModal — plain confirmation for beyond-window soft-flag
// ---------------------------------------------------------------------------

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
type SoftFlagConfirmModalProps = {
  row: ActivityRowT | null;
  reason: SoftFlagReason;
  isPending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (row: ActivityRowT, note: string | null) => void;
};

/**
 * Plain confirmation sheet for the HR-review (soft-flag) action. Optional
 * free-form note is forwarded to HR. No typed-phrase guard — soft-flag is
 * non-destructive (just creates an HR-review row). Copy is parameterized by
 * `reason` so the sheet never claims "window closed" when the real reason is
 * a kind that has no direct undo at all (C-C, supervisor walk 2026-06-11).
 */
function SoftFlagConfirmModal({
  row,
  reason,
  isPending,
  error,
  onClose,
  onSubmit,
}: SoftFlagConfirmModalProps) {
  const [note, setNote] = useState('');
  useEffect(() => {
    if (row) setNote('');
  }, [row?.id]);

  const handleSubmit = () => {
    if (!row || isPending) return;
    const trimmed = note.trim();
    onSubmit(row, trimmed.length > 0 ? trimmed : null);
  };

  const handleBackdropClose = () => {
    if (isPending) return;
    onClose();
  };

  const summary = row?.summary ?? '';

  // Honest copy per arrival reason — the server, not the client, decided the
  // window was closed; for a non-reversible kind there was never a window.
  const eyebrow = reason === 'window-closed' ? 'WINDOW CLOSED · HR REVIEW' : 'HR REVIEW';
  const explainer =
    reason === 'window-closed'
      ? 'The 30-minute undo window has passed. HR will see this in their queue and decide whether to apply the reversal.'
      : "This kind of action can't be undone directly. HR will see this in their queue and decide what to do.";

  return (
    <Modal
      visible={row !== null}
      transparent
      animationType="fade"
      onRequestClose={handleBackdropClose}
      statusBarTranslucent
    >
      <Pressable style={modalS.backdrop} onPress={handleBackdropClose} accessibilityLabel="Close">
        <Pressable
          style={modalS.sheet}
          onPress={() => {
            /* absorb tap */
          }}
        >
          <Text style={modalS.eyebrowWarn}>{eyebrow}</Text>
          <Text style={modalS.title}>Send to HR for review?</Text>
          <Text style={modalS.body}>{summary}</Text>
          <Text style={modalS.bodyMuted}>{explainer}</Text>

          <Text style={modalS.fieldLabel}>Optional note for HR</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="(optional) Add context for HR"
            placeholderTextColor={tokens.color.ink.placeholder}
            multiline
            numberOfLines={3}
            style={modalS.inputMulti}
            editable={!isPending}
            accessibilityLabel="Optional note for HR"
            maxLength={1000}
          />

          {error !== null && (
            <View style={modalS.errorCard}>
              <Text style={modalS.errorText}>{error}</Text>
            </View>
          )}

          <View style={modalS.btnRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={handleBackdropClose}
              disabled={isPending}
              style={({ pressed }) => [modalS.btn, modalS.btnCancel, pressed && modalS.btnPressed]}
            >
              <Text style={modalS.btnCancelLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isPending ? 'Sending…' : 'Send to HR'}
              accessibilityState={{ disabled: isPending }}
              onPress={handleSubmit}
              disabled={isPending}
              style={({ pressed }) => [modalS.btn, modalS.btnOk, pressed && modalS.btnPressed]}
            >
              <Text style={modalS.btnOkLabel}>{isPending ? 'Sending…' : 'Send to HR'}</Text>
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
  btnDanger: {
    backgroundColor: tokens.color.semantic.bad,
  },
  btnDangerLabel: {
    fontSize: 14,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.surface.card,
  },
  btnDisabled: {
    backgroundColor: tokens.color.surface.paper3,
    opacity: 0.6,
  },
  btnDisabledLabel: {
    fontSize: 14,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.tertiary,
  },
  eyebrowDanger: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.semantic.bad,
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  eyebrowWarn: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.semantic.warn,
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  bodyMuted: {
    fontSize: 13,
    color: tokens.color.ink.tertiary,
    lineHeight: 13 * 1.45,
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.ink.tertiary,
    letterSpacing: 1.0,
    marginTop: 4,
    marginBottom: 6,
  },
  input: {
    backgroundColor: tokens.color.surface.paper2,
    borderColor: tokens.color.surface.cardEdge,
    borderWidth: 1,
    borderRadius: tokens.radius.r3,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: tokens.color.ink.primary,
    fontFamily: tokens.font.mono,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  inputMatches: {
    borderColor: tokens.color.semantic.ok,
  },
  inputMulti: {
    backgroundColor: tokens.color.surface.paper2,
    borderColor: tokens.color.surface.cardEdge,
    borderWidth: 1,
    borderRadius: tokens.radius.r3,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: tokens.color.ink.primary,
    minHeight: 64,
    textAlignVertical: 'top',
    marginBottom: 6,
  },
  errorCard: {
    marginTop: 6,
    marginBottom: 12,
    padding: 10,
    borderRadius: tokens.radius.r2,
    backgroundColor: tokens.color.semantic.badSoft,
    borderLeftWidth: 4,
    borderLeftColor: tokens.color.semantic.bad,
  },
  errorText: {
    fontSize: 13,
    color: tokens.color.ink.primary,
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
 * Reverse taps route by KIND (the server owns the window):
 *   - reversible kind     → ReverseConfirmModal (typed-phrase); falls back
 *                           to the HR sheet if the server says WINDOW_CLOSED
 *   - non-reversible kind → SoftFlagConfirmModal (HR review, its only path)
 *
 * Filter chips are fully wired to the backend via `useActivityQuery`.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 * @derives(2026-05-18-supervisor-30-day-real-life-simulation-v2.md §3 Wave 4)
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

  // Reverse modal — holds the row whose typed-phrase confirm sheet is open.
  const [reverseRow, setReverseRow] = useState<ActivityRowT | null>(null);
  // Soft-flag modal — holds the row whose HR-review confirm sheet is open.
  const [softFlagRow, setSoftFlagRow] = useState<ActivityRowT | null>(null);
  // Why the HR sheet opened — drives its copy. Always set before the sheet
  // is shown (kind-needs-HR at route time, or window-closed on reverse error).
  const [softFlagReason, setSoftFlagReason] = useState<SoftFlagReason>('window-closed');

  const reverseMutation = useReverseActivity();
  const softFlagMutation = useSoftFlagActivity();

  // Cluster 2 fix (QA-rewalk 2026-05-18): distinguish "loading"
  // (q.data === undefined) from "loaded with 0 events" so the header
  // doesn't lie with "0 events" before the query lands.
  const rows = q.data?.rows ?? [];
  const titleText =
    q.data === undefined ? 'Activity' : rows.length === 1 ? '1 event' : `${rows.length} events`;

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
   * Routes a Reverse tap to the right confirmation sheet — by KIND only.
   * The server owns the 30-min window, so the client no longer computes it:
   *   - Reversible kind   → ReverseConfirmModal (typed-phrase). If the server
   *     then says the window has closed, submitReverse hands off to the HR
   *     sheet for the same row.
   *   - Non-reversible kind → SoftFlagConfirmModal directly (HR is its only
   *     path), with honest "can't be undone directly" copy.
   */
  const handleReverse = useCallback((row: ActivityRowT) => {
    if (isReversibleActivityKind(row.kind)) {
      setReverseRow(row);
    } else {
      setSoftFlagReason('needs-hr');
      setSoftFlagRow(row);
    }
  }, []);

  const submitReverse = useCallback(
    (row: ActivityRowT) => {
      reverseMutation.mutate(
        { auditEventId: row.id },
        {
          onSuccess: () => {
            setReverseRow(null);
          },
          onError: (err) => {
            // The server is the sole window authority. If it says the window
            // has closed, hand the supervisor straight to the HR sheet for the
            // same row instead of leaving them at a dead end. Any other error
            // stays visible in the Reverse sheet via its error prop.
            if (err instanceof ApiError && err.code === 'WINDOW_CLOSED') {
              reverseMutation.reset();
              setReverseRow(null);
              setSoftFlagReason('window-closed');
              setSoftFlagRow(row);
            }
          },
        },
      );
    },
    [reverseMutation],
  );

  const submitSoftFlag = useCallback(
    (row: ActivityRowT, note: string | null) => {
      softFlagMutation.mutate(
        { auditEventId: row.id, note },
        {
          onSuccess: () => {
            setSoftFlagRow(null);
          },
        },
      );
    },
    [softFlagMutation],
  );

  const closeReverseModal = useCallback(() => {
    if (reverseMutation.isPending) return;
    setReverseRow(null);
    reverseMutation.reset();
  }, [reverseMutation]);

  const closeSoftFlagModal = useCallback(() => {
    if (softFlagMutation.isPending) return;
    setSoftFlagRow(null);
    softFlagMutation.reset();
  }, [softFlagMutation]);

  /** Stable renderItem for FlatList — won't change identity between renders. */
  const renderItem = useCallback(
    ({ item }: { item: ActivityRowT }) => (
      <EventRow
        row={item}
        expanded={expandedRowId === item.id}
        onToggle={() => handleRowToggle(item.id)}
        onShare={() => handleShare(item)}
        onReverse={() => handleReverse(item)}
      />
    ),
    [expandedRowId, handleRowToggle, handleShare, handleReverse],
  );

  /** keyExtractor kept stable — row ids are UUIDs from backend. */
  const keyExtractor = useCallback((item: ActivityRowT) => item.id, []);

  /**
   * ListHeaderComponent — filter chip panel + loading/error/empty states.
   * Sits above the virtualized row list; chip state updates here only,
   * not in every row.
   */
  const listHeader = useMemo(
    () => (
      <>
        {/* Filter chip panel. QA-round3 R3-08: added WHEN/WHERE/WHAT eyebrows
            so Suresh can see at a glance which row belongs to which filter
            group instead of guessing the boundaries. */}
        <View style={s.filterPanel}>
          {/* Row 1: WHEN (date) */}
          <Text style={s.filterEyebrow}>WHEN</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.chipRow}
          >
            {DATE_CHIPS.map((d) => (
              <FilterChip
                key={d}
                label={d}
                active={dateChip === d}
                onPress={() => setDateChip(d)}
              />
            ))}
          </ScrollView>

          {/* Row 2: WHERE (site) — populated from Today data; falls back to "All sites" only
              while Today is still loading. Real siteId UUIDs are used as filter values. */}
          <Text style={s.filterEyebrow}>WHERE</Text>
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

          {/* Row 3: WHAT (kind) */}
          <Text style={s.filterEyebrow}>WHAT</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.chipRow}
          >
            {KIND_CHIPS.map((k) => (
              <FilterChip
                key={k}
                label={k}
                active={kindChip === k}
                onPress={() => setKindChip(k)}
              />
            ))}
          </ScrollView>
        </View>

        {/* Loading / error / empty feedback — sits above row list */}
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
        ) : null}
      </>
    ),
    // Re-run when chip state, loading state, or rows-empty state changes.
    [dateChip, siteChipId, kindChip, siteChipOptions, q.isLoading, q.isError, q.error, rows.length],
  );

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <TopAppBar title={titleText} subtitle={strings.activity.title.toUpperCase() + ' · LOG'} />

      <FlatList
        data={rows}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        contentContainerStyle={s.scroll}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={5}
        refreshControl={
          <RefreshControl
            refreshing={q.isFetching && !q.isLoading}
            onRefresh={onRefresh}
            tintColor={tokens.color.brand.accent}
          />
        }
      />

      <ReverseConfirmModal
        row={reverseRow}
        isPending={reverseMutation.isPending}
        error={reverseMutation.error instanceof Error ? reverseMutation.error.message : null}
        onClose={closeReverseModal}
        onSubmit={submitReverse}
      />
      <SoftFlagConfirmModal
        row={softFlagRow}
        reason={softFlagReason}
        isPending={softFlagMutation.isPending}
        error={softFlagMutation.error instanceof Error ? softFlagMutation.error.message : null}
        onClose={closeSoftFlagModal}
        onSubmit={submitSoftFlag}
      />
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
    // Escape the FlatList contentContainerStyle's paddingHorizontal:14 so
    // the chip rows still span full width (chips self-pad via s.chipRow).
    marginHorizontal: -14,
    marginTop: -14,
    marginBottom: 14,
  },
  chipRow: {
    flexDirection: 'row',
    gap: tokens.space[1],
    paddingHorizontal: 14,
    paddingVertical: 2,
  },
  filterEyebrow: {
    fontSize: tokens.type.caption.size,
    fontFamily: tokens.font.mono,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.ink.tertiary,
    letterSpacing: tokens.type.caption.size * 0.08,
    textTransform: 'uppercase',
    paddingHorizontal: 14,
    marginTop: tokens.space[1],
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
