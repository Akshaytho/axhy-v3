/**
 * Mobile R2 upload queue.
 *
 * Workers can capture all 6 photos faster than the network can upload them,
 * so the queue accepts photos as they're captured and runs uploads serially
 * in the background with exponential backoff on failure. The capture flow
 * never blocks on the network.
 *
 * The queue is persisted to disk (lib/storage/queue-persistence → local-kv) and
 * rehydrated on cold-start by the worker layout, so queued photos survive an app
 * kill (locked standard E6). Every network step is bounded by the timeout helper
 * (lib/uploads/r2-put) so a stalled socket aborts and the backoff below retries
 * rather than hanging the worker on "uploading…" forever (HIGH-12).
 *
 * @derives(WORKER_MVP_SLICE_2B_2_PLAN.md §1)
 */

import { Platform } from 'react-native';
import type { PhotoPhase, UploadUrlEntry } from '@axhy/shared-schema';

import { API_BASE } from './api';
import { getTokens } from './auth-store';
import { API_ROUTES } from './api-routes';
import { requestUploadUrls } from './api-capture';
import { fetchWithTimeout, putFileToR2, UPLOAD_TIMEOUT_MS } from './uploads/r2-put';

/** @derives(master-plan §G) */
export type UploadStatus = 'idle' | 'uploading' | 'done' | 'failed';

/** @derives(master-plan §G) */
export type QueueItem = {
  visitId: string;
  phase: PhotoPhase;
  index: number;
  localUri: string;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  fileSize: number;
  status: UploadStatus;
  attempts: number;
  objectKey: string | null;
  lastError: string | null;
};

type Listener = (snapshot: ReadonlyMap<string, QueueItem>) => void;

const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 32_000, 60_000];
const MAX_ATTEMPTS = BACKOFF_MS.length;

/** True on react-native-web. Web browsers cannot PUT directly to R2 from
 *  arbitrary origins without bucket-side CORS rules we do not control from
 *  application code — so web uploads go through the backend proxy fallback
 *  while native (iOS / Android) keeps the presigned-direct path. */
function isWebPlatform(): boolean {
  return Platform.OS === 'web';
}

function keyOf(visitId: string, phase: PhotoPhase, index: number): string {
  return `${visitId}:${phase}:${index}`;
}

class R2UploadQueue {
  private items = new Map<string, QueueItem>();
  private listeners = new Set<Listener>();
  private running = false;

  /** Restore persisted items into the queue on cold-start. Skips keys already
   *  present so concurrent enqueues from the capture flow are not overwritten.
   *  @derives(NEXT_SESSION.md §2b-4) */
  hydrate(items: Map<string, QueueItem>): void {
    let added = 0;
    for (const [key, item] of items) {
      if (!this.items.has(key)) {
        this.items.set(key, item);
        added++;
      }
    }
    if (added > 0) {
      this.emit();
      void this.pump();
    }
  }

  enqueue(item: Omit<QueueItem, 'status' | 'attempts' | 'objectKey' | 'lastError'>): string {
    const key = keyOf(item.visitId, item.phase, item.index);
    const queued: QueueItem = {
      ...item,
      status: 'idle',
      attempts: 0,
      objectKey: null,
      lastError: null,
    };
    this.items.set(key, queued);
    this.emit();
    void this.pump();
    return key;
  }

  /** Force a single item back to idle so the next pump retries it. */
  retry(key: string): void {
    const item = this.items.get(key);
    if (!item) return;
    item.status = 'idle';
    item.attempts = 0;
    item.lastError = null;
    this.emit();
    void this.pump();
  }

  /** Remove an item entirely (used on retake before re-enqueue). */
  remove(key: string): void {
    if (this.items.delete(key)) {
      this.emit();
    }
  }

  getStatus(visitId: string, phase: PhotoPhase, index: number): QueueItem | null {
    return this.items.get(keyOf(visitId, phase, index)) ?? null;
  }

  snapshot(): ReadonlyMap<string, QueueItem> {
    return new Map(this.items);
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const listener of this.listeners) listener(snap);
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      let next = this.pickNext();
      while (next) {
        await this.uploadOne(next);
        next = this.pickNext();
      }
    } finally {
      this.running = false;
    }
  }

  private pickNext(): QueueItem | null {
    for (const item of this.items.values()) {
      if (item.status === 'idle' && item.attempts < MAX_ATTEMPTS) return item;
    }
    return null;
  }

  private async uploadOne(item: QueueItem): Promise<void> {
    item.status = 'uploading';
    item.attempts += 1;
    this.emit();

    try {
      let objectKey: string;
      if (isWebPlatform()) {
        // Web cannot PUT directly to R2 (bucket CORS); the proxy route returns
        // the canonical objectKey it wrote. Skipping the presign call also
        // avoids a wasted round-trip and double-charging the captures budget.
        objectKey = await this.putViaBackendProxy(item);
      } else {
        const presign = await requestUploadUrls(item.visitId, [
          {
            phase: item.phase,
            index: item.index,
            contentType: item.contentType,
            fileSize: item.fileSize,
          },
        ]);
        const entry = presign.urls[0];
        if (!entry) throw new Error('Empty presign response');
        await this.putToR2(item.localUri, entry, item.contentType);
        objectKey = entry.objectKey;
      }
      item.status = 'done';
      item.objectKey = objectKey;
      item.lastError = null;
      this.emit();
    } catch (err) {
      item.lastError = err instanceof Error ? err.message : String(err);
      if (item.attempts >= MAX_ATTEMPTS) {
        item.status = 'failed';
        this.emit();
        return;
      }
      const backoff = BACKOFF_MS[Math.min(item.attempts - 1, BACKOFF_MS.length - 1)] ?? 60_000;
      this.emit();
      await new Promise((resolve) => setTimeout(resolve, backoff));
      item.status = 'idle';
      this.emit();
    }
  }

  private async putToR2(
    localUri: string,
    entry: UploadUrlEntry,
    contentType: QueueItem['contentType'],
  ): Promise<void> {
    // Delegated to the timeout-guarded helper so a stalled ~2MB PUT on a patchy
    // network aborts and the exponential backoff retries, instead of hanging the
    // worker on "uploading…" forever (HIGH-12, 2026-05-24 code review).
    await putFileToR2(localUri, entry.uploadUrl, contentType);
  }

  private async putViaBackendProxy(item: QueueItem): Promise<string> {
    const tokens = await getTokens();
    if (!tokens) {
      throw new Error('Sign in again to upload this photo.');
    }
    const fileRes = await fetchWithTimeout(item.localUri, {}, UPLOAD_TIMEOUT_MS);
    const blob = await fileRes.blob();
    const form = new FormData();
    form.append('visitId', item.visitId);
    form.append('phase', item.phase);
    form.append('index', String(item.index));
    form.append('contentType', item.contentType);
    const ext =
      item.contentType === 'image/png' ? 'png' : item.contentType === 'image/webp' ? 'webp' : 'jpg';
    form.append('photo', blob, `${item.phase}-${item.index}.${ext}`);
    const res = await fetchWithTimeout(
      `${API_BASE}${API_ROUTES.workerCapturesUploadProxy}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
        body: form,
      },
      UPLOAD_TIMEOUT_MS,
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Upload proxy failed: ${res.status} ${text}`);
    }
    const data = (await res.json()) as { objectKey?: unknown };
    if (typeof data.objectKey !== 'string' || data.objectKey.length === 0) {
      throw new Error('Upload proxy returned no objectKey');
    }
    return data.objectKey;
  }
}

/** Module-singleton queue shared by every capture screen.
 *  @derives(master-plan §G) */
export const r2UploadQueue = new R2UploadQueue();
