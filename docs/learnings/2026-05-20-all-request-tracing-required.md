---
broken_rule: 'lib/ modules use bare console.warn instead of structured pino logger. chat.ts already uses req.log.warn (Fastify pino) correctly.'
persona: all
date: 2026-05-20
session: 'Wave A deep code review — CORRECTED after full file audit'
check_pattern: 'console\.warn'
check_paths: 'apps/backend/src/lib'
check_expect: 'none'
---

# Learning: Structured logging not yet in lib/ modules

## What happened (corrected)

Initial review claimed "zero observability." CORRECTION: chat.ts DOES use
Fastify's built-in pino logger via `req.log.warn()` for structured logging.
pino is installed as a dependency. The dispatcher also imports pino directly.

Still unfixed — 5 lib modules use bare `console.warn`:

- `lib/redis.ts:59`
- `lib/openai-circuit-breaker.ts:99,133,147`
- `lib/redis-rate-limit.ts:72,124`
- `lib/chat-concurrency.ts:83,106`
- `lib/living-doc.ts:29`

These modules don't have access to `req.log` because they're not in the
request context. Fix: either pass the request logger through, or create a
module-level pino instance: `const log = pino({ name: 'redis' })`.

## Prevention rule

1. NO bare console.\* in production code (lib/ or routes/)
2. Route handlers: use `req.log` (Fastify's per-request pino with requestId)
3. Lib modules: use module-level `pino({ name: '<module>' })`
4. `check_paths` scoped to `apps/backend/src/lib` only (routes already correct)

## Detection

`check_pattern` greps for console.warn/log/error in lib/ only.
