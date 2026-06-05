/**
 * Final-review photo grid (capture step 7).
 *
 * Renders every captured before + after photo (up to 8 per phase, BUG-02)
 * sourced from the upload queue with per-tile upload status.
 *
 * Founder fix 2026-06-04: a normal tap on a tile now opens the photo
 * FULL-SCREEN to VIEW it (not retake). Retake is a deliberate action inside
 * the full-screen viewer, so a worker reviewing before submit can no longer
 * accidentally delete + re-shoot a good photo just by tapping it. A failed
 * upload still taps-to-retry.
 *
 * @derives(WORKER_MVP_SLICE_2B_2_PLAN.md §1)
 */

import { useCallback, useEffect, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { tokens } from '@axhy/ui-tokens';
import type { PhotoPhase } from '@axhy/shared-schema';

import { useWorkerTodayQuery } from '../../../lib/queries/use-worker-today';
import { canPersistCaptures, deletePhoto } from '../../../lib/storage/per-user-partition';
import { r2UploadQueue, type QueueItem, type UploadStatus } from '../../../lib/r2-upload-queue';
import { shouldRetryFailedUpload } from '../../../lib/capture-flow';
import { setRetakePreservedSlots } from '../../../lib/capture-retake-state';

type TileState = {
  phase: PhotoPhase;
  index: number;
  localUri: string;
  status: UploadStatus;
};

function statusLabel(status: UploadStatus): string {
  if (status === 'done') return 'Uploaded';
  if (status === 'uploading') return 'Uploading…';
  if (status === 'failed') return 'Upload failed — tap retry';
  return 'Queued';
}

function statusColor(status: UploadStatus): string {
  if (status === 'done') return tokens.color.brand.accent;
  if (status === 'failed') return tokens.color.semantic.bad;
  return tokens.color.ink.tertiary;
}

function phaseRank(phase: PhotoPhase): number {
  return phase === 'before' ? 0 : 1;
}

type Props = {
  visitId: string;
};

/** @derives(master-plan §G) */
export function PhotoGridReview({ visitId }: Props): React.JSX.Element {
  const { data } = useWorkerTodayQuery();
  const workerId = data?.workerId ?? '';
  const [tiles, setTiles] = useState<TileState[]>([]);
  // The photo currently shown full-screen (null = viewer closed).
  const [viewer, setViewer] = useState<TileState | null>(null);

  useEffect(() => {
    function sync(snapshot: ReadonlyMap<string, QueueItem>): void {
      const next: TileState[] = [];
      snapshot.forEach((item) => {
        if (item.visitId !== visitId) return;
        next.push({
          phase: item.phase,
          index: item.index,
          localUri: item.localUri,
          status: item.status,
        });
      });
      next.sort((a, b) =>
        a.phase === b.phase ? a.index - b.index : phaseRank(a.phase) - phaseRank(b.phase),
      );
      setTiles(next);
    }
    sync(r2UploadQueue.snapshot());
    return r2UploadQueue.onChange(sync);
  }, [visitId]);

  const retake = useCallback(
    async (phase: PhotoPhase, index: number, preservedSlotIndices: ReadonlyArray<number>) => {
      if (workerId && canPersistCaptures()) {
        await deletePhoto(workerId, visitId, phase, index);
      }
      r2UploadQueue.remove(`${visitId}:${phase}:${index}`);
      setRetakePreservedSlots(visitId, phase, preservedSlotIndices);
      const step = phase === 'before' ? 'before-photos' : 'after-photos';
      router.push({
        pathname: '/(worker)/capture/[visitId]/[step]',
        params: {
          visitId,
          step,
          preserved: preservedSlotIndices.join(','),
          retakeToken: String(Date.now()),
        },
      });
    },
    [workerId, visitId],
  );

  // A normal tap: VIEW the photo full-screen. A failed upload: tap to retry.
  const onTilePress = useCallback(
    (tile: TileState) => {
      const key = `${visitId}:${tile.phase}:${tile.index}`;
      if (shouldRetryFailedUpload(tile.status, tile.localUri)) {
        r2UploadQueue.retry(key);
        return;
      }
      setViewer(tile);
    },
    [visitId],
  );

  // Deliberate retake from inside the viewer (preserves the other good photos).
  const retakeFromViewer = useCallback(
    async (tile: TileState) => {
      const preserved = tiles
        .filter((candidate) => candidate.phase === tile.phase && candidate.index !== tile.index)
        .map((candidate) => candidate.index)
        .sort((a, b) => a - b);
      setViewer(null);
      await retake(tile.phase, tile.index, preserved);
    },
    [retake, tiles],
  );

  return (
    <>
      <ScrollView contentContainerStyle={s.scrollBody}>
        <View style={s.grid}>
          {tiles.map((tile) => (
            <Pressable
              key={`${tile.phase}-${tile.index}`}
              onPress={() => onTilePress(tile)}
              accessibilityRole="button"
              accessibilityLabel={
                shouldRetryFailedUpload(tile.status, tile.localUri)
                  ? `Retry upload for ${tile.phase} photo ${tile.index}`
                  : `View ${tile.phase} photo ${tile.index} full screen`
              }
              style={s.tile}
            >
              <Image source={{ uri: tile.localUri }} style={s.thumb} resizeMode="cover" />
              <Text style={[s.tileStatus, { color: statusColor(tile.status) }]} numberOfLines={1}>
                {statusLabel(tile.status)}
              </Text>
              <Text style={s.tilePhase}>
                {tile.phase.toUpperCase()} · {tile.index}
              </Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      <Modal
        visible={viewer !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setViewer(null)}
      >
        <View style={s.viewerRoot}>
          {viewer ? (
            <>
              <Image source={{ uri: viewer.localUri }} style={s.viewerImage} resizeMode="contain" />
              <View style={s.viewerCaption}>
                <Text style={s.viewerCaptionText}>
                  {viewer.phase.toUpperCase()} · PHOTO {viewer.index}
                </Text>
              </View>
              <Pressable
                onPress={() => setViewer(null)}
                accessibilityRole="button"
                accessibilityLabel="Close photo"
                hitSlop={16}
                style={s.viewerClose}
              >
                <Feather name="x" size={24} color="#fff" />
              </Pressable>
              <View style={s.viewerActions}>
                <Pressable
                  onPress={() => void retakeFromViewer(viewer)}
                  accessibilityRole="button"
                  accessibilityLabel={`Retake ${viewer.phase} photo ${viewer.index}`}
                  style={s.viewerRetake}
                >
                  <Feather name="refresh-ccw" size={16} color="#fff" />
                  <Text style={s.viewerRetakeText}>Retake this photo</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const TILE_GAP = 8;

const s = StyleSheet.create({
  scrollBody: {
    padding: tokens.space[4],
    gap: tokens.space[3],
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TILE_GAP,
  },
  tile: {
    width: '31.5%',
    backgroundColor: tokens.color.surface.card,
    borderRadius: tokens.radius.r3,
    overflow: 'hidden',
    paddingBottom: tokens.space[2],
    marginBottom: tokens.space[2],
  },
  thumb: {
    width: '100%',
    aspectRatio: 3 / 4,
  },
  tileStatus: {
    fontSize: 9,
    paddingHorizontal: tokens.space[2],
    paddingTop: tokens.space[2],
    letterSpacing: 0.3,
  },
  tilePhase: {
    fontSize: 9,
    color: tokens.color.ink.tertiary,
    paddingHorizontal: tokens.space[2],
    paddingTop: 2,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  viewerRoot: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerImage: {
    width: '100%',
    height: '78%',
  },
  viewerCaption: {
    position: 'absolute',
    top: 56,
    alignSelf: 'center',
  },
  viewerCaptionText: {
    color: 'rgba(255,255,255,0.85)',
    fontFamily: tokens.font.mono,
    fontSize: 12,
    letterSpacing: 1.1,
  },
  viewerClose: {
    position: 'absolute',
    top: 48,
    right: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerActions: {
    position: 'absolute',
    bottom: 48,
    alignSelf: 'center',
  },
  viewerRetake: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  viewerRetakeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
