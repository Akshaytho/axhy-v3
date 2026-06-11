/**
 * Env-gated Sentry error tracking.
 *
 * SENTRY_DSN unset → initSentry() returns false and every helper is a
 * permanent no-op, so this module costs nothing until the operator sets
 * the DSN on the Railway service. With a DSN, @sentry/node's default
 * integrations also capture uncaughtException/unhandledRejection.
 *
 * sendDefaultPii stays false: requests carry worker phone numbers and
 * JWTs — none of that may leave the system in an error report.
 *
 * @derives(ADR-0027)
 * @derives(docs/findings/2026-06-10-full-codebase-deep-review-and-recommendations.md — launch item: prod 500s invisible)
 */

import * as Sentry from '@sentry/node';

let enabled = false;

/**
 * Call once at process entry (index.ts), before the server boots.
 *
 * @derives(ADR-0027)
 */
export function initSentry(): boolean {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    release: process.env.RAILWAY_GIT_COMMIT_SHA || undefined,
    sendDefaultPii: false,
  });
  enabled = true;
  return true;
}

/** @derives(ADR-0027) */
export function isSentryEnabled(): boolean {
  return enabled;
}

/**
 * Report an exception with optional non-PII context. No-op when disabled.
 *
 * @derives(ADR-0027)
 */
export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

/**
 * Best-effort flush before process exit. No-op when disabled.
 *
 * @derives(ADR-0027)
 */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!enabled) return;
  try {
    await Sentry.flush(timeoutMs);
  } catch {
    // flushing is best-effort on the way down
  }
}
