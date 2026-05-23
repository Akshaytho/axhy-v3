/**
 * photo-sweep — unit tests
 *
 * @derives(NEXT_SESSION.md §2b-4)
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

vi.mock('expo-file-system', () => ({
  documentDirectory: 'file:///data/documents/',
  getInfoAsync: vi.fn(),
  deleteAsync: vi.fn(),
  makeDirectoryAsync: vi.fn(),
  readAsStringAsync: vi.fn(),
  writeAsStringAsync: vi.fn(),
}));

vi.mock('./per-user-partition', () => ({
  canPersistCaptures: vi.fn(() => true),
  listVisitDirs: vi.fn(),
}));

vi.mock('./local-kv', () => ({
  getKvItem: vi.fn(),
  setKvItem: vi.fn(),
}));

import * as FileSystem from 'expo-file-system';

import { canPersistCaptures, listVisitDirs } from './per-user-partition';
import { getKvItem, setKvItem } from './local-kv';
import { maybeSweepOldPhotos } from './photo-sweep';

const NOW = 1_748_000_000_000;
const THIRTY_ONE_DAYS_AGO_SEC = (NOW - 31 * 24 * 60 * 60 * 1000) / 1000;
const TWENTY_NINE_DAYS_AGO_SEC = (NOW - 29 * 24 * 60 * 60 * 1000) / 1000;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.mocked(getKvItem).mockResolvedValue(null);
  vi.mocked(setKvItem).mockResolvedValue(undefined);
  vi.mocked(listVisitDirs).mockResolvedValue([]);
  vi.mocked(FileSystem.getInfoAsync).mockResolvedValue({
    exists: true,
    isDirectory: true,
    modificationTime: THIRTY_ONE_DAYS_AGO_SEC,
    uri: '',
  } as any);
  vi.mocked(FileSystem.deleteAsync).mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('maybeSweepOldPhotos', () => {
  it('deletes visit dirs older than 30 days', async () => {
    const dir = 'file:///data/documents/captures/w1/v-old/';
    vi.mocked(listVisitDirs).mockResolvedValue([dir]);
    vi.mocked(FileSystem.getInfoAsync).mockResolvedValue({
      exists: true,
      isDirectory: true,
      modificationTime: THIRTY_ONE_DAYS_AGO_SEC,
      uri: dir,
    } as any);

    await maybeSweepOldPhotos('w1');

    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(dir, { idempotent: true });
    expect(setKvItem).toHaveBeenCalledWith('axhy-sweep-lastRun', String(NOW));
  });

  it('keeps visit dirs within 30 days', async () => {
    const dir = 'file:///data/documents/captures/w1/v-recent/';
    vi.mocked(listVisitDirs).mockResolvedValue([dir]);
    vi.mocked(FileSystem.getInfoAsync).mockResolvedValue({
      exists: true,
      isDirectory: true,
      modificationTime: TWENTY_NINE_DAYS_AGO_SEC,
      uri: dir,
    } as any);

    await maybeSweepOldPhotos('w1');

    expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
    expect(setKvItem).toHaveBeenCalled();
  });

  it('no-ops if already swept within the last 24 hours', async () => {
    vi.mocked(getKvItem).mockResolvedValue(String(NOW - 1000));
    vi.mocked(listVisitDirs).mockResolvedValue(['file:///data/documents/captures/w1/v-old/']);

    await maybeSweepOldPhotos('w1');

    expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
    expect(setKvItem).not.toHaveBeenCalled();
  });

  it('continues sweep if one dir stat throws', async () => {
    const dir1 = 'file:///data/documents/captures/w1/v1/';
    const dir2 = 'file:///data/documents/captures/w1/v2/';
    vi.mocked(listVisitDirs).mockResolvedValue([dir1, dir2]);
    vi.mocked(FileSystem.getInfoAsync)
      .mockRejectedValueOnce(new Error('stat failed'))
      .mockResolvedValueOnce({
        exists: true,
        isDirectory: true,
        modificationTime: THIRTY_ONE_DAYS_AGO_SEC,
        uri: dir2,
      } as any);

    await maybeSweepOldPhotos('w1');

    expect(FileSystem.deleteAsync).toHaveBeenCalledWith(dir2, { idempotent: true });
    expect(setKvItem).toHaveBeenCalled();
  });

  it('no-ops on web (canPersistCaptures returns false)', async () => {
    vi.mocked(canPersistCaptures).mockReturnValue(false);

    await maybeSweepOldPhotos('w1');

    expect(listVisitDirs).not.toHaveBeenCalled();
    expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
  });
});
