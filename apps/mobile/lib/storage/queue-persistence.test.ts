/**
 * queue-persistence — unit tests
 *
 * @derives(NEXT_SESSION.md §2b-4)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

vi.mock('expo-file-system', () => ({
  documentDirectory: 'file:///data/documents/',
  getInfoAsync: vi.fn(),
  makeDirectoryAsync: vi.fn(),
  readAsStringAsync: vi.fn(),
  writeAsStringAsync: vi.fn(),
}));

vi.mock('./local-kv', () => ({
  getKvItem: vi.fn(),
  setKvItem: vi.fn(),
}));

import type { QueueItem } from '../r2-upload-queue';

import { getKvItem, setKvItem } from './local-kv';
import { saveQueueState, loadQueueState } from './queue-persistence';

function makeItem(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    visitId: 'visit-1',
    phase: 'before',
    index: 1,
    localUri: 'file:///photos/before-01.jpg',
    contentType: 'image/jpeg',
    fileSize: 500_000,
    status: 'idle',
    attempts: 0,
    objectKey: null,
    lastError: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(setKvItem).mockResolvedValue(undefined);
  vi.mocked(getKvItem).mockResolvedValue(null);
});

describe('saveQueueState', () => {
  it('persists idle, failed, and done items', async () => {
    const items = new Map<string, QueueItem>([
      ['k1', makeItem({ status: 'idle' })],
      ['k2', makeItem({ phase: 'after', status: 'failed', attempts: 3 })],
      ['k3', makeItem({ phase: 'after', status: 'done', objectKey: 'r2/key' })],
    ]);

    await saveQueueState(items);

    const raw = vi.mocked(setKvItem).mock.calls[0]?.[1];
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!);
    expect(parsed['k1'].status).toBe('idle');
    expect(parsed['k2'].status).toBe('failed');
    expect(parsed['k3']).toMatchObject({ status: 'done', objectKey: 'r2/key' });
  });

  it('resets uploading items to idle', async () => {
    const items = new Map<string, QueueItem>([
      ['up-key', makeItem({ status: 'uploading', attempts: 1 })],
    ]);

    await saveQueueState(items);

    const raw = vi.mocked(setKvItem).mock.calls[0]?.[1];
    const parsed = JSON.parse(raw!);
    expect(parsed['up-key'].status).toBe('idle');
  });
});

describe('loadQueueState', () => {
  it('round-trips: restored map matches saved items', async () => {
    const original = makeItem({ status: 'failed', attempts: 2 });
    vi.mocked(getKvItem).mockResolvedValue(JSON.stringify({ k1: original }));

    const result = await loadQueueState();

    expect(result.size).toBe(1);
    expect(result.get('k1')).toMatchObject({ status: 'failed', attempts: 2, phase: 'before' });
  });

  it('returns empty map when no persisted state', async () => {
    vi.mocked(getKvItem).mockResolvedValue(null);

    const result = await loadQueueState();

    expect(result.size).toBe(0);
  });

  it('returns empty map on corrupt JSON without throwing', async () => {
    vi.mocked(getKvItem).mockResolvedValue('{not valid json}');

    const result = await loadQueueState();

    expect(result.size).toBe(0);
  });
});
