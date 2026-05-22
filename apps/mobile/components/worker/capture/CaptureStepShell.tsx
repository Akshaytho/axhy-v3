/**
 * Shared shell for the six capture-flow placeholder steps.
 *
 * Renders: step header ("Step N of 6"), title, body, primary CTA, and a
 * Back link when not on step 1. Every step screen wraps its content in
 * this shell so spacing, tap targets, and back/next chrome stay consistent
 * while real step internals (camera, timer, photo grid, R2 uploader) land
 * in 2b-2 and 2b-3.
 *
 * @derives(WORKER_MVP_SLICE_2A_PLAN.md §7)
 */

import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';

import { CAPTURE_STEPS, NAV_ROUTES, type CaptureStep } from '../../../lib/api-routes';

const CHEVRON_SIZE = 18;

type Props = {
  visitId: string;
  step: CaptureStep;
  title: string;
  body: string;
  /** Label for the forward button. Defaults to "Next". */
  nextLabel?: string;
  /** When true, the forward button is disabled (e.g. final submit pending). */
  nextDisabled?: boolean;
};

/**
 * Step index helper — 1-based to match the visible "Step N of 6" label.
 *
 * @derives(master-plan §G)
 */
function getStepIndex(step: CaptureStep): number {
  return CAPTURE_STEPS.indexOf(step) + 1;
}

/** @derives(master-plan §G) */
export function CaptureStepShell({
  visitId,
  step,
  title,
  body,
  nextLabel = 'Next',
  nextDisabled = false,
}: Props): React.JSX.Element {
  const index = getStepIndex(step);
  const total = CAPTURE_STEPS.length;
  const isFirst = index === 1;
  const isLast = index === total;

  function goBack(): void {
    if (isFirst) {
      router.replace(NAV_ROUTES.workerHome);
      return;
    }
    const prevStep = CAPTURE_STEPS[index - 2];
    if (prevStep !== undefined) {
      router.replace(NAV_ROUTES.workerCaptureStep(visitId, prevStep));
    }
  }

  function goNext(): void {
    if (nextDisabled) return;
    if (isLast) {
      router.replace(NAV_ROUTES.workerHome);
      return;
    }
    const nextStep = CAPTURE_STEPS[index];
    if (nextStep !== undefined) {
      router.replace(NAV_ROUTES.workerCaptureStep(visitId, nextStep));
    }
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom', 'left', 'right']}>
      <View style={s.topBar}>
        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel={isFirst ? 'Back to home' : 'Back to previous step'}
          style={s.backBtn}
        >
          <Feather name="chevron-left" size={CHEVRON_SIZE} color={tokens.color.ink.secondary} />
          <Text style={s.backText}>{isFirst ? 'Home' : 'Back'}</Text>
        </Pressable>
        <Text style={s.stepBadge}>
          Step {index} of {total}
        </Text>
      </View>

      <View style={s.body}>
        <Text style={s.title}>{title}</Text>
        <Text style={s.bodyText}>{body}</Text>
      </View>

      <View style={s.footer}>
        <Pressable
          onPress={goNext}
          disabled={nextDisabled}
          accessibilityRole="button"
          accessibilityLabel={nextLabel}
          style={[s.nextBtn, nextDisabled && s.nextBtnDisabled]}
        >
          <Text style={s.nextText}>{nextLabel}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: tokens.color.surface.paper,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.space[4],
    paddingTop: tokens.space[2],
    paddingBottom: tokens.space[3],
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: tokens.tap.minMobile,
    paddingRight: tokens.space[3],
  },
  backText: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.secondary,
    marginLeft: 2,
  },
  stepBadge: {
    fontSize: tokens.type.caption.size,
    color: tokens.color.brand.accent,
    fontWeight: String(tokens.weight.semibold) as '600',
    letterSpacing: tokens.type.caption.tracking,
    textTransform: 'uppercase',
  },
  body: {
    flex: 1,
    paddingHorizontal: tokens.space[4],
    paddingTop: tokens.space[4],
  },
  title: {
    fontSize: tokens.type.display.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
    letterSpacing: tokens.type.display.tracking,
    marginBottom: tokens.space[2],
  },
  bodyText: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.tertiary,
    lineHeight: tokens.type.body.size * 1.45,
  },
  footer: {
    paddingHorizontal: tokens.space[4],
    paddingBottom: tokens.space[4],
  },
  nextBtn: {
    backgroundColor: tokens.color.brand.accent,
    borderRadius: tokens.radius.r3,
    paddingVertical: tokens.space[4],
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: tokens.tap.minMobile,
  },
  nextBtnDisabled: {
    opacity: 0.45,
  },
  nextText: {
    fontSize: tokens.type.subhead.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.surface.paper,
  },
});
