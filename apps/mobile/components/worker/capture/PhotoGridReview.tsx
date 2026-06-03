/**
 * Photo grid review surface (capture step 5).
 *
 * Renders 6 tiles (3 before + 3 after) sourced from the per-user partition
 * with per-tile upload status from r2UploadQueue. Each tile is tappable to
 * retake (deletes local file, removes queue entry, navigates back to the
 * appropriate phase screen).
 *
 * @derives(WORKER_MVP_SLICE_2B_2_PLAN.md §1)
 */

import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { tokens } from '@axhy/ui-tokens';
import type { PhotoPhase } from '@axhy/shared-schema';

import { useWorkerTodayQuery } from '../../../lib/queries/use-worker-today';
import {
  canPersistCaptures,
  deletePhoto,
  listPhotos,
} from '../../../lib/storage/per-user-partition';
import { r2UploadQueue, type QueueItem, type UploadStatus } from '../../../lib/r2-upload-queue';
import { shouldRetryFailedUpload } from '../../../lib/capture-flow';
import { setRetakePreservedSlots } from '../../../lib/capture-retake-state';

const SLOTS: ReadonlyArray<{ phase: PhotoPhase; index: number }> = [
  { phase: 'before', index: 1 },
  { phase: 'before', index: 2 },
  { phase: 'before', index: 3 },
  { phase: 'after', index: 1 },
  { phase: 'after', index: 2 },
  { phase: 'after', index: 3 },
];

type TileState = {
  phase: PhotoPhase;
  index: number;
  localUri: string | null;
  status: UploadStatus | null;
};

function statusLabel(status: UploadStatus | null): string {
  if (status === 'done') return 'Uploaded';
  if (status === 'uploading') return 'Uploading…';
  if (status === 'failed') return 'Upload failed — tap retry';
  if (status === 'idle') return 'Queued';
  return 'Not captured';
}

function statusColor(status: UploadStatus | null): string {
  if (status === 'done') return tokens.color.brand.accent;
  if (status === 'failed') return tokens.color.ink.primary;
  return tokens.color.ink.tertiary;
}

type Props = {
  visitId: string;
};

/** @derives(master-plan §G) */
export function PhotoGridReview({ visitId }: Props): React.JSX.Element {
  const { data } = useWorkerTodayQuery();
  const workerId = data?.workerId ?? '';
  const [tiles, setTiles] = useState<TileState[]>(() =>
    SLOTS.map((s) => ({ phase: s.phase, index: s.index, localUri: null, status: null })),
  );

  const refresh = useCallback(async () => {
    if (!workerId || !canPersistCaptures()) {
      const queueSnapshot = r2UploadQueue.snapshot();
      setTiles((prev) =>
        prev.map((tile) => {
          const queued = queueSnapshot.get(`${visitId}:${tile.phase}:${tile.index}`);
          return {
            ...tile,
            localUri: queued?.localUri ?? null,
            status: queued?.status ?? null,
          };
        }),
      );
      return;
    }

    const [beforePaths, afterPaths] = await Promise.all([
      listPhotos(workerId, visitId, 'before'),
      listPhotos(workerId, visitId, 'after'),
    ]);
    setTiles((prev) =>
      prev.map((tile) => {
        const sourceList = tile.phase === 'before' ? beforePaths : afterPaths;
        const matched = sourceList.find((p) =>
          p.includes(`/${tile.phase}-${String(tile.index).padStart(2, '0')}.`),
        );
        return { ...tile, localUri: matched ?? null };
      }),
    );
  }, [workerId, visitId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    function applyStatuses(snapshot: ReadonlyMap<string, QueueItem>): void {
      setTiles((prev) =>
        prev.map((tile) => {
          const key = `${visitId}:${tile.phase}:${tile.index}`;
          const item = snapshot.get(key);
          return {
            ...tile,
            localUri: item?.localUri ?? tile.localUri,
            status: item ? item.status : tile.status,
          };
        }),
      );
    }
    applyStatuses(r2UploadQueue.snapshot());
    return r2UploadQueue.onChange(applyStatuses);
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
        .filter(
          (candidate) =>
            candidate.phase === tile.phase &&
            candidate.index !== tile.index &&
            (candidate.localUri !== null || candidate.status !== null),
        )
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
            {tile.localUri ? (
              <Image source={{ uri: tile.localUri }} style={s.thumb} resizeMode="cover" />
            ) : (
              <View style={s.emptyThumb}>
                <Text style={s.emptyTileLabel}>
                  {tile.phase} {tile.index}
                </Text>
              </View>
            )}
            <Text style={[s.tileStatus, { color: statusColor(tile.status) }]}>
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
  title: {
    fontSize: tokens.type.display.size,
    fontWeight: String(tokens.weight.semibold) as '600',
    color: tokens.color.ink.primary,
  },
  subtitle: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.tertiary,
    lineHeight: tokens.type.body.size * 1.45,
    marginBottom: tokens.space[2],
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: TILE_GAP,
  },
  tile: {
    width: `48%`,
    backgroundColor: tokens.color.surface.card,
    borderRadius: tokens.radius.r3,
    overflow: 'hidden',
    paddingBottom: tokens.space[3],
    marginBottom: tokens.space[2],
  },
  thumb: {
    width: '100%',
    aspectRatio: 3 / 4,
  },
  emptyThumb: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: tokens.color.surface.paper2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTileLabel: {
    fontSize: tokens.type.body.size,
    color: tokens.color.ink.tertiary,
    textTransform: 'capitalize',
  },
  tileStatus: {
    fontSize: tokens.type.caption.size,
    paddingHorizontal: tokens.space[3],
    paddingTop: tokens.space[2],
    letterSpacing: tokens.type.caption.tracking,
  },
  tilePhase: {
    fontSize: tokens.type.caption.size,
    color: tokens.color.ink.tertiary,
    paddingHorizontal: tokens.space[3],
    paddingTop: 2,
    letterSpacing: tokens.type.caption.tracking,
    textTransform: 'uppercase',
  },
});
