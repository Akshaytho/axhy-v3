---
date: 2026-06-01
persona: all
session: trial-graduation-2026-05-31-into-2026-06-01
broken_rule: 'general principle — integrity primitives must not depend on mutable state'
check_pattern: 'getHmacSecret.*\.update\(.*pkg|getHmacSecret.*\.update\(.*readFileSync.*package\.json'
check_paths: '../axhy-cognitive-system/src/shared/config.mjs'
check_expect: none
status: fixed
---

# HMAC secret must not depend on mutable state

## What broke

`getHmacSecret()` in `axhy-cognitive-system/src/shared/config.mjs` derived the integrity secret by hashing **package.json content** + `COGNITIVE_SYSTEM_ROOT` + a version constant.

- MCP guardrail server is a long-lived process — it caches `_hmacSecret` once at boot.
- Local pre-edit-guard hook is short-lived per-call — it computes the secret fresh each invocation.

Mid-session, a subagent edited `package.json` (added `prepare` script + `lint-staged` config while graduating change-4 husky hooks). From that point MCP's cached secret no longer matched what fresh hook invocations computed. Every MCP-signed `/tmp/axhy-{hash}-guardrail-state.json` was rejected by the local hook as "unsigned/invalid." All edits to protected paths blocked, **including the very file containing the bug.**

## Why this matters generally

An integrity primitive's secret was tied to a file that the system itself modifies. Stability is a precondition for the entire write-gating architecture; `package.json` is one of the most-edited files in a node project.

Same family of mistake as: baking API tokens into config that gets hot-reloaded; hashing request payloads with server-controlled timestamps; deriving JWT secrets from env vars that bounce between deploys.

## The fix

Removed `pkgContent` from the hash. Secret derives only from `COGNITIVE_SYSTEM_ROOT` + `'axhy-state-integrity-v1'` — both immutable for the install.

## Cleanup performed

- Deleted 9 stale state files: `/tmp/axhy-{47bc0658,827ba5ea,0b685971}-{,build-,plan-}guardrail-state.json`
- Founder restarted MCP server to flush cached secret
- After fix: all 5 trial changes graduated through normal guardrails — 40/40 tests pass

## Rule for the audit

Pattern: `getHmacSecret.*\.update\(.*pkg` and `getHmacSecret.*\.update\(.*readFileSync.*package\.json`

Any HMAC/integrity-derivation function in axhy-cognitive-system must not `.update(...)` with the content of any file the codebase itself mutates.

## Files touched

- `axhy-cognitive-system/src/shared/config.mjs` lines 149-163 — package.json content removed from secret hash
