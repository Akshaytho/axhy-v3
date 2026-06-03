import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { fetchWithTimeout, putFileToR2, UploadTimeoutError } from './r2-put';

const mockedFetch = vi.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).fetch = mockedFetch;

beforeEach(() => {
  mockedFetch.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('fetchWithTimeout (HIGH-12)', () => {
  it('aborts a stalled request after the timeout and throws UploadTimeoutError', async () => {
    vi.useFakeTimers();
    // A fetch that never settles on its own — it only rejects once its signal
    // aborts, exactly like a real socket that the AbortController tears down.
    mockedFetch.mockImplementation(
      (_input: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          const signal = init.signal as AbortSignal;
          signal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );

    const promise = fetchWithTimeout('https://r2.example/put', { method: 'PUT' }, 1_000);
    // Attach the rejection handler BEFORE advancing timers so the rejection is
    // never momentarily unhandled.
    const assertion = expect(promise).rejects.toBeInstanceOf(UploadTimeoutError);
    await vi.advanceTimersByTimeAsync(1_000);
    await assertion;
  });

  it('returns the response when fetch resolves before the timeout', async () => {
    mockedFetch.mockResolvedValueOnce(new Response('ok', { status: 200 }));
    const res = await fetchWithTimeout('https://r2.example/put', { method: 'PUT' });
    expect(res.status).toBe(200);
  });

  it('propagates a genuine network error unchanged (not masked as a timeout)', async () => {
    const netErr = new TypeError('Network request failed');
    mockedFetch.mockRejectedValueOnce(netErr);
    await expect(fetchWithTimeout('https://r2.example/put')).rejects.toBe(netErr);
  });
});

describe('putFileToR2 (HIGH-12)', () => {
  it('reads the local file then PUTs it with the right content-type, resolving on 2xx', async () => {
    mockedFetch.mockImplementation((_input: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return Promise.resolve(new Response(null, { status: 200 }));
      }
      // local-file read step
      return Promise.resolve({ blob: async () => new Blob(['x']) } as unknown as Response);
    });

    await expect(
      putFileToR2('file:///tmp/before-1.jpg', 'https://r2.example/put', 'image/jpeg'),
    ).resolves.toBeUndefined();

    const putCall = mockedFetch.mock.calls.find(
      (c) => (c[1] as RequestInit | undefined)?.method === 'PUT',
    );
    expect((putCall?.[1] as RequestInit | undefined)?.headers).toMatchObject({
      'Content-Type': 'image/jpeg',
    });
  });

  it('throws a status-bearing error on a non-2xx PUT so the queue records + retries', async () => {
    mockedFetch.mockImplementation((_input: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        return Promise.resolve(new Response(null, { status: 403, statusText: 'Forbidden' }));
      }
      return Promise.resolve({ blob: async () => new Blob(['x']) } as unknown as Response);
    });

    await expect(
      putFileToR2('file:///tmp/before-1.jpg', 'https://r2.example/put', 'image/jpeg'),
    ).rejects.toThrow(/R2 PUT failed: 403/);
  });
});
