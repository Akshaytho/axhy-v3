/**
 * reinstall-rehydration — unit tests
 *
 * @derives(NEXT_SESSION.md §2b-4)
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

// Hoisted mock module: defined before vi.mock factory runs, exposed to tests.
const fsMock = vi.hoisted(() => {
  const directoryRegistry = new Map<string, any>();

  class FileMock {
    uri: string;
    name: string;
    exists = true;
    size = 1024;
    constructor(parent: { uri: string } | string, name: string) {
      const parentUri = typeof parent === 'string' ? parent : parent.uri;
      const base = parentUri.endsWith('/') ? parentUri : `${parentUri}/`;
      this.uri = `${base}${name}`;
      this.name = name;
    }
  }

  class DirectoryMock {
    uri: string;
    exists = true;
    entries: any[] = [];
    constructor(uri: string) {
      this.uri = uri;
      const existing = directoryRegistry.get(uri);
      if (existing) {
        this.exists = existing.exists;
        this.entries = existing.entries;
        return;
      }
      directoryRegistry.set(uri, this);
    }
    list(): any[] {
      return this.entries;
    }
    setEntries(entries: any[]): void {
      this.entries = entries;
    }
    setExists(value: boolean): void {
      this.exists = value;
    }
  }

  return { FileMock, DirectoryMock, directoryRegistry };
});

vi.mock('expo-file-system', () => ({
  documentDirectory: 'file:///data/documents/',
  File: fsMock.FileMock,
  Directory: fsMock.DirectoryMock,
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

import { r2UploadQueue } from '../r2-upload-queue';

import { canPersistCaptures, listVisitDirs } from './per-user-partition';
import { rehydrateFromPartition } from './reinstall-rehydration';

const DIR = 'file:///data/documents/captures/worker-1/visit-1/';

/** Helper: register a DirectoryMock at uri with the given file entries. */
function setupDir(uri: string, fileNames: string[]): any {
  const dir = new fsMock.DirectoryMock(uri);
  dir.setExists(true);
  const files = fileNames.map((name) => new fsMock.FileMock(uri.replace(/\/$/, ''), name));
  dir.setEntries(files);
  return dir;
}

beforeEach(() => {
  vi.clearAllMocks();
  fsMock.directoryRegistry.clear();
  vi.mocked(listVisitDirs).mockResolvedValue([DIR]);
  vi.mocked(r2UploadQueue.getStatus).mockReturnValue(null);
  vi.mocked(r2UploadQueue.enqueue).mockReturnValue('key');
});

describe('rehydrateFromPartition', () => {
  it('re-enqueues orphaned photo files not in the queue', async () => {
    setupDir(DIR, ['before-01.jpg', 'before-02.jpg']);

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
    setupDir(DIR, ['after-01.jpg']);
    vi.mocked(r2UploadQueue.getStatus).mockReturnValue({ status: 'done' } as any);

    await rehydrateFromPartition('worker-1');

    expect(r2UploadQueue.enqueue).not.toHaveBeenCalled();
  });

  it('skips non-photo files (metadata, thumbnails)', async () => {
    setupDir(DIR, ['_meta.json', 'thumb.png', '.DS_Store']);

    await rehydrateFromPartition('worker-1');

    expect(r2UploadQueue.enqueue).not.toHaveBeenCalled();
  });

  it('continues if one visit dir fails to read', async () => {
    const badDir = 'file:///bad/';
    vi.mocked(listVisitDirs).mockResolvedValue([DIR, badDir]);
    setupDir(DIR, ['before-01.jpg']);
    // Register a directory whose list() throws to simulate read failure.
    const broken = new fsMock.DirectoryMock(badDir);
    broken.list = () => {
      throw new Error('read failed');
    };

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
