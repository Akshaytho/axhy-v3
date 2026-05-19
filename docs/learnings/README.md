---
Status: LOCKED
Locked by: Founder (Akshay Thota)
Locked at: 2026-05-19
Category: architecture_lock
---

# Learnings — Self-Improving Rules

This directory contains rules that Claude Code generates when it breaks a locked doc rule.

## How it works

1. Pre-commit hook runs audit against locked docs
2. If violations found, commit is BLOCKED
3. Claude Code fixes the violation
4. Claude Code writes a learning file explaining:
   - What rule was broken
   - WHY it was broken (root cause)
   - What new rule prevents it next time
5. Learning file gets committed with the fix
6. brain:build embeds the learning
7. Next session, impactCheck surfaces it BEFORE the same mistake repeats

## File naming

```
YYYY-MM-DD-{persona}-{short-description}.md
```

Examples:

- `2026-05-19-supervisor-dont-stream-chat.md`
- `2026-05-20-all-always-atomic-spend.md`
- `2026-05-21-admin-validate-policy-namespace.md`

## Required fields

Every learning MUST have:

- **broken_rule**: which locked doc + rule number was violated
- **persona**: supervisor / worker / admin / super_admin / hr / all
- **root_cause**: WHY Claude Code made this mistake
- **prevention_rule**: the new rule to prevent recurrence
- **detection**: how the audit catches this (grep pattern, file check, etc.)

### Machine-readable detection (STRONGLY recommended)

These optional frontmatter fields turn the learning into a **live audit check** that runs automatically on every future session:

- **check_pattern**: grep regex to search for (e.g. `streaming|SSE|EventSource`)
- **check_paths**: comma-separated directories to search (e.g. `apps/backend/src`)
- **check_expect**: `none` = pattern must NOT exist (default), `exists` = pattern MUST exist

If these are present, session-audit Phase 3 runs the grep and fails if the pattern violates expectations. The audit grows with every mistake — learnings aren't passive notes, they're active guards.

Skip comment: add `// learned-ok` to exempt a specific line from learned checks.

## Template

```markdown
---
broken_rule: '{doc-name}.md — Rule/Invariant/Gap #N'
persona: all
date: YYYY-MM-DD
session: '{brief description of what was being built}'
check_pattern: '{grep regex — what to search for}'
check_paths: '{comma-separated dirs to scan}'
check_expect: 'none'
---

# Learning: {short title}

## What happened

{What the violation was}

## Root cause

{Why Claude Code made this mistake — was it forgetting context? Wrong assumption? Optimistic shortcut?}

## New prevention rule

{The concrete rule that prevents this from happening again}

## Detection

{How the audit should catch this — grep pattern, file check, etc.}
```

## Compaction

Learnings accumulate. When the count gets high (20+ files or 3+ learnings for the same rule), session-audit recommends compaction:

```bash
pnpm --filter @axhy/ai-tools brain:compact
```

What compaction does:

- Groups learnings by `broken_rule`
- Rules with 2+ learnings get **consolidated** into one file
- All `check_pattern` values are ORed together (nothing lost)
- All `check_paths` are unioned (nothing lost)
- Newest root cause is kept (newer wins)
- Original files move to `docs/learnings/_archive/` (never deleted)
- Solo learnings stay untouched

Example: 5 learnings about "chat-behavior-rules.md — Rule 6" → 1 consolidated file with all 5 grep patterns merged, 5 originals in `_archive/`.

## Important

- Learnings are NEVER deleted — originals archive, consolidated files replace them.
- Each learning gets embedded in the brain with the correct persona tag.
- If two learnings contradict each other, the NEWER one wins.
- Learnings do NOT override locked docs — they supplement them with implementation-specific guidance.
- Consolidated learnings inherit the newest persona and date.
