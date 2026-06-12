/**
 * /v1 API alias regression — ADR-0028 (launch blocker LB2, deep review §2).
 *
 * Shipped APKs pin `${API_BASE}/v1`; the backend aliases `/v1/X` → `/X` via
 * the Fastify `rewriteUrl` server option (pre-routing), so versioned clients
 * and bare-path clients hit the IDENTICAL handlers during the compat window.
 *
 * Proves:
 *   1. Parity — /v1/health behaves exactly like /health (same status, same
 *      body shape). The rewrite reaches the real handler, not a copy.
 *   2. Handler depth — POST /v1/auth/otp/request with an invalid body
 *      returns the same validation failure as the bare path (the request
 *      travels through the full route + Zod boundary, not a stub).
 *   3. No prefix bleed — /v1abc does NOT alias (404): only the exact
 *      '/v1/' segment is stripped.
 *
 * @derives(docs/decisions/0028-v1-api-prefix-and-ota.md)
 * @derives(docs/learnings/2026-05-20-all-api-versioning-required.md)
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  process.env.AXHY_OTP_BYPASS = process.env.AXHY_OTP_BYPASS ?? '1';
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);
  const { buildServer } = await import('../src/server.js');
  app = await buildServer();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('ADR-0028 — /v1 API alias', () => {
  test('/v1/health is the same handler as /health (parity)', async () => {
    const bare = await app.inject({ method: 'GET', url: '/health' });
    const v1 = await app.inject({ method: 'GET', url: '/v1/health' });

    expect(v1.statusCode).toBe(bare.statusCode);
    const bareBody = bare.json() as { ok: boolean; checks: Record<string, string> };
    const v1Body = v1.json() as { ok: boolean; checks: Record<string, string> };
    expect(v1Body.ok).toBe(bareBody.ok);
    expect(Object.keys(v1Body.checks).sort()).toEqual(Object.keys(bareBody.checks).sort());
  });

  test('/v1 request reaches the real route handler + validation boundary', async () => {
    // Invalid body (missing phone) — both forms must fail IDENTICALLY,
    // proving /v1 is routed into the same handler with the same Zod gate.
    const bare = await app.inject({
      method: 'POST',
      url: '/auth/otp/request',
      payload: {},
    });
    const v1 = await app.inject({
      method: 'POST',
      url: '/v1/auth/otp/request',
      payload: {},
    });

    expect(v1.statusCode).toBe(bare.statusCode);
    expect((v1.json() as { error?: string }).error).toBe((bare.json() as { error?: string }).error);
    // And it must be a handler-level rejection, not a router 404.
    expect(bare.statusCode).not.toBe(404);
  });

  test('no prefix bleed — /v1abc does not alias to /abc semantics', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1abcdef' });
    expect(res.statusCode).toBe(404);
  });

  test('querystrings survive the alias', async () => {
    // /health ignores query params; the point is the rewrite must not
    // corrupt the URL when a querystring is present.
    const v1 = await app.inject({ method: 'GET', url: '/v1/health?probe=1' });
    const bare = await app.inject({ method: 'GET', url: '/health?probe=1' });
    expect(v1.statusCode).toBe(bare.statusCode);
  });
});
