# Redis Integration Spec — Use Redis Everywhere Possible

Status: **SPEC** — Created 2026-05-20 after Wave A deep code review.
Reference: ADR-0024 (Redis for caches; Postgres for source-of-truth + audit).

---

## Already Using Redis (6 files — DONE)

These files are complete and wired into routes. No changes needed.

| #   | File                            | What it does                                | Redis pattern            |
| --- | ------------------------------- | ------------------------------------------- | ------------------------ |
| 1   | `lib/redis.ts`                  | Singleton ioredis client, graceful shutdown | Connection management    |
| 2   | `lib/redis-rate-limit.ts`       | Sliding-window rate limiter                 | ZSET + MULTI pipeline    |
| 3   | `lib/chat-concurrency.ts`       | 50-concurrent distributed semaphore         | ZSET + Lua atomic script |
| 4   | `lib/chat-idempotency.ts`       | Reserve-then-execute dedup                  | SET NX PX (atomic claim) |
| 5   | `lib/openai-circuit-breaker.ts` | CLOSED/OPEN/HALF_OPEN breaker               | Multi-key state machine  |
| 6   | `lib/otp-store.ts`              | OTP hash storage + rate limit               | HSET + ZSET per phone    |

All 6 follow the same graceful degradation: Redis down → fail OPEN (allow traffic)
except otp-store which fails CLOSED (auth-critical).

---

## Must Add Redis Caching (hot-path reads hitting Postgres every request)

These are the files that hit Postgres on every request but the data is cacheable.
Adding a cache-first pattern here will cut 10-15 DB round trips per chat message
down to 2-3.

### Priority 1 — Chat pre-flight reads (hit on EVERY chat message)

| #   | File                                              | Function                                         | What it reads                                | Suggested TTL | Invalidation trigger                                      |
| --- | ------------------------------------------------- | ------------------------------------------------ | -------------------------------------------- | ------------- | --------------------------------------------------------- |
| 7   | `lib/policy-rules-loader.ts`                      | `loadCompanyRules(tx, companyId)`                | Company L1 rules from Policy table           | 5 min         | POST /admin/policy (when key starts with `company_rule_`) |
| 8   | `lib/policy-rules-loader.ts`                      | `loadHrRules(tx, companyId)`                     | HR L2 rules from Policy table                | 5 min         | POST /admin/policy (when key starts with `hr_rule_`)      |
| 9   | `lib/living-doc.ts` or `lib/living-doc-prompt.ts` | `getLivingDoc(tx, companyId, supervisorId)`      | Active LivingDoc rules for prompt            | 5 min         | On rule add/expire in living-doc-cap.ts                   |
| 10  | `lib/calendar-context.ts`                         | `loadCalendarTier3(tx, companyId, supervisorId)` | Calendar block for AI prompt                 | 5 min         | On calendar event create/update/delete                    |
| 11  | `lib/supervisor-token-cap.ts`                     | `checkTokenCap(tx, companyId, supervisorId)`     | Today's token usage (raw SQL aggregate JOIN) | 30 sec        | After every chat message (recordIdempotency already runs) |

Cache key pattern: `cache:<module>:<companyId>` or `cache:<module>:<companyId>:<supervisorId>`

### Priority 2 — Frequently called routes

| #   | File                            | What it reads                                                 | Suggested TTL                             | Invalidation trigger                      |
| --- | ------------------------------- | ------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------- |
| 12  | `routes/me.ts`                  | User + Company + Memberships (3 parallel Prisma queries)      | 60 sec                                    | On user profile update, membership change |
| 13  | `routes/supervisor-today.ts`    | Today's dashboard data (sites, workers, assignments)          | 30 sec                                    | On assignment/visit state changes         |
| 14  | `routes/supervisor-context.ts`  | Supervisor context for mobile                                 | 60 sec                                    | On context-relevant data changes          |
| 15  | `routes/chat-reload-context.ts` | 4 parallel reads (livingDoc, calendar, companyRules, hrRules) | Same as items 7-10 (reuse the same cache) | Same as items 7-10                        |

### Priority 3 — Lower-frequency but still worth caching

| #   | File                              | What it reads                                   | Suggested TTL          | Invalidation trigger          |
| --- | --------------------------------- | ----------------------------------------------- | ---------------------- | ----------------------------- |
| 16  | `lib/reload-context-counter.ts`   | Daily CHAT_RELOAD_CONTEXT count from AuditEvent | 60 sec                 | On reload-context action      |
| 17  | `lib/living-doc-cap.ts`           | Active LivingDoc rules count                    | 60 sec                 | On rule add/expire            |
| 18  | `routes/auth.ts`                  | User lookup + memberships on login/OTP verify   | No cache (auth writes) | N/A                           |
| 19  | `lib/effective-responsibility.ts` | Effective supervisor responsibility chain       | 5 min                  | On assignment/binding changes |

---

## Implementation Pattern

All caching should follow this pattern:

```typescript
// In lib/cache.ts (NEW FILE TO CREATE)
import { getRedis } from './redis.js';

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const redis = getRedis();
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // Redis down → cache miss → hit Postgres
  }
}

export async function cacheSet(key: string, value: unknown, ttlMs: number): Promise<void> {
  try {
    const redis = getRedis();
    await redis.set(key, JSON.stringify(value), 'PX', ttlMs);
  } catch {
    // Redis down → skip cache write, data still in Postgres
  }
}

export async function cacheInvalidate(...keys: string[]): Promise<void> {
  try {
    const redis = getRedis();
    if (keys.length > 0) await redis.del(...keys);
  } catch {
    // Redis down → key expires on TTL naturally
  }
}
```

Usage in a loader:

```typescript
// In lib/policy-rules-loader.ts
import { cacheGet, cacheSet } from './cache.js';

export async function loadCompanyRules(tx, companyId) {
  const cacheKey = `cache:companyRules:${companyId}`;
  const cached = await cacheGet<PolicyRule[]>(cacheKey);
  if (cached) return cached;

  const rules = await tx.policy.findMany({ ... });
  await cacheSet(cacheKey, rules, 5 * 60 * 1000); // 5 min
  return rules;
}
```

Invalidation on write:

```typescript
// In routes/admin-policy.ts — after successful policy write
import { cacheInvalidate } from '../lib/cache.js';

// After setPolicy succeeds:
if (key.startsWith('company_rule_')) {
  await cacheInvalidate(`cache:companyRules:${companyId}`);
} else if (key.startsWith('hr_rule_')) {
  await cacheInvalidate(`cache:hrRules:${companyId}`);
}
```

---

## Files That Should NOT Use Redis

These files are write-heavy or transactional — caching would be wrong:

| File                                | Why no cache                                       |
| ----------------------------------- | -------------------------------------------------- |
| `lib/policy-service.ts`             | Writes only (append-only Policy rows)              |
| `lib/policy-write-acl.ts`           | Pure logic, no DB reads                            |
| `lib/prompt-composer.ts`            | Pure string composition, no DB                     |
| `lib/chat-thread-service.ts`        | Uses pg_advisory_xact_lock (must be transactional) |
| `lib/audit-event.ts`                | Write-only (append-only audit trail)               |
| `lib/supervisor-decision-writer.ts` | Transactional writes                               |
| `lib/ist-date.ts`                   | Pure date math                                     |
| `lib/jwt.ts`                        | Stateless token signing                            |
| `lib/msg91.ts`                      | External API call                                  |
| `lib/outbox.ts`                     | Transactional writes                               |
| `lib/prisma.ts`                     | Connection singleton                               |
| `lib/same-day-freeze.ts`            | Business logic                                     |

---

## Also Fix: Promise.all → Promise.allSettled

chat.ts already uses Promise.allSettled (line 793). These two still use Promise.all:

| File                            | Line | Fix                                                             |
| ------------------------------- | ---- | --------------------------------------------------------------- |
| `routes/chat-reload-context.ts` | 54   | Change `Promise.all([` to `Promise.allSettled([` with fallbacks |
| `routes/me.ts`                  | 27   | Change `Promise.all([` to `Promise.allSettled([` with fallbacks |

---

## Also Fix: console.warn → req.log / pino

chat.ts already uses `req.log.warn` (Fastify's pino). These files still use bare `console.warn`:

| File                            | Lines        | Fix                                          |
| ------------------------------- | ------------ | -------------------------------------------- |
| `lib/redis.ts`                  | 59           | Accept logger param or use module-level pino |
| `lib/openai-circuit-breaker.ts` | 99, 133, 147 | Same                                         |
| `lib/redis-rate-limit.ts`       | 72, 124      | Same                                         |
| `lib/chat-concurrency.ts`       | 83, 106      | Same                                         |
| `lib/living-doc.ts`             | 29           | Same                                         |

Pattern: create a module-level `const log = pino({ name: 'redis' })` or pass the
request logger through the call chain.

---

## Summary

- **6 files** already use Redis — operational guardrails complete
- **13 files** need Redis caching added — hot-path reads
- **1 new file** needed: `lib/cache.ts` (cacheGet/cacheSet/cacheInvalidate)
- **2 files** need Promise.all → Promise.allSettled fix
- **5 files** need console.warn → pino structured logging
