---
broken_rule: 'Audit flags chat.ts as missing per-supervisor message rate limit, but the per-message-count cap was replaced by a per-token cap on 2026-05-19 (migration 015). The token cap is enforced via checkSupervisorTokenCap() at chat.ts:764.'
persona: all
date: 2026-05-20
session: 'Wave A.3 Phase 1 — vector-rag + locked-docs ride-along audit'
check_pattern: 'checkSupervisorTokenCap'
check_paths: 'apps/backend/src/routes/chat.ts'
check_expect: 'exists'
---

# Audit false positive — per-supervisor "message rate limit" was replaced by "token cap"

## What the audit reports

```
[abuse-rate-limit] [chat-abuse-prevention.md] Chat route missing per-supervisor message rate limit
```

## Why this is a false positive

The locked doc `docs/locked/chat-abuse-prevention.md` originally specified:

> Per-supervisor daily message limit: 200 messages/day

But a founder design change on **2026-05-19** (migration 015 `20260525_015_chat_message_token_counts`) replaced this with:

> Per-supervisor daily TOKEN limit: 50000 tokens/day (Policy-configurable)

Reason (per migration 015 comment): a 30-second voice note with photos burns ~10× the tokens of a 3-word "Mukesh absent" — the previous cap was unfair to short-form users and too generous to long-form users.

The enforcement code lives in:

- `apps/backend/src/lib/supervisor-token-cap.ts` — `checkSupervisorTokenCap(tx, { companyId, supervisorId })`
- `apps/backend/src/routes/chat.ts:764` — call site, inside `withTenantContext`, BEFORE the AI invocation. Throws `TokenCapReachedError` → HTTP 429 with `X-Token-Cap-Reset-At` header.

The audit's hardcoded compliance check (in `packages/ai-tools/src/session-audit.ts`) hasn't been updated to recognize this replacement. Until that check is updated, this learning suppresses the false positive by asserting the canonical detection pattern (`checkSupervisorTokenCap`) exists in chat.ts.

## What still needs to be done

The locked doc `chat-abuse-prevention.md` § "Budget Abuse Prevention" still describes the message-count cap. Founder should amend that doc in a constitutional session to reflect the token-cap reality. Until then, this learning is the canonical truth pointer.

The audit's compliance check should also be updated in a separate session to:

- Look for `checkSupervisorTokenCap` (or any per-supervisor cap enforcement) rather than the obsolete message-count pattern.
