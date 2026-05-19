# ADR-0024: Redis for caches; Postgres for source-of-truth + audit

- **Status:** Accepted
- **Date:** 2026-05-20
- **Master plan §:** §G (Iteration 4 — infrastructure)
- **Panel debate:** none — founder direct call after friend's production-grade review (2026-05-20)
- **Supersedes:** ADR-0009 (Postgres outbox over Redis until measured pain)

## Context

ADR-0009 picked Postgres-backed outbox + OTP store with the explicit "until
measured pain" caveat. The friend's review of Wave A's chat code surfaced
real pain on the multi-replica horizon:

1. In-memory `Map`-based rate limiting in `chat.ts:517` doesn't survive a
   second backend replica — counters reset on deploy, each replica has its
   own state, the cap is N× too generous at scale.
2. Process-local `concurrentCalls` counter + `tryAcquireChatSlot`
   semaphore in `chat-concurrency.ts` have the same problem.
3. Circuit-breaker state for OpenAI outage protection (friend #5) has no
   meaningful single-replica implementation.
4. OTP store at `lib/otp-store.ts:4` already had a TODO: "Day 4
   implementation: simple Postgres-backed store. Replace with Redis at
   10K+ rps."
5. `ChatRequestLog`-backed chat idempotency at 10-min TTL is the textbook
   Redis-with-TTL workload; doing it in Postgres means a sweep job that
   doesn't exist yet.

Per `feedback_panel_test_before_production_surface.md` the friend's review
counts as a "production-readiness panel test" — the gaps are real, the
right tool is Redis. Founder approved 2026-05-20.

## Options considered

| Option                                                    | Pros                                                                                                                                                                      | Cons                                                                                                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Keep Postgres-for-everything (ADR-0009 status quo)     | One infra component; no new ops surface                                                                                                                                   | Multi-replica state lies, hot-path counters churn rows + WAL, no native TTL for cache-shaped data                                                 |
| B. Redis on Railway managed service, used for caches only | Right tool for the job; co-located with backend in Railway; native TTL + atomic INCR / advisory locks via redlock; ~$5/mo at startup tier already covered by the $20 plan | One more service to monitor; another dep (`ioredis`); single point of failure if Redis goes down (mitigated by graceful degradation in consumers) |
| C. Upstash serverless Redis                               | Pay-per-request; HTTP API; no persistent connection (good for serverless functions)                                                                                       | Higher latency than co-located Railway Redis; not needed since backend isn't serverless                                                           |

## Decision

We chose **Option B: Railway managed Redis, used for caches only**.

Source-of-truth + audit stays on Postgres:

- `Policy` table (append-only config)
- `AuditEvent` (immutable record)
- `ChatMessage`, `ChatThread`, `SupervisorDecision`, etc. (domain rows)
- `Notification`, `Outbox`, `Digest` (durable delivery, audit-grade)

Redis takes over the cache-shaped surfaces:

- Per-supervisor rate-limit sliding window (friend #8)
- Chat-concurrency semaphore (`tryAcquireChatSlot`)
- OpenAI circuit-breaker state (friend #5)
- OTP store (TTL ≤ 5 min, high read rate)
- Chat idempotency cache (TTL ≤ 10 min) — `ChatRequestLog` table stays
  for the audit trail of "what response did this idempotency key get"
  but the FAST path reads Redis; Postgres is the cold backup.

Panel members consulted: none — direct founder call. Friend's review
served as the production-readiness panel.

## Consequences

### Positive

- Multi-replica deploys actually enforce their rate limits + concurrency
  caps (current code is fake protection across replicas).
- OpenAI outages fast-fail via circuit breaker instead of hanging 100×
  50s and exhausting the connection pool.
- OTP store handles 10K+ rps without a Postgres bottleneck.
- Idempotency cache gets native TTL + atomic SETNX-with-expire — no
  sweep job to write.

### Negative

- New service to monitor on Railway dashboard.
- New dep (`ioredis`) on `apps/backend`.
- Cold-start adds one TCP connection to Redis.
- Cost: ~$5/mo on Railway startup tier (within the founder's existing
  $20/mo budget).

### Neutral

- ADR-0009 is superseded. Existing Postgres-backed outbox + audit STAY
  on Postgres per this ADR's "source of truth + audit" boundary.
- `lib/redis.ts` is the single import point for the client. No other
  module connects to Redis directly. This is how we keep the dep surface
  thin enough that swapping providers later (Upstash, AWS ElastiCache)
  is a one-file change.

## Rollback

If Redis becomes a problem (cost, ops burden, outage cascades), the
fallback is straightforward:

1. Each consumer (rate-limiter, circuit-breaker, OTP, idempotency) has a
   Postgres-backed fallback path documented inline.
2. Flip the env var `AXHY_REDIS_FALLBACK_TO_POSTGRES=1` to short-circuit
   each consumer to its Postgres backup.
3. De-provision the Railway Redis service.

The fallback is intentionally per-consumer so we can keep the cheap wins
(idempotency, OTP) while rolling back the controversial ones (rate limit,
circuit breaker) if measured pain reverses.
