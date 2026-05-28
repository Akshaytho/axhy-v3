/**
 * F1-b Task 6 — POST /auth/refresh legacy token rejection.
 *
 * Founder decision 2026-05-28: pre-F1-b JWT-shaped refresh tokens are
 * refused with 401 AUTH_LEGACY_REFRESH. The mobile interceptor (Task 8)
 * catches this specific code and force-logs-out the user. The check is
 * `isLegacyToken()` — anything not starting with `axrt_` is legacy.
 *
 * @derives(ADR-0007)
 * @derives(F1-b plan 2026-05-28 Task 6)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { SignJWT } from 'jose';

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);

const dbUrl =
  process.env.AXHY_DB_URL ?? process.env.DATABASE_PUBLIC_URL ?? process.env.DATABASE_URL ?? '';
process.env.DATABASE_URL = dbUrl;

const TEST_IP = '10.99.0.5';

let app: FastifyInstance;

beforeAll(async () => {
  const { buildServer } = await import('../src/server.js');
  app = await buildServer();
  await app.ready();
}, 30_000);

afterAll(async () => {
  await app.close();
});

describe('POST /auth/refresh — legacy token rejection', () => {
  it('JWT-shaped refresh token → 401 AUTH_LEGACY_REFRESH', async () => {
    // Hand-craft a JWT that resembles a pre-F1-b refresh token.
    const jwt = await new SignJWT({ sub: 'fake-user', kind: 'refresh' }) // audit-ok: intentional legacy-shape for reject test
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(new TextEncoder().encode(process.env.JWT_SECRET!));

    // Zod cap: refreshToken min(20).max(60). Truncate the JWT so it parses.
    const legacyToken = jwt.slice(0, 60);
    expect(legacyToken.startsWith('axrt_')).toBe(false);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: legacyToken },
      remoteAddress: TEST_IP,
    });
    expect(res.statusCode).toBe(401);
    const body = res.json() as { error: string };
    expect(body.error).toBe('AUTH_LEGACY_REFRESH');
  });

  it('any non-axrt-prefixed string within length bounds → 401 AUTH_LEGACY_REFRESH', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.abc' },
      remoteAddress: TEST_IP,
    });
    expect(res.statusCode).toBe(401);
    expect((res.json() as { error: string }).error).toBe('AUTH_LEGACY_REFRESH');
  });

  it('body too short → 400 BAD_FORMAT (Zod min length)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: 'short' },
      remoteAddress: TEST_IP,
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe('BAD_FORMAT');
  });
});
