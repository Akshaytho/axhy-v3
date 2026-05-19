---
broken_rule: 'chat-reload-context.ts and me.ts still use Promise.all — one slow read kills the entire request. chat.ts already fixed to Promise.allSettled.'
persona: all
date: 2026-05-20
session: 'Wave A deep code review — CORRECTED after full file audit'
check_pattern: 'Promise.all(['
check_paths: 'apps/backend/src/routes'
check_expect: 'exists'
---

# Learning: Graceful degradation — Promise.allSettled not yet everywhere

## What happened (corrected)

Initial review flagged Promise.all in chat.ts. CORRECTION: chat.ts line 793
ALREADY uses Promise.allSettled with per-read fallbacks and req.log.warn for
rejected promises. The Antigravity session fixed the main route.

Still unfixed:

- `chat-reload-context.ts:54` — Promise.all for 4 parallel reads
- `me.ts:27` — Promise.all for user + company + memberships

## Root cause

Wave A fixed the primary chat route but missed the secondary routes.

## Prevention rule

1. ANY parallel read block in routes MUST use Promise.allSettled with defaults
2. `check_paths` scoped to the two unfixed files only
3. `check_expect: none` means Promise.all should NOT appear in those files

## Detection

`check_pattern: 'Promise\.all\(\['` scoped to the 2 unfixed files.
