/**
 * Per-user Redis sliding-window rate limits for /worker/* routes.
 *
 * Mirrors the chat.ts pattern (route + subject + limit + windowMs via
 * checkAndConsumeRateLimit from lib/redis-rate-limit.ts). Each route's
 * limit can be overridden at runtime by an env var so we can tighten or
 * relax without a code change when real worker behavior emerges.
 *
 * The numeric defaults reflect the polling cadence each route actually
 * sees from the worker mobile client:
 *   - today / visit: pull-to-refresh + occasional auto-refresh on focus.
 *   - captures: ~6 photos per visit, with retry budget for flaky uplinks.
 *   - submit: once per visit. Multi-submit is abuse, not normal usage.
 *   - verify-status: 3s poll cap = 20 polls/min sustained; 60 leaves headroom.
 *   - consent: once per install. 10 covers re-installs + version bumps.
 *
 * Per-IP edge limiter (100/min via @fastify/rate-limit in server.ts:119)
 * remains as an orthogonal coarse DDoS layer.
 *
 * @derives(ADR-0024 — Redis sliding window rate limiting)
 * @derives(ENTERPRISE_PRODUCTION_STANDARD.md E3)
 */

import { checkAndConsumeRateLimit, type RateLimitCheckResult } from './redis-rate-limit.js';

const WINDOW_MS = 60_000;

function envLimit(envVar: string, defaultValue: number): number {
  const raw = process.env[envVar];
  if (!raw) return defaultValue;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : defaultValue;
}

/** @derives(ADR-0024) */
export type WorkerRateLimitKey =
  | 'today'
  | 'history'
  | 'visit'
  | 'captures'
  | 'submit'
  | 'verifyStatus'
  | 'consent'
  | 'clockIn'
  | 'clockOut';

type RateLimitConfig = {
  readonly route: string;
  readonly limit: number;
  readonly windowMs: number;
};

function configFor(key: WorkerRateLimitKey): RateLimitConfig {
  switch (key) {
    case 'today':
      return {
        route: 'worker:today',
        limit: envLimit('RATE_LIMIT_WORKER_TODAY_PER_MIN', 60),
        windowMs: WINDOW_MS,
      };
    case 'visit':
      return {
        route: 'worker:visit',
        limit: envLimit('RATE_LIMIT_WORKER_VISIT_PER_MIN', 60),
        windowMs: WINDOW_MS,
      };
    case 'history':
      return {
        route: 'worker:history',
        limit: envLimit('RATE_LIMIT_WORKER_HISTORY_PER_MIN', 60),
        windowMs: WINDOW_MS,
      };
    case 'captures':
      return {
        route: 'worker:captures',
        limit: envLimit('RATE_LIMIT_WORKER_CAPTURES_PER_MIN', 120),
        windowMs: WINDOW_MS,
      };
    case 'submit':
      return {
        route: 'worker:submit',
        limit: envLimit('RATE_LIMIT_WORKER_SUBMIT_PER_MIN', 20),
        windowMs: WINDOW_MS,
      };
    case 'verifyStatus':
      return {
        route: 'worker:verify-status',
        limit: envLimit('RATE_LIMIT_WORKER_VERIFY_STATUS_PER_MIN', 60),
        windowMs: WINDOW_MS,
      };
    case 'consent':
      return {
        route: 'worker:consent',
        limit: envLimit('RATE_LIMIT_WORKER_CONSENT_PER_MIN', 10),
        windowMs: WINDOW_MS,
      };
    case 'clockIn':
      return {
        route: 'worker:clock-in',
        limit: envLimit('RATE_LIMIT_WORKER_CLOCK_IN_PER_MIN', 20),
        windowMs: WINDOW_MS,
      };
    case 'clockOut':
      return {
        route: 'worker:clock-out',
        limit: envLimit('RATE_LIMIT_WORKER_CLOCK_OUT_PER_MIN', 20),
        windowMs: WINDOW_MS,
      };
  }
}

/**
 * Consume one slot in the per-user sliding window for the given /worker/* route.
 * Subject is always the authenticated userId (NOT companyId or IP) — workers
 * each get their own bucket so a single bad client cannot starve siblings.
 *
 * Returns the underlying RateLimitCheckResult so the caller controls the
 * 429 response shape (matches the chat.ts inline pattern).
 *
 * @derives(ADR-0024)
 */
export async function consumeWorkerRateLimit(
  key: WorkerRateLimitKey,
  subject: string,
): Promise<RateLimitCheckResult> {
  const cfg = configFor(key);
  return checkAndConsumeRateLimit({
    route: cfg.route,
    subject,
    limit: cfg.limit,
    windowMs: cfg.windowMs,
  });
}

/**
 * Resolve the configured limit for a route, for use in tests that need to
 * exhaust the limit before asserting 429.
 *
 * @derives(ADR-0024)
 */
export function getWorkerRateLimitConfig(key: WorkerRateLimitKey): RateLimitConfig {
  return configFor(key);
}
