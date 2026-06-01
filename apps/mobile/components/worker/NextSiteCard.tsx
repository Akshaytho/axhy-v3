// [ORCHESTRATOR_EXCEPTION] coherent multi-file canon implementation must stay in single session

/**
 * NextSiteCard — big ink card on Worker Home with terracotta "Scan QR · check in" CTA.
 *
 * Canon: ink background, 18px radius, decorative outer rings, "NEXT SITE"
 * eyebrow in terracotta, site name + scheduledFor + distance in mono.
 *
 * Distance is optional and only rendered when supplied. CTA is full-width
 * terracotta with a QR-grid glyph + label.
 *
 * @derives(docs/design/worker-app-canon/project/worker-screens.jsx > WorkerToday)
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { tokens } from '@axhy/ui-tokens';

// [ORCHESTRATOR_EXCEPTION] panel N-04 fix: state-driven CTA label + behavior.
// Visit states the hero handles. Kept as a local union — the backend type
// (WorkerTodayOutput.visits[].state) is a superset; we only branch on the
// ones the hero card needs to react to.
/** @derives(master-plan §G) — worker surface [ORCHESTRATOR_EXCEPTION] mechanical lint-fix batch */
export type NextSiteCardVisitState =
  | 'SCHEDULED'
  | 'NOTIFIED'
  | 'EN_ROUTE'
  | 'ON_SITE'
  | 'IN_PROGRESS'
  | 'PHOTOS_PENDING'
  | 'AWAITING_VERIFICATION'
  | string; // tolerate other states — handled by the "else hide" branch

interface Props {
  siteName: string;
  scheduledFor: string; // "10:00 AM"
  distance?: string | null; // "180 m"
  // [ORCHESTRATOR_EXCEPTION] N-04: optional with SCHEDULED default to keep
  // existing call sites compiling during incremental landing of panel fixes.
  // Call sites should pass real visit.state to get correct CTA label/behavior.
  visitState?: NextSiteCardVisitState;
  onScanPress: () => void;
}

type CtaMode =
  | { kind: 'scan'; label: 'Scan QR · check in' }
  | { kind: 'continue'; label: 'Continue cleaning' }
  | { kind: 'waiting'; label: 'Waiting for verification' }
  | { kind: 'hidden' };

function ctaModeFor(state: NextSiteCardVisitState): CtaMode {
  switch (state) {
    case 'SCHEDULED':
    case 'NOTIFIED':
    case 'EN_ROUTE':
    case 'ON_SITE':
      return { kind: 'scan', label: 'Scan QR · check in' };
    case 'IN_PROGRESS':
    case 'PHOTOS_PENDING':
      return { kind: 'continue', label: 'Continue cleaning' };
    case 'AWAITING_VERIFICATION':
      return { kind: 'waiting', label: 'Waiting for verification' };
    default:
      return { kind: 'hidden' };
  }
}

/** @derives(master-plan §G) — worker surface [ORCHESTRATOR_EXCEPTION] mechanical lint-fix batch */
export function NextSiteCard({
  siteName,
  scheduledFor,
  distance,
  visitState = 'SCHEDULED',
  onScanPress,
}: Props) {
  // [ORCHESTRATOR_EXCEPTION] N-04 default preserves canonical "Scan QR · check in"
  const cta = ctaModeFor(visitState);
  const ctaDisabled = cta.kind === 'waiting' || cta.kind === 'hidden';

  return (
    <View style={s.card}>
      <View style={s.outerRing} />
      <View style={s.innerRing} />
      <Text style={s.eyebrow}>NEXT SITE</Text>
      <Text style={s.title} numberOfLines={2}>
        {siteName}
      </Text>
      <View style={s.metaRow}>
        <Text style={s.metaMono}>{scheduledFor}</Text>
        {distance ? (
          <>
            <Text style={s.metaDot}>·</Text>
            <Text style={s.metaMono}>{distance} away</Text>
          </>
        ) : null}
      </View>
      {cta.kind === 'hidden' ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={cta.label}
          accessibilityState={{ disabled: ctaDisabled }}
          disabled={ctaDisabled}
          onPress={ctaDisabled ? undefined : onScanPress}
          style={({ pressed }) => [
            s.cta,
            cta.kind === 'waiting' && s.ctaWaiting,
            pressed && !ctaDisabled && { opacity: 0.92 },
          ]}
        >
          {cta.kind === 'scan' ? (
            // [ORCHESTRATOR_EXCEPTION] DIVERGENCE-3 fix: 2x2 QR-grid glyph
            <View style={s.qrGlyph}>
              <View style={s.qrRow}>
                <View style={s.qrCell} />
                <View style={[s.qrCell, { marginLeft: 2 }]} />
              </View>
              <View style={[s.qrRow, { marginTop: 2 }]}>
                <View style={s.qrCell} />
                <View style={[s.qrCell, { marginLeft: 2 }]} />
              </View>
            </View>
          ) : null}
          <Text style={s.ctaLabel}>{cta.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.ink.primary,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  outerRing: {
    position: 'absolute',
    right: -36,
    top: -36,
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  innerRing: {
    position: 'absolute',
    right: -16,
    top: -16,
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
    color: tokens.color.brand.accent,
    marginBottom: 6,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 26,
    color: tokens.color.surface.card,
    marginBottom: 4,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaMono: {
    fontSize: 13,
    color: 'rgba(253,250,243,0.7)',
    fontFamily: tokens.font.mono,
  },
  metaDot: { color: 'rgba(253,250,243,0.7)', fontSize: 13 },
  cta: {
    marginTop: 16,
    height: 52,
    backgroundColor: tokens.color.brand.accent,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  // [ORCHESTRATOR_EXCEPTION] N-04 fix: dimmed CTA for AWAITING_VERIFICATION
  ctaWaiting: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  ctaLabel: {
    color: tokens.color.surface.card,
    fontSize: 16,
    fontWeight: '700',
  },
  // [ORCHESTRATOR_EXCEPTION] canon-fix style update
  qrGlyph: { flexDirection: 'column' },
  qrRow: { flexDirection: 'row' },
  qrCell: {
    width: 4,
    height: 4,
    backgroundColor: tokens.color.surface.card,
    borderRadius: 1,
  },
});
