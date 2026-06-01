/**
 * Sticky banner shown on Worker Home when any of today's visits is in flight
 * (`EN_ROUTE` / `ON_SITE` / `IN_PROGRESS` / `PHOTOS_PENDING`).
 *
 * The predicate is computed server-side and returned as `WorkerTodayOutput.resumeCapture`.
 * Mobile NEVER re-derives the in-flight state from raw fields; the backend is
 * the single source of truth.
 *
 * Tap navigates to the Assignment Detail screen in slice 2a-2; in slice 2b
 * the same banner deep-links into the in-progress capture step instead.
 *
 * @derives(WORKER_MVP_SLICE_2A_PLAN.md §1)
 * @derives(master-plan §G)
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';

const ICON_WRAP_SIZE = 36;
const ICON_GLYPH_SIZE = 18;
const CHEVRON_SIZE = 16;

type Props = {
  siteName: string;
  photosTakenSoFar: number;
  onContinue: () => void;
};

/** @derives(master-plan §G) */
export function ResumeCaptureBanner({
  siteName,
  photosTakenSoFar,
  onContinue,
}: Props): React.JSX.Element {
  return (
    <Pressable
      onPress={onContinue}
      accessibilityRole="button"
      accessibilityLabel={`Resume capture at ${siteName}`}
      style={s.card}
    >
      <View style={s.iconWrap}>
        <Feather name="camera" size={ICON_GLYPH_SIZE} color={tokens.color.surface.paper} />
      </View>
      <View style={s.body}>
        <Text style={s.title} numberOfLines={1}>
          {siteName}
        </Text>
        {/* [ORCHESTRATOR_EXCEPTION] R-01 fix: build full string to avoid text fragment split */}
        <Text style={s.meta}>
          {`${photosTakenSoFar} ${photosTakenSoFar === 1 ? 'photo' : 'photos'} taken`}
        </Text>
      </View>
      <View style={s.cta}>
        <Text style={s.ctaText}>Continue</Text>
        <Feather name="chevron-right" size={CHEVRON_SIZE} color={tokens.color.brand.accent} />
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.color.brand.accentSoft,
    borderRadius: tokens.radius.r3,
    borderWidth: 1,
    borderColor: tokens.color.brand.accent,
    padding: tokens.space[3],
    marginBottom: tokens.space[3],
  },
  iconWrap: {
    width: ICON_WRAP_SIZE,
    height: ICON_WRAP_SIZE,
    borderRadius: ICON_WRAP_SIZE / 2,
    backgroundColor: tokens.color.brand.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: tokens.space[3],
  },
  body: {
    flex: 1,
  },
  title: {
    fontSize: tokens.type.subhead.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    marginBottom: 2,
  },
  meta: {
    fontSize: tokens.type.caption.size,
    color: tokens.color.brand.accentInk,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: tokens.space[2],
  },
  ctaText: {
    fontSize: tokens.type.caption.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.brand.accent,
    marginRight: 2,
  },
});
