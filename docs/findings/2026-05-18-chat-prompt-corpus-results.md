# Chat AI prompt corpus — first run (2026-05-18 PM)

Run target: real Railway sandbox tenant + real OpenAI (no mocks).

## Summary

| Prompt | Category                    | Result      | Surface                                                                               |
| ------ | --------------------------- | ----------- | ------------------------------------------------------------------------------------- |
| 1      | Half-broken (missing field) | ✅ PASS     | AI clarifies instead of fabricating                                                   |
| 2      | Full prompt (all fields)    | ✅ PASS     | Single `propose_mark_absent` card for Sundeep, no clarification                       |
| 3      | Incremental (3 turns)       | ✅ PASS     | `propose_leave` for Pradeep emerges across the build-up                               |
| 4      | Topic switch + return       | ❌ **FAIL** | AI drops the tangent — only emits `propose_mark_absent`, never `propose_swap`         |
| 5      | Cross-screen rule creation  | ✅ PASS     | Read-then-write pattern works; `propose_living_doc_update` captures "no leave on 1st" |

## The one failure — what it tells us

**Prompt 4 — the founder's hardest scenario.** Turns:

- T1: "Sundeep absent today at Apollo Hospital"
- T2: "Wait actually first, can Lakshmi swap shifts with Mukesh tomorrow at Apollo Hospital?"
- T3: "Yes do the swap. Also confirm Sundeep is absent today as I said earlier"

**Expected:** AI emits two distinct cards — one `propose_swap` (Lakshmi↔Mukesh, tomorrow at Apollo) AND one `propose_mark_absent` (Sundeep, today at Apollo). The whole point of this prompt is to verify the AI **remembers the original topic** after a tangent.

**Actual:** Across all three turns the AI only emitted `propose_mark_absent`. The swap-request never materialized.

**Founder lock 2026-05-18 PM:** "what matters is it remembers the context happened there fully and makes right decisions only not wrong ones at all." This test is the gate for that lock — and it currently doesn't hold.

## Why this is real signal, not test-design noise

- Prompts 1-3 and 5 pass — the tooling, schema, threading model all work.
- The card schema is correct (`fields.workerId`, `fields.toolName`, etc — verified via prompt 5's debug dump).
- The seeded workers are addressable by name (prompt 2 + 3 prove this).
- Prompt 4 isolates ONE specific behavior — topic retention across a tangent — and the AI fails it deterministically.

## Recommended fixes (in priority order)

1. **System-prompt enhancement (P1, ~30 min):** Add a new sentence to the system prompt: "When the supervisor switches topic mid-conversation and then returns to an earlier topic, both topics must be acted on. Do not silently drop the earlier topic." This is the cheapest experiment.

2. **Multi-turn loop budget (P1, ~1h):** The current chat route may be capped at N tool calls per turn. If the AI plans to emit two cards but only gets one tool-call slot, the second is dropped. Increase the cap for compound utterances OR loop until the AI explicitly says "done".

3. **Explicit topic-tracking memory (P2, deferred):** Maintain a "pending intents" list in the chat thread state. Each user turn appends; the AI's prompt includes the list; the AI is required to address each before saying "anything else?".

4. **Re-run prompt 4 with this prompt corpus weekly** — track regression/improvement as the prompt evolves.

## What ships now

- New regression test file: `apps/backend/test/water-flow-chat-prompt-corpus.test.ts`
- 4 tests passing + 1 failing-on-purpose serves as a permanent canary for the topic-retention bug. CI will fail until prompt 4 is green; that's the right signal.

Per founder lock 2026-05-18 PM, this is the live gate for whether the chat AI is "context-strong" — when prompt 4 turns green, we know we've genuinely fixed it.
