/**
 * RCA-G (2026-06-04): the Redis-namespace production boot guard.
 *
 * server.ts buildServer() must refuse to boot a production server when
 * AXHY_REDIS_NAMESPACE is unset — otherwise two prod-class environments
 * sharing one Redis both fall back to the 'production:' prefix and collide
 * (OTP codes, refresh-hash hot path, rate-limit windows, circuit breaker).
 * Dev/test keep the NODE_ENV fallback so the suite and local runs are
 * unaffected. Mirrors the existing OTP-bypass boot guard (server.ts:82-89).
 *
 * No real DB/Redis needed: the guard runs before Fastify is constructed and
 * getRedis() is lazy (only /health + shutdown). server.js is imported
 * DYNAMICALLY inside each test (after env is set) so prisma.ts's module-load
 * DATABASE_URL check sees the dummy below — a static import would hoist above
 * the env assignment and throw (matches worker-lifecycle.test.ts pattern).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Set before any dynamic import of server.js / prisma.ts.
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'a'.repeat(64);
process.env.DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://localhost:5432/none';

type BuildServer = (typeof import('../src/server.js'))['buildServer'];

async function loadBuildServer(): Promise<BuildServer> {
  return (await import('../src/server.js')).buildServer;
}

const TOUCHED = ['NODE_ENV', 'AXHY_REDIS_NAMESPACE', 'AXHY_OTP_BYPASS'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of TOUCHED) saved[k] = process.env[k];
});

afterEach(() => {
  for (const k of TOUCHED) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
});

describe('Redis namespace production boot guard', () => {
  it('production + AXHY_REDIS_NAMESPACE unset → refuses to boot', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AXHY_REDIS_NAMESPACE;
    delete process.env.AXHY_OTP_BYPASS; // keep the OTP guard from firing first
    const buildServer = await loadBuildServer();
    await expect(buildServer()).rejects.toThrow(/AXHY_REDIS_NAMESPACE/);
  });

  it('test env + unset → boots normally (dev/test fallback preserved)', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.AXHY_REDIS_NAMESPACE;
    const buildServer = await loadBuildServer();
    const app = await buildServer();
    expect(app).toBeTruthy();
    await app.close();
  });

  it('production + AXHY_REDIS_NAMESPACE set → passes the namespace guard', async () => {
    process.env.NODE_ENV = 'production';
    process.env.AXHY_REDIS_NAMESPACE = 'prod-guard-test';
    delete process.env.AXHY_OTP_BYPASS;
    const buildServer = await loadBuildServer();
    // It may build fully or fail later for an unrelated prod requirement, but
    // it must NOT fail on the namespace guard now that the env var is set.
    let namespaceError = false;
    let app: Awaited<ReturnType<BuildServer>> | undefined;
    try {
      app = await buildServer();
    } catch (err) {
      if (err instanceof Error && /AXHY_REDIS_NAMESPACE/.test(err.message)) namespaceError = true;
    }
    expect(namespaceError).toBe(false);
    if (app) await app.close();
  });
});
