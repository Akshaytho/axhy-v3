/**
 * HTTP idempotency cache — generic.
 *
 * Sprint 1 deep-review Cluster F fix (2026-05-18). The codebase already had
 * per-route idempotency for chat (`ChatRequestLog`); this module is the
 * generic counterpart for every other state-changing route.
 *
 * Usage from a route handler:
 *
 *   await withIdempotency(req, reply, {
 *     companyId: auth.companyId,
 *     routeKey: 'POST:/supervisor/replacement-invites',
 *   }, async () => {
 *     // ...do the side effects...
 *     return { status: 201, body: { ok: true, invite } };
 *   });
 *
 * Behaviour:
 *   - If the request has no `Idempotency-Key` header, the handler runs
 *     normally and no cache row is written. Idempotency is opt-in
 *     per-request, not forced.
 *   - If the header is present and a non-expired cache row exists for
 *     (companyId, routeKey, idempotencyKey), the cached response is
 *     returned and the handler does NOT run. Side-effect-free retry.
 *   - If the header is present and no cache row exists, the handler
 *     runs once. The response is captured + persisted before being
 *     sent. A concurrent retry with the same key will hit the cache
 *     on the subsequent attempt; the P2002 race on the insert is
 *     caught and treated as a "another replica beat us — re-read
 *     and serve their cached response" path.
 *
 * TTL: 10 minutes. Long enough for realistic Slow-3G retries, short
 * enough that the table stays small. A periodic sweep is NOT included
 * here — `expiresAt` index supports a future cleanup job, but the
 * application reads `expiresAt < NOW()` as cache-miss so stale rows are
 * harmless if not swept.
 *
 * @derives(2026-05-18-sprint-1-deep-review.md Cluster F)
 * @derives(feedback_production_grade_workflow_rules.md — P8 retries/double-taps)
 * @derives(master-plan §G — supervisor surface)
 */

import type { FastifyReply, FastifyRequest } from 'fastify';

import { prisma } from './prisma.js';

/** Idempotency TTL — 10 minutes from creation. */
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000;

/**
 * Cached-response shape persisted in `IdempotencyKey.responseJson`. The
 * status code rides in its own column so the cache hit returns the same
 * status the first call produced.
 *
 * @derives(master-plan §G) — supervisor surface
 * Sprint 1 deep-review Cluster F (2026-05-18).
 */
export type CachedHttpResponse = {
  status: number;
  body: Record<string, unknown> | unknown[];
};

/** @derives(master-plan §G) — Sprint 1 deep-review Cluster F (2026-05-18) */
export type WithIdempotencyOptions = {
  /** Tenant scope — `auth.companyId`. */
  companyId: string;
  /**
   * Stable identifier for this route — e.g. `POST:/supervisor/replacement-invites`.
   * Different routes must use different keys so a single client-supplied
   * `Idempotency-Key` value can't collide across endpoints.
   */
  routeKey: string;
};

/**
 * Look up a cached response. Internal — exported only for tests.
 *
 * @derives(master-plan §G) — Sprint 1 deep-review Cluster F (2026-05-18)
 */
export async function checkIdempotencyKey(
  companyId: string,
  routeKey: string,
  idempotencyKey: string,
  now: Date = new Date(),
): Promise<CachedHttpResponse | null> {
  const row = await prisma.idempotencyKey.findUnique({
    where: {
      companyId_routeKey_idempotencyKey: {
        companyId,
        routeKey,
        idempotencyKey,
      },
    },
  });
  if (!row) return null;
  if (row.expiresAt < now) {
    // Stale — treat as cache miss. We do NOT delete here because two
    // concurrent retries past expiry would both see "stale", both
    // delete, and both re-run. Letting the row stick around until a
    // sweep keeps the read path predictable; the upsert on the next
    // write path handles the overwrite via composite-PK conflict.
    return null;
  }
  return {
    status: row.responseStatus,
    body: row.responseJson as CachedHttpResponse['body'],
  };
}

/**
 * Persist a fresh cached response. Internal — exported only for tests.
 *
 * Uses `upsert` so a concurrent first-write race collapses to one row
 * (last-writer-wins on the response payload, which is acceptable because
 * both racers produced the same semantic outcome — that's the point of
 * idempotency).
 *
 * @derives(master-plan §G) — Sprint 1 deep-review Cluster F (2026-05-18)
 */
export async function recordIdempotencyKey(
  companyId: string,
  routeKey: string,
  idempotencyKey: string,
  response: CachedHttpResponse,
  now: Date = new Date(),
): Promise<void> {
  const expiresAt = new Date(now.getTime() + IDEMPOTENCY_TTL_MS);
  await prisma.idempotencyKey.upsert({
    where: {
      companyId_routeKey_idempotencyKey: {
        companyId,
        routeKey,
        idempotencyKey,
      },
    },
    create: {
      companyId,
      routeKey,
      idempotencyKey,
      responseStatus: response.status,
      responseJson: response.body as object,
      expiresAt,
    },
    update: {
      // Touch the existing row's expiresAt + status + body. A new caller
      // with the same key (very rare) gets the latest answer.
      responseStatus: response.status,
      responseJson: response.body as object,
      expiresAt,
    },
  });
}

/**
 * Run `handler` exactly once per (companyId, routeKey, Idempotency-Key
 * header). If the header is absent, behaves as a no-op wrapper around
 * `handler` (no caching). If present and a non-expired cache row exists,
 * sends the cached response and skips `handler`.
 *
 * Returns nothing — the response is sent via the Fastify reply
 * inside the wrapper, matching the route-handler convention.
 *
 * @derives(master-plan §G) — Sprint 1 deep-review Cluster F (2026-05-18)
 */
export async function withIdempotency(
  req: FastifyRequest,
  reply: FastifyReply,
  options: WithIdempotencyOptions,
  handler: () => Promise<CachedHttpResponse>,
): Promise<void> {
  const headerValue = req.headers['idempotency-key'];
  const idempotencyKey = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  // Validate header format if present — UUID v4 / v7 / opaque token up to
  // 200 chars. Anything outside that range is almost certainly a client
  // bug and we 400 fast.
  if (typeof idempotencyKey === 'string') {
    if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
      reply.code(400).send({
        error: 'BAD_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key header must be 8-200 chars (UUID or opaque token).',
      });
      return;
    }
    const cached = await checkIdempotencyKey(options.companyId, options.routeKey, idempotencyKey);
    if (cached) {
      reply.code(cached.status).send(cached.body);
      return;
    }
  }

  // Run the handler, capture its result, send it. If we have an
  // idempotency key, persist the result BEFORE sending so a crash
  // between the side-effect and the send still allows the retry to see
  // the cached response.
  const result = await handler();

  if (typeof idempotencyKey === 'string') {
    try {
      await recordIdempotencyKey(options.companyId, options.routeKey, idempotencyKey, result);
    } catch (err) {
      // Record failure is non-fatal — the side effects already
      // committed; we just couldn't cache. Log so ops sees the
      // pattern if it becomes frequent.
      req.log.warn(
        { err, event: 'idempotency.record_failed', routeKey: options.routeKey },
        'idempotency-key record failed; response will not be retry-cached',
      );
    }
  }

  reply.code(result.status).send(result.body);
}
