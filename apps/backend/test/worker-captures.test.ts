/**
 * Real-DB + real-R2 integration test: POST /worker/captures/upload-urls.
 *
 * Verifies that an authenticated WORKER can fetch a batch of presigned
 * Cloudflare R2 PUT URLs, that non-WORKER roles + unauth + malformed inputs
 * are rejected with the right codes, and that the returned URLs target the
 * expected r2.cloudflarestorage.com host with the v3-captures/{workerId}/...
 * object-key prefix.
 *
 * Skips R2 assertions when R2 env vars are missing (Phase 1 may run before
 * the founder has finished bucket provisioning) — but still asserts the
 * 503 R2_NOT_CONFIGURED contract in that case.
 *
 * @derives(WORKER_MVP_SLICE_2B_2_PLAN.md §1)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

process.env.AXHY_OTP_BYPASS = '1';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const r2Configured =
  Boolean(process.env.R2_ACCOUNT_ID) &&
  Boolean(process.env.R2_ACCESS_KEY_ID) &&
  Boolean(process.env.R2_SECRET_ACCESS_KEY) &&
  Boolean(process.env.R2_BUCKET_NAME);

const prismaRaw = new PrismaClient({ datasources: { db: { url: dbUrl } } });

const TEST_PREFIX = `captures-${Date.now()}-`;
const WORKER_PHONE = `+9197${String(Date.now()).slice(-8)}`;
const SUPERVISOR_PHONE = `+9196${String(Date.now()).slice(-8)}`;

let app: FastifyInstance;
let companyId: string;
let workerUserId: string;
let workerToken: string;
let supervisorToken: string;

async function mintToken(phone: string): Promise<string> {
  await app.inject({ method: 'POST', url: '/auth/otp/request', payload: { phone } });
  const verify = await app.inject({
    method: 'POST',
    url: '/auth/otp/verify',
    payload: { phone, code: '123456' },
  });
  return (verify.json() as { accessToken: string }).accessToken;
}

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  app = await buildServer();
  await app.ready();

  const co = await prismaRaw.company.create({
    data: {
      name: TEST_PREFIX + 'Co',
      slug: TEST_PREFIX + 'co',
      ownerPhone: '+919900000094',
      ownerName: 'Owner Captures',
    },
  });
  companyId = co.id;

  // Worker
  await mintToken(WORKER_PHONE);
  const workerUser = await prismaRaw.user.findUnique({ where: { phone: WORKER_PHONE } });
  if (!workerUser) throw new Error('test setup failed: worker not created');
  workerUserId = workerUser.id;
  await prismaRaw.membership.create({
    data: { companyId, userId: workerUserId, role: 'WORKER' },
  });
  workerToken = await mintToken(WORKER_PHONE);

  // Supervisor (for negative test)
  await mintToken(SUPERVISOR_PHONE);
  const supervisorUser = await prismaRaw.user.findUnique({ where: { phone: SUPERVISOR_PHONE } });
  if (!supervisorUser) throw new Error('test setup failed: supervisor not created');
  await prismaRaw.membership.create({
    data: { companyId, userId: supervisorUser.id, role: 'SUPERVISOR' },
  });
  supervisorToken = await mintToken(SUPERVISOR_PHONE);
}, 120_000);

afterAll(async () => {
  await prismaRaw.membership.deleteMany({ where: { companyId } });
  await prismaRaw.user.deleteMany({
    where: { phone: { in: [WORKER_PHONE, SUPERVISOR_PHONE] } },
  });
  await prismaRaw.$executeRawUnsafe(
    `DELETE FROM axhy.otp_attempts WHERE phone IN ($1, $2)`,
    WORKER_PHONE,
    SUPERVISOR_PHONE,
  );
  await prismaRaw.company.deleteMany({ where: { id: companyId } });
  await prismaRaw.$disconnect();
  await app.close();
});

const VALID_BODY = {
  visitId: 'visit-test-12345',
  files: [
    { phase: 'before', index: 1, contentType: 'image/jpeg', fileSize: 500_000 },
    { phase: 'before', index: 2, contentType: 'image/jpeg', fileSize: 500_000 },
    { phase: 'before', index: 3, contentType: 'image/jpeg', fileSize: 500_000 },
  ],
};

describe('POST /worker/captures/upload-urls', () => {
  it('rejects unauth requests with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/worker/captures/upload-urls',
      payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects SUPERVISOR with 403 WRONG_ROLE', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/worker/captures/upload-urls',
      payload: VALID_BODY,
      headers: { authorization: `Bearer ${supervisorToken}` },
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { error: string }).error).toBe('WRONG_ROLE');
  });

  it('rejects bad input (missing visitId) with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/worker/captures/upload-urls',
      payload: { files: VALID_BODY.files },
      headers: { authorization: `Bearer ${workerToken}` },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe('BAD_INPUT');
  });

  it('rejects empty files array with 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/worker/captures/upload-urls',
      payload: { visitId: VALID_BODY.visitId, files: [] },
      headers: { authorization: `Bearer ${workerToken}` },
    });
    expect(res.statusCode).toBe(400);
  });

  if (r2Configured) {
    it('returns 3 valid R2 presigned URLs for a WORKER', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/worker/captures/upload-urls',
        payload: VALID_BODY,
        headers: { authorization: `Bearer ${workerToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        urls: Array<{
          phase: 'before' | 'after';
          index: number;
          uploadUrl: string;
          objectKey: string;
          expiresAt: string;
        }>;
      };
      expect(body.urls).toHaveLength(3);
      for (const entry of body.urls) {
        expect(entry.phase).toBe('before');
        expect(entry.uploadUrl).toMatch(/r2\.cloudflarestorage\.com/);
        expect(entry.objectKey).toMatch(
          new RegExp(`^v3-captures/${workerUserId}/visit-test-12345/before-0\\d\\.jpg$`),
        );
        expect(new Date(entry.expiresAt).getTime()).toBeGreaterThan(Date.now());
      }
    });
  } else {
    it('returns 503 R2_NOT_CONFIGURED when env vars are missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/worker/captures/upload-urls',
        payload: VALID_BODY,
        headers: { authorization: `Bearer ${workerToken}` },
      });
      expect(res.statusCode).toBe(503);
      expect((res.json() as { error: string }).error).toBe('R2_NOT_CONFIGURED');
    });
  }
});

describe('POST /worker/captures/upload (web fallback proxy)', () => {
  // Tiny 1x1 JPEG (base64-decoded at use-time) so we exercise the multipart
  // path without bundling a real fixture file.
  const TINY_JPEG = Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB/9sAQwEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB/8AAEQgAAQABAwEiAAIRAQMRAf/EABUAAQEAAAAAAAAAAAAAAAAAAAAJ/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/EABUBAQEAAAAAAAAAAAAAAAAAAAAJ/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AfwD/2Q==',
    'base64',
  );
  const BOUNDARY = '----axhytestboundary';
  const buildMultipart = (
    overrides: Partial<{
      visitId: string;
      phase: string;
      index: string;
      contentType: string;
      omitPhoto: boolean;
      fieldName: string;
    }> = {},
  ): Buffer => {
    const visitId = overrides.visitId ?? 'visit-test-proxy';
    const phase = overrides.phase ?? 'before';
    const index = overrides.index ?? '1';
    const contentType = overrides.contentType ?? 'image/jpeg';
    const fieldName = overrides.fieldName ?? 'photo';
    const text = (name: string, value: string): string =>
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
    let body =
      text('visitId', visitId) +
      text('phase', phase) +
      text('index', index) +
      text('contentType', contentType);
    if (!overrides.omitPhoto) {
      body +=
        `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="before-1.jpg"\r\n` +
        `Content-Type: ${contentType}\r\n\r\n`;
    }
    const head = Buffer.from(body, 'utf8');
    const tail = overrides.omitPhoto
      ? Buffer.from(`--${BOUNDARY}--\r\n`, 'utf8')
      : Buffer.from(`\r\n--${BOUNDARY}--\r\n`, 'utf8');
    return overrides.omitPhoto
      ? Buffer.concat([head, tail])
      : Buffer.concat([head, TINY_JPEG, tail]);
  };
  const MULTIPART_HEADER = `multipart/form-data; boundary=${BOUNDARY}`;

  it('rejects unauth requests with 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/worker/captures/upload',
      headers: { 'content-type': MULTIPART_HEADER },
      payload: buildMultipart(),
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects SUPERVISOR with 403 WRONG_ROLE', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/worker/captures/upload',
      headers: {
        'content-type': MULTIPART_HEADER,
        authorization: `Bearer ${supervisorToken}`,
      },
      payload: buildMultipart(),
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { error: string }).error).toBe('WRONG_ROLE');
  });

  it('rejects missing photo field with 400 PHOTO_REQUIRED', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/worker/captures/upload',
      headers: {
        'content-type': MULTIPART_HEADER,
        authorization: `Bearer ${workerToken}`,
      },
      payload: buildMultipart({ omitPhoto: true }),
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe('PHOTO_REQUIRED');
  });

  it('rejects bad meta (missing visitId) with 400 BAD_INPUT', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/worker/captures/upload',
      headers: {
        'content-type': MULTIPART_HEADER,
        authorization: `Bearer ${workerToken}`,
      },
      payload: buildMultipart({ visitId: '' }),
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe('BAD_INPUT');
  });

  if (r2Configured) {
    it('returns objectKey under v3-captures/{workerId}/{visitId}/ on success', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/worker/captures/upload',
        headers: {
          'content-type': MULTIPART_HEADER,
          authorization: `Bearer ${workerToken}`,
        },
        payload: buildMultipart({ visitId: 'visit-test-proxy', phase: 'before', index: '1' }),
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { objectKey: string };
      expect(body.objectKey).toMatch(
        new RegExp(`^v3-captures/${workerUserId}/visit-test-proxy/before-01\\.jpg$`),
      );
    });
  } else {
    it('returns 503 R2_NOT_CONFIGURED when env vars are missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/worker/captures/upload',
        headers: {
          'content-type': MULTIPART_HEADER,
          authorization: `Bearer ${workerToken}`,
        },
        payload: buildMultipart(),
      });
      expect(res.statusCode).toBe(503);
      expect((res.json() as { error: string }).error).toBe('R2_NOT_CONFIGURED');
    });
  }
});

describe.skipIf(!process.env.REDIS_URL)(
  'POST /worker/captures/upload-urls — per-user rate limit',
  () => {
    it('returns 429 RATE_LIMITED + Retry-After header after exhausting the per-user budget', async () => {
      const { getRedis } = await import('../src/lib/redis.js');
      const { RedisKeys } = await import('../src/lib/redis-keys.js');
      await getRedis().del(RedisKeys.rateLimit('worker:captures', workerUserId));

      const envKey = 'RATE_LIMIT_WORKER_CAPTURES_PER_MIN';
      const prev = process.env[envKey];
      process.env[envKey] = '2';
      try {
        for (let i = 0; i < 2; i++) {
          const ok = await app.inject({
            method: 'POST',
            url: '/worker/captures/upload-urls',
            payload: VALID_BODY,
            headers: { authorization: `Bearer ${workerToken}` },
          });
          expect(ok.statusCode).not.toBe(429);
        }
        const limited = await app.inject({
          method: 'POST',
          url: '/worker/captures/upload-urls',
          payload: VALID_BODY,
          headers: { authorization: `Bearer ${workerToken}` },
        });
        expect(limited.statusCode).toBe(429);
        const body = limited.json() as { error: string; retryAfterMs: number };
        expect(body.error).toBe('RATE_LIMITED');
        expect(body.retryAfterMs).toBeGreaterThan(0);
        expect(limited.headers['retry-after']).toBeDefined();
      } finally {
        if (prev === undefined) delete process.env[envKey];
        else process.env[envKey] = prev;
      }
    });
  },
);
