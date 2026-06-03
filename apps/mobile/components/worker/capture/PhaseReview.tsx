/**
 * Shared per-phase review checkpoint (contract 03 Before-Review / 06 After-Review).
 *
 * One lightweight quality gate per phase: show every photo for this phase, let
 * the worker remove a blurry/wrong one, and offer "+ Add more" to return to
 * capture WITH the good photos preserved (the replacement loop). The primary CTA
 * stays disabled until the 3-photo floor is met again.
 *
 * Uploads keep running in the background — this screen never waits for them.
 *
 * @derives(docs/capture-submission_flow/03-before-photos-review.md)
 * @derives(docs/capture-submission_flow/06-after-photos-review.md)
 */

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';
import type { PhotoPhase } from '@axhy/shared-schema';

import { r2UploadQueue, type QueueItem, type UploadStatus } from '../../../lib/r2-upload-queue';
import { canPersistCaptures, deletePhoto } from '../../../lib/storage/per-user-partition';
import { setRetakePreservedSlots } from '../../../lib/capture-retake-state';
import { useWorkerTodayQuery } from '../../../lib/queries/use-worker-today';
import { MIN_PHOTOS_PER_PHASE, MAX_PHOTOS_PER_PHASE } from '../../../lib/capture-flow';
import { type CaptureStep } from '../../../lib/api-routes';

type PhotoTile = { index: number; localUri: string; status: UploadStatus };

type Props = {
  visitId: string;
  phase: PhotoPhase;
  /** Header label, e.g. "Before review". */
  headerTitle: string;
  /** Capture step to return to for "+ Add more" ('before-photos' | 'after-photos'). */
  captureStep: CaptureStep;
  /** Primary CTA label, e.g. "Start cleaning" / "Continue to final review". */
  primaryLabel: string;
  /** Fired when the floor is met and the worker taps the primary CTA. */
  onPrimary: () => void;
  /** True while the primary action is in flight (e.g. clock-in). */
  primaryBusy?: boolean;
  /** Inline error from the primary action (e.g. clock-in failure). */
  primaryError?: string | null;
};

function statusLabel(status: UploadStatus): string {
  if (status === 'done') return 'Uploaded';
  if (status === 'uploading') return 'Uploading…';
  if (status === 'failed') return 'Upload failed — tap to retry';
  return 'Queued';
}

function statusColor(status: UploadStatus): string {
  if (status === 'done') return tokens.color.brand.accent;
  if (status === 'failed') return tokens.color.semantic.bad;
  return tokens.color.ink.tertiary;
}

/** @derives(master-plan §G) */
export function PhaseReview({
  visitId,
  phase,
  headerTitle,
  captureStep,
  primaryLabel,
  onPrimary,
  primaryBusy = false,
  primaryError = null,
}: Props): React.JSX.Element {
  const { data } = useWorkerTodayQuery();
  const workerId = data?.workerId ?? '';
  const [tiles, setTiles] = useState<PhotoTile[]>([]);

  useEffect(() => {
    function sync(snapshot: ReadonlyMap<string, QueueItem>): void {
      const next: PhotoTile[] = [];
      snapshot.forEach((item) => {
        if (item.visitId !== visitId || item.phase !== phase) return;
        next.push({ index: item.index, localUri: item.localUri, status: item.status });
      });
      next.sort((a, b) => a.index - b.index);
      setTiles(next);
    }
    sync(r2UploadQueue.snapshot());
    return r2UploadQueue.onChange(sync);
  }, [visitId, phase]);

  const count = tiles.length;
  const floorMet = count >= MIN_PHOTOS_PER_PHASE;
  const canAddMore = count < MAX_PHOTOS_PER_PHASE;
  const needMore = Math.max(0, MIN_PHOTOS_PER_PHASE - count);

  /** "+ Add more" and back both return to capture with the good photos kept. */
  const addMore = useCallback(() => {
    const indices = tiles.map((t) => t.index).sort((a, b) => a - b);
    setRetakePreservedSlots(visitId, phase, indices);
    router.push({
      pathname: '/(worker)/capture/[visitId]/[step]',
      params: {
        visitId,
        step: captureStep,
        preserved: indices.join(','),
        retakeToken: String(Date.now()),
      },
    });
  }, [captureStep, phase, tiles, visitId]);

  // Contract: back / system back == "+ Add more" (non-destructive return).
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        addMore();
        return true;
      });
      return () => sub.remove();
    }, [addMore]),
  );

  const onTilePress = useCallback(
    async (tile: PhotoTile) => {
      if (tile.status === 'failed') {
        r2UploadQueue.retry(`${visitId}:${phase}:${tile.index}`);
        return;
      }
      // Remove the photo from this phase. The queue.onChange refreshes the grid;
      // the missing slot becomes obvious and "+ Add more" replaces it.
      if (workerId && canPersistCaptures()) {
        await deletePhoto(workerId, visitId, phase, tile.index);
      }
      r2UploadQueue.remove(`${visitId}:${phase}:${tile.index}`);
    },
    [phase, visitId, workerId],
  );

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom', 'left', 'right']}>
      <View style={s.topBar}>
        <Pressable
          onPress={addMore}
          accessibilityRole="button"
          accessibilityLabel="Back to capture (keeps your photos)"
          hitSlop={12}
          style={s.iconBtn}
        >
          <Feather name="arrow-left" size={20} color={tokens.color.ink.primary} />
        </Pressable>
        <Text style={s.title}>{headerTitle}</Text>
        <View style={s.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.summary}>
          {count} of {MAX_PHOTOS_PER_PHASE} photos · minimum {MIN_PHOTOS_PER_PHASE}
        </Text>

        {count === 0 ? (
          <View style={s.empty}>
            <Feather name="camera-off" size={28} color={tokens.color.ink.tertiary} />
            <Text style={s.emptyText}>No photos yet. Add at least {MIN_PHOTOS_PER_PHASE}.</Text>
          </View>
        ) : (
          <View style={s.grid}>
            {tiles.map((tile) => (
              <Pressable
                key={tile.index}
                onPress={() => void onTilePress(tile)}
                accessibilityRole="button"
                accessibilityLabel={
                  tile.status === 'failed'
                    ? `Retry upload for ${phase} photo ${tile.index}`
                    : `Remove ${phase} photo ${tile.index}`
                }
                style={s.tile}
              >
                <Image source={{ uri: tile.localUri }} style={s.thumb} resizeMode="cover" />
                <View style={s.removeBadge}>
                  <Feather
                    name={tile.status === 'failed' ? 'refresh-ccw' : 'x'}
                    size={13}
                    color={tokens.color.surface.card}
                  />
                </View>
                <Text style={[s.tileStatus, { color: statusColor(tile.status) }]} numberOfLines={1}>
                  {statusLabel(tile.status)}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {canAddMore ? (
          <Pressable
            onPress={addMore}
            accessibilityRole="button"
            accessibilityLabel="Add more photos"
            style={({ pressed }) => [s.addMoreBtn, pressed && { opacity: 0.85 }]}
          >
            <Feather name="plus" size={18} color={tokens.color.brand.accent} />
            <Text style={s.addMoreText}>Add more</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <View style={s.footer}>
        {primaryError ? (
          <Text style={s.errorText} accessibilityLiveRegion="polite">
            {primaryError}
          </Text>
        ) : null}
        <Pressable
          onPress={floorMet && !primaryBusy ? onPrimary : undefined}
          accessibilityRole="button"
          accessibilityLabel={primaryLabel}
          disabled={!floorMet || primaryBusy}
          accessibilityState={{ disabled: !floorMet || primaryBusy, busy: primaryBusy }}
          style={({ pressed }) => [
            s.primaryBtn,
            (!floorMet || primaryBusy) && s.primaryBtnDisabled,
            pressed && floorMet && !primaryBusy && { opacity: 0.92 },
          ]}
        >
          {primaryBusy ? (
            <ActivityIndicator size="small" color={tokens.color.surface.card} />
          ) : (
            <Text style={s.primaryText}>{primaryLabel}</Text>
          )}
        </Pressable>
        <Text style={s.hint}>
          {floorMet
            ? 'Uploads finish in the background — you don’t have to wait.'
            : `Take ${needMore} more ${phase} photo${needMore === 1 ? '' : 's'} to continue.`}
        </Text>
      </View>
    </SafeAreaView>
  );
}

const TILE_GAP = 8;

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
  summary: {
    fontSize: 12,
    color: tokens.color.ink.tertiary,
    marginBottom: 12,
    fontFamily: tokens.font.mono,
    letterSpacing: 0.6,
  },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 10 },
  emptyText: { fontSize: 14, color: tokens.color.ink.tertiary, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: TILE_GAP },
  tile: {
    width: '31.5%',
    backgroundColor: tokens.color.surface.card,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 6,
  },
  thumb: { width: '100%', aspectRatio: 3 / 4 },
  removeBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(26,22,18,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileStatus: {
    fontSize: 9,
    paddingHorizontal: 6,
    paddingVertical: 4,
    letterSpacing: 0.4,
  },
  addMoreBtn: {
    marginTop: 10,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: tokens.color.brand.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addMoreText: { fontSize: 14, fontWeight: '700', color: tokens.color.brand.accent },
  footer: { paddingHorizontal: 20, paddingBottom: 18, paddingTop: 12, gap: 8 },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    color: tokens.color.semantic.bad,
    textAlign: 'center',
  },
  primaryBtn: {
    height: 52,
    backgroundColor: tokens.color.brand.accent,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryText: { fontSize: 16, fontWeight: '700', color: tokens.color.surface.card },
  hint: { textAlign: 'center', fontSize: 11, color: tokens.color.ink.tertiary },
});
