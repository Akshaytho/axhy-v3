---
broken_rule: 'docs/locked/rule-hierarchy-three-layers.md and security-gaps-to-fix.md reference a role that does not exist in code'
persona: all
date: 2026-05-19
session: 'Wave A — sidebar + chat AI compliance'
check_pattern: 'COMPANY_ADMIN'
check_paths: 'apps/backend/src,apps/mobile,packages/shared-schema/src,packages/ai-tools/src'
check_expect: 'none'
---

# Learning: `COMPANY_ADMIN` is locked-doc shorthand for `OWNER`

## What happened

The locked docs use `COMPANY_ADMIN` in 4+ places:

- `docs/locked/rule-hierarchy-three-layers.md` lines 14, 20, 47, 48
- `docs/locked/security-gaps-to-fix.md` lines 25, 26
- `docs/locked/operational-invariants.md` line 38

But the actual Role enum at
`packages/shared-schema/src/zod/auth.ts:21` defines only:

```ts
['WORKER', 'SUPERVISOR', 'OWNER', 'HR', 'SUPER_ADMIN'];
```

`COMPANY_ADMIN` does not exist. The role that the locked docs call
`COMPANY_ADMIN` (the tenant-side admin) maps to `OWNER` in code.
`SUPER_ADMIN` is the Axhy platform admin and is treated as a bypass for
any restricted key (support / debugging).

## Root cause

Locked docs were written before the Role enum stabilised on
`OWNER` as the tenant-admin label. The shorthand `COMPANY_ADMIN` was not
updated when the enum landed.

## Prevention rule

1. Code never references `COMPANY_ADMIN` — it always uses `OWNER` for
   tenant-admin and `SUPER_ADMIN` for platform-admin. The grep check
   above blocks any commit that introduces `COMPANY_ADMIN` to code.
2. Locked docs SHOULD be updated to use `OWNER` for clarity. That is a
   founder-authored change (per `feedback_locked_docs_founder_authored`),
   not something this session can do. Surface it in the done memo.

## Detection

`check_pattern: 'COMPANY_ADMIN'` greps the source dirs (excluding docs).
Will fail any commit that accidentally introduces the wrong role name.

## Reference

- Role enum: `packages/shared-schema/src/zod/auth.ts:21`
- ACL impl: `apps/backend/src/lib/policy-write-acl.ts` PREFIX_ACL
- Scenarios doc: `docs/journeys/2026-05-19-wave-a-sidebar-chat-ai-scenarios.md` (Role-mapping note)
- Wave A session: plans/abstract-wandering-kazoo.md
