---
broken_rule: 'Audit flags chat.ts as missing the 50-concurrent semaphore, but it IS enforced via tryAcquireChatSlot() at chat.ts:704 (imported from lib/chat-concurrency.ts at line 51). Redis ZSET-backed, multi-replica safe.'
persona: all
date: 2026-05-20
session: 'Wave A.3 Phase 1 — vector-rag + locked-docs ride-along audit'
check_pattern: 'tryAcquireChatSlot'
check_paths: 'apps/backend/src/routes/chat.ts'
check_expect: 'exists'
---

# Audit false positive — the 50-concurrent semaphore IS enforced

## What the audit reports

```
[abuse-concurrent-limit] [chat-abuse-prevention.md] Chat route missing 50-concurrent semaphore
```

## Why this is a false positive

The 50-concurrent semaphore is enforced via the `tryAcquireChatSlot()` / `releaseChatSlot()` primitives:

- **Import:** `apps/backend/src/routes/chat.ts:51` —
  ```typescript
  import { tryAcquireChatSlot, releaseChatSlot } from '../lib/chat-concurrency.js';
  ```
- **Enforcement call site:** `apps/backend/src/routes/chat.ts:704` — "Distributed concurrency slot — Redis ZSET, multi-replica safe"
- **Implementation:** `apps/backend/src/lib/chat-concurrency.ts` — Redis ZSET-backed primitive that limits to 50 concurrent in-flight chat requests across ALL replicas.

This is correctly multi-replica-safe (a per-process in-memory counter would not be).

The audit's hardcoded compliance check (in `packages/ai-tools/src/session-audit.ts`) appears to look for an inline pattern that doesn't recognize the `tryAcquireChatSlot` primitive. Until that check is updated, this learning suppresses the false positive by asserting the canonical detection pattern (`tryAcquireChatSlot`) exists in chat.ts.

## What still needs to be done

The audit's compliance check should be updated in a separate session to look for the canonical pattern:

```
tryAcquireChatSlot|releaseChatSlot
```

instead of whatever inline pattern it currently scans for.

This is an audit-pattern improvement, not a code change. Phase 1 of vector-RAG correctly leaves the enforcement code untouched.
