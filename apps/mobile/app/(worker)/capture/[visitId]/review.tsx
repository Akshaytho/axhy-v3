/**
 * Capture step 5 — Final Review (canon redesign).
 *
 * Header now reads "Review & submit", body shows a 3-stat card (Photos /
 * Duration / GPS) above BEFORE/AFTER label pills and the underlying
 * PhotoGridReview (preserved). CTA is "Submit for verification" + the AI
 * verify hint.
 *
 * @derives(master-plan §G)
 * @derives(docs/design/worker-app-canon/project/worker-screens.jsx > WorkerFinalReview)
 */

import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';

import { PhotoGridReview } from '../../../../components/worker/capture/PhotoGridReview';
import { NAV_ROUTES } from '../../../../lib/api-routes';
import { StatCard } from '../../../../components/worker/StatCard';
import { r2UploadQueue } from '../../../../lib/r2-upload-queue';
import { useWorkerTodayQuery } from '../../../../lib/queries/use-worker-today';
import { findWorkerTodayVisit } from '../../../../lib/worker-today-helpers';

const MIN_PER_PHASE = 3;

/** Specific "what's still missing" copy for the disabled submit state (BUG-05). */
function missingPhotosHint(before: number, after: number): string {
  const needBefore = Math.max(0, MIN_PER_PHASE - before);
  const needAfter = Math.max(0, MIN_PER_PHASE - after);
  if (needBefore > 0 && needAfter > 0) {
    return `Take ${needBefore} more before and ${needAfter} more after photos.`;
  }
  if (needBefore > 0) return `Take ${needBefore} more before photo${needBefore > 1 ? 's' : ''}.`;
  return `Take ${needAfter} more after photo${needAfter > 1 ? 's' : ''}.`;
}

/** BUG-08: real cleaned duration ("N min") from clock-in/clock-out; null until cleaning has started. */
function formatCleanedDuration(
  startedAt: string | null,
  completedAt: string | null,
): string | null {
  if (!startedAt) return null;
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  const minutes = Math.max(0, Math.round((end - new Date(startedAt).getTime()) / 60000));
  return `${minutes} min`;
}

/** @derives(master-plan §G) */
export default function ReviewStep(): React.JSX.Element {
  const { visitId } = useLocalSearchParams<{ visitId: string }>();
  const id = visitId ?? '';
  // BUG-04/08: surface the site name + cleaned duration the contract requires.
  const { data: todayData } = useWorkerTodayQuery();
  const visit = findWorkerTodayVisit(todayData, id);
  const siteName = visit?.siteName ?? '';
  const cleanedDuration = formatCleanedDuration(
    visit?.startedAt ?? null,
    visit?.completedAt ?? null,
  );
  const [counts, setCounts] = useState({ before: 0, after: 0, uploaded: 0 });
  const totalCaptured = counts.before + counts.after;
  // BUG-01: the anti-gaming floor is >=3 before AND >=3 after (07-final-review.md),
  // matched server-side by worker-submit-service MIN_PHOTOS_PER_PHASE. Submit stays
  // disabled until the floor is met AND every captured photo has finished uploading.
  const floorMet = counts.before >= MIN_PER_PHASE && counts.after >= MIN_PER_PHASE;
  const allUploaded = totalCaptured > 0 && counts.uploaded === totalCaptured;
  const canSubmit = floorMet && allUploaded;

  useEffect(() => {
    function syncCounts(snapshot: ReturnType<typeof r2UploadQueue.snapshot>): void {
      let before = 0;
      let after = 0;
      let uploaded = 0;
      snapshot.forEach((item) => {
        if (item.visitId !== id) return;
        if (item.phase === 'before') before += 1;
        if (item.phase === 'after') after += 1;
        if (item.status === 'done') uploaded += 1;
      });
      setCounts({ before, after, uploaded });
    }

    syncCounts(r2UploadQueue.snapshot());
    return r2UploadQueue.onChange(syncCounts);
  }, [id]);

  function goBack(): void {
    router.replace(NAV_ROUTES.workerCaptureStep(id, 'after-photos-review'));
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
          accessibilityLabel="Back to after review"
          hitSlop={12}
          style={s.iconBtn}
        >
          <Feather name="arrow-left" size={20} color={tokens.color.ink.primary} />
        </Pressable>
        <Text style={s.title}>Review & submit</Text>
        <View style={s.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {siteName ? (
          <View style={s.summaryRow}>
            <Text style={s.summarySite} numberOfLines={1}>
              {siteName}
            </Text>
            <Text style={s.summaryMeta}>
              {cleanedDuration ? `Cleaned ${cleanedDuration} · ` : ''}
              {totalCaptured} photo{totalCaptured === 1 ? '' : 's'}
            </Text>
          </View>
        ) : null}
        <View style={s.statsRow}>
          <StatCard value={String(counts.before)} label="Before" padding={16} />
          <StatCard value={String(counts.after)} label="After" padding={16} />
          <StatCard value={String(counts.uploaded)} label="Uploaded" padding={16} />
        </View>

        <View style={s.labelRow}>
          <View style={[s.labelPill, { backgroundColor: tokens.color.brand.accentSoft }]}>
            <Text style={[s.labelText, { color: tokens.color.brand.accent }]}>BEFORE</Text>
          </View>
          <View style={[s.labelPill, { backgroundColor: tokens.color.semantic.okSoft }]}>
            <Text style={[s.labelText, { color: '#2e5037' }]}>AFTER</Text>
          </View>
        </View>

        <View style={s.gridWrap}>
          <PhotoGridReview visitId={id} />
        </View>
      </ScrollView>

      <View style={s.footer}>
        <Pressable
          onPress={canSubmit ? goNext : undefined}
          accessibilityRole="button"
          accessibilityLabel="Submit for verification"
          disabled={!canSubmit}
          style={({ pressed }) => [
            s.nextBtn,
            !canSubmit && s.nextBtnDisabled,
            pressed && canSubmit && { opacity: 0.92 },
          ]}
        >
          <Text style={s.nextText}>Submit for verification</Text>
        </Pressable>
        <Text style={s.hint}>
          {canSubmit
            ? 'AI will verify within 30 seconds'
            : !floorMet
              ? missingPhotosHint(counts.before, counts.after)
              : `Wait for all uploads to finish (${counts.uploaded}/${totalCaptured} ready).`}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: tokens.color.surface.paper },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    color: tokens.color.ink.primary,
    letterSpacing: -0.4,
  },
  scroll: { paddingHorizontal: 16, paddingBottom: 24 },
  summaryRow: { marginBottom: 12, gap: 2 },
  summarySite: { fontSize: 16, fontWeight: '700', color: tokens.color.ink.primary },
  summaryMeta: { fontSize: 12, color: tokens.color.ink.tertiary },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  labelRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  labelPill: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
  },
  labelText: {
    fontFamily: tokens.font.mono,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  gridWrap: { marginTop: 4 },
  footer: {
    paddingHorizontal: 20,
    paddingBottom: 18,
    paddingTop: 14,
  },
  nextBtn: {
    height: 52,
    backgroundColor: tokens.color.brand.accent,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextBtnDisabled: {
    opacity: 0.45,
  },
  nextText: {
    fontSize: 16,
    fontWeight: '700',
    color: tokens.color.surface.card,
  },
  hint: {
    textAlign: 'center',
    fontSize: 11,
    color: tokens.color.ink.tertiary,
    marginTop: 8,
  },
});
