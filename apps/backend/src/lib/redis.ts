/**
 * Redis client — replaces in-memory state that doesn't survive multi-replica
 * deploys (rate limit windows, concurrency semaphore, circuit-breaker
 * state, OTP store, chat idempotency cache).
 *
 * Founder design 2026-05-20: switched from "Postgres outbox over Redis until
 * measured pain" (ADR-0009) to "Redis for caches; Postgres for source-of-truth
 * + audit". See ADR-0024 for the supersession rationale.
 *
 * Connection: REDIS_URL env var (Railway-managed Redis service `Redis-yErE`).
 *   - Production: `redis://default:***@redis-yere.railway.internal:6379`
 *   - Local dev/test: `redis://default:***@centerbeam.proxy.rlwy.net:54836`
 *
 * The client is a singleton — one connection per process. ioredis handles
 * reconnect with exponential backoff out of the box. We add a `connect`
 * helper for tests + a `closeRedis` for graceful shutdown.
 *
 * @derives(ADR-0024)
 * @derives(master-plan §G)
 * @derives(plans/abstract-wandering-kazoo.md Wave A.2)
 */

import { Redis } from 'ioredis';
import pino from 'pino';

const log = pino({ name: 'redis' });

let client: Redis | null = null;

/**
 * Get (or lazily create) the singleton Redis client.
 *
 * Throws when REDIS_URL is missing AND the caller asked for a real client.
 * Tests that don't need Redis must mock the surfaces that depend on it,
 * not call this directly.
 */
export function getRedis(): Redis {
  if (client) return client;
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error(
      'REDIS_URL missing. Set it in apps/backend/.env.local (local) or Railway service env (deployed).',
    );
  }
  client = new Redis(url, {
    // ioredis defaults are fine for most workloads. Tighten the connect
    // timeout so a misconfigured URL fails fast instead of hanging the
    // server boot.
    connectTimeout: 10_000,
    // maxRetriesPerRequest: keep ioredis' default (20) so brief Redis
    // hiccups don't fail business requests — surface only on sustained
    // outage.
    // Logged via the redis client's own events; chat-rate-limit + others
    // can subscribe per-call too.
    enableReadyCheck: true,
    lazyConnect: false,
  });
  client.on('error', (err) => {
    // Don't crash the process — Redis outages should degrade gracefully
    // (the consumers of this client decide their fallback behavior).
    // Log so ops sees the pain.

    log.warn(
      { event: 'redis.client_error', err: err instanceof Error ? err.message : String(err) },
      'redis: client error',
    );
  });
  return client as Redis;
}

/**
 * Close the Redis connection. Wire this into the SIGTERM handler so an
 * in-flight pipeline drains before the process dies.
 */
export async function closeRedis(): Promise<void> {
  if (!client) return;
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
  client = null;
}

/**
 * Test-only — reset the singleton between test files so a stale connection
 * from a prior file doesn't leak. Production code path never calls this.
 */
export function _resetRedisForTests(): void {
  if (client) {
    try {
      client.disconnect();
    } catch {
      /* ignore */
    }
  }
  client = null;
}
