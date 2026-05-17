/**
 * FlaggedReviewSheet — review an AI-flagged visit.
 *
 * Per R6 prototype. Honest disabled state per sprint scope: the
 * Resolve/Reject backend writes are part of the paused routing slice.
 * Buttons render disabled with "Coming with P1 routing" copy — NO
 * log+advance stubs (per feedback_real_life_scenarios_before_implementation).
 *
 * Photos display + AI verification reason both render fully so the
 * supervisor sees the same evidence today they'll see when the
 * write path lights up.
 *
 * @derives(ADR-0003)
 * @derives(master-plan §G) — supervisor surface
 */

import { Modal, Pressable, View, Text, StyleSheet } from 'react-native';
import { tokens } from '@axhy/ui-tokens';
import type { TodayFlaggedVisitT } from '@axhy/shared-schema';

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export type FlaggedReviewSheetProps = {
  visit: TodayFlaggedVisitT | null;
  onClose: () => void;
};

/** @derives(ADR-0003) @derives(master-plan §G) — supervisor surface */
export function FlaggedReviewSheet({ visit, onClose }: FlaggedReviewSheetProps) {
  const visible = visit !== null;
  const when = visit ? new Date(visit.when).toLocaleString() : '';
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose}>
        <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={s.handle} />
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

          <View style={s.honestNote}>
            <Text style={s.honestBadge}>Coming with P1 routing</Text>
            <Text style={s.honestText}>
              Resolve and Reject write to SupervisorDecision via the routing slice (paused). Buttons
              stay disabled until that lands — no fake "done" toast here.
            </Text>
          </View>

          <View style={s.actions}>
            <Pressable
              style={[s.btn, s.btnDisabled]}
              disabled
              accessibilityState={{ disabled: true }}
            >
              <Text style={s.btnTextDisabled}>Reject — work not done</Text>
            </Pressable>
            <Pressable
              style={[s.btn, s.btnDisabled]}
              disabled
              accessibilityState={{ disabled: true }}
            >
              <Text style={s.btnTextDisabled}>Resolve — looks fine</Text>
            </Pressable>
          </View>

          <Pressable style={s.close} onPress={onClose}>
            <Text style={s.closeText}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20, 16, 12, 0.45)', justifyContent: 'flex-end' },
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
  eyebrow: {
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
  honestNote: {
    backgroundColor: tokens.color.brand.accentSoft,
    borderRadius: tokens.radius.r3,
    padding: tokens.space[4],
    marginBottom: tokens.space[4],
  },
  honestBadge: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.bold) as '700',
    color: tokens.color.brand.accentInk,
    letterSpacing: 1.0,
    marginBottom: tokens.space[2],
  },
  honestText: {
    fontSize: tokens.type.bodySm.size,
    color: tokens.color.brand.accentInk,
    lineHeight: tokens.type.bodySm.size * tokens.type.bodySm.lineHeight,
  },
  actions: { flexDirection: 'row', gap: tokens.space[3], marginBottom: tokens.space[3] },
  btn: {
    flex: 1,
    paddingVertical: tokens.space[3],
    borderRadius: tokens.radius.r2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    backgroundColor: tokens.color.surface.paper3,
    opacity: 0.6,
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
});
