/**
 * Final-review photo grid (capture step 7).
 *
 * Renders every captured before + after photo (up to 8 per phase, BUG-02)
 * sourced from the upload queue with per-tile upload status. Each tile is
 * tappable to retake (deletes the local file, removes the queue entry,
 * navigates back to the phase capture screen with the other good photos
 * preserved) or, when failed, to retry the upload.
 *
 * @derives(WORKER_MVP_SLICE_2B_2_PLAN.md §1)
 */

import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
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

  const onTilePress = useCallback(
    async (tile: TileState) => {
      const key = `${visitId}:${tile.phase}:${tile.index}`;
      if (shouldRetryFailedUpload(tile.status, tile.localUri)) {
        r2UploadQueue.retry(key);
        return;
      }
      const preserved = tiles
        .filter((candidate) => candidate.phase === tile.phase && candidate.index !== tile.index)
        .map((candidate) => candidate.index)
        .sort((a, b) => a - b);
      await retake(tile.phase, tile.index, preserved);
    },
    [retake, tiles, visitId],
  );

  return (
    <ScrollView contentContainerStyle={s.scrollBody}>
      <View style={s.grid}>
        {tiles.map((tile) => (
          <Pressable
            key={`${tile.phase}-${tile.index}`}
            onPress={() => void onTilePress(tile)}
            accessibilityRole="button"
            accessibilityLabel={
              shouldRetryFailedUpload(tile.status, tile.localUri)
                ? `Retry upload for ${tile.phase} photo ${tile.index}`
                : `Retake ${tile.phase} photo ${tile.index}`
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
});
