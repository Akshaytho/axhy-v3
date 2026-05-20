---
status: Draft (awaiting founder approval)
source: docs/locked/vector-rag-context-assembly.md §13 Phase 5
author: Claude Opus 4.7
date: 2026-05-20
---

# Phase 5 — Permanent Kill Switch Deployment Guide

## 1. Why this is a permanent kill switch

Martin Fowler's feature-toggle taxonomy (https://martinfowler.com/articles/feature-toggles.html) distinguishes between Release Toggles (short-lived, deleted once confident) and Ops Kill Switches (permanent emergency degrade levers). After Phase 3 measurement confirms semantic retrieval quality, the toggle graduates: it does NOT get deleted.

The polarity inverts in Phase 5:

- **OLD** — `SEMANTIC_CONTEXT_ENABLED='true'` → semantic ON; unset → blind window (safe default was fallback).
- **NEW** — `SEMANTIC_CONTEXT_KILL_SWITCH='true'` → emergency fallback; unset → semantic ON (safe default is now semantic).

The flag stays forever. Deleting the fallback path removes the ops team's only emergency lever during pgvector incidents or OpenAI embedding outages.

## 2. Deployment instructions

**Initial production deploy (before Phase 3 measurement completes):**

1. In Railway env vars, SET `SEMANTIC_CONTEXT_KILL_SWITCH=true` before deploying Phase 5 code.
2. Deploy. The kill switch is engaged → behavior is identical to pre-Phase-2 (blind 10-turn window). Zero risk.
3. Run Phase 3 measurement (cost delta, quality score). Target: costDelta ≤ +8%, semanticMiss < 20%.
4. Once Phase 3 gates pass, UNSET `SEMANTIC_CONTEXT_KILL_SWITCH` in Railway env vars (do NOT set to 'false'; just remove the variable entirely).
5. Redeploy. Semantic retrieval is now ON by default for all supervisors.

**Post-Phase-3 (normal operation):**

- Variable is absent. Semantic runs. No action needed.

## 3. When to ENGAGE the kill switch (set to 'true')

Engage immediately when any of the following incidents occur:

- OpenAI embedding endpoint returns errors (5xx) for > 2 consecutive minutes.
- pgvector query latency exceeds 2000ms p95 (Railway DB under load).
- `retrieval_meta.source='fallback'` rate exceeds 30% of chat turns (visible in Pino logs).
- Any supervisor reports "chat is broken" and semantic logs show embedding failures.
- DB migration touching `axhy_chat.turn_embeddings` is in progress.

To engage: `railway variables set SEMANTIC_CONTEXT_KILL_SWITCH=true` then redeploy (or use Railway's instant env-var injection if no code change is needed).

**4-gate retirement checklist** (before considering removing the fallback code path entirely — likely never):

1. 6+ months of zero pgvector incidents in production.
2. Automated alerting on embedding failures is wired to PagerDuty or equivalent.
3. Written runbook exists for "semantic context degraded" scenario.
4. Founder explicitly approves in a constitutional session.

## 4. When NEVER to delete the fallback path

The `loadPriorMessages` blind-window fallback in `assembleSemanticContext` MUST NOT be deleted until ALL four gates in Section 3 are met. This is a permanent ops invariant, not a cleanup task.

Rationale: the chat route must never be blocked by embedding infrastructure. Even if OpenAI has 99.99% uptime, a Railway DB scaling event can make pgvector queries spike to 5+ seconds. The fallback is the only guarantee that supervisors can keep working during infrastructure incidents.

## 5. Per-tenant override roadmap

Post 3+ paying customers: add `tenantSettings.semanticContextDisabled: Boolean @default(false)` column to the `CompanySettings` table (separate migration, separate PR). This allows specific tenants to opt out of semantic retrieval (e.g., compliance-sensitive clients who do not want any embedding calls). The kill switch and the per-tenant override are independent: kill switch = global emergency lever; per-tenant = opt-out for specific companies.

Do NOT implement this until there is a real customer asking for it.

## 6. Proposed amendment to docs/locked/operational-invariants.md

The following text is ready for a founder to copy into `docs/locked/operational-invariants.md` during a constitutional session:

---

**§OI-XX — Semantic context kill switch (permanent)**

`SEMANTIC_CONTEXT_KILL_SWITCH` is a permanent ops kill switch for the vector RAG retrieval path in `assembleSemanticContext`. It MUST NOT be deleted from the codebase.

- Unset or `'false'`: semantic retrieval runs (normal operation after Phase 3 passes).
- `'true'`: kill switch engaged; falls back to blind 10-turn window via `loadPriorMessages`.

The fallback code path in `assembleSemanticContext` MUST NOT be deleted until the 4-gate retirement checklist passes (see `docs/plans/2026-05-20-phase-5-kill-switch-deployment-guide.md §3`). This is a two-tier truth invariant: this locked doc overrides any code that removes the fallback.

---
