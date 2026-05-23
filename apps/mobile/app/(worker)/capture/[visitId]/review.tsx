/**
 * Capture step 5 — Review.
 *
 * Renders the 6-tile photo grid with per-photo upload status + retake, plus
 * inline Back/step-badge/Next chrome (we can't use CaptureStepShell here
 * because its full-screen SafeAreaView occludes the grid).
 *
 * @derives(master-plan §G)
 */

import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';

import { PhotoGridReview } from '../../../../components/worker/capture/PhotoGridReview';
import { NAV_ROUTES } from '../../../../lib/api-routes';

const CHEVRON_SIZE = 18;

/** @derives(master-plan §G) */
export default function ReviewStep(): React.JSX.Element {
  const { visitId } = useLocalSearchParams<{ visitId: string }>();
  const id = visitId ?? '';

  function goBack(): void {
    router.replace(NAV_ROUTES.workerCaptureStep(id, 'after-photos'));
  }

  function goNext(): void {
    router.replace(NAV_ROUTES.workerCaptureStep(id, 'submit'));
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom', 'left', 'right']}>
      <View style={s.topBar}>
        <Pressable
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="Back to after photos"
          style={s.backBtn}
        >
          <Feather name="chevron-left" size={CHEVRON_SIZE} color={tokens.color.ink.secondary} />
          <Text style={s.backText}>Back</Text>
        </Pressable>
        <Text style={s.stepBadge}>Step 5 of 6</Text>
        <View style={s.backBtn} />
      </View>

      <View style={s.body}>
        <PhotoGridReview visitId={id} />
      </View>

      <View style={s.footer}>
        <Pressable
          onPress={goNext}
          accessibilityRole="button"
          accessibilityLabel="Continue to submit"
          style={s.nextBtn}
        >
          <Text style={s.nextText}>Continue to submit</Text>
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
    minWidth: tokens.space[8],
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
  nextText: {
    fontSize: tokens.type.subhead.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.surface.paper,
  },
});
