/**
 * MarkAbsentSheet — modal bottom-sheet for marking a worker absent.
 *
 * Per R6 prototype + the Q2=B mark-absent hardening shipped earlier today.
 * Reason chips for common cases; defaults to ABSENT_NO_CALL. POSTs to
 * `/workers/:id/mark-absent`; on 403 NOT_SUPERVISOR surfaces a clear toast
 * line and leaves the row untouched.
 *
 * Uses plain RN `Modal` (no @gorhom/bottom-sheet) — simpler, works on
 * Expo Web out of the box (per feedback_simplicity_libraries_latest_versions).
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */

import { useState, useMemo } from 'react';
import { Modal, Pressable, View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { tokens } from '@axhy/ui-tokens';
import type { TodayWorkerT } from '@axhy/shared-schema';

import { apiFetch, ApiError } from '../../lib/api';
import { useInvalidateToday } from '../../lib/queries/use-today';

const REASONS = [
  { label: 'No call · no show', status: 'ABSENT_NO_CALL' as const, reason: null },
  { label: 'Sick (called)', status: 'ABSENT_NO_CALL' as const, reason: 'Sick (called)' },
  { label: 'Half day', status: 'HALF_DAY' as const, reason: 'Half day' },
  { label: 'Family emergency', status: 'ABSENT_NO_CALL' as const, reason: 'Family emergency' },
];

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export type MarkAbsentSheetProps = {
  worker: TodayWorkerT | null;
  onClose: () => void;
};

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export function MarkAbsentSheet({ worker, onClose }: MarkAbsentSheetProps) {
  const visible = worker !== null;
  const [picked, setPicked] = useState<number>(0);
  const [errorLine, setErrorLine] = useState<string | null>(null);
  const invalidate = useInvalidateToday();

  const today = useMemo(() => new Date().toISOString().slice(0, 10), [visible]);

  const mutation = useMutation({
    mutationFn: async (input: { workerId: string; status: string; reason: string | null }) => {
      return apiFetch<{ ok: true; workerId: string; date: string; status: string }>(
        `/workers/${input.workerId}/mark-absent`,
        {
          method: 'POST',
          body: JSON.stringify({ date: today, status: input.status, reason: input.reason }),
        },
      );
    },
    onSuccess: async () => {
      setErrorLine(null);
      await invalidate();
      onClose();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 403) {
        setErrorLine('You are not the responsible supervisor for this worker today.');
      } else if (err instanceof ApiError && err.status === 404) {
        setErrorLine('Worker not found in this company.');
      } else if (err instanceof Error) {
        setErrorLine(err.message);
      } else {
        setErrorLine('Could not record absence. Try again.');
      }
    },
  });

  function submit() {
    if (!worker) return;
    const r = REASONS[picked]!;
    setErrorLine(null);
    mutation.mutate({ workerId: worker.id, status: r.status, reason: r.reason });
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      onDismiss={() => setErrorLine(null)}
    >
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={s.handle} />
          <Text style={s.title}>{worker ? `Mark ${worker.name} absent` : 'Mark absent'}</Text>
          <Text style={s.subtitle}>
            Pick the closest reason. You can add a note later from Activity.
          </Text>

          <View style={s.chipWrap}>
            {REASONS.map((r, i) => {
              const active = i === picked;
              return (
                <Pressable
                  key={r.label}
                  onPress={() => setPicked(i)}
                  style={[s.chip, active ? s.chipActive : null]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[s.chipText, active ? s.chipTextActive : null]}>{r.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {errorLine ? <Text style={s.error}>{errorLine}</Text> : null}

          <View style={s.actions}>
            <Pressable style={s.cancel} onPress={onClose}>
              <Text style={s.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[s.confirm, mutation.isPending ? s.confirmBusy : null]}
              onPress={submit}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? (
                <ActivityIndicator color={tokens.color.surface.card} />
              ) : (
                <Text style={s.confirmText}>Confirm absent</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
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
  handle: {
    width: 48,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.color.surface.paper3,
    alignSelf: 'center',
    marginBottom: tokens.space[3],
  },
  title: {
    fontSize: tokens.type.subhead.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.ink.primary,
    marginBottom: tokens.space[2],
  },
  subtitle: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.secondary,
    marginBottom: tokens.space[4],
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: tokens.space[2],
    marginBottom: tokens.space[4],
  },
  chip: {
    paddingHorizontal: tokens.space[3],
    paddingVertical: tokens.space[2],
    borderRadius: tokens.radius.r1,
    backgroundColor: tokens.color.surface.paper2,
    borderWidth: 1,
    borderColor: tokens.color.surface.cardEdge,
  },
  chipActive: {
    backgroundColor: tokens.color.brand.accentSoft,
    borderColor: tokens.color.brand.accent,
  },
  chipText: {
    fontSize: tokens.type.bodySm.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.secondary,
  },
  chipTextActive: { color: tokens.color.brand.accentInk },
  error: {
    fontSize: tokens.type.bodySm.size,
    color: tokens.color.semantic.bad,
    marginBottom: tokens.space[3],
  },
  actions: { flexDirection: 'row', gap: tokens.space[3] },
  cancel: {
    flex: 1,
    paddingVertical: tokens.space[3],
    borderRadius: tokens.radius.r2,
    backgroundColor: tokens.color.surface.paper2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.secondary,
  },
  confirm: {
    flex: 1.4,
    paddingVertical: tokens.space[3],
    borderRadius: tokens.radius.r2,
    backgroundColor: tokens.color.brand.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmBusy: { opacity: 0.7 },
  confirmText: {
    fontSize: tokens.type.body.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.surface.card,
  },
});
