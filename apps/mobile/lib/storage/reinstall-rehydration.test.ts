/**
 * reinstall-rehydration — unit tests
 *
 * @derives(NEXT_SESSION.md §2b-4)
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

vi.mock('expo-file-system', () => ({
  documentDirectory: 'file:///data/documents/',
  getInfoAsync: vi.fn(),
  readDirectoryAsync: vi.fn(),
}));

vi.mock('./per-user-partition', () => ({
  canPersistCaptures: vi.fn(() => true),
  listVisitDirs: vi.fn(),
}));

vi.mock('../r2-upload-queue', () => ({
  r2UploadQueue: {
    getStatus: vi.fn(() => null),
    enqueue: vi.fn(() => 'key'),
  },
}));

import * as FileSystem from 'expo-file-system';

import { r2UploadQueue } from '../r2-upload-queue';

import { canPersistCaptures, listVisitDirs } from './per-user-partition';
import { rehydrateFromPartition } from './reinstall-rehydration';

const DIR = 'file:///data/documents/captures/worker-1/visit-1/';

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listVisitDirs).mockResolvedValue([DIR]);
  vi.mocked(FileSystem.getInfoAsync).mockImplementation(async (uri) => {
    if (uri.endsWith('/')) return { exists: true, isDirectory: true, uri } as any;
    return { exists: true, isDirectory: false, size: 123_456, uri } as any;
  });
  vi.mocked(FileSystem.readDirectoryAsync).mockResolvedValue([]);
  vi.mocked(r2UploadQueue.getStatus).mockReturnValue(null);
  vi.mocked(r2UploadQueue.enqueue).mockReturnValue('key');
});

describe('rehydrateFromPartition', () => {
  it('re-enqueues orphaned photo files not in the queue', async () => {
    vi.mocked(FileSystem.readDirectoryAsync).mockResolvedValue(['before-01.jpg', 'before-02.jpg']);

    await rehydrateFromPartition('worker-1');

    expect(r2UploadQueue.enqueue).toHaveBeenCalledTimes(2);
    expect(r2UploadQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ visitId: 'visit-1', phase: 'before', index: 1 }),
    );
    expect(r2UploadQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ visitId: 'visit-1', phase: 'before', index: 2 }),
    );
  });

  it('skips photos already tracked in the queue', async () => {
    vi.mocked(FileSystem.readDirectoryAsync).mockResolvedValue(['after-01.jpg']);
    vi.mocked(r2UploadQueue.getStatus).mockReturnValue({ status: 'done' } as any);

    await rehydrateFromPartition('worker-1');

    expect(r2UploadQueue.enqueue).not.toHaveBeenCalled();
  });

  it('skips non-photo files (metadata, thumbnails)', async () => {
    vi.mocked(FileSystem.readDirectoryAsync).mockResolvedValue([
      '_meta.json',
      'thumb.png',
      '.DS_Store',
    ]);

    await rehydrateFromPartition('worker-1');

    expect(r2UploadQueue.enqueue).not.toHaveBeenCalled();
  });

  it('continues if one visit dir fails to read', async () => {
    vi.mocked(listVisitDirs).mockResolvedValue([DIR, 'file:///bad/']);
    vi.mocked(FileSystem.readDirectoryAsync)
      .mockResolvedValueOnce(['before-01.jpg'])
      .mockRejectedValueOnce(new Error('read failed'));

    await rehydrateFromPartition('worker-1');

    expect(r2UploadQueue.enqueue).toHaveBeenCalledTimes(1);
  });

  it('no-ops on web (canPersistCaptures returns false)', async () => {
    vi.mocked(canPersistCaptures).mockReturnValue(false);

    await rehydrateFromPartition('worker-1');

    expect(listVisitDirs).not.toHaveBeenCalled();
    expect(r2UploadQueue.enqueue).not.toHaveBeenCalled();
  });
});
