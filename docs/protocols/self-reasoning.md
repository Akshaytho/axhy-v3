---
Status: Active
Last validated against code: 2026-05-19
Primary owner: founder (Akshay Thota)
Replaces: nothing — first-version
---

# Self-Reasoning Protocol

Before executing ANY task (feature, fix, refactor, doc), the AI must think
like a human brain — not lookup, but reconstruction. Ask yourself questions,
search for answers, connect dots, verify assumptions, project consequences.

This protocol is mandatory. Skipping it is the #1 cause of:

- Undoing correct code to match stale docs
- Re-debating locked decisions
- Building features that break existing invariants
- Missing edge cases the founder already solved
- Losing context across sessions

## The Ice Cream Test

When someone asks "did you eat ice cream recently?" you don't query a table.
You search: when did I last go out? → who was I with? → what did we eat? →
yes, it was mango at that mall last month. The answer forms through QUESTIONS,
not through LOOKUP.

When you get a task, think the same way.

## The Protocol (before writing any code)

### Phase 1: WHAT IS THIS? (30 seconds)

Restate the task in one sentence. Name the persona who cares about it.
If you can't name the persona, you don't understand the task.

### Phase 2: WHAT DO I KNOW? (vector search)

Search the knowledge graph for the task description:

```
impactCheck("the task description in plain English")
```

Read every result. For each:

- Is it LOCKED? → This is a constraint. My code must not contradict it.
- Is it STALE? → This doc may be outdated. Verify against current code before trusting.
- Is it a HARD BLOCK? → Stop. Surface to founder before proceeding.

### Phase 3: WHAT CONNECTS TO THIS? (graph traversal)

Find the files that will be touched. For each file:

- What does it @derives from? Read those docs.
- What other files @derives from the same docs? Those are siblings — changes here may affect them.
- What state machines / routes / screens use this file? Those are downstream consumers.

This is the dot-connecting step. Don't stop at the file you'll edit —
follow the connections two levels deep.

### Phase 4: WHAT AM I ASSUMING? (self-questioning)

Write down every assumption you're making. Examples:

- "I assume this endpoint doesn't exist yet" → grep for it
- "I assume the schema has a field for this" → read the schema
- "I assume this is a supervisor-only feature" → check the spec
- "I assume this won't affect the worker app" → check shared files

For each assumption:

- Can I verify it right now? → DO IT. Read the file, grep the code, check the schema.
- Can I NOT verify it? → FLAG IT. Tell the founder: "I'm assuming X because Y. Is this right?"

NEVER treat an assumption as fact. If you can check it, check it.
If you can't check it, say so.

### Phase 5: WHAT BREAKS? (impact projection)

For each file you'll change:

1. Who reads this file's output? (downstream consumers)
2. Who writes to this file's inputs? (upstream producers)
3. What tests cover this file? (safety net)
4. What happens if this file is wrong? (blast radius)

If blast radius is high (auth, payments, state machines, schema) →
enter plan mode, get founder approval before executing.

### Phase 6: WHAT IF? (route comparison)

If there are multiple ways to do this:

- State route A and route B clearly
- For each: what happens in 1 week? 1 month? 1 year? at 100 clients?
- Which route has fewer moving parts?
- Which route uses existing tables/helpers?
- Which route a junior developer would understand?

Pick the simpler route unless there's a concrete (not hypothetical) reason
for the complex one.

### Phase 7: EXECUTE

Only now write code. And as you write:

- After each file change, re-run Phase 5 mentally (did I break something?)
- If you discover a new assumption → verify it immediately, don't defer
- If you hit a conflict with a locked doc → STOP. Don't work around it.
  Either the doc is wrong (unlock → update → re-lock → then code)
  or your approach is wrong (change approach).

## Tools That Power This Protocol

| Phase   | Tool                                                       |
| ------- | ---------------------------------------------------------- |
| Phase 2 | `impactCheck()` from @axhy/ai-tools                        |
| Phase 3 | `axhy_graph.edges` (derives_from, reads, writes)           |
| Phase 4 | grep, Read, schema.prisma                                  |
| Phase 5 | `derived_from_paths` on chunks + downstream edge traversal |
| Phase 6 | Your own reasoning — no tool needed                        |
| Phase 7 | Edit, Write, Bash — the usual                              |

## When to Skip

- Trivial typo fixes (1 file, 1 line, no behavioral change)
- Comments-only changes
- Founder explicitly says "just do it" or "skip protocol"

Everything else: run the protocol. It takes 2 minutes.
It saves 2 hours of redo.

## Anti-Patterns

- "I'll check the docs later" → NO. Check before writing code.
- "This is simple, I don't need to search" → The simple ones break things too.
- "The doc says X but the code says Y, I'll follow the doc" → Is the doc LOCKED? If yes, fix the code. If no, the doc is stale — verify which is right.
- "I assume this field exists" → READ THE SCHEMA. 5 seconds.
- "This probably won't affect other screens" → GREP. 2 seconds.
- "I'll surface the conflict after I finish" → NO. Surface immediately. Don't build on a broken foundation.
