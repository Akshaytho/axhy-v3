/**
 * photo-sweep — unit tests
 *
 * @derives(NEXT_SESSION.md §2b-4)
 */
 

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

// Hoisted mock module: defined before vi.mock factory runs, exposed to tests.
const fsMock = vi.hoisted(() => {
  type DirConfig = {
    exists?: boolean;
    modificationTime?: number;
    infoThrows?: boolean;
  };

  const dirConfigs = new Map<string, DirConfig>();
  const deleteCalls: string[] = [];

  class DirectoryMock {
    uri: string;
    exists: boolean;
    private modTime: number;
    private infoThrows: boolean;
    constructor(uri: string) {
      this.uri = uri;
      const cfg = dirConfigs.get(uri) ?? {};
      this.exists = cfg.exists ?? true;
      this.modTime = cfg.modificationTime ?? 0;
      this.infoThrows = cfg.infoThrows ?? false;
    }
    info(): { modificationTime: number } {
      if (this.infoThrows) throw new Error('stat failed');
      return { modificationTime: this.modTime };
    }
    delete(): void {
      deleteCalls.push(this.uri);
    }
  }

  return { DirectoryMock, dirConfigs, deleteCalls };
});

vi.mock('expo-file-system', () => ({
  documentDirectory: 'file:///data/documents/',
  Directory: fsMock.DirectoryMock,
}));

vi.mock('./per-user-partition', () => ({
  canPersistCaptures: vi.fn(() => true),
  listVisitDirs: vi.fn(),
}));

vi.mock('./local-kv', () => ({
  getKvItem: vi.fn(),
  setKvItem: vi.fn(),
}));

import { canPersistCaptures, listVisitDirs } from './per-user-partition';
import { getKvItem, setKvItem } from './local-kv';
import { maybeSweepOldPhotos } from './photo-sweep';

const NOW = 1_748_000_000_000;
// Production code compares dir.info().modificationTime (milliseconds) against
// cutoffMs = now - 30 days. Use ms-precision fixtures.
const THIRTY_ONE_DAYS_AGO_MS = NOW - 31 * 24 * 60 * 60 * 1000;
const TWENTY_NINE_DAYS_AGO_MS = NOW - 29 * 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  fsMock.dirConfigs.clear();
  fsMock.deleteCalls.length = 0;
  vi.mocked(getKvItem).mockResolvedValue(null);
  vi.mocked(setKvItem).mockResolvedValue(undefined);
  vi.mocked(listVisitDirs).mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('maybeSweepOldPhotos', () => {
  it('deletes visit dirs older than 30 days', async () => {
    const dir = 'file:///data/documents/captures/w1/v-old/';
    vi.mocked(listVisitDirs).mockResolvedValue([dir]);
    fsMock.dirConfigs.set(dir, { exists: true, modificationTime: THIRTY_ONE_DAYS_AGO_MS });

    await maybeSweepOldPhotos('w1');

    expect(fsMock.deleteCalls).toContain(dir);
    expect(setKvItem).toHaveBeenCalledWith('axhy-sweep-lastRun', String(NOW));
  });

  it('keeps visit dirs within 30 days', async () => {
    const dir = 'file:///data/documents/captures/w1/v-recent/';
    vi.mocked(listVisitDirs).mockResolvedValue([dir]);
    fsMock.dirConfigs.set(dir, { exists: true, modificationTime: TWENTY_NINE_DAYS_AGO_MS });

    await maybeSweepOldPhotos('w1');

    expect(fsMock.deleteCalls).toHaveLength(0);
    expect(setKvItem).toHaveBeenCalled();
  });

  it('no-ops if already swept within the last 24 hours', async () => {
    vi.mocked(getKvItem).mockResolvedValue(String(NOW - 1000));
    const dir = 'file:///data/documents/captures/w1/v-old/';
    vi.mocked(listVisitDirs).mockResolvedValue([dir]);
    fsMock.dirConfigs.set(dir, { exists: true, modificationTime: THIRTY_ONE_DAYS_AGO_MS });

    await maybeSweepOldPhotos('w1');

    expect(fsMock.deleteCalls).toHaveLength(0);
    expect(setKvItem).not.toHaveBeenCalled();
  });

  it('continues sweep if one dir stat throws', async () => {
    const dir1 = 'file:///data/documents/captures/w1/v1/';
    const dir2 = 'file:///data/documents/captures/w1/v2/';
    vi.mocked(listVisitDirs).mockResolvedValue([dir1, dir2]);
    fsMock.dirConfigs.set(dir1, { exists: true, infoThrows: true });
    fsMock.dirConfigs.set(dir2, { exists: true, modificationTime: THIRTY_ONE_DAYS_AGO_MS });

    await maybeSweepOldPhotos('w1');

    expect(fsMock.deleteCalls).toEqual([dir2]);
    expect(setKvItem).toHaveBeenCalled();
  });

  it('no-ops on web (canPersistCaptures returns false)', async () => {
    vi.mocked(canPersistCaptures).mockReturnValue(false);

    await maybeSweepOldPhotos('w1');

    expect(listVisitDirs).not.toHaveBeenCalled();
    expect(fsMock.deleteCalls).toHaveLength(0);
  });
});
