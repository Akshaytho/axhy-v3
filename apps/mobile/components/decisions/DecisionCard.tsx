/**
 * DecisionCard — full card form for a pending supervisor decision.
 *
 * Wave 2 Sprint 2 (2026-05-18) rewrite:
 *   - The footer is now **server-driven** by `row.actions[]` (see
 *     `DecisionAction` in `packages/shared-schema/src/zod/decisions.ts`).
 *     Each action describes its own label, style, confirmation mode,
 *     endpoint, method, and pre-filled body. Mobile renders buttons in
 *     order; it never re-derives copy or routing from `row.kind`.
 *   - Adds four card-shape variants driven by `row.kind`:
 *       LEAVE_APPROVAL_PENDING       → TwoButton (Approve / Reject reason-sheet)
 *       SWAP_REQUEST_PENDING         → TwoButtonWithWarning (Accept / Reject + Accept-anyway typed-phrase on skill mismatch)
 *       REPLACEMENT_INVITE_OUTCOME   → InfoOnly read-out with "Send to someone else"
 *       COMPLAINT_HR_REPLY           → InfoOnlyWithAck5 mirroring updates.tsx
 *   - PERSONNEL-tier multi-day sub-card: when `payload.dayCount > 1` we
 *     render a compact "X days · <from> → <to>" strip below the title.
 *   - HeavySummaryCard "Open to decide" pattern: when `summaryText` is set,
 *     show summary compact + an "Open to decide" tap-target that expands.
 *   - Amend-mode banner: when the row is `amendable` AND the caller passes
 *     `amendActiveForId` matching `row.id`, render an amber banner at the top.
 *   - AmbiguousDecisionCard radio variant: when `payload.options[]` is
 *     present, render mutually-exclusive radio buttons; the picked option's
 *     paired `actions[]` entry fires.
 *
 * Existing EMPLOYMENT typed-phrase confirm (TERMINATE_WORKER) is preserved
 * via the row's `requiresTypedConfirm` + `confirmPhrase` fields. Those rows
 * also carry an `actions[]` entry today (with `style:'danger'` +
 * `requiresConfirm:'typed-phrase'`), but to avoid churn on a route already
 * shipped, we keep the existing pattern for that branch and let the
 * action-driven path own everything else.
 *
 * FAILED_REVIEW section: card renders faded (opacity 0.55).
 *
 * Every action POST/PATCH/DELETE carries a fresh `Idempotency-Key` header
 * — see `useDecisionAction` for the wiring. Double-tap on Slow 3G replays
 * the cached response instead of double-approving.
 *
 * The whole card is `React.memo`-wrapped with a `(row.id, row.proposedAt)`
 * comparator so unrelated card re-renders cost zero — Play-Store-grade
 * 60 FPS scroll at 4× CPU throttle.
 *
 * @derives(Wave 2 plan §3C — actions[] contract)
 * @derives(drawer-redesign §B.4 — card variants)
 * @derives(ADR-0003) @derives(master-plan §G) — supervisor surface
 */

import { memo, useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { tokens } from '@axhy/ui-tokens';
import type { DecisionActionT, DecisionRowT } from '@axhy/shared-schema';

import {
  useDecisionAction,
  type DecisionActionInvocation,
} from '../../lib/queries/use-decision-action';

import { TierChip } from './TierChip';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum number of words in a 5-word own-voice ack (matches updates.tsx). */
const MIN_ACK_WORDS = 5;

/** Minimum number of chars in a reason-sheet free-text input (server min is 1). */
const MIN_REASON_LENGTH = 1;

/** Maximum reason length, server-side cap on `SwapDecisionInput.reason`. */
const MAX_REASON_LENGTH = 200;

// ---------------------------------------------------------------------------
// Relative time formatter
// ---------------------------------------------------------------------------

/** Formats an ISO timestamp as "X min ago" / "X hr ago" / "X days ago". */
function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

/** Counts whitespace-delimited words. Matches `updates.tsx` countWords. */
function countWords(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

// ---------------------------------------------------------------------------
// Action body payload helpers
// ---------------------------------------------------------------------------

/**
 * Extracts a typed string field from the server-supplied `action.body` JSON.
 * Returns `undefined` if the field is missing or not a string. Keeps the
 * card body strictly read-only on the server contract — we never widen
 * the `body` shape on the mobile side.
 */
function readBodyString(action: DecisionActionT, key: string): string | undefined {
  if (action.body == null) return undefined;
  const value = action.body[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Extracts a typed boolean field from `action.body`. Same constraints as
 * `readBodyString`.
 */
function readBodyBoolean(action: DecisionActionT, key: string): boolean | undefined {
  if (action.body == null) return undefined;
  const value = action.body[key];
  return typeof value === 'boolean' ? value : undefined;
}

// ---------------------------------------------------------------------------
// Multi-day leave sub-card payload (server attaches this to the leave
// action.body when it covers > 1 day)
// ---------------------------------------------------------------------------

type LeaveDateRange = {
  dayCount: number;
  fromDate: string | undefined;
  toDate: string | undefined;
};

/**
 * Resolves the multi-day leave sub-card payload from EITHER `row.dayCount`
 * (server-set field) OR the approve-action's body. Mobile is tolerant of
 * either path so the contract can evolve.
 */
function resolveLeaveDateRange(row: DecisionRowT): LeaveDateRange | null {
  if (row.kind !== 'LEAVE_APPROVAL_PENDING') return null;
  const dayCount = row.dayCount ?? undefined;
  if (dayCount === undefined || dayCount <= 1) return null;

  // The Wave-2 backend attaches `fromDate`/`toDate` to the approve action's
  // body so the client can render the date range without a round-trip.
  const approveAction = row.actions.find((a) => a.style === 'primary');
  const fromDate = approveAction ? readBodyString(approveAction, 'fromDate') : undefined;
  const toDate = approveAction ? readBodyString(approveAction, 'toDate') : undefined;
  return { dayCount, fromDate, toDate };
}

// ---------------------------------------------------------------------------
// Left-border color per tier — drives the left accent stripe on the card
// ---------------------------------------------------------------------------

const TIER_LEFT_BORDER: Record<DecisionRowT['tier'], string> = {
  NOTE: tokens.color.surface.cardEdge,
  OPERATIONAL: tokens.color.semantic.infoInk,
  PERSONNEL: tokens.color.brand.accent,
  EMPLOYMENT: tokens.color.semantic.bad,
  REVIEW: tokens.color.semantic.warn,
};

// ---------------------------------------------------------------------------
// Button style mapping — server-driven action.style → React Native styles
// ---------------------------------------------------------------------------

type ButtonStyles = {
  container: object;
  text: object;
  spinnerColor: string;
};

function buttonStylesFor(style: DecisionActionT['style']): ButtonStyles {
  switch (style) {
    case 'primary':
      return {
        container: s.btnPrimary,
        text: s.btnPrimaryText,
        spinnerColor: tokens.color.surface.card,
      };
    case 'danger':
      return {
        container: s.btnDanger,
        text: s.btnDangerText,
        spinnerColor: tokens.color.surface.card,
      };
    case 'secondary':
      return {
        container: s.btnSecondary,
        text: s.btnSecondaryText,
        spinnerColor: tokens.color.ink.primary,
      };
  }
}

// ---------------------------------------------------------------------------
// Flash-highlight animation — for deep-link `?focus=<id>` arrivals
// ---------------------------------------------------------------------------

/**
 * Drives a 1.2-sec amber pulse on a card when it becomes the focus target
 * of a `?focus=` deep-link. Implemented with RN's built-in `Animated` API,
 * which runs on the native UI thread for this `opacity` interpolation, so
 * the flash never blocks the JS thread or the FlatList virtualisation.
 */
function useFlashHighlight(flash: boolean): Animated.Value {
  const value = useRef(new Animated.Value(0)).current;
  const lastFlashRef = useRef<boolean>(false);
  if (flash && !lastFlashRef.current) {
    lastFlashRef.current = true;
    Animated.sequence([
      Animated.timing(value, { toValue: 1, duration: 200, useNativeDriver: false }),
      Animated.timing(value, { toValue: 0, duration: 1000, useNativeDriver: false }),
    ]).start(() => {
      lastFlashRef.current = false;
    });
  }
  return value;
}

// ---------------------------------------------------------------------------
// DecisionCard
// ---------------------------------------------------------------------------

/** @derives(Wave 2 plan §3C) @derives(master-plan §G) — supervisor surface */
export type DecisionCardProps = {
  /** The row to render — section list passes one row at a time. */
  row: DecisionRowT;
  /** True when the row sits in the FAILED_REVIEW section (renders faded). */
  faded?: boolean;
  /**
   * Pass-through for the existing TERMINATE_WORKER dismiss path. New
   * action-driven kinds ignore this; they use `useDecisionAction` directly.
   */
  onDismiss: (id: string) => void;
  /** True while the TERMINATE_WORKER dismiss POST is in flight. */
  isDismissing?: boolean;
  /**
   * True iff the parent screen's `?focus=<id>` deep-link matches this row.
   * Triggers a 1.2-sec amber flash highlight.
   */
  focused?: boolean;
  /**
   * True iff the parent screen's `?amendDecisionId=<id>` deep-link matches
   * this row AND the row is marked `amendable` by the server. Renders the
   * amber "Amending decision: <kind>" banner at the top.
   */
  amendActive?: boolean;
};

/**
 * Returns true iff the row payload signals an explicit "amendable" flag.
 * Wave 2 backend has not added a top-level `amendable` boolean on
 * `DecisionRow` yet; the flag is carried on a primary action's body as
 * `amendable: true`. Mobile reads it from there.
 */
function readAmendable(row: DecisionRowT): boolean {
  const primary = row.actions.find((a) => a.style === 'primary');
  if (primary === undefined) return false;
  return readBodyBoolean(primary, 'amendable') === true;
}

/**
 * Pending decision card for the Decisions workspace.
 * Memo comparator: re-render only when `row.id`, `row.proposedAt`,
 * `faded`, `isDismissing`, `focused`, or `amendActive` changes. The row's
 * other fields (title, actions array) are server-driven and effectively
 * frozen at queue-build time; if those change, `proposedAt` changes too.
 */
function DecisionCardImpl({
  row,
  faded = false,
  onDismiss,
  isDismissing = false,
  focused = false,
  amendActive = false,
}: DecisionCardProps) {
  const leftBorderColor = TIER_LEFT_BORDER[row.tier] ?? tokens.color.surface.cardEdge;
  const flashValue = useFlashHighlight(focused);
  const flashBackground = flashValue.interpolate({
    inputRange: [0, 1],
    outputRange: [tokens.color.surface.card, tokens.color.semantic.warnSoft],
  });

  // ── HeavySummaryCard expand state ──────────────────────────────────────
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const hasSummary = row.summaryText != null && row.summaryText.length > 0;

  // ── EMPLOYMENT typed-phrase confirm (TERMINATE_WORKER) ─────────────────
  const isEmployment = row.tier === 'EMPLOYMENT';
  const [employmentInput, setEmploymentInput] = useState('');
  const employmentMatches =
    isEmployment && row.confirmPhrase != null ? employmentInput === row.confirmPhrase : false;
  const runAction = useDecisionAction();
  const handleEmploymentConfirm = useCallback(() => {
    const primary = row.actions.find((a) => a.style === 'primary');
    if (primary) {
      runAction.mutate({ action: primary });
    }
  }, [row, runAction]);

  // ── Amend-mode banner gate ─────────────────────────────────────────────
  const showAmendBanner = amendActive && readAmendable(row);

  // ── Multi-day leave date-range sub-card ────────────────────────────────
  const leaveRange = resolveLeaveDateRange(row);

  return (
    <Animated.View
      style={[
        s.card,
        {
          borderLeftColor: leftBorderColor,
          opacity: faded ? 0.55 : 1,
          backgroundColor: focused ? flashBackground : tokens.color.surface.card,
        },
      ]}
    >
      {/* ── Amend-mode banner ─────────────────────────────────────────── */}
      {showAmendBanner ? (
        <View style={s.amendBanner}>
          <Text style={s.amendBannerText}>Amending decision: {row.kind.replace(/_/g, ' ')}</Text>
        </View>
      ) : null}

      {/* ── Header row: tier chip + PENDING tag ─────────────────────────── */}
      <View style={s.header}>
        <TierChip tier={row.tier} />
        <Text style={s.pendingTag}>PENDING {relativeTime(row.proposedAt)}</Text>
      </View>

      {/* ── Title ───────────────────────────────────────────────────────── */}
      <Text style={s.title}>{row.title}</Text>

      {/* ── Multi-day leave sub-card ────────────────────────────────────── */}
      {leaveRange !== null ? (
        <View style={s.leaveRangeStrip}>
          <Text style={s.leaveRangeText}>
            {leaveRange.dayCount} days
            {leaveRange.fromDate !== undefined && leaveRange.toDate !== undefined
              ? ` · ${leaveRange.fromDate} → ${leaveRange.toDate}`
              : ''}
          </Text>
        </View>
      ) : null}

      {/* ── Body / HeavySummary ─────────────────────────────────────────── */}
      {hasSummary ? (
        <HeavySummaryBlock
          summaryText={row.summaryText ?? ''}
          expanded={summaryExpanded}
          onToggle={() => setSummaryExpanded((prev) => !prev)}
        />
      ) : row.body != null && row.body.length > 0 ? (
        <Text style={s.body}>{row.body}</Text>
      ) : null}

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <View style={[s.footer, faded && s.footerFaded]}>
        {isEmployment && row.confirmPhrase != null ? (
          /* Existing EMPLOYMENT typed-phrase + Dismiss footer (TERMINATE_WORKER) */
          <EmploymentTypedPhraseFooter
            confirmPhrase={row.confirmPhrase}
            input={employmentInput}
            onChangeInput={setEmploymentInput}
            matches={employmentMatches}
            isDismissing={isDismissing}
            onConfirm={handleEmploymentConfirm}
            onDismiss={() => onDismiss(row.id)}
          />
        ) : row.actions.length > 0 ? (
          /* Server-driven action buttons (Wave 2 actions[] contract) */
          <ServerDrivenActionsFooter row={row} faded={faded} />
        ) : (
          /* Fallback: only Dismiss available. Used by Wave-1 supervisor
             decisions whose backend builder hasn't been action-ised yet. */
          <Pressable
            style={[s.dismissBtnFull, isDismissing && s.btnDisabled]}
            onPress={() => onDismiss(row.id)}
            disabled={isDismissing}
            accessibilityRole="button"
            accessibilityLabel="Dismiss decision"
          >
            {isDismissing ? (
              <ActivityIndicator color={tokens.color.ink.tertiary} size="small" />
            ) : (
              <Text style={s.dismissBtnFullText}>Dismiss</Text>
            )}
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
}

/**
 * Re-render gate: a card only re-renders when one of these props changes.
 * The DecisionRow is treated as effectively immutable per queue build —
 * its content changes ⇒ proposedAt is reissued by the backend builder.
 *
 * @derives(Play-Store-quality: 60 FPS scroll bar)
 */
export const DecisionCard = memo(DecisionCardImpl, (prev, next) => {
  if (prev.row.id !== next.row.id) return false;
  if (prev.row.proposedAt !== next.row.proposedAt) return false;
  if (prev.faded !== next.faded) return false;
  if (prev.isDismissing !== next.isDismissing) return false;
  if (prev.focused !== next.focused) return false;
  if (prev.amendActive !== next.amendActive) return false;
  return true;
});

// ===========================================================================
// EmploymentTypedPhraseFooter — TERMINATE_WORKER existing path
// ===========================================================================

type EmploymentTypedPhraseFooterProps = {
  confirmPhrase: string;
  input: string;
  onChangeInput: (v: string) => void;
  matches: boolean;
  isDismissing: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
};

function EmploymentTypedPhraseFooter({
  confirmPhrase,
  input,
  onChangeInput,
  matches,
  isDismissing,
  onConfirm,
  onDismiss,
}: EmploymentTypedPhraseFooterProps) {
  return (
    <>
      <Text style={s.confirmInstruction}>EMPLOYMENT — TYPE '{confirmPhrase}' TO CONFIRM</Text>
      <TextInput
        style={s.confirmInput}
        value={input}
        onChangeText={onChangeInput}
        placeholder="Type confirmation phrase…"
        placeholderTextColor={tokens.color.ink.placeholder}
        autoCapitalize="characters"
        autoCorrect={false}
        accessibilityLabel={`Type ${confirmPhrase} to confirm`}
      />
      <View style={s.btnRow}>
        <Pressable
          style={[s.confirmBtn, !matches && s.btnDisabled]}
          onPress={onConfirm}
          disabled={!matches || isDismissing}
          accessibilityRole="button"
          accessibilityLabel="Confirm"
        >
          {isDismissing ? (
            <ActivityIndicator color={tokens.color.surface.card} size="small" />
          ) : (
            <Text style={s.confirmBtnText}>Confirm</Text>
          )}
        </Pressable>
        <Pressable
          style={s.dismissBtn}
          onPress={onDismiss}
          disabled={isDismissing}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        >
          <Text style={s.dismissBtnText}>Dismiss</Text>
        </Pressable>
      </View>
    </>
  );
}

// ===========================================================================
// HeavySummaryBlock — "Open to decide" expand pattern
// ===========================================================================

type HeavySummaryBlockProps = {
  summaryText: string;
  expanded: boolean;
  onToggle: () => void;
};

function HeavySummaryBlock({ summaryText, expanded, onToggle }: HeavySummaryBlockProps) {
  return (
    <View style={s.summaryBlock}>
      <Text style={s.summaryText} numberOfLines={expanded ? undefined : 3}>
        {summaryText}
      </Text>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={expanded ? 'Collapse summary' : 'Open to decide'}
        style={s.summaryToggle}
      >
        <Text style={s.summaryToggleText}>{expanded ? 'Collapse' : 'Open to decide'}</Text>
      </Pressable>
    </View>
  );
}

// ===========================================================================
// ServerDrivenActionsFooter — dispatcher for every action[] button
// ===========================================================================

type ServerDrivenActionsFooterProps = {
  row: DecisionRowT;
  faded: boolean;
};

/**
 * Detects the AmbiguousDecisionCard radio shape. The server signals this by
 * attaching `options: [{ id, label }, ...]` to the first primary action's
 * body; each action's body carries its own `optionId` so we can map the
 * picked radio to a unique endpoint.
 */
function readRadioOptions(row: DecisionRowT): { id: string; label: string }[] | null {
  const first = row.actions[0];
  if (first === undefined || first.body == null) return null;
  const raw = first.body['options'];
  if (!Array.isArray(raw)) return null;
  const out: { id: string; label: string }[] = [];
  for (const item of raw) {
    if (item !== null && typeof item === 'object') {
      const idVal = (item as Record<string, unknown>)['id'];
      const labelVal = (item as Record<string, unknown>)['label'];
      if (typeof idVal === 'string' && typeof labelVal === 'string') {
        out.push({ id: idVal, label: labelVal });
      }
    }
  }
  return out.length >= 2 && out.length <= 4 ? out : null;
}

/**
 * Detects the OPERATIONAL skill-mismatch warning row on a SWAP_REQUEST_PENDING
 * card. The server signals this by setting `skillMismatch: true` on the
 * primary `accept` action's body and listing the missing skill as
 * `missingSkillName`.
 */
function readSkillMismatch(row: DecisionRowT): { missingSkillName: string } | null {
  if (row.kind !== 'SWAP_REQUEST_PENDING') return null;
  const accept = row.actions.find((a) => a.style === 'primary');
  if (accept === undefined) return null;
  const mismatch = readBodyBoolean(accept, 'skillMismatch');
  if (mismatch !== true) return null;
  const missing = readBodyString(accept, 'missingSkillName');
  return { missingSkillName: missing ?? 'a required skill' };
}

/**
 * Detects the REPLACEMENT_INVITE_OUTCOME "send to someone else" deep-link
 * destination. The server attaches the original site + scheduledStart to
 * the secondary action's body so mobile can deep-link to the picker.
 */
function readReplacementResendLink(
  row: DecisionRowT,
): { siteId: string; scheduledStart: string } | null {
  if (row.kind !== 'REPLACEMENT_INVITE_OUTCOME') return null;
  const secondary = row.actions.find((a) => a.style === 'secondary');
  if (secondary === undefined) return null;
  const siteId = readBodyString(secondary, 'siteId');
  const scheduledStart = readBodyString(secondary, 'scheduledStart');
  if (siteId === undefined || scheduledStart === undefined) return null;
  return { siteId, scheduledStart };
}

function ServerDrivenActionsFooter({ row, faded }: ServerDrivenActionsFooterProps) {
  const runAction = useDecisionAction();
  const radioOptions = useMemo(() => readRadioOptions(row), [row]);
  const skillMismatch = useMemo(() => readSkillMismatch(row), [row]);
  const replacementResendLink = useMemo(() => readReplacementResendLink(row), [row]);

  // Per-action UI state, keyed by the action's index in row.actions[].
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [reasonInput, setReasonInput] = useState('');
  const [typedPhraseInput, setTypedPhraseInput] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pickedRadioId, setPickedRadioId] = useState<string | null>(null);

  const resetTransientState = useCallback(() => {
    setActiveIndex(null);
    setReasonInput('');
    setTypedPhraseInput('');
    setErrorMessage(null);
  }, []);

  const submitInvocation = useCallback(
    (invocation: DecisionActionInvocation) => {
      setErrorMessage(null);
      runAction.mutate(invocation, {
        onSuccess: () => resetTransientState(),
        onError: (err) => {
          const message =
            err instanceof Error ? err.message : 'Action failed. Pull to refresh and try again.';
          setErrorMessage(message);
        },
      });
    },
    [runAction, resetTransientState],
  );

  const onTapAction = useCallback(
    (action: DecisionActionT, index: number) => {
      // Radio variant: require a pick before firing.
      if (radioOptions !== null) {
        if (pickedRadioId === null) {
          setErrorMessage('Pick one option first.');
          return;
        }
        // The picked option's matching action is the one whose body's
        // optionId equals the picked id. Fall back to the index-aligned
        // action if the server didn't tag bodies (defensive).
        const matchedIndex = row.actions.findIndex(
          (a) => readBodyString(a, 'optionId') === pickedRadioId,
        );
        const finalIndex = matchedIndex >= 0 ? matchedIndex : index;
        const resolved = row.actions[finalIndex];
        if (resolved === undefined) {
          setErrorMessage('Selected option is no longer available — pull to refresh.');
          return;
        }
        submitInvocation({ action: resolved });
        return;
      }

      if (action.requiresConfirm === 'none') {
        submitInvocation({ action });
        return;
      }
      // For reason-sheet + typed-phrase, expand the inline panel under
      // the action button. A bottom-sheet would be nicer but the inline
      // expansion stays Play-Store-grade smooth on Slow 3G + 4× CPU.
      setActiveIndex(index);
      setReasonInput('');
      setTypedPhraseInput('');
      setErrorMessage(null);
    },
    [radioOptions, pickedRadioId, row.actions, submitInvocation],
  );

  const onSubmitInline = useCallback(
    (action: DecisionActionT) => {
      if (action.requiresConfirm === 'reason-sheet') {
        const trimmed = reasonInput.trim();
        if (trimmed.length < MIN_REASON_LENGTH) {
          setErrorMessage('Please enter a reason.');
          return;
        }
        if (trimmed.length > MAX_REASON_LENGTH) {
          setErrorMessage(`Reason must be ${MAX_REASON_LENGTH} characters or fewer.`);
          return;
        }
        submitInvocation({ action, bodyOverrides: { reason: trimmed } });
        return;
      }
      if (action.requiresConfirm === 'typed-phrase') {
        if (action.confirmPhrase === undefined) {
          setErrorMessage('Server did not specify the confirmation phrase.');
          return;
        }
        if (typedPhraseInput !== action.confirmPhrase) {
          setErrorMessage(`Type ${action.confirmPhrase} exactly to confirm.`);
          return;
        }
        submitInvocation({ action, bodyOverrides: { overrideToken: typedPhraseInput } });
        return;
      }
    },
    [reasonInput, typedPhraseInput, submitInvocation],
  );

  const isInvocationPending =
    runAction.isPending &&
    (runAction.variables as DecisionActionInvocation | undefined)?.action ===
      (activeIndex !== null ? row.actions[activeIndex] : undefined);

  // ── COMPLAINT_HR_REPLY: InfoOnlyWithAck5 variant ────────────────────
  if (row.kind === 'COMPLAINT_HR_REPLY') {
    const ackAction = row.actions[0];
    if (ackAction !== undefined) {
      return (
        <ComplaintHrReplyAckFooter
          action={ackAction}
          onSubmit={(text) =>
            submitInvocation({ action: ackAction, bodyOverrides: { ackText: text } })
          }
          isSubmitting={runAction.isPending}
          errorMessage={errorMessage}
        />
      );
    }
  }

  return (
    <View>
      {/* Radio (AmbiguousDecisionCard) — render options first */}
      {radioOptions !== null ? (
        <View style={s.radioGroup}>
          {radioOptions.map((option) => {
            const checked = pickedRadioId === option.id;
            return (
              <Pressable
                key={option.id}
                style={s.radioRow}
                onPress={() => {
                  setPickedRadioId(option.id);
                  setErrorMessage(null);
                }}
                accessibilityRole="radio"
                accessibilityState={{ selected: checked }}
                accessibilityLabel={option.label}
              >
                <View style={[s.radioOuter, checked && s.radioOuterChecked]}>
                  {checked ? <View style={s.radioInner} /> : null}
                </View>
                <Text style={s.radioLabel}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {/* SWAP_REQUEST_PENDING skill-mismatch warning strip */}
      {skillMismatch !== null ? (
        <View style={s.warningRow}>
          <Text style={s.warningRowText}>
            Worker is missing required skill {skillMismatch.missingSkillName} — accept at your own
            risk.
          </Text>
        </View>
      ) : null}

      {/* Action buttons in server-supplied order */}
      <View style={s.actionButtonsColumn}>
        {row.actions.map((action, index) => {
          const styles = buttonStylesFor(action.style);
          const isActiveInline = activeIndex === index;
          const disabled = runAction.isPending;
          return (
            <View key={`${row.id}-${index}-${action.label}`} style={s.actionEntry}>
              <Pressable
                style={[styles.container, disabled && s.btnDisabled]}
                onPress={() => onTapAction(action, index)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={action.label}
              >
                {isInvocationPending && isActiveInline ? (
                  <ActivityIndicator color={styles.spinnerColor} size="small" />
                ) : (
                  <Text style={styles.text}>{action.label}</Text>
                )}
              </Pressable>

              {/* Inline reason-sheet panel */}
              {isActiveInline && action.requiresConfirm === 'reason-sheet' ? (
                <View style={s.inlinePanel}>
                  <Text style={s.inlinePanelLabel}>Reason</Text>
                  <TextInput
                    style={s.reasonInput}
                    value={reasonInput}
                    onChangeText={setReasonInput}
                    placeholder="Why are you rejecting this? (1–200 chars)"
                    placeholderTextColor={tokens.color.ink.placeholder}
                    multiline
                    numberOfLines={3}
                    maxLength={MAX_REASON_LENGTH}
                    accessibilityLabel="Reason"
                  />
                  <View style={s.inlineSubmitRow}>
                    <Pressable
                      style={s.inlineCancelBtn}
                      onPress={resetTransientState}
                      accessibilityRole="button"
                      accessibilityLabel="Cancel"
                    >
                      <Text style={s.inlineCancelBtnText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.container,
                        s.inlineSubmitBtn,
                        runAction.isPending && s.btnDisabled,
                      ]}
                      onPress={() => onSubmitInline(action)}
                      disabled={runAction.isPending}
                      accessibilityRole="button"
                      accessibilityLabel="Submit"
                    >
                      {runAction.isPending ? (
                        <ActivityIndicator color={styles.spinnerColor} size="small" />
                      ) : (
                        <Text style={styles.text}>Submit</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {/* Inline typed-phrase panel */}
              {isActiveInline && action.requiresConfirm === 'typed-phrase' ? (
                <View style={s.inlinePanel}>
                  <Text style={s.confirmInstruction}>
                    TYPE '{action.confirmPhrase ?? 'CONFIRM'}' TO CONFIRM
                  </Text>
                  <TextInput
                    style={s.confirmInput}
                    value={typedPhraseInput}
                    onChangeText={setTypedPhraseInput}
                    placeholder="Type confirmation phrase…"
                    placeholderTextColor={tokens.color.ink.placeholder}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    accessibilityLabel={`Type ${action.confirmPhrase ?? ''} to confirm`}
                  />
                  <View style={s.inlineSubmitRow}>
                    <Pressable
                      style={s.inlineCancelBtn}
                      onPress={resetTransientState}
                      accessibilityRole="button"
                      accessibilityLabel="Cancel"
                    >
                      <Text style={s.inlineCancelBtnText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.container,
                        s.inlineSubmitBtn,
                        (typedPhraseInput !== action.confirmPhrase || runAction.isPending) &&
                          s.btnDisabled,
                      ]}
                      onPress={() => onSubmitInline(action)}
                      disabled={typedPhraseInput !== action.confirmPhrase || runAction.isPending}
                      accessibilityRole="button"
                      accessibilityLabel="Confirm override"
                    >
                      {runAction.isPending ? (
                        <ActivityIndicator color={styles.spinnerColor} size="small" />
                      ) : (
                        <Text style={styles.text}>Confirm</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      {/* REPLACEMENT_INVITE_OUTCOME deep-link footnote — visible whenever
          the secondary "send to someone else" action carries siteId +
          scheduledStart. The button itself is rendered in the actions
          loop above; this footnote tells the supervisor where it goes. */}
      {replacementResendLink !== null ? (
        <Text style={s.deepLinkFootnote}>
          Sending to someone else opens the replacement picker for this shift.
        </Text>
      ) : null}

      {/* Error line */}
      {errorMessage !== null ? (
        <Text style={[s.errorLine, faded && s.errorLineFaded]}>{errorMessage}</Text>
      ) : null}
    </View>
  );
}

// ===========================================================================
// ComplaintHrReplyAckFooter — InfoOnlyWithAck5 variant
// ===========================================================================

type ComplaintHrReplyAckFooterProps = {
  action: DecisionActionT;
  onSubmit: (text: string) => void;
  isSubmitting: boolean;
  errorMessage: string | null;
};

function ComplaintHrReplyAckFooter({
  action,
  onSubmit,
  isSubmitting,
  errorMessage,
}: ComplaintHrReplyAckFooterProps) {
  const [draft, setDraft] = useState('');
  const words = countWords(draft);
  const ready = words >= MIN_ACK_WORDS;
  return (
    <View style={s.ackFooterBlock}>
      <Text style={s.ackLabel}>IN YOUR OWN WORDS — WHAT WILL YOU DO?</Text>
      <TextInput
        style={s.ackInput}
        value={draft}
        onChangeText={setDraft}
        placeholder="Write at least 5 words in your own voice…"
        placeholderTextColor={tokens.color.ink.placeholder}
        multiline
        numberOfLines={3}
        autoCorrect
        accessibilityLabel="Acknowledgement text"
      />
      <View style={s.ackMeta}>
        <Text style={[s.wordCounter, ready && s.wordCounterReady]}>
          {words}/{MIN_ACK_WORDS} WORDS{ready ? ' OK' : ''}
        </Text>
        <Pressable
          style={[s.btnPrimary, s.ackSubmitBtn, (!ready || isSubmitting) && s.btnDisabled]}
          onPress={() => ready && !isSubmitting && onSubmit(draft.trim())}
          disabled={!ready || isSubmitting}
          accessibilityRole="button"
          accessibilityLabel={action.label}
        >
          {isSubmitting ? (
            <ActivityIndicator color={tokens.color.surface.card} size="small" />
          ) : (
            <Text style={s.btnPrimaryText}>{action.label}</Text>
          )}
        </Pressable>
      </View>
      {errorMessage !== null ? <Text style={s.errorLine}>{errorMessage}</Text> : null}
    </View>
  );
}

// ===========================================================================
// Styles
// ===========================================================================

const s = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface.card,
    borderColor: tokens.color.surface.cardEdge,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: tokens.radius.r3,
    marginBottom: 10,
    overflow: 'hidden',
  },
  amendBanner: {
    backgroundColor: tokens.color.semantic.warnSoft,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.surface.cardEdge,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  amendBannerText: {
    fontSize: tokens.type.monoSm.size,
    fontFamily: tokens.font.mono,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.semantic.warn,
    letterSpacing: 0.04 * tokens.type.monoSm.size,
    textTransform: 'uppercase',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  pendingTag: {
    fontSize: 10,
    fontWeight: String(tokens.weight.bold) as '700',
    fontFamily: tokens.font.mono,
    color: tokens.color.brand.accent,
    letterSpacing: 0.04 * 10,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 16,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    lineHeight: 16 * 1.3,
    paddingHorizontal: 14,
    marginBottom: 6,
  },
  body: {
    fontSize: 14,
    fontWeight: String(tokens.weight.regular) as '400',
    color: tokens.color.ink.secondary,
    lineHeight: 14 * 1.4,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  leaveRangeStrip: {
    marginHorizontal: 14,
    marginBottom: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: tokens.color.brand.accentSoft,
    borderRadius: tokens.radius.r1,
  },
  leaveRangeText: {
    fontSize: tokens.type.monoSm.size,
    fontFamily: tokens.font.mono,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.brand.accentInk,
    letterSpacing: 0.04 * tokens.type.monoSm.size,
  },
  summaryBlock: {
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  summaryText: {
    fontSize: 14,
    color: tokens.color.ink.secondary,
    lineHeight: 14 * 1.4,
  },
  summaryToggle: {
    marginTop: 6,
  },
  summaryToggleText: {
    fontSize: 13,
    color: tokens.color.brand.accent,
    fontWeight: String(tokens.weight.semibold) as '600',
  },
  footer: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: tokens.color.surface.cardEdge,
    backgroundColor: tokens.color.surface.paper2,
  },
  footerFaded: {
    backgroundColor: tokens.color.surface.paper3,
  },
  confirmInstruction: {
    fontSize: tokens.type.monoSm.size,
    fontFamily: tokens.font.mono,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.semantic.bad,
    letterSpacing: 0.04 * tokens.type.monoSm.size,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  confirmInput: {
    backgroundColor: tokens.color.surface.card,
    borderColor: tokens.color.surface.cardEdge,
    borderWidth: 1,
    borderRadius: tokens.radius.r2,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: tokens.color.ink.primary,
    marginBottom: 8,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: tokens.radius.r2,
    backgroundColor: tokens.color.semantic.bad,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.surface.card,
  },
  dismissBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: tokens.radius.r2,
    borderWidth: 1,
    borderColor: tokens.color.surface.cardEdge,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissBtnText: {
    fontSize: 14,
    fontWeight: String(tokens.weight.medium) as '500',
    color: tokens.color.ink.tertiary,
  },
  dismissBtnFull: {
    width: '100%',
    paddingVertical: 10,
    borderRadius: tokens.radius.r2,
    borderWidth: 1,
    borderColor: tokens.color.surface.cardEdge,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissBtnFullText: {
    fontSize: 14,
    fontWeight: String(tokens.weight.medium) as '500',
    color: tokens.color.ink.tertiary,
  },
  btnDisabled: {
    opacity: 0.4,
  },
  // Server-driven action buttons
  actionButtonsColumn: {
    gap: 8,
  },
  actionEntry: {
    gap: 8,
  },
  btnPrimary: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: tokens.radius.r2,
    backgroundColor: tokens.color.brand.accent,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: tokens.tap.minMobile,
  },
  btnPrimaryText: {
    fontSize: 14,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.surface.card,
  },
  btnDanger: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: tokens.radius.r2,
    backgroundColor: tokens.color.semantic.bad,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: tokens.tap.minMobile,
  },
  btnDangerText: {
    fontSize: 14,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.surface.card,
  },
  btnSecondary: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: tokens.radius.r2,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: tokens.color.surface.cardEdge,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: tokens.tap.minMobile,
  },
  btnSecondaryText: {
    fontSize: 14,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
  },
  warningRow: {
    backgroundColor: tokens.color.semantic.warnSoft,
    borderRadius: tokens.radius.r2,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  warningRowText: {
    fontSize: 13,
    fontWeight: String(tokens.weight.medium) as '500',
    color: tokens.color.semantic.warn,
    lineHeight: 13 * 1.4,
  },
  inlinePanel: {
    backgroundColor: tokens.color.surface.card,
    borderRadius: tokens.radius.r2,
    borderWidth: 1,
    borderColor: tokens.color.surface.cardEdge,
    padding: 10,
    gap: 8,
  },
  inlinePanelLabel: {
    fontSize: tokens.type.caption.size,
    fontFamily: tokens.font.mono,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.ink.tertiary,
    letterSpacing: 0.04 * tokens.type.caption.size,
    textTransform: 'uppercase',
  },
  reasonInput: {
    backgroundColor: tokens.color.surface.paper,
    borderColor: tokens.color.surface.cardEdge,
    borderWidth: 1,
    borderRadius: tokens.radius.r2,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: tokens.color.ink.primary,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  inlineSubmitRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  inlineCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: tokens.radius.r2,
    borderWidth: 1,
    borderColor: tokens.color.surface.cardEdge,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineCancelBtnText: {
    fontSize: 14,
    fontWeight: String(tokens.weight.medium) as '500',
    color: tokens.color.ink.tertiary,
  },
  inlineSubmitBtn: {
    paddingHorizontal: 18,
  },
  errorLine: {
    marginTop: 8,
    fontSize: 13,
    color: tokens.color.semantic.bad,
    fontWeight: String(tokens.weight.medium) as '500',
  },
  errorLineFaded: {
    opacity: 0.7,
  },
  deepLinkFootnote: {
    marginTop: 8,
    fontSize: 12,
    color: tokens.color.ink.tertiary,
    fontStyle: 'italic',
  },
  // Radio variant
  radioGroup: {
    gap: 6,
    marginBottom: 10,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: tokens.color.surface.cardEdge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterChecked: {
    borderColor: tokens.color.brand.accent,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: tokens.color.brand.accent,
  },
  radioLabel: {
    fontSize: 14,
    color: tokens.color.ink.primary,
    fontWeight: String(tokens.weight.medium) as '500',
    flex: 1,
  },
  // Ack footer (COMPLAINT_HR_REPLY mirrors UpdateCard)
  ackFooterBlock: {
    gap: 8,
  },
  ackLabel: {
    fontSize: tokens.type.caption.size,
    fontFamily: tokens.font.mono,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.ink.tertiary,
    letterSpacing: tokens.type.caption.size * 0.04,
    textTransform: 'uppercase',
  },
  ackInput: {
    backgroundColor: tokens.color.surface.card,
    borderColor: tokens.color.surface.cardEdge,
    borderWidth: 1,
    borderRadius: tokens.radius.r2,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: tokens.color.ink.primary,
    lineHeight: 14 * 1.4,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  ackMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wordCounter: {
    fontSize: tokens.type.monoSm.size,
    fontFamily: tokens.font.mono,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.ink.tertiary,
    letterSpacing: 0.04 * tokens.type.monoSm.size,
  },
  wordCounterReady: {
    color: tokens.color.semantic.ok,
  },
  ackSubmitBtn: {
    paddingHorizontal: 18,
  },
});
