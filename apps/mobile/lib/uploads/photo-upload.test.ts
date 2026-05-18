/**
 * @derives(master-plan §G)
 * @derives(supervisor-drawer-and-decisions-redesign.md §C — chat photo attach)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api', () => ({
  apiFetch: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

import { apiFetch, ApiError } from '../api';

import { requestUploadSlot, putToSignedUrl, uploadPhotoAttachment } from './photo-upload';

const mockedApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockedApiFetch.mockReset();
  vi.restoreAllMocks();
});

describe('requestUploadSlot', () => {
  it('POSTs mime + sizeBytes and returns the signed slot', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      putUrl: 'https://s3.example/put-1',
      getUrl: 'https://s3.example/get-1',
      expiresAt: '2026-05-18T10:00:00.000Z',
    });
    const slot = await requestUploadSlot('image/jpeg', 12345);
    expect(slot.putUrl).toBe('https://s3.example/put-1');
    expect(slot.getUrl).toBe('https://s3.example/get-1');
    const call = mockedApiFetch.mock.calls[0];
    expect(call[0]).toBe('/uploads/sign-image');
    expect(call[1].method).toBe('POST');
    expect(call[1].body).toEqual({ mime: 'image/jpeg', sizeBytes: 12345 });
  });

  it('surfaces a clean error when the backend route is not deployed (404)', async () => {
    mockedApiFetch.mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND', 'No such route'));
    await expect(requestUploadSlot('image/jpeg', 100)).rejects.toThrow(
      /Photo upload service not yet available/,
    );
  });

  it('rethrows non-404 API errors as-is (so the chat surface can surface them)', async () => {
    const err = new ApiError(500, 'INTERNAL', 'boom');
    mockedApiFetch.mockRejectedValueOnce(err);
    await expect(requestUploadSlot('image/jpeg', 100)).rejects.toBe(err);
  });
});

describe('putToSignedUrl', () => {
  it('PUTs the blob without an Authorization header', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    await putToSignedUrl('https://s3.example/put-2', blob, 'image/jpeg');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const args = fetchSpy.mock.calls[0];
    expect(args[0]).toBe('https://s3.example/put-2');
    const init = args[1];
    expect(init?.method).toBe('PUT');
    const headers = init?.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('image/jpeg');
    expect(headers['Authorization']).toBeUndefined();
  });

  it('throws on a non-2xx response from S3', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 403 }));
    const blob = new Blob(['x'], { type: 'image/jpeg' });
    await expect(putToSignedUrl('https://s3.example/put-3', blob, 'image/jpeg')).rejects.toThrow(
      /HTTP 403/,
    );
  });
});

describe('uploadPhotoAttachment (end-to-end happy path)', () => {
  it('signs, PUTs, and returns the get-URL as a chat-attachment', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      putUrl: 'https://s3.example/put-4',
      getUrl: 'https://s3.example/get-4',
      expiresAt: '2026-05-18T10:00:00.000Z',
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 200 }));

    const blob = new Blob(['y'], { type: 'image/jpeg' });
    const result = await uploadPhotoAttachment({
      blob,
      mime: 'image/jpeg',
      sizeBytes: blob.size,
    });
    expect(result).toEqual({ type: 'image', url: 'https://s3.example/get-4' });
  });

  it('propagates the sign-step error (e.g. 404) without attempting the PUT', async () => {
    mockedApiFetch.mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND', 'no route'));
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const blob = new Blob(['z'], { type: 'image/jpeg' });
    await expect(
      uploadPhotoAttachment({ blob, mime: 'image/jpeg', sizeBytes: blob.size }),
    ).rejects.toThrow(/Photo upload service not yet available/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
