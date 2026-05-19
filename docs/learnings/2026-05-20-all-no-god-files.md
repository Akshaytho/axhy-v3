---
broken_rule: 'chat.ts is 1815 lines with 10 tool handlers in one if/else chain — violates Open-Closed Principle and blocks parallel work'
persona: all
date: 2026-05-20
session: 'Wave A deep code review — production hardening gaps'
check_pattern: 'registerChatRoutes'
check_paths: 'apps/backend/src/routes'
check_expect: 'present'
---

# Learning: No God files — max 300 lines per route file

## What happened

Wave A produced chat.ts at 1815 lines. It contains:

- Route handler for /chat/messages (~700 lines)
- Route handler for /chat/apply (~550 lines)
- 10 tool handler functions inline in the handler callback (~370 lines)
- Helper functions (loadPriorMessages, persistChatTurn, rate limiter)
- Inline error class definitions

Adding tool #11 means editing the same 1815-line file. Merge conflicts
with anyone else touching any of the other 10 tools.

## Root cause

Antigravity session put everything in one file instead of splitting
tool handlers into separate modules.

## Prevention rule

1. Route files max 300 lines — glue only (parse, auth, dispatch, respond)
2. Each tool handler in its own file under `lib/tool-handlers/`
3. Helper functions (loadPriorMessages, persistChatTurn) in their own lib modules
4. Error classes at module level, never inside function closures

## Detection

`check_pattern: registerChatRoutes` with `check_expect: present` ensures
the registration function still exists. The real enforcement is wc -l on
the file — a pre-commit hook should reject route files over 300 lines.
