---
broken_rule: 'RESOLVED — idempotency migrated to Redis SETNX reserve-then-execute pattern in chat-idempotency.ts. Race condition fixed.'
persona: all
date: 2026-05-20
session: 'Wave A deep code review — CORRECTED after full file audit'
check_pattern: 'idempotencyKey.findUnique'
check_paths: 'apps/backend/src'
check_expect: 'exists'
---

# Learning: Idempotency — RESOLVED by Wave A

## What was flagged

Initial review incorrectly flagged `checkIdempotency(prisma, ...)` at chat.ts:602
as running outside the write transaction, allowing double-sends.

## What actually happened (corrected)

Wave A created `lib/chat-idempotency.ts` which replaced the Postgres-based
`lib/idempotency-key.ts` with a Redis-backed reserve-then-execute pattern:

1. `checkIdempotency()` → `redis.get(key)` — cache miss? Proceed.
2. `reserveIdempotency()` → `SET key PROCESSING NX PX 10m` — atomic claim.
3. If NX fails → another request owns the slot → return 409 IDEMPOTENCY_IN_FLIGHT.
4. `recordIdempotency()` → `SET key <response> XX PX 10m` — finalise.
5. `releaseIdempotency()` → Lua CAS delete — clean up on failure.

The `_prisma` arg in `checkIdempotency(_prisma, ...)` is UNUSED (kept for
API compat). The actual check hits Redis, not Postgres.

The SETNX is atomic. Two concurrent requests: one gets OK, the other gets null.
Race condition is fully resolved.

## Detection

`check_pattern` now watches for the OLD Postgres pattern (`idempotency-key.ts`
with `findUnique`) being imported into routes. `check_expect: none` ensures
routes use the new Redis implementation, not the legacy Postgres one.
