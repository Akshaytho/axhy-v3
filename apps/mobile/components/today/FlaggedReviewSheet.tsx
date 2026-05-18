/**
 * FlaggedReviewSheet — review an AI-flagged visit.
 *
 * Wave 4 compliance flow (2026-05-18). Both Resolve and Reject buttons are
 * fully wired to the backend (POST /visits/:id/resolve, POST /visits/:id/reject).
 *
 *   Resolve  — plain confirmation sheet → optional supervisorReason → POST.
 *              Non-destructive: flips Visit.flagged from true → false.
 *   Reject   — typed-phrase confirmation ("REJECT") → required supervisorReason
 *              → POST. Transitions Visit.state to REJECTED. Mirrors the
 *              EMPLOYMENT-tier DecisionCard pattern.
 *
 * Idempotency-Key header is sent on both mutations (fresh UUID per user tap)
 * so a Slow-3G retry can't double-fire the underlying state change. On
 * success the sheet closes and the Today query is invalidated so the
 * flagged-visits section re-renders without the row.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 * @derives(2026-05-18-supervisor-30-day-real-life-simulation-v2.md §3 Wave 4)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { tokens } from '@axhy/ui-tokens';
import type { TodayFlaggedVisitT } from '@axhy/shared-schema';

import { useLocaleStrings } from '../../lib/i18n/use-locale';
import { useResolveFlaggedVisit, useRejectFlaggedVisit } from '../../lib/queries/use-visit-review';

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export type FlaggedReviewSheetProps = {
  visit: TodayFlaggedVisitT | null;
  onClose: () => void;
};

/**
 * Sheet "screens": the user lands on REVIEW, taps Resolve → CONFIRM_RESOLVE,
 * or taps Reject → CONFIRM_REJECT. CONFIRM_REJECT requires the typed phrase
 * "REJECT" before the submit button enables.
 */
type SheetScreen = 'REVIEW' | 'CONFIRM_RESOLVE' | 'CONFIRM_REJECT';

const REJECT_PHRASE = 'REJECT';

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export function FlaggedReviewSheet({ visit, onClose }: FlaggedReviewSheetProps) {
  const strings = useLocaleStrings();
  const visible = visit !== null;
  const when = visit ? new Date(visit.when).toLocaleString() : '';

  const [screen, setScreen] = useState<SheetScreen>('REVIEW');
  const [resolveReason, setResolveReason] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [rejectPhrase, setRejectPhrase] = useState('');

  // Reset internal state every time the sheet opens on a new visit.
  useEffect(() => {
    if (visible) {
      setScreen('REVIEW');
      setResolveReason('');
      setRejectReason('');
      setRejectPhrase('');
    }
  }, [visible, visit?.visitId]);

  const resolveMutation = useResolveFlaggedVisit();
  const rejectMutation = useRejectFlaggedVisit();

  const handleClose = useCallback(() => {
    // Don't let the sheet vanish mid-flight — the mutation will still
    // succeed but the supervisor loses confirmation of which path won.
    if (resolveMutation.isPending || rejectMutation.isPending) return;
    onClose();
  }, [onClose, resolveMutation.isPending, rejectMutation.isPending]);

  const submitResolve = useCallback(() => {
    if (!visit) return;
    const trimmed = resolveReason.trim();
    resolveMutation.mutate(
      { visitId: visit.visitId, supervisorReason: trimmed.length > 0 ? trimmed : null },
      {
        onSuccess: () => {
          onClose();
        },
      },
    );
  }, [visit, resolveReason, resolveMutation, onClose]);

  const rejectPhraseMatches = rejectPhrase.trim().toUpperCase() === REJECT_PHRASE;
  const rejectReasonValid = rejectReason.trim().length > 0;
  const canSubmitReject = rejectPhraseMatches && rejectReasonValid && !rejectMutation.isPending;

  const submitReject = useCallback(() => {
    if (!visit || !canSubmitReject) return;
    rejectMutation.mutate(
      { visitId: visit.visitId, supervisorReason: rejectReason.trim() },
      {
        onSuccess: () => {
          onClose();
        },
      },
    );
  }, [visit, canSubmitReject, rejectReason, rejectMutation, onClose]);

  const resolveError = resolveMutation.error;
  const rejectError = rejectMutation.error;

  // Compose user-facing button labels with pending state.
  const resolveLabel = useMemo(() => {
    if (resolveMutation.isPending) return 'Resolving…';
    return 'Resolve — looks fine';
  }, [resolveMutation.isPending]);

  const rejectLabel = useMemo(() => {
    if (rejectMutation.isPending) return 'Rejecting…';
    return 'Reject — work not done';
  }, [rejectMutation.isPending]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={s.backdrop} onPress={handleClose} accessibilityLabel="Close sheet">
        <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={s.handle} />

          {screen === 'REVIEW' && (
            <ReviewScreen
              visit={visit}
              when={when}
              resolveLabel={resolveLabel}
              rejectLabel={rejectLabel}
              onResolve={() => setScreen('CONFIRM_RESOLVE')}
              onReject={() => setScreen('CONFIRM_REJECT')}
              onClose={handleClose}
              closeLabel={strings.common.cancel}
            />
          )}

          {screen === 'CONFIRM_RESOLVE' && (
            <ConfirmResolveScreen
              workerName={visit?.workerName ?? ''}
              siteName={visit?.siteName ?? ''}
              resolveReason={resolveReason}
              onChangeReason={setResolveReason}
              isPending={resolveMutation.isPending}
              error={resolveError instanceof Error ? resolveError.message : null}
              onBack={() => setScreen('REVIEW')}
              onSubmit={submitResolve}
              cancelLabel={strings.common.cancel}
              confirmLabel={resolveMutation.isPending ? 'Resolving…' : strings.common.confirm}
            />
          )}

          {screen === 'CONFIRM_REJECT' && (
            <ConfirmRejectScreen
              workerName={visit?.workerName ?? ''}
              siteName={visit?.siteName ?? ''}
              rejectReason={rejectReason}
              onChangeReason={setRejectReason}
              rejectPhrase={rejectPhrase}
              onChangePhrase={setRejectPhrase}
              phraseMatches={rejectPhraseMatches}
              reasonValid={rejectReasonValid}
              canSubmit={canSubmitReject}
              isPending={rejectMutation.isPending}
              error={rejectError instanceof Error ? rejectError.message : null}
              onBack={() => setScreen('REVIEW')}
              onSubmit={submitReject}
              cancelLabel={strings.common.cancel}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// REVIEW screen — photos + AI reason + Resolve/Reject CTAs
// ---------------------------------------------------------------------------

type ReviewScreenProps = {
  visit: TodayFlaggedVisitT | null;
  when: string;
  resolveLabel: string;
  rejectLabel: string;
  onResolve: () => void;
  onReject: () => void;
  onClose: () => void;
  closeLabel: string;
};

function ReviewScreen({
  visit,
  when,
  resolveLabel,
  rejectLabel,
  onResolve,
  onReject,
  onClose,
  closeLabel,
}: ReviewScreenProps) {
  return (
    <>
      <Text style={s.eyebrow}>FLAGGED VISIT · REVIEW</Text>
      <Text style={s.title}>
        {visit ? `${visit.workerName} at ${visit.siteName}` : 'Flagged visit'}
      </Text>
      <Text style={s.subtitle}>{when}</Text>

      <View style={s.photoStrip}>
        <View style={s.photoTile}>
          <Text style={s.photoLabel}>{visit?.photoCount ?? 0} photos</Text>
          <Text style={s.photoHint}>Inline thumbnails ship with the photo CDN slice.</Text>
        </View>
      </View>

      <View style={s.reasonBlock}>
        <Text style={s.reasonLabel}>AI reason</Text>
        <Text style={s.reasonBody}>
          {visit?.reason ?? 'No AI verification text recorded for this visit.'}
        </Text>
      </View>

      <View style={s.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={rejectLabel}
          style={({ pressed }) => [s.btn, s.btnReject, pressed && s.btnPressed]}
          onPress={onReject}
        >
          <Text style={s.btnTextReject}>{rejectLabel}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={resolveLabel}
          style={({ pressed }) => [s.btn, s.btnResolve, pressed && s.btnPressed]}
          onPress={onResolve}
        >
          <Text style={s.btnTextResolve}>{resolveLabel}</Text>
        </Pressable>
      </View>

      <Pressable style={s.close} onPress={onClose} accessibilityRole="button">
        <Text style={s.closeText}>{closeLabel}</Text>
      </Pressable>
    </>
  );
}

// ---------------------------------------------------------------------------
// CONFIRM_RESOLVE screen — plain confirm + optional reason
// ---------------------------------------------------------------------------

type ConfirmResolveScreenProps = {
  workerName: string;
  siteName: string;
  resolveReason: string;
  onChangeReason: (next: string) => void;
  isPending: boolean;
  error: string | null;
  onBack: () => void;
  onSubmit: () => void;
  cancelLabel: string;
  confirmLabel: string;
};

function ConfirmResolveScreen({
  workerName,
  siteName,
  resolveReason,
  onChangeReason,
  isPending,
  error,
  onBack,
  onSubmit,
  cancelLabel,
  confirmLabel,
}: ConfirmResolveScreenProps) {
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.confirmScroll}>
      <Text style={s.eyebrow}>RESOLVE FLAGGED VISIT</Text>
      <Text style={s.title}>Resolve this flagged visit?</Text>
      <Text style={s.subtitle}>
        {workerName} at {siteName} — clears the flag so the Today screen stops surfacing it.
      </Text>

      <Text style={s.fieldLabel}>Optional note for the audit trail</Text>
      <TextInput
        value={resolveReason}
        onChangeText={onChangeReason}
        placeholder="(optional) Why does this look fine?"
        placeholderTextColor={tokens.color.ink.placeholder}
        multiline
        numberOfLines={3}
        style={s.textInput}
        editable={!isPending}
        accessibilityLabel="Resolve reason (optional)"
        maxLength={1000}
      />

      {error !== null && (
        <View style={s.errorCard}>
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      <View style={s.confirmActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          style={({ pressed }) => [s.btn, s.btnSecondary, pressed && s.btnPressed]}
          onPress={onBack}
          disabled={isPending}
        >
          <Text style={s.btnTextSecondary}>{cancelLabel}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={confirmLabel}
          accessibilityState={{ disabled: isPending }}
          style={({ pressed }) => [s.btn, s.btnResolve, (pressed || isPending) && s.btnPressed]}
          onPress={onSubmit}
          disabled={isPending}
        >
          <Text style={s.btnTextResolve}>{confirmLabel}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// CONFIRM_REJECT screen — typed-phrase + required reason
// ---------------------------------------------------------------------------

type ConfirmRejectScreenProps = {
  workerName: string;
  siteName: string;
  rejectReason: string;
  onChangeReason: (next: string) => void;
  rejectPhrase: string;
  onChangePhrase: (next: string) => void;
  phraseMatches: boolean;
  reasonValid: boolean;
  canSubmit: boolean;
  isPending: boolean;
  error: string | null;
  onBack: () => void;
  onSubmit: () => void;
  cancelLabel: string;
};

function ConfirmRejectScreen({
  workerName,
  siteName,
  rejectReason,
  onChangeReason,
  rejectPhrase,
  onChangePhrase,
  phraseMatches,
  reasonValid,
  canSubmit,
  isPending,
  error,
  onBack,
  onSubmit,
  cancelLabel,
}: ConfirmRejectScreenProps) {
  const confirmLabel = isPending ? 'Rejecting…' : 'Reject this visit';
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.confirmScroll}>
      <Text style={s.eyebrowDanger}>REJECT FLAGGED VISIT</Text>
      <Text style={s.title}>Reject this visit?</Text>
      <Text style={s.subtitle}>
        {workerName} at {siteName} — moves the visit to REJECTED and notifies HR. This cannot be
        undone from this screen.
      </Text>

      <Text style={s.fieldLabel}>Why are you rejecting?</Text>
      <TextInput
        value={rejectReason}
        onChangeText={onChangeReason}
        placeholder="Required — explain what went wrong"
        placeholderTextColor={tokens.color.ink.placeholder}
        multiline
        numberOfLines={4}
        style={s.textInput}
        editable={!isPending}
        accessibilityLabel="Reject reason (required)"
        maxLength={1000}
      />
      {!reasonValid && rejectReason.length > 0 && (
        <Text style={s.fieldHint}>Reason must not be empty.</Text>
      )}

      <Text style={s.fieldLabel}>Type REJECT to confirm</Text>
      <TextInput
        value={rejectPhrase}
        onChangeText={onChangePhrase}
        placeholder="REJECT"
        placeholderTextColor={tokens.color.ink.placeholder}
        autoCapitalize="characters"
        autoCorrect={false}
        style={[s.textInput, s.textInputSingle, phraseMatches && s.textInputMatches]}
        editable={!isPending}
        accessibilityLabel="Type REJECT to confirm"
        maxLength={32}
      />
      {!phraseMatches && rejectPhrase.length > 0 && (
        <Text style={s.fieldHint}>Phrase must match exactly: REJECT</Text>
      )}

      {error !== null && (
        <View style={s.errorCard}>
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      <View style={s.confirmActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          style={({ pressed }) => [s.btn, s.btnSecondary, pressed && s.btnPressed]}
          onPress={onBack}
          disabled={isPending}
        >
          <Text style={s.btnTextSecondary}>{cancelLabel}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={confirmLabel}
          accessibilityState={{ disabled: !canSubmit }}
          style={({ pressed }) => [
            s.btn,
            canSubmit ? s.btnReject : s.btnDisabled,
            pressed && canSubmit && s.btnPressed,
          ]}
          onPress={onSubmit}
          disabled={!canSubmit}
        >
          <Text style={canSubmit ? s.btnTextReject : s.btnTextDisabled}>{confirmLabel}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20, 16, 12, 0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: tokens.color.surface.card,
    borderTopLeftRadius: tokens.radius.r4,
    borderTopRightRadius: tokens.radius.r4,
    paddingHorizontal: tokens.space[5],
    paddingTop: tokens.space[3],
    paddingBottom: tokens.space[7],
    maxHeight: '90%',
  },
  handle: {
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.color.surface.paper3,
    alignSelf: 'center',
    marginBottom: tokens.space[3],
  },
  eyebrow: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.semantic.warn,
    letterSpacing: 1.2,
    marginBottom: tokens.space[2],
  },
  eyebrowDanger: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.semantic.bad,
    letterSpacing: 1.2,
    marginBottom: tokens.space[2],
  },
  title: {
    fontSize: tokens.type.subhead.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.ink.primary,
  },
  subtitle: {
    fontSize: tokens.type.bodySm.size,
    color: tokens.color.ink.tertiary,
    marginBottom: tokens.space[4],
  },
  photoStrip: { marginBottom: tokens.space[4] },
  photoTile: {
    padding: tokens.space[4],
    borderRadius: tokens.radius.r3,
    backgroundColor: tokens.color.surface.paper2,
    borderColor: tokens.color.surface.cardEdge,
    borderWidth: 1,
  },
  photoLabel: {
    fontSize: tokens.type.subhead.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
  },
  photoHint: {
    fontSize: tokens.type.bodySm.size,
    color: tokens.color.ink.tertiary,
    marginTop: tokens.space[1],
  },
  reasonBlock: {
    padding: tokens.space[4],
    backgroundColor: tokens.color.surface.paper2,
    borderRadius: tokens.radius.r3,
    marginBottom: tokens.space[4],
  },
  reasonLabel: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.ink.tertiary,
    letterSpacing: 1.0,
    marginBottom: tokens.space[2],
  },
  reasonBody: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.primary,
    lineHeight: tokens.type.body.size * tokens.type.body.lineHeight,
  },
  actions: { flexDirection: 'row', gap: tokens.space[3], marginBottom: tokens.space[3] },
  confirmActions: {
    flexDirection: 'row',
    gap: tokens.space[3],
    marginTop: tokens.space[4],
  },
  btn: {
    flex: 1,
    paddingVertical: tokens.space[3],
    borderRadius: tokens.radius.r2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnResolve: { backgroundColor: tokens.color.semantic.ok },
  btnReject: { backgroundColor: tokens.color.semantic.bad },
  btnSecondary: {
    backgroundColor: tokens.color.surface.paper3,
    borderColor: tokens.color.surface.cardEdge,
    borderWidth: 1,
  },
  btnDisabled: { backgroundColor: tokens.color.surface.paper3, opacity: 0.6 },
  btnPressed: { opacity: 0.75 },
  btnTextResolve: {
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.surface.card,
  },
  btnTextReject: {
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.surface.card,
  },
  btnTextSecondary: {
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.secondary,
  },
  btnTextDisabled: {
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.tertiary,
  },
  close: { alignItems: 'center', paddingVertical: tokens.space[3] },
  closeText: {
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.secondary,
  },
  confirmScroll: {
    paddingBottom: tokens.space[3],
  },
  fieldLabel: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.ink.tertiary,
    letterSpacing: 1.0,
    marginTop: tokens.space[3],
    marginBottom: tokens.space[1],
  },
  fieldHint: {
    fontSize: tokens.type.caption.size,
    color: tokens.color.semantic.warn,
    marginTop: tokens.space[1],
  },
  textInput: {
    backgroundColor: tokens.color.surface.paper2,
    borderColor: tokens.color.surface.cardEdge,
    borderWidth: 1,
    borderRadius: tokens.radius.r3,
    paddingHorizontal: tokens.space[3],
    paddingVertical: tokens.space[3],
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.primary,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  textInputSingle: {
    minHeight: 44,
    fontFamily: tokens.font.mono,
    letterSpacing: 1.5,
  },
  textInputMatches: {
    borderColor: tokens.color.semantic.ok,
  },
  errorCard: {
    marginTop: tokens.space[3],
    padding: tokens.space[3],
    borderRadius: tokens.radius.r2,
    backgroundColor: tokens.color.semantic.badSoft,
    borderLeftWidth: 4,
    borderLeftColor: tokens.color.semantic.bad,
  },
  errorText: {
    fontSize: tokens.type.bodySm.size,
    color: tokens.color.ink.primary,
  },
});
