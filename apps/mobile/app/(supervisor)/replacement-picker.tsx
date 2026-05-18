/**
 * ReplacementPicker (F28) — single-recipient cover-invite surface.
 *
 * Wave 1 mobile surface for the master plan's PUBG-invite pattern, simplified
 * to single-recipient per the founder lock
 * (`feedback_replacement_invite_single_recipient.md`, 2026-05-18). The
 * supervisor picks ONE candidate worker from their portfolio, sends a 2-minute
 * invite, watches the live countdown, and either sees an ACCEPTED outcome
 * (auto-creates assignment via the Wave 1 backend service) or sees the
 * DECLINED / EXPIRED / CANCELLED outcome and tries someone else.
 *
 * Route params (typed via `useLocalSearchParams`):
 *   - `siteId` (required) — the site for which cover is needed.
 *   - `scheduledStart` (required) — ISO datetime of the shift start.
 *   - `visitId` (optional) — the Visit row, when one exists (no-show /
 *     mid-shift cover). May be omitted (multi-day leave coverage flow has
 *     no Visit row yet).
 *   - `originalWorkerUserId` (optional) — the worker being replaced.
 *     Excluded from the candidate list and used for the "Replacing for"
 *     context strip.
 *   - `siteName` (optional) — display label for the context strip.
 *   - `originalWorkerName` (optional) — display label for the context strip.
 *
 * Layout (R6-faithful per `docs/prototypes/supervisor-mobile-r6/project/src/replacement-picker.jsx`):
 *
 *   STAGE: "pick" (default)
 *     TopAppBar (eyebrow REPLACEMENT + title "Pick someone to cover" + close)
 *     Context strip — site name · scheduled start · "Replacing for: <name>"
 *     Search field — client-side filter over the small portfolio list
 *     FlatList of candidate rows — avatar/initial + name + current-site / not-assigned
 *
 *   STAGE: "confirm"
 *     Bottom-sheet modal — "Send invite to <Name>?" + 2-min countdown explainer
 *     + Cancel / Send invite buttons. Send button triggers
 *     `useSendReplacementInvite()` which generates a fresh UUID v4
 *     `Idempotency-Key` per user action (NOT per render).
 *
 *   STAGE: "waiting"
 *     Live 2-minute countdown via Reanimated `useSharedValue` driven by
 *     `requestAnimationFrame` on the UI thread. JS state updates only happen
 *     when the wall-clock crosses an outcome boundary (PENDING → ACCEPTED /
 *     DECLINED / EXPIRED / CANCELLED), which the 5s `refetchInterval` polling
 *     on `useReplacementInviteOutcome` reveals. The countdown does NOT
 *     `setState` every second — there is no JS-thread setInterval rendering.
 *     Cancel button calls `useCancelReplacementInvite()`.
 *
 *   STAGE: "outcome"
 *     ACCEPTED → success card + "Back to Today" → router.back()
 *     DECLINED / EXPIRED → outcome card + "Try someone else" → STAGE pick
 *     CANCELLED → outcome card + "Back to Today"
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 * @derives(master-plan §P.4 — ReplacementInvite)
 * @derives(feedback_replacement_invite_single_recipient.md)
 * @derives(feedback_play_store_quality_no_lag_no_jank.md)
 * @derives(feedback_40_year_team_world_domination_quality_bar.md)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ListRenderItem,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { tokens } from '@axhy/ui-tokens';
import type { ReplacementInviteRowT, TodayWorkerT } from '@axhy/shared-schema';

import { useTodayQuery } from '../../lib/queries/use-today';
import {
  useCancelReplacementInvite,
  useReplacementInviteOutcome,
  useSendReplacementInvite,
} from '../../lib/queries/use-replacement-invites';
import { useLocaleStrings } from '../../lib/i18n/use-locale';

// ─── Route params ────────────────────────────────────────────────────────────

type PickerParams = {
  siteId?: string;
  scheduledStart?: string;
  visitId?: string;
  originalWorkerUserId?: string;
  siteName?: string;
  originalWorkerName?: string;
};

// ─── Stage discriminator ─────────────────────────────────────────────────────

type Stage =
  | { kind: 'pick' }
  | { kind: 'confirm'; candidate: CandidateRow }
  | { kind: 'waiting'; invite: ReplacementInviteRowT; candidate: CandidateRow }
  | { kind: 'outcome'; invite: ReplacementInviteRowT; candidate: CandidateRow };

// ─── Candidate row shape ─────────────────────────────────────────────────────

/**
 * A candidate is one of this supervisor's portfolio workers, with enough
 * context (current site for the day, if any) to help the supervisor pick.
 *
 * @derives(master-plan §P.4)
 */
type CandidateRow = {
  /** Worker UUID (matches `User.id` and is the backend's `candidateUserId`). */
  userId: string;
  name: string;
  /** Current-site context — null when the worker is not on any site today. */
  currentSiteId: string | null;
  /** Current-site display name (looked up from TodaySite). */
  currentSiteName: string | null;
};

// ─── Pre-Reanimated initials helper ──────────────────────────────────────────

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

function formatMmSs(remainingMs: number): string {
  const safe = Math.max(0, Math.floor(remainingMs / 1000));
  const mm = Math.floor(safe / 60)
    .toString()
    .padStart(2, '0');
  const ss = (safe % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

// ─── Screen ──────────────────────────────────────────────────────────────────

/** @derives(master-plan §G) — supervisor surface */
export default function ReplacementPickerScreen() {
  const params = useLocalSearchParams<PickerParams>();
  const strings = useLocaleStrings();
  const today = useTodayQuery();
  const sendMutation = useSendReplacementInvite();
  const cancelMutation = useCancelReplacementInvite();

  const [stage, setStage] = useState<Stage>({ kind: 'pick' });
  const [search, setSearch] = useState('');

  // Cluster D fix (QA-rewalk 2026-05-18): derive human-readable
  // context from the Today query when the route only carries IDs.
  // The picker was reporting B2-11 ("ignores URL params") because the
  // QA test passed `siteId` + `originalWorkerUserId` but not the
  // pre-formatted `siteName` / `originalWorkerName` strings — the
  // ContextStrip rendered null. Now we fall back to the Today data.
  const resolvedSiteName = useMemo(() => {
    if (params.siteName) return params.siteName;
    if (!params.siteId || !today.data) return null;
    const site = today.data.sites.find((s) => s.id === params.siteId);
    return site?.name ?? null;
  }, [params.siteId, params.siteName, today.data]);

  const resolvedOriginalWorkerName = useMemo(() => {
    if (params.originalWorkerName) return params.originalWorkerName;
    if (!params.originalWorkerUserId || !today.data) return null;
    const worker = today.data.workers.find((w) => w.id === params.originalWorkerUserId);
    return worker?.name ?? null;
  }, [params.originalWorkerUserId, params.originalWorkerName, today.data]);

  // Build candidate list out of the supervisor's Today portfolio. This bounds
  // the list to one supervisor's reachable workers (usually 25–80) so the
  // FlatList stays buttery; cross-portfolio invites are out of scope.
  const candidates = useMemo<CandidateRow[]>(() => {
    if (!today.data) return [];
    const siteNameById = new Map<string, string>();
    for (const s of today.data.sites) siteNameById.set(s.id, s.name);
    const seen = new Set<string>();
    const rows: CandidateRow[] = [];
    for (const w of today.data.workers) {
      if (params.originalWorkerUserId && w.id === params.originalWorkerUserId) continue;
      if (seen.has(w.id)) continue;
      seen.add(w.id);
      rows.push({
        userId: w.id,
        name: w.name,
        currentSiteId: w.siteId,
        currentSiteName: siteNameById.get(w.siteId) ?? null,
      });
    }
    // Stable sort by name so the list doesn't shuffle between refetches.
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return rows;
  }, [today.data, params.originalWorkerUserId]);

  const filteredCandidates = useMemo<CandidateRow[]>(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => c.name.toLowerCase().includes(q));
  }, [candidates, search]);

  // ── Handlers (stable refs so FlatList rows don't re-render on parent state) ─

  const handleClose = useCallback(() => {
    router.back();
  }, []);

  const handlePickCandidate = useCallback((candidate: CandidateRow) => {
    setStage({ kind: 'confirm', candidate });
  }, []);

  const handleCancelConfirm = useCallback(() => {
    setStage({ kind: 'pick' });
  }, []);

  const handleSend = useCallback(
    async (candidate: CandidateRow) => {
      if (!params.siteId || !params.scheduledStart) return;
      try {
        const res = await sendMutation.mutateAsync({
          siteId: params.siteId,
          scheduledStart: params.scheduledStart,
          candidateUserId: candidate.userId,
          visitId: params.visitId ?? null,
        });
        setStage({ kind: 'waiting', invite: res.invite, candidate });
      } catch {
        // Error renders inline in the confirm sheet via mutation.isError.
      }
    },
    [params.siteId, params.scheduledStart, params.visitId, sendMutation],
  );

  const handleCancelInvite = useCallback(
    async (invite: ReplacementInviteRowT, candidate: CandidateRow) => {
      try {
        await cancelMutation.mutateAsync({ inviteId: invite.id });
        // Move to a synthetic CANCELLED outcome immediately — the backend
        // returns { ok: true } and the next poll will reflect the row.
        setStage({
          kind: 'outcome',
          invite: { ...invite, status: 'CANCELLED' },
          candidate,
        });
      } catch {
        // surface inline via mutation.isError
      }
    },
    [cancelMutation],
  );

  const handleTryAnother = useCallback(() => {
    setStage({ kind: 'pick' });
  }, []);

  // ── FlatList row renderer (stable identity) ────────────────────────────────

  const renderItem = useCallback<ListRenderItem<CandidateRow>>(
    ({ item }) => (
      <CandidateListRow candidate={item} strings={strings} onPress={handlePickCandidate} />
    ),
    [handlePickCandidate, strings],
  );

  const keyExtractor = useCallback((item: CandidateRow) => item.userId, []);

  // ── Screen ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right', 'bottom']}>
      <TopBar
        eyebrow={strings.replacement.eyebrow}
        title={strings.replacement.title}
        onClose={handleClose}
      />
      <ContextStrip
        siteName={resolvedSiteName}
        scheduledStart={params.scheduledStart ?? null}
        replacingForLabel={
          resolvedOriginalWorkerName
            ? strings.replacement.replacingFor(resolvedOriginalWorkerName)
            : null
        }
      />

      <View style={s.searchWrap}>
        <Feather name="search" size={16} color={tokens.color.ink.tertiary} style={s.searchIcon} />
        <TextInput
          style={s.searchInput}
          placeholder={strings.replacement.searchPlaceholder}
          placeholderTextColor={tokens.color.ink.placeholder}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          autoCapitalize="none"
          accessibilityLabel={strings.replacement.searchPlaceholder}
        />
      </View>

      {today.isLoading ? (
        <View style={s.centered}>
          <ActivityIndicator color={tokens.color.brand.accent} />
        </View>
      ) : today.isError ? (
        <View style={s.errorCard}>
          <Text style={s.errorBody}>{strings.replacement.genericError}</Text>
        </View>
      ) : filteredCandidates.length === 0 ? (
        <View style={s.emptyCard}>
          <Text style={s.emptyBody}>{strings.replacement.noCandidates}</Text>
        </View>
      ) : (
        <FlatList
          data={filteredCandidates}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={s.listContent}
          initialNumToRender={12}
          maxToRenderPerBatch={16}
          windowSize={9}
          removeClippedSubviews
        />
      )}

      {/* Confirm sheet */}
      <ConfirmSheet
        visible={stage.kind === 'confirm'}
        candidate={stage.kind === 'confirm' ? stage.candidate : null}
        strings={strings}
        sending={sendMutation.isPending}
        errorMessage={
          sendMutation.isError
            ? (sendMutation.error?.message ?? strings.replacement.genericError)
            : null
        }
        onCancel={handleCancelConfirm}
        onSend={handleSend}
      />

      {/* Waiting modal */}
      <WaitingModal
        visible={stage.kind === 'waiting'}
        invite={stage.kind === 'waiting' ? stage.invite : null}
        candidate={stage.kind === 'waiting' ? stage.candidate : null}
        strings={strings}
        cancelling={cancelMutation.isPending}
        onCancelInvite={handleCancelInvite}
        onTerminalStatus={(latest) => {
          if (stage.kind !== 'waiting') return;
          setStage({ kind: 'outcome', invite: latest, candidate: stage.candidate });
        }}
      />

      {/* Outcome modal */}
      <OutcomeModal
        visible={stage.kind === 'outcome'}
        invite={stage.kind === 'outcome' ? stage.invite : null}
        candidate={stage.kind === 'outcome' ? stage.candidate : null}
        strings={strings}
        onBackToToday={handleClose}
        onTryAnother={handleTryAnother}
      />
    </SafeAreaView>
  );
}

// ─── TopBar ──────────────────────────────────────────────────────────────────

type TopBarProps = { eyebrow: string; title: string; onClose: () => void };

function TopBar({ eyebrow, title, onClose }: TopBarProps) {
  return (
    <View style={s.topBar}>
      <View style={{ flex: 1 }}>
        <Text style={s.eyebrow}>{eyebrow}</Text>
        <Text style={s.title} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <Pressable
        onPress={onClose}
        style={({ pressed }) => [s.closeButton, pressed ? s.pressed : null]}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Feather name="x" size={22} color={tokens.color.ink.secondary} />
      </Pressable>
    </View>
  );
}

// ─── Context strip ───────────────────────────────────────────────────────────

type ContextStripProps = {
  siteName: string | null;
  scheduledStart: string | null;
  replacingForLabel: string | null;
};

function ContextStrip({ siteName, scheduledStart, replacingForLabel }: ContextStripProps) {
  const startLabel = scheduledStart ? formatShiftLabel(scheduledStart) : null;
  return (
    <View style={s.contextStrip}>
      {siteName ? <Text style={s.contextSite}>{siteName}</Text> : null}
      {startLabel ? <Text style={s.contextShift}>{startLabel}</Text> : null}
      {replacingForLabel ? <Text style={s.contextReplacing}>{replacingForLabel}</Text> : null}
    </View>
  );
}

function formatShiftLabel(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString([], {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return iso;
  }
}

// ─── CandidateListRow (memoised) ─────────────────────────────────────────────

type CandidateListRowProps = {
  candidate: CandidateRow;
  strings: ReturnType<typeof useLocaleStrings>;
  onPress: (candidate: CandidateRow) => void;
};

const CandidateListRow = (function buildCandidateListRow() {
  // Defined inline so the memo + stable ref live next to the row markup.
  const Component = ({ candidate, strings, onPress }: CandidateListRowProps) => {
    const handlePress = useCallback(() => onPress(candidate), [candidate, onPress]);
    const meta = candidate.currentSiteName
      ? strings.replacement.onSite(candidate.currentSiteName)
      : strings.replacement.notAssignedToday;
    const initials = initialsOf(candidate.name);
    return (
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [s.row, pressed ? s.pressed : null]}
        accessibilityRole="button"
        accessibilityLabel={`${candidate.name}, ${meta}`}
      >
        <View style={s.avatar}>
          <Text style={s.avatarText}>{initials}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.rowName} numberOfLines={1}>
            {candidate.name}
          </Text>
          <Text style={s.rowMeta} numberOfLines={1}>
            {meta}
          </Text>
        </View>
        <Feather name="chevron-right" size={18} color={tokens.color.ink.tertiary} />
      </Pressable>
    );
  };
  return Component;
})();

// ─── Confirm sheet (bottom modal) ────────────────────────────────────────────

type ConfirmSheetProps = {
  visible: boolean;
  candidate: CandidateRow | null;
  strings: ReturnType<typeof useLocaleStrings>;
  sending: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onSend: (candidate: CandidateRow) => void;
};

function ConfirmSheet({
  visible,
  candidate,
  strings,
  sending,
  errorMessage,
  onCancel,
  onSend,
}: ConfirmSheetProps) {
  if (!candidate) {
    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
        <Pressable style={s.backdrop} onPress={onCancel} />
      </Modal>
    );
  }
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={s.backdrop} onPress={onCancel}>
        <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>{strings.replacement.confirmTitle(candidate.name)}</Text>
          <Text style={s.sheetBody}>{strings.replacement.confirmBody}</Text>
          {errorMessage ? <Text style={s.sheetError}>{errorMessage}</Text> : null}
          <View style={s.sheetActions}>
            <Pressable
              style={({ pressed }) => [s.secondaryButton, pressed ? s.pressed : null]}
              onPress={onCancel}
              disabled={sending}
              accessibilityRole="button"
            >
              <Text style={s.secondaryButtonText}>{strings.common.cancel}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                s.primaryButton,
                pressed ? s.pressed : null,
                sending ? s.primaryButtonDisabled : null,
              ]}
              onPress={() => onSend(candidate)}
              disabled={sending}
              accessibilityRole="button"
            >
              {sending ? (
                <ActivityIndicator color={tokens.color.surface.card} />
              ) : (
                <>
                  <Feather name="send" size={16} color={tokens.color.surface.card} />
                  <Text style={s.primaryButtonText}>{strings.replacement.confirmSend}</Text>
                </>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Waiting modal (Reanimated countdown + 5s poll for outcome) ──────────────

type WaitingModalProps = {
  visible: boolean;
  invite: ReplacementInviteRowT | null;
  candidate: CandidateRow | null;
  strings: ReturnType<typeof useLocaleStrings>;
  cancelling: boolean;
  onCancelInvite: (invite: ReplacementInviteRowT, candidate: CandidateRow) => void;
  onTerminalStatus: (latest: ReplacementInviteRowT) => void;
};

function WaitingModal({
  visible,
  invite,
  candidate,
  strings,
  cancelling,
  onCancelInvite,
  onTerminalStatus,
}: WaitingModalProps) {
  if (!invite || !candidate) {
    return (
      <Modal visible={visible} transparent animationType="fade">
        <View style={s.backdrop} />
      </Modal>
    );
  }
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={s.fullScreenModal}>
        <WaitingBody
          invite={invite}
          candidate={candidate}
          strings={strings}
          cancelling={cancelling}
          onCancelInvite={onCancelInvite}
          onTerminalStatus={onTerminalStatus}
        />
      </View>
    </Modal>
  );
}

type WaitingBodyProps = {
  invite: ReplacementInviteRowT;
  candidate: CandidateRow;
  strings: ReturnType<typeof useLocaleStrings>;
  cancelling: boolean;
  onCancelInvite: (invite: ReplacementInviteRowT, candidate: CandidateRow) => void;
  onTerminalStatus: (latest: ReplacementInviteRowT) => void;
};

function WaitingBody({
  invite,
  candidate,
  strings,
  cancelling,
  onCancelInvite,
  onTerminalStatus,
}: WaitingBodyProps) {
  const expiresAtMs = useMemo(() => new Date(invite.expiresAt).getTime(), [invite.expiresAt]);
  const totalMs = useMemo(() => {
    const sentAtMs = new Date(invite.sentAt).getTime();
    return Math.max(1, expiresAtMs - sentAtMs);
  }, [invite.sentAt, expiresAtMs]);

  // Second-precision countdown via standard React state — Reanimated worklets
  // are not enabled in this project's babel config (per chat-upgrades-mobile
  // done-memo § Q-3). 1Hz updates are enough for a 2-minute mm:ss display;
  // the progress bar uses RN's built-in Animated.Value with native driver
  // so the bar itself decays smoothly even though the label ticks per-second.
  const [labelMmSs, setLabelMmSs] = useState<string>(() =>
    formatMmSs(Math.max(0, expiresAtMs - Date.now())),
  );
  useEffect(() => {
    const tick = (): void => {
      const left = Math.max(0, expiresAtMs - Date.now());
      setLabelMmSs(formatMmSs(left));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAtMs]);

  // Smooth bar decay — Animated.Value runs on UI thread via useNativeDriver
  // for the opacity-equivalent of width via interpolation. RN doesn't allow
  // useNativeDriver:true for width directly; use a transform scaleX trick
  // anchored at the left edge for the same visual result.
  const progressAnim = useRef(
    new Animated.Value(Math.max(0, Math.min(1, (expiresAtMs - Date.now()) / totalMs))),
  ).current;
  useEffect(() => {
    progressAnim.stopAnimation();
    Animated.timing(progressAnim, {
      toValue: 0,
      duration: Math.max(0, expiresAtMs - Date.now()),
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
    return () => {
      progressAnim.stopAnimation();
    };
  }, [expiresAtMs, progressAnim]);

  const barAnimatedStyle = {
    transform: [
      { translateX: progressAnim.interpolate({ inputRange: [0, 1], outputRange: [-200, 0] }) },
    ],
  };

  // Outcome poll — 5s while PENDING, frozen on terminal state.
  const outcomeQuery = useReplacementInviteOutcome(invite.id);
  useEffect(() => {
    const latest = outcomeQuery.data;
    if (!latest) return;
    if (latest.status !== 'PENDING') {
      onTerminalStatus(latest);
    }
  }, [outcomeQuery.data, onTerminalStatus]);

  // Local expiry hand-off — if the JS clock has crossed expiresAt but the
  // backend hasn't swept yet, surface EXPIRED to the user so they're never
  // staring at a stuck "0:00" countdown. The next poll will reconcile the
  // canonical respondReason / respondedAt.
  useEffect(() => {
    if (Date.now() < expiresAtMs) {
      const ms = expiresAtMs - Date.now();
      const timer = setTimeout(() => {
        if (outcomeQuery.data && outcomeQuery.data.status !== 'PENDING') return;
        onTerminalStatus({ ...invite, status: 'EXPIRED' });
      }, ms + 500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [expiresAtMs, invite, outcomeQuery.data, onTerminalStatus]);

  return (
    <View style={s.waitingCard}>
      <View style={s.waitingAvatar}>
        <Text style={s.waitingAvatarText}>{initialsOf(candidate.name)}</Text>
      </View>
      <Text style={s.waitingTitle}>{strings.replacement.waitingTitle(candidate.name)}</Text>
      <Text style={s.waitingSubtitle}>{strings.replacement.waitingSubtitle(labelMmSs)}</Text>

      <View style={s.progressTrack}>
        <Animated.View style={[s.progressFill, barAnimatedStyle]} />
      </View>

      <Pressable
        style={({ pressed }) => [s.secondaryButtonWide, pressed ? s.pressed : null]}
        onPress={() => onCancelInvite(invite, candidate)}
        disabled={cancelling}
        accessibilityRole="button"
      >
        {cancelling ? (
          <ActivityIndicator color={tokens.color.ink.primary} />
        ) : (
          <Text style={s.secondaryButtonText}>{strings.replacement.cancelInvite}</Text>
        )}
      </Pressable>
    </View>
  );
}

// ─── Outcome modal ───────────────────────────────────────────────────────────

type OutcomeModalProps = {
  visible: boolean;
  invite: ReplacementInviteRowT | null;
  candidate: CandidateRow | null;
  strings: ReturnType<typeof useLocaleStrings>;
  onBackToToday: () => void;
  onTryAnother: () => void;
};

function OutcomeModal({
  visible,
  invite,
  candidate,
  strings,
  onBackToToday,
  onTryAnother,
}: OutcomeModalProps) {
  if (!invite || !candidate) {
    return (
      <Modal visible={visible} transparent animationType="fade">
        <View style={s.backdrop} />
      </Modal>
    );
  }
  const isAccepted = invite.status === 'ACCEPTED';
  const title = (() => {
    switch (invite.status) {
      case 'ACCEPTED':
        return strings.replacement.acceptedTitle(candidate.name);
      case 'DECLINED':
        return strings.replacement.declinedTitle(candidate.name);
      case 'EXPIRED':
        return strings.replacement.expiredTitle(candidate.name);
      case 'CANCELLED':
        return strings.replacement.cancelledTitle(candidate.name);
      case 'PENDING':
        return strings.replacement.waitingTitle(candidate.name);
      default:
        return candidate.name;
    }
  })();
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={s.fullScreenModal}>
        <View style={s.outcomeCard}>
          <View style={[s.outcomeIcon, isAccepted ? s.outcomeIconOk : s.outcomeIconBad]}>
            <Feather
              name={isAccepted ? 'check' : 'alert-circle'}
              size={28}
              color={tokens.color.surface.card}
            />
          </View>
          <Text style={s.outcomeTitle}>{title}</Text>
          {isAccepted ? (
            <Text style={s.outcomeBody}>{strings.replacement.acceptedBody}</Text>
          ) : null}

          {isAccepted ? (
            <Pressable
              style={({ pressed }) => [s.primaryButtonWide, pressed ? s.pressed : null]}
              onPress={onBackToToday}
              accessibilityRole="button"
            >
              <Text style={s.primaryButtonText}>{strings.replacement.backToToday}</Text>
            </Pressable>
          ) : invite.status === 'CANCELLED' ? (
            <Pressable
              style={({ pressed }) => [s.primaryButtonWide, pressed ? s.pressed : null]}
              onPress={onBackToToday}
              accessibilityRole="button"
            >
              <Text style={s.primaryButtonText}>{strings.replacement.backToToday}</Text>
            </Pressable>
          ) : (
            <>
              <Pressable
                style={({ pressed }) => [s.primaryButtonWide, pressed ? s.pressed : null]}
                onPress={onTryAnother}
                accessibilityRole="button"
              >
                <Text style={s.primaryButtonText}>{strings.replacement.tryAnother}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.secondaryButtonWide, pressed ? s.pressed : null]}
                onPress={onBackToToday}
                accessibilityRole="button"
              >
                <Text style={s.secondaryButtonText}>{strings.replacement.backToToday}</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surface.paper },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.surface.cardEdge,
    backgroundColor: tokens.color.surface.paper,
    gap: 8,
  },
  eyebrow: {
    fontSize: 11,
    fontFamily: tokens.font.mono,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.brand.accent,
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
  },
  closeButton: {
    padding: 8,
    borderRadius: tokens.radius.r2,
  },
  pressed: { opacity: 0.7 },
  contextStrip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.surface.cardEdge,
    backgroundColor: tokens.color.surface.card,
    gap: 2,
  },
  contextSite: {
    fontSize: 14,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
  },
  contextShift: {
    fontSize: 11,
    fontFamily: tokens.font.mono,
    color: tokens.color.ink.tertiary,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  contextReplacing: {
    fontSize: 12,
    color: tokens.color.ink.secondary,
    marginTop: 4,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.color.surface.card,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.surface.cardEdge,
    paddingHorizontal: 12,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: tokens.color.ink.primary,
    paddingVertical: 12,
  },
  listContent: {
    paddingVertical: 8,
    paddingHorizontal: 0,
    paddingBottom: 96,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.surface.cardEdge,
    backgroundColor: tokens.color.surface.card,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.color.surface.paper3,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.ink.secondary,
  },
  rowName: {
    fontSize: 14,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
  },
  rowMeta: {
    fontSize: 11,
    color: tokens.color.ink.tertiary,
    marginTop: 2,
    fontFamily: tokens.font.mono,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  errorCard: {
    margin: 14,
    padding: 14,
    backgroundColor: tokens.color.semantic.badSoft,
    borderLeftColor: tokens.color.semantic.bad,
    borderLeftWidth: 4,
    borderRadius: tokens.radius.r2,
  },
  errorBody: {
    fontSize: 13,
    color: tokens.color.ink.primary,
  },
  emptyCard: {
    margin: 14,
    padding: 18,
    backgroundColor: tokens.color.surface.card,
    borderRadius: tokens.radius.r3,
    borderColor: tokens.color.surface.cardEdge,
    borderWidth: 1,
  },
  emptyBody: {
    fontSize: 13,
    color: tokens.color.ink.secondary,
  },
  // Confirm sheet
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(20, 16, 12, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: tokens.color.surface.card,
    borderTopLeftRadius: tokens.radius.r4,
    borderTopRightRadius: tokens.radius.r4,
    paddingHorizontal: tokens.space[5],
    paddingTop: tokens.space[3],
    paddingBottom: tokens.space[7],
  },
  sheetHandle: {
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.color.surface.paper3,
    alignSelf: 'center',
    marginBottom: tokens.space[3],
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    marginBottom: tokens.space[2],
  },
  sheetBody: {
    fontSize: 13,
    color: tokens.color.ink.secondary,
    lineHeight: 19,
    marginBottom: tokens.space[4],
  },
  sheetError: {
    fontSize: 12,
    color: tokens.color.semantic.bad,
    marginBottom: tokens.space[3],
  },
  sheetActions: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: tokens.radius.r3,
    backgroundColor: tokens.color.brand.accent,
  },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.surface.card,
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: tokens.radius.r3,
    backgroundColor: tokens.color.surface.paper2,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.secondary,
  },
  // Waiting modal
  fullScreenModal: {
    flex: 1,
    backgroundColor: 'rgba(20, 16, 12, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  waitingCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: tokens.color.surface.card,
    borderRadius: tokens.radius.r4,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  waitingAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: tokens.color.surface.paper3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitingAvatarText: {
    fontSize: 22,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.ink.secondary,
  },
  waitingTitle: {
    fontSize: 16,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    textAlign: 'center',
  },
  waitingSubtitle: {
    fontSize: 12,
    fontFamily: tokens.font.mono,
    color: tokens.color.ink.tertiary,
    letterSpacing: 0.4,
  },
  progressTrack: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: tokens.color.surface.paper2,
    overflow: 'hidden',
    marginVertical: 6,
  },
  progressFill: {
    height: '100%',
    backgroundColor: tokens.color.brand.accent,
  },
  secondaryButtonWide: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: tokens.radius.r3,
    backgroundColor: tokens.color.surface.paper2,
  },
  primaryButtonWide: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: tokens.radius.r3,
    backgroundColor: tokens.color.brand.accent,
  },
  // Outcome modal
  outcomeCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: tokens.color.surface.card,
    borderRadius: tokens.radius.r4,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  outcomeIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outcomeIconOk: { backgroundColor: tokens.color.semantic.ok },
  outcomeIconBad: { backgroundColor: tokens.color.semantic.warn },
  outcomeTitle: {
    fontSize: 17,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    textAlign: 'center',
  },
  outcomeBody: {
    fontSize: 13,
    color: tokens.color.ink.secondary,
    textAlign: 'center',
    marginBottom: 4,
  },
});

// ─── Re-export for tests + consumers ─────────────────────────────────────────

/** Worker-row → picker prefill shape — used by Today's long-press handler. */
export type ReplacementPickerWorkerInput = Pick<TodayWorkerT, 'id' | 'name' | 'siteId'>;
